# Use case 05: Ship the fix (from recurring tickets to a story, tasks, and a closed loop)

Status: proposal v0.1 (2026-09-10) · Owner: Swapna Oundhakar · Not built yet
Depends on: use case 04 (Get help) for the ticket data and the support persona.

Why this exists: the Netflix Employee Support JD (JR42409) names Slack and Jira alongside
Zendesk. Use case 04 uses the tracker only as a read: the help agent checks for an open
incident. This use case makes the tracker the main stage and shows the other half of the
integration story: how a recurring support problem becomes a story, how the story becomes
tasks a developer picks up, and how the fix travels back to the employees who reported it,
without anyone leaving the chat. It is the loop the JD describes when it asks for a data
foundation that gives "actionable insights to support teams" and a PM who manages
products "through the full lifecycle."

Naming rule: in the demo and on the page it is "the work tracker" and "the team chat."
Jira and Slack appear in the production mapping only.

---

## 1. Problem

Support sees the same issue forty times before engineering hears about it once. When it
does reach engineering, it arrives as a chat message with no ticket numbers, the product
manager rewrites it as a story by hand, the developer breaks it into tasks in a second
tool, status lives in the tracker while the conversation lives in chat, and the forty
employees who reported it never learn it shipped. Three tools, and the join between them
is a person copying text.

Job to be done, three ways:
- Product manager: "When support demand shows a recurring issue, I want a story in the
  tracker with the evidence attached, so engineering works on what employees actually hit."
- Developer: "When I pick up a story, I want the tasks, the linked tickets, and the
  affected users in one place, so I can start without a discovery meeting."
- Employee: "When something I reported gets fixed, I want to hear about it where I asked."

## 2. Personas (three)

| Persona | Role | Reports to | What the demo uses them for |
|---|---|---|---|
| **Maya Torres (new)** | product_manager, internal tools | Dana Whitfield | Turns a recurring issue into a story; owns the internal-tools backlog |
| **Leo Brandt (new)** | developer, internal tools team | Maya's engineering partner (Ravi Desai, eng manager, on record only) | Picks up the story, breaks it into tasks, moves status, ships |
| **Alex Chen (existing)** | employee | Jordan Park | Reported the VPN issue in use case 04; gets the closing message |

Maya and Leo sit in a new group, `internal-tools`, so the tracker's write tools are gated to
them and the story's internal fields never reach an employee. Sam Okafor (support, from
use case 04) is not a persona in this chapter but appears in the data: the tickets are Sam's
queue.

## 3. Solution: the demo transcript (target, to be captured once built)

**Maya Torres, product manager**

> Maya: What is driving support demand this month?
>
> Assistant: Top three over 30 days. VPN disconnects: 41 tickets, 38 linked to incident
> ENG-2291, US only, client version 4.2. Wifi drops in Austin: 12 tickets, no incident
> linked. Analytics dashboard access: 9 requests, all approved, median 2 days to provision.
> The VPN one is 34% of all tickets this month.
>
> Maya: Create a story for the VPN one.
>
> Assistant: Draft story in the work tracker, project Internal Tools.
> Title: "Auto-update VPN client to 4.3 for US machines still on 4.2."
> Problem: 41 tickets in 30 days, 38 tied to ENG-2291; workaround is the backup profile.
> Evidence: links to the 41 tickets and the incident.
> Acceptance: no machine on 4.2 after rollout; VPN ticket volume down 80% over the
> following 30 days; the 41 reporters notified on close.
> Priority: High. Labels: support-driven, vpn. Create it?
>
> Maya: Yes.
>
> Assistant: Created ENG-2310. Linked to the 41 tickets and ENG-2291. Posted to #internal-
> tools: "New story ENG-2310 from support demand: 41 tickets, VPN 4.2. Unassigned."

Trace line: `Intent: tracker_action (rule: matched "create a story"). Routed to the work
agent. Tools: get_support_demand, propose_story. Gate: create waited for a yes; caller is in
internal-tools.`

**Leo Brandt, developer**

> Leo: I will take ENG-2310.
>
> Assistant: Assigned to you, status In Progress. Want me to break it into tasks?
>
> Leo: Yes.
>
> Assistant: Draft tasks under ENG-2310, from the story and the incident notes:
> 1. Inventory US machines on client 4.2 (query the device list).
> 2. Package client 4.3 for silent install.
> 3. Stage rollout to 10% of affected machines, watch ticket volume for 48 hours.
> 4. Full rollout.
> 5. Close the 41 linked tickets with a templated note and notify reporters.
> Estimates left blank for you. Create these five?
>
> Leo: Yes, but drop task 1, Sam already has the inventory. Attach it.
>
> Assistant: Created four tasks, ENG-2311 to ENG-2314. Sam's inventory (ticket IT-1043
> attachment) is attached to ENG-2311. Posted the plan to #internal-tools.

**Leo, two days later**

> Leo: Staged rollout is done, no new VPN tickets since yesterday. Move 2313 to done.
>
> Assistant: ENG-2313 is Done. VPN tickets in the last 48 hours: 0, down from a daily
> average of 1.4. Two tasks remain: ENG-2314 full rollout, ENG-2315 close and notify.

**Leo, ship day**

> Leo: Full rollout is out. Close the story.
>
> Assistant: This closes ENG-2310 and runs the notify step: 41 tickets move to Resolved
> with the note "Fixed by ENG-2310: VPN client 4.3 rolled out. Reply if it recurs," and
> each reporter gets a chat message. Sam is copied. Confirm?
>
> Leo: Confirm.
>
> Assistant: Done. ENG-2310 Done, 41 tickets Resolved, 41 reporters notified, summary
> posted to #internal-tools and #it-support.

**Alex Chen, employee (the loop closes)**

> Assistant (chat message, unprompted): Your ticket IT-1043 is resolved. The VPN issue
> you reported was fixed by a client update rolled out today. Reply here if it comes back.
>
> Alex: Did they fix the VPN thing?
>
> Assistant: Yes. IT-1043 was resolved today when the update shipped. If it recurs, tell
> me and I will reopen it against the same story so engineering sees it as a regression.

**Alex, boundary case**

> Alex: Show me story ENG-2310.
>
> Assistant: ENG-2310 is the engineering story that fixed your VPN ticket. I can tell you
> its status (Done, shipped today) and that your ticket is linked to it. The story's
> internal notes and assignee are visible to the internal-tools team only.

## 4. Architecture and flow

**Routing.** New intent `tracker_action`, agent `work`. Rules: story, task, ticket key
pattern (ENG-\d+), backlog, sprint, assign, "take", "move to", done, in progress, "what is
driving demand." Session: an open story or task draft turns yes into confirm. Classifier
gains the label, same policy_question default when unsure. Employees asking about a story
are answered by the help agent from use case 04 with the employee-visible fields only; the
work agent is reachable only for callers in `internal-tools`.

**Mock work tracker** (`server/tracker/`, extended from use case 04): projects, stories,
tasks, status, assignee, labels, links to tickets and incidents, comments, and an
employee-visible flag per field. The team chat mock gains two channels, #internal-tools
and #it-support, and a direct-message path per employee.

**Integrations the assistant performs** (the JD's "integrations connecting these
platforms"):

| From | To | What moves | When |
|---|---|---|---|
| Ticketing | Tracker | 41 ticket links and the incident key attached to the story | at story creation |
| Support demand view (use case 04b) | Tracker | the evidence block in the story body | at story creation |
| Tracker | Chat | story created, tasks planned, status changes, story closed | each write, templated |
| Tracker | Ticketing | linked tickets resolved with a templated note | on story close |
| Ticketing | Chat | reporter direct messages | on ticket resolve |
| Ticket attachment | Task | Sam's inventory attached to a task | on Leo's request |

**Tools and tiers**

| Tool | Reads / writes | Tier | Guard |
|---|---|---|---|
| get_support_demand | reads aggregated ticket data | T0 | internal-tools, support, hr_admin; no requester names in the aggregate |
| get_story, get_tasks, get_backlog | reads tracker | T0 | employee-visible fields only unless caller is internal-tools |
| propose_story | writes a session draft | T1 | title, problem, evidence, acceptance required; evidence must be real ticket or incident links, not model text |
| create_story | writes tracker, posts to chat | T2 | internal-tools only; yes-gate |
| propose_tasks | writes a session draft | T1 | derived from story and incident notes; estimates never invented |
| create_tasks | writes tracker | T2 | assignee or story owner only; yes-gate |
| assign_story, set_status | writes tracker, posts to chat | T2 | internal-tools; "I will take it" counts as the yes for assign only |
| close_story | writes tracker, resolves linked tickets, sends reporter messages | T2 | story owner or assignee; explicit confirm required because it fans out to 41 people; refuses if any task is not Done unless the caller says so |
| attach | writes a link | T2 | caller must be able to read both the source and the target |

**Gates added.** Group gate (tracker writes need `internal-tools`). Evidence gate (a story
with no ticket or incident link is refused; the assistant offers to create it as an idea
instead). Fan-out gate (close_story tells the caller how many people it will message and
waits). Field-visibility gate (employees see status and their own link, never assignee,
comments, or estimates).

**Two execution modes**, as everywhere: Claude tool-use loop, and the offline planner for
evals (fixed order: demand, draft, create).

## 5. Evaluation framework

About 12 cases in `eval/test-cases.ts`:

1. Routing: "create a story for the vpn issue" routes to `work` for Maya.
2. Routing: the same sentence from Alex routes to `help` and is answered with what an
   employee may see.
3. Group gate: Alex cannot create a story even with a yes.
4. Evidence gate: a story with no linked tickets is refused.
5. Draft before write: create_story refuses without a draft.
6. Story body carries the ticket count and incident key from the demand view, not a
   model-invented number.
7. Tasks: estimates are blank, never invented.
8. Assign: "I will take ENG-2310" assigns to the caller only.
9. Close refuses while a task is open, unless overridden in the same message.
10. Fan-out: close_story reports the reporter count before confirm; after confirm, every
    linked ticket is Resolved and every reporter has one message, none twice.
11. Field visibility: Alex's view of ENG-2310 has no assignee, comments, or estimates.
12. Chat posts equal the template; no model text is posted.

Golden set: three labeled traces (a good story creation, a blocked employee write, a
fan-out with one duplicate message caught).

## 6. What it proves, in JD terms

- "Slack, Zendesk, and Jira and the integrations connecting these platforms": six
  integrations, listed, each with a trigger and a guard.
- "Full lifecycle, from discovery through launch, adoption, continuous improvement":
  demand, story, tasks, staged rollout with a metric check, close, and the reporter loop,
  in one thread.
- "Data foundation that provides actionable insights to support teams": the demand view
  is the input to the story, and the ticket-volume check after the staged rollout is the
  outcome measure.
- "Improve the employee and support-agent experience": the employee hears back where they
  asked; Sam's 41 tickets close themselves.

## 7. Build plan

| Step | What | Size |
|---|---|---|
| 1 | Personas Maya and Leo, group `internal-tools`, tracker mock extended with stories, tasks, field visibility, two channels and direct messages | half a day |
| 2 | Tools with tiers and guards | half a day |
| 3 | Intent rule and label, work agent (loop plus offline planner), employee-view branch in the help agent | one day |
| 4 | Fan-out close path with the confirm and duplicate guard, trace spans | half a day |
| 5 | Client: two personas, story and task cards, chat channel view | one day |
| 6 | Evals, golden traces, regenerate evals pages | half a day |
| 7 | Site: `work-ship.html` in the eight-part order, work.html and the diagram gain the fifth chapter and sixth agent, screenshots, video scene | one day |
| 8 | Reconcile and redeploy | one hour |

About five working days, after the Slack channel (CHANNEL_SLACK.md) and use case 04 are in.

## 8. DECIDE

1. Build order: 04 then 05, or 05 alone with a smaller ticket mock? (Recommend 04 first;
   05 is the payoff of 04's data and reads thin without it.)
2. Does "I will take ENG-2310" count as the yes for assign, or does assign need a second
   message? (Recommend it counts; it is one person changing their own field.)
3. Fan-out on close: automatic reporter messages behind one confirm, or a separate
   "notify reporters" step Maya owns? (Recommend one confirm with the count shown.)
4. Should Alex be allowed to see the story title at all, or only "linked to an
   engineering fix"? (Recommend title and status; it is what makes the loop feel real.)
5. Site framing: is 05 a fifth use case, or is 04 plus 05 one chapter called "Support" with
   two demos? (Recommend two chapters; each has its own persona set and its own evals.)
6. Maya's title on the page: "product manager, internal tools" mirrors the Netflix role.
   Keep, or make it less pointed?
