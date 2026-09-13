/**
 * L2: read traces without a database.
 *   npx tsx scripts/traces.ts            latest 20 turns, one line each
 *   npx tsx scripts/traces.ts <traceId>  the full span tree for one turn
 *   npx tsx scripts/traces.ts --json     latest 20 as JSON
 * Reads traces/*.jsonl (or TRACE_DIR).
 */
import fs from 'node:fs'
import path from 'node:path'
import type { Trace, Span } from '../server/tracing/tracer.js'

const dir = process.env.TRACE_DIR ?? path.resolve(process.cwd(), 'traces')
const arg = process.argv[2]

function readAll(): Trace[] {
  if (!fs.existsSync(dir)) return []
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl')).sort()
  const out: Trace[] = []
  for (const f of files) for (const line of fs.readFileSync(path.join(dir, f), 'utf8').split('\n')) if (line.trim()) out.push(JSON.parse(line))
  return out
}

function short(s: string, n = 60): string {
  const one = s.replace(/\s+/g, ' ').trim()
  return one.length > n ? one.slice(0, n - 1) + '…' : one
}

function tree(spans: Span[], parentId: string | undefined, depth: number): string[] {
  const lines: string[] = []
  for (const s of spans.filter(x => x.parentId === parentId)) {
    const flags = [s.denied ? 'DENIED' : '', s.error ? `ERROR ${s.error}` : '', s.model ? `${s.model} ${s.usage?.input ?? 0}in/${s.usage?.output ?? 0}out $${s.costUsd?.toFixed(4)}` : '', s.reason ? `(${s.reason})` : ''].filter(Boolean).join(' ')
    lines.push(`${'  '.repeat(depth)}${s.kind.padEnd(6)} ${s.name.padEnd(26)} ${String(s.durationMs).padStart(6)}ms  ${flags}`)
    if (s.input !== undefined && depth > 0 && s.kind !== 'llm') lines.push(`${'  '.repeat(depth + 1)}in:  ${short(JSON.stringify(s.input), 110)}`)
    if (s.output !== undefined && depth > 0 && s.kind !== 'llm') lines.push(`${'  '.repeat(depth + 1)}out: ${short(JSON.stringify(s.output), 110)}`)
    lines.push(...tree(spans, s.spanId, depth + 1))
  }
  return lines
}

const all = readAll()
if (arg && arg !== '--json') {
  const t = all.find(x => x.traceId.startsWith(arg))
  if (!t) { console.error(`no trace starting with ${arg} in ${dir}`); process.exit(1) }
  console.log(`trace ${t.traceId}\n${t.startedAt} · ${t.email} (${t.role}, ${t.employeeType}) · mode ${t.mode} · agent ${t.agent} · intent ${t.intent} (${t.how})`)
  console.log(`prompt ${t.promptHash ?? '-'} · tools ${t.toolsHash ?? '-'} · models ${t.models.join(',') || '-'} · ${t.llmCalls} llm calls, ${t.toolCalls} tool calls · $${t.costUsd} · ${t.durationMs}ms${t.denials.length ? ` · DENIALS ${t.denials.map(d => `${d.span}: ${d.reason}`).join('; ')}` : ''}${t.error ? ` · ERROR ${t.error}` : ''}`)
  console.log(`\nUSER: ${t.input}\nASSISTANT: ${t.output}\n`)
  console.log(tree(t.spans, undefined, 0).join('\n'))
} else {
  const latest = all.slice(-20)
  if (arg === '--json') { console.log(JSON.stringify(latest, null, 2)); process.exit(0) }
  console.log(`${all.length} traces in ${dir}; latest ${latest.length}:\n`)
  for (const t of latest) {
    console.log(`${t.traceId.slice(0, 8)}  ${t.startedAt.slice(11, 19)}  ${t.email.split('@')[0].padEnd(14)} ${t.mode.padEnd(7)} ${(t.agent ?? '-').padEnd(13)} ${String(t.llmCalls).padStart(2)}llm ${String(t.toolCalls).padStart(2)}tool $${t.costUsd.toFixed(4)} ${String(t.durationMs).padStart(6)}ms ${t.denials.length ? 'DENY ' : ''}${t.error ? 'ERR ' : ''} ${short(t.input, 40).padEnd(40)} → ${short(t.output, 50)}`)
  }
}
