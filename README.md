# HR Policy RAG — permission-aware question answering

A retrieval-augmented generation (RAG) system that answers questions from HR
policy documents, **enforcing document-level permissions**: a user only gets
answers built from documents they are actually allowed to read. Everything else
is invisible to them — it never reaches retrieval, and never reaches the model.

It ingests from **Google Drive / Google Docs** and **SharePoint** (mapping their
real sharing settings into access-control lists), plus a local folder for
offline use. It ships with an **evaluation framework** covering retrieval
quality, answer quality, and — the headline — permission enforcement.

## Why the permission model is the interesting part

The rule is **filter-then-retrieve**, not retrieve-then-filter:

```
question + user identity
        │
        ▼
  resolve Principal (email + groups)      ← rag/directory.py
        │
        ▼
  vector search with ACL PRE-FILTER       ← rag/vectorstore.py  (enforcement point)
        │  (chunks the user can't see are removed BEFORE ranking)
        ▼
  answer generation over allowed context  ← rag/qa.py  (2nd guard: prompt forbids
        │                                    using/mentioning anything else)
        ▼
     answer + citations
```

Because inaccessible chunks are dropped before search, a user who lacks access
to a document simply gets no relevant context, and the assistant abstains
("contact HR"). There is no way for restricted content to leak into an answer —
the eval proves it with canary strings.

Each connector maps a source system's native permissions onto the same `ACL`:

| Source | Native permission | → ACL |
| --- | --- | --- |
| Google Drive | `anyone` / `user` / `group` / `domain` | `public` / `allowed_users` / `allowed_groups` |
| SharePoint (Graph) | anonymous link / user / group / siteGroup | `public` / `allowed_users` / `allowed_groups` |
| Local folder | `acl.json` manifest | direct |

## Quick start (offline, no API keys)

```bash
cd hr-policy-rag
pip install -r requirements.txt        # numpy is the only hard dependency

# 1. Build the index from the bundled sample policies
python -m scripts.ingest

# 2. Ask as different users — watch access change the answer
python -m scripts.ask --user dave@corp.com  "How many PTO days do I accrue per year?"
python -m scripts.ask --user dave@corp.com  "What is the executive change-in-control severance?"   # denied → abstains
python -m scripts.ask --user carol@corp.com "What is the executive change-in-control severance?"   # exec → answered
python -m scripts.ask --user bob@corp.com   "What is the salary band for a Staff Engineer?" --show-sources

# 3. Run the evaluation suite
python -m eval.run_eval

# 4. Run the permission tests
python -m tests.test_permissions      # or: pytest -q
```

With no `ANTHROPIC_API_KEY`, answers are **extractive** (top relevant excerpt +
citation) so everything runs offline. Set a key to get full Claude-generated
answers — the model default is `claude-opus-4-8`.

> The default `local` embedder is **lexical** (feature hashing), so it needs the
> question to share vocabulary with the document — "How many PTO days do I
> **accrue per year**?" retrieves; a bare "PTO days?" may fall under the
> relevance floor and abstain. Switch `RAG_EMBEDDER=voyage` (or
> `sentence-transformers`) for paraphrase-robust semantic retrieval.

## Turning on Claude answers and better embeddings

```bash
export ANTHROPIC_API_KEY=sk-ant-...        # Claude answers (claude-opus-4-8)
export RAG_EMBEDDER=voyage                 # production embeddings (needs VOYAGE_API_KEY)
export VOYAGE_API_KEY=...
python -m scripts.ingest && python -m eval.run_eval --judge
```

`--judge` adds an LLM-as-judge faithfulness score to the answer-quality report.

Embedder options (`RAG_EMBEDDER`): `local` (default, offline signed feature
hashing), `voyage` (Voyage AI — Anthropic's recommended embeddings provider;
the Claude API has no embeddings endpoint), or `sentence-transformers` (local
neural).

## Connecting Google Drive and SharePoint

**Google Drive / Docs** — needs `google-api-python-client` + `google-auth` and a
service account (`GOOGLE_APPLICATION_CREDENTIALS`) with `drive.readonly`:

```bash
python -m scripts.ingest --no-local --gdrive-folder <DRIVE_FOLDER_ID>
```

**SharePoint** — needs `msal` + `requests` and an Entra ID app with Graph
`Sites.Read.All` + `Files.Read.All` (`MS_TENANT_ID` / `MS_CLIENT_ID` /
`MS_CLIENT_SECRET`):

```bash
python -m scripts.ingest --no-local --sharepoint-drive <DRIVE_ID> --sharepoint-path root
```

Both connectors read each file's real permissions and store the derived ACL, so
answering stays permission-aware automatically. The connectors lazy-import their
SDKs, so the rest of the system runs without them installed.

> Identity note: the ACL is only as trustworthy as the `Principal` you pass in.
> In production, resolve the asking user's email and group memberships from your
> IdP / authenticated session (Okta, Entra ID, Google Workspace) — never from
> user-supplied input. `rag/directory.py` is the swap point.

## Evaluation framework

`python -m eval.run_eval` reports three areas (`eval/`):

- **Retrieval** — recall@k, precision@k, MRR over gold Q/A, plus how often
  genuinely-unanswerable (access-denied) questions correctly retrieve nothing.
- **Answer quality** — keyword accuracy on answerable questions, abstention
  accuracy on unanswerable ones, and optional LLM-judge faithfulness (`--judge`).
- **Permission enforcement** — the pass/fail gate:
  - `retrieval leaks` — restricted chunks returned to an unauthorized user (must be 0)
  - `answer leaks` — a canary string from a restricted doc appearing in an
    unauthorized user's answer (must be 0)
  - `false denials` — an authorized user wrongly blocked from their own docs (must be 0)

Gold data and permission probes live in `eval/datasets.py`; add your own cases
there.

## Project layout

```
rag/
  models.py           ACL, Principal, Document, Chunk  (the security model)
  directory.py        email -> Principal (groups)      ← plug in your IdP here
  chunking.py         document -> overlapping chunks (ACL inherited)
  embeddings.py       local / voyage / sentence-transformers
  vectorstore.py      in-memory store + ACL PRE-FILTER (enforcement point)
  retriever.py        query -> ACL-filtered chunks
  qa.py               grounded answer generation (Claude) + extractive fallback
  system.py           RagSystem facade (ingest / retrieve / answer / save / load)
  connectors/
    local.py          local folder + acl.json
    google_drive.py   Drive/Docs + permission mapping
    sharepoint.py     SharePoint/Graph + permission mapping
eval/
  datasets.py         gold Q/A + permission scenarios (with canaries)
  metrics.py          retrieval / answer / permission metrics
  run_eval.py         report runner
scripts/
  ingest.py           build + persist the index
  ask.py              ask as a given user (permission-aware)
tests/
  test_permissions.py ACL + retrieval + answer-leak tests
data/
  sample_policies/    6 policies with varied ACLs + acl.json
  users.json          demo users -> groups
```

## Design notes & production hardening

- **Chunk-level ACLs.** ACLs propagate document → chunk, so mixed-permission
  indexes are safe. Filtering is O(n) per query in this in-memory store; for
  scale, push the ACL predicate into your vector DB as metadata pre-filtering
  (pgvector row filters, Pinecone/Qdrant metadata filters, etc.) so it stays
  filter-then-retrieve.
- **Freshness / revocation.** Permissions change. Re-ingest on a schedule (or
  subscribe to Drive/Graph change webhooks) so revoked access is reflected. An
  index is a snapshot of ACLs at ingest time.
- **Citations.** `qa.py` uses labeled context + a cite-your-source instruction.
  For span-level grounding you can switch to the Claude **citations** feature
  (per-document `citations: {enabled: true}`).
- **Defense in depth.** Enforcement is at retrieval (primary) and reinforced by
  the system prompt (secondary). Don't rely on the prompt alone — the retrieval
  filter is the real boundary.
