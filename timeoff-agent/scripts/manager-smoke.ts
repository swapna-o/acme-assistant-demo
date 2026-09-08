const API = 'http://localhost:3001'
async function login(email: string) { const r = await fetch(`${API}/api/auth/sso-login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) }); return (await r.json()).token as string }
async function chat(token: string, message: string) { const r = await fetch(`${API}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ message }) }); return r.json() }
await fetch(`${API}/api/eval/reset`, { method: 'POST' })
const an = await login('ananya.iyer@acme.com')
for (const m of ['How much maternity leave do I get?', 'Sep 30', 'yes']) await chat(an, m)
const ro = await login('rohan.mehta@acme.com')
for (const m of ['show me coverage', 'what is waiting on me', 'approve Ananya', 'yes', 'show me coverage']) {
  const r = await chat(ro, m)
  console.log(`\n> ${m}\n${r.content}\n  route: ${r.policy ? 'policy' : 'agent'} · trace: ${r.trace?.map((s: any) => s.tool).join(' > ') ?? ''}`)
}
const notes = await (await fetch(`${API}/api/notifications`, { headers: { Authorization: `Bearer ${an}` } })).json()
console.log('\nAnanya notified:', notes.map((n: any) => n.subject))
const jo = await login('jordan.park@acme.com')
for (const m of ['deny David because release wrap-up that week', 'yes', 'approve REQ-2026-001', 'never mind']) {
  const r = await chat(jo, m)
  console.log(`\n> ${m}\n${r.content.slice(0, 300)}`)
}
const bob = await login('bob.rivera@acme.com')
console.log('\nBob: ' + (await chat(bob, 'approve Alex')).content)
