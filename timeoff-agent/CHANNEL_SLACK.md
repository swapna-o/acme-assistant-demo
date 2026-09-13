# Channel: run Acme Assistant inside Slack (and later Teams)

Status: proposal v0.1 (2026-09-10) · Owner: Swapna Oundhakar · Not built yet
Order: build this before use cases 04 and 05. It works with the four agents that exist today,
so the payoff is immediate, and 04 and 05 then post to a real workspace instead of a mock.

Why: the Netflix Employee Support JD names Slack as one of the three platforms. Every chapter
on the site today shows a web chat shell that looks like the assistant. The claim "put tasks
where people already work" (the Kore.ai line in the work.html intro) is only proven when the
same request is typed into Slack and the same gated flow runs there. Teams is the second
channel; the design below keeps the adapter boundary so Teams is an add, not a rewrite.

Recommendation: Slack first. A free Slack workspace, an app in Socket Mode, and one adapter
file. Teams needs an Azure Bot registration and a Microsoft 365 tenant with admin rights;
the free developer tenant program is restricted now, so Teams is a week of setup before the
first message. Slack is an afternoon.

---

## 1. What the demo shows

Same personas, same agents, same gates, in a Slack workspace named Acme Corp (demo).

- Alex Chen (a Slack user mapped to the Alex persona) opens a DM with the Acme Assistant
  app: "Can I carry over unused PTO?" The reply is the policy answer with the trace line
  folded into a context block underneath.
- Alex: "I want to book a vacation." The three windows come back as a Block Kit list with
  a button per option. Picking one produces the draft with two buttons, Submit and Cancel.
  The button is the yes. This also settles the SPEC.md section 5 DECIDE item about a second
  factor for writes: in Slack the write needs a click, not a typed "ok."
- Jordan Park, in their own DM: "What is waiting on me?" Approve and Deny buttons. On
  Approve, Alex gets a DM from the app: "Jordan approved your Nov 24 to 26 request."
- In the channel #people-ops, a user @mentions the app with a policy question; the app
  answers in a thread, using the asker's persona for the ACL filter. Locked documents stay
  locked whoever is watching the channel.
- With use cases 04 and 05 in place, the templated notes go to real channels
  (#eng-us, #internal-tools, #it-support), the story-created and story-closed posts land
  there, and the 41 reporter messages are real DMs.

## 2. Architecture

```
Slack (Socket Mode, no public URL)      Web shell (existing)
        |                                       |
  server/channels/slack.ts               server/index.ts /api/chat
  - Slack user id -> persona                    |
  - message -> orchestrator turn                |
  - reply -> blocks (text, options, buttons)    |
  - button click -> confirm / cancel / pick     |
        \_______________________________________/
                          |
                orchestrator (unchanged)
          intent rules -> session -> model -> default
                          |
          agents, tools, gates, tracer (unchanged)
```

- **One orchestrator, two front doors.** The Slack adapter calls the same `handleTurn`
  the HTTP route calls, in the same process. No logic moves into the adapter. A trace
  records `channel: slack` next to the existing fields, so the traces page shows both.
- **Identity.** Slack user IDs map to demo personas in `server/channels/persona-map.json`
  (Slack ID to acme.com email). Unknown Slack users are refused with one line. For a solo
  demo, a `/persona alex.chen` slash command switches the mapping for her own Slack ID so
  she can walk all nine personas from one account; the switch is logged in the trace.
  Production mapping on the page: Slack's identity is the SSO identity, no persona switch.
- **Sessions.** Keyed by Slack user ID plus channel, so a DM thread and a channel thread
  do not share a draft. Same cap and expiry as web sessions.
- **The yes-gate in Slack.** Buttons post an interaction payload; the adapter turns a
  Submit click into the literal message "yes" for the session, so the existing regex gate
  and the draft check run unchanged. Typed "yes" still works. Cancel is "no."
- **Options.** The planner's three vacation windows already come back as structured
  options in the API response; the adapter renders them as Block Kit sections with a
  button each, and a click maps to `pick_option`.
- **Templated posts.** `post_channel_note` (use case 04) and the tracker posts (use case
  05) call the adapter when `SLACK_BOT_TOKEN` is set and fall back to the mock chat when it
  is not, so evals stay offline and free.
- **Secrets.** `SLACK_BOT_TOKEN` and `SLACK_APP_TOKEN` in `timeoff-agent/.env`, loaded by the
  existing `process.loadEnvFile()`. Never printed, never in the public repo. The Render
  demo stays web-only unless she decides otherwise; Socket Mode can run from the Render
  container or from her Mac.
- **Model mode.** Slack turns run in whatever mode the process is in. For a recorded demo
  the Claude loop is fine (about 13 cents per vacation turn); for a live walkthrough in
  front of someone, `AGENT_MODE=offline` removes the latency and cost risk.

## 3. Slack app setup (her part, about 20 minutes)

1. Create a free Slack workspace, "Acme Corp (demo)". Add channels #people-ops, #eng-us,
   #internal-tools, #it-support.
2. At api.slack.com/apps, create an app from a manifest (the manifest will be checked in
   as `server/channels/slack-manifest.yaml`). Scopes: `chat:write`, `im:history`,
   `im:write`, `app_mentions:read`, `channels:history`, `commands`, `users:read`,
   `users:read.email`. Events: `message.im`, `app_mention`. Interactivity on. Socket Mode
   on. One slash command, `/persona`.
3. Install to the workspace, copy the bot token and the app-level token into `.env`.
4. Invite a second Slack account (or a friend) if she wants the manager DM to show up on a
   different screen in the recording; otherwise `/persona` covers it.

## 4. Build plan (Claude Code's part)

| Step | What | Files | Size |
|---|---|---|---|
| 1 | Bolt adapter in Socket Mode: DM and mention handlers, persona map, session key, reply rendering | `server/channels/slack.ts`, `persona-map.json`, `slack-manifest.yaml` | half a day |
| 2 | Buttons: option pick, Submit and Cancel, Approve and Deny, mapped onto the existing intents | same | half a day |
| 3 | Outbound: notify the employee on a manager decision by DM; channel posting function the 04 and 05 tools call | same | two hours |
| 4 | Trace: `channel` field, persona switch logged | `server/tracing/tracer.ts` | one hour |
| 5 | Evals: the adapter is thin, so the tests are unit-level: a click becomes "yes", an unknown Slack user is refused, a channel question uses the asker's ACL, a locked document never renders in a channel thread | `eval/` | two hours |
| 6 | Site: a "Where it runs" block on work.html with a Slack recording and three stills; production mapping row for Slack identity; the intro claim gains its proof | `website/` | half a day |

About two working days. Dependencies: `@slack/bolt`. No new hosting.

## 5. Teams, when it comes

Same adapter interface (`Channel` with `onMessage`, `onAction`, `send`, `post`), a second
file `server/channels/teams.ts` on the Bot Framework SDK, Adaptive Cards in place of Block
Kit for options and buttons. The setup cost is the tenant and the Azure Bot registration,
not the code. The page can state this honestly: "Runs in the web shell and in Slack; Teams
uses the same adapter boundary and is the next channel." Do not claim Teams until it runs.

## 6. Site and reconcile

- work.html intro: "put those tasks where people already work" gets a short clause: "the
  same assistant answers in Slack."
- Diagram: the "ask" box at step 1 becomes two doors, web and Slack, into the orchestrator.
- Screenshots: `demo-slack-ask`, `demo-slack-approve` in `website/img/`; a fifth scene in
  the demo video.
- Per the reconcile rule: nothing on the site says Slack until the adapter answers a
  canonical prompt in the workspace and the transcript is captured with a date.

## 7. DECIDE

1. Slack only for now, Teams later? (Recommend yes.)
2. Does the Render demo get the Slack adapter, or does Slack run from her Mac for recordings
   and live walkthroughs only? (Recommend Mac only at first; a public Slack workspace invites
   abuse the web shell's rate limits were built to stop.)
3. Should the web shell also switch to buttons for Submit and Approve, so both channels use a
   click as the second factor? (Recommend yes; it closes the SPEC DECIDE the same way in both.)
4. Public visitors: a recording only, or an invite link to the workspace? (Recommend recording.)
