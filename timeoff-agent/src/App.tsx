import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Sidebar, { type Recent } from './components/Sidebar'
import Composer from './components/Composer'
import Markdown from './components/Markdown'
import TimeOffMessage from './components/TimeOffMessage'
import PolicyMessage, { type PolicyReply } from './components/PolicyMessage'
import ApprovalsPanel from './components/ApprovalsPanel'
import RequestsPanel from './components/RequestsPanel'
import DocsPanel, { loadDocs } from './components/DocsPanel'
import { PERSONAS, USE_CASES, type UseCaseKey } from './personas'
import type { AuthUser, ChatMessage, Notification } from '../shared/types'
import './styles.css'

interface Msg {
  id: string
  role: 'user' | 'assistant'
  kind: 'timeoff' | 'policy' | 'system'
  content: string
  ts: string
  timeoff?: ChatMessage
  policy?: PolicyReply
}

type Auth = { token: string; user: AuthUser }

let seq = 0
const uid = () => `m${Date.now()}-${seq++}`
const now = () => new Date().toISOString()

export default function App() {
  const [personaKey, setPersonaKey] = useState('employee')
  const [auths, setAuths] = useState<Record<string, Auth>>({})
  const [useCase, setUseCase] = useState<UseCaseKey>('ask')
  const [threads, setThreads] = useState<Record<string, Msg[]>>({})
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'claude' | 'offline' | null>(null)
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null)
  const [banner, setBanner] = useState<{ text: string; key: number } | null>(null)
  const firstPersona = useRef(true)
  const bottomRef = useRef<HTMLDivElement>(null)

  const persona = PERSONAS.find(p => p.key === personaKey)!
  const auth = auths[personaKey]
  const useCases = USE_CASES.filter(u => u.availableFor(persona))
  const current = USE_CASES.find(u => u.key === useCase)!
  const threadKey = `${personaKey}:${useCase}`
  const thread = threads[threadKey] ?? []

  // Sign in each persona once (mock SSO) the first time it is viewed.
  useEffect(() => {
    if (auths[personaKey]) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/auth/sso-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: persona.email }),
        })
        if (res.ok && !cancelled) {
          const data: Auth = await res.json()
          setAuths(a => ({ ...a, [personaKey]: data }))
        }
      } catch { /* server not up yet; the composer stays disabled */ }
    })()
    return () => { cancelled = true }
  }, [personaKey, persona.email, auths])

  // A persona that cannot use the current use case lands on policy search.
  useEffect(() => {
    if (!current.availableFor(persona)) setUseCase('ask')
  }, [persona, current])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [thread.length, loading])

  // "Now viewing as ..." cue: what changed when the persona changed.
  useEffect(() => {
    if (!auth) return
    if (firstPersona.current) { firstPersona.current = false; return }
    let cancelled = false
    ;(async () => {
      const { docs } = await loadDocs(auth.token, persona)
      if (cancelled) return
      const open = docs.filter(d => d.allowed).length
      const extras = USE_CASES.filter(u => (u.key === 'approvals' || u.key === 'org') && u.availableFor(persona)).map(u => u.label)
      const unlocked = extras.length ? `${extras.join(' and ')} unlocked` : 'no manager or HR views'
      setBanner({ text: `Now viewing as ${persona.name} (${persona.label}): ${open} policy document${open === 1 ? '' : 's'} in scope · ${unlocked}`, key: Date.now() })
    })()
    return () => { cancelled = true }
  }, [auth, persona])

  useEffect(() => {
    if (!banner) return
    const id = setTimeout(() => setBanner(null), 7000)
    return () => clearTimeout(id)
  }, [banner])

  const append = useCallback((key: string, msgs: Msg[]) => {
    setThreads(t => ({ ...t, [key]: [...(t[key] ?? []), ...msgs] }))
  }, [])

  // A 401 means the API restarted and forgot our mock SSO token: drop it so the sign-in effect runs again.
  const forgetAuth = useCallback((key: string) => {
    setAuths(a => { const next = { ...a }; delete next[key]; return next })
  }, [])

  // HR-system decisions flow back into this persona's time-off thread.
  useEffect(() => {
    if (!auth) return
    const id = setInterval(async () => {
      try {
        const res = await fetch('/api/notifications', { headers: { Authorization: `Bearer ${auth.token}` } })
        if (res.status === 401) { forgetAuth(personaKey); return }
        if (!res.ok) return
        const notes: Notification[] = await res.json()
        if (notes.length) {
          append(`${personaKey}:ask`, notes.map(n => ({ id: uid(), role: 'assistant' as const, kind: 'system' as const, content: `**${n.subject}**\n${n.body}`, ts: n.createdAt })))
        }
      } catch { /* ignore */ }
    }, 4000)
    return () => clearInterval(id)
  }, [auth, personaKey, append, forgetAuth])

  async function send(text: string) {
    if (!auth || loading) return
    append(threadKey, [{ id: uid(), role: 'user', kind: 'timeoff', content: text, ts: now() }])
    setLoading(true)
    try {
      // One endpoint. The server decides whether this is a question for the policy
      // library or a time-off intent for the agent, and the reply says which.
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
        body: JSON.stringify({ message: text }),
      })
      if (res.status === 401) { forgetAuth(personaKey); throw new Error('Signed in again after a server restart. Please resend.') }
      const data: ChatMessage & { error?: string } = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Agent error')
      if (data.mode) setMode(data.mode)
      if (data.policy) {
        append(threadKey, [{ id: uid(), role: 'assistant', kind: 'policy', content: data.content, ts: data.timestamp, policy: data.policy }])
      } else {
        append(threadKey, [{ id: uid(), role: 'assistant', kind: 'timeoff', content: data.content, ts: data.timestamp, timeoff: data }])
      }
    } catch (err) {
      append(threadKey, [{ id: uid(), role: 'assistant', kind: 'system', content: `Error: ${err instanceof Error ? err.message : 'Something went wrong'}`, ts: now() }])
    } finally {
      setLoading(false)
    }
  }

  async function newChat() {
    setThreads(t => ({ ...t, [threadKey]: [] }))
    if (useCase === 'ask' && auth) {
      await fetch('/api/chat/reset', { method: 'POST', headers: { Authorization: `Bearer ${auth.token}` } }).catch(() => undefined)
    }
  }

  const recents: Recent[] = useMemo(() => {
    return Object.entries(threads)
      .filter(([key, msgs]) => key.startsWith(`${personaKey}:`) && msgs.some(m => m.role === 'user'))
      .map(([key, msgs]) => {
        const uc = USE_CASES.find(u => u.key === key.split(':')[1])!
        return { key, useCase: uc.key, icon: uc.icon, title: msgs.find(m => m.role === 'user')!.content }
      })
  }, [threads, personaKey])

  const isPanel = useCase !== 'ask'

  function openDoc(title: string) {
    setSelectedDoc(title)
    setUseCase('library')
  }
  const lastAssistant = [...thread].reverse().find(m => m.role === 'assistant')

  return (
    <div className="workspace">
      <Sidebar
        personas={PERSONAS} persona={persona} onPersona={setPersonaKey}
        useCases={useCases} useCase={useCase} onUseCase={setUseCase}
        recents={recents} activeThreadKey={threadKey} onNewChat={newChat} mode={mode}
      />

      <main className="main">
        {banner && (
          <div className="switch-banner" key={banner.key}>
            <span>{banner.text}</span>
            <button className="banner-close" onClick={() => setBanner(null)} aria-label="Dismiss">×</button>
          </div>
        )}
        <header className="topbar">
          <div className="topbar-title">
            <span className="topbar-icon">{current.icon}</span>
            <span>{current.group === 'Ask' ? 'Ask' : `${current.group} · ${current.label}`}</span>
          </div>
          <span className="chip chip-muted">Viewing as {persona.name} · {persona.label}</span>
        </header>

        {useCase === 'library' && auth && (
          <DocsPanel token={auth.token} persona={persona} selected={selectedDoc} onSelect={setSelectedDoc} />
        )}
        {useCase === 'requests' && auth && <RequestsPanel token={auth.token} />}
        {(useCase === 'approvals' || useCase === 'org') && auth && (
          <ApprovalsPanel token={auth.token} readOnly={useCase === 'org'} title={useCase === 'org' ? 'Org overview' : 'Team approvals'} />
        )}

        {!isPanel && (
          <>
            <div className="thread">
              {thread.length === 0 && (
                <div className="empty">
                  <h1>What can I help with?</h1>
                  <p className="tagline">{current.tagline}</p>
                  <div className="chips">
                    {current.suggestions(persona).map(s => (
                      <button key={s} className="suggest" disabled={!auth} onClick={() => send(s)}>{s}</button>
                    ))}
                  </div>
                </div>
              )}

              {thread.map(m => (
                <div key={m.id} className={`row ${m.role}`}>
                  {m.role === 'user' ? (
                    <div className="bubble">{m.content}</div>
                  ) : (
                    <div className="assistant">
                      <span className="assistant-mark">◎</span>
                      {m.kind === 'policy' && m.policy && <PolicyMessage reply={m.policy} onOpenDoc={openDoc} />}
                      {m.kind === 'timeoff' && m.timeoff && (
                        <TimeOffMessage msg={m.timeoff} isLast={m === lastAssistant} disabled={loading} onSend={send} />
                      )}
                      {m.kind === 'system' && <div className="assistant-body system"><Markdown text={m.content} /></div>}
                    </div>
                  )}
                </div>
              ))}

              {loading && (
                <div className="row assistant">
                  <div className="assistant"><span className="assistant-mark">◎</span><div className="typing"><span /><span /><span /></div></div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            <Composer
              onSend={send}
              disabled={!auth || loading}
              placeholder="Ask about a policy, or ask for time off..." 
            />
          </>
        )}
      </main>
    </div>
  )
}
