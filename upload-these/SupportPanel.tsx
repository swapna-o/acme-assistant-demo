import { useCallback, useEffect, useState } from 'react'
import type { LiveChat, Notification, Ticket } from '../../shared/types'

interface Props {
  token: string
  readOnly: boolean
  onAsk: (text: string) => void
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

interface Queue { tickets: Ticket[]; chats: LiveChat[]; notifications: Notification[] }

export default function SupportPanel({ token, readOnly, onAsk }: Props) {
  const [q, setQ] = useState<Queue | null>(null)
  const [activeChat, setActiveChat] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [basis, setBasis] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/support/queue', { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) setQ(await res.json())
    } catch { /* transient */ }
  }, [token])

  useEffect(() => {
    load()
    const id = setInterval(load, 2000)
    return () => clearInterval(id)
  }, [load])

  async function join(chatId: string) {
    setBusy(true); setError('')
    try {
      const res = await fetch(`/api/livechat/${chatId}/join`, { method: 'POST', headers })
      if (!res.ok) { setError((await res.json()).error ?? 'Could not join'); return }
      const data = await res.json() as { chat: LiveChat; suggestion: { text: string; basis: string[] } | null }
      setActiveChat(chatId)
      setDraft(data.suggestion?.text ?? '')
      setBasis(data.suggestion?.basis ?? [])
      await load()
    } finally { setBusy(false) }
  }

  async function sendMessage() {
    if (!activeChat || !draft.trim()) return
    setBusy(true); setError('')
    try {
      const res = await fetch(`/api/livechat/${activeChat}/message`, { method: 'POST', headers, body: JSON.stringify({ text: draft.trim() }) })
      if (!res.ok) { setError((await res.json()).error ?? 'Could not send'); return }
      setDraft(''); setBasis([])
      await load()
    } finally { setBusy(false) }
  }

  async function resolve(ticketId: string) {
    setBusy(true); setError('')
    try {
      const res = await fetch(`/api/support/tickets/${ticketId}/resolve`, { method: 'POST', headers, body: JSON.stringify({ note: 'Resolved by IT support.' }) })
      if (!res.ok) setError((await res.json()).error ?? 'Could not resolve')
      await load()
    } finally { setBusy(false) }
  }

  async function endChat(chatId: string) {
    setBusy(true)
    try {
      await fetch(`/api/livechat/${chatId}/end`, { method: 'POST', headers })
      if (activeChat === chatId) { setActiveChat(null); setDraft('') }
      await load()
    } finally { setBusy(false) }
  }

  if (!q) return <div className="panel"><p className="muted">Loading...</p></div>

  const open = q.tickets.filter(t => t.status !== 'resolved')
  const resolved = q.tickets.filter(t => t.status === 'resolved')
  const liveChats = q.chats.filter(c => c.status !== 'ended')
  const current = activeChat ? q.chats.find(c => c.chatId === activeChat) : undefined
  const currentTicket = current?.ticketId ? q.tickets.find(t => t.ticketId === current.ticketId) : undefined

  return (
    <div className="panel">
      <h1 className="panel-title">{readOnly ? 'IT queue (read-only)' : 'Support queue'}</h1>
      {error && <div className="error-msg">{error}</div>}

      {!readOnly && (
        <section>
          <h2>Live help <span className="count">{liveChats.length}</span></h2>
          {liveChats.length === 0 && <p className="muted">Nobody is waiting. When an employee asks for a person, the chat shows up here with their ticket attached.</p>}
          <div className="pending-grid">
            {liveChats.map(c => (
              <div key={c.chatId} className={`pending-card ${c.chatId === activeChat ? 'live-active' : ''}`}>
                <div className="pending-head">
                  <strong>{c.employeeName}</strong>
                  <span className={`chip ${c.status === 'waiting' ? 'chip-warn' : 'chip-ok'}`}>{c.status === 'waiting' ? 'waiting' : `with ${c.agentName}`}</span>
                </div>
                <div className="muted">{c.chatId} · {fmtTime(c.createdAt)}{c.ticketId ? ` · ticket ${c.ticketId} attached` : ' · no ticket'}</div>
                {c.chatId !== activeChat && (
                  <div className="confirm-row">
                    <button className="btn-primary" disabled={busy} onClick={() => join(c.chatId)}>{c.status === 'waiting' ? 'Join' : 'Open'}</button>
                    <button className="btn-secondary" disabled={busy} onClick={() => endChat(c.chatId)}>End chat</button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {current && current.status !== 'ended' && (
            <div className="support-chat">
              <div className="support-chat-head">
                <strong>Live help with {current.employeeName}</strong>
                {currentTicket && <span className="muted"> · {currentTicket.ticketId}: {currentTicket.subject} · tried: {currentTicket.tried.join('; ') || 'nothing yet'}</span>}
              </div>
              <div className="support-chat-log">
                {current.messages.map(m => (
                  <div key={m.id} className={`live-line from-${m.from}`}><span className="live-name">{m.name}</span><span>{m.text}</span></div>
                ))}
              </div>
              {basis.length > 0 && draft && <div className="suggestion-label">Suggested by the assistant from {basis.join(' and ')}. Edit or send; nothing goes out without you.</div>}
              <textarea className="support-reply" rows={3} value={draft} onChange={e => setDraft(e.target.value)} placeholder="Reply to the employee" disabled={busy} />
              <div className="confirm-row">
                <button className="btn-primary" disabled={busy || !draft.trim()} onClick={sendMessage}>Send</button>
                {currentTicket && currentTicket.status !== 'resolved' && <button className="btn-secondary" disabled={busy} onClick={() => resolve(currentTicket.ticketId)}>Resolve {currentTicket.ticketId}</button>}
                <button className="btn-secondary" disabled={busy} onClick={() => endChat(current.chatId)}>End chat</button>
              </div>
            </div>
          )}
        </section>
      )}

      <section>
        <h2>Open tickets <span className="count">{open.length}</span></h2>
        {open.length === 0 && <p className="muted">The queue is empty.</p>}
        <table className="cal-table">
          <thead><tr><th>Ticket</th><th>Who</th><th>Subject</th><th>Priority</th><th>Status</th><th>Opened</th>{!readOnly && <th></th>}</tr></thead>
          <tbody>
            {open.map(t => (
              <tr key={t.ticketId}>
                <td>{t.ticketId}</td><td>{t.requesterName}</td><td>{t.subject}{t.tried.length ? <span className="muted"> · tried: {t.tried.join('; ')}</span> : null}</td>
                <td>{t.priority}</td><td><span className={`chip status-${t.status}`}>{t.status.replace('_', ' ')}</span></td><td className="muted">{fmtTime(t.createdAt)}</td>
                {!readOnly && (
                  <td className="row-actions">
                    <button className="linkish" onClick={() => onAsk(`Open ${t.ticketId}`)}>Open in Ask</button>
                    <button className="linkish" disabled={busy} onClick={() => resolve(t.ticketId)}>Resolve</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Resolved <span className="muted small">last 14 days</span></h2>
        <ul className="decided-list">
          {resolved.map(t => (
            <li key={t.ticketId}>
              <span className="chip status-resolved">resolved</span>
              <strong>{t.ticketId}</strong> {t.requesterName} · {t.subject}
              {t.replies.filter(r => r.fromRole === 'support').at(-1) && <span className="muted"> · "{t.replies.filter(r => r.fromRole === 'support').at(-1)!.text}"</span>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
