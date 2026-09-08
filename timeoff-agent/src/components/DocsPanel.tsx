import { useEffect, useState } from 'react'
import Markdown from './Markdown'
import type { Persona } from '../personas'

export interface PolicyDocView {
  docId: string
  title: string
  allowed: boolean
  public: boolean
  allowedGroups: string[]
  allowedUsers: string[]
  words: number | null
  text: string | null
}

interface Props {
  token: string
  persona: Persona
  selected: string | null
  onSelect: (title: string | null) => void
}

export async function loadDocs(token: string, persona: Persona): Promise<{ docs: PolicyDocView[]; engine: 'rag' | 'local' }> {
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 6000)
    const res = await fetch(`/rag/api/docs?user=${encodeURIComponent(persona.ragUser)}`, { signal: ctrl.signal })
    clearTimeout(timer)
    if (res.ok) return { docs: await res.json(), engine: 'rag' }
  } catch { /* fall back */ }
  const res = await fetch('/api/policy/docs', { headers: { Authorization: `Bearer ${token}` } })
  return { docs: res.ok ? await res.json() : [], engine: 'local' }
}

function accessLabel(d: PolicyDocView) {
  if (d.public) return 'public'
  const parts = d.allowedGroups.map(g => g.replace('-', ' '))
  return parts.length ? `for ${parts.join(', ')}` : 'restricted'
}

export default function DocsPanel({ token, persona, selected, onSelect }: Props) {
  const [docs, setDocs] = useState<PolicyDocView[]>([])
  const [engine, setEngine] = useState<'rag' | 'local'>('rag')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    loadDocs(token, persona).then(r => {
      if (cancelled) return
      setDocs(r.docs)
      setEngine(r.engine)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [token, persona])

  // Documents the persona cannot read are not listed at all: a lock icon would still reveal they exist.
  const readable = docs.filter(d => d.allowed)
  const current = readable.find(d => d.title === selected) ?? null

  return (
    <div className="docs">
      <aside className="docs-list">
        <div className="docs-head">
          <div className="docs-title">Policy library</div>
          <div className="muted tiny">{loading ? 'Loading...' : `${readable.length} document${readable.length === 1 ? '' : 's'} available to ${persona.name.split(' ')[0]} · ${engine === 'rag' ? 'RAG index' : 'local index'}`}</div>
        </div>
        {readable.map(d => (
          <button key={d.docId} className={`doc-item ${d.title === selected ? 'active' : ''}`} onClick={() => onSelect(d.title)}>
            <span className="doc-icon">📄</span>
            <span className="doc-text">
              <span className="doc-name">{d.title}</span>
              <span className="doc-meta">{d.words} words · {accessLabel(d)}</span>
            </span>
          </button>
        ))}
      </aside>

      <section className="doc-reader">
        {!current && (
          <div className="doc-empty">
            <h2>Pick a document</h2>
            <p className="muted">These are the policies that apply to {persona.name.split(' ')[0]}. Search ranks only these, so nothing outside this list can reach an answer.</p>
          </div>
        )}
        {current && current.text && (
          <article>
            <div className="doc-crumb"><span className="chip chip-ok">Applies to you</span> <span className="muted tiny">{current.docId} · {accessLabel(current)}</span></div>
            <Markdown text={current.text} />
          </article>
        )}
      </section>
    </div>
  )
}
