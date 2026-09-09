import type Anthropic from '@anthropic-ai/sdk'
import * as db from './mock-data.js'
import { searchPolicies } from '../policies/index.js'
import { planVacation, fmt } from '../agents/planner.js'
import type { Employee } from '../../shared/types.js'

const DATE = { type: 'string', description: 'YYYY-MM-DD' }

/** Tools exposed to Claude. propose/submit are handled by the orchestrator (they touch session state). */
export const agentTools: Anthropic.Tool[] = [
  {
    name: 'get_leave_balances',
    description: 'Current leave balances for the signed-in employee from the HR system: available, pending, and accrual info per leave type.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'search_policies',
    description: 'Search HR policy documents the employee is allowed to see. Returns the best-matching policy sections with citations, plus which documents were locked for this employee. Use it to check notice periods, carryover, blackout windows, and eligibility before proposing dates.',
    input_schema: {
      type: 'object' as const,
      properties: { query: { type: 'string', description: 'Natural-language question, e.g. "how much notice for vacation"' } },
      required: ['query'],
    },
  },
  {
    name: 'get_company_holidays',
    description: 'Company holidays for the employee location and a given year.',
    input_schema: { type: 'object' as const, properties: { year: { type: 'number' } }, required: ['year'] },
  },
  {
    name: 'get_team_calendar',
    description: 'Teammates already out (pending or approved) in a date range, so coverage can be judged.',
    input_schema: {
      type: 'object' as const,
      properties: { start_date: DATE, end_date: DATE },
      required: ['start_date', 'end_date'],
    },
  },
  {
    name: 'check_date_conflicts',
    description: 'Check specific dates for overlapping requests, holidays, blackout periods, and team coverage.',
    input_schema: {
      type: 'object' as const,
      properties: { start_date: DATE, end_date: DATE },
      required: ['start_date', 'end_date'],
    },
  },
  {
    name: 'suggest_vacation_dates',
    description: 'Rank candidate vacation windows for the employee using balance, policy rules (notice, blackout, carryover), holidays, and team coverage. Returns the top three options with reasons. Call this when the employee wants help choosing dates.',
    input_schema: {
      type: 'object' as const,
      properties: {
        days: { type: 'number', description: 'PTO workdays wanted. Omit to compare 3-day and 5-day trips.' },
        earliest: { ...DATE, description: 'Earliest acceptable start, YYYY-MM-DD' },
        latest: { ...DATE, description: 'Latest acceptable end, YYYY-MM-DD' },
        month: { type: 'number', description: 'Preferred month 1-12, if the employee named one' },
      },
      required: [],
    },
  },
  {
    name: 'get_time_off_requests',
    description: 'Existing time-off requests for the employee, optionally filtered by status.',
    input_schema: {
      type: 'object' as const,
      properties: { status_filter: { type: 'string', enum: ['pending', 'approved', 'denied', 'cancelled'] } },
      required: [],
    },
  },
  {
    name: 'assess_parental_leave',
    description: 'Work out the employee\'s parental leave entitlement: resolves their country, reads the global policy and the country supplement, reconciles them, checks eligibility from tenure, and pulls the leave-of-absence procedure. Returns weeks, pay, documents, routing, and citations. Call this for any maternity, paternity, parental, or leave-of-absence question.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'propose_leave_of_absence',
    description: 'Draft a parental leave of absence for the employee to confirm, after assess_parental_leave. Computes the end date from the entitlement. Does NOT submit.',
    input_schema: {
      type: 'object' as const,
      properties: { start_date: DATE, expected_date: { ...DATE, description: 'Expected due or delivery date, if known' } },
      required: ['start_date'],
    },
  },
  {
    name: 'propose_time_off_request',
    description: 'Draft a time-off request for the employee to confirm. Shows the summary (dates, PTO days, balance after, approver). Does NOT submit anything.',
    input_schema: {
      type: 'object' as const,
      properties: {
        leave_type_id: { type: 'string', description: 'PTO, SICK, FLOAT, or UNPAID for contractors' },
        start_date: DATE,
        end_date: DATE,
        note: { type: 'string', description: 'Optional note for the manager' },
      },
      required: ['leave_type_id', 'start_date', 'end_date'],
    },
  },
  {
    name: 'submit_time_off_request',
    description: 'Submit the drafted request to the HR system and notify the manager for approval. Only works after propose_time_off_request AND after the employee has explicitly confirmed in their latest message.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
]

export interface ToolOutcome {
  result: unknown
  summary: string
}

/** Stateless tools. The orchestrator handles propose/submit because they need the session. */
export function executeDataTool(name: string, input: Record<string, unknown>, emp: Employee): ToolOutcome {
  switch (name) {
    case 'get_leave_balances': {
      const balances = db.getLeaveBalances(emp.employeeId)
      if (balances.length === 0) {
        return { result: { employeeType: emp.employeeType, balances: [], note: 'Contractors have no paid leave; unpaid time off only.' },
          summary: `Checked HR-system balances: ${emp.name} is a contractor with no paid leave` }
      }
      const parts = balances.map(b => `${b.leaveType} ${b.availableDays} days${b.pendingRequestsHours ? ` (${b.pendingRequestsHours} hrs pending)` : ''}`)
      return { result: balances, summary: `Checked HR-system balances: ${parts.join(', ')}` }
    }
    case 'search_policies': {
      const r = searchPolicies(String(input.query ?? ''), emp)
      const top = r.hits[0] ? `${r.hits[0].title} / ${r.hits[0].heading}` : 'no matching section'
      return { result: r, summary: `Searched the ${r.visibleDocs.length} polic${r.visibleDocs.length === 1 ? 'y' : 'ies'} that apply to ${emp.name.split(' ')[0]}. Top match: ${top}` }
    }
    case 'get_company_holidays': {
      const year = Number(input.year) || new Date().getFullYear()
      const hol = db.getCompanyHolidays(emp.location, year)
      const today = new Date().toISOString().slice(0, 10)
      const upcoming = hol.filter(h => h.date >= today)
      return { result: hol, summary: `Pulled ${year} holidays for ${emp.location}: ${upcoming.length} still ahead (${upcoming.slice(0, 4).map(h => `${h.name} ${fmt(h.date)}`).join(', ')}${upcoming.length > 4 ? ', ...' : ''})` }
    }
    case 'get_team_calendar': {
      const s = String(input.start_date), e = String(input.end_date)
      const ooo = db.getTeamCalendar(emp.manager.id, s, e, emp.employeeId)
      return { result: ooo, summary: `Checked team calendar ${fmt(s)} to ${fmt(e)}: ${ooo.length === 0 ? 'nobody else out' : ooo.map(o => `${o.name} ${o.status} ${fmt(o.startDate)} to ${fmt(o.endDate)}`).join('; ')}` }
    }
    case 'check_date_conflicts': {
      const s = String(input.start_date), e = String(input.end_date)
      const c = db.checkDateConflicts(emp.employeeId, s, e)
      return { result: c, summary: `Checked ${fmt(s)} to ${fmt(e)} for conflicts: ${c.hasConflicts ? c.conflicts.map(x => x.type.replace('_', ' ')).join(', ') : 'none'}` }
    }
    case 'suggest_vacation_dates': {
      const plan = planVacation({
        employeeId: emp.employeeId,
        days: input.days ? Number(input.days) : undefined,
        earliest: input.earliest ? String(input.earliest) : undefined,
        latest: input.latest ? String(input.latest) : undefined,
        month: input.month ? Number(input.month) : undefined,
      })
      return { result: plan, summary: `Scored candidate windows from ${fmt(plan.earliestStart)} onward; kept ${plan.options.length}: ${plan.options.map(o => `${fmt(o.startDate)} to ${fmt(o.endDate)} (${o.ptoDays} PTO, ${o.totalDaysOff} off)`).join('; ')}` }
    }
    case 'get_time_off_requests': {
      const r = db.getTimeOffRequests(emp.employeeId, input.status_filter as string | undefined)
      return { result: r, summary: `Looked up ${emp.name.split(' ')[0]}'s requests: ${r.length === 0 ? 'none' : r.map(x => `${x.requestId} ${x.status} ${fmt(x.startDate)} to ${fmt(x.endDate)}`).join('; ')}` }
    }
    default:
      return { result: { error: `Unknown tool: ${name}` }, summary: `Unknown tool ${name}` }
  }
}
