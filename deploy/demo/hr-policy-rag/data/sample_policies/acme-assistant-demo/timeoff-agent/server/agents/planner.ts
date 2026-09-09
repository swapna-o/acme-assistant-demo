/**
 * Vacation date planner: scores candidate windows on PTO efficiency
 * (calendar days off per PTO day), team coverage, blackout and notice rules,
 * balance fit, and use-it-or-lose-it pressure. Deterministic, so the same
 * inputs always produce the same three options.
 */
import * as db from '../workday/mock-data.js'
import { policyRules } from '../policies/index.js'
import type { VacationOption } from '../../shared/types.js'

export interface PlanRequest {
  employeeId: string
  days?: number          // PTO workdays wanted
  earliest?: string      // YYYY-MM-DD
  latest?: string        // YYYY-MM-DD
  month?: number         // 1-12, prefer this month
  today?: string         // override for tests
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}
function addDays(s: string, n: number): string {
  const d = new Date(s + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return iso(d)
}
export function fmt(s: string): string {
  return new Date(s + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
export function fmtLong(s: string): string {
  return new Date(s + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

export function planVacation(req: PlanRequest): { options: VacationOption[]; notes: string[]; earliestStart: string; ptoAvailable: number } {
  const emp = db.employees[req.employeeId]
  if (!emp) throw new Error('Employee not found')
  const rules = policyRules(emp)
  const today = req.today ?? iso(new Date())
  const workDays = new Set(emp.workSchedule.days.map(d => db.DAY_INDEX[d]))
  const hpd = emp.workSchedule.hoursPerDay
  const contractor = emp.employeeType === 'contractor'

  const ptoBal = db.getLeaveBalances(req.employeeId).find(b => b.leaveTypeId === 'PTO')
  const ptoAvailable = contractor ? Number.POSITIVE_INFINITY : Math.floor(ptoBal?.availableHours ?? 0) / hpd
  const notes: string[] = []

  const earliestByNotice = addDays(today, rules.noticeDays)
  const earliest = req.earliest && req.earliest > earliestByNotice ? req.earliest : earliestByNotice
  const latest = req.latest ?? addDays(today, 200)
  notes.push(`Earliest start under the ${rules.noticeDays}-day notice rule is ${fmtLong(earliestByNotice)} (${rules.noticeSource}).`)

  const isWork = (d: string) => workDays.has(new Date(d + 'T12:00:00').getDay()) && !db.isHoliday(d, emp.location)
  const teamSize = db.teamOf(emp.manager.id).length
  const maxOutAllowed = Math.floor(teamSize * 0.4)   // 60% coverage rule

  const ownRequests = db.getTimeOffRequests(req.employeeId).filter(r => r.status === 'pending' || r.status === 'approved')
  const overlapsOwn = (s: string, e: string) => ownRequests.some(r => r.endDate >= s && r.startDate <= e)

  const lengths = req.days ? [Math.min(req.days, rules.maxConsecutiveWorkdays)] : [3, 5]
  if (req.days && req.days > rules.maxConsecutiveWorkdays) {
    notes.push(`Requests over ${rules.maxConsecutiveWorkdays} consecutive workdays need director approval, so options are capped at ${rules.maxConsecutiveWorkdays}.`)
  }

  const useItOrLoseIt = !contractor && Number.isFinite(ptoAvailable) ? Math.max(0, ptoAvailable - rules.carryoverCapDays) : 0
  if (useItOrLoseIt > 0) {
    notes.push(`You can carry only ${rules.carryoverCapDays} days into next year, so ${useItOrLoseIt} of your ${ptoAvailable} days are use-it-or-lose-it before Dec 31 (PTO Policy / Carryover).`)
  }

  const candidates: VacationOption[] = []
  for (const L of lengths) {
    if (!contractor && L > ptoAvailable) {
      notes.push(`A ${L}-day trip needs more PTO than the ${ptoAvailable} days you have available.`)
      continue
    }
    for (let start = earliest; start <= latest; start = addDays(start, 1)) {
      if (!isWork(start)) continue
      // Walk forward until L workdays are covered.
      let end = start
      let count = 0
      while (count < L) {
        if (isWork(end)) count++
        if (count < L) end = addDays(end, 1)
        if (end > addDays(latest, 14)) break
      }
      if (count < L) break
      if (overlapsOwn(start, end)) continue
      const bo = db.blackoutFor(start, end)
      if (bo) continue

      // Extend outward over adjacent non-work days for the "actually off" span.
      let offFrom = start
      while (!isWork(addDays(offFrom, -1))) offFrom = addDays(offFrom, -1)
      let offThrough = end
      while (!isWork(addDays(offThrough, 1))) offThrough = addDays(offThrough, 1)
      const totalDaysOff = Math.round((new Date(offThrough + 'T12:00:00').getTime() - new Date(offFrom + 'T12:00:00').getTime()) / 86_400_000) + 1

      const holidaysIncluded: string[] = []
      for (let d = offFrom; d <= offThrough; d = addDays(d, 1)) {
        const h = db.isHoliday(d, emp.location)
        if (h) holidaysIncluded.push(`${h.name} (${fmt(d)})`)
      }

      const ooo = db.getTeamCalendar(emp.manager.id, start, end, req.employeeId)
      let maxOut = 0
      for (let d = start; d <= end; d = addDays(d, 1)) {
        if (!isWork(d)) continue
        const outToday = ooo.filter(o => o.startDate <= d && o.endDate >= d).length
        maxOut = Math.max(maxOut, outToday)
      }
      const coverageOk = maxOut + 1 <= maxOutAllowed
      const teammatesOut = ooo.map(o => `${o.name} (${o.status}, ${fmt(o.startDate)} to ${fmt(o.endDate)})`)

      const efficiency = totalDaysOff / L
      let score = efficiency * 10
      score -= maxOut * 4
      if (!coverageOk) score -= 10
      if (useItOrLoseIt > 0 && end <= `${today.slice(0, 4)}-12-31`) score += 3
      if (req.month && Number(start.slice(5, 7)) === req.month) score += 6
      if (holidaysIncluded.length) score += 2
      // mild preference for sooner dates, so ties break toward the near term
      score -= (new Date(start + 'T12:00:00').getTime() - new Date(today + 'T12:00:00').getTime()) / 86_400_000 / 60

      const reasons: string[] = []
      reasons.push(`${L} PTO day${L === 1 ? '' : 's'} gets you ${totalDaysOff} days off, ${fmt(offFrom)} through ${fmt(offThrough)}.`)
      if (holidaysIncluded.length) reasons.push(`Includes ${holidaysIncluded.join(' and ')}, which don't count against PTO.`)
      if (ooo.length === 0) reasons.push('Nobody else on the team is out that week.')
      else reasons.push(`${teammatesOut.join('; ')} ${ooo.length === 1 ? 'is' : 'are'} out. Team would be at ${teamSize - maxOut - 1} of ${teamSize}${coverageOk ? ', which meets the 60% coverage minimum' : ', below the 60% coverage minimum'}.`)
      if (useItOrLoseIt > 0 && end <= `${today.slice(0, 4)}-12-31`) reasons.push('Falls before Dec 31, so it uses days you would otherwise forfeit.')

      candidates.push({
        rank: 0, startDate: start, endDate: end, ptoDays: L, totalDaysOff, offFrom, offThrough,
        holidaysIncluded, teammatesOut, coverageOk,
        balanceAfterDays: contractor ? 0 : ptoAvailable - L,
        reasons, score: Math.round(score * 10) / 10,
      })
    }
  }

  // Pick the top three non-overlapping windows, preferring distinct weeks.
  candidates.sort((a, b) => b.score - a.score)
  const picked: VacationOption[] = []
  for (const c of candidates) {
    if (picked.some(p => p.endDate >= addDays(c.startDate, -3) && p.startDate <= addDays(c.endDate, 3))) continue
    picked.push({ ...c, rank: picked.length + 1 })
    if (picked.length === 3) break
  }
  return { options: picked, notes, earliestStart: earliestByNotice, ptoAvailable: Number.isFinite(ptoAvailable) ? ptoAvailable : 0 }
}
