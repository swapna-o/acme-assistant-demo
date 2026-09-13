import type { ChatMessage, Ticket } from '../../shared/types'
import Markdown from './Markdown'
import { Trace } from './TimeOffMessage'

interface Props {
  msg: ChatMessage
  isLast: boolean
  disabled: boolean
  onSend: (text: string) => void
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function TicketBadge({ t }: { t: Ticket }) {
  return (
    <div className={`ticket-badge status-${t.status}`}>
      <strong>{t.ticketId}</strong> · {t.subject} · {t.status.replace('_', ' ')}{t.ownerName ? ` · ${t.ownerName}` : ''}
    </div>
  )
}

export default function HelpMessage({ msg, isLast, disabled, onSend }: Props) {
  const h = msg.help ?? {}
  return (
    <div className="assistant-body">
      {msg.content && <Markdown text={msg.content} />}

      {h.article && (
        <div className="help-card">
          <div className="help-card-head">
            <span className="chip chip-muted">{h.article.articleId}</span>
            <strong>{h.article.title}</strong>
          </div>
          <ol className="help-steps">{h.article.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
          <div className="muted tiny">Published by {h.article.author} · {fmtTime(h.article.publishedAt)}{h.article.replaces ? ` · replaces ${h.article.replaces}` : ''}</div>
          {h.articleAsk && isLast && (
            <div className="confirm-row">
              <button className="btn-primary" disabled={disabled} onClick={() => onSend('It worked')}>It worked</button>
              <button className="btn-secondary" disabled={disabled} onClick={() => onSend('Still broken, I tried the steps')}>Still broken</button>
            </div>
          )}
        </div>
      )}

      {h.ticketDraft && isLast && (
        <div className="confirm-row">
          <button className="btn-primary" disabled={disabled} onClick={() => onSend('Yes, log it')}>Log the ticket</button>
          <button className="btn-secondary" disabled={disabled} onClick={() => onSend('Cancel')}>Cancel</button>
        </div>
      )}

      {h.liveAsk && isLast && (
        <div className="confirm-row">
          <button className="btn-primary" disabled={disabled} onClick={() => onSend('Yes, connect me')}>Connect me</button>
          <button className="btn-secondary" disabled={disabled} onClick={() => onSend('No, not now')}>Not now</button>
        </div>
      )}

      {h.ticket && <TicketBadge t={h.ticket} />}
      {h.tickets && h.tickets.map(t => <TicketBadge key={t.ticketId} t={t} />)}

      {h.similar && h.similar.length > 0 && (
        <div className="help-card">
          <div className="help-card-head"><strong>Cases like this</strong><span className="chip chip-warn">{h.similar.length} in 14 days</span></div>
          <table className="cal-table">
            <thead><tr><th>Ticket</th><th>Who</th><th>Subject</th><th>Status</th></tr></thead>
            <tbody>
              {h.similar.map(s => (
                <tr key={s.ticketId}><td>{s.ticketId}</td><td>{s.requesterName}</td><td>{s.subject}</td><td><span className={`chip status-${s.status}`}>{s.status.replace('_', ' ')}</span></td></tr>
              ))}
            </tbody>
          </table>
          {isLast && !h.articleDraft && h.similar.some(s => s.resolution) && (
            <div className="confirm-row">
              <button className="btn-primary" disabled={disabled} onClick={() => onSend('Yes, draft the article')}>Draft a help article</button>
            </div>
          )}
        </div>
      )}

      {h.articleDraft && isLast && (
        <div className="confirm-row">
          <button className="btn-primary" disabled={disabled} onClick={() => onSend('Publish')}>Publish to the knowledge base</button>
          <button className="btn-secondary" disabled={disabled} onClick={() => onSend('No, discard it')}>Discard</button>
        </div>
      )}

      {h.published && <div className="submitted-badge">✓ {h.published.articleId} published · {h.published.title}</div>}
      {h.liveChat && h.liveChat.status !== 'ended' && <div className="submitted-badge">● Live help {h.liveChat.status === 'waiting' ? 'requested, waiting for an agent' : `with ${h.liveChat.agentName}`}</div>}

      {msg.trace && <Trace steps={msg.trace} />}
    </div>
  )
}
