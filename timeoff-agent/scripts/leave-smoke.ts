const API = 'http://localhost:3001'
async function login(email: string) {
  const r = await fetch(`${API}/api/auth/sso-login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) })
  return (await r.json()).token as string
}
async function chat(token: string, message: string) {
  const r = await fetch(`${API}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ message }) })
  return r.json()
}
await fetch(`${API}/api/eval/reset`, { method: 'POST' })
for (const [who, email, turns] of [
  ['ANANYA (India)', 'ananya.iyer@acme.com', ['How much maternity leave do I get?', 'My due date is Nov 20', 'Nov 2', 'yes']],
  ['SARAH (US)', 'sarah.kim@acme.com', ['How much maternity leave do I get?', 'Start it on Dec 1', 'yes']],
  ['MARCUS (contractor)', 'marcus.johnson@acme.com', ['How much parental leave do I get?']],
] as [string, string, string[]][]) {
  console.log(`\n================ ${who}`)
  const t = await login(email)
  for (const m of turns) {
    const r = await chat(t, m)
    console.log(`\n> ${m}\n${r.content}`)
    if (r.trace?.length) console.log(`  trace: ${r.trace.map((s: any) => s.tool).join(' > ')}`)
    if (r.pending) console.log(`  pending: ${r.pending.startDate} to ${r.pending.endDate}, details=${!!r.pending.details}`)
    if (r.submitted) console.log(`  submitted: ${r.submitted.requestId} ${r.submitted.leaveTypeName} ${r.submitted.startDate}..${r.submitted.endDate}`)
  }
}
const bob = await login('bob.rivera@acme.com')
const notes = await (await fetch(`${API}/api/notifications`, { headers: { Authorization: `Bearer ${bob}` } })).json()
console.log('\nHR notifications:', notes.map((n: any) => n.subject))
const jordan = await login('jordan.park@acme.com')
const dash = await (await fetch(`${API}/api/manager/dashboard`, { headers: { Authorization: `Bearer ${jordan}` } })).json()
console.log('Manager pending:', dash.pending.map((r: any) => `${r.requestId} ${r.employeeName} ${r.leaveTypeName}`))
