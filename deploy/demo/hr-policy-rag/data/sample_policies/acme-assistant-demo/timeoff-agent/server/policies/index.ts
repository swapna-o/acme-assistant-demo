/**
 * Permission-aware policy search, the same pattern as the HR policy RAG
 * demo: check access on the whole shelf first, then rank only what the
 * principal may see, and cite the section the answer came from.
 */
import type { Employee } from '../../shared/types.js'
import type { PolicySearchResult, PolicyHit } from '../../shared/types.js'

export interface PolicyDoc {
  docId: string
  title: string
  allowedGroups: string[]   // empty = public
  body: string
}

export const POLICY_DOCS: PolicyDoc[] = [
  {
    docId: 'pto_policy',
    title: 'PTO Policy',
    allowedGroups: ['all-employees'],
    body: `# Paid Time Off (PTO) Policy

Applies to all regular full-time and part-time employees. Part-time balances are prorated to scheduled hours.

## Annual accrual
Full-time employees accrue 20 days of paid time off per year, accrued semi-monthly. PTO covers vacation and personal days.

## Carryover
You may carry over up to 5 unused PTO days into the next calendar year. Days beyond the cap are forfeited on December 31 and are not paid out.

## Requesting time off
Submit PTO requests at least two weeks (14 calendar days) in advance for planned absences. Your manager approves requests based on team coverage. Requests longer than 10 consecutive workdays require director approval in addition to your manager.

## Company holidays
Company holidays do not count against PTO. If a holiday falls inside your requested range, it is excluded from the PTO deduction automatically.

## Sick leave
Sick leave is tracked separately from PTO. Employees receive 10 sick days per year. Sick days do not carry over and are not paid out on departure.

## Payout on departure
Accrued but unused PTO (up to the carryover cap) is paid out in your final paycheck. Sick leave is not paid out.`,
  },
  {
    docId: 'blackout_periods',
    title: 'Engineering Blackout Periods',
    allowedGroups: ['all-employees', 'contractors'],
    body: `# Engineering Blackout Periods

## What a blackout period is
During a blackout period, discretionary time off is not approved for Engineering staff without director sign-off. Sick leave and emergencies are always allowed.

## Current blackout windows
Q4 release freeze: October 26 to October 30, 2026.
Annual planning week: January 4 to January 8, 2027.

## Planning around blackouts
Requests that overlap a blackout window are returned to the requester with a suggested alternative week.`,
  },
  {
    docId: 'contractor_time_off',
    title: 'Contractor Time Off',
    allowedGroups: ['contractors', 'managers'],
    body: `# Contractor Time Off

## Eligibility
Contractors do not accrue paid leave. Contractors may request unpaid time off, which requires the engagement manager's approval.

## Notice
Give at least one week (7 calendar days) of notice for planned unpaid time off so the team can plan coverage.`,
  },
  {
    docId: 'team_coverage',
    title: 'Manager Guide: Team Coverage',
    allowedGroups: ['managers'],
    body: `# Manager Guide: Team Coverage

## Minimum coverage
Keep at least 60% of the team available on any workday. For a team of five, that means no more than two people out on the same day.

## Deciding between overlapping requests
Approve in the order requests were received unless a request is tied to a fixed commitment (travel already booked, family event). Ask the later requester to shift by a week before denying outright.

## Response time
Respond to every time-off request within two business days. Employees plan travel around your answer.

## Use-it-or-lose-it
In Q4, nudge employees who hold more than five days above the carryover cap to schedule time off before December 31.`,
  },
  {
    docId: 'parental_leave',
    title: 'Parental Leave Policy',
    allowedGroups: ['all-employees'],
    body: `# Parental Leave Policy

## Eligibility
Applies to all regular full-time employees after 90 days of employment.

## Birthing parent
Birthing parents receive 16 weeks of fully paid parental leave, which may be taken continuously or intermittently within the first 12 months after birth.

## Non-birthing parent
Non-birthing parents and adoptive or foster parents receive 12 weeks of fully paid leave, taken within the first 12 months.

## Job protection
Your role, or an equivalent one, is protected for the duration of approved parental leave. Benefits continue uninterrupted during leave.

## How to apply
Notify HR at least 30 days before your expected leave start date when possible. HR will coordinate with payroll and your manager.

## Country supplements
Where local law provides more than this policy, the local entitlement applies and the company pays the difference. Employees based in India: see the India Leave Supplement. Employees based in the United States: see the US Leave Supplement. Contractors are not eligible for parental leave.

## Applying
Requests go through the Leave of Absence Procedure. Your manager acknowledges coverage and HR confirms eligibility.`,
  },
  {
    docId: 'parental_leave_india',
    title: 'India Leave Supplement',
    allowedGroups: ['employees-in'],
    body: `# India Leave Supplement (Maternity Benefit Act)

Applies to regular employees based in India. Where this supplement and the global policy differ, the higher entitlement applies.

## Maternity leave entitlement
Employees who give birth receive 26 weeks of paid maternity leave for the first two children, and 12 weeks for the third child onward, as provided by the Maternity Benefit Act. Up to 8 weeks may be taken before the expected delivery date.

## Eligibility
You must have worked for the company for at least 80 days in the 12 months before your expected delivery date.

## Pay during leave
Leave is paid at 100% of base salary for the full entitlement.

## Adoption and commissioning
Adopting mothers of a child under three months, and commissioning mothers, receive 12 weeks of paid leave from the date the child is handed over.

## Documents
A maternity certificate from a registered medical practitioner stating the expected delivery date.`,
  },
  {
    docId: 'parental_leave_us',
    title: 'US Leave Supplement',
    allowedGroups: ['employees-us'],
    body: `# US Leave Supplement (FMLA and state programs)

Applies to regular employees based in the United States.

## Company paid leave
Birthing parents receive 16 weeks of fully paid leave and non-birthing parents 12 weeks, as set out in the global policy.

## Job protection under FMLA
Employees with at least 12 months of service and 1,250 hours worked in the past year are entitled to up to 12 weeks of job-protected leave under the Family and Medical Leave Act. FMLA leave runs concurrently with company paid leave.

## State programs
Some states provide partial wage replacement through paid family leave programs. HR coordinates these so combined pay never drops below 100% of base during the company paid period.

## Documents
A medical certification form from your healthcare provider giving the expected due date, or placement papers for adoption or foster care.`,
  },
  {
    docId: 'leave_of_absence_procedure',
    title: 'Leave of Absence Procedure',
    allowedGroups: ['all-employees'],
    body: `# Leave of Absence Procedure

## How to apply
Submit the request at least 30 days before the leave starts, or as soon as practicable. Include the expected due date or placement date, the requested start date, and the supporting document named in your country supplement.

## Routing
The request goes to your manager to acknowledge coverage and to HR to confirm eligibility and entitlement. HR responds within 5 business days.

## During leave
Benefits continue uninterrupted. Your role, or an equivalent one, is held for the duration of approved leave.

## Returning
HR schedules a return-to-work check-in two weeks before your planned return.`,
  },
]

export function groupsFor(emp: Employee): string[] {
  const groups: string[] = []
  if (emp.employeeType === 'contractor') groups.push('contractors')
  else {
    groups.push('all-employees')
    groups.push(emp.location.startsWith('IN') ? 'employees-in' : 'employees-us')
  }
  if (emp.role === 'manager') groups.push('managers')
  if (emp.role === 'hr_admin') groups.push('hr-admins', 'managers')
  return groups
}

export function canSee(doc: PolicyDoc, groups: string[]): boolean {
  if (doc.allowedGroups.length === 0) return true
  if (groups.includes('hr-admins')) return true
  return doc.allowedGroups.some(g => groups.includes(g))
}

const STOP = new Set('a an and are as at be by can do does for from how i in into is it many much my of on or per s t the to we what when who year you your'.split(' '))

const SYNONYMS: Record<string, string[]> = {
  vacation: ['pto', 'time', 'off', 'leave'],
  holiday: ['holiday', 'holidays'],
  notice: ['advance', 'notice', 'requesting'],
  book: ['request', 'requesting', 'submit'],
  carryover: ['carry', 'carryover', 'forfeited', 'cap'],
  coverage: ['coverage', 'available', 'team'],
  blackout: ['blackout', 'freeze'],
  contractor: ['contractor', 'contractors', 'unpaid'],
  balance: ['accrue', 'accrual', 'days'],
  maternity: ['maternity', 'parental', 'birth', 'leave'],
  paternity: ['parental', 'non', 'birthing', 'leave'],
  pregnant: ['maternity', 'parental', 'delivery'],
  india: ['india', 'supplement', 'maternity'],
  us: ['us', 'supplement', 'fmla'],
  apply: ['apply', 'procedure', 'submit', 'request'],
}

function terms(text: string): string[] {
  const words = text.toLowerCase().match(/[a-z0-9]+/g) ?? []
  const out = new Set<string>()
  for (const w of words) {
    if (STOP.has(w)) continue
    out.add(w)
    for (const s of SYNONYMS[w] ?? []) out.add(s)
  }
  return [...out]
}

function sections(doc: PolicyDoc): { heading: string; text: string }[] {
  const out: { heading: string; text: string }[] = []
  let heading = doc.title
  let buf: string[] = []
  for (const line of doc.body.split('\n')) {
    if (line.startsWith('## ')) {
      if (buf.join('').trim()) out.push({ heading, text: buf.join('\n').trim() })
      heading = line.slice(3).trim()
      buf = []
    } else if (!line.startsWith('# ')) {
      buf.push(line)
    }
  }
  if (buf.join('').trim()) out.push({ heading, text: buf.join('\n').trim() })
  return out
}

export function searchPolicies(query: string, emp: Employee, topK = 3): PolicySearchResult {
  const groups = groupsFor(emp)
  const visible = POLICY_DOCS.filter(d => canSee(d, groups))
  const locked = POLICY_DOCS.filter(d => !canSee(d, groups))
  const q = terms(query)

  const hits: PolicyHit[] = []
  for (const doc of visible) {
    for (const s of sections(doc)) {
      const sWords = new Set((s.heading + ' ' + s.text).toLowerCase().match(/[a-z0-9]+/g) ?? [])
      const overlap = q.filter(t => sWords.has(t)).length
      if (overlap === 0) continue
      hits.push({ docId: doc.docId, title: doc.title, heading: s.heading, text: s.text, score: overlap / Math.sqrt(q.length || 1) })
    }
  }
  hits.sort((a, b) => b.score - a.score)
  return {
    query,
    hits: hits.slice(0, topK),
    visibleDocs: visible.map(d => d.title),
    lockedDocs: locked.map(d => d.title),
  }
}

/** Structured policy facts the planner relies on; sourced from the docs above. */
export function policyRules(emp: Employee) {
  const contractor = emp.employeeType === 'contractor'
  return {
    noticeDays: contractor ? 7 : 14,
    maxConsecutiveWorkdays: 10,
    carryoverCapDays: 5,
    noticeSource: contractor ? 'Contractor Time Off / Notice' : 'PTO Policy / Requesting time off',
  }
}
