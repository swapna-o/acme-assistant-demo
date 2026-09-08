import { useEffect, useRef, useState } from 'react'

interface Props {
  onSend: (text: string) => void
  disabled: boolean
  placeholder: string
}

export default function Composer({ onSend, disabled, placeholder }: Props) {
  const [value, setValue] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (!value) { el.style.height = ''; return }
    el.style.height = '0px'
    el.style.height = Math.max(24, Math.min(el.scrollHeight, 200)) + 'px'
  }, [value])

  useEffect(() => { if (!disabled) ref.current?.focus() }, [disabled])

  function submit() {
    const t = value.trim()
    if (!t || disabled) return
    onSend(t)
    setValue('')
  }

  return (
    <div className="composer-wrap">
      <div className="composer">
        <textarea
          ref={ref}
          rows={1}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
        />
        <button className="send-btn" onClick={submit} disabled={disabled || !value.trim()} aria-label="Send">↑</button>
      </div>
      <div className="composer-note">Demo data. Nothing here reaches a real HR system.</div>
    </div>
  )
}
