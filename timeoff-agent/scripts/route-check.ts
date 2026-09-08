import { routesToAgent } from '../server/agents/orchestrator.js'
const cases: [string, boolean][] = [
  ['What does the executive severance plan pay out?', false],
  ['How many months of severance do executives get?', false],
  ['Can I carry over unused PTO?', false],
  ['What is the engineering on-call policy?', false],
  ['How long is parental leave?', true],
  ['What is the salary band for a senior engineer?', false],
  ['What is the code of conduct?', false],
  ['I want to book a vacation', true],
  ['5 days around Thanksgiving', true],
  ['What are my balances?', true],
  ["Who's out on my team?", true],
  ['How much notice do I need?', true],
  ['Can I take Oct 27 to Oct 29 off?', true],
  ['Plan a trip for me in December', true],
  ['Status of my requests', true],
]
let bad = 0
for (const [m, want] of cases) { const got = routesToAgent('none', m); if (got !== want) bad++; console.log(`${got === want ? 'ok  ' : 'FAIL'} ${got ? 'agent ' : 'policy'} | ${m}`) }
console.log(bad ? `${bad} misrouted` : 'all routed as expected')
