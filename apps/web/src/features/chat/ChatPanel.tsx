import { useState } from 'react'
import type { ChatMessage } from '@drawguess/shared'

export function ChatPanel({
  messages,
  canSend,
  placeholder,
  closeNotice,
  onSend,
}: {
  messages: ChatMessage[]
  canSend: boolean
  placeholder: string
  closeNotice: boolean
  onSend: (text: string) => void
}) {
  const [text, setText] = useState('')
  return (
    <section className="paper flex h-full min-h-80 flex-col rounded-[1.5rem] p-4" aria-label="Chat and guesses">
      <h2 className="mb-3 font-display text-2xl text-ink">Guesses</h2>
      <ol className="flex flex-1 flex-col gap-2 overflow-y-auto pr-1">
        {messages.length === 0 ? <li className="text-sm text-ink/50">Guesses and chat show up here.</li> : null}
        {messages.map((message) => (
          <li key={message.id} className={`rounded-xl px-3 py-2 text-sm ${message.kind === 'correct' ? 'bg-teal/15 font-semibold text-teal' : message.kind === 'system' ? 'bg-cream text-ink/70' : 'bg-cream text-ink'}`}>
            {message.name ? <span className="font-semibold">{message.name}: </span> : null}
            {message.text}
          </li>
        ))}
      </ol>
      {closeNotice ? <p className="mt-2 text-sm font-bold text-coral">Close!</p> : null}
      <form
        className="mt-3 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          const next = text.trim()
          if (!next || !canSend) return
          onSend(next)
          setText('')
        }}
      >
        <label className="sr-only" htmlFor="guess">Message</label>
        <input id="guess" className="field" value={text} maxLength={120} placeholder={placeholder} disabled={!canSend} onChange={(event) => setText(event.target.value)} />
        <button className="btn-primary" type="submit" disabled={!canSend || text.trim().length === 0}>Send</button>
      </form>
    </section>
  )
}
