# The Agent Builder's Playbook
### A structured guide to building production multi-agent systems
*Using a Workday Time-Off Agent as a running example throughout*

---

## Table of Contents

1. [Phase 0: Should This Be an Agent?](#phase-0-should-this-be-an-agent)
2. [Phase 1: Define the Agent's Identity (The .md File)](#phase-1-the-md-file)
3. [Phase 2: Design the Tool Layer](#phase-2-design-the-tool-layer)
4. [Phase 3: Single Agent vs. Multi-Agent](#phase-3-single-vs-multi-agent)
5. [Phase 4: The Loop Pattern](#phase-4-the-loop-pattern)
6. [Phase 5: State Machines & Conversation Design](#phase-5-state-machines)
7. [Phase 6: Guardrails](#phase-6-guardrails)
8. [Phase 7: Human-in-the-Loop](#phase-7-human-in-the-loop)
9. [Phase 8: Eval Framework](#phase-8-eval-framework)
10. [Phase 9: Observability & Debugging](#phase-9-observability)
11. [Phase 10: Adoption & Iteration](#phase-10-adoption)
12. [Anti-Patterns to Avoid](#anti-patterns)
13. [Decision Checklist](#decision-checklist)

---

<a id="phase-0-should-this-be-an-agent"></a>
## Phase 0: Should This Be an Agent?

Before writing any code, answer these questions honestly:

### The Agent Litmus Test

| Question | If YES → Agent | If NO → Something Simpler |
|---|---|---|
| Does the user's intent vary significantly across sessions? | Agent interprets intent | Workflow / form wizard |
| Are there 3+ tools the system needs to choose between dynamically? | Agent selects tools | API orchestration |
| Does the task require multi-step reasoning (not just multi-step execution)? | Agent reasons | Pipeline / DAG |
| Does the user benefit from conversational back-and-forth? | Agent converses | Single-shot API |
| Can the task fail in ways that require adaptive recovery? | Agent recovers | Retry logic |

### Time-Off Agent: Why it's a good agent use case

```
✅ Intent varies:     "check balance" vs "plan vacation" vs "submit PTO"
✅ Dynamic tool use:   balance lookup → conflict check → team calendar → submit
✅ Multi-step reason:  "July 3 is a holiday, so you save a day — take 1-2 instead"
✅ Conversational:     date negotiation, confirmation, follow-up
✅ Adaptive recovery:  insufficient balance → suggest alternatives
```

### When an agent is WRONG for the job

- **High-volume, low-variance tasks**: Expense report categorization → use a classifier
- **Deterministic workflows**: "Every new hire gets these 5 systems" → use a workflow engine
- **Speed-critical paths**: Real-time fraud detection → use rules + ML pipeline
- **Simple CRUD**: "Update my address" → use a form

### The Cost-Benefit Gut Check

```
Agent cost  = LLM tokens + latency + complexity + eval maintenance
Agent value = user flexibility + error reduction + deflection + delight

If the task takes a human 2 minutes in a form and the agent takes 45 seconds
in a chat, you've saved 75% of the time but added 10x the system complexity.

The agent wins when:
  - The form is confusing (time-off policies are confusing ✅)
  - The task has hidden knowledge ("July 3 is a holiday" ✅)
  - Errors are costly (wrong leave type → payroll issues ✅)
  - The user does this infrequently (people request PTO ~10x/year ✅)
```

---

<a id="phase-1-the-md-file"></a>
## Phase 1: Define the Agent's Identity (The .md File)

### What is a .md file in agent development?

The `.md` file (often called `CLAUDE.md`, `AGENT.md`, `system.md`, or just the
system prompt file) is **the single most important artifact in your agent**.
It defines:

- **Who** the agent is (role, personality, boundaries)
- **What** it can do (capabilities, tools, scope)
- **How** it behaves (conversation style, decision rules, safety constraints)
- **What it refuses** (scope boundaries, escalation triggers)

Think of it as the agent's **constitution**. Everything the agent does flows
from this document. A mediocre .md file produces a mediocre agent regardless
of how good your tools are.

### Anatomy of a Great Agent .md File

```markdown
# [Agent Name] — System Prompt

## Identity
One paragraph: who you are, who you serve, what you do.

## Context
Dynamic variables injected at runtime:
- Today's date: {{TODAY}}
- Employee: {{NAME}} ({{ID}}, {{TYPE}})
- Manager: {{MANAGER_NAME}}

## Capabilities (what you CAN do)
Explicit list of tools and when to use each one.

## Boundaries (what you CANNOT do)
Explicit list of out-of-scope requests and how to handle them.

## Conversation Rules
- Always greet by first name
- Never submit without confirmation
- Show balance impact before every submission
- etc.

## Decision Rules
If/then rules for common scenarios:
- IF contractor → only unpaid leave
- IF balance < request → suggest alternatives, don't submit
- IF medical/FMLA mentioned → escalate to HR

## Tone
How to sound. Not "be professional" (useless). Instead:
- Warm but concise — no filler paragraphs
- Use emoji sparingly for status (✅ ⚠️) not decoration
- Numbers always include both days AND hours

## Output Format
Exact formats for key outputs (balance summary, submission summary, etc.)
```

### Time-Off Agent .md — Concrete Example

Here's the actual production-grade system prompt for our time-off agent:

```markdown
# Time-Off Assistant — System Prompt

## Identity
You are a time-off assistant for {{COMPANY}}. You help employees check leave
balances, plan time off, and submit requests through Workday. You are helpful,
accurate, and never take irreversible actions without explicit confirmation.

## Context
- Today: {{TODAY}}
- Employee: {{EMPLOYEE_NAME}} ({{EMPLOYEE_ID}})
- Type: {{EMPLOYEE_TYPE}} ({{SCHEDULE}})
- Manager: {{MANAGER_NAME}}
- Location: {{LOCATION}}

## Tools Available
1. get_employee_profile — Use on first interaction to load context
2. get_leave_balances — Use whenever balances are discussed
3. get_leave_types — Use to show what the employee is eligible for
4. check_date_conflicts — ALWAYS call before presenting a submission summary
5. get_company_holidays — Use when dates might include holidays
6. get_team_calendar — Use proactively when checking date feasibility
7. submit_time_off_request — ONLY after explicit user confirmation
8. get_time_off_requests — For status checks on existing requests

## Tool Ordering Rules
- NEVER call submit_time_off_request without first calling check_date_conflicts
- ALWAYS call get_leave_balances before presenting a submission summary
- Call get_company_holidays when any requested date range spans 3+ days

## Boundaries — Do Not Handle
- Medical leave / FMLA / ADA accommodations → "I can't handle medical leave
  requests. Please contact HR directly at {{HR_CONTACT}}."
- Payroll questions → "That's outside my scope. Reach out to payroll at
  {{PAYROLL_CONTACT}}."
- Other employees' balances → "I can only access your own leave information."
- Policy interpretation disputes → "I'd recommend discussing this with your
  HR business partner."
- Anything requiring Workday admin access → escalate

## Conversation Rules
1. Greet by first name on first message
2. Proactively show balances on first interaction
3. NEVER submit without showing a summary AND getting explicit confirmation
4. When dates include a company holiday, ALWAYS mention it and the PTO savings
5. When team coverage is thin, mention it as an FYI (not a blocker)
6. After submission, show: request ID, status, approver, expected timeline
7. For contractors: clearly state "unpaid" in every relevant message
8. For part-time: use their scheduled hours/day, not 8

## Decision Rules
- IF employee_type == "contractor" → only offer unpaid time off
- IF employee_type == "part-time" → use prorated hours in all calculations
- IF requested_hours > available_hours → explain shortfall, suggest alternatives
- IF date range includes holidays → exclude from PTO count, tell the user
- IF ≥2 team members OOO in same range → flag coverage concern
- IF user mentions "sick", "doctor", "not feeling well" → use sick leave type
- IF user mentions "personal", "floating" → use floating holiday type
- IF ambiguous ("I need time off") → ask for dates before proceeding

## Tone
- Warm, first-name basis, concise
- Use ✅ ⚠️ 📋 for status indicators
- Always show both days AND hours for any balance or request
- No corporate jargon — "you have 12 days" not "your accrued balance is..."

## Output Formats

### Balance Summary
• **[Leave Type]:** [X] days ([Y] hrs) available [pending note] [low warning]

### Submission Summary
📋 **Time Off Request Summary**
• **Type:** [leave type]
• **Dates:** [start] → [end]
• **Work days:** [X] days ([Y] hours)
• **Balance after:** [Z] days remaining
• **Approver:** [manager name]

Ready to submit?

### Confirmation
**Request submitted!** ✅
**Request ID:** [ID]
**Status:** Pending approval
**Routed to:** [manager name]
```

### The .md File Hierarchy for Multi-Agent Systems

When you have multiple agents, organize your prompts like this:

```
prompts/
  base.md              ← shared identity, company context, tone rules
  router.md            ← orchestration logic (imports base.md concepts)
  read-agent.md        ← query-only capabilities
  write-agent.md       ← mutation capabilities + confirmation rules
  escalation-rules.md  ← shared boundary/escalation definitions
```

Each specialized agent's .md file should:
1. Reference the shared identity from base.md
2. Define ONLY its own tools and decision rules
3. Explicitly state what it CANNOT do (so it delegates instead of guessing)

### CLAUDE.md Specifically (for Claude Code projects)

In the Claude Code ecosystem, `CLAUDE.md` is a special file that persists
instructions across sessions. For an agent project, use it to store:

```markdown
# CLAUDE.md — Agent Development Instructions

## Architecture
- Multi-agent: router → read-agent → write-agent
- Mock Workday layer in server/workday/mock-data.ts
- System prompts in server/agents/prompts.ts

## Development Rules
- Always run eval suite after changes: npm run eval
- Never merge if eval score drops below 95
- Mock data must be resettable (resetMockData function)

## Prompt Engineering Rules
- Test prompt changes against ALL eval categories, not just the one you're fixing
- Add a regression test case for every bug fix
- System prompts are in prompts.ts — keep them version-controlled
```

---

<a id="phase-2-design-the-tool-layer"></a>
## Phase 2: Design the Tool Layer

### The Tool Design Principles

**Principle 1: Tools should be atomic, not compound.**

```
❌ BAD:  submit_time_off(employee_id, dates, leave_type, auto_check_conflicts=true)
✅ GOOD: check_date_conflicts(employee_id, start, end)
         submit_time_off_request(employee_id, leave_type, start, end)
```

Why: The agent should decide whether to check conflicts, not have it hidden
inside another tool. This makes the agent's reasoning visible and auditable.

**Principle 2: Tools return data, not decisions.**

```
❌ BAD:  check_eligibility() → "Employee is eligible for PTO" (string)
✅ GOOD: get_leave_types() → [{id: "PTO", eligible: true}, ...] (structured data)
```

Why: The agent interprets. The tool reports. Mixing them makes the agent's
reasoning opaque and the tool harder to test independently.

**Principle 3: Every mutation tool should return the full new state.**

```
❌ BAD:  submit_request() → {success: true}
✅ GOOD: submit_request() → {request_id: "REQ-001", status: "pending",
         routed_to: "Jordan Park", balance_after: {days: 8, hours: 64}}
```

Why: The agent needs to report what happened, and shouldn't need a second
tool call just to see the result.

**Principle 4: Name tools for what they do, not how they work.**

```
❌ BAD:  workday_api_get_v2_absence_plans()
✅ GOOD: get_leave_balances()
```

The agent shouldn't know or care that this is Workday. If you swap to BambooHR
tomorrow, the agent's system prompt shouldn't change.

**Principle 5: Error responses should be agent-readable.**

```
❌ BAD:  {error: "403 FORBIDDEN", body: "<xml>...</xml>"}
✅ GOOD: {error: "not_authorized",
         message: "You can only view your own leave balances",
         suggestion: "Ask the employee to check their own balance"}
```

### Tool Inventory for Time-Off Agent

| Tool | Type | Risk | Needs Confirmation |
|---|---|---|---|
| get_employee_profile | Read | None | No |
| get_leave_types | Read | None | No |
| get_leave_balances | Read | None | No |
| get_time_off_requests | Read | None | No |
| check_date_conflicts | Read | None | No |
| get_company_holidays | Read | None | No |
| get_team_calendar | Read | Low (shows other employees) | No |
| submit_time_off_request | **Write** | **High** | **YES** |

The pattern: **reads are free, writes need gates.** This applies to every
agent system, not just time-off.

---

<a id="phase-3-single-vs-multi-agent"></a>
## Phase 3: Single Agent vs. Multi-Agent

### When to Use a Single Agent

Use one agent when:
- Tool count is ≤8
- All tools share the same authorization scope
- The conversation flow is linear (no branching delegation)
- Latency matters (each agent hop adds 1-3 seconds)

**The time-off agent is actually a single-agent use case in production.**
8 tools, one user's data, linear flow. The "multi-agent" architecture I
showed earlier is useful for LEARNING, but in production you'd likely run
one agent with all 8 tools.

### When to Use Multi-Agent

Use multiple agents when:
- **Different trust boundaries**: Agent A can read, Agent B can write
- **Different models**: Agent A needs Opus (complex reasoning), Agent B needs
  Haiku (fast classification)
- **Different tool sets that shouldn't mix**: An HR agent shouldn't have
  access to finance tools even if the orchestrator manages both
- **Parallel work**: Researching 5 things simultaneously
- **Separation of concerns at scale**: 50+ tools → no single agent can
  reliably choose among them

### Multi-Agent Topology Patterns

**Pattern 1: Router + Specialists**
```
User → Router → [Specialist A, Specialist B, Specialist C]
```
Best for: multiple distinct domains (HR + IT + Finance helpdesk)
Example: "Reset my password" → IT agent, "Check my PTO" → HR agent

**Pattern 2: Planner + Executor**
```
User → Planner (decides what to do) → Executor (does it with tools)
```
Best for: complex multi-step tasks where planning and execution should
be separated for safety
Example: data migration, multi-system provisioning

**Pattern 3: Chain (pipeline)**
```
User → Agent A → Agent B → Agent C → Response
```
Best for: sequential processing stages
Example: classify intent → extract entities → execute action → format response

**Pattern 4: Supervisor + Workers**
```
User → Supervisor → [Worker 1, Worker 2, ...] → Supervisor → Response
```
Best for: parallel research or analysis
Example: "Compare our PTO policy to 5 competitors" → 5 research agents → synthesis

### Decision Matrix

| Factor | Single Agent | Multi-Agent |
|---|---|---|
| Tools | ≤10 | >10 or different trust levels |
| Latency tolerance | <2s | >3s acceptable |
| Auth scopes | One | Multiple |
| Conversation complexity | Linear | Branching/parallel |
| Team ownership | One team | Multiple teams own different domains |

---

<a id="phase-4-the-loop-pattern"></a>
## Phase 4: The Loop Pattern

### What Are Loops in Agent Systems?

A "loop" is when the agent iterates — calling tools, evaluating results,
and deciding whether to continue or stop. Loops are the fundamental mechanism
that separates agents from single-shot LLM calls.

### The Three Types of Agent Loops

#### Loop Type 1: The Tool Loop (ReAct pattern)
**What**: Agent thinks → calls a tool → reads result → thinks again → calls
another tool → ... → responds.

**This is the default agent behavior.** When Claude uses tools, it's already
in a tool loop. You don't need to build this — the SDK handles it.

```
User: "I want to take July 1-3 off"
  Agent thinks: Need to check conflicts first
  → calls check_date_conflicts()
  → reads: July 3 is Independence Day
  Agent thinks: Should check balance too
  → calls get_leave_balances()
  → reads: 12 days available
  Agent thinks: Ready to present summary
  → responds with submission summary
```

**When to use**: Always. This IS agentic behavior.

**The key design choice**: How many tool calls to allow per turn?
- Too few (1-2): Agent can't do compound tasks
- Too many (unlimited): Agent might loop forever on errors
- Sweet spot: **Cap at 8-10 tool calls per turn** with a circuit breaker

#### Loop Type 2: The Conversation Loop
**What**: The outer loop of user message → agent response → user message →
agent response. The agent maintains state across turns.

```
Turn 1: User asks about balances → Agent shows balances
Turn 2: User picks dates → Agent checks conflicts, shows summary
Turn 3: User confirms → Agent submits
```

**When to use**: Any multi-turn conversation (which is most agent use cases).

**Key design decisions**:
- Session persistence: How long does context survive? (30 min timeout typical)
- Context compression: Summarize old turns to stay within token limits
- State recovery: What if the user comes back after 2 hours?

#### Loop Type 3: The Retry/Self-Correction Loop
**What**: Agent tries something, evaluates whether it worked, and tries
again if not.

```
Agent: Parses "next Tuesday" as 2026-06-10
Agent: Checks — wait, June 10 is a Wednesday
Agent: Re-parses as 2026-06-17 (actual next Tuesday)
Agent: Proceeds with corrected date
```

**When to use**: When tools can return errors or when the agent's first
interpretation might be wrong.

**Implementation pattern**:
```python
max_retries = 3
for attempt in range(max_retries):
    result = call_tool(params)
    if is_valid(result):
        return result
    # Agent re-reasons about the error and adjusts params
    params = agent_correct(params, result.error)
raise EscalationError("Could not complete after {max_retries} attempts")
```

**Critical guardrail**: Always cap retries. An uncapped retry loop is how
you get a $500 API bill from an agent stuck in an error loop at 3am.

### Loop Pattern: Autonomous Monitoring Loop

Beyond conversational loops, some agents run on schedules:

```
Every Monday 9am:
  → Check if any employee's PTO balance expires this quarter
  → Send proactive Slack message: "Heads up, you have 5 PTO days
    that expire Dec 31. Want to plan some time off?"
```

**When to use**: Proactive agents that don't wait for user input.

**Implementation**: Cron job → triggers agent → agent decides whether
to notify. The agent is the decision-maker, not the cron logic.

### Loop Anti-Patterns

| Anti-Pattern | Problem | Fix |
|---|---|---|
| Infinite tool loop | Agent calls the same tool repeatedly with same params | Detect duplicate calls, break after 2 |
| Unbounded retries | Agent retries a failing API 50 times | Cap at 3, then escalate |
| Context explosion | 20-turn conversation fills context window | Summarize after turn 8 |
| Reasoning spiral | Agent overthinks: "but what if..." for 10 paragraphs | Set max_tokens on reasoning |
| Premature exit | Agent stops after 1 tool call when it needed 3 | Ensure system prompt says "gather ALL needed info before responding" |

### Should You Use Loops? Decision Framework

```
Is the agent doing a ONE-SHOT task?
  → No loop needed. Single tool call, single response.

Is the agent doing a MULTI-STEP task in one turn?
  → Tool loop (ReAct). Let the SDK handle it. Cap at 8-10 calls.

Is the agent having a CONVERSATION?
  → Conversation loop. Manage session state. Set timeout.

Is the agent MONITORING or POLLING?
  → Autonomous loop. Cron + agent. Log every cycle.

Is the agent SELF-CORRECTING?
  → Retry loop inside the tool loop. Cap at 3 retries.
```

For the time-off agent specifically:
- **Tool loop**: Yes — balance check + conflict check + holiday check in one turn
- **Conversation loop**: Yes — multi-turn date negotiation
- **Retry loop**: Light — if date parsing fails, ask the user to clarify (don't guess)
- **Autonomous loop**: Future feature — "your PTO expires soon" notifications

---

<a id="phase-5-state-machines"></a>
## Phase 5: State Machines & Conversation Design

### Why State Machines Matter

Without a state machine, the agent relies purely on the LLM to track where
it is in the conversation. This works 95% of the time. The other 5% is
where the agent submits a request it shouldn't, skips confirmation, or
forgets what the user asked for.

A state machine gives you **deterministic guardrails around probabilistic
reasoning**.

### State Machine for Time-Off Agent

```
                    ┌──────────┐
                    │  START   │
                    └────┬─────┘
                         │ User's first message
                         ▼
                ┌────────────────┐
                │ PROFILE_LOADED │  ← Auto-load profile + balances
                └───────┬────────┘
                        │
            ┌───────────┼───────────┐
            ▼           ▼           ▼
     ┌──────────┐ ┌──────────┐ ┌──────────┐
     │ BALANCE  │ │  DATE    │ │  STATUS  │
     │ INQUIRY  │ │ PLANNING │ │  CHECK   │
     └────┬─────┘ └────┬─────┘ └────┬─────┘
          │             │             │
          │             ▼             │
          │    ┌────────────────┐     │
          │    │  PLAN_READY    │     │
          │    │  (summary shown│     │
          │    │   to user)     │     │
          │    └───────┬────────┘     │
          │            │              │
          │     ┌──────┴──────┐       │
          │     ▼             ▼       │
          │ ┌────────┐ ┌──────────┐   │
          │ │CONFIRMED│ │CANCELLED │   │
          │ └───┬────┘ └─────┬────┘   │
          │     │            │        │
          │     ▼            │        │
          │ ┌──────────┐     │        │
          │ │SUBMITTED │     │        │
          │ └───┬──────┘     │        │
          │     │            │        │
          ▼     ▼            ▼        ▼
        ┌─────────────────────────────────┐
        │           READY                  │  ← Ready for next request
        │  (can loop back to any inquiry)  │
        └──────────────────────────────────┘
```

### State Transition Rules

| From State | Trigger | To State | Actions |
|---|---|---|---|
| START | Any message | PROFILE_LOADED | Load profile, balances |
| PROFILE_LOADED | "balance" / "how many days" | BALANCE_INQUIRY | Show balances |
| PROFILE_LOADED | Dates detected | DATE_PLANNING | Check conflicts |
| PROFILE_LOADED | "pending" / "status" | STATUS_CHECK | Show requests |
| DATE_PLANNING | Sufficient balance + no blockers | PLAN_READY | Show summary |
| DATE_PLANNING | Insufficient balance | DATE_PLANNING | Suggest alternatives |
| PLAN_READY | "yes" / "confirm" / "submit" | CONFIRMED | — |
| PLAN_READY | "no" / "cancel" | CANCELLED | Clear pending |
| PLAN_READY | New dates mentioned | DATE_PLANNING | Re-plan |
| CONFIRMED | — | SUBMITTED | Call submit tool |
| Any terminal | New question | READY | Reset for next request |

### What the State Machine Enforces

1. `submit_time_off_request` tool is ONLY callable in CONFIRMED state
2. PLAN_READY requires that `check_date_conflicts` was called in DATE_PLANNING
3. CONFIRMED requires explicit user confirmation (not inferred)
4. Every state has a defined set of allowed tools (read tools always, write tools only in CONFIRMED)

---

<a id="phase-6-guardrails"></a>
## Phase 6: Guardrails

### The Guardrail Stack (from most to least critical)

#### Layer 1: Tool-Level Guardrails (server-side, non-bypassable)

These are enforced by the tool server, not the agent. The agent literally
cannot violate them.

```typescript
// In your tool executor:
function executeSubmitRequest(params, sessionState) {
  // GUARDRAIL: Cannot submit without confirmation flag
  if (!sessionState.userConfirmed) {
    return { error: "submission_blocked", reason: "User has not confirmed" }
  }

  // GUARDRAIL: Cannot submit if balance insufficient
  const balance = getBalance(params.employee_id, params.leave_type_id)
  if (balance.availableHours < params.totalHours) {
    return { error: "insufficient_balance", available: balance.availableHours }
  }

  // GUARDRAIL: Rate limit — max 5 submissions per day
  const todayCount = getTodaySubmissionCount(params.employee_id)
  if (todayCount >= 5) {
    return { error: "rate_limited", reason: "Maximum 5 submissions per day" }
  }

  // Only now actually submit
  return submitToWorkday(params)
}
```

**Why server-side**: The agent is a probabilistic system. It will occasionally
ignore system prompt instructions. Server-side guardrails are deterministic.

#### Layer 2: Prompt-Level Guardrails (system prompt, usually followed)

These are rules in the system prompt that the LLM usually follows:

```markdown
## Safety Rules
- NEVER call submit_time_off_request without showing a summary first
- NEVER assume confirmation — look for explicit "yes", "confirm", "submit"
- NEVER show another employee's leave balance
- NEVER interpret "sure" or "I guess" as strong confirmation for irreversible actions
```

Reliability: ~97-99% with a good model. Not 100%. That's why Layer 1 exists.

#### Layer 3: Output Guardrails (post-processing)

Check the agent's response before sending to the user:

```typescript
function sanitizeResponse(response: string, employeeId: string): string {
  // Strip any accidental PII leakage
  const otherEmployeePattern = /WD-\d{5}/g
  const matches = response.match(otherEmployeePattern)
  if (matches) {
    const otherIds = matches.filter(id => id !== employeeId)
    for (const id of otherIds) {
      response = response.replaceAll(id, '[REDACTED]')
    }
  }

  // Strip any raw JSON/XML that leaked from tool results
  response = response.replace(/```json[\s\S]*?```/g, '[data processed]')

  return response
}
```

#### Layer 4: Monitoring Guardrails (async, after-the-fact)

Flag sessions for human review based on patterns:

```typescript
const ALERT_RULES = [
  { name: 'high_tool_calls', check: (s) => s.toolCallCount > 15 },
  { name: 'rapid_submissions', check: (s) => s.submissionsInHour > 3 },
  { name: 'escalation_detected', check: (s) => s.response.includes('HR') },
  { name: 'error_rate_spike', check: (s) => s.errorCount > 3 },
]
```

### Guardrail Priority Matrix

| Risk | Guardrail Layer | Example |
|---|---|---|
| Financial/legal impact | Layer 1 (server-side) | Submission without balance check |
| Privacy violation | Layer 1 + Layer 3 | Leaking another employee's data |
| Bad UX / wrong info | Layer 2 (prompt) | Showing wrong balance |
| Edge case confusion | Layer 2 + Layer 4 | Agent misparses unusual date format |
| Brand/tone issues | Layer 3 (output filter) | Agent uses inappropriate language |

---

<a id="phase-7-human-in-the-loop"></a>
## Phase 7: Human-in-the-Loop

### The HITL Spectrum

```
Fully Autonomous ←————————————————————————→ Fully Manual
       │              │              │              │
  Agent decides   Agent proposes  Agent assists  Agent watches
  and executes    human approves  human decides  human does
       │              │              │              │
  "Submitted!"   "Ready to       "You have      "Here's the
                  submit?"        12 PTO days"   Workday link"
```

### Where Each Action Falls

| Action | HITL Level | Why |
|---|---|---|
| Check balance | Autonomous | Read-only, no risk |
| Show holidays | Autonomous | Read-only, no risk |
| Parse dates | Autonomous | Can be wrong, but user sees result |
| Check conflicts | Autonomous | Read-only, informational |
| **Submit request** | **Propose + Approve** | **Irreversible, affects payroll** |
| Interpret policy | **Assist** | Agent might be wrong, user decides |
| Medical/FMLA | **Escalate** | Out of scope entirely |

### Designing the Confirmation UX

Bad confirmation:
```
Agent: Done! I submitted your PTO request.
```

Mediocre confirmation:
```
Agent: Want me to submit this? (yes/no)
```

Good confirmation:
```
Agent: 📋 Time Off Request Summary
       • Type: PTO
       • Dates: Jul 14 → Jul 18 (5 days, 40 hours)
       • Balance after: 7 days remaining
       • Approver: Jordan Park

       Ready to submit? (This will notify Jordan for approval)
```

The difference: the good version gives the user enough information to
make an informed decision, and states the consequence.

### Escalation Paths

Design these BEFORE launch. Every agent needs a "get me a human" path.

```
Tier 1: Self-service (agent handles)
  → Balance checks, submissions, status queries

Tier 2: Guided escalation (agent hands off with context)
  → "I've created a ticket for HR with your question about
     FMLA eligibility. Ticket #HR-4521. They'll respond
     within 24 hours."

Tier 3: Immediate escalation (agent steps aside)
  → "This requires immediate HR attention. I'm connecting you
     to the HR hotline: (555) 123-4567"

Tier 4: Silent flag (agent continues, but flags for review)
  → Agent notices unusual pattern, logs alert, continues normally
```

---

<a id="phase-8-eval-framework"></a>
## Phase 8: Eval Framework

### The Eval Pyramid

```
                    ╱╲
                   ╱  ╲
                  ╱ E2E╲         ← Expensive, high-signal
                 ╱ Flows╲          Run: before every release
                ╱────────╲
               ╱ Behavior ╲      ← Moderate cost
              ╱  (multi-   ╲       Run: after prompt changes
             ╱   turn)      ╲
            ╱────────────────╲
           ╱  Single-Turn     ╲   ← Cheap, fast
          ╱   Assertions       ╲    Run: on every change
         ╱──────────────────────╲
        ╱   Tool Unit Tests      ╲  ← Cheapest
       ╱   (no LLM needed)       ╲   Run: on every commit
      ╱────────────────────────────╲
```

### What to Eval at Each Level

**Level 1: Tool Unit Tests** (no LLM, pure functions)
```typescript
test('countWorkDays excludes weekends', () => {
  expect(countWorkDays('2026-07-13', '2026-07-17', MON_FRI)).toBe(5)
  expect(countWorkDays('2026-07-11', '2026-07-13', MON_FRI)).toBe(2) // Sat-Mon
})

test('holiday detection excludes holidays from PTO', () => {
  const conflicts = checkDateConflicts('WD-10042', '2026-07-01', '2026-07-03')
  expect(conflicts.conflicts.some(c => c.type === 'holiday')).toBe(true)
})
```

**Level 2: Single-Turn Assertions** (agent response to one message)
```typescript
// From our eval framework:
{ userMessage: 'What are my balances?',
  assertions: [
    hasBalanceSummary(),
    containsNumber(12, 'shows 12 PTO days'),
    contains('sick', 'mentions sick leave'),
  ] }
```

**Level 3: Multi-Turn Behavior** (conversation sequences)
```typescript
// Verify the agent won't submit without confirmation
[
  { user: 'Submit PTO for July 28', assert: [asksForConfirmation()] },
  { user: 'Hmm let me think', assert: [notContains('submitted')] },
]
```

**Level 4: E2E Flows** (full user journeys)
```typescript
// Balance check → request → confirm → verify submission
[
  { user: 'Hi! What are my balances?', assert: [hasBalanceSummary()] },
  { user: 'Take Aug 18-21 off', assert: [hasSubmissionSummary()] },
  { user: 'Yes, go ahead', assert: [hasSubmissionConfirmation()] },
]
```

### Eval Metrics That Matter

| Metric | What it measures | Target |
|---|---|---|
| **Assertion pass rate** | Functional correctness | ≥98% |
| **Safety assertion pass rate** | Never-violate rules | **100%** |
| **Avg turns to completion** | Conversation efficiency | ≤4 |
| **Tool call efficiency** | Does agent call unnecessary tools? | ≤6 per request |
| **Hallucination rate** | Made-up numbers or policies | 0% |
| **Graceful degradation rate** | Proper handling of edge cases | ≥95% |

### When to Run Evals

| Trigger | What to run | Why |
|---|---|---|
| Every code change | Tool unit tests | Catch regressions in logic |
| Every prompt change | Full eval suite | Prompt changes have cascading effects |
| Before release | Full suite + manual spot-check | Final gate |
| Weekly (production) | Sample 50 real conversations | Catch drift |
| After model upgrade | Full suite | New model = new behavior |

---

<a id="phase-9-observability"></a>
## Phase 9: Observability & Debugging

### What to Log (Structured)

```json
{
  "session_id": "sess_abc123",
  "turn_number": 3,
  "timestamp": "2026-06-11T10:30:45Z",
  "employee_id": "WD-10042",
  "state": "DATE_PLANNING",

  "input": {
    "user_message": "I want to take July 14-18 off",
    "message_length": 35
  },

  "agent": {
    "tools_called": ["check_date_conflicts", "get_leave_balances", "get_company_holidays"],
    "tool_call_count": 3,
    "tool_errors": [],
    "total_tool_latency_ms": 45,
    "model": "claude-sonnet-4-6-20250514",
    "input_tokens": 2400,
    "output_tokens": 380,
    "llm_latency_ms": 1150
  },

  "output": {
    "response_length": 420,
    "state_after": "PLAN_READY",
    "contains_submission_summary": true,
    "awaiting_confirmation": true
  },

  "guardrails": {
    "pii_redacted": false,
    "scope_violation": false,
    "rate_limit_remaining": 4
  }
}
```

### Dashboard Metrics

**Real-time (ops dashboard):**
- Active sessions
- Avg response latency (p50, p95, p99)
- Tool error rate
- LLM error rate
- Rate limit hits

**Daily (product dashboard):**
- Sessions started / completed
- Task completion rate
- Avg turns to completion
- Top 10 user messages (understand what people ask)
- Escalation rate
- Submission success rate

**Weekly (quality dashboard):**
- Eval suite pass rate (automated)
- Sampled conversation quality scores (manual review)
- Hallucination incidents
- User-reported issues

### Debugging Workflow

When something goes wrong:

```
1. Find the session_id from the user report
2. Pull the full conversation log
3. For each turn, check:
   - What tools were called? Were the right ones chosen?
   - What did the tools return? Was the data correct?
   - What did the agent say? Did it misinterpret the tool results?
   - What state transition occurred? Was it correct?
4. Identify the failure point:
   - Tool returned wrong data → fix the tool/data layer
   - Agent chose wrong tool → fix the system prompt
   - Agent misinterpreted result → fix the system prompt
   - Agent ignored a guardrail → add server-side enforcement
5. Write an eval case that reproduces the bug
6. Fix → verify eval passes → deploy
```

---

<a id="phase-10-adoption"></a>
## Phase 10: Adoption & Iteration

### The Adoption Funnel

```
Awareness    → "I heard we have a PTO bot"
              How: Slack announcement, all-hands mention, HR email

Activation   → First successful interaction
              How: One-click SSO, no setup, quick-action buttons

Engagement   → Completes a full task (submits a request)
              How: Smart defaults, proactive suggestions, <4 turns

Retention    → Comes back for their next request
              How: Faster than Workday, remembers preferences

Advocacy     → Tells a coworker
              How: "It told me July 4 was a holiday and saved me a PTO day"
```

### Launch Strategy

**Week 1-2: Closed pilot (15-20 people)**
- Recruit from 2-3 teams
- Mix of FT/PT employees
- Daily Slack check-in: "Any issues with the PTO bot?"
- Watch every conversation (with consent)

**Week 3-4: Open pilot (one department)**
- Announce in department Slack channel
- Track activation rate (target: 50% try it)
- Track completion rate (target: 70% finish a task)

**Month 2: Expand + iterate**
- Fix top 3 failure modes from pilot data
- Add Slack integration if channel preference experiment says to
- Expand to 3-5 departments

**Month 3+: GA**
- Org-wide availability
- HR endorsement: "You can use the PTO bot for time-off requests"
- Deprecation path: remove redundant HR FAQ pages

### Metrics Dashboard

| Metric | Pilot Target | GA Target | How to Measure |
|---|---|---|---|
| Activation rate | ≥50% | ≥40% | Unique logins / employees with access |
| Task completion | ≥70% | ≥80% | Sessions ending in submission / sessions started |
| Avg turns | ≤5 | ≤4 | Mean turns for completed submissions |
| Return rate (30d) | ≥30% | ≥50% | Users with 2+ sessions in 30 days |
| Channel shift | ≥10% | ≥30% | Agent submissions / total Workday submissions |
| HR ticket deflection | — | ≥25% | PTO-related ticket volume pre/post |
| NPS | ≥50 | ≥70 | Post-submission survey |
| Error rate | ≤5% | ≤2% | Sessions with agent errors / total sessions |

### Iteration Priorities (based on what pilot data usually shows)

```
Priority 1: Fix what breaks
  → Date parsing failures, balance calculation errors, scope violations

Priority 2: Reduce turns
  → If avg turns > 4, the agent is asking too many questions
  → Add smarter defaults, proactive info loading

Priority 3: Add missing capabilities
  → "Can I cancel a request?" "Can I modify my dates?"
  → Users will ask for things you didn't build yet

Priority 4: Expand channels
  → Slack, Teams, mobile — wherever employees already are

Priority 5: Proactive features
  → "You have 5 PTO days expiring Dec 31"
  → "Long weekend opportunity: take Friday off for a 4-day weekend"
```

---

<a id="anti-patterns"></a>
## Anti-Patterns to Avoid

### 1. The "Just Add Another Agent" Trap
**Symptom**: 7 agents for a task that needs 1.
**Fix**: Start with 1 agent. Split only when you have a concrete reason
(trust boundary, model tier, team ownership).

### 2. The Infinite Context Trap
**Symptom**: Stuffing the entire employee handbook into the system prompt.
**Fix**: System prompt = decision rules. Reference docs = tool calls (RAG).
The agent should LOOK UP policies, not MEMORIZE them.

### 3. The "LLM Will Figure It Out" Trap
**Symptom**: No state machine, no guardrails, relying on the prompt for everything.
**Fix**: Deterministic logic for deterministic decisions. Use the LLM for
interpretation and conversation, not for date math or balance calculations.

### 4. The Eval Desert
**Symptom**: "It works when I test it manually."
**Fix**: If it's not in the eval suite, it will break silently. Write the
eval case BEFORE the feature, not after.

### 5. The Over-Automation Trap
**Symptom**: Agent submits requests, modifies requests, cancels requests,
all without meaningful confirmation.
**Fix**: Every destructive/irreversible action gets its own confirmation.
"Ready to submit?" is not a formality — it's a safety mechanism.

### 6. The "Works on Demo Data" Trap
**Symptom**: Beautiful demo, breaks on first real user.
**Fix**: Your mock data is a lie. Real data has: unicode names, negative
balances, employees in 15 time zones, managers who are also contractors,
leave types you've never heard of. Test with messy data early.

---

<a id="decision-checklist"></a>
## Decision Checklist

Use this for every new agent project:

```
□ Phase 0: Is an agent the right solution? (Litmus test passed?)
□ Phase 1: .md file written with identity, capabilities, boundaries, tone?
□ Phase 2: Tools designed? (Atomic, data-not-decisions, mutations separated?)
□ Phase 3: Single vs multi-agent decided? (Justified, not assumed?)
□ Phase 4: Loop patterns identified? (Tool loop caps, retry limits, session timeout?)
□ Phase 5: State machine designed? (States, transitions, tool permissions per state?)
□ Phase 6: Guardrails layered? (Server-side for safety, prompt for UX, output for PII?)
□ Phase 7: HITL levels defined? (What's autonomous, what needs confirmation, what escalates?)
□ Phase 8: Eval framework built? (All 4 levels, CI-integrated, regression cases for every bug?)
□ Phase 9: Observability in place? (Structured logs, dashboard, debugging workflow?)
□ Phase 10: Adoption plan? (Pilot → expand → GA, metrics at each stage?)
```

---

*This playbook is a living document. Update it as you build more agents and
discover new patterns.*
