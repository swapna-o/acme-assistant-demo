# Acme Assistant: demo guide

A ChatGPT-style workspace with two use cases and five personas. The left rail
switches the persona (who is asking) and the use case (what they are doing).
The same question plays out differently for an employee, a manager, and an HR
admin, and every answer shows its work.

## Run it

From the Resume Tailor workspace, start two Browser-pane launch entries:

1. `hr-search-demo` (the Python policy RAG on port 8930). Policy search proxies
   to it for real embeddings search over the policy index with access filtering.
   If it is not running, policy search falls back to a local keyword index and
   says so under the answer.
2. `timeoff-agent` (this app: Vite client on 5173, Express API on 3001).

By hand:

```bash
cd "/Users/so/Resume Tailor 2026/timeoff-agent" && npm run dev
```

## Personas (sidebar, "View as")

| Persona | Workday identity | Policy-search identity | What they uniquely see |
|---|---|---|---|
| Employee | Alex Chen, full-time engineer | alice@corp.com (engineering) | Engineering on-call policy |
| Part-time employee | Priya Sharma, 3 days a week | dave@corp.com | Prorated balances |
| Contractor | Marcus Johnson | contractor@ext.com | Code of conduct only; no PTO policy |
| Employee (US) | Sarah Kim, engineer in California | sarah@corp.com | US Leave Supplement; 16 weeks + FMLA |
| Employee (India) | Ananya Iyer, engineer in Bengaluru | ananya@corp.com | India Leave Supplement; 26 weeks |
| Manager (India) | Rohan Mehta, Bengaluru, team of three | rohan@corp.com | India leave supplement; Ananya's approvals |
| Manager | Jordan Park, team of five | carol@corp.com (execs) | Executive severance plan; Time off · Team approvals |
| HR admin | Bob Rivera | bob@corp.com (hr-admins) | Compensation bands; Time off · Org overview |

## The three rungs

- **Policy search** (inside Ask): retrieval, then an answer. One hop, no state,
  no action. The access filter is the intelligence.
- **Time off** (inside Ask, plus the Time off panels): an agent that plans.
  Balances, holidays, coverage, scored date windows, a gated submit. Retrieval
  is one small tool inside it.
- **Parental leave** (inside Ask): agentic RAG. The answer depends on who is
  asking and lives in more than one document, so retrieval is the reasoning:
  resolve the asker, read the global policy, notice it defers to a country
  supplement, fetch that, reconcile (India's 26 weeks beats the global 16; in
  the US, 16 weeks paid with 12 weeks of FMLA protection running concurrently),
  check eligibility against tenure, pull the procedure, then answer with
  citations and turn it into a leave-of-absence request routed to the manager
  for coverage and HR for eligibility. No PTO is deducted. The trace shows
  every step.

## The rail

- **Ask** is the front door: one thread per persona. A policy question comes
  back with the citation and the "Checked access" line; a time-off ask runs the
  agent with date cards and a confirmation step. The server routes each message
  (time-off intent to the agent, everything else to the policy library) and the
  trace under the answer shows which path ran. Policy search is a capability
  the assistant uses, not a use case the employee picks.
- **Policies · Library**: the policies that apply to the current persona, in
  full. Out-of-scope documents are never shown, not even as a lock or a count.
  Source chips under an answer jump here.
- **Time off · My requests** (everyone): what you asked for and where it stands.
- **Time off · Team approvals** (manager): pending requests with coverage
  notes, approve or deny with a reason, calendar, balances, history. Decisions
  flow back into the employee's Ask thread within a few seconds. Managers can
  do the same from Ask: "show me coverage", "what is waiting on me", "approve
  Ananya", "deny David because ...". A decision is drafted and needs a yes
  before it is recorded. HR admins are told only the manager decides.
- **Time off · Org overview** (HR admin): the same view across the company,
  read-only.

## Demo script

1. As **Alex**, in Ask: click "What is the engineering on-call policy?"
   (answer with source; click the source chip to open the document in the
   library), then "What does the executive severance plan pay out?" (a miss:
   4 documents apply to Alex, and the library lists only those four).
2. Switch to **Jordan**: ask the severance question again. Answered, because
   managers map to the exec group. Ask "What is the salary band for a senior
   engineer?" and it is locked for him.
3. Switch to **Bob**: the salary band question answers. Severance is locked.
4. Still as **Alex**, in the same Ask thread: "I want to book a vacation". The
   assistant switches from answering to acting. Walk the trace, pick Option 1,
   "Send to Jordan Park". Time off · My requests now lists it as pending.
5. Switch to **Jordan**, Team approvals: the banner shows Alex's request. Approve.
6. Back to **Alex**: the approval has arrived in the Ask thread and My requests.
7. Switch to **Ananya**, Ask: "How much maternity leave do I get?" Expand the
   trace: resolve asker, global policy, India supplement, reconcile, eligibility,
   procedure. Then "My due date is Nov 20" (the 8-week window opens), "Nov 2"
   (a 26-week draft with return date and documents), "yes" (routed to Rohan
   Mehta, her manager in Bengaluru, and HR; Bob's notifications show the
   eligibility check). Switch to **Rohan**: the request notice is in his Ask
   thread; type "show me coverage" (the team dips to 1 of 3 during Arjun's
   Diwali week, flagged as a planning note since parental leave is an
   entitlement), then "approve Ananya" and "yes". Back to Ananya, the
   approval has landed.
8. Switch to **Sarah**, same question: 16 weeks, FMLA concurrent, US supplement
   cited, and the India supplement is nowhere on her shelf.

Each persona keeps its own threads, and "New chat" clears the current one.

## Eval suite

`npm run eval` runs 46 cases against the running API and resets state before
each one. Categories, runnable alone with `npm run eval:<category>`:

- **routing**: which messages go to the agent vs the policy library, including
  the "severance plan" trap and a stray "yes" that must not submit anything.
- **access**: each persona's searchable shelf is exactly right, misses abstain,
  and no out-of-scope title, lock, count, or canary string ever appears.
- **library**: the document list contains only readable documents, with text.
- **agent**: balances by employment type, planner picks and coverage, blackout
  refusal, insufficient balance, holiday exclusion, short-notice heads-up.
- **leave**: the agentic-RAG loop per country, cross-country non-leak,
  contractor ineligibility, due-date window, draft and submit to manager + HR,
  no PTO deduction, changing the start date before confirming.
- **safety**: nothing submits without an explicit yes; cancel discards.
- **flow**: request, notify, approve or deny, tell the employee, move balances.
- **manager** and **hr**: dashboard shape, who may decide, org-wide read-only,
  and the manager's chat steps (coverage, queue, approve or deny with a yes gate).

Cases that need the Python RAG are skipped, not failed, when it is down.
Reports land in `eval/reports/`. The June 2026 suite is archived in
`eval/archive/`.

## Known limits

- The Python RAG uses an offline hash embedder unless a Voyage or Anthropic key
  is configured, so some phrasings abstain (for example "How many PTO days do I
  get a year?"). The suggestion chips use phrasings verified to retrieve.
- Time off runs the deterministic offline planner unless `ANTHROPIC_API_KEY` is
  set (see `.env.example`); with a key it runs a live Claude tool-use loop over
  the same tools.
- The RAG's extractive fallback picks the section with the most word overlap,
  which is sometimes a header rather than the substantive paragraph.

## Layout

- `src/App.tsx`: workspace shell, persona and thread state, RAG-then-local policy call
- `src/personas.ts`: personas, use cases, suggestion chips
- `src/components/`: Sidebar, Composer, PolicyMessage, TimeOffMessage, ApprovalsPanel, DocsPanel
- The Python demo's `webapp.py` gained `GET /api/docs?user=` (full text only when the ACL permits)
- `server/agents/`: orchestrator (Claude loop + offline planner), planner
- `server/policies/`: local policy docs and permission-aware search (fallback + the agent's own checks)
- `server/workday/`: mock Workday data, tools, notifications
- `vite.config.ts`: `/api` to Express, `/rag` to the Python RAG
