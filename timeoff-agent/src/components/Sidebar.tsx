import { useEffect, useRef, useState } from 'react'
import { MOMENTS, type Persona, type UseCase, type UseCaseKey } from '../personas'

export interface Recent {
  key: string
  useCase: UseCaseKey
  title: string
  icon: string
}

interface Props {
  personas: Persona[]
  persona: Persona
  onPersona: (key: string) => void
  useCases: UseCase[]
  useCase: UseCaseKey
  onUseCase: (key: UseCaseKey) => void
  recents: Recent[]
  activeThreadKey: string
  onNewChat: () => void
  mode: 'claude' | 'offline' | null
}

function initials(name: string) {
  return name.split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase()
}

export default function Sidebar({ personas, persona, onPersona, useCases, useCase, onUseCase, recents, activeThreadKey, onNewChat, mode }: Props) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">◎</span>
        <span className="brand-name">Acme Assistant</span>
      </div>

      <div className="persona-wrap" ref={menuRef}>
        <button className="persona-btn" onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open}>
          <span className="avatar">{initials(persona.name)}</span>
          <span className="persona-text">
            <span className="persona-name">{persona.name}</span>
            <span className="persona-role">{persona.label}</span>
          </span>
          <span className="caret">{open ? '▴' : '▾'}</span>
        </button>
        {open && (
          <div className="persona-menu" role="menu">
            <div className="menu-label">View as</div>
            {personas.map(p => (
              <button key={p.key} role="menuitem" className={`persona-item ${p.key === persona.key ? 'active' : ''}`} onClick={() => { onPersona(p.key); setOpen(false) }}>
                <span className="avatar small">{initials(p.name)}</span>
                <span className="persona-text">
                  <span className="persona-name">{p.name} <span className="muted">· {p.label}</span></span>
                  <span className="persona-role">{p.blurb}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <button className="new-chat" onClick={onNewChat}>✎ New chat</button>

      {MOMENTS.map(moment => {
        const items = useCases.filter(u => u.group === moment)
        if (items.length === 0) return null
        return (
          <div key={moment} className="nav-group">
            {moment !== 'Ask' && <div className="nav-label">{moment}</div>}
            <nav className="nav">
              {items.map(u => (
                <button key={u.key} className={`nav-item ${u.key === useCase ? 'active' : ''}`} onClick={() => onUseCase(u.key)}>
                  <span className="nav-icon">{u.icon}</span>{u.label}
                </button>
              ))}
            </nav>
          </div>
        )
      })}

      {recents.length > 0 && (
        <>
          <div className="nav-label">Recent</div>
          <nav className="nav recents">
            {recents.map(r => (
              <button key={r.key} className={`nav-item ${r.key === activeThreadKey ? 'active' : ''}`} onClick={() => onUseCase(r.useCase)} title={r.title}>
                <span className="nav-icon">{r.icon}</span><span className="ellipsis">{r.title}</span>
              </button>
            ))}
          </nav>
        </>
      )}

      <div className="sidebar-foot">
        <span className={`chip ${mode === 'claude' ? 'chip-ok' : 'chip-muted'}`}>{mode === 'claude' ? 'Claude live' : mode === 'offline' ? 'Offline planner' : 'Agent idle'}</span>
        <span className="muted tiny">Mock HR system · demo policies</span>
      </div>
    </aside>
  )
}
