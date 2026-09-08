import { useEffect, useState, useCallback } from 'react'
import type { ManagerDashboard, TimeOffRequest } from '../../shared/types'

interface Props {
  token: string
  readOnly: boolean
  title: string
}

function fmt(s: string) {
  return new Date(s + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function overlapNote(req: TimeOffRequest, dash: ManagerDashboard): { text: string; ok: boolean } {
  const others = dash.calendar.filter(c => c.requestId !== req.requestId && c.startDate <= req.endDate && c.endDate >= req.startDate)
  const worst = dash.coverage
    .filter(c => c.date >= req.startDate && c.date <= req.endDate)
    .reduce((m, c) => (c.present < m ? c.present : m), dash.team.length)
  const present = Math.min(worst, dash.team.length - 1)
  const ok = present / dash.team.length >= 0.6
  const who = others.length ? `Also out: ${others.map(o => `${o.name} (${o.status})`).join(', ')}. ` : 'Nobody else is out those days. '
  return { text: `${who}${dash.team.length} on the roster, ${present} present${ok ? ', meets the 60% minimum.' : ', below the 60% minimum.'}`, ok }
}

export default function ApprovalsPanel({ token, readOnly, title }: Props) {
  const [dash, setDash] = useState<ManagerDashboard | null>(null)
  const [denying, setDenying] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/manager/dashboard', { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) setDash(await res.json())
    } catch { /* transient */ }
  }, [token])

  useEffect(() => {
    load()
    const id = setInterval(load, 4000)
    return () => clearInterval(id)
  }, [load])

  async function decide(requestId: string, decision: 'approved' | 'denied', decisionNote?: string) {
    setBusy(requestId)
    setError('')
    try {
      const res = await fetch(`/api/manager/requests/${requestId}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ decision, note: decisionNote || undefined }),
      })
      if (!res.ok) setError((await res.json()).error ?? 'Could not save decision')
      setDenying(null)
      setNote('')
      await load()
    } finally {
      setBusy(null)
    }
  }

  if (!dash) return <div className="panel"><p className="muted">Loading...</p></div>

  const unread = dash.notifications.filter(n => !n.read && n.kind === 'approval_request')
  const thin = dash.coverage.filter(c => !c.ok)

  return (
    <div className="panel">
      <h1 className="panel-title">{title}</h1>
      {!readOnly && unread.length > 0 && (
        <div className="banner">{unread.length} new approval request{unread.length > 1 ? 's' : ''}: {unread.map(n => n.subject).join(' · ')}</div>
      )}
      {error && <div className="error-msg">{error}</div>}

      <section>
        <h2>{readOnly ? 'Awaiting manager decision' : 'Needs your decision'} <span className="count">{dash.pending.length}</span></h2>
        {dash.pending.length === 0 && <p className="muted">Nothing waiting.</p>}
        <div className="pending-grid">
          {dash.pending.map(r => {
            const cov = overlapNote(r, dash)
            return (
              <div key={r.requestId} className="pending-card">
                <div className="pending-head">
                  <strong>{r.employeeName}</strong>
                  <span className="muted">{r.requestId} · {fmtTime(r.submittedAt)}</span>
                </div>
                <div className="pending-dates">{fmt(r.startDate)} to {fmt(r.endDate)}</div>
                <div className="muted">{r.leaveTypeName}{r.details ? ` · ${r.details.entitlementWeeks} weeks (${r.details.country}) · HR confirms eligibility` : ` · ${r.totalDays} day${r.totalDays === 1 ? '' : 's'} (${r.totalHours} hrs)`}{r.comment ? ` · "${r.comment}"` : ''} · approver {r.managerName}</div>
                <div className={`coverage-note ${cov.ok ? 'ok' : 'warn'}`}>{cov.text}</div>
                {readOnly ? null : denying === r.requestId ? (
                  <div className="deny-row">
                    <input value={note} onChange={e => setNote(e.target.value)} placeholder="Reason (the employee sees this)" autoFocus />
                    <button className="btn-danger" disabled={busy === r.requestId} onClick={() => decide(r.requestId, 'denied', note)}>Confirm deny</button>
                    <button className="btn-secondary" onClick={() => { setDenying(null); setNote('') }}>Back</button>
                  </div>
                ) : (
                  <div className="confirm-row">
                    <button className="btn-primary" disabled={busy === r.requestId} onClick={() => decide(r.requestId, 'approved')}>Approve</button>
                    <button className="btn-secondary" disabled={busy === r.requestId} onClick={() => setDenying(r.requestId)}>Deny</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      <section>
        <h2>Calendar <span className="muted small">next 120 days</span></h2>
        {thin.length > 0 && (
          <div className="coverage-warn">Below 60% coverage on {thin.map(c => fmt(c.date)).join(', ')} if every pending request is approved.</div>
        )}
        <table className="cal-table">
          <thead><tr><th>Who</th><th>Dates</th><th>Type</th><th>Status</th></tr></thead>
          <tbody>
            {dash.calendar.map(c => (
              <tr key={c.requestId}>
                <td>{c.name}</td>
                <td>{fmt(c.startDate)} to {fmt(c.endDate)}</td>
                <td>{c.leaveType}</td>
                <td><span className={`chip status-${c.status}`}>{c.status}</span></td>
              </tr>
            ))}
            {dash.holidays.map(h => (
              <tr key={h.date} className="holiday-row">
                <td>Everyone</td><td>{fmt(h.date)}</td><td>{h.name}</td><td><span className="chip chip-muted">holiday</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Balances</h2>
        <table className="cal-table">
          <thead><tr><th>Name</th><th>Role</th><th>PTO available</th><th>Pending</th><th>Requests</th></tr></thead>
          <tbody>
            {dash.team.map(t => {
              const pto = t.balances.find(b => b.leaveTypeId === 'PTO')
              return (
                <tr key={t.employee.employeeId}>
                  <td>{t.employee.name}</td>
                  <td className="muted">{t.employee.title} · {t.employee.employeeType}</td>
                  <td>{pto ? `${pto.availableDays} days` : 'n/a (contractor)'}</td>
                  <td>{pto?.pendingRequestsHours ? `${pto.pendingRequestsHours} hrs` : '–'}</td>
                  <td>{t.requests.length}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Decided</h2>
        <ul className="decided-list">
          {dash.decided.map(r => (
            <li key={r.requestId}>
              <span className={`chip status-${r.status}`}>{r.status}</span>
              <strong>{r.employeeName}</strong> {fmt(r.startDate)} to {fmt(r.endDate)} · {r.leaveTypeName}
              {r.decisionNote && <span className="muted"> · "{r.decisionNote}"</span>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
