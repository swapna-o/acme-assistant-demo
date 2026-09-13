# SPEC.md: Acme Assistant (time off, leave, policy search)

Course lesson L1. A spec pins down what the agent may do, for whom, with which tools, at
what risk, and what happens when it should not act. Everything below the line "Facts from
the code" is pulled from the running system. Everything marked **DECIDE** is a product
call that only the owner can make. Fill those in, then the spec is v1.

Status: draft v0.2 (2026-09-09, owner decisions in sections 1, 2, 6 recorded) · Owner: Swapna Oundhakar · Risk sign-off: **DECIDE** (who?)

---

## 1. Purpose and users

The assistant answers HR questions and moves time-off work forward for employees of a
fictional company, Acme Corp, from one chat window. It replaces three trips: the HR system
for balances and requests, the policy library for rules, and email to the manager.

| Persona | Email | Role | Type | Location | Manager | What the demo uses them for |
|---|---|---|---|---|---|---|
| Alex Chen | alex.chen@acme.com | employee | full-time | US | Jordan Park | Standard vacation flow, US parental leave, locked-document tests |
| Priya Sharma | priya.sharma@acme.com | employee | part-time | US | Jordan Park | Prorated balances (4-hour days) |
| Marcus Johnson | marcus.johnson@acme.com | employee | contractor | US | Jordan Park | No paid leave, unpaid time off, 7-day notice, not eligible for parental leave |
| Sarah Kim | sarah.kim@acme.com | employee | full-time | US | Jordan Park | Second US employee, coverage math |
| David Lee | david.lee@acme.com | employee | full-time | US | Jordan Park | Has a pending request on Thanksgiving week |
| Ananya Iyer | ananya.iyer@acme.com | employee | full-time | India | Rohan Mehta | India maternity entitlement (26 weeks, 8 pre-natal) |
| Kavya Nair, Arjun Rao | kavya.nair@, arjun.rao@ | employee | full-time | India | Rohan Mehta | Rohan's team roster |
| Jordan Park | jordan.park@acme.com | manager | full-time | US | Dana Whitfield | Approvals, coverage, team calendar |
| Rohan Mehta | rohan.mehta@acme.com | manager | full-time | India | Dana Whitfield | India-side manager |
| Bob Rivera | bob.rivera@acme.com | hr_admin | full-time | US | Dana Whitfield | Sees everything, decides nothing |

Job to be done, in the employee's words: "When I need time off or have a policy question, I
want a correct answer that fits my situation and a request that reaches my manager, so I
can stop guessing and stop emailing HR."

**Decided (2026-09-09): employees are the primary user for v1 scoring.** When trade-offs
appear, employee-facing failure modes rank first in L4 and get the first fixes in L8.
Manager failures are still measured; they rank second.

## 2. Scope

In scope (v1, as built):
1. Policy search with document-level permissions (ten policies; ACL filter before ranking).
2. Time off: balances, holidays, team calendar, conflict checks, ranked vacation windows,
   draft a request, submit after an explicit yes.
3. Parental leave: entitlement by country (global policy plus US or India supplement),
   eligibility from tenure, procedure, draft a leave of absence, submit after a yes.
4. Manager steps: what is waiting, coverage per request, approve or deny after a yes.
5. HR admin: read everything across the org; no decisions.

Out of scope (v1):
- Any leave type other than PTO, sick, floating, unpaid, and parental.
- Cancelling or editing a submitted request. Decided: stays out of v1.
- Payroll, compensation, benefits enrollment, performance, IT.
- Multi-company tenancy, languages other than English.
- Writing to a real HR system. The HR system is a mock; the interface is what a real one
  would expose.

Decided (2026-09-09): nothing is removed for risk. Manager decisions through chat stay in
v1, behind the role gate and the confirm gate.

## 3. Roles and permissions (enforced in code, not in the prompt)

Identity comes from the mock SSO session, never from the message. Groups derive from the
employee record:

| Employee fact | Groups |
|---|---|
| Regular employee | all-employees, plus employees-us or employees-in by location |
| Contractor | contractors only |
| Manager | above, plus managers |
| HR admin | above, plus hr-admins and managers (hr-admins see every document) |

Document access is filter-then-retrieve: documents outside the asker's groups are removed
before ranking and never reach the model. The prompt also tells the model not to describe a
locked document, but the prompt is the second guard, not the first.

Writes are gated by role in code:
- Only the employee's own manager can approve or deny their request (checked against the
  employee record, not the caller's claim).
- HR admins can read all requests but the decide path refuses them.
- Every write needs an explicit yes in the latest message (regex on the last user turn).

## 4. Use cases and routing

Every message goes through the orchestrator: session state first, then rules, then a small
model, then a safe default. The trace records which layer decided and why.

| Intent | Agent | Tools it may use |
|---|---|---|
| policy_question (default) | policy_search | RAG service, local index fallback. No write tools. |
| time_off | time_off | balances, search_policies, holidays, team calendar, conflicts, suggest_vacation_dates, requests, propose, submit |
| parental_leave | leave | search_policies, assess_parental_leave, propose_leave_of_absence, submit, requests |
| manager_action | manager | deterministic code only, no model in the loop |
| confirm, cancel, pick_option | whichever agent owns the open draft | as above |

Two execution modes with the same tools and the same gates: the Claude tool-use loop
(model chooses the tools) and the offline planner (fixed order, no network). Manager
decisions always run the deterministic path.

## 5. Tool contracts and risk tiers

Tiers as proposed. **DECIDE** each row by initialing the last column or changing the tier.

| Tool | Reads / writes | Inputs | Proposed tier | Guard in code | Known weak spot | Sign-off |
|---|---|---|---|---|---|---|
| get_leave_balances | reads own balances | none | T0 read | scoped to signed-in employee | none | |
| get_company_holidays | reads holidays | year | T0 read | by employee location | year defaults to current if missing | |
| get_team_calendar | reads teammates' time off | date range | T0 read | scoped to own manager's team | reveals teammates' dates and status | |
| check_date_conflicts | reads | date range | T0 read | own requests only | none | |
| get_time_off_requests | reads own requests | status filter | T0 read | own only | none | |
| search_policies | reads allowed documents | query | T0 read | ACL filter before ranking; locked titles returned as names only | locked *titles* are visible in the tool result | |
| suggest_vacation_dates | reads, computes | days, earliest, latest, month | T0 read | notice, blackout, balance, coverage rules applied | date math in server local time | |
| assess_parental_leave | reads policies, computes | none | T0 read | country from employee record | entitlement facts live in code, not only in the documents | |
| propose_time_off_request | writes session draft only | type, dates, note | T1 propose | validates dates, balance, blackout, overlap; nothing leaves the session | over 10 consecutive workdays is capped by the planner but not blocked here (policy says director approval) | |
| propose_leave_of_absence | writes session draft only | start, expected date | T1 propose | requires a prior eligible assessment; no past dates | none | |
| submit_time_off_request | writes to HR system, notifies manager | none | T2 write | refuses without a draft and without an explicit yes in the latest message | yes-regex accepts "ok" and "sure"; consider a tighter phrase | |
| decide_request (manager path) | writes decision, notifies employee | request, decision, note | T2 write | manager of that employee only; yes-gate | deny without a reason is refused; approve needs none | |

Tier definitions:
- T0 read: no side effects. Safe to call freely. Failures are wrong or leaked information.
- T1 propose: changes only the conversation state. Reversible by saying no.
- T2 write: irreversible from the assistant's side. Requires the confirm gate and role check.

**DECIDE:** should any T2 action also require a second factor (typed request ID, or a
button in the UI rather than a chat "yes")?

## 6. Gates, refusals, and escalation

Gates that exist today:
1. Confirm gate: submit and decide refuse unless the latest message reads as a yes.
2. Role gate: decisions by anyone but the employee's manager are refused.
3. ACL gate: policy search never ranks a locked document.
4. Validation gate: proposals are refused for bad dates, blackout overlap, existing
   overlap, no workdays, or insufficient balance, with the reason returned to the employee.
5. Eligibility gate: parental leave drafts require an eligible assessment (tenure, not a
   contractor).
6. Step cap: the model loop stops after 12 iterations and asks the employee to rephrase.
7. Fallback: if the model call fails, the turn is re-run on the offline planner.

Escalation to a human (what the assistant says, and to whom the work goes):

| Situation | Today | v1 behavior |
|---|---|---|
| Policy question with no allowed passage | "contact HR" abstain | Decided: abstain and offer to file an HR ticket. **Gap:** no ticket tool exists yet; see "Spec-to-code gaps" below. |
| Request over 10 consecutive workdays | planner caps options at 10; direct dates draft silently | Decided (2026-09-09): warn and submit. The draft states that requests over 10 consecutive workdays also need director approval [PTO Policy / Requesting time off], then goes to the manager as usual. **Gap:** the warning line does not exist today; see below. |
| Blackout overlap | refused, nearest clear week offered | keep |
| Not eligible for parental leave | explained with the section cited | **DECIDE:** keep, plus HR contact? |
| Contractor asks about paid leave | explained, unpaid path offered | keep |
| Manager denies without a reason | drafting refused until a reason is given | keep |
| Model loop exhausted or API error | rephrase prompt, or offline fallback | **DECIDE:** is a silent fallback acceptable, or should the employee be told? |

### Spec-to-code gaps (from the decisions above)

The spec now says two things the code does not do. They are not fixed here on purpose:
changing demo behavior means reconciling the portfolio site, and the course order is to
observe the gap in traces (L4), write the test that fails (L6), then fix it (L8).

| Gap | Spec says | Code does | Planned |
|---|---|---|---|
| HR ticket on abstain | offer to file an HR ticket | says "contact HR" | new tool `file_hr_ticket` (T2 write: leaves the session, needs the confirm gate); the ticket is a mock like the HR system |
| Over 10 consecutive workdays | warn that director approval is also needed, then submit | drafts and submits with no warning | propose adds a "Heads up" line citing the policy section, like the short-notice line; L6 case added first |

## 7. What "correct" means per use case (seed for the failure taxonomy in L4)

- Policy search: the answer comes from an allowed document, cites the section, and abstains
  when nothing allowed covers it. No content, and ideally no existence, of locked documents.
- Vacation: options respect notice, blackout, balance, and coverage; dates and counts are
  right; holidays are excluded from PTO; the request summary matches what is submitted.
- Parental leave: the entitlement matches the asker's country and tenure; the higher of
  global and local applies; citations point at the sections that carry the fact.
- Manager: only the right manager decides, with coverage stated correctly, and nothing is
  recorded before a yes.
- Every use case: nothing is submitted without consent, and the reply is short and plain.

## 8. Risk register (first pass)

| Risk | Likelihood | Impact | Where it would show in a trace |
|---|---|---|---|
| Locked document content in an answer | low (code filter) | high | policy span with a locked title in `sources` |
| Submit without consent | low (gate) | high | confirm_gate denied=false with a weak "yes" |
| Wrong entitlement or dates | medium | high | tool outputs vs. the reply text disagree |
| Confident answer where it should abstain | medium | medium | policy span abstained=false with weak retrieval scores |
| Wrong routing (policy question sent to the agent, or vice versa) | medium | low | route span `how` and `reason` |
| Cost growth from long histories | high | low per turn | llm spans: input tokens rising every turn |
| Prompt injection through a message | medium | medium (authorization holds in code) | gate spans without matching user intent |

## 9. The Three Gulfs, mapped to this app

- Comprehension: what do employees actually ask, in what words, and what do the traces show
  the assistant doing? Closed by reading traces, not by imagining them (L4).
- Specification: does this document, the prompt, and the tool descriptions say what
  "correct" is precisely enough that two people would grade a trace the same way? Closed by
  the failure-mode definitions and judge prompts (L5).
- Generalization: does the assistant behave the same on the long tail as on the demo
  prompts? Closed by synthetic scenarios and the regression suite (L3, L6).

## 10. Facts from the code, for reference

- Tools: 11 model-visible tools in `server/workday/tools.ts`; propose and submit are handled
  in `server/agents/orchestrator.ts` because they touch session state.
- Prompt: `server/agents/prompts.ts`. Hash recorded on every trace.
- Routing: `server/agents/intent.ts` (session, rules, Haiku classifier, default).
- Permissions: `server/policies/index.ts` (groups, canSee, filter-then-retrieve),
  `server/index.ts` (role checks on manager routes).
- Traces: `server/tracing/tracer.ts`, files under `traces/`, `npm run traces`.
- Regression suite: `eval/` (58 cases), report published to the portfolio site. Use case 04 (get help: the knowledge base, tickets, live help) is specified in USE_CASE_04_GET_HELP.md and adds twelve `help` cases.

## Open decisions checklist

- [x] Primary user for trade-offs (section 1): employees
- [x] Anything to remove from v1 for risk (section 2): nothing
- [x] Cancel or edit a submitted request (section 2): out of v1
- [x] Escalation: abstain offers an HR ticket; over 10 workdays warns about director approval and submits (section 6)
- [ ] Not eligible for parental leave: add an HR contact? (section 6)
- [ ] Silent model fallback acceptable? (section 6)
- [ ] Risk tier sign-off per tool (section 5)
- [ ] Second factor for T2 writes (section 5)
- [ ] Risk sign-off owner (header)
- [ ] Worked examples table (L1 exercise 3)
