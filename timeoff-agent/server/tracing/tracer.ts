/**
 * L2: designing for evaluability. One trace per chat turn, written to disk before
 * the reply leaves the server, so every later module (error analysis, judges,
 * CI, monitoring, cost profiling) reads the same record.
 *
 * Shape: a Trace has nested Spans. Kinds:
 *   turn   - the root span for the HTTP turn (created by withTrace)
 *   route  - the intent decision (session state, rules, or the classifier)
 *   llm    - one model call, with token usage and cost
 *   tool   - one tool execution (HR system, policy search, propose, submit)
 *   policy - a policy-search answer (RAG or local index) with the ACL filter result
 *   gate   - a permission or confirmation gate. denied=true is a permission denial.
 *
 * Context travels with AsyncLocalStorage, so tools and gates record themselves
 * without threading a tracer through every function signature.
 *
 * Storage: JSONL, one file per day, under TRACE_DIR (default ./traces). No
 * database to run; Langfuse or ClickHouse can be fed from the same records later.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export type SpanKind = 'turn' | 'route' | 'llm' | 'tool' | 'policy' | 'gate'

export interface Usage { input: number; output: number; cacheRead: number; cacheWrite: number }

export interface Span {
  spanId: string
  parentId?: string
  kind: SpanKind
  name: string
  startedAt: string
  durationMs: number
  input?: unknown
  output?: unknown
  error?: string
  model?: string
  usage?: Usage
  costUsd?: number
  stopReason?: string
  denied?: boolean
  reason?: string
  meta?: Record<string, unknown>
}

export interface TraceMeta {
  sessionId: string
  employeeId: string
  email: string
  role: string
  employeeType: string
  location: string
  input: string
  tags?: string[]
}

export interface Trace extends TraceMeta {
  schema: 'acme-trace/1'
  traceId: string
  startedAt: string
  durationMs: number
  mode: 'claude' | 'offline' | 'mixed'
  agent?: string
  intent?: string
  how?: string
  promptHash?: string
  toolsHash?: string
  models: string[]
  output: string
  spans: Span[]
  llmCalls: number
  toolCalls: number
  usage: Usage
  costUsd: number
  denials: { span: string; reason: string }[]
  error?: string
  tags: string[]
}

// ---------- pricing (USD per million tokens; cache write 1.25x, cache read 0.1x) ----------

const PRICES: Record<string, { input: number; output: number }> = {
  'claude-opus-5': { input: 5, output: 25 },
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-haiku-4-5-20251001': { input: 1, output: 5 },
}

export function costOf(model: string, u: Usage): number {
  const p = PRICES[model] ?? PRICES[Object.keys(PRICES).find(k => model.startsWith(k)) ?? ''] ?? { input: 0, output: 0 }
  const usd = (u.input * p.input + u.output * p.output + u.cacheWrite * p.input * 1.25 + u.cacheRead * p.input * 0.1) / 1_000_000
  return Math.round(usd * 1_000_000) / 1_000_000
}

// ---------- context ----------

interface Ctx { trace: Trace; stack: Span[] }
const als = new AsyncLocalStorage<Ctx>()

const MAX_FIELD = 24_000

/** Keep spans readable and files small: JSON-safe, size-capped copies of inputs and outputs. */
function clip(v: unknown): unknown {
  if (v === undefined) return undefined
  let s: string
  try { s = JSON.stringify(v) } catch { return String(v).slice(0, MAX_FIELD) }
  if (s === undefined) return undefined
  if (s.length <= MAX_FIELD) return JSON.parse(s)
  return { _truncated: true, _length: s.length, preview: s.slice(0, MAX_FIELD) }
}

export function hashOf(v: unknown): string {
  return createHash('sha256').update(typeof v === 'string' ? v : JSON.stringify(v)).digest('hex').slice(0, 12)
}

function zero(): Usage { return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }

export function currentTrace(): Trace | undefined {
  return als.getStore()?.trace
}

/** Run fn inside a new trace. The trace is written when fn settles, even on error. */
export async function withTrace<T>(meta: TraceMeta, fn: (trace: Trace) => Promise<T>): Promise<T> {
  const started = Date.now()
  const trace: Trace = {
    schema: 'acme-trace/1', traceId: randomUUID(), startedAt: new Date(started).toISOString(), durationMs: 0,
    ...meta, tags: meta.tags ?? [], mode: 'offline', models: [], output: '', spans: [],
    llmCalls: 0, toolCalls: 0, usage: zero(), costUsd: 0, denials: [],
  }
  const root: Span = { spanId: randomUUID(), kind: 'turn', name: 'chat_turn', startedAt: trace.startedAt, durationMs: 0, input: meta.input }
  trace.spans.push(root)
  const ctx: Ctx = { trace, stack: [root] }
  try {
    const out = await als.run(ctx, () => fn(trace))
    return out
  } catch (err) {
    trace.error = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
    throw err
  } finally {
    root.durationMs = Date.now() - started
    root.output = trace.output
    trace.durationMs = root.durationMs
    finalize(trace)
    store.write(trace)
  }
}

function finalize(trace: Trace) {
  const u = zero()
  let cost = 0
  const models = new Set<string>()
  let llm = 0, tools = 0
  for (const s of trace.spans) {
    if (s.kind === 'llm') { llm++; if (s.model) models.add(s.model); if (s.usage) { u.input += s.usage.input; u.output += s.usage.output; u.cacheRead += s.usage.cacheRead; u.cacheWrite += s.usage.cacheWrite }; cost += s.costUsd ?? 0 }
    if (s.kind === 'tool') tools++
    if (s.denied) trace.denials.push({ span: s.name, reason: s.reason ?? '' })
  }
  trace.usage = u
  trace.costUsd = Math.round(cost * 1_000_000) / 1_000_000
  trace.models = [...models]
  trace.llmCalls = llm
  trace.toolCalls = tools
}

/** Set top-level facts about the turn as they become known. */
export function setTrace(patch: Partial<Pick<Trace, 'mode' | 'agent' | 'intent' | 'how' | 'promptHash' | 'toolsHash' | 'output' | 'tags'>>) {
  const t = currentTrace()
  if (!t) return
  if (patch.tags) { t.tags = [...new Set([...t.tags, ...patch.tags])]; delete patch.tags }
  Object.assign(t, patch)
}

/** Wrap an async unit of work as a child span of whatever is running. Works outside a trace too (no-op). */
export async function span<T>(kind: SpanKind, name: string, input: unknown, fn: (s: Span) => Promise<T> | T, opts?: { output?: (r: T) => unknown }): Promise<T> {
  const ctx = als.getStore()
  if (!ctx) return fn({ spanId: '', kind, name, startedAt: '', durationMs: 0 })
  const started = Date.now()
  const parent = ctx.stack[ctx.stack.length - 1]
  const s: Span = { spanId: randomUUID(), parentId: parent?.spanId, kind, name, startedAt: new Date(started).toISOString(), durationMs: 0, input: clip(input) }
  ctx.trace.spans.push(s)
  ctx.stack.push(s)
  try {
    const out = await fn(s)
    s.output = clip(opts?.output ? opts.output(out) : out)
    return out
  } catch (err) {
    s.error = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
    throw err
  } finally {
    s.durationMs = Date.now() - started
    ctx.stack.pop()
  }
}

/** A point-in-time record: a gate decision, a denial, an ACL filter result. */
export function event(kind: SpanKind, name: string, data: { input?: unknown; output?: unknown; denied?: boolean; reason?: string; meta?: Record<string, unknown> }) {
  const ctx = als.getStore()
  if (!ctx) return
  const parent = ctx.stack[ctx.stack.length - 1]
  ctx.trace.spans.push({
    spanId: randomUUID(), parentId: parent?.spanId, kind, name, startedAt: new Date().toISOString(), durationMs: 0,
    input: clip(data.input), output: clip(data.output), denied: data.denied, reason: data.reason, meta: data.meta,
  })
}

/** Attach a model response's usage and cost to an llm span. */
export function recordLlm(s: Span, model: string, response: { stop_reason?: string | null; usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null } | null }) {
  s.model = model
  s.stopReason = response.stop_reason ?? undefined
  const u = response.usage
  s.usage = { input: u?.input_tokens ?? 0, output: u?.output_tokens ?? 0, cacheRead: u?.cache_read_input_tokens ?? 0, cacheWrite: u?.cache_creation_input_tokens ?? 0 }
  s.costUsd = costOf(model, s.usage)
  const t = currentTrace()
  if (t && t.mode === 'offline') t.mode = 'claude'
}

// ---------- storage ----------

class TraceStore {
  readonly dir: string
  private recent: Trace[] = []
  constructor(dir: string) {
    this.dir = dir
  }
  write(trace: Trace) {
    this.recent.push(trace)
    if (this.recent.length > 500) this.recent.shift()
    try {
      fs.mkdirSync(this.dir, { recursive: true })
      fs.appendFileSync(path.join(this.dir, `${trace.startedAt.slice(0, 10)}.jsonl`), JSON.stringify(trace) + '\n')
    } catch (err) {
      console.error('trace write failed:', err instanceof Error ? err.message : err)
    }
  }
  list(n = 50): Trace[] {
    return this.recent.slice(-n).reverse()
  }
  get(traceId: string): Trace | undefined {
    return this.recent.find(t => t.traceId === traceId)
  }
}

export const store = new TraceStore(process.env.TRACE_DIR ?? path.resolve(process.cwd(), 'traces'))
