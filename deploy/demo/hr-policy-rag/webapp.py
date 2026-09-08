#!/usr/bin/env python3
"""Web demo for the permission-aware HR policy search.

Stdlib-only HTTP server (no Flask) on top of the existing RagSystem, so it
runs with the project venv and nothing else. Serves demo.html and a small
JSON API:

  GET  /api/users   demo personas (email, groups, label)
  POST /api/ask     {"user": email, "question": str} ->
                    answer + citations + the ACL story (which docs were
                    visible vs. locked BEFORE retrieval ran)
"""

from __future__ import annotations

import json
import os
import re
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from urllib.parse import parse_qs, urlparse

from rag.directory import UserDirectory
from rag.models import ACL
from rag.system import RagSystem

BASE = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.getenv("PORT", "8930"))

PERSONAS = {
    "dave@corp.com": {"label": "Dave", "role": "Employee"},
    "alice@corp.com": {"label": "Alice", "role": "Engineer"},
    "bob@corp.com": {"label": "Bob", "role": "HR admin"},
    "carol@corp.com": {"label": "Carol", "role": "Executive"},
    "cfo@corp.com": {"label": "CFO", "role": "Finance exec"},
    "contractor@ext.com": {"label": "Contractor", "role": "External"},
}

system = RagSystem()
system.load(os.path.join(BASE, "index.json"))
directory = UserDirectory.from_json(os.path.join(BASE, "data", "users.json"))


_STOPWORDS = frozenset(
    "a an and are can d do does for how i in into is it many much my next of on "
    "or per s t the to unused we what when who year get give does say says pay out "
    "have has policy plan company employee employees about".split()
)


def focus_answer(question, chunk):
    """Pick the section of a chunk that best matches the question.

    The offline extractive fallback in rag/qa.py returns the whole top chunk.
    For the chat display, narrow that to the markdown section with the most
    question-word overlap so the reply reads like an answer, not a dump. The
    text stays verbatim policy text.
    """
    q_words = {_stem(w) for w in re.findall(r"[a-z0-9]+", question.lower()) if w not in _STOPWORDS}
    sections, cur = [], []
    for line in chunk.text.splitlines():
        if line.lstrip().startswith("#") and cur:
            sections.append("\n".join(cur).strip())
            cur = [line]
        else:
            cur.append(line)
    if cur:
        sections.append("\n".join(cur).strip())

    def score(section):
        lines = section.splitlines()
        heading = lines[0] if lines and lines[0].lstrip().startswith("#") else ""
        h_words = {_stem(w) for w in re.findall(r"[a-z0-9]+", heading.lower())}
        s_words = [_stem(w) for w in re.findall(r"[a-z0-9]+", section.lower())]
        # distinct terms matched first, then how often (capped), then the heading
        distinct = len(q_words & set(s_words))
        tf = sum(min(3, s_words.count(t)) for t in q_words)
        return (distinct, tf, len(q_words & h_words))

    # The document's title block is mostly "Applies to" metadata. Prefer a real
    # section when there is one; fall back to the title block only if nothing else matches.
    body = [x for x in sections if x.lstrip().startswith("##")] or sections
    best = max(body, key=score) if body else chunk.text
    if score(best)[0] == 0:
        best = max(sections, key=score) if sections else chunk.text
    if score(best)[0] == 0:
        best = chunk.text
    if len(best) > 700:
        best = best[:700].rsplit(" ", 1)[0] + "…"
    return f"{best}\n\n[{chunk.title}]"


def _stem(w):
    """Tiny stemmer so "days" meets "day" and "accrued" meets "accrue"."""
    for suf in ("ing", "ies", "ed", "es", "s"):
        if len(w) > len(suf) + 2 and w.endswith(suf):
            return w[: -len(suf)] + ("y" if suf == "ies" else "")
    return w


def _key_terms(question):
    return {_stem(w) for w in re.findall(r"[a-z0-9]+", question.lower()) if w not in _STOPWORDS and len(w) > 2}


def lexical_candidates(question, principal, k=6, min_shared=2):
    """Keyword fallback for the offline embedder: score every chunk this
    principal may see by how many of the question's key terms it contains.

    Same ACL predicate as retrieval (chunk.acl.permits), applied before
    scoring, so a locked chunk is never even counted. Used only when the
    vector search returns nothing above the relevance floor, which happens
    on short questions with the hashing embedder. In production, with a
    real embedder, this is the lexical half of hybrid search."""
    q = _key_terms(question)
    if not q:
        return []
    allowed = [c for c in system.store.chunks if c.acl.permits(principal)]
    if not allowed:
        return []
    chunk_words = [(c, {_stem(w) for w in re.findall(r"[a-z0-9]+", c.text.lower())}) for c in allowed]
    # A term is informative when it appears in few of the allowed chunks. "day" and
    # "week" are everywhere; "pto", "stipend", and "p1" are not.
    df = {t: sum(1 for _, ws in chunk_words if t in ws) for t in q}
    informative = {t for t in q if 0 < df[t] <= max(1, len(allowed) * 0.3)}
    hits = []
    for c, words in chunk_words:
        shared = q & words
        coverage = len(shared) / len(q)
        if len(shared) >= min(min_shared, len(q)) and coverage >= 0.6 and (shared & informative):
            hits.append((c, round(coverage, 3)))
    hits.sort(key=lambda t: t[1], reverse=True)
    return hits[:k]


def lexical_grounding(question, retrieved, min_shared=2):
    """Hybrid guard for the offline embedder: the top passage must share
    query terms with the question, or the answer is not grounded. Cheap
    insurance against a near-neighbour from an unrelated document."""
    if not retrieved:
        return True, set()
    q_terms = {w for w in re.findall(r"[a-z0-9]+", question.lower()) if w not in _STOPWORDS and len(w) > 2}
    text = retrieved[0][0].text.lower()
    shared = {w for w in q_terms if re.search(r"\b" + re.escape(w) + r"s?\b", text) or re.search(r"\b" + re.escape(w[:-1]) + r"\b", text)}
    need = min(min_shared, max(1, len(q_terms)))
    return len(shared) >= need, shared


def rerank_by_grounding(question, retrieved):
    """Hybrid re-rank: the first passage that shares key terms with the
    question leads; passages that share none are dropped. Abstain if nothing
    is grounded."""
    grounded_hits = []
    ungrounded = []
    first_shared = set()
    for chunk, score in retrieved:
        ok, shared = lexical_grounding(question, [(chunk, score)])
        if ok:
            if not grounded_hits:
                first_shared = shared
            grounded_hits.append((chunk, score))
        else:
            ungrounded.append((chunk, score))
    if not grounded_hits:
        return [], False, set()
    return grounded_hits, True, first_shared


def _clean_excerpt(text, limit=600):
    """Trim to limit without leaving a dangling partial heading at the end."""
    excerpt = text.strip()[:limit].rsplit(" ", 1)[0]
    return re.sub(r"\n#+[^\n]*$", "", excerpt).rstrip()


ACL_PATH = os.path.join(BASE, "data", "sample_policies", "acl.json")


def doc_library(principal):
    """Every document with its access decision; full text only when permitted.

    Same predicate as retrieval (ACL.permits), so what the reader can open is
    exactly what search was allowed to rank.
    """
    with open(ACL_PATH) as f:
        acl = json.load(f)
    docs = []
    for fname, meta in acl.items():
        rule = ACL(
            public=bool(meta.get("public", False)),
            allowed_users=frozenset(meta.get("allowed_users", [])),
            allowed_groups=frozenset(meta.get("allowed_groups", [])),
        )
        allowed = rule.permits(principal)
        text = None
        if allowed:
            with open(os.path.join(BASE, "data", "sample_policies", fname)) as f:
                text = f.read()
        docs.append({
            "docId": fname,
            "title": meta["title"],
            "allowed": allowed,
            "public": bool(meta.get("public", False)),
            "allowedGroups": meta.get("allowed_groups", []),
            "allowedUsers": meta.get("allowed_users", []),
            "words": len(text.split()) if text else None,
            "text": text,
        })
    # Only what the principal may read. A locked entry, even without text, reveals a document exists.
    return sorted((d for d in docs if d["allowed"]), key=lambda d: d["title"])


def doc_shelf(principal):
    """Every document in the index, with whether this principal may see it.

    This is the point of the demo: the access check happens on the whole
    shelf before any ranking, so locked docs never enter the search.
    """
    seen = {}
    for c in system.store.chunks:
        if c.doc_id not in seen:
            seen[c.doc_id] = {"title": c.title, "allowed": c.acl.permits(principal)}
    return sorted(seen.values(), key=lambda d: (not d["allowed"], d["title"]))


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body, ctype="application/json"):
        data = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path in ("/", "/index.html", "/demo.html"):
            with open(os.path.join(BASE, "demo.html"), "rb") as f:
                self._send(200, f.read(), "text/html; charset=utf-8")
        elif self.path.startswith("/api/docs"):
            email = parse_qs(urlparse(self.path).query).get("user", [""])[0]
            self._send(200, doc_library(directory.principal(email)))
        elif self.path == "/api/users":
            users = []
            for email in directory.emails():
                p = directory.principal(email)
                meta = PERSONAS.get(email, {"label": email.split("@")[0].title(), "role": ""})
                users.append({
                    "email": email,
                    "groups": sorted(p.groups),
                    "label": meta["label"],
                    "role": meta["role"],
                })
            self._send(200, users)
        else:
            self._send(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/api/ask":
            self._send(404, {"error": "not found"})
            return
        length = int(self.headers.get("Content-Length", 0))
        try:
            payload = json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError:
            self._send(400, {"error": "invalid JSON"})
            return
        email = payload.get("user", "")
        question = (payload.get("question") or "").strip()
        if not question:
            self._send(400, {"error": "empty question"})
            return

        principal = directory.principal(email)
        started = time.perf_counter()

        shelf = doc_shelf(principal)
        visible = [d["title"] for d in shelf if d["allowed"]]
        locked = [d["title"] for d in shelf if not d["allowed"]]

        retrieved = system.retrieve(question, principal)
        retrieved, grounded, shared = rerank_by_grounding(question, retrieved)
        via = "meaning"
        if not retrieved:
            # Hybrid: the vector search found nothing above the floor, so try the
            # question's own words against the allowed chunks. Same access check.
            retrieved = lexical_candidates(question, principal)
            if retrieved:
                grounded, shared = True, _key_terms(question) & {_stem(w) for w in re.findall(r"[a-z0-9]+", retrieved[0][0].text.lower())}
                via = "keywords"
        answer = system.generator.answer(question, retrieved, principal)
        elapsed_ms = round((time.perf_counter() - started) * 1000, 1)

        answer_text = answer.text
        if answer.model == "extractive" and retrieved:
            answer_text = focus_answer(question, retrieved[0][0])

        # The reasoning trace the UI shows: the real pipeline, step by step.
        groups = ", ".join(sorted(principal.groups)) or "none"
        trace = [
            {"step": "Resolved who's asking",
             "detail": f"{principal.email} · groups: {groups}"},
            {"step": "Checked access before searching",
             "detail": (f"{len(visible)} of {len(shelf)} documents visible"
                        + (f" · locked: {', '.join(locked)}" if locked else ""))},
            {"step": "Searched the allowed documents",
             "detail": (f"embedded the question, ranked {len(visible)} document"
                        f"{'s' if len(visible) != 1 else ''} by meaning "
                        f"(relevance floor {system.config.min_relevance})")},
        ]
        if retrieved:
            top, top_score = retrieved[0]
            trace.append({
                "step": "Found the passage",
                "detail": f"{top.title} · {'relevance' if via == 'meaning' else 'keyword match'} {top_score:.3f} · shares {', '.join(sorted(shared))} with the question",
            })
            trace.append({
                "step": "Answered from that text only",
                "detail": f"cited {', '.join(answer.source_titles)}",
            })
        else:
            trace.append({
                "step": "Nothing cleared both gates",
                "detail": ("the best passage shared no key terms with the question, so abstain rather than guess"
                           if not grounded else "no accessible passage above the relevance floor, so abstain"),
            })

        self._send(200, {
            "answer": answer_text,
            "abstained": answer.abstained,
            "sources": answer.source_titles,
            "model": answer.model,
            "shelf": shelf,
            "trace": trace,
            "elapsed_ms": elapsed_ms,
            "retrieved": [
                {"title": c.title, "score": round(s, 3),
                 "excerpt": _clean_excerpt(c.text)}
                for c, s in retrieved
            ],
        })

    def log_message(self, fmt, *args):  # keep the terminal quiet
        pass


if __name__ == "__main__":
    print(f"HR policy search demo -> http://localhost:{PORT}")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
