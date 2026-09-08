import { useState } from 'react'
import type { ChatMessage, TraceStep, VacationOption } from '../../shared/types'
import Markdown from './Markdown'

function fmt(s: string) {
  return new Date(s + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export function Trace({ steps, label }: { steps: TraceStep[]; label?: string }) {
  const [open, setOpen] = useState(false)
  if (!steps.length) return null
  return (
    <div className="trace">
      <button className="trace-toggle" onClick={() => setOpen(o => !o)}>
        {label ?? `Worked through ${steps.length} step${steps.length === 1 ? '' : 's'}`} <span className="caret">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <ol className="trace-list">
          {steps.map((s, i) => (
            <li key={i}><code>{s.tool}</code><span>{s.summary}</span></li>
          ))}
        </ol>
      )}
    </div>
  )
}

function OptionCards({ options, onPick, disabled }: { options: VacationOption[]; onPick: (o: VacationOption) => void; disabled: boolean }) {
  return (
    <div className="option-grid">
      {options.map(o => (
        <div key={o.rank} className={`option-card ${o.rank === 1 ? 'best' : ''}`}>
          <div className="option-head">
            <span className="option-rank">Option {o.rank}{o.rank === 1 ? ' · recommended' : ''}</span>
            <span className={`chip ${o.coverageOk ? 'chip-ok' : 'chip-warn'}`}>{o.coverageOk ? 'Coverage OK' : 'Thin coverage'}</span>
          </div>
          <div className="option-dates">{fmt(o.startDate)} to {fmt(o.endDate)}</div>
          <div className="option-stat"><strong>{o.ptoDays}</strong> PTO day{o.ptoDays === 1 ? '' : 's'} for <strong>{o.totalDaysOff}</strong> days off ({fmt(o.offFrom)} to {fmt(o.offThrough)})</div>
          {o.holidaysIncluded.length > 0 && <div className="option-note">Holidays: {o.holidaysIncluded.join(', ')}</div>}
          <div className="option-note">{o.teammatesOut.length ? `Also out: ${o.teammatesOut.join('; ')}` : 'Nobody else on the team is out'}</div>
          <button className="btn-primary" disabled={disabled} onClick={() => onPick(o)}>Request these dates</button>
        </div>
      ))}
    </div>
  )
}

interface Props {
  msg: ChatMessage
  isLast: boolean
  disabled: boolean
  onSend: (text: string) => void
}

export default function TimeOffMessage({ msg, isLast, disabled, onSend }: Props) {
  return (
    <div className="assistant-body">
      <Markdown text={msg.content} />
      {msg.suggestions && msg.suggestions.length > 0 && (
        <OptionCards options={msg.suggestions} disabled={disabled || !isLast} onPick={o => onSend(`Request option ${o.rank}`)} />
      )}
      {msg.pending && isLast && (
        <div className="confirm-row">
          <button className="btn-primary" disabled={disabled} onClick={() => onSend('Yes, send it')}>Send to {msg.pending.approver}</button>
          <button className="btn-secondary" disabled={disabled} onClick={() => onSend('Cancel')}>Cancel</button>
        </div>
      )}
      {msg.submitted && (
        <div className="submitted-badge">✓ {msg.submitted.requestId} · pending with {msg.submitted.managerName}</div>
      )}
      {msg.trace && <Trace steps={msg.trace} />}
    </div>
  )
}
