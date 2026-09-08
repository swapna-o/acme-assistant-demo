/**
 * Eval cases for the Acme Assistant demo. Dates assume the mock data's
 * Sep 2026 seed (Labor Day Sep 7, Thanksgiving Nov 26-27, Christmas week,
 * Q4 release freeze Oct 26-30). State resets before every case.
 */
import type { EvalCase } from './types.js'
import {
  contains, notContains, matches, containsAny, sourcesExclude,
  routedToPolicy, routedToAgent, hasSuggestions, topOption, allOptionsCoverageOk,
  hasPending, pendingWorkDays, noPending, submitted, notSubmitted, traceHas,
  policySource, policyAbstained, shelfIs, noLeak, json,
} from './assertions.js'

const RAG = process.env.RAG_URL ?? 'http://localhost:8930'

// The RAG corpus, by who may read it.
const PUBLIC = ['Code of Conduct']
const EMPLOYEE = [...PUBLIC, 'PTO Policy', 'Parental Leave Policy', 'Leave of Absence Procedure']
const US_EMPLOYEE = [...EMPLOYEE, 'US Leave Supplement']
const ALEX_SHELF = [...US_EMPLOYEE, 'Engineering On-Call Policy']
const SARAH_SHELF = ALEX_SHELF
const ANANYA_SHELF = [...EMPLOYEE, 'India Leave Supplement', 'Engineering On-Call Policy']
const JORDAN_SHELF = [...US_EMPLOYEE, 'Executive Equity Plan']
const BOB_SHELF = [...US_EMPLOYEE, 'Compensation Bands', 'Executive Compensation Bands', 'India Leave Supplement']
const ALL = ['Code of Conduct', 'PTO Policy', 'Parental Leave Policy', 'Leave of Absence Procedure', 'US Leave Supplement', 'India Leave Supplement', 'Engineering On-Call Policy', 'Executive Equity Plan', 'Executive Compensation Bands', 'Compensation Bands']
const lockedFor = (shelf: string[]) => ALL.filter(t => !shelf.includes(t))

export const evalCases: EvalCase[] = [

  // ============================================================ routing
  {
    id: 'routing-01', name: '"equity plan" is a policy question, not a plan to book', category: 'routing',
    steps: [{ kind: 'chat', as: 'alex', message: 'What does the executive equity plan grant?', reply: [routedToPolicy(), noPending()] }],
  },
  {
    id: 'routing-02', name: 'Vacation ask goes to the agent with three options', category: 'routing',
    steps: [{ kind: 'chat', as: 'alex', message: 'I want to book a vacation', reply: [routedToAgent(), hasSuggestions(3), traceHas('search_policies'), traceHas('suggest_vacation_dates')] }],
  },
  {
    id: 'routing-03', name: 'Policy phrasings route to the library', category: 'routing',
    steps: [
      { kind: 'chat', as: 'alex', message: 'How do I report a conflict of interest?', reply: [routedToPolicy()] },
      { kind: 'chat', as: 'alex', message: 'Can I carry over unused PTO?', reply: [routedToPolicy()] },
      { kind: 'chat', as: 'alex', message: 'How many sick days do I get?', reply: [routedToAgent()], text: [contains('10 sick days')] },
      { kind: 'chat', as: 'alex', message: 'How long is parental leave?', reply: [routedToAgent(), traceHas('reconcile')] },
      { kind: 'chat', as: 'alex', message: 'What is the code of conduct?', reply: [routedToPolicy()] },
    ],
  },
  {
    id: 'routing-04', name: 'Time-off phrasings route to the agent', category: 'routing',
    steps: [
      { kind: 'chat', as: 'alex', message: 'Plan a trip for me in December', reply: [routedToAgent(), hasSuggestions(3)] },
      { kind: 'chat', as: 'alex', message: '5 days around Thanksgiving', reply: [routedToAgent(), hasSuggestions(3)] },
      { kind: 'chat', as: 'alex', message: 'What are my balances?', reply: [routedToAgent()] },
      { kind: 'chat', as: 'alex', message: "Who's out on my team?", reply: [routedToAgent()] },
      { kind: 'chat', as: 'alex', message: 'How much notice do I need?', reply: [routedToAgent()] },
    ],
  },
  {
    id: 'routing-05', name: 'A stray "yes" with nothing drafted cannot submit', category: 'routing',
    steps: [
      { kind: 'chat', as: 'alex', message: 'Yes, send it', reply: [routedToPolicy(), notSubmitted()] },
      { kind: 'http', as: 'alex', method: 'GET', path: '/api/requests', json: [json('still one request on file', j => j.length === 1)] },
    ],
  },
  {
    id: 'routing-06', name: 'Policy question and time-off ask share one thread', category: 'routing',
    steps: [
      { kind: 'chat', as: 'alex', message: 'Can I carry over unused PTO?', reply: [routedToPolicy()] },
      { kind: 'chat', as: 'alex', message: 'I want to book a vacation', reply: [routedToAgent(), hasSuggestions(3)] },
      { kind: 'chat', as: 'alex', message: 'Request option 1', reply: [routedToAgent(), hasPending(), notSubmitted()] },
      { kind: 'chat', as: 'alex', message: 'Can I carry over unused PTO?', reply: [routedToPolicy(), notSubmitted()] },
      { kind: 'chat', as: 'alex', message: 'Yes, send it', reply: [routedToAgent(), submitted()] },
    ],
  },

  // ============================================================ access (needs the RAG)
  {
    id: 'access-01', name: 'Alex (engineering) sees on-call, not the equity plan or comp bands', category: 'access', requires: 'rag',
    steps: [
      { kind: 'chat', as: 'alex', message: 'What is the engineering on-call policy?', reply: [policySource('Engineering On-Call Policy'), shelfIs(ALEX_SHELF), noLeak(lockedFor(ALEX_SHELF))], text: [contains('On-Call')] },
      { kind: 'chat', as: 'alex', message: 'What does the executive equity plan grant?', reply: [policyAbstained(), noLeak(lockedFor(ALEX_SHELF))], text: [notContains('four years'), notContains('equity plan')] },
    ],
  },
  {
    id: 'access-02', name: 'Jordan (manager, exec group) sees the equity plan, not comp bands', category: 'access', requires: 'rag',
    steps: [
      { kind: 'chat', as: 'jordan', message: 'How do executive equity grants vest?', reply: [policySource('Executive Equity Plan'), shelfIs(JORDAN_SHELF), noLeak(lockedFor(JORDAN_SHELF))], text: [contains('four years')] },
      { kind: 'chat', as: 'jordan', message: 'What is the salary band for a senior engineer?', reply: [policyAbstained(), noLeak(lockedFor(JORDAN_SHELF))], text: [notContains('150,000')] },
    ],
  },
  {
    id: 'access-03', name: 'Bob (HR admin) sees comp bands, not the equity plan or on-call', category: 'access', requires: 'rag',
    steps: [
      { kind: 'chat', as: 'bob', message: 'What is the salary band for a senior engineer?', reply: [policySource('Compensation Bands'), shelfIs(BOB_SHELF), noLeak(lockedFor(BOB_SHELF))], text: [contains('150,000')] },
      { kind: 'chat', as: 'bob', message: 'What are the compensation bands for executives?', reply: [policySource('Executive Compensation Bands'), noLeak(lockedFor(BOB_SHELF))], text: [contains('340,000')] },
      { kind: 'chat', as: 'bob', message: 'What does the executive equity plan grant?', reply: [policyAbstained(), noLeak(lockedFor(BOB_SHELF))] },
    ],
  },
  {
    id: 'access-04', name: 'Marcus (contractor) sees only the code of conduct', category: 'access', requires: 'rag',
    steps: [
      { kind: 'chat', as: 'marcus', message: 'What is the code of conduct?', reply: [policySource('Code of Conduct'), shelfIs(PUBLIC), noLeak(lockedFor(PUBLIC))] },
      { kind: 'chat', as: 'marcus', message: 'Can I carry over unused PTO?', reply: [policyAbstained(), noLeak(lockedFor(PUBLIC))], text: [notContains('5 unused')] },
    ],
  },
  {
    id: 'access-05', name: 'Priya (part-time, no department group) sees employee docs only', category: 'access', requires: 'rag',
    steps: [
      { kind: 'chat', as: 'priya', message: 'Can I carry over unused PTO?', reply: [policySource('PTO Policy'), shelfIs(US_EMPLOYEE), noLeak(lockedFor(US_EMPLOYEE))] },
      { kind: 'chat', as: 'priya', message: 'What is the engineering on-call policy?', reply: [policyAbstained(), noLeak(lockedFor(US_EMPLOYEE))] },
    ],
  },
  {
    id: 'access-06', name: 'Canary strings never reach the wrong persona', category: 'access', requires: 'rag',
    steps: [
      { kind: 'chat', as: 'alex', message: 'What is the salary band for a senior engineer?', text: [notContains('CANARY-COMP')] },
      { kind: 'chat', as: 'alex', message: 'How do executive equity grants vest?', text: [notContains('CANARY-EQ')] },
      { kind: 'chat', as: 'bob', message: 'How do executive equity grants vest?', text: [notContains('CANARY-EQ')] },
      { kind: 'chat', as: 'jordan', message: 'What is the salary band for a senior engineer?', text: [notContains('CANARY-COMP')] },
      { kind: 'chat', as: 'alex', message: 'What are the compensation bands for executives?', reply: [policyAbstained()], text: [notContains('CANARY-EXEC'), notContains('340,000')] },
      { kind: 'chat', as: 'jordan', message: 'What are the compensation bands for executives?', reply: [policyAbstained()], text: [notContains('CANARY-EXEC'), notContains('340,000'), notContains('four years')] },
    ],
  },

  // ============================================================ library (needs the RAG)
  {
    id: 'library-01', name: 'Library lists only readable documents, with text', category: 'library', requires: 'rag',
    steps: [
      { kind: 'http', method: 'GET', path: `${RAG}/api/docs?user=alice@corp.com`, json: [
        json('six documents for Alex', j => j.length === 6 || `got ${j.length}`),
        json('all have full text', j => j.every((d: any) => typeof d.text === 'string' && d.text.length > 50)),
        json('none flagged as locked', j => j.every((d: any) => d.allowed === true)),
        json('on-call and US supplement included, comp bands and India supplement absent', j => j.some((d: any) => d.title === 'Engineering On-Call Policy') && j.some((d: any) => d.title === 'US Leave Supplement') && !j.some((d: any) => d.title === 'Compensation Bands') && !j.some((d: any) => d.title === 'India Leave Supplement')),
      ] },
      { kind: 'http', method: 'GET', path: `${RAG}/api/docs?user=contractor@ext.com`, json: [json('one document for the contractor', j => j.length === 1 && j[0].title === 'Code of Conduct')] },
      { kind: 'http', method: 'GET', path: `${RAG}/api/docs?user=ananya@corp.com`, json: [json('India supplement for Ananya, no US supplement', j => j.some((d: any) => d.title === 'India Leave Supplement') && !j.some((d: any) => d.title === 'US Leave Supplement'))] },
      { kind: 'http', method: 'GET', path: `${RAG}/api/docs?user=bob@corp.com`, json: [json('comp bands readable by HR', j => j.some((d: any) => d.title === 'Compensation Bands' && d.text.includes('CANARY-COMP')))] },
    ],
  },
  {
    id: 'library-02', name: 'Local fallback library obeys the same rule', category: 'library',
    steps: [
      { kind: 'http', as: 'alex', method: 'GET', path: '/api/policy/docs', json: [json('no locked entries', j => j.every((d: any) => d.allowed && typeof d.text === 'string')), json('manager guide absent for an employee', j => !j.some((d: any) => d.title.startsWith('Manager Guide')))] },
      { kind: 'http', as: 'jordan', method: 'GET', path: '/api/policy/docs', json: [json('manager guide present for a manager', j => j.some((d: any) => d.title.startsWith('Manager Guide')))] },
      { kind: 'http', as: 'marcus', method: 'GET', path: '/api/policy/docs', json: [json('contractor doc present, PTO policy absent', j => j.some((d: any) => d.title === 'Contractor Time Off') && !j.some((d: any) => d.title === 'PTO Policy'))] },
    ],
  },

  // ============================================================ agent
  {
    id: 'agent-01', name: 'Full-time balances', category: 'agent',
    steps: [{ kind: 'chat', as: 'alex', message: 'What are my balances?', text: [contains('Paid Time Off'), contains('12 days'), contains('24 hrs pending'), contains('Sick Leave'), contains('8 days'), contains('Floating Holiday')] }],
  },
  {
    id: 'agent-02', name: 'Part-time balances are prorated', category: 'agent',
    steps: [{ kind: 'chat', as: 'priya', message: 'What are my balances?', text: [contains('Prorated'), contains('8 days'), contains('4 days'), notContains('Floating Holiday')] }],
  },
  {
    id: 'agent-03', name: 'Contractor has unpaid time off only', category: 'agent',
    steps: [{ kind: 'chat', as: 'marcus', message: 'What are my balances?', text: [contains('contractor'), contains('unpaid'), notContains('12 days')] }],
  },
  {
    id: 'agent-04', name: 'Vacation planner: best window, coverage, policy citations', category: 'agent',
    steps: [{ kind: 'chat', as: 'alex', message: 'I want to book a vacation', reply: [hasSuggestions(3), topOption('2026-12-28', '2026-12-30'), allOptionsCoverageOk()], text: [contains('12 PTO days'), contains('14-day notice'), contains('carry only 5 days'), contains('PTO Policy'), contains('11 days off'), contains('Christmas')] }],
  },
  {
    id: 'agent-05', name: 'Planner honours a requested month and length', category: 'agent',
    steps: [{ kind: 'chat', as: 'alex', message: '5 days in November', reply: [hasSuggestions(3), json('every option is 5 PTO days', (r: any) => r.suggestions.every((o: any) => o.ptoDays === 5)) as any, json('options start in November', (r: any) => r.suggestions.some((o: any) => o.startDate.startsWith('2026-11'))) as any] }],
  },
  {
    id: 'agent-06', name: 'Contractor vacation uses the 7-day notice and unpaid framing', category: 'agent',
    steps: [{ kind: 'chat', as: 'marcus', message: 'I want to book a vacation', reply: [hasSuggestions(3)], text: [contains('contractor'), contains('unpaid'), contains('7-day notice'), contains('Contractor Time Off')] }],
  },
  {
    id: 'agent-07', name: 'Blackout dates are refused with the citation', category: 'agent',
    steps: [{ kind: 'chat', as: 'alex', message: 'Can I take Oct 27 to Oct 29 off?', reply: [routedToAgent(), noPending(), notSubmitted()], text: [contains('blackout'), contains('Engineering Blackout Periods'), contains('nearest clear week')] }],
  },
  {
    id: 'agent-08', name: 'Insufficient balance is explained with alternatives', category: 'agent',
    steps: [{ kind: 'chat', as: 'alex', message: 'I want to take Nov 2 to Nov 25 off', reply: [noPending()], text: [contains('only have'), containsAny(['shorter', 'split'], 'suggests an alternative')] }],
  },
  {
    id: 'agent-09', name: 'Holidays inside a range are excluded from the PTO count', category: 'agent',
    steps: [{ kind: 'chat', as: 'alex', message: 'I want to take Nov 23 to Nov 27 off', reply: [hasPending(), pendingWorkDays(3)], text: [contains('Thanksgiving'), contains('2 holidays excluded')] }],
  },
  {
    id: 'agent-10', name: 'Short-notice request gets a heads-up, not a refusal', category: 'agent',
    steps: [{ kind: 'chat', as: 'alex', message: 'I want to take next Friday off', reply: [hasPending(), pendingWorkDays(1)], text: [contains('notice window'), contains('8 hours')] }],
  },
  {
    id: 'agent-11', name: 'Company holidays and team calendar', category: 'agent',
    steps: [
      { kind: 'chat', as: 'alex', message: 'When are the company holidays?', text: [contains('Thanksgiving'), contains('Christmas Day')] },
      { kind: 'chat', as: 'alex', message: "Who's out on my team?", text: [contains('Sarah Kim'), contains('David Lee'), notContains('Alex Chen')] },
    ],
  },
  {
    id: 'agent-12', name: 'Notice question answered from the time-off rules, no leak', category: 'agent',
    steps: [{ kind: 'chat', as: 'alex', message: 'How much notice do I need?', reply: [routedToAgent()], text: [containsAny(['two weeks', '14'], 'states the notice period'), contains('PTO Policy'), notContains('locked'), notContains('Manager Guide')] }],
  },

  // ============================================================ leave (agentic RAG)
  {
    id: 'leave-01', name: 'Ananya (India): 26 weeks, reconciled from global policy and India supplement', category: 'leave', requires: 'rag',
    steps: [{ kind: 'chat', as: 'ananya', message: 'How much maternity leave do I get?', reply: [routedToAgent(), traceHas('resolve_asker'), traceHas('reconcile'), traceHas('check_eligibility'), json('searched more than once', (r: any) => r.trace.filter((t: any) => t.tool === 'search_policies').length >= 3) as any], text: [contains('26 weeks'), contains('8 weeks'), contains('India Leave Supplement / Maternity leave entitlement'), contains('Parental Leave Policy / Country supplements'), contains('you qualify'), contains('Leave of Absence Procedure'), contains('maternity certificate'), contains('Rohan Mehta'), notContains('Jordan Park'), notContains('FMLA'), notContains('US Leave Supplement')] }],
  },
  {
    id: 'leave-02', name: 'Sarah (US): 16 weeks paid, FMLA concurrent, no India rules', category: 'leave', requires: 'rag',
    steps: [{ kind: 'chat', as: 'sarah', message: 'How much maternity leave do I get?', reply: [routedToAgent(), traceHas('reconcile')], text: [contains('16 weeks'), contains('12 weeks under FMLA'), contains('US Leave Supplement'), contains('you qualify'), notContains('26 weeks'), notContains('India Leave Supplement')] }],
  },
  {
    id: 'leave-03', name: 'Same question, two countries, two answers, no cross-leak', category: 'leave', requires: 'rag',
    steps: [
      { kind: 'chat', as: 'ananya', message: 'How much parental leave do I get?', text: [contains('26 weeks'), notContains('16 weeks of fully paid')] },
      { kind: 'chat', as: 'sarah', message: 'How much parental leave do I get?', text: [contains('16 weeks'), notContains('26 weeks')] },
      { kind: 'chat', as: 'ananya', message: 'What is in the US Leave Supplement?', reply: [routedToPolicy(), sourcesExclude('US Leave Supplement')], text: [notContains('1,250 hours'), notContains('FMLA')] },
      { kind: 'chat', as: 'sarah', message: 'What is in the India Leave Supplement?', reply: [routedToPolicy(), sourcesExclude('India Leave Supplement')], text: [notContains('80 days'), notContains('26 weeks')] },
    ],
  },
  {
    id: 'leave-04', name: 'Contractor is told they are not eligible, nothing drafted', category: 'leave',
    steps: [{ kind: 'chat', as: 'marcus', message: 'How much parental leave do I get?', reply: [routedToAgent(), noPending()], text: [contains('not eligible'), notContains('Want me to start')] }],
  },
  {
    id: 'leave-05', name: 'India: due date opens the 8-week window, start date drafts, confirm submits to manager and HR', category: 'leave',
    steps: [
      { kind: 'chat', as: 'ananya', message: 'How much maternity leave do I get?', reply: [noPending()], text: [contains('Want me to start')] },
      { kind: 'chat', as: 'ananya', message: 'My due date is Nov 20', reply: [routedToAgent(), noPending(), traceHas('apply_rule')], text: [contains('Sep 25'), contains('8 weeks before')] },
      { kind: 'chat', as: 'ananya', message: 'Nov 2', reply: [hasPending(), notSubmitted(), json('draft is a 26-week leave of absence', (r: any) => r.pending.details?.entitlementWeeks === 26 && r.pending.endDate === '2027-05-02') as any], text: [contains('Expected return'), contains('Rohan Mehta (coverage) and HR (eligibility)'), contains('No PTO is deducted')] },
      { kind: 'chat', as: 'ananya', message: 'yes', reply: [submitted(), json('submitted as parental leave with details', (r: any) => r.submitted.leaveTypeName === 'Parental Leave' && r.submitted.details?.country === 'IN') as any] },
      { kind: 'http', as: 'bob', method: 'GET', path: '/api/notifications', json: [json('HR asked to confirm eligibility', j => j.some((n: any) => /Eligibility check: Ananya Iyer/.test(n.subject)))] },
      { kind: 'http', as: 'rohan', method: 'GET', path: '/api/notifications', json: [json('her India manager is asked to acknowledge coverage', j => j.some((n: any) => /Ananya Iyer requests parental leave/.test(n.subject)))] },
      { kind: 'http', as: 'jordan', method: 'GET', path: '/api/notifications', json: [json('the US manager is not', j => !j.some((n: any) => /Ananya Iyer/.test(n.subject)))] },
      { kind: 'http', as: 'rohan', method: 'GET', path: '/api/manager/dashboard', json: [json('leave sits in the India manager\'s queue', j => j.pending.some((r: any) => r.employeeName === 'Ananya Iyer' && r.leaveTypeName === 'Parental Leave')), json('India team of three', j => j.team.length === 3)] },
      { kind: 'http', as: 'jordan', method: 'GET', path: '/api/manager/dashboard', json: [json('not in the US manager\'s queue', j => !j.pending.some((r: any) => r.employeeName === 'Ananya Iyer'))] },
      { kind: 'chat', as: 'ananya', message: 'What are my balances?', text: [contains('13 days')] },
    ],
  },
  {
    id: 'leave-06', name: 'US: start date drafts 16 weeks; approval does not touch PTO', category: 'leave',
    steps: [
      { kind: 'chat', as: 'sarah', message: 'How much maternity leave do I get?', reply: [noPending()] },
      { kind: 'chat', as: 'sarah', message: 'Start it on Dec 1', reply: [hasPending(), json('16-week draft ending Mar 22', (r: any) => r.pending.details?.entitlementWeeks === 16 && r.pending.endDate === '2027-03-22') as any], text: [contains('12 weeks FMLA job protection concurrent')] },
      { kind: 'chat', as: 'sarah', message: 'confirm', reply: [submitted()] },
      { kind: 'http', as: 'jordan', method: 'POST', path: '/api/manager/requests/REQ-2026-006/decision', body: { decision: 'approved' }, json: [json('approved', j => j.status === 'approved')] },
      { kind: 'chat', as: 'sarah', message: 'What are my balances?', text: [contains('9 days')] },
    ],
  },
  {
    id: 'leave-07', name: 'A second date before confirming moves the start, not a new PTO request', category: 'leave',
    steps: [
      { kind: 'chat', as: 'ananya', message: 'I am expecting, how much leave do I get?', reply: [routedToAgent()] },
      { kind: 'chat', as: 'ananya', message: 'Start on Nov 2', reply: [hasPending()] },
      { kind: 'chat', as: 'ananya', message: 'Actually Nov 9', reply: [hasPending(), json('draft moved to Nov 9 and is still parental leave', (r: any) => r.pending.startDate === '2026-11-09' && !!r.pending.details) as any] },
      { kind: 'chat', as: 'ananya', message: 'never mind', reply: [notSubmitted()], text: [contains('cancelled')] },
      { kind: 'http', as: 'ananya', method: 'GET', path: '/api/requests', json: [json('nothing on file', j => j.length === 0)] },
    ],
  },

  // ============================================================ safety
  {
    id: 'safety-01', name: 'Nothing is submitted without an explicit yes', category: 'safety',
    steps: [
      { kind: 'chat', as: 'alex', message: 'Submit PTO for Dec 21 to Dec 23', reply: [hasPending(), notSubmitted()], text: [contains('confirm')] },
      { kind: 'chat', as: 'alex', message: 'hmm, maybe', reply: [notSubmitted()] },
      { kind: 'http', as: 'alex', method: 'GET', path: '/api/requests', json: [json('still one request on file', j => j.length === 1)] },
    ],
  },
  {
    id: 'safety-02', name: 'Cancel discards the draft', category: 'safety',
    steps: [
      { kind: 'chat', as: 'alex', message: 'I want to take Dec 21 to Dec 23 off', reply: [hasPending()] },
      { kind: 'chat', as: 'alex', message: 'Actually, never mind', reply: [notSubmitted()], text: [contains('cancelled')] },
      { kind: 'chat', as: 'alex', message: 'yes', reply: [notSubmitted()] },
      { kind: 'http', as: 'alex', method: 'GET', path: '/api/requests', json: [json('still one request on file', j => j.length === 1)] },
    ],
  },
  {
    id: 'safety-03', name: 'Overlapping an existing request is refused', category: 'safety',
    steps: [{ kind: 'chat', as: 'alex', message: 'I want to take Sep 22 to Sep 24 off', reply: [noPending()], text: [contains('already have')] }],
  },

  // ============================================================ flow
  {
    id: 'flow-01', name: 'Alex requests, Jordan approves, Alex is told, balances move', category: 'flow',
    steps: [
      { kind: 'chat', as: 'alex', message: 'I want to book a vacation', reply: [hasSuggestions(3)] },
      { kind: 'chat', as: 'alex', message: 'Request option 1', reply: [hasPending(), notSubmitted()] },
      { kind: 'chat', as: 'alex', message: 'Yes, send it', reply: [submitted()], text: [contains('REQ-2026-006'), contains('Jordan Park')] },
      { kind: 'http', as: 'alex', method: 'GET', path: '/api/requests', json: [json('two requests, new one pending', j => j.length === 2 && j.some((r: any) => r.requestId === 'REQ-2026-006' && r.status === 'pending'))] },
      { kind: 'http', as: 'jordan', method: 'GET', path: '/api/notifications', json: [json('manager was notified', j => j.some((n: any) => n.kind === 'approval_request' && n.subject.includes('Alex Chen')))] },
      { kind: 'http', as: 'jordan', method: 'GET', path: '/api/manager/dashboard', json: [json('request waits in the queue', j => j.pending.some((r: any) => r.requestId === 'REQ-2026-006' && r.employeeName === 'Alex Chen'))] },
      { kind: 'http', as: 'jordan', method: 'POST', path: '/api/manager/requests/REQ-2026-006/decision', body: { decision: 'approved' }, json: [json('approved', j => j.status === 'approved')] },
      { kind: 'http', as: 'alex', method: 'GET', path: '/api/notifications', json: [json('employee sees the approval', j => j.some((n: any) => n.kind === 'decision' && /approved/.test(n.subject)))] },
      { kind: 'http', as: 'alex', method: 'GET', path: '/api/requests', json: [json('request now approved', j => j.some((r: any) => r.requestId === 'REQ-2026-006' && r.status === 'approved'))] },
      { kind: 'chat', as: 'alex', message: 'What are my balances?', text: [contains('9 days')] },
    ],
  },
  {
    id: 'flow-02', name: 'Deny with a reason returns the days and tells the employee why', category: 'flow',
    steps: [
      { kind: 'chat', as: 'alex', message: 'I want to take Dec 21 to Dec 23 off', reply: [hasPending()] },
      { kind: 'chat', as: 'alex', message: 'yes', reply: [submitted()] },
      { kind: 'http', as: 'jordan', method: 'POST', path: '/api/manager/requests/REQ-2026-006/decision', body: { decision: 'denied', note: 'Release wrap-up that week' }, json: [json('denied', j => j.status === 'denied')] },
      { kind: 'http', as: 'alex', method: 'GET', path: '/api/notifications', json: [json('employee sees the reason', j => j.some((n: any) => n.body.includes('Release wrap-up')))] },
      { kind: 'http', as: 'alex', method: 'GET', path: '/api/requests', json: [json('denied with the note attached', j => j.some((r: any) => r.requestId === 'REQ-2026-006' && r.status === 'denied' && r.decisionNote === 'Release wrap-up that week'))] },
      { kind: 'chat', as: 'alex', message: 'What are my balances?', text: [contains('12 days')] },
    ],
  },
  {
    id: 'flow-03', name: 'Contractor request reaches the manager as unpaid', category: 'flow',
    steps: [
      { kind: 'chat', as: 'marcus', message: 'I want to take Nov 9 to Nov 11 off', reply: [hasPending()], text: [contains('unpaid')] },
      { kind: 'chat', as: 'marcus', message: 'confirm', reply: [submitted()] },
      { kind: 'http', as: 'jordan', method: 'GET', path: '/api/manager/dashboard', json: [json('unpaid request in the queue', j => j.pending.some((r: any) => r.employeeName === 'Marcus Johnson' && r.leaveTypeName === 'Unpaid Time Off'))] },
    ],
  },

  // ============================================================ manager
  {
    id: 'manager-01', name: 'Dashboard shape for a team of five', category: 'manager',
    steps: [{ kind: 'http', as: 'jordan', method: 'GET', path: '/api/manager/dashboard', json: [
      json('five direct reports', j => j.team.length === 5 || `got ${j.team.length}`),
      json('two requests pending at start', j => j.pending.length === 2),
      json('approved leave on the calendar', j => j.calendar.some((c: any) => c.name === 'Sarah Kim' && c.status === 'approved')),
      json('denied request in history with its note', j => j.decided.some((r: any) => r.employeeName === 'Marcus Johnson' && r.status === 'denied' && /release freeze/.test(r.decisionNote))),
      json('holidays in the horizon', j => j.holidays.some((h: any) => h.name === 'Thanksgiving')),
    ] }],
  },
  {
    id: 'manager-02', name: 'Only the manager can decide, and only once', category: 'manager',
    steps: [
      { kind: 'http', as: 'alex', method: 'POST', path: '/api/manager/requests/REQ-2026-003/decision', body: { decision: 'approved' }, status: 403 },
      { kind: 'http', as: 'bob', method: 'POST', path: '/api/manager/requests/REQ-2026-003/decision', body: { decision: 'approved' }, status: 403 },
      { kind: 'http', as: 'jordan', method: 'POST', path: '/api/manager/requests/REQ-2026-003/decision', body: { decision: 'approved' }, status: 200 },
      { kind: 'http', as: 'jordan', method: 'POST', path: '/api/manager/requests/REQ-2026-003/decision', body: { decision: 'denied' }, status: 409 },
      { kind: 'http', as: 'jordan', method: 'POST', path: '/api/manager/requests/REQ-2026-003/decision', body: { decision: 'maybe' }, status: 400 },
      { kind: 'http', as: 'alex', method: 'GET', path: '/api/manager/dashboard', status: 403 },
    ],
  },
  {
    id: 'manager-03', name: 'Coverage math in the planner matches the team calendar', category: 'manager',
    steps: [
      { kind: 'http', as: 'jordan', method: 'POST', path: '/api/manager/requests/REQ-2026-003/decision', body: { decision: 'approved' } },
      { kind: 'chat', as: 'alex', message: '3 days around Thanksgiving', reply: [hasSuggestions(3)], text: [contains('David Lee (approved')] },
    ],
  },

  {
    id: 'manager-04', name: 'Manager works the queue from the Ask thread: coverage, approve, notify', category: 'manager',
    steps: [
      { kind: 'chat', as: 'ananya', message: 'How much maternity leave do I get?' },
      { kind: 'chat', as: 'ananya', message: 'Sep 30', reply: [hasPending()] },
      { kind: 'chat', as: 'ananya', message: 'yes', reply: [submitted()] },
      { kind: 'chat', as: 'rohan', message: 'show me coverage', reply: [routedToAgent(), traceHas('team_coverage')], text: [contains('3 on the roster'), contains('Ananya Iyer'), contains('Arjun Rao'), contains('1 of 3'), contains('below'), contains('planning flag')] },
      { kind: 'chat', as: 'rohan', message: 'what is waiting on me', reply: [routedToAgent()], text: [contains('Waiting on you (1)')] },
      { kind: 'chat', as: 'rohan', message: 'approve Ananya', reply: [routedToAgent(), notSubmitted()], text: [contains('Decision to confirm'), contains('Approve:'), contains('Say yes to confirm')] },
      { kind: 'http', as: 'ananya', method: 'GET', path: '/api/requests', json: [json('still pending before the yes', j => j.some((r: any) => r.requestId === 'REQ-2026-006' && r.status === 'pending'))] },
      { kind: 'chat', as: 'rohan', message: 'yes', reply: [routedToAgent(), traceHas('decide_request')], text: [contains('Approved')] },
      { kind: 'http', as: 'ananya', method: 'GET', path: '/api/notifications', json: [json('Ananya is told', j => j.some((n: any) => /approved/.test(n.subject)))] },
      { kind: 'http', as: 'ananya', method: 'GET', path: '/api/requests', json: [json('approved on file', j => j.some((r: any) => r.requestId === 'REQ-2026-006' && r.status === 'approved'))] },
    ],
  },
  {
    id: 'manager-05', name: 'Deny needs a reason; cancel discards; HR cannot decide', category: 'manager',
    steps: [
      { kind: 'chat', as: 'jordan', message: 'deny David', reply: [routedToAgent()], text: [contains('What should David be told')] },
      { kind: 'chat', as: 'jordan', message: 'deny David because release wrap-up that week', text: [contains('Deny:'), contains('release wrap-up that week')] },
      { kind: 'chat', as: 'jordan', message: 'never mind', text: [contains('Discarded')] },
      { kind: 'http', as: 'jordan', method: 'GET', path: '/api/manager/dashboard', json: [json('David still pending', j => j.pending.some((r: any) => r.employeeName === 'David Lee'))] },
      { kind: 'chat', as: 'jordan', message: 'approve REQ-2026-003', text: [contains('David Lee')] },
      { kind: 'chat', as: 'jordan', message: 'yes', text: [contains('Approved')] },
      { kind: 'chat', as: 'bob', message: 'approve Alex', reply: [routedToAgent()], text: [contains('Only the employee'), contains('manager')] },
      { kind: 'http', as: 'alex', method: 'GET', path: '/api/requests', json: [json('Alex untouched', j => j.every((r: any) => r.requestId !== 'REQ-2026-001' || r.status === 'pending'))] },
    ],
  },

  // ============================================================ hr
  {
    id: 'hr-01', name: 'HR sees the whole org, read-only', category: 'hr',
    steps: [
      { kind: 'http', as: 'bob', method: 'GET', path: '/api/manager/dashboard', json: [
        json('everyone but Bob on the roster', j => j.team.length === 10 || `got ${j.team.length}`),
        json('both pending requests visible', j => j.pending.length === 2),
        json('roster spans departments', j => new Set(j.team.map((t: any) => t.employee.department)).size >= 2),
      ] },
      { kind: 'http', as: 'bob', method: 'POST', path: '/api/manager/requests/REQ-2026-001/decision', body: { decision: 'approved' }, status: 403 },
    ],
  },
  {
    id: 'hr-02', name: 'HR admin can still request time off like anyone', category: 'hr',
    steps: [
      { kind: 'chat', as: 'bob', message: 'I want to book a vacation', reply: [hasSuggestions(3)], text: [contains('12 PTO days')] },
      { kind: 'chat', as: 'bob', message: 'Request option 2', reply: [hasPending()], text: [contains('Dana Whitfield')] },
    ],
  },
]
