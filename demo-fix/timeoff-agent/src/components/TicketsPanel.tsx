import { useEffect, useState } from 'react'
import type { Ticket } from '../../shared/types'

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function TicketsPanel({ token }: { token: string }) {
  const [tickets, setTickets] = useState<Ticket[] | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch('/api/tickets', { headers: { Authorization: `Bearer ${token}` } })
        if (res.ok && !cancelled) setTickets(await res.json())
      } catch { /* transient */ }
    }
    load()
    const id = setInterval(load, 4000)
    return () => { cancelled = true; clearInterval(id) }
  }, [token])

  if (!tickets) return <div className="panel"><p className="muted">Loading...</p></div>

  return (
    <div className="panel">
      <h1 className="panel-title">My tickets</h1>
      {tickets.length === 0 && <p className="muted">Nothing yet. Tell the assistant what is broken; it starts with the knowledge base and logs a ticket only if the fix does not work.</p>}
      <div className="pending-grid">
        {tickets.map(t => (
          <div key={t.ticketId} className="pending-card">
            <div className="pending-head">
              <span className={`chip status-${t.status}`}>{t.status.replace('_', ' ')}</span>
              <span className="muted">{t.ticketId} · {fmtTime(t.createdAt)}</span>
            </div>
            <div className="pending-dates">{t.subject}</div>
            <div className="muted">{t.category} · {t.priority} · owned by {t.ownerName ?? 'the IT queue'}{t.offeredArticle ? ` · offered ${t.offeredArticle} first` : ''}</div>
            {t.tried.length > 0 && <div className="muted">Already tried: {t.tried.join('; ')}</div>}
            {t.replies.filter(r => r.fromRole !== 'system').map((r, i) => (
              <div key={i} className={`coverage-note ${r.fromRole === 'support' ? 'ok' : ''}`}>{r.from} · {fmtTime(r.at)}: {r.text}</div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
