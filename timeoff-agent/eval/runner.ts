/**
 * Acme Assistant eval runner.
 *
 *   npm run eval              all cases
 *   npm run eval -- access    one category
 *   npm run eval -- flow-01   one case (or id prefix)
 *
 * Talks to the Express API (API_URL, default :3001). Cases marked requires:'rag'
 * are skipped, not failed, when the Python policy RAG (RAG_URL, default :8930)
 * is not running. State is reset before every case.
 */
import { writeFileSync, mkdirSync } from 'fs'
import type { CaseResult, Category, ChatReply, EvalCase, EvalReport, Persona, Step, StepResult } from './types.js'
import { CATEGORIES, PERSONA_EMAIL } from './types.js'
import { evalCases } from './test-cases.js'

const API = process.env.API_URL ?? 'http://localhost:3001'
const RAG = process.env.RAG_URL ?? 'http://localhost:8930'

async function ragUp(): Promise<boolean> {
  try {
    const r = await fetch(`${RAG}/api/users`, { signal: AbortSignal.timeout(2000) })
    return r.ok
  } catch {
    return false
  }
}

async function reset(): Promise<void> {
  const r = await fetch(`${API}/api/eval/reset`, { method: 'POST' })
  if (!r.ok) throw new Error(`reset failed: ${r.status}`)
}

class Session {
  private tokens = new Map<Persona, string>()

  async token(p: Persona): Promise<string> {
    const cached = this.tokens.get(p)
    if (cached) return cached
    const r = await fetch(`${API}/api/auth/sso-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: PERSONA_EMAIL[p] }),
    })
    if (!r.ok) throw new Error(`login failed for ${p}: ${r.status}`)
    const { token } = await r.json() as { token: string }
    this.tokens.set(p, token)
    return token
  }
}

function run<T>(checks: { description: string; check: (v: T) => { pass: boolean; reason: string } }[] | undefined, value: T) {
  return (checks ?? []).map(c => {
    try {
      return { description: c.description, ...c.check(value) }
    } catch (err) {
      return { description: c.description, pass: false, reason: `check threw: ${err instanceof Error ? err.message : err}` }
    }
  })
}

async function runStep(step: Step, session: Session): Promise<StepResult> {
  if (step.kind === 'wait') {
    await new Promise(r => setTimeout(r, step.ms))
    return { label: `wait ${step.ms}ms`, output: '', assertions: [] }
  }

  if (step.kind === 'chat') {
    const token = await session.token(step.as)
    const r = await fetch(`${API}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ message: step.message }),
    })
    if (!r.ok) throw new Error(`chat ${r.status}: ${await r.text()}`)
    const reply = await r.json() as ChatReply
    return {
      label: `${step.as} says "${step.message}"`,
      output: reply.content,
      assertions: [...run(step.text, reply.content), ...run(step.reply, reply)],
    }
  }

  const url = step.path.startsWith('http') ? step.path : `${API}${step.path}`
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (step.as) headers.Authorization = `Bearer ${await session.token(step.as)}`
  const r = await fetch(url, { method: step.method, headers, body: step.body ? JSON.stringify(step.body) : undefined })
  const text = await r.text()
  let parsed: unknown = text
  try { parsed = JSON.parse(text) } catch { /* not JSON */ }
  const wantStatus = step.status ?? 200
  const statusCheck = { description: `HTTP ${wantStatus}`, pass: r.status === wantStatus, reason: `got ${r.status}` }
  return {
    label: `${step.as ?? 'anon'} ${step.method} ${step.path}`,
    output: text.slice(0, 400),
    assertions: [statusCheck, ...(r.status === wantStatus ? run(step.json, parsed) : [])],
  }
}

async function runCase(c: EvalCase, rag: boolean): Promise<CaseResult> {
  const started = Date.now()
  const planned = c.steps.reduce((n, s) => n + (s.kind === 'chat' ? (s.text?.length ?? 0) + (s.reply?.length ?? 0) : s.kind === 'http' ? 1 + (s.json?.length ?? 0) : 0), 0)
  if (c.requires === 'rag' && !rag) {
    return { caseId: c.id, caseName: c.name, category: c.category, status: 'skipped', steps: [], totalAssertions: planned, passedAssertions: 0, durationMs: 0 }
  }
  await reset()
  const session = new Session()
  const steps: StepResult[] = []
  try {
    for (const s of c.steps) steps.push(await runStep(s, session))
  } catch (err) {
    return { caseId: c.id, caseName: c.name, category: c.category, status: 'error', steps, totalAssertions: planned, passedAssertions: steps.reduce((n, s) => n + s.assertions.filter(a => a.pass).length, 0), durationMs: Date.now() - started, error: err instanceof Error ? err.message : String(err) }
  }
  const total = steps.reduce((n, s) => n + s.assertions.length, 0)
  const passed = steps.reduce((n, s) => n + s.assertions.filter(a => a.pass).length, 0)
  return { caseId: c.id, caseName: c.name, category: c.category, status: passed === total ? 'passed' : 'failed', steps, totalAssertions: total, passedAssertions: passed, durationMs: Date.now() - started }
}

function print(report: EvalReport) {
  const bar = '═'.repeat(66)
  console.log(`\n${bar}\n  ACME ASSISTANT — EVAL REPORT\n  ${report.timestamp} · ${report.api} · policy RAG ${report.ragUp ? 'up' : 'DOWN (access/library cases skipped)'}\n${bar}\n`)
  console.log('  BY CATEGORY')
  for (const [cat, s] of Object.entries(report.byCategory)) {
    const icon = s.failed === 0 ? (s.skipped ? '⏭️ ' : '✅') : '❌'
    console.log(`  ${icon} ${cat.padEnd(10)} ${s.passed}/${s.total - s.skipped} passed${s.skipped ? `, ${s.skipped} skipped` : ''}`)
  }
  console.log('\n  CASES')
  for (const c of report.cases) {
    const icon = c.status === 'passed' ? '✅' : c.status === 'skipped' ? '⏭️ ' : c.status === 'error' ? '💥' : '❌'
    console.log(`  ${icon} [${c.caseId}] ${c.caseName}  ${c.status === 'skipped' ? '(needs RAG)' : `${c.passedAssertions}/${c.totalAssertions} · ${c.durationMs}ms`}`)
    if (c.error) console.log(`       error: ${c.error}`)
    for (const s of c.steps) {
      const failed = s.assertions.filter(a => !a.pass)
      if (!failed.length) continue
      console.log(`       ${s.label}`)
      for (const a of failed) console.log(`         ✗ ${a.description}: ${a.reason}`)
      console.log(`         output: ${s.output.replace(/\s+/g, ' ').slice(0, 220)}`)
    }
  }
  const icon = report.score >= 90 ? '🟢' : report.score >= 70 ? '🟡' : '🔴'
  console.log(`\n${bar}\n  ${icon} SCORE ${report.score}/100 · cases ${report.passedCases} passed, ${report.failedCases} failed, ${report.skippedCases} skipped · assertions ${report.passedAssertions}/${report.totalAssertions}\n${bar}\n`)
}

async function main() {
  const filter = process.argv[2]
  let cases = evalCases
  if (filter) {
    cases = (CATEGORIES as string[]).includes(filter) ? evalCases.filter(c => c.category === filter) : evalCases.filter(c => c.id === filter || c.id.startsWith(filter))
    if (!cases.length) {
      console.error(`No cases match "${filter}". Categories: ${CATEGORIES.join(', ')}. Ids: ${evalCases.map(c => c.id).join(', ')}`)
      process.exit(1)
    }
  }
  const rag = await ragUp()
  console.log(`\nRunning ${cases.length} cases against ${API} (policy RAG ${rag ? 'up' : 'down'})\n`)

  const results: CaseResult[] = []
  for (const c of cases) {
    process.stdout.write(`  [${c.id}] ${c.name} ...`)
    const r = await runCase(c, rag)
    results.push(r)
    console.log(r.status === 'passed' ? ' ✅' : r.status === 'skipped' ? ' ⏭️' : r.status === 'error' ? ` 💥 ${r.error}` : ` ❌ ${r.passedAssertions}/${r.totalAssertions}`)
  }

  const scored = results.filter(r => r.status !== 'skipped')
  const totalAssertions = scored.reduce((n, r) => n + r.totalAssertions, 0)
  const passedAssertions = scored.reduce((n, r) => n + r.passedAssertions, 0)
  const byCategory: EvalReport['byCategory'] = {}
  for (const r of results) {
    const s = (byCategory[r.category] ??= { total: 0, passed: 0, failed: 0, skipped: 0 })
    s.total++
    if (r.status === 'passed') s.passed++
    else if (r.status === 'skipped') s.skipped++
    else s.failed++
  }
  const report: EvalReport = {
    timestamp: new Date().toISOString(), api: API, ragUp: rag,
    totalCases: results.length,
    passedCases: results.filter(r => r.status === 'passed').length,
    failedCases: results.filter(r => r.status === 'failed' || r.status === 'error').length,
    skippedCases: results.filter(r => r.status === 'skipped').length,
    totalAssertions, passedAssertions, byCategory, cases: results,
    score: totalAssertions ? Math.round((passedAssertions / totalAssertions) * 100) : 0,
  }
  print(report)
  mkdirSync('eval/reports', { recursive: true })
  const path = `eval/reports/report-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  writeFileSync(path, JSON.stringify(report, null, 2))
  console.log(`  report: ${path}\n`)
  process.exit(report.failedCases ? 1 : 0)
}

main().catch(err => { console.error('runner crashed:', err); process.exit(2) })
