import { useState } from 'react'
import Markdown from './Markdown'
import type { PolicyAnswer } from '../../shared/types'

export type PolicyReply = PolicyAnswer

export default function PolicyMessage({ reply, onOpenDoc }: { reply: PolicyReply; onOpenDoc?: (title: string) => void }) {
  const [open, setOpen] = useState(false)
  const [showSources, setShowSources] = useState(false)
  const visible = reply.shelf.filter(d => d.allowed)
  // Never surface documents outside the persona's scope, not even as a count or a lock.
  const scrub = (s: string) => s.replace(/\s*·\s*locked:.*$/i, '').replace(/\d+ of \d+ documents visible/i, `${visible.length} document${visible.length === 1 ? '' : 's'} in scope`)

  return (
    <div className="assistant-body">
      <button className="trace-toggle" onClick={() => setOpen(o => !o)}>
        Checked access · {visible.length} document{visible.length === 1 ? ' applies' : 's apply'} to you <span className="caret">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="shelf">
          <div className="shelf-cols single">
            <div>
              <div className="shelf-label">Searched for you</div>
              {visible.map(d => <div key={d.title} className="shelf-doc ok">✓ {d.title}</div>)}
            </div>
          </div>
          <ol className="trace-list">
            {reply.trace.map((t, i) => <li key={i}><code>{t.step}</code><span>{scrub(t.detail)}</span></li>)}
          </ol>
        </div>
      )}

      {reply.abstained
        ? <div className="abstain">Nothing in the policies that apply to you covers this. If you think it should, contact HR.</div>
        : <Markdown text={reply.answer} />}

      {reply.retrieved.length > 0 && (
        <div className="sources">
          <div className="source-row">
            <button className="trace-toggle" onClick={() => setShowSources(s => !s)}>
              Sources <span className="caret">{showSources ? '▾' : '▸'}</span>
            </button>
            {(reply.sources.length ? reply.sources : [reply.retrieved[0].title.split(' / ')[0]]).map(t => (
              <button key={t} className="source-chip" onClick={() => onOpenDoc?.(t)} title="Open the document">{t} ↗</button>
            ))}
          </div>
          {showSources && (
            <div className="source-list">
              {reply.retrieved.map((r, i) => (
                <div key={i} className="source-item">
                  <div className="source-title">
                    <button className="linkish" onClick={() => onOpenDoc?.(r.title.split(' / ')[0])}>{r.title}</button>
                    <span className="muted"> · relevance {r.score}</span>
                  </div>
                  <div className="source-excerpt">{r.excerpt}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="engine-note">
        {[
          reply.engine === 'rag' ? 'Embeddings search over the policy index' : 'Local keyword index (RAG service offline)',
          reply.model === 'extractive' ? 'verbatim policy text' : reply.model,
          `${Math.round(reply.elapsed_ms)} ms`,
        ].filter(Boolean).join(' · ')}
      </div>
    </div>
  )
}
