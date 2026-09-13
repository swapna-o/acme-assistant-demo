# Use case 03: Time off (an agent that plans, and a manager who approves)

Full chapter: https://swapna-oundhakar.netlify.app/work-timeoff.html

**Problem.** Booking a week off means checking a balance, the holiday calendar, who else is
out, the notice rule, and then emailing a manager who has none of that in front of them.

**What it does.** Read-only tools first: balances, holidays, team calendar, conflicts,
requests. The planner ranks three windows that fit the notice, blackout, balance, and
coverage rules. The employee picks one, the agent drafts the request, and nothing is written
until the latest message reads as a yes. The manager sees what is waiting, the coverage for
each request, and approves or denies in the same conversation. Only the employee's own
manager can decide; the check is against the employee record, not the caller's claim.

**Try it.** As Alex: "I want to book a vacation." Pick a window, say yes. Switch to Jordan
(the manager): "What is waiting on me?" Approve it.

**Where the code is.** `timeoff-agent/server/agents/planner.ts` (offline planner),
`orchestrator.ts` (Claude tool-use loop), `manager.ts` (deterministic decision path),
`server/workday/` (mock HR system and tools).

**Evals.** Routing, the yes-gate, validation refusals (bad dates, blackout, overlap,
balance), manager scope, and the persona coverage math.
