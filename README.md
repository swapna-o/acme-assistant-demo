# Acme Assistant

An AI assistant for the employee lifecycle, built alone by a product leader with Claude Code
writing the code. One conversation where an employee asks a policy question, plans time off,
files the request, and gets it approved, without opening the HR system, the policy library,
or email.

- **Portfolio and write-up:** https://swapna-oundhakar.netlify.app/work.html
- **Live demo:** https://acme-assistant-demo.onrender.com (free hosting; the first visit after a quiet spell can take up to a minute to wake)
- **Author:** Swapna Oundhakar, https://www.linkedin.com/in/swapna-oundhakar

Acme Corp, its people, and its policies are invented. The HR system, the policy sources, and
the sign-in are stand-ins for the real ones. Nothing here reaches a real system, and no API
keys are needed to run it.

## Use cases

Each use case has a chapter on the portfolio site with the problem, the demo transcript, the
architecture, the eval cases, what I learned, and how to build it yourself. The short
version of each is in `docs/use-cases/`.

| # | Use case | Agent | What it proves | Code | Chapter |
|---|---|---|---|---|---|
| 01 | Ask: policy search | policy search | Permission-aware retrieval: documents outside the asker's groups are removed before ranking and never reach the model | `deploy/demo/hr-policy-rag/`, `timeoff-agent/server/policies/` | [docs](docs/use-cases/01-ask.md) · [site](https://swapna-oundhakar.netlify.app/work-ask.html) |
| 02 | Parental leave | parental leave agent | Agentic RAG: a global policy that defers to a country supplement, so the agent searches twice and reasons over both | `timeoff-agent/server/agents/leave.ts` | [docs](docs/use-cases/02-parental-leave.md) · [site](https://swapna-oundhakar.netlify.app/work-leave.html) |
| 03 | Time off | time-off agent, manager agent | Tool use with a human gate: balances, holidays, team coverage, ranked windows, a draft, a yes before the write, and the manager's approval in the same conversation | `timeoff-agent/server/agents/planner.ts`, `manager.ts`, `server/workday/` | [docs](docs/use-cases/03-time-off.md) · [site](https://swapna-oundhakar.netlify.app/work-timeoff.html) |
| 04 | Evaluating it | all | 46 regression cases on every change, a golden set for the search, an optional model judge for groundedness (not yet calibrated against human labels), and a no-leak assertion on every persona in every case | `timeoff-agent/eval/` | [docs](docs/use-cases/04-evals.md) · [site](https://swapna-oundhakar.netlify.app/work-evals.html) |

Planned, specified first this time: an IT and workplace help flow across a ticketing system,
an engineering tracker, and team chat, and the assistant running inside Slack.

## How it is built

Every message takes the same path. An orchestrator works out who is asking (from the mock SSO
session, never from the message), what they may see, and what they want: session state first,
then rules, then a small model, then a safe default. It hands the turn to one of four agents.
The agent does the job with Claude and the company systems. The guardrails stay on the whole
time and are enforced in code, not in the prompt:

- an access filter that removes locked documents before retrieval,
- an explicit yes in the latest message before any write,
- a manager-of-record check before any approval,
- a trace on every turn that records which layer decided and why.

Two execution modes share the same tools and gates: a Claude tool-use loop, and an offline
planner with a fixed tool order so the eval suite runs deterministically and free.

## Layout

- `timeoff-agent/` the Node server (API plus built React client), agents, tools, tracing, and the eval suite
- `deploy/demo/hr-policy-rag/` the Python policy search service (runs inside the same container)
- `deploy/demo/Dockerfile` one container for both; `render.yaml` describes the Render service
- `docs/use-cases/` one page per use case

## Run it locally

    cd timeoff-agent && npm install && npm run dev        # client on :5173, API on :3001
    cd deploy/demo/hr-policy-rag && python -m scripts.ingest && python webapp.py   # search on :8930

    cd timeoff-agent && npm run eval                       # 46 cases, offline planner, no keys
    npm run traces                                         # the latest turns, one line each

With an Anthropic API key in `timeoff-agent/.env`, chat runs the Claude loop. Without one it
runs the offline planner. The public demo runs without a key.
