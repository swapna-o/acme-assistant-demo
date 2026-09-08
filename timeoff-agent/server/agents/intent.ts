/**
 * Orchestrator, step one: what does this message want, and which use case owns it?
 *
 * Three layers, cheapest first:
 *   session - a draft or a decision is waiting, so "yes" and "cancel" belong to it
 *   rules   - readable regular expressions for the phrasings the demo knows
 *   model   - a small, fast classifier, only when no rule matched
 * and a safe default: a question for the policy library.
 *
 * The decision carries its reason so it can be shown in the trace.
 */
import Anthropic from '@anthropic-ai/sdk'
import type { Role } from '../../shared/types.js'

export type Agent = 'policy_search' | 'time_off' | 'leave' | 'manager'
export type Intent = 'policy_question' | 'time_off' | 'parental_leave' | 'manager_action' | 'confirm' | 'cancel' | 'pick_option'

export interface IntentContext {
  role: Role
  hasPendingDraft: boolean
  pendingIsLeave: boolean
  hasPendingDecision: boolean
  leaveAwaiting: boolean
  datesMentioned: boolean
  optionPicked: boolean
}

export interface Decision {
  intent: Intent
  agent: Agent
  how: 'session' | 'rule' | 'model' | 'default'
  reason: string
}

export const CONFIRM = /\b(yes|yep|yeah|confirm|submit|send( it)?|go ahead|do it|sure|ok(ay)?|please do|approve)\b/i
export const CANCEL = /\b(no|cancel|never ?mind|nah|don't|dont|nope|stop|scrap)\b/i

export const TIMEOFF_INTENT = /vacation|\bbook(ing)?\b|\bplan(ning)? (a|my|some|our|the|time|vacation|days)|\btrip\b|getaway|time off|days? off|week off|take .* off|balance|how many days|holiday|pending|status|my requests?|\brequest\b|who('s| is) (out|off)|team (calendar|out|off)|anyone (out|off)|notice|blackout|sick day|floating|^\s*(hi|hello|hey|good (morning|afternoon)|help)\b|\d{4}-\d{2}-\d{2}|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b|next (week|monday|tuesday|wednesday|thursday|friday)|tomorrow|\b\d+ (work)?days?\b|thanksgiving|christmas|xmas|new year|long weekend|a week off/i
export const LEAVE_INTENT = /maternity|paternity|parental|pregnan|adopt|baby|leave of absence|expecting|due date/i
export const MANAGER_INTENT = /coverage|\b(approve|accept|acknowledge|deny|reject|decline)\b|pending|waiting|queue|approvals?\b|requests? (waiting|to approve|to review)|who('s| is) (out|off)|team (calendar|out|off)/i

const AGENT_NAME: Record<Agent, string> = {
  policy_search: 'policy search',
  time_off: 'the time-off agent',
  leave: 'the parental leave agent',
  manager: 'the manager steps',
}

function hit(re: RegExp, text: string): string {
  const m = text.match(re)
  return m ? `"${m[0].trim()}"` : ''
}

/** Layers one and two: session state, then rules. Null when nothing matched. */
export function classifyByRules(ctx: IntentContext, message: string): Decision | null {
  const oversees = ctx.role === 'manager' || ctx.role === 'hr_admin'
  if (oversees) {
    if (ctx.hasPendingDecision && (CONFIRM.test(message) || CANCEL.test(message))) {
      const yes = CONFIRM.test(message) && !CANCEL.test(message)
      return { intent: yes ? 'confirm' : 'cancel', agent: 'manager', how: 'session', reason: `a decision is drafted and this reads as ${yes ? 'a yes' : 'a cancel'}` }
    }
    if (MANAGER_INTENT.test(message)) return { intent: 'manager_action', agent: 'manager', how: 'rule', reason: `matched ${hit(MANAGER_INTENT, message)}` }
  }
  if (LEAVE_INTENT.test(message)) return { intent: 'parental_leave', agent: 'leave', how: 'rule', reason: `matched ${hit(LEAVE_INTENT, message)}` }
  if (ctx.leaveAwaiting && (ctx.datesMentioned || CONFIRM.test(message) || /start|apply|request|begin/i.test(message))) {
    return { intent: ctx.datesMentioned ? 'parental_leave' : 'confirm', agent: 'leave', how: 'session', reason: 'a leave assessment is open and this continues it' }
  }
  if (ctx.hasPendingDraft && (CONFIRM.test(message) || CANCEL.test(message))) {
    const yes = CONFIRM.test(message) && !CANCEL.test(message)
    return { intent: yes ? 'confirm' : 'cancel', agent: ctx.pendingIsLeave ? 'leave' : 'time_off', how: 'session', reason: `a draft is waiting and this reads as ${yes ? 'a yes' : 'a cancel'}` }
  }
  if (ctx.optionPicked) return { intent: 'pick_option', agent: 'time_off', how: 'session', reason: 'three options are on the table and this picks one' }
  if (TIMEOFF_INTENT.test(message)) return { intent: 'time_off', agent: 'time_off', how: 'rule', reason: `matched ${hit(TIMEOFF_INTENT, message)}` }
  return null
}

// ---------- layer three: a small model, only when the rules are silent ----------

const CLASSIFIER_MODEL = 'claude-haiku-4-5-20251001'
let client: Anthropic | null = null

const CLASSIFIER_PROMPT = `You label one message from an employee to an HR assistant. Reply with exactly one label and nothing else.

policy_question  - asks what a policy, handbook, benefit, or rule says, or whether something is allowed
time_off         - wants to book, plan, or check vacation, PTO, sick days, balances, or holidays
parental_leave   - maternity, paternity, parental, adoption, or a leave of absence
manager_action   - approving, denying, team coverage, or what is waiting on a manager

If it could be more than one, or you are unsure, answer policy_question.`

export async function classifyWithModel(message: string): Promise<Intent | null> {
  if (!client) client = new Anthropic({ timeout: 4000, maxRetries: 0 })
  const r = await client.messages.create({
    model: CLASSIFIER_MODEL, max_tokens: 12, system: CLASSIFIER_PROMPT,
    messages: [{ role: 'user', content: message.slice(0, 500) }],
  })
  const text = r.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('').trim().toLowerCase()
  const labels: Intent[] = ['policy_question', 'time_off', 'parental_leave', 'manager_action']
  return labels.find(l => text.startsWith(l)) ?? null
}

/** All three layers. `useModel` is false when there is no API key. */
export async function classifyIntent(ctx: IntentContext, message: string, useModel: boolean): Promise<Decision> {
  const ruled = classifyByRules(ctx, message)
  if (ruled) return ruled
  if (useModel) {
    try {
      const label = await classifyWithModel(message)
      const oversees = ctx.role === 'manager' || ctx.role === 'hr_admin'
      if (label === 'time_off') return { intent: 'time_off', agent: 'time_off', how: 'model', reason: 'no rule matched; the classifier read it as a time-off request' }
      if (label === 'parental_leave') return { intent: 'parental_leave', agent: 'leave', how: 'model', reason: 'no rule matched; the classifier read it as a leave question' }
      if (label === 'manager_action' && oversees) return { intent: 'manager_action', agent: 'manager', how: 'model', reason: 'no rule matched; the classifier read it as a manager action' }
      if (label) return { intent: 'policy_question', agent: 'policy_search', how: 'model', reason: 'no rule matched; the classifier read it as a policy question' }
    } catch (err) {
      console.error('Intent classifier unavailable, defaulting to policy search:', err instanceof Error ? err.message : err)
    }
  }
  return { intent: 'policy_question', agent: 'policy_search', how: 'default', reason: 'no rule matched; a question for the policy library by default' }
}

/** One line for the trace. Never names a document. */
export function describe(d: Decision, toolCount?: number): string {
  const label = d.intent.replace('_', ' ')
  const tools = toolCount ? `, ${toolCount} tools` : ''
  return `Intent: ${label} (${d.how}: ${d.reason}). Routed to ${AGENT_NAME[d.agent]}${tools}.`
}
