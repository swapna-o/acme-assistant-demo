import { planVacation } from '../server/agents/planner.js'
import { chat } from '../server/agents/orchestrator.js'
import * as db from '../server/workday/mock-data.js'

console.log('=== planner: Alex, default ===')
const p = planVacation({ employeeId: 'WD-10042' })
console.log(p.notes.join('\n'))
for (const o of p.options) console.log(o.rank, o.startDate, o.endDate, `pto=${o.ptoDays} off=${o.totalDaysOff} score=${o.score} cov=${o.coverageOk}`, o.holidaysIncluded.join('|'), o.teammatesOut.join('|'))

console.log('\n=== planner: Alex, 5 days in November ===')
const p2 = planVacation({ employeeId: 'WD-10042', days: 5, month: 11 })
for (const o of p2.options) console.log(o.rank, o.startDate, o.endDate, `pto=${o.ptoDays} off=${o.totalDaysOff} score=${o.score} cov=${o.coverageOk}`)

console.log('\n=== planner: Marcus (contractor) ===')
const p3 = planVacation({ employeeId: 'WD-10120', days: 3 })
console.log(p3.notes.join('\n'))
for (const o of p3.options) console.log(o.rank, o.startDate, o.endDate, `pto=${o.ptoDays} off=${o.totalDaysOff}`)

console.log('\n=== offline agent: full flow for Alex ===')
const turns = ['I want to book a vacation', 'option 1', 'yes send it', 'status of my requests']
for (const t of turns) {
  const r = await chat('s1', 'WD-10042', t)
  console.log(`\n> ${t}\n${r.content}\n  trace: ${r.trace?.map(s => s.tool).join(' -> ')}`)
}
console.log('\nmanager notifications:', db.getNotifications('WD-10015').map(n => n.subject))
console.log('team requests pending:', db.getTeamRequests('WD-10015').filter(r => r.status === 'pending').map(r => `${r.requestId} ${r.employeeName} ${r.startDate}`))

console.log('\n=== offline agent: explicit dates in blackout ===')
console.log((await chat('s2', 'WD-10042', 'Can I take Oct 27 to Oct 29 off?')).content)
console.log('\n=== offline agent: policy question, contractor ===')
console.log((await chat('s3', 'WD-10120', 'How much notice do I need?')).content)
console.log('\n=== offline agent: policy question, Alex on coverage (manager-only doc) ===')
console.log((await chat('s4', 'WD-10042', 'What is the team coverage rule?')).content)
