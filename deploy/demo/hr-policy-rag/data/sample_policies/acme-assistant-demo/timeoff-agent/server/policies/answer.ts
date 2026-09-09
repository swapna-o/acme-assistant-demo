/**
 * Policy answers for the Ask thread: the Python RAG first (embeddings search,
 * ACL filtering, the same demo Swapna built), the local keyword index if it is
 * not running. Both return the same shape so the UI does not care which ran.
 */
import { searchPolicies, groupsFor, canSee, POLICY_DOCS } from './index.js'
import type { Employee, PolicyAnswer } from '../../shared/types.js'

const RAG_URL = process.env.RAG_URL ?? 'http://localhost:8930'

const MISS = "I don't have a policy document that covers that question, or you may not have access to the relevant document. Please contact HR for help."

export function localPolicyAnswer(emp: Employee, question: string): PolicyAnswer {
  const started = Date.now()
  const r = searchPolicies(question, emp, 4)
  const groups = groupsFor(emp)
  const shelf = POLICY_DOCS.map(d => ({ title: d.title, allowed: canSee(d, groups) }))
    .sort((a, b) => Number(b.allowed) - Number(a.allowed) || a.title.localeCompare(b.title))
  const top = r.hits[0]
  return {
    answer: top ? `${top.text}\n\n[${top.title} / ${top.heading}]` : MISS,
    abstained: !top,
    sources: top ? [top.title] : [],
    model: 'extractive',
    engine: 'local',
    shelf,
    trace: [
      { step: "Resolved who's asking", detail: `${emp.email} · groups: ${groups.join(', ')}` },
      { step: 'Checked access before searching', detail: `${r.visibleDocs.length} documents in scope` },
      { step: 'Searched the allowed documents', detail: `ranked ${r.visibleDocs.length} document${r.visibleDocs.length === 1 ? '' : 's'} by keyword overlap (local index)` },
      top ? { step: 'Found the passage', detail: `${top.title} / ${top.heading} · score ${top.score.toFixed(2)}` }
          : { step: 'Nothing cleared both gates', detail: 'no accessible passage matched, so abstain' },
    ],
    elapsed_ms: Date.now() - started,
    retrieved: r.hits.map(h => ({ title: `${h.title} / ${h.heading}`, score: Math.round(h.score * 1000) / 1000, excerpt: h.text })),
  }
}

/** Strip anything that would reveal a document outside the asker's scope: locked shelf entries, locked names or counts in the trace. */
export function redact(p: PolicyAnswer): PolicyAnswer {
  const visible = p.shelf.filter(d => d.allowed)
  const inScope = `${visible.length} document${visible.length === 1 ? '' : 's'} in scope`
  return {
    ...p,
    shelf: visible,
    trace: p.trace.map(t => ({
      step: t.step,
      detail: t.detail.replace(/\s*·\s*locked:.*$/i, '').replace(/\d+ of \d+ documents visible/i, inScope),
    })),
  }
}

export async function policyAnswer(emp: Employee, question: string): Promise<PolicyAnswer> {
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 6000)
    const res = await fetch(`${RAG_URL}/api/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: emp.ragUser, question }),
      signal: ctrl.signal,
    })
    clearTimeout(timer)
    if (res.ok) {
      const data = await res.json() as Omit<PolicyAnswer, 'engine'>
      return redact({ ...data, engine: 'rag' })
    }
  } catch {
    // RAG not running; fall through
  }
  return redact(localPolicyAnswer(emp, question))
}
