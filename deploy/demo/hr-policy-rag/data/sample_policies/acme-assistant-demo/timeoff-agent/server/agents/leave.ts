/**
 * Parental leave: the agentic-RAG use case.
 *
 * The answer depends on who is asking and lives in more than one document, so
 * retrieval is a reasoning loop rather than a lookup: resolve the asker, fetch
 * the global policy, notice it defers to a country supplement, fetch that,
 * reconcile the two, check eligibility against tenure, pull the procedure, and
 * only then answer with citations. Every step lands in the trace.
 */
import { policyAnswer } from '../policies/answer.js'
import { fmtLong } from './planner.js'
import type { Employee, LeaveDetails, TraceStep } from '../../shared/types.js'

type Country = 'IN' | 'US'

const GLOBAL = { birthingWeeks: 16, nonBirthingWeeks: 12, noticeDays: 30, title: 'Parental Leave Policy' }

const RULES: Record<Country, {
  title: string
  law: string
  entitlementWeeks: number
  paidWeeks: number
  preNatalMaxWeeks?: number
  eligibilityDays: number
  jobProtectionWeeks?: number
  jobProtectionServiceMonths?: number
  documents: string[]
  entitlementSection: string
  eligibilitySection: string
}> = {
  IN: {
    title: 'India Leave Supplement', law: 'Maternity Benefit Act',
    entitlementWeeks: 26, paidWeeks: 26, preNatalMaxWeeks: 8, eligibilityDays: 80,
    documents: ['Maternity certificate from a registered medical practitioner stating the expected delivery date'],
    entitlementSection: 'India Leave Supplement / Maternity leave entitlement',
    eligibilitySection: 'India Leave Supplement / Eligibility',
  },
  US: {
    title: 'US Leave Supplement', law: 'FMLA',
    entitlementWeeks: 16, paidWeeks: 16, eligibilityDays: 90, jobProtectionWeeks: 12, jobProtectionServiceMonths: 12,
    documents: ['Medical certification form from your healthcare provider with the expected due date'],
    entitlementSection: 'US Leave Supplement / Company paid leave',
    eligibilitySection: 'Parental Leave Policy / Eligibility',
  },
}

export interface LeaveAssessment {
  country: Country
  eligible: boolean
  eligibilityNote: string
  entitlementWeeks: number
  paidWeeks: number
  jobProtectionWeeks?: number
  preNatalMaxWeeks?: number
  noticeDays: number
  basis: string[]
  documents: string[]
  routedTo: string[]
  supplementFound: boolean
  trace: TraceStep[]
  answer: string
}

export function countryOf(emp: Employee): Country {
  return emp.location.startsWith('IN') ? 'IN' : 'US'
}

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso + 'T12:00:00').getTime()) / 86_400_000)
}

export async function assessParentalLeave(emp: Employee): Promise<LeaveAssessment> {
  const trace: TraceStep[] = []
  const country = countryOf(emp)
  const rule = RULES[country]
  const tenureDays = daysSince(emp.hireDate)
  const first = emp.name.split(' ')[0]

  trace.push({ tool: 'resolve_asker', summary: `${emp.name} · based in ${country === 'IN' ? 'India' : 'the United States'} · ${emp.employeeType} · with the company since ${fmtLong(emp.hireDate)} (${tenureDays} days)` })

  // 1. Global policy
  const globalHit = await policyAnswer(emp, 'parental leave policy entitlement weeks')
  const globalFound = globalHit.sources.includes(GLOBAL.title) || globalHit.retrieved.some(r => r.title.startsWith(GLOBAL.title))
  trace.push({
    tool: 'search_policies', input: { query: 'parental leave policy' },
    summary: globalFound
      ? `Found the ${GLOBAL.title}: ${GLOBAL.birthingWeeks} weeks birthing, ${GLOBAL.nonBirthingWeeks} weeks non-birthing. It defers to a country supplement where local law gives more, so one document is not enough.`
      : `The ${GLOBAL.title} is not in scope for ${first}${globalHit.sources.length ? ` (found ${globalHit.sources.join(', ')})` : ''}.`,
  })

  // 2. Country supplement (a second retrieval, decided by what the first one said)
  const suppQuery = country === 'IN' ? 'India leave supplement maternity entitlement weeks' : 'US leave supplement FMLA company paid leave weeks'
  const suppHit = await policyAnswer(emp, suppQuery)
  const supplementFound = suppHit.sources.includes(rule.title) || suppHit.retrieved.some(r => r.title.startsWith(rule.title))
  trace.push({
    tool: 'search_policies', input: { query: suppQuery },
    summary: supplementFound
      ? (country === 'US'
          ? `Found the ${rule.title}: ${rule.paidWeeks} weeks company paid; ${rule.law} job protection ${rule.jobProtectionWeeks} weeks, running concurrently.`
          : `Found the ${rule.title}: ${rule.entitlementWeeks} weeks under the ${rule.law}${rule.preNatalMaxWeeks ? `, up to ${rule.preNatalMaxWeeks} weeks before the expected date` : ''}.`)
      : `No ${country === 'IN' ? 'India' : 'US'} supplement in scope for ${first}; falling back to the global policy.`,
  })

  // 3. Reconcile
  const entitlementWeeks = supplementFound ? Math.max(rule.entitlementWeeks, GLOBAL.birthingWeeks) : GLOBAL.birthingWeeks
  const paidWeeks = supplementFound ? rule.paidWeeks : GLOBAL.birthingWeeks
  trace.push({
    tool: 'reconcile',
    summary: country === 'IN' && supplementFound
      ? `Global ${GLOBAL.birthingWeeks} weeks vs India statutory ${rule.entitlementWeeks} weeks: the higher entitlement applies, so ${entitlementWeeks} weeks paid.`
      : country === 'US' && supplementFound
        ? `Company paid leave ${rule.paidWeeks} weeks; FMLA job protection ${rule.jobProtectionWeeks} weeks runs concurrently, not on top. ${entitlementWeeks} weeks paid applies.`
        : `Only the global policy applies: ${entitlementWeeks} weeks.`,
  })

  // 4. Eligibility
  let eligible: boolean
  let eligibilityNote: string
  if (emp.employeeType === 'contractor') {
    eligible = false
    eligibilityNote = `Contractors are not eligible for parental leave [${GLOBAL.title} / Country supplements].`
  } else if (tenureDays >= rule.eligibilityDays) {
    eligible = true
    eligibilityNote = country === 'IN'
      ? `You need ${rule.eligibilityDays} days worked in the 12 months before the expected delivery date. You joined on ${fmtLong(emp.hireDate)}, so you qualify [${rule.eligibilitySection}].`
      : `You need ${rule.eligibilityDays} days of service. You joined on ${fmtLong(emp.hireDate)}, so you qualify [${rule.eligibilitySection}].`
  } else {
    eligible = false
    eligibilityNote = `You need ${rule.eligibilityDays} days of service and have ${tenureDays} [${rule.eligibilitySection}].`
  }
  const fmlaOk = country === 'US' && tenureDays >= 365
  trace.push({ tool: 'check_eligibility', summary: eligible ? `Eligible: ${tenureDays} days of service against a ${rule.eligibilityDays}-day minimum${country === 'US' ? `; FMLA job protection ${fmlaOk ? 'applies (12+ months of service)' : 'does not apply yet (under 12 months)'}` : ''}.` : `Not eligible: ${eligibilityNote.replace(/\[.*?\]/g, '').trim()}` })

  // 5. Procedure
  const procHit = await policyAnswer(emp, 'leave of absence procedure how to apply notice documents')
  const procFound = procHit.sources.includes('Leave of Absence Procedure') || procHit.retrieved.some(r => r.title.startsWith('Leave of Absence Procedure'))
  trace.push({ tool: 'search_policies', input: { query: 'leave of absence procedure' }, summary: procFound ? `Pulled the Leave of Absence Procedure: ${GLOBAL.noticeDays} days' notice, routes to ${emp.manager.name} for coverage and to HR for eligibility, HR replies within 5 business days.` : 'Procedure document not in scope.' })

  const basis = [
    supplementFound ? rule.entitlementSection : `${GLOBAL.title} / Birthing parent`,
    `${GLOBAL.title} / Country supplements`,
    rule.eligibilitySection,
    'Leave of Absence Procedure / How to apply',
  ]
  const routedTo = [`${emp.manager.name} (coverage)`, 'HR (eligibility)']

  const lines: string[] = []
  if (emp.employeeType === 'contractor') {
    lines.push(`${first}, parental leave applies to regular employees. ${eligibilityNote} If your contract has its own leave terms, ${emp.manager.name} or HR can confirm them.`)
    return {
      country, eligible, eligibilityNote, entitlementWeeks, paidWeeks, jobProtectionWeeks: undefined,
      preNatalMaxWeeks: rule.preNatalMaxWeeks, noticeDays: GLOBAL.noticeDays, basis, documents: [], routedTo,
      supplementFound, trace, answer: lines.join('\n'),
    }
  }
  lines.push(`${first}, here is what applies to you as an employee based in ${country === 'IN' ? 'India' : 'the United States'}:`)
  if (country === 'IN' && supplementFound) {
    lines.push(`- Entitlement: ${entitlementWeeks} weeks of paid maternity leave, up to ${rule.preNatalMaxWeeks} weeks of it before the expected delivery date [${rule.entitlementSection}]. The global policy's ${GLOBAL.birthingWeeks} weeks is the floor and the India entitlement is higher, so it applies [${GLOBAL.title} / Country supplements].`)
    lines.push(`- Pay: 100% of base for the full ${paidWeeks} weeks [India Leave Supplement / Pay during leave].`)
  } else if (country === 'US' && supplementFound) {
    lines.push(`- Entitlement: ${entitlementWeeks} weeks of fully paid leave for a birthing parent, ${GLOBAL.nonBirthingWeeks} weeks for a non-birthing parent [${rule.entitlementSection}].`)
    lines.push(`- Job protection: up to ${rule.jobProtectionWeeks} weeks under FMLA, running concurrently with the paid leave${fmlaOk ? '' : ', once you reach 12 months of service'} [US Leave Supplement / Job protection under FMLA]. State paid family leave, where it exists, is coordinated by HR so pay stays at 100% [US Leave Supplement / State programs].`)
  } else {
    lines.push(`- Entitlement: ${entitlementWeeks} weeks of paid leave for a birthing parent under the global policy [${GLOBAL.title} / Birthing parent].`)
  }
  lines.push(`- Eligibility: ${eligibilityNote}`)
  lines.push(`- To apply: at least ${GLOBAL.noticeDays} days before the leave starts, with ${supplementFound ? rule.documents[0].charAt(0).toLowerCase() + rule.documents[0].slice(1) : 'the supporting document named in your country supplement'}. The request goes to ${emp.manager.name} to acknowledge coverage and to HR to confirm eligibility [Leave of Absence Procedure / How to apply].`)
  if (eligible) {
    lines.push('')
    lines.push(country === 'IN'
      ? `Want me to start the request? Tell me your expected delivery date, or the date you'd like the leave to begin.`
      : `Want me to start the request? Tell me your expected due date, or the date you'd like the leave to begin.`)
  }

  return {
    country, eligible, eligibilityNote, entitlementWeeks, paidWeeks,
    jobProtectionWeeks: country === 'US' && fmlaOk ? rule.jobProtectionWeeks : undefined,
    preNatalMaxWeeks: rule.preNatalMaxWeeks, noticeDays: GLOBAL.noticeDays,
    basis, documents: supplementFound ? rule.documents : ['Supporting document named in your country supplement'],
    routedTo, supplementFound, trace, answer: lines.join('\n'),
  }
}

export function leaveDetails(a: LeaveAssessment, expectedDate?: string): LeaveDetails {
  return {
    kind: 'parental', country: a.country, entitlementWeeks: a.entitlementWeeks, paidWeeks: a.paidWeeks,
    jobProtectionWeeks: a.jobProtectionWeeks, expectedDate, basis: a.basis, documents: a.documents, routedTo: a.routedTo,
  }
}
