# Publishing the demo

The demo is two programs: the Node server in `timeoff-agent/` (API + built client) and
the Python policy search in `~/hr-policy-rag`. This folder packages both into ONE
container so a single hosted service runs the whole thing. No API keys are needed:
the demo runs in its offline, deterministic mode.

Prepare (copies the search project next to the Dockerfile; re-run after changes):

    rsync -a --exclude .venv --exclude eval/reports --exclude "__pycache__" --exclude ".env*" --exclude .git --exclude data/drive_sync/manifest.json --exclude data/drive_sync/report.json --exclude data/drive_sync/index_drive.json --exclude "*INTERVIEW*" --exclude WRITEUP.md --exclude SYSTEM_DESIGN_GUIDE.md --exclude "RAG Concepts" --exclude "*.html" --exclude "*.docx" ~/hr-policy-rag/ deploy/demo/hr-policy-rag/

The last few excludes matter: `~/hr-policy-rag` also holds Swapna's own interview prep
(INTERVIEW.md, EVAL_INTERVIEW_CHEATSHEET.md, WRITEUP.md, SYSTEM_DESIGN_GUIDE.md, the
explainer HTML) and the demo repo is PUBLIC. Without them, a refresh publishes her
interview notes to GitHub. Check `git status` in ~/acme-assistant-demo before committing.

Then deploy the workspace root as the build context with `deploy/demo/Dockerfile`:

- Render: push the workspace to GitHub, create a Web Service, Docker runtime,
  Dockerfile path `deploy/demo/Dockerfile`, root directory `.`. Free instance is fine
  (it sleeps when idle; first load takes ~30s).
- Fly.io: `fly launch --dockerfile deploy/demo/Dockerfile` from the workspace root.

After it is live, point the "Open the demo" link on website/work.html at the URL.
