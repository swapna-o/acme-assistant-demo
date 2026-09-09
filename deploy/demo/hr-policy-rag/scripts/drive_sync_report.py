"""Build the Google Drive over MCP index and write its sync report.

Reads the sync manifest (what an MCP client got back from the Drive server: each
file's text and permissions), builds a separate index from it, then checks the
one thing that matters: every principal in the manifest sees exactly the documents
Drive says they may open, and no canary phrase from a restricted document can be
retrieved by anyone Drive did not grant.

Outputs:
  data/drive_sync/index_drive.json   the index built from Drive
  data/drive_sync/report.json        the sync report (documents, grants, checks)
  --site <work-ask.html>             the report rendered between the
                                     <!-- drive-sync:start --> / <!-- drive-sync:end --> markers

Run:  .venv/bin/python -m scripts.drive_sync_report --site "../Resume Tailor 2026/website/work-ask.html"
"""

from __future__ import annotations

import argparse
import datetime as dt
import html
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)

from rag.connectors.mcp_drive import MCPDriveConnector  # noqa: E402
from rag.models import Principal  # noqa: E402
from rag.system import RagSystem  # noqa: E402

CANARIES = {
    "CANARY-COMP-4F7A": "What are the compensation bands?",
    "CANARY-EXEC-9B2D": "What are the compensation bands for executives?",
    "CANARY-EQ-7D1C": "How do executive equity refresh grants vest?",
}
PROBES = [
    "How many PTO days do I get?",
    "What is the on-call stipend?",
    "How long is parental leave?",
    "What are the compensation bands?",
    "What are the compensation bands for executives?",
    "How do executive equity refresh grants vest?",
    "How do I apply for leave of absence?",
]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--manifest", default=os.path.join(HERE, "data", "drive_sync", "manifest.json"))
    ap.add_argument("--index", default=os.path.join(HERE, "data", "drive_sync", "index_drive.json"))
    ap.add_argument("--report", default=os.path.join(HERE, "data", "drive_sync", "report.json"))
    ap.add_argument("--site", help="work-ask.html to update between the drive-sync markers")
    args = ap.parse_args()

    with open(args.manifest) as f:
        manifest = json.load(f)
    connector = MCPDriveConnector(manifest_path=args.manifest)
    docs = list(connector.fetch())

    system = RagSystem()
    n_chunks = system.ingest_documents(docs)
    system.save(args.index)

    # Every distinct account Drive granted, with its highest role per document.
    principals: dict[str, dict[str, str]] = {}
    for item in manifest["files"]:
        for p in item.get("permissions", []):
            if p.get("type") == "user" and p.get("emailAddress"):
                principals.setdefault(p["emailAddress"].lower(), {})[item["id"]] = p.get("role", "reader")
    principals.setdefault("nobody@example.com", {})  # an account Drive never granted

    canary_text = {doc.id: [c for c in CANARIES if c in doc.text] for doc in docs}

    checks = []
    leaks = 0
    for email, grants in sorted(principals.items()):
        principal = Principal(email=email)
        expected = {d.id for d in docs if d.acl.permits(principal)}
        seen: set[str] = set()
        for q in PROBES:
            for chunk, _score in system.retrieve(q, principal, k=8):
                seen.add(chunk.doc_id)
        leaked = sorted(seen - expected)
        leaked_canaries = sorted({c for d in leaked for c in canary_text.get(d, [])})
        leaks += len(leaked)
        checks.append({
            "principal": email,
            "role": "owner" if "owner" in grants.values() else ("reader" if grants else "no grant"),
            "may_open": sorted(d.title for d in docs if d.id in expected),
            "retrieved_from": sorted(d.title for d in docs if d.id in seen),
            "leaked": [d.title for d in docs if d.id in leaked],
            "leaked_canaries": leaked_canaries,
        })

    report = {
        "aliases": manifest.get("aliases") or {},
        "synced": manifest.get("synced"),
        "checked": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "folderUrl": manifest.get("folderUrl"),
        "client": manifest.get("client"),
        "documents": len(docs),
        "passages": n_chunks,
        "files": [
            {
                "title": d.title,
                "uri": d.uri,
                "public": d.acl.public,
                "users": sorted(d.acl.allowed_users),
                "groups": sorted(d.acl.allowed_groups),
                "roles": {p["emailAddress"].lower(): p.get("role") for p in item.get("permissions", []) if p.get("emailAddress")},
                "canaries": canary_text[d.id],
            }
            for d, item in zip(docs, manifest["files"])
        ],
        "checks": checks,
        "leaks": leaks,
    }
    os.makedirs(os.path.dirname(args.report), exist_ok=True)
    with open(args.report, "w") as f:
        json.dump(report, f, indent=2)
    print(f"Drive index: {len(docs)} documents, {n_chunks} passages -> {args.index}")
    for c in checks:
        print(f"  {c['principal']:32} {c['role']:9} may open {len(c['may_open']):2}  retrieved from {len(c['retrieved_from']):2}  leaked {len(c['leaked'])}")
    print(f"Leaks: {leaks}")

    print(f"Public manifest: {write_public_manifest(args.manifest)}")
    if args.site:
        update_site(args.site, report)
        print(f"Site updated: {args.site}")
    return 1 if leaks else 0


def _who(entry: dict, aliases: dict[str, str]) -> str:
    if entry["public"]:
        return "Anyone with the link"
    parts = []
    for email, role in sorted(entry["roles"].items()):
        name = aliases.get(email, email)
        parts.append(f"{name} ({role})")
    for g in entry["groups"]:
        parts.append(f"group {g}")
    return ", ".join(parts) or "No one"


def update_site(path: str, report: dict) -> None:
    with open(path) as f:
        page = f.read()
    start, end = "<!-- drive-sync:start -->", "<!-- drive-sync:end -->"
    if start not in page or end not in page:
        raise SystemExit(f"markers not found in {path}")

    aliases = report.get("aliases") or {}
    synced = (report.get("synced") or "")[:10]
    try:
        synced_h = dt.date.fromisoformat(synced).strftime("%b %-d, %Y")
    except ValueError:
        synced_h = synced
    rows = []
    for e in report["files"]:
        canary = " · canary" if e["canaries"] else ""
        rows.append(
            f'<tr><td><a href="{html.escape(e["uri"])}" target="_blank" rel="noopener">{html.escape(e["title"])}</a>{canary}</td>'
            f'<td>{html.escape(_who(e, aliases))}</td></tr>'
        )
    checks = []
    for c in report["checks"]:
        who = aliases.get(c["principal"], c["principal"])
        verdict = "no leak" if not c["leaked"] else "LEAK: " + ", ".join(c["leaked"])
        checks.append(
            f'<tr><td>{html.escape(who)}<br><small>{html.escape(c["role"])}</small></td>'
            f'<td>{len(c["may_open"])} of {report["documents"]}</td>'
            f'<td>{len(c["retrieved_from"])}</td><td>{html.escape(verdict)}</td></tr>'
        )
    block = f"""{start}
    <p class="arch-caption">Synced {synced_h} from <a href="{html.escape(report["folderUrl"] or "#")}" target="_blank" rel="noopener">the Drive folder</a> through the Google Drive MCP server: {report["documents"]} documents, {report["passages"]} passages. Sharing settings were read from Drive, not typed in.</p>
    <div class="tscroll">
    <table class="ptable">
      <thead><tr><th>Document in Drive</th><th>Who Drive says may open it</th></tr></thead>
      <tbody>
        {chr(10).join(rows)}
      </tbody>
    </table>
    </div>
    <p>Then the check. For every account Drive granted, plus one it never granted, ask seven questions that between them touch every document, and confirm nothing comes back from a document that account may not open.</p>
    <div class="tscroll">
    <table class="ptable">
      <thead><tr><th>Asking as</th><th>May open</th><th>Passages came from</th><th>Result</th></tr></thead>
      <tbody>
        {chr(10).join(checks)}
      </tbody>
    </table>
    </div>
    <p class="arch-caption">Checked {report["checked"][:10]}. {"No document was retrieved for anyone Drive had not granted." if not report["leaks"] else "A leak was found. This section stays red until it is fixed."} The report itself is <a href="evals/drive_sync_report.json">published here</a> and regenerated by <code>scripts/drive_sync_report.py</code> after every sync.</p>
    {end}"""
    page = page[: page.index(start)] + block + page[page.index(end) + len(end):]
    with open(path, "w") as f:
        f.write(page)
    site_dir = os.path.dirname(os.path.abspath(path))
    os.makedirs(os.path.join(site_dir, "evals"), exist_ok=True)
    with open(os.path.join(site_dir, "evals", "drive_sync_report.json"), "w") as f:
        json.dump(scrub(report, aliases), f, indent=2)


def pseudonym(label: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", label.lower()).strip("-")
    return f"{slug}@acme-demo.example"


def scrub(obj, aliases: dict[str, str]):
    """Replace every real account address with a demo pseudonym, recursively."""
    table = {email: pseudonym(label) for email, label in aliases.items()}
    if isinstance(obj, dict):
        return {table.get(k, k): scrub(v, aliases) for k, v in obj.items() if k != "aliases"}
    if isinstance(obj, list):
        return [scrub(v, aliases) for v in obj]
    if isinstance(obj, str):
        return table.get(obj, obj)
    return obj


def write_public_manifest(manifest_path: str) -> str:
    """The copy that ships with the demo repository: same sync, pseudonymous accounts."""
    with open(manifest_path) as f:
        manifest = json.load(f)
    out = manifest_path.replace(".json", ".public.json")
    with open(out, "w") as f:
        json.dump(scrub(manifest, manifest.get("aliases") or {}), f, indent=2)
    return out


if __name__ == "__main__":
    raise SystemExit(main())
