# Use case 04: Get help (IT support in the same window, from first question to fixed)

Status: spec v0.2 (2026-09-11) · Owner: Swapna Oundhakar · Build in progress (Claude Code)
Supersedes v0.1 (2026-09-10). What changed: v0.1 centered on a VPN incident, access requests
with manager approval, and a demand dashboard. v0.2 follows the three flows Swapna described on
2026-09-11: try the article, then log the ticket; the support agent spots the pattern and
publishes the fix; live help with a person. Incidents, access approvals, and the demand view are
deferred (section 9).

Why this exists: Netflix, Product Manager, Employee Support (JR42409, remote, $310K to $545K,
posted 2026-09-08; JD at `../netflix_employee_support_jd.txt`). The role owns the internal
support product across "Slack, Zendesk, and Jira and the integrations connecting these
platforms", wants "self-service, agent productivity, and the employee support experience"
improved with automation and AI, and asks for "the data foundation needed to understand support
demand, identify recurring issues." This use case is the same shape as IT Assist at Kore.ai, so
the resume claim and the demo point at the same thing.

Naming rule carried over from the site: the demo stays generic. In the demo and on the page it is
"the knowledge base", "the ticketing system", and "live help". Slack, Zendesk, and Jira appear
only in the production-mapping section, next to Workday and Google Drive.

---

## 1. Problem

An employee whose laptop keeps freezing today does four things: searches the IT knowledge base,
gives up, opens a ticket, and waits. The ticket sits in a queue with five others that say the same
thing in different words, and nobody notices they are one problem. The support agent answers each
one by hand. The fix never becomes an article, so next week the same ticket arrives again.

Three jobs to be done, in their owners' words:

- Employee: "When something at work is broken, I want to try the fix myself, and if that fails,
  hand it to someone who owns it, without leaving the window I am in."
- Support agent: "When a ticket lands, I want to know if I have seen this before, and turn the
  answer into something employees can use so I stop answering it."
- Employee, stuck: "When the article did not help and I cannot wait, I want a person, now, in the
  same thread."

## 2. Personas and what changes

| Persona | Role in this use case |
|---|---|
| Alex Chen, Priya Sharma, Sarah Kim, David Lee (US), Ananya Iyer (India) | Employees who report issues; each sees only the knowledge base articles their groups allow |
| Marcus Johnson (contractor) | Can report issues and get articles from the contractor-visible set; the employees-only article on badge access abstains for him |
| Jordan Park, Rohan Mehta (managers) | Unchanged in this use case (no approvals in v0.2) |
| Bob Rivera (hr_admin) | Reads the IT queue, decides nothing |
| **Sam Okafor (new), it_support** | Owns the queue and live help. Sees every ticket, the "cases like this" analysis, drafts and publishes articles, answers live chats with a suggested reply at hand |

DECIDE 1 (defaulted: yes): Sam is a visible ninth persona in the picker. The manager persona is
what made the time-off story land; the support persona does the same job here.

## 3. Solution: the three flows (target transcripts, to be captured once built)

### Flow A. The employee tries the fix, then logs a ticket

**Alex Chen, employee, US**

> Alex: My laptop is not working, it keeps freezing.
>
> Assistant: The knowledge base has an article that matches: **Laptop freezes or stops
> responding**. Two steps, about five minutes:
> 1. Restart the laptop. Hold the power button for ten seconds if it will not respond.
> 2. Open the endpoint agent and install the pending update (7.4.1). Restart again.
>
> Try that and tell me whether it worked. If it does not, I will log a ticket with what you
> already tried, so IT does not ask you to do it twice.

Card under the reply: the article title, the two steps, and two buttons: **It worked** and
**Still broken**.

> Alex: I installed the update, still freezing.
>
> Assistant: Sorry about that. Here is the ticket I would log:
> **Subject:** Laptop freezes after restart and endpoint agent update
> **Category:** Hardware, laptop · **Priority:** Medium
> **Already tried:** restart; endpoint agent update 7.4.1 (from the article)
> Log it?

> Alex: Yes.
>
> Assistant: Logged. Ticket **IT-1047** is in the IT queue, owned by Sam Okafor, with the steps
> you tried attached. Ask me "where is my ticket" any time, or say "talk to a person" if you
> cannot wait.

Trace line under the reply, same format as the other agents:
`Intent: it request (rule: matched "laptop"). Routed to the help agent. Tools: search_kb,
propose_ticket, submit_ticket. Gate: submit waited for a yes.`

### Flow B. The support agent sees the pattern and publishes the fix

**Sam Okafor, IT support**

> Sam: Open IT-1047.
>
> Assistant: **IT-1047**, Alex Chen, "Laptop freezes after restart and endpoint agent update",
> Medium, opened 2 minutes ago. Already tried: restart, endpoint agent update 7.4.1.
>
> **Five other open tickets in the last 14 days look like this** (same category, same symptom,
> every one mentions the endpoint agent 7.4 update): IT-1039 Priya Sharma, IT-1040 David Lee,
> IT-1042 Sarah Kim, IT-1044 Kavya Nair, IT-1045 Arjun Rao. The article the employees were
> offered (KB-102) tells them to install 7.4.1, which is the version that freezes.
>
> Likely cause: endpoint agent 7.4.1 on laptops with the 2024 firmware. IT's fix on the earlier
> tickets was to roll the agent back to 7.3.9 from the self-service portal.
>
> Want me to draft a help article so the next employee can do the rollback themselves?

> Sam: Yes.
>
> Assistant: Draft article:
> **Title:** Laptop freezes after endpoint agent 7.4.1: roll back to 7.3.9
> **Applies to:** all employees · **Symptom:** laptop freezes or stops responding after the
> 7.4.1 update · **Steps:** (1) open the self-service portal, (2) choose Endpoint agent,
> Versions, 7.3.9, install, (3) restart. **Replaces:** KB-102 step 2.
> Publish it? It goes to the knowledge base, and the six open tickets get a reply with the link.

> Sam: Publish.
>
> Assistant: Published **KB-108**. Replied on IT-1047, IT-1039, IT-1040, IT-1042, IT-1044, and
> IT-1045 with the article; each requester was notified. KB-102 now points to it. The tickets
> stay open until each employee confirms.

**Alex, later**

> Alex: Laptop is still freezing.
>
> Assistant: There is a new article for exactly this, published by Sam Okafor 3 minutes ago:
> **Laptop freezes after endpoint agent 7.4.1: roll back to 7.3.9**. [steps] Your ticket
> IT-1047 is still open; say "it worked" and I will close it.

### Flow C. Live help

**Alex**

> Alex: Talk to a person.
>
> Assistant: I can connect you with IT support now. Your ticket IT-1047 and what you tried go
> with you, so you will not repeat yourself. Connect?

> Alex: Yes.
>
> Assistant: You are in the live help queue. Sam Okafor will join here; keep typing in this
> thread and Sam sees it.

The thread switches to live mode: a banner "Live help · waiting for an agent", then "Live help ·
Sam Okafor", messages from Sam in a distinct bubble, and an **End chat** button.

**Sam, Live help panel**

Sam sees the waiting chat with the ticket summary beside it, joins, and a **suggested reply**
sits in the composer, drafted from the ticket and the knowledge base: "Hi Alex, I see you tried
the 7.4.1 update. That version is the cause. Roll back to 7.3.9 from the self-service portal
(Endpoint agent, Versions) and restart. Article KB-108 has the steps." Sam edits or sends. The
suggestion is labeled as assistant-drafted and is never sent without Sam.

**Alex**

> Sam: Hi Alex, I see you tried the 7.4.1 update ...
>
> Alex: That worked, thanks.
>
> Sam: Great. Closing IT-1047.

Sam clicks **Resolve ticket** in the panel; Alex's thread shows the ticket closed and the chat
ends.

## 4. Architecture and flow

Nothing new in the shape: a fifth agent behind the same orchestrator, deterministic in both modes
in v0.2 (like the manager steps: every write here is gated, and a ticket or an article should not
depend on a model). The Claude tool-use loop for this agent is a follow-up.

**Routing.** New intent `it_request`, agent `help`. Rules first: a word list for broken things
and help (laptop, computer, vpn, wifi, password, locked out, monitor, printer, software, install,
not working, broken, freez, crash, slow, ticket, talk to a person, live agent). Session second: an
open article offer turns "it worked" and "still broken" into follow-ups; an open ticket draft
turns "yes" into submit; an active live chat sends every message to the person, not the agent,
until "end chat". Model third: the classifier gains a fifth label, `it_request`, with the same
"unsure means policy_question" default. Sam's messages route to the help agent by role.

**Agent.** `server/agents/help.ts`. A planner with a fixed order: article first (search the
knowledge base the employee may see), then the ticket, then live help. Sam's side: open ticket,
find cases like this, draft article, publish.

**The three mock systems, and the integrations between them:**

| Mock system | Stands in for | What it stores | Integration the assistant performs |
|---|---|---|---|
| Knowledge base (`server/helpdesk/kb.ts`) | Confluence or Zendesk Guide | articles: id, title, symptoms, steps, allowed groups, author, published at, replaces | ACL filter before ranking, the same code path as policy search; Sam's published article is visible to the next employee immediately |
| Ticketing (`server/helpdesk/mock-data.ts`) | Zendesk or Jira Service Management | tickets: id, requester, subject, category, priority, status, owner, tried steps, offered article, replies, tags | A ticket carries what the employee already tried and which article was offered; publishing an article replies on every matching ticket |
| Live help (`server/helpdesk/livechat.ts`) | Slack Connect or a Zendesk chat | chats: id, employee, agent, status, messages, linked ticket | The chat opens with the ticket attached; Sam's suggested reply is drafted from the ticket and the knowledge base; resolving from the chat closes the ticket |
| Directory (existing HR mock) | Workday | employee, location, type | Article visibility and ticket ownership resolve from the record, never from the message |

The point to make on the page: the assistant is the integration. Today the "integration" between
these tools is a person copying a ticket number into a chat. Here the article offered, the ticket,
and the live chat share one request ID, and "where is my ticket" reads all three.

**Tools and tiers** (same scheme as SPEC.md section 5):

| Tool | Reads / writes | Tier | Guard |
|---|---|---|---|
| search_kb | reads articles the employee may see | T0 | ACL filter before ranking |
| get_my_tickets | reads own tickets and replies | T0 | requester scope; Sam and Bob read the queue |
| propose_ticket | writes a session draft | T1 | category from a fixed list; priority Medium unless the employee asks; tried steps copied from the article offer |
| submit_ticket | writes to ticketing | T2 | needs a draft and a yes in the latest message |
| close_ticket | writes status | T2 | requester or owner only; "it worked" on an open ticket counts as the yes |
| reply_on_ticket | writes the employee's own note onto their open ticket after "still broken" | T2 | the requester's own open ticket; the note is the employee's message, not model-written |
| request_live_help | writes a waiting chat | T2 | needs a yes; attaches the open ticket if there is one |
| send_live_message | writes to the chat | T1 | either party, only while the chat is active |
| end_live_chat | ends the chat, leaving the ticket as it stands | T2 | either party, only while a chat is open |
| open_ticket (Sam) | reads one ticket plus similar open tickets | T0 | it_support or hr_admin only |
| get_queue (Sam) | reads every open ticket, oldest first, plus who is waiting in chat | T0 | it_support only; an employee never sees the queue |
| find_similar_tickets (Sam) | reads tickets sharing category and symptom tags in 14 days | T0 | it_support only; requester names shown, nothing else personal |
| propose_article (Sam) | writes a session draft | T1 | title, symptom, steps from the resolved tickets' notes; "applies to" defaults to all employees |
| publish_article (Sam) | writes to the knowledge base | T2 | needs a draft and a yes |
| reply_on_tickets (Sam) | writes a reply on every open ticket the new article answers and notifies each requester | T2 | runs only inside publish_article, after its yes; the reply is the fixed template with the article title and ID, never model-written |

Fifteen tools. The support agent's suggested reply is **not** one of them: `suggestReply()` in
`server/agents/help.ts` drafts it from the ticket and the knowledge base, the composer renders it
as a draft, and the assistant never sends it. An earlier version of this spec listed it as a tool
called `suggest_reply`, which never existed in the code; corrected 2026-09-13.


**Gates added.** Yes-gate on ticket submit, article publish, and live help. Owner gate on close.
Role gate on the queue, similar-cases, and publish. Templated-reply gate: the ticket replies and
notifications sent on publish are the fixed template with the article title and ID.

**Transport for live help.** Polling, the same as approvals today (the client already polls
notifications and the dashboard every 4 seconds). Employee thread polls the chat every 2 seconds
while a chat is open; Sam's panel polls the queue and chats every 2 seconds. No websocket.

## 5. Evaluation framework

New category `help` in `eval/test-cases.ts`, roughly 12 cases, and `site_tools/build_evals_page.py`
gains the category so the site pages render it:

1. Routing: "my laptop is not working" routes to `help` by rule.
2. Routing: "what is the policy on personal devices" stays policy_search.
3. Article first: the first reply offers KB-102 and logs no ticket (`noTicket`).
4. KB ACL: the contractor asking about badge access gets no article and the abstain wording.
5. Follow-up: "still broken" after the offer produces a ticket draft carrying the tried steps.
6. Yes-gate: "sounds good, maybe later" after the draft submits nothing.
7. Submit: "yes" logs IT-1047 owned by Sam, and Alex's `GET /api/tickets` shows it.
8. Similar cases: Sam opening IT-1047 gets five similar tickets named.
9. Role gate: Alex asking "open IT-1039" is refused (not the requester).
10. Publish: Sam's yes publishes KB-108, replies on six tickets, and Alex's next laptop question
    returns KB-108, not KB-102.
11. Live help: "talk to a person" then yes opens a chat; Sam's chats list shows it; a message from
    Sam arrives in Alex's poll.
12. Close from chat: Sam resolving closes IT-1047 and Alex's tickets list shows resolved.

Golden set: unchanged in v0.2. The pass counts on the site (46 cases) change, so the reconcile
step applies.

## 6. What it proves, in JD terms

- "Self-service": the article comes first, and the article Sam publishes deflects the next ticket.
- "Agent productivity": cases like this, the drafted article, the suggested reply.
- "The employee support experience": one thread from first question to fixed, including a person.
- "The integrations connecting these platforms": one request ID across article, ticket, and chat.
- "Identify recurring issues": five tickets, one cause, one article. The queue is the demand data.

## 7. Build plan (v0.2)

| Step | What | Files |
|---|---|---|
| 1 | Types and roster: `it_support` role, Sam Okafor, ticket, article, chat types | `shared/types.ts`, `server/workday/mock-data.ts`, `src/personas.ts` |
| 2 | Mock systems: knowledge base with ACL search, seeded tickets (six laptop cases plus two others), live chat store, reset | `server/helpdesk/kb.ts`, `server/helpdesk/mock-data.ts`, `server/helpdesk/livechat.ts` |
| 3 | Help agent planner: employee path (article, follow-up, ticket, status, live help) and Sam's path (open, similar, draft, publish) | `server/agents/help.ts` |
| 4 | Router: `it_request` intent, help agent, session state, classifier label | `server/agents/intent.ts`, `server/agents/orchestrator.ts` |
| 5 | Routes: tickets, queue, chats, messages, resolve, suggested reply; reset | `server/index.ts` |
| 6 | Client: Sam persona and nav, HelpMessage card (article, ticket draft, ticket badge, live banner), SupportPanel (queue, chats, suggested reply, resolve), live polling | `src/` |
| 7 | Eval cases, category on the site, regenerate | `eval/`, `site_tools/build_evals_page.py` |
| 8 | Site: `work-help.html` in the eight-part order, work.html gains use case 04 and the fifth agent, screenshots | `website/` |

## 8. DECIDE (defaults applied in the build; change any of them)

1. Sam Okafor visible as a ninth persona. Default: yes.
2. Logging the ticket needs a yes after the draft. Default: yes (T2 write).
3. Publishing the article needs a yes after the draft. Default: yes.
4. Live help needs a yes before the chat opens. Default: yes, one question.
5. On publish, every matching open ticket gets a templated reply and its requester a
   notification. Default: yes.
6. Sam's suggested reply is a draft in Sam's composer, never auto-sent. Default: yes.
7. The help agent is deterministic in both modes for v0.2. Default: yes; Claude loop later.
8. "It worked" on an open ticket closes it without a second yes. Default: yes.

## 9. Deferred from v0.1

Engineering-tracker incidents and their visibility rules, access requests with manager approval,
the contractor finance rule, the team-chat note, the P1 rule, and the support demand view
(section 4b of v0.1). Each is a good follow-up once the three flows above are captured.
