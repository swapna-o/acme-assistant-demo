import { useEffect, useState } from 'react'
import type { TimeOffRequest } from '../../shared/types'

function fmt(s: string) {
  return new Date(s + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function RequestsPanel({ token }: { token: string }) {
  const [reqs, setReqs] = useState<TimeOffRequest[] | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch('/api/requests', { headers: { Authorization: `Bearer ${token}` } })
        if (res.ok && !cancelled) setReqs(await res.json())
      } catch { /* transient */ }
    }
    load()
    const id = setInterval(load, 4000)
    return () => { cancelled = true; clearInterval(id) }
  }, [token])

  if (!reqs) return <div className="panel"><p className="muted">Loading...</p></div>
  const sorted = [...reqs].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))

  return (
    <div className="panel">
      <h1 className="panel-title">My requests</h1>
      {sorted.length === 0 && <p className="muted">Nothing yet. Ask for time off in the Ask thread and it will show up here.</p>}
      <div className="pending-grid">
        {sorted.map(r => (
          <div key={r.requestId} className="pending-card">
            <div className="pending-head">
              <span className={`chip status-${r.status}`}>{r.status}</span>
              <span className="muted">{r.requestId} · {fmtTime(r.submittedAt)}</span>
            </div>
            <div className="pending-dates">{fmt(r.startDate)} to {fmt(r.endDate)}</div>
            {r.details ? (
              <>
                <div className="muted">{r.leaveTypeName} · {r.details.entitlementWeeks} weeks, {r.details.paidWeeks} paid{r.details.jobProtectionWeeks ? ` · ${r.details.jobProtectionWeeks} weeks FMLA protection` : ''} · routed to {r.details.routedTo.join(' and ')}</div>
                <div className="muted">Attach: {r.details.documents.join('; ')}</div>
              </>
            ) : (
              <div className="muted">{r.leaveTypeName} · {r.totalDays} day{r.totalDays === 1 ? '' : 's'} ({r.totalHours} hrs) · approver {r.managerName}</div>
            )}
            {r.comment && <div className="muted">Note: "{r.comment}"</div>}
            {r.decisionNote && <div className={`coverage-note ${r.status === 'approved' ? 'ok' : 'warn'}`}>{r.managerName}: "{r.decisionNote}"</div>}
          </div>
        ))}
      </div>
    </div>
  )
}
