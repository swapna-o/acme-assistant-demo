/**
 * Manager-side steps in the Ask thread: what is waiting, what coverage looks
 * like, and drafting an approve/deny decision that the same yes-gate confirms.
 */
import * as db from '../workday/mock-data.js'
import { fmt, fmtLong } from './planner.js'
import type { Employee, TimeOffRequest, TraceStep } from '../../shared/types.js'

function addDays(s: string, n: number): string {
  const d = new Date(s + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Whose requests this person oversees: a manager's reports, or everyone for HR. */
export function scopeOf(emp: Employee): { team: Employee[]; requests: TimeOffRequest[]; label: string } {
  if (emp.role === 'hr_admin') {
    const team = Object.values(db.employees).filter(e => e.employeeId !== emp.employeeId)
    return { team, requests: db.getAllRequests().filter(r => r.employeeId !== emp.employeeId), label: 'the company' }
  }
  const team = db.teamOf(emp.employeeId)
  return { team, requests: db.getTeamRequests(emp.employeeId), label: 'your team' }
}

export interface CoverageNote {
  request: TimeOffRequest
  othersOut: string[]
  worstPresent: number
  roster: number
  ok: boolean
  worstDays: string[]
}

/** For one request, who else is out on its days and the thinnest day. */
export function coverageFor(emp: Employee, req: TimeOffRequest): CoverageNote {
  const { team, requests } = scopeOf(emp)
  const roster = emp.role === 'hr_admin'
    ? db.teamOf(db.employees[req.employeeId].manager.id).length
    : team.length
  const teammates = emp.role === 'hr_admin'
    ? db.teamOf(db.employees[req.employeeId].manager.id).map(e => e.employeeId)
    : team.map(e => e.employeeId)
  const live = requests.filter(r => r.requestId !== req.requestId && (r.status === 'pending' || r.status === 'approved') && teammates.includes(r.employeeId) && r.endDate >= req.startDate && r.startDate <= req.endDate)
  let worstPresent = roster - 1
  const worstDays: string[] = []
  const workDays = new Set(db.employees[req.employeeId].workSchedule.days.map(d => db.DAY_INDEX[d]))
  for (let d = req.startDate; d <= req.endDate; d = addDays(d, 1)) {
    if (!workDays.has(new Date(d + 'T12:00:00').getDay())) continue
    const out = live.filter(r => r.startDate <= d && r.endDate >= d).length
    const present = roster - 1 - out
    if (present < worstPresent) { worstPresent = present; worstDays.length = 0 }
    if (present === worstPresent && out > 0) worstDays.push(d)
  }
  return {
    request: req,
    othersOut: live.map(r => `${r.employeeName} (${r.status}, ${fmt(r.startDate)} to ${fmt(r.endDate)})`),
    worstPresent, roster, ok: worstPresent / roster >= 0.6, worstDays,
  }
}

function describe(n: CoverageNote): string {
  const r = n.request
  const what = r.details ? `${r.details.entitlementWeeks} weeks of parental leave` : `${r.leaveTypeName}, ${r.totalDays} day${r.totalDays === 1 ? '' : 's'}`
  const head = `- ${r.employeeName}: ${what}, ${fmt(r.startDate)} to ${fmt(r.endDate)} (${r.status}${r.requestId ? `, ${r.requestId}` : ''}).`
  if (n.othersOut.length === 0) return `${head} Nobody else is out; ${n.roster - 1} of ${n.roster} present.`
  const span = n.worstDays.length ? ` on ${fmt(n.worstDays[0])}${n.worstDays.length > 1 ? ` to ${fmt(n.worstDays[n.worstDays.length - 1])}` : ''}` : ''
  return `${head} Also out: ${n.othersOut.join('; ')}. Team would be at ${n.worstPresent} of ${n.roster}${span}, ${n.ok ? 'which meets' : 'below'} the 60% minimum.`
}

export function coverageSummary(emp: Employee, trace: TraceStep[]): string {
  const { requests, label, team } = scopeOf(emp)
  const pending = requests.filter(r => r.status === 'pending')
  const today = new Date().toISOString().slice(0, 10)
  const upcoming = requests.filter(r => r.status === 'approved' && r.endDate >= today).sort((a, b) => a.startDate.localeCompare(b.startDate))
  trace.push({ tool: 'get_pending_approvals', summary: `${pending.length} pending for ${label}: ${pending.map(r => `${r.employeeName} ${fmt(r.startDate)} to ${fmt(r.endDate)}`).join('; ') || 'none'}` })
  const notes = pending.map(r => coverageFor(emp, r))
  trace.push({ tool: 'team_coverage', summary: notes.length ? notes.map(n => `${n.request.employeeName}: ${n.worstPresent} of ${n.roster}${n.ok ? '' : ' (below minimum)'}`).join('; ') : 'nothing pending to check' })
  const lines: string[] = []
  lines.push(`Coverage for ${label}${emp.role === 'manager' ? ` (${team.length} on the roster)` : ''}:`)
  if (notes.length === 0) lines.push('- Nothing is waiting on you.')
  for (const n of notes) lines.push(describe(n))
  if (upcoming.length) lines.push(`\nAlready approved: ${upcoming.slice(0, 5).map(r => `${r.employeeName} ${fmt(r.startDate)} to ${fmt(r.endDate)}`).join('; ')}.`)
  const parental = notes.filter(n => n.request.details)
  if (parental.length) lines.push(`\nParental leave is an entitlement, so a thin week is a planning flag, not a reason to deny. HR confirms eligibility separately [Manager Guide: Team Coverage / Deciding between overlapping requests].`)
  if (pending.length) lines.push(`\nSay "approve ${pending[0].employeeName.split(' ')[0]}" or "deny ${pending[0].employeeName.split(' ')[0]} because ..." and I'll draft the decision for you to confirm.`)
  return lines.join('\n')
}

export function pendingSummary(emp: Employee, trace: TraceStep[]): string {
  const { requests, label } = scopeOf(emp)
  const pending = requests.filter(r => r.status === 'pending').sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))
  trace.push({ tool: 'get_pending_approvals', summary: `${pending.length} pending for ${label}` })
  if (!pending.length) return `Nothing is waiting on you for ${label}.`
  return [`**Waiting on you (${pending.length}):**`, ...pending.map(r => describe(coverageFor(emp, r))), `\nSay "approve ${pending[0].employeeName.split(' ')[0]}" or "deny ${pending[0].employeeName.split(' ')[0]} because ..." to draft a decision.`].join('\n')
}

/** Find the pending request a manager is talking about, by name, id, or the only one waiting. */
export function findPending(emp: Employee, text: string): { req?: TimeOffRequest; error?: string } {
  const { requests } = scopeOf(emp)
  const pending = requests.filter(r => r.status === 'pending')
  if (!pending.length) return { error: 'Nothing is pending, so there is nothing to decide.' }
  const id = text.match(/REQ-\d{4}-(?:IN-)?\d{3}/i)?.[0]
  if (id) {
    const r = pending.find(p => p.requestId.toLowerCase() === id.toLowerCase())
    return r ? { req: r } : { error: `${id} is not waiting on you.` }
  }
  const lower = text.toLowerCase()
  const byName = pending.filter(p => p.employeeName.toLowerCase().split(' ').some(part => part.length > 2 && lower.includes(part)))
  if (byName.length === 1) return { req: byName[0] }
  if (byName.length > 1) return { error: `${byName[0].employeeName} has more than one request waiting: ${byName.map(r => `${r.requestId} (${fmt(r.startDate)} to ${fmt(r.endDate)})`).join(', ')}. Which one?` }
  if (pending.length === 1) return { req: pending[0] }
  return { error: `Which one? Waiting: ${pending.map(r => `${r.employeeName} ${fmt(r.startDate)} to ${fmt(r.endDate)}`).join('; ')}.` }
}

export function decisionDraftText(emp: Employee, req: TimeOffRequest, decision: 'approved' | 'denied', note?: string): string {
  const n = coverageFor(emp, req)
  const what = req.details ? `${req.details.entitlementWeeks} weeks of parental leave` : `${req.leaveTypeName}, ${req.totalDays} day${req.totalDays === 1 ? '' : 's'}`
  return [
    `**Decision to confirm**`,
    `**${decision === 'approved' ? 'Approve' : 'Deny'}:** ${req.requestId}, ${req.employeeName}`,
    `**What:** ${what}, ${fmtLong(req.startDate)} to ${fmtLong(req.endDate)}`,
    `**Coverage:** ${n.othersOut.length ? `${n.worstPresent} of ${n.roster} present at the thinnest point, ${n.ok ? 'meets' : 'below'} the minimum` : `${n.roster - 1} of ${n.roster} present`}`,
    note ? `**Reason to the employee:** "${note}"` : '',
    req.details && decision === 'approved' ? `**Note:** you are acknowledging coverage; HR confirms eligibility.` : '',
    `\n${req.employeeName.split(' ')[0]} will be told right away. Say yes to confirm.`,
  ].filter(Boolean).join('\n')
}
