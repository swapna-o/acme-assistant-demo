import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Sidebar, { type Recent } from './components/Sidebar'
import Composer from './components/Composer'
import Markdown from './components/Markdown'
import TimeOffMessage from './components/TimeOffMessage'
import PolicyMessage, { type PolicyReply } from './components/PolicyMessage'
import ApprovalsPanel from './components/ApprovalsPanel'
import RequestsPanel from './components/RequestsPanel'
import HelpMessage from './components/HelpMessage'
import TicketsPanel from './components/TicketsPanel'
import SupportPanel from './components/SupportPanel'
import DocsPanel, { loadDocs } from './components/DocsPanel'
import { PERSONAS, USE_CASES, type UseCaseKey } from './personas'
import type { AuthUser, ChatMessage, LiveChat, Notification } from '../shared/types'
import './styles.css'

interface Msg {
  id: string
  role: 'user' | 'assistant'
  kind: 'timeoff' | 'policy' | 'system' | 'help' | 'live'
  content: string
  ts: string
  timeoff?: ChatMessage
  policy?: PolicyReply
  /** kind 'live': who said it in the live help chat. */
  from?: string
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
  // Use case 04: the employee's live help chat, per persona, and the last chat message already shown.
  const [liveChats, setLiveChats] = useState<Record<string, LiveChat | null>>({})
  const seenLive = useRef<Record<string, number>>({})
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
      const extras = USE_CASES.filter(u => (u.key === 'approvals' || u.key === 'org' || u.key === 'support') && u.availableFor(persona)).map(u => u.label)
      const unlocked = extras.length ? `${extras.join(' and ')} unlocked` : 'no manager, HR, or support views'
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

  // Use case 04: while live help is open, the thread polls the chat and shows the person's replies.
  const liveChat = liveChats[personaKey] ?? null
  useEffect(() => {
    if (!auth || persona.role === 'it_support') return
    let cancelled = false
    const poll = async () => {
      try {
        const res = await fetch('/api/livechat', { headers: { Authorization: `Bearer ${auth.token}` } })
        if (res.status === 401) { forgetAuth(personaKey); return }
        if (!res.ok || cancelled) return
        const c: LiveChat | null = await res.json()
        const key = `${personaKey}:ask`
        const seen = seenLive.current[personaKey] ?? 0
        if (c) {
          const fresh = c.messages.filter(m => m.id > seen && m.from !== 'employee')
          if (fresh.length) {
            seenLive.current[personaKey] = c.messages[c.messages.length - 1].id
            append(key, fresh.map(m => ({ id: uid(), role: 'assistant' as const, kind: m.from === 'agent' ? 'live' as const : 'system' as const, content: m.text, ts: m.at, from: m.name })))
          }
        }
        setLiveChats(l => (l[personaKey]?.status === c?.status && l[personaKey]?.chatId === c?.chatId ? l : { ...l, [personaKey]: c }))
      } catch { /* ignore */ }
    }
    poll()
    const id = setInterval(poll, 2000)
    return () => { cancelled = true; clearInterval(id) }
  }, [auth, personaKey, persona.role, append, forgetAuth])

  async function endLive() {
    if (!auth || !liveChat) return
    await fetch(`/api/livechat/${liveChat.chatId}/end`, { method: 'POST', headers: { Authorization: `Bearer ${auth.token}` } }).catch(() => undefined)
    setLiveChats(l => ({ ...l, [personaKey]: null }))
  }

  async function send(text: string) {
    if (!auth || loading) return
    append(threadKey, [{ id: uid(), role: 'user', kind: 'timeoff', content: text, ts: now() }])
    // Live help: the message goes to the person, not the agent.
    if (liveChat && liveChat.status !== 'ended' && useCase === 'ask') {
      try {
        const res = await fetch(`/api/livechat/${liveChat.chatId}/message`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` }, body: JSON.stringify({ text }),
        })
        if (res.ok) {
          const c: LiveChat = await res.json()
          seenLive.current[personaKey] = Math.max(seenLive.current[personaKey] ?? 0, c.messages[c.messages.length - 1].id)
          return
        }
        if (res.status !== 409) return
        setLiveChats(l => ({ ...l, [personaKey]: null }))
      } catch { return }
    }
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
      } else if (data.agentLabel === 'Help agent') {
        if (data.help?.liveChat) {
          setLiveChats(l => ({ ...l, [personaKey]: data.help!.liveChat!.status === 'ended' ? null : data.help!.liveChat! }))
          seenLive.current[personaKey] = Math.max(seenLive.current[personaKey] ?? 0, ...data.help.liveChat.messages.map(m => m.id))
        }
        if (data.content || data.help) append(threadKey, [{ id: uid(), role: 'assistant', kind: 'help', content: data.content, ts: data.timestamp, timeoff: data }])
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
        <div className="demo-strip" role="note">Demo. Acme is a made-up company; every person and policy here is invented, and nothing connects to a real HR system.</div>
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
        {useCase === 'tickets' && auth && <TicketsPanel token={auth.token} />}
        {useCase === 'support' && auth && (
          <SupportPanel token={auth.token} readOnly={persona.role !== 'it_support'} onAsk={text => { setUseCase('ask'); setTimeout(() => send(text), 50) }} />
        )}
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
                <div key={m.id} className={`row ${m.role} ${m.kind === 'live' ? 'live' : ''}`}>
                  {m.role === 'user' ? (
                    <div className="bubble">{m.content}</div>
                  ) : (
                    <div className="assistant">
                      <span className="assistant-mark">◎</span>
                      {m.kind === 'policy' && m.policy && <PolicyMessage reply={m.policy} onOpenDoc={openDoc} />}
                      {m.kind === 'timeoff' && m.timeoff && (
                        <TimeOffMessage msg={m.timeoff} isLast={m === lastAssistant} disabled={loading} onSend={send} />
                      )}
                      {m.kind === 'help' && m.timeoff && (
                        <HelpMessage msg={m.timeoff} isLast={m === lastAssistant} disabled={loading} onSend={send} />
                      )}
                      {m.kind === 'live' && <div className="assistant-body"><div className="live-from">{m.from} · IT support</div><Markdown text={m.content} /></div>}
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

            {liveChat && liveChat.status !== 'ended' && (
              <div className={`live-banner ${liveChat.status}`}>
                <span>Live help · {liveChat.status === 'waiting' ? 'waiting for an agent' : liveChat.agentName}{liveChat.ticketId ? ` · ${liveChat.ticketId} attached` : ''}</span>
                <button onClick={endLive}>End chat</button>
              </div>
            )}
            <Composer
              onSend={send}
              disabled={!auth || loading}
              placeholder={liveChat && liveChat.status !== 'ended' ? `Message ${liveChat.agentName ?? 'IT support'}...` : 'Ask about a policy, ask for time off, or say what is broken...'}
            />
          </>
        )}
      </main>
    </div>
  )
}
