/**
 * The orchestrator. Every message goes through route(): work out the intent
 * (session state, then rules, then a small model, then a default) and hand the
 * turn to the use case that owns it, with only that use case's tools.
 *
 * Two ways to run the use-case agents:
 *   claude  - Claude drives a tool-use loop over the HR-system + policy tools.
 *             Active when ANTHROPIC_API_KEY (or ANTHROPIC_AUTH_TOKEN) is set.
 *   offline - a deterministic planner that calls the identical tools in a fixed
 *             order, so the demo runs with no network and the trace is the same shape.
 *
 * Both share the propose -> confirm -> submit gate: nothing reaches the HR system or
 * the manager until the employee says yes.
 */
import Anthropic from '@anthropic-ai/sdk'
import * as db from '../workday/mock-data.js'
import { agentTools, executeDataTool } from '../workday/tools.js'
import { searchPolicies, policyRules } from '../policies/index.js'
import { fmt, fmtLong } from './planner.js'
import { assessParentalLeave, leaveDetails, type LeaveAssessment } from './leave.js'
import { coverageSummary, pendingSummary, findPending, decisionDraftText } from './manager.js'
import { SYSTEM_PROMPT } from './prompts.js'
import { classifyIntent, classifyByRules, describe, CONFIRM, CANCEL, LEAVE_INTENT, type Decision, type Agent, type IntentContext } from './intent.js'
import type {
  ChatMessage, Employee, PendingSubmission, TimeOffRequest, TraceStep, VacationOption, PolicySearchResult,
} from '../../shared/types.js'

interface Session {
  employeeId: string
  claudeHistory: Anthropic.MessageParam[]
  pending?: PendingSubmission
  lastOptions?: VacationOption[]
  leave?: { assessment: LeaveAssessment; stage: 'offered' | 'awaiting_date'; expectedDate?: string }
  pendingDecision?: { requestId: string; decision: 'approved' | 'denied'; note?: string }
  lastUserMessage: string
}

const sessions = new Map<string, Session>()
const MODEL = 'claude-opus-5'

export function agentMode(): 'claude' | 'offline' {
  return process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN ? 'claude' : 'offline'
}

function getSession(sessionId: string, employeeId: string): Session {
  if (!sessions.has(sessionId)) sessions.set(sessionId, { employeeId, claudeHistory: [], lastUserMessage: '' })
  return sessions.get(sessionId)!
}

export function clearAllSessions() {
  sessions.clear()
}

export function clearSession(sessionId: string) {
  sessions.delete(sessionId)
}


// ---------- shared propose / submit gate ----------

function propose(session: Session, emp: Employee, leaveTypeId: string, start: string, end: string, note?: string): { pending?: PendingSubmission; text: string; error?: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || end < start) {
    return { text: '', error: 'Dates must be YYYY-MM-DD with end on or after start.' }
  }
  const contractor = emp.employeeType === 'contractor'
  const typeId = contractor ? 'UNPAID' : leaveTypeId
  const typeName = db.getLeaveTypes(emp.employeeId).find(l => l.leaveTypeId === typeId)?.name ?? typeId
  const holidayCount = db.getCompanyHolidays(emp.location, Number(start.slice(0, 4))).filter(h => h.date >= start && h.date <= end).length
  const workDays = db.countWorkDays(start, end, emp.workSchedule.days) - holidayCount
  const hours = workDays * emp.workSchedule.hoursPerDay
  const conflicts = db.checkDateConflicts(emp.employeeId, start, end)
  const blocking = conflicts.conflicts.filter(c => c.type === 'existing_request' || c.type === 'blackout')
  if (blocking.length) return { text: '', error: blocking.map(b => b.description.replace(/\.?$/, '.')).join(' ') }
  if (workDays <= 0) return { text: '', error: 'Those dates contain no scheduled workdays.' }

  let balanceAfter = 0
  if (!contractor) {
    const bal = db.getLeaveBalances(emp.employeeId).find(b => b.leaveTypeId === typeId)
    if (!bal) return { text: '', error: `No ${typeName} balance on file.` }
    if (hours > bal.availableHours) {
      return { text: '', error: `You'd need ${workDays} days (${hours} hrs) of ${typeName} but only have ${bal.availableDays} days (${bal.availableHours} hrs) available. Want a shorter range, or to split it across ${typeName} and another leave type?` }
    }
    balanceAfter = (bal.availableHours - hours) / emp.workSchedule.hoursPerDay
  }

  const pending: PendingSubmission = {
    leaveTypeId: typeId, leaveTypeName: typeName, startDate: start, endDate: end,
    workDays, totalHours: hours, balanceAfter, approver: emp.manager.name, note,
  }
  session.pending = pending
  const coverage = conflicts.conflicts.find(c => c.type === 'team_coverage')
  const rules = policyRules(emp)
  const daysAhead = Math.round((new Date(start + 'T12:00:00').getTime() - new Date(new Date().toISOString().slice(0, 10) + 'T12:00:00').getTime()) / 86_400_000)
  const shortNotice = daysAhead < rules.noticeDays
  const text = [
    contractor ? `As a contractor, this would be unpaid time off.` : '',
    `**Request summary**`,
    `**Type:** ${typeName}`,
    `**Dates:** ${fmtLong(start)} to ${fmtLong(end)}`,
    `**Work days:** ${workDays} (${hours} hours)${holidayCount ? `, ${holidayCount} holiday${holidayCount > 1 ? 's' : ''} excluded` : ''}`,
    contractor ? `**Pay:** unpaid` : `**Balance after:** ${balanceAfter} days`,
    `**Approver:** ${emp.manager.name}`,
    coverage ? `\nHeads up: ${coverage.description.replace(/\d{4}-\d{2}-\d{2}/g, d => fmt(d))}.` : '',
    shortNotice ? `\nHeads up: this starts in ${daysAhead} day${daysAhead === 1 ? '' : 's'}, inside the ${rules.noticeDays}-day notice window [${rules.noticeSource}]. ${emp.manager.name} can still approve it.` : '',
    `\nReady to send this to ${emp.manager.name} for approval? Say yes to confirm.`,
  ].filter(Boolean).join('\n')
  return { pending, text }
}

function addDays(s: string, n: number): string {
  const d = new Date(s + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Draft a parental leave of absence from an assessment and a start date. */
function proposeLeave(session: Session, emp: Employee, start: string, expectedDate?: string): { pending?: PendingSubmission; text: string; error?: string } {
  const a = session.leave?.assessment
  if (!a) return { text: '', error: 'Assess parental leave first.' }
  if (!a.eligible) return { text: '', error: a.eligibilityNote }
  const today = new Date().toISOString().slice(0, 10)
  if (start < today) return { text: '', error: 'The start date is in the past. Give me a date from today onward.' }
  const end = addDays(start, a.entitlementWeeks * 7 - 1)
  const workDays = db.countWorkDays(start, end, emp.workSchedule.days)
  const daysAhead = Math.round((new Date(start + 'T12:00:00').getTime() - new Date(today + 'T12:00:00').getTime()) / 86_400_000)
  const details = leaveDetails(a, expectedDate)
  const pending: PendingSubmission = {
    leaveTypeId: 'PARENTAL', leaveTypeName: 'Parental Leave', startDate: start, endDate: end,
    workDays, totalHours: workDays * emp.workSchedule.hoursPerDay, balanceAfter: 0,
    approver: `${emp.manager.name} and HR`, details,
  }
  session.pending = pending
  const text = [
    `**Leave of absence summary**`,
    `**Type:** Parental leave (${a.country === 'IN' ? 'India' : 'US'})`,
    `**Entitlement:** ${a.entitlementWeeks} weeks, ${a.paidWeeks} paid at 100%${a.jobProtectionWeeks ? `, ${a.jobProtectionWeeks} weeks FMLA job protection concurrent` : ''}`,
    `**Dates:** ${fmtLong(start)} to ${fmtLong(end)}`,
    `**Expected return:** ${fmtLong(addDays(end, 1))}`,
    expectedDate ? `**Expected date:** ${fmtLong(expectedDate)}` : '',
    `**Attach:** ${a.documents.join('; ')}`,
    `**Routed to:** ${a.routedTo.join(' and ')}`,
    daysAhead < a.noticeDays ? `\nHeads up: this starts in ${daysAhead} days, inside the ${a.noticeDays}-day notice window [Leave of Absence Procedure / How to apply]. It can still be submitted as soon as practicable.` : '',
    `\nNo PTO is deducted. Ready to send this to ${emp.manager.name} and HR? Say yes to confirm.`,
  ].filter(Boolean).join('\n')
  return { pending, text }
}

/** One date from the employee: an expected date opens the pre-natal window; a start date drafts the leave. */
function leaveDateStep(session: Session, emp: Employee, date: string, lower: string, trace: TraceStep[]): { pending?: PendingSubmission; text: string } {
  const leave = session.leave!
  const a = leave.assessment
  const isDue = /due|deliver|expect/.test(lower)
  if (isDue && a.preNatalMaxWeeks) {
    const earliest = addDays(date, -a.preNatalMaxWeeks * 7)
    leave.stage = 'awaiting_date'
    leave.expectedDate = date
    trace.push({ tool: 'apply_rule', summary: `Expected date ${fmt(date)}: leave may begin up to ${a.preNatalMaxWeeks} weeks earlier, from ${fmt(earliest)} [India Leave Supplement / Maternity leave entitlement].` })
    return { text: `Your leave can begin as early as ${fmtLong(earliest)} (${a.preNatalMaxWeeks} weeks before ${fmtLong(date)}) or any day up to the delivery date. Which start date would you like?` }
  }
  if (isDue) leave.expectedDate = date
  const r = proposeLeave(session, emp, date, leave.expectedDate)
  trace.push({ tool: 'propose_leave_of_absence', input: { start_date: date }, summary: r.error ? `Could not draft: ${r.error}` : `Drafted ${a.entitlementWeeks} weeks of parental leave from ${fmt(date)}. Waiting for ${emp.name.split(' ')[0]} to confirm.` })
  return r.error ? { text: r.error } : { pending: r.pending, text: r.text }
}

function submit(session: Session, emp: Employee): { request?: TimeOffRequest; text: string; error?: string } {
  const p = session.pending
  if (!p) return { text: '', error: 'Nothing is drafted yet. Propose a request first.' }
  if (!CONFIRM.test(session.lastUserMessage)) return { text: '', error: 'The employee has not confirmed yet. Show the summary and ask before submitting.' }
  if (p.details) {
    const req = db.submitLeaveOfAbsence(emp.employeeId, p.startDate, p.endDate, p.details, 'Submitted via Time Off Assistant')
    session.pending = undefined
    session.leave = undefined
    return { request: req, text: `Sent. Request **${req.requestId}** is with ${emp.manager.name} to acknowledge coverage and with HR to confirm eligibility; HR replies within 5 business days. Please attach: ${p.details.documents.join('; ')}.` }
  }
  const req = db.submitTimeOffRequest(emp.employeeId, p.leaveTypeId, p.startDate, p.endDate, emp.workSchedule.hoursPerDay, p.note ?? 'Submitted via Time Off Assistant')
  session.pending = undefined
  session.lastOptions = undefined
  const text = `Sent. Request **${req.requestId}** is pending with ${emp.manager.name}, who has been notified at ${emp.manager.email}. You'll see the decision here as soon as it's made.`
  return { request: req, text }
}

// ---------- Claude tool-use loop ----------

let client: Anthropic | null = null
function getClient(): Anthropic {
  if (!client) client = new Anthropic()
  return client
}

function systemFor(emp: Employee): string {
  return SYSTEM_PROMPT
    .replaceAll('{{TODAY}}', fmtLong(new Date().toISOString().slice(0, 10)))
    .replaceAll('{{EMPLOYEE_NAME}}', emp.name)
    .replaceAll('{{EMPLOYEE_ID}}', emp.employeeId)
    .replaceAll('{{EMPLOYEE_TYPE}}', emp.employeeType)
    .replaceAll('{{DEPARTMENT}}', emp.department)
    .replaceAll('{{MANAGER_NAME}}', emp.manager.name)
}

async function runClaude(session: Session, emp: Employee, userMessage: string, tools: Anthropic.Tool[]): Promise<ChatMessage> {
  const trace: TraceStep[] = []
  let suggestions: VacationOption[] | undefined
  let pending: PendingSubmission | undefined
  let submitted: TimeOffRequest | undefined

  session.claudeHistory.push({ role: 'user', content: userMessage })
  const messages = session.claudeHistory

  for (let i = 0; i < 12; i++) {
    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: systemFor(emp),
      tools,
      messages,
    })
    messages.push({ role: 'assistant', content: response.content })

    if (response.stop_reason !== 'tool_use') {
      const text = response.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('\n').trim()
      return { role: 'assistant', content: text, timestamp: new Date().toISOString(), trace, suggestions, pending, submitted, mode: 'claude' }
    }

    const results: Anthropic.ToolResultBlockParam[] = []
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue
      const input = (block.input ?? {}) as Record<string, unknown>
      let payload: unknown
      if (block.name === 'assess_parental_leave') {
        const a = await assessParentalLeave(emp)
        session.leave = a.eligible ? { assessment: a, stage: 'offered' } : undefined
        trace.push(...a.trace)
        payload = { eligible: a.eligible, entitlementWeeks: a.entitlementWeeks, paidWeeks: a.paidWeeks, jobProtectionWeeks: a.jobProtectionWeeks, preNatalMaxWeeks: a.preNatalMaxWeeks, noticeDays: a.noticeDays, basis: a.basis, documents: a.documents, routedTo: a.routedTo, show_employee: a.answer }
      } else if (block.name === 'propose_leave_of_absence') {
        const r = proposeLeave(session, emp, String(input.start_date), input.expected_date ? String(input.expected_date) : undefined)
        pending = r.pending
        payload = r.error ? { error: r.error } : { drafted: r.pending, show_employee: r.text }
        trace.push({ tool: block.name, input, summary: r.error ? `Could not draft: ${r.error}` : `Drafted parental leave from ${fmt(String(input.start_date))}. Waiting for ${emp.name.split(' ')[0]} to confirm.` })
      } else if (block.name === 'propose_time_off_request') {
        const r = propose(session, emp, String(input.leave_type_id ?? 'PTO'), String(input.start_date), String(input.end_date), input.note ? String(input.note) : undefined)
        pending = r.pending
        payload = r.error ? { error: r.error } : { drafted: r.pending, show_employee: r.text }
        trace.push({ tool: block.name, input, summary: r.error ? `Could not draft: ${r.error}` : `Drafted ${r.pending!.leaveTypeName} ${fmt(r.pending!.startDate)} to ${fmt(r.pending!.endDate)}, ${r.pending!.workDays} days. Waiting for ${emp.name.split(' ')[0]} to confirm.` })
      } else if (block.name === 'submit_time_off_request') {
        const r = submit(session, emp)
        submitted = r.request
        payload = r.error ? { error: r.error } : { submitted: r.request, show_employee: r.text }
        trace.push({ tool: block.name, input, summary: r.error ? `Submit refused: ${r.error}` : `Submitted ${r.request!.requestId} to the HR system and notified ${emp.manager.name} (${emp.manager.email})` })
      } else {
        const out = executeDataTool(block.name, input, emp)
        payload = out.result
        trace.push({ tool: block.name, input, summary: out.summary })
        if (block.name === 'suggest_vacation_dates') {
          const plan = out.result as { options: VacationOption[] }
          suggestions = plan.options
          session.lastOptions = plan.options
        }
      }
      results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(payload) })
    }
    messages.push({ role: 'user', content: results })
  }
  return { role: 'assistant', content: 'I ran out of steps on that one. Could you rephrase?', timestamp: new Date().toISOString(), trace, mode: 'claude' }
}

// ---------- offline deterministic planner ----------

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  thanksgiving: 11, christmas: 12, xmas: 12,
}


/** Calendar date in the server's local time zone. toISOString() is UTC and rolls to the next day after ~8pm Eastern. */
function localIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function parseDates(text: string): { start: string; end: string } | null {
  const year = new Date().getFullYear()
  const pad = (n: number) => String(n).padStart(2, '0')
  const iso = text.match(/(\d{4}-\d{2}-\d{2})\s*(?:to|through|thru|-|–)\s*(\d{4}-\d{2}-\d{2})/)
  if (iso) return { start: iso[1], end: iso[2] }
  const single = text.match(/\b(\d{4}-\d{2}-\d{2})\b/)
  if (single) return { start: single[1], end: single[1] }
  const range = text.match(/\b([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?\s*(?:to|through|thru|-|–|until)\s*(?:([a-z]{3,9})\.?\s+)?(\d{1,2})(?:st|nd|rd|th)?\b/i)
  if (range && MONTHS[range[1].toLowerCase()]) {
    const m1 = MONTHS[range[1].toLowerCase()]
    const m2 = range[3] && MONTHS[range[3].toLowerCase()] ? MONTHS[range[3].toLowerCase()] : m1
    const y1 = m1 < new Date().getMonth() + 1 ? year + 1 : year
    const y2 = m2 < m1 ? y1 + 1 : y1
    return { start: `${y1}-${pad(m1)}-${pad(+range[2])}`, end: `${y2}-${pad(m2)}-${pad(+range[4])}` }
  }
  const wd = text.match(/\b(next|this|coming)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i)
  if (wd) {
    const names = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    const target = names.indexOf(wd[2].toLowerCase())
    const d = new Date()
    d.setDate(d.getDate() + 1)
    while (d.getDay() !== target) d.setDate(d.getDate() + 1)
    const s = localIso(d)
    return { start: s, end: s }
  }
  if (/\btomorrow\b/i.test(text)) {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    const s = localIso(d)
    return { start: s, end: s }
  }
  const one = text.match(/\b([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/i)
  if (one && MONTHS[one[1].toLowerCase()] && !/thanksgiving|christmas|xmas/i.test(one[1])) {
    const m = MONTHS[one[1].toLowerCase()]
    const y = m < new Date().getMonth() + 1 ? year + 1 : year
    const d = `${y}-${pad(m)}-${pad(+one[2])}`
    return { start: d, end: d }
  }
  return null
}

function parseDays(text: string): number | undefined {
  const m = text.match(/(\d+)\s*(?:work\s*)?days?\b/i)
  if (m) return Number(m[1])
  if (/two weeks|2 weeks|fortnight/i.test(text)) return 10
  if (/\ba week\b|one week|1 week|week off|week-long/i.test(text)) return 5
  if (/long weekend/i.test(text)) return 2
  return undefined
}

function parseMonth(text: string): number | undefined {
  for (const [k, v] of Object.entries(MONTHS)) if (new RegExp(`\\b${k}\\b`, 'i').test(text)) return v
  return undefined
}

function pickOption(text: string, options?: VacationOption[]): VacationOption | undefined {
  if (!options?.length) return undefined
  const num = text.match(/option\s*(\d)|\b(\d)\b|\b(first|second|third|1st|2nd|3rd)\b/i)
  if (num) {
    const idx = num[1] ?? num[2] ?? ({ first: '1', '1st': '1', second: '2', '2nd': '2', third: '3', '3rd': '3' } as Record<string, string>)[num[3]?.toLowerCase() ?? '']
    const o = options.find(x => String(x.rank) === idx)
    if (o) return o
  }
  if (/thanksgiving/i.test(text)) return options.find(o => o.holidaysIncluded.some(h => /thanksgiving/i.test(h)))
  if (/christmas|xmas|new year/i.test(text)) return options.find(o => o.holidaysIncluded.some(h => /christmas|new year/i.test(h)))
  const m = parseMonth(text)
  if (m) return options.find(o => Number(o.startDate.slice(5, 7)) === m)
  return undefined
}

function renderOptions(emp: Employee, plan: { options: VacationOption[]; notes: string[]; ptoAvailable: number }, policyHit?: PolicySearchResult): string {
  const first = emp.name.split(' ')[0]
  const lines: string[] = []
  if (emp.employeeType === 'contractor') lines.push(`${first}, as a contractor you don't accrue paid leave, so these would be unpaid days with ${emp.manager.name}'s approval.`)
  else lines.push(`${first}, you have ${plan.ptoAvailable} PTO days available.`)
  for (const n of plan.notes) lines.push(n)
  if (policyHit?.hits[0]) lines.push(`Policy check: ${policyHit.hits[0].text.split('\n')[0]} [${policyHit.hits[0].title} / ${policyHit.hits[0].heading}]`)
  if (plan.options.length === 0) {
    lines.push('\nI could not find a window that clears the notice rule, blackouts, and your balance. Tell me a specific range and I will check it.')
    return lines.join('\n')
  }
  lines.push('\nHere are the best windows I found:')
  for (const o of plan.options) {
    lines.push(`\n**Option ${o.rank}: ${fmt(o.startDate)} to ${fmt(o.endDate)}** (${o.ptoDays} PTO day${o.ptoDays > 1 ? 's' : ''}, ${o.totalDaysOff} days off)`)
    for (const r of o.reasons) lines.push(`- ${r}`)
  }
  const best = plan.options[0]
  lines.push(`\nMy pick is Option 1: ${best.totalDaysOff} days off for ${best.ptoDays} PTO day${best.ptoDays > 1 ? 's' : ''}${best.coverageOk ? ' with coverage intact' : ''}. Reply with an option number, or tell me when you'd rather go.`)
  return lines.join('\n')
}

async function runOffline(session: Session, emp: Employee, message: string): Promise<ChatMessage> {
  const trace: TraceStep[] = []
  const first = emp.name.split(' ')[0]
  const lower = message.toLowerCase()
  const now = new Date().toISOString()
  const reply = (content: string, extra: Partial<ChatMessage> = {}): ChatMessage =>
    ({ role: 'assistant', content, timestamp: now, trace, mode: 'offline', ...extra })
  const call = (tool: string, input: Record<string, unknown> = {}) => {
    const out = executeDataTool(tool, input, emp)
    trace.push({ tool, input, summary: out.summary })
    return out.result
  }

  // 1. Confirmation gate
  if (session.pending) {
    if (CONFIRM.test(lower) && !CANCEL.test(lower)) {
      const r = submit(session, emp)
      trace.push({ tool: 'submit_time_off_request', summary: r.error ?? `Submitted ${r.request!.requestId} to the HR system and notified ${emp.manager.name} (${emp.manager.email})` })
      return r.error ? reply(r.error) : reply(r.text, { submitted: r.request })
    }
    if (CANCEL.test(lower)) {
      session.pending = undefined
      trace.push({ tool: 'propose_time_off_request', summary: 'Draft discarded at the employee\'s request' })
      return reply(session.lastOptions ? 'No problem, I\'ve cancelled that draft. Want a different option, or new dates?' : 'No problem, I\'ve cancelled that draft. Tell me when you\'d like to go and I\'ll start again.')
    }
  }

  // 1a. Manager and HR steps: decisions, coverage, what is waiting
  const oversees = emp.role === 'manager' || emp.role === 'hr_admin'
  if (oversees && session.pendingDecision) {
    const d = session.pendingDecision
    if (CONFIRM.test(lower) && !CANCEL.test(lower)) {
      if (emp.role !== 'manager') { session.pendingDecision = undefined; return reply('Only the employee\'s manager can decide. HR confirms eligibility but does not approve leave.') }
      try {
        const req = db.decideRequest(d.requestId, d.decision, d.note)
        session.pendingDecision = undefined
        trace.push({ tool: 'decide_request', input: { request_id: d.requestId, decision: d.decision }, summary: `${d.decision === 'approved' ? 'Approved' : 'Denied'} ${req.requestId} for ${req.employeeName}; employee notified` })
        return reply(`${d.decision === 'approved' ? 'Approved' : 'Denied'}. ${req.employeeName} has been told${d.note ? ` with your reason: "${d.note}"` : ''}.${req.details ? ' HR will confirm eligibility and reply within 5 business days.' : ''}`)
      } catch (err) {
        session.pendingDecision = undefined
        return reply(err instanceof Error ? err.message : 'Could not record that decision.')
      }
    }
    if (CANCEL.test(lower)) {
      session.pendingDecision = undefined
      return reply('Discarded. Nothing was decided.')
    }
  }
  if (oversees && /\b(approve|accept|acknowledge|deny|reject|decline)\b/.test(lower) && !session.pending) {
    if (emp.role !== 'manager') return reply('Only the employee\'s manager can approve or deny. HR confirms eligibility; you can see every request under Org overview.')
    const decision: 'approved' | 'denied' = /\b(deny|reject|decline)\b/.test(lower) ? 'denied' : 'approved'
    const found = findPending(emp, message)
    trace.push({ tool: 'get_pending_approvals', summary: found.req ? `Matched ${found.req.requestId} (${found.req.employeeName})` : found.error ?? 'no match' })
    if (!found.req) return reply(found.error ?? 'Which request?')
    const noteMatch = message.match(/\b(?:because|since|reason:?)\s+(.+)$/i)
    const note = noteMatch ? noteMatch[1].trim().replace(/[.]+$/, '') : undefined
    if (decision === 'denied' && !note) {
      session.pendingDecision = undefined
      return reply(`What should ${found.req.employeeName.split(' ')[0]} be told? Say "deny ${found.req.employeeName.split(' ')[0]} because ..." and I'll draft it.`)
    }
    session.pendingDecision = { requestId: found.req.requestId, decision, note }
    trace.push({ tool: 'team_coverage', summary: `Checked coverage for ${found.req.requestId}` })
    return reply(decisionDraftText(emp, found.req, decision, note))
  }
  if (oversees && /coverage|who('s| is) (out|off)|team (calendar|out|off)|anyone (out|off)/.test(lower)) {
    return reply(coverageSummary(emp, trace))
  }
  if (oversees && /pending|waiting|queue|approvals?\b|what('s| is| do i have) (waiting|to approve)|requests? (waiting|to approve|to review)/.test(lower)) {
    return reply(pendingSummary(emp, trace))
  }

  // 1b. Parental leave: the agentic-RAG path
  // A fresh leave question re-runs the assessment; a date after an assessment is a follow-up, handled below.
  if (LEAVE_INTENT.test(lower) && !session.pending && !(session.leave && parseDates(message))) {
    const a = await assessParentalLeave(emp)
    trace.push(...a.trace)
    if (!a.eligible) return reply(a.answer)
    session.leave = { assessment: a, stage: 'offered' }
    const explicitDate = parseDates(message)
    if (explicitDate) {
      const r = leaveDateStep(session, emp, explicitDate.start, lower, trace)
      return reply(`${a.answer.split('\n\nWant me')[0]}\n\n${r.text}`, r.pending ? { pending: r.pending } : {})
    }
    return reply(a.answer)
  }
  // A new date while a leave draft is pending changes its start date.
  if (session.leave && session.pending?.details) {
    const explicitDate = parseDates(message)
    if (explicitDate) {
      const r = leaveDateStep(session, emp, explicitDate.start, lower, trace)
      return reply(r.text, r.pending ? { pending: r.pending } : {})
    }
  }
  if (session.leave && !session.pending) {
    const a = session.leave.assessment
    const explicitDate = parseDates(message)
    if (explicitDate) {
      const r = leaveDateStep(session, emp, explicitDate.start, lower, trace)
      return reply(r.text, r.pending ? { pending: r.pending } : {})
    }
    if (CONFIRM.test(lower) || /start|apply|request|begin/.test(lower)) {
      session.leave.stage = 'awaiting_date'
      return reply(`Sure. What date should the leave begin${a.preNatalMaxWeeks ? ` (it can start up to ${a.preNatalMaxWeeks} weeks before your expected delivery date)` : ''}? A date like "Nov 16" is fine.`)
    }
  }

  // 2. Picking one of the offered options
  const newAsk = /\b\d+\s*(work)?days?\b|vacation|\bbook|\bplan|\btrip\b|time off/.test(lower)
  const picked = newAsk ? undefined : pickOption(message, session.lastOptions)
  if (picked && !/balance|holiday|policy/.test(lower)) {
    const r = propose(session, emp, 'PTO', picked.startDate, picked.endDate)
    trace.push({ tool: 'propose_time_off_request', input: { start_date: picked.startDate, end_date: picked.endDate }, summary: r.error ? `Could not draft: ${r.error}` : `Drafted ${r.pending!.leaveTypeName} ${fmt(picked.startDate)} to ${fmt(picked.endDate)}, ${r.pending!.workDays} days. Waiting for ${first} to confirm.` })
    return r.error ? reply(r.error) : reply(r.text, { pending: r.pending })
  }

  // 3. Balances
  if (/balance|how much (pto|leave|time)|how many days|what do i have/.test(lower)) {
    const balances = call('get_leave_balances') as { leaveType: string; availableDays: number; availableHours: number; pendingRequestsHours: number }[]
    if (!Array.isArray(balances) || balances.length === 0) {
      return reply(`${first}, as a contractor you don't accrue paid leave. You can request unpaid time off, which still needs ${emp.manager.name}'s approval. Want me to find good dates?`)
    }
    const lines = balances.map(b => `- **${b.leaveType}:** ${b.availableDays} days (${b.availableHours} hrs) available${b.pendingRequestsHours ? `, ${b.pendingRequestsHours} hrs pending approval` : ''}`)
    const pendingReqs = call('get_time_off_requests', { status_filter: 'pending' }) as TimeOffRequest[]
    if (pendingReqs.length) lines.push(`\nPending: ${pendingReqs.map(r => `${r.leaveTypeName} ${fmt(r.startDate)} to ${fmt(r.endDate)} (${r.totalDays} days)`).join('; ')}`)
    return reply(`Here's where you stand, ${first}:\n${lines.join('\n')}\n\nWant me to find the best dates for a vacation?`)
  }

  // 4. Status of requests
  if (/status|pending request|my requests|existing request|did .* approve|approved yet/.test(lower)) {
    const reqs = call('get_time_off_requests') as TimeOffRequest[]
    if (!reqs.length) return reply("You don't have any time-off requests on file. Want to plan one?")
    return reply(`**Your requests:**\n${reqs.map(r => `- ${r.requestId}: ${r.leaveTypeName} ${fmt(r.startDate)} to ${fmt(r.endDate)} (${r.totalDays} days), ${r.status}${r.decisionNote ? ` ("${r.decisionNote}")` : ''}`).join('\n')}`)
  }

  // 5. Team calendar
  if (/who('s| is) (out|off)|team (calendar|out|off)|anyone (out|off)/.test(lower)) {
    const today = now.slice(0, 10)
    const end = new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10)
    const ooo = call('get_team_calendar', { start_date: today, end_date: end }) as { name: string; startDate: string; endDate: string; status: string }[]
    if (!ooo.length) return reply('Nobody on your team is out in the next 90 days.')
    return reply(`**Out in the next 90 days:**\n${ooo.map(o => `- ${o.name}: ${fmt(o.startDate)} to ${fmt(o.endDate)} (${o.status})`).join('\n')}`)
  }

  // 6. Vacation planning (before holidays, since "around the holidays" is a planning ask)
  const vacationIntent = /vacation|\bbook(ing)?\b|\bplan(ning)? (a|my|some|our|the|time|vacation|days)|\btrip\b|getaway|time off|days off|week off|take .* off|holiday break|\b\d+\s*(work)?days?\b|thanksgiving|christmas|xmas|new year|long weekend|a week off/.test(lower)
  const explicit = parseDates(message)
  if (vacationIntent || explicit) {
    if (explicit && !/best|suggest|recommend|when should/.test(lower)) {
      call('get_leave_balances')
      const policy = call('search_policies', { query: 'notice period for requesting time off, blackout periods' }) as PolicySearchResult
      const conflicts = call('check_date_conflicts', { start_date: explicit.start, end_date: explicit.end }) as { conflicts: { type: string; description: string }[] }
      const r = propose(session, emp, /sick/.test(lower) ? 'SICK' : /float/.test(lower) ? 'FLOAT' : 'PTO', explicit.start, explicit.end)
      trace.push({ tool: 'propose_time_off_request', input: { start_date: explicit.start, end_date: explicit.end }, summary: r.error ? `Could not draft: ${r.error}` : `Drafted ${r.pending!.leaveTypeName} ${fmt(explicit.start)} to ${fmt(explicit.end)}, ${r.pending!.workDays} days. Waiting for ${first} to confirm.` })
      if (r.error) {
        const isBlackout = /blackout/.test(r.error)
        const cite = isBlackout ? (call('search_policies', { query: 'blackout periods planning around blackouts' }) as PolicySearchResult) : policy
        const alt = isBlackout ? ' Want me to suggest the nearest clear week instead?' : ''
        return reply(`${r.error}${alt}${cite.hits[0] ? `\n\n[${cite.hits[0].title} / ${cite.hits[0].heading}]` : ''}`)
      }
      const notice = conflicts.conflicts.filter(c => c.type === 'holiday').map(c => c.description)
      return reply(`${notice.length ? notice.join('. ') + '.\n\n' : ''}${r.text}`, { pending: r.pending })
    }
    call('get_leave_balances')
    const policy = call('search_policies', { query: 'how much notice to request vacation, carryover cap, blackout periods' }) as PolicySearchResult
    const year = new Date().getFullYear()
    call('get_company_holidays', { year })
    const horizonStart = now.slice(0, 10)
    const horizonEnd = new Date(Date.now() + 200 * 86_400_000).toISOString().slice(0, 10)
    call('get_team_calendar', { start_date: horizonStart, end_date: horizonEnd })
    const days = parseDays(message)
    const month = parseMonth(message)
    const plan = call('suggest_vacation_dates', { days, month }) as { options: VacationOption[]; notes: string[]; ptoAvailable: number }
    session.lastOptions = plan.options
    return reply(renderOptions(emp, plan, policy), { suggestions: plan.options })
  }

  // 7. Holidays
  if (/holiday/.test(lower)) {
    const hol = call('get_company_holidays', { year: new Date().getFullYear() }) as { date: string; name: string }[]
    const upcoming = hol.filter(h => h.date >= now.slice(0, 10))
    return reply(`**Remaining ${new Date().getFullYear()} company holidays:**\n${upcoming.map(h => `- ${h.name}: ${fmtLong(h.date)}`).join('\n')}\n\nWant me to plan a vacation around one of these?`)
  }

  // 8. Policy question
  if (/policy|notice|carry ?over|blackout|allowed|rule|can i|how (long|far)|max(imum)?|consecutive|parental|sick/.test(lower)) {
    const r = call('search_policies', { query: message }) as PolicySearchResult
    if (!r.hits.length) {
      return reply('Nothing in the policies that apply to you covers that. HR can help.')
    }
    const h = r.hits[0]
    return reply(`${h.text}\n\n[${h.title} / ${h.heading}]`)
  }

  // 9. Greeting / help
  if (/^(hi|hello|hey|good (morning|afternoon)|help|what can you)/.test(lower)) {
    if (emp.employeeType === 'contractor') {
      return reply(`Hi ${first}. As a contractor you don't accrue paid leave, so any time off is unpaid and needs ${emp.manager.name}'s approval. I can still find the best dates and send the request. Try "I want to book a vacation".`)
    }
    return reply(`Hi ${first}. I can check your balances, find the best vacation dates, and send the request to ${emp.manager.name} for approval. Try "I want to book a vacation" or "5 days in November".`)
  }

  return reply(`I can help with:\n- "I want to book a vacation"\n- "What are my balances?"\n- "How much notice do I need?"\n- "Who's out on my team?"\n- "Status of my requests"`)
}

// ---------- routing ----------

// ---------- orchestrator: intent, then the use case that owns it ----------

const TOOLSETS: Record<Agent, string[]> = {
  time_off: ['get_leave_balances', 'search_policies', 'get_company_holidays', 'get_team_calendar', 'check_date_conflicts', 'suggest_vacation_dates', 'get_time_off_requests', 'propose_time_off_request', 'submit_time_off_request'],
  leave: ['search_policies', 'assess_parental_leave', 'propose_leave_of_absence', 'submit_time_off_request', 'get_time_off_requests'],
  manager: [],
  policy_search: [],
}

const AGENT_LABEL: Record<Agent, string> = {
  time_off: 'Time-off agent', leave: 'Parental leave agent', manager: 'Manager steps', policy_search: 'Policy search',
}

function toolsFor(agent: Agent): Anthropic.Tool[] {
  const names = new Set(TOOLSETS[agent])
  return agentTools.filter(t => names.has(t.name))
}

function intentContext(sessionId: string, message: string, employeeId?: string): IntentContext | null {
  const s = sessions.get(sessionId)
  const emp = db.employees[employeeId ?? s?.employeeId ?? '']
  if (!emp) return null
  return {
    role: emp.role,
    hasPendingDraft: !!s?.pending,
    pendingIsLeave: !!s?.pending?.details,
    hasPendingDecision: !!s?.pendingDecision,
    leaveAwaiting: !!s?.leave,
    datesMentioned: !!parseDates(message),
    optionPicked: !!(s?.lastOptions && pickOption(message, s.lastOptions)),
  }
}

/** Full decision: session state, rules, then the classifier when there is an API key. */
export async function route(sessionId: string, employeeId: string, message: string): Promise<Decision> {
  const ctx = intentContext(sessionId, message, employeeId)
  if (!ctx) return { intent: 'policy_question', agent: 'policy_search', how: 'default', reason: 'unknown employee' }
  return classifyIntent(ctx, message, agentMode() === 'claude')
}

/** Rules only, synchronous. Kept for the route check script. */
export function routesToAgent(sessionId: string, message: string, employeeId?: string): boolean {
  const ctx = intentContext(sessionId, message, employeeId)
    ?? { role: 'employee' as const, hasPendingDraft: false, pendingIsLeave: false, hasPendingDecision: false, leaveAwaiting: false, datesMentioned: false, optionPicked: false }
  const d = classifyByRules(ctx, message)
  return !!d && d.agent !== 'policy_search'
}

// ---------- entry point ----------

export async function chat(sessionId: string, employeeId: string, userMessage: string, decision?: Decision): Promise<ChatMessage> {
  const session = getSession(sessionId, employeeId)
  const emp = db.employees[employeeId]
  if (!emp) return { role: 'assistant', content: "I couldn't find your employee profile. Please contact HR.", timestamp: new Date().toISOString() }
  session.lastUserMessage = userMessage

  const d: Decision = decision
    ?? classifyByRules(intentContext(sessionId, userMessage, employeeId)!, userMessage)
    ?? { intent: 'time_off', agent: 'time_off', how: 'default', reason: 'sent straight to the agent' }
  const tools = toolsFor(d.agent)
  const step: TraceStep = { tool: 'orchestrator', summary: describe(d, tools.length || undefined) }
  const finish = (r: ChatMessage): ChatMessage => ({ ...r, agentLabel: AGENT_LABEL[d.agent], trace: [step, ...(r.trace ?? [])] })

  // Manager steps are deterministic in both modes: a decision is a write, and it should not depend on a model.
  if (d.agent === 'manager' || agentMode() !== 'claude') {
    if (agentMode() !== 'claude') await new Promise(resolve => setTimeout(resolve, 350 + Math.random() * 400))
    return finish(await runOffline(session, emp, userMessage))
  }

  try {
    return finish(await runClaude(session, emp, userMessage, tools))
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      console.error(`Claude API error ${err.status}: ${err.message}. Falling back to offline planner for this turn.`)
    } else {
      console.error('Claude loop failed, falling back to offline planner:', err)
    }
    session.claudeHistory.pop()
    const r = await runOffline(session, emp, userMessage)
    return finish({ ...r, mode: 'offline' })
  }
}
