import express from 'express'
import cors from 'cors'
import { v4 as uuidv4 } from 'uuid'
import { chat, clearAllSessions, clearSession, agentMode, route } from './agents/orchestrator.js'
import { describe } from './agents/intent.js'
import { groupsFor, canSee, POLICY_DOCS } from './policies/index.js'
import { policyAnswer } from './policies/answer.js'
import * as db from './workday/mock-data.js'
import type { ManagerDashboard, Role } from '../shared/types.js'

const app = express()
const PROD = process.env.NODE_ENV === 'production'
app.disable('x-powered-by')
app.set('trust proxy', 1) // behind the host's proxy, so req.ip is the visitor, not the proxy

// Security headers on every response. The client is same-origin, so the CSP can be strict.
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
  if (PROD) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  next()
})
// In dev the Vite client runs on another port and needs CORS. In production the client is
// served from this same origin, so no cross-origin access is allowed at all.
if (!PROD) app.use(cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173'] }))
app.use(express.json({ limit: '16kb' }))

// Simple per-IP rate limit, in memory: enough to stop a script from hammering the demo.
const buckets = new Map<string, { n: number; reset: number }>()
function rateLimit(max: number, windowMs: number) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    // Local callers (the eval suite, smoke scripts) are never limited. Behind the host's
    // proxy every visitor arrives with a real address, so this never matches in production.
    if (['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.ip ?? '')) return next()
    const key = `${req.ip}|${max}`
    const now = Date.now()
    const b = buckets.get(key)
    if (!b || b.reset < now) { buckets.set(key, { n: 1, reset: now + windowMs }); return next() }
    if (++b.n > max) { res.setHeader('Retry-After', String(Math.ceil((b.reset - now) / 1000))); res.status(429).json({ error: 'Too many requests, slow down a little.' }); return }
    next()
  }
}
setInterval(() => { const now = Date.now(); for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k) }, 60_000).unref()
app.use('/api/', rateLimit(240, 60_000))
app.use('/api/chat', rateLimit(40, 60_000))
app.use('/api/policy/ask', rateLimit(40, 60_000))
app.use('/api/auth/sso-login', rateLimit(30, 60_000))

const MAX_MESSAGE = 1000
function cleanMessage(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim()
  return t && t.length <= MAX_MESSAGE ? t : null
}

// --- Mock SSO ---

interface SSOSession {
  employeeId: string
  email: string
  name: string
  role: Role
  chatSessionId: string
}

const ssoSessions = new Map<string, SSOSession & { seen: number }>()
const MAX_SESSIONS = 500
const SESSION_TTL = 2 * 60 * 60 * 1000

function auth(req: express.Request): SSOSession | undefined {
  const token = req.headers.authorization?.replace('Bearer ', '')
  const s = token ? ssoSessions.get(token) : undefined
  if (!s) return undefined
  if (Date.now() - s.seen > SESSION_TTL) { ssoSessions.delete(token!); clearSession(s.chatSessionId); return undefined }
  s.seen = Date.now()
  return s
}
function pruneSessions() {
  const now = Date.now()
  for (const [t, s] of ssoSessions) if (now - s.seen > SESSION_TTL) { ssoSessions.delete(t); clearSession(s.chatSessionId) }
  while (ssoSessions.size > MAX_SESSIONS) { const [t, s] = ssoSessions.entries().next().value as [string, SSOSession & { seen: number }]; ssoSessions.delete(t); clearSession(s.chatSessionId) }
}
setInterval(pruneSessions, 5 * 60_000).unref()

app.post('/api/auth/sso-login', (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase().slice(0, 120) : ''
  if (!email) {
    res.status(400).json({ error: 'Email required' })
    return
  }
  const employeeId = db.emailToEmployeeId[email]
  if (!employeeId) {
    res.status(401).json({ error: 'Employee not found. Try alex.chen@acme.com or jordan.park@acme.com' })
    return
  }
  const emp = db.employees[employeeId]
  const token = uuidv4()
  pruneSessions()
  ssoSessions.set(token, { employeeId, email, name: emp.name, role: emp.role, chatSessionId: uuidv4(), seen: Date.now() })
  res.json({ token, user: { employeeId, email, name: emp.name, role: emp.role } })
})

app.get('/api/auth/me', (req, res) => {
  const s = auth(req)
  if (!s) { res.status(401).json({ error: 'Not authenticated' }); return }
  res.json({ employeeId: s.employeeId, email: s.email, name: s.name, role: s.role })
})

// --- Eval reset ---

function resetEverything() {
  db.resetMockData()
  clearAllSessions()
  ssoSessions.clear()
}
const RESET_MINUTES = Number(process.env.DEMO_RESET_MINUTES ?? (PROD ? 30 : 0))
if (RESET_MINUTES > 0) setInterval(resetEverything, RESET_MINUTES * 60_000).unref()

// The reset endpoint exists for the eval suite. It only answers from this machine, or with
// the EVAL_RESET_TOKEN if one is set, so a visitor cannot wipe the demo mid-walkthrough.
app.post('/api/eval/reset', (req, res) => {
  const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.ip ?? '') || req.socket.remoteAddress === '127.0.0.1'
  const token = process.env.EVAL_RESET_TOKEN
  if (!local && !(token && req.headers['x-reset-token'] === token)) { res.status(403).json({ error: 'reset is not available here' }); return }
  resetEverything()
  res.json({ ok: true, message: 'Mock data, sessions, and auth state reset to initial values' })
})

// --- Employee chat ---

app.post('/api/chat', async (req, res) => {
  const s = auth(req)
  if (!s) { res.status(401).json({ error: 'Not authenticated' }); return }
  const message = cleanMessage(req.body?.message)
  if (!message) { res.status(400).json({ error: `Message required, up to ${MAX_MESSAGE} characters` }); return }
  try {
    // The orchestrator decides which use case owns this turn, and says why in the trace.
    const decision = await route(s.chatSessionId, s.employeeId, message)
    if (decision.agent !== 'policy_search') {
      res.json(await chat(s.chatSessionId, s.employeeId, message, decision))
      return
    }
    const p = await policyAnswer(db.employees[s.employeeId], message)
    p.trace.unshift({ step: 'Orchestrator', detail: describe(decision) })
    res.json({
      agentLabel: 'Policy search',
      role: 'assistant',
      content: p.answer,
      timestamp: new Date().toISOString(),
      policy: p,
      trace: p.trace.map(t => ({ tool: t.step, summary: t.detail })),
    })
  } catch (err) {
    console.error('Chat error:', err)
    res.status(500).json({ error: 'Agent error, check server logs' })
  }
})

app.post('/api/chat/reset', (req, res) => {
  const s = auth(req)
  if (!s) { res.status(401).json({ error: 'Not authenticated' }); return }
  clearSession(s.chatSessionId)
  res.json({ ok: true })
})

// Policy answer: the RAG first, the local index as fallback.
app.post('/api/policy/ask', async (req, res) => {
  const s = auth(req)
  if (!s) { res.status(401).json({ error: 'Not authenticated' }); return }
  const question = cleanMessage(req.body?.question)
  if (!question) { res.status(400).json({ error: `Question required, up to ${MAX_MESSAGE} characters` }); return }
  res.json(await policyAnswer(db.employees[s.employeeId], question))
})

// Local document library, same shape as the Python demo's /api/docs.
app.get('/api/policy/docs', (req, res) => {
  const s = auth(req)
  if (!s) { res.status(401).json({ error: 'Not authenticated' }); return }
  const emp = db.employees[s.employeeId]
  const groups = groupsFor(emp)
  const docs = POLICY_DOCS.map(d => {
    const allowed = canSee(d, groups)
    return {
      docId: d.docId, title: d.title, allowed, public: d.allowedGroups.length === 0,
      allowedGroups: d.allowedGroups, allowedUsers: [] as string[],
      words: allowed ? d.body.split(/\s+/).length : null, text: allowed ? d.body : null,
    }
  }).filter(d => d.allowed).sort((a, b) => a.title.localeCompare(b.title))
  res.json(docs)
})

app.get('/api/notifications', (req, res) => {
  const s = auth(req)
  if (!s) { res.status(401).json({ error: 'Not authenticated' }); return }
  const unread = db.getNotifications(s.employeeId, true)
  db.markNotificationsRead(s.employeeId)
  res.json(unread)
})

app.get('/api/requests', (req, res) => {
  const s = auth(req)
  if (!s) { res.status(401).json({ error: 'Not authenticated' }); return }
  res.json(db.getTimeOffRequests(s.employeeId))
})

// --- Manager view ---

function addDays(s: string, n: number): string {
  const d = new Date(s + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

app.get('/api/manager/dashboard', (req, res) => {
  const s = auth(req)
  if (!s) { res.status(401).json({ error: 'Not authenticated' }); return }
  if (s.role !== 'manager' && s.role !== 'hr_admin') { res.status(403).json({ error: 'Manager or HR access only' }); return }

  const manager = db.employees[s.employeeId]
  const orgWide = s.role === 'hr_admin'
  const team = orgWide ? Object.values(db.employees).filter(e => e.employeeId !== manager.employeeId) : db.teamOf(manager.employeeId)
  const teamIds = new Set(team.map(e => e.employeeId))
  const requests = orgWide ? db.getAllRequests().filter(r => teamIds.has(r.employeeId)) : db.getTeamRequests(manager.employeeId)
  const today = new Date().toISOString().slice(0, 10)
  const horizonEnd = addDays(today, 120)
  const calendar = requests
    .filter(r => (r.status === 'pending' || r.status === 'approved') && r.endDate >= today && r.startDate <= horizonEnd)
    .map(r => ({ employeeId: r.employeeId, name: r.employeeName, startDate: r.startDate, endDate: r.endDate, leaveType: r.leaveTypeName, status: r.status, requestId: r.requestId }))
    .sort((a, b) => a.startDate.localeCompare(b.startDate))

  const coverage: ManagerDashboard['coverage'] = []
  for (let d = today; d <= horizonEnd; d = addDays(d, 1)) {
    const dow = new Date(d + 'T12:00:00').getDay()
    if (dow === 0 || dow === 6 || db.isHoliday(d, manager.location)) continue
    const out = calendar.filter(c => c.startDate <= d && c.endDate >= d).map(c => c.name)
    if (out.length === 0) continue
    const present = team.length - out.length
    coverage.push({ date: d, out, present, teamSize: team.length, ok: present / team.length >= 0.6 })
  }

  const byDate = (a: { submittedAt: string }, b: { submittedAt: string }) => b.submittedAt.localeCompare(a.submittedAt)
  const dashboard: ManagerDashboard = {
    manager,
    team: team.map(e => ({ employee: e, balances: db.getLeaveBalances(e.employeeId), requests: requests.filter(r => r.employeeId === e.employeeId) })),
    pending: requests.filter(r => r.status === 'pending').sort((a, b) => a.submittedAt.localeCompare(b.submittedAt)),
    decided: requests.filter(r => r.status !== 'pending').sort(byDate),
    calendar,
    holidays: [...db.getCompanyHolidays(manager.location, Number(today.slice(0, 4))), ...db.getCompanyHolidays(manager.location, Number(today.slice(0, 4)) + 1)].filter(h => h.date >= today && h.date <= horizonEnd),
    coverage,
    notifications: db.getNotifications(manager.employeeId),
  }
  res.json(dashboard)
})

app.post('/api/manager/requests/:id/decision', (req, res) => {
  const s = auth(req)
  if (!s) { res.status(401).json({ error: 'Not authenticated' }); return }
  if (s.role !== 'manager') { res.status(403).json({ error: 'Manager access only' }); return }
  const { decision, note } = req.body as { decision: 'approved' | 'denied'; note?: string }
  if (decision !== 'approved' && decision !== 'denied') { res.status(400).json({ error: 'decision must be approved or denied' }); return }
  const existing = db.getRequest(req.params.id)
  if (!existing) { res.status(404).json({ error: 'Request not found' }); return }
  if (db.employees[existing.employeeId]?.manager.id !== s.employeeId) { res.status(403).json({ error: 'Not your report' }); return }
  try {
    db.markNotificationsRead(s.employeeId)
    res.json(db.decideRequest(String(req.params.id).slice(0, 40), decision, typeof note === 'string' ? note.slice(0, 500) : note))
  } catch (err) {
    res.status(409).json({ error: err instanceof Error ? err.message : 'Could not decide' })
  }
})

// In production the built client is served from the same origin as the API, so the
// relative /api calls in the client need no configuration. In dev, Vite serves the client.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
const here = path.dirname(fileURLToPath(import.meta.url))
const clientDir = [path.resolve(here, '..', '..', 'client'), path.resolve(here, '..', 'client')].find(d => fs.existsSync(path.join(d, 'index.html'))) ?? ''
if (clientDir) {
  app.use(express.static(clientDir))
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(clientDir, 'index.html')))
}

const PORT = Number(process.env.PORT ?? 3001)
app.listen(PORT, () => {
  console.log(`Time-off agent server on http://localhost:${PORT} (agent mode: ${agentMode()})`)
  console.log('Demo accounts: alex.chen@acme.com (employee), jordan.park@acme.com (manager)')
})
