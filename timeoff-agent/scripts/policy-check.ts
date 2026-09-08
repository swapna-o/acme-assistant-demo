import { searchPolicies } from '../server/policies/index.js'
import * as db from '../server/workday/mock-data.js'
for (const id of ['WD-10042', 'WD-10120', 'WD-10015']) {
  const emp = db.employees[id]
  for (const q of ['how much notice to request vacation, carryover cap, blackout periods', 'team coverage minimum', 'contractor unpaid time off']) {
    const r = searchPolicies(q, emp)
    console.log(`${emp.name} | "${q}" -> ${r.hits.map(h => `${h.title}/${h.heading} (${h.score.toFixed(2)})`).join(' ; ') || 'NO HIT'} | locked: ${r.lockedDocs.join(', ')}`)
  }
}
