import { useState, type FormEvent } from 'react'

export function UsernamePrompt({
  initial,
  onSave
}: {
  initial?: string
  onSave: (name: string) => void
}) {
  const [name, setName] = useState(initial ?? '')

  function submit(event: FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (trimmed) onSave(trimmed)
  }

  return (
    <div className="modal-backdrop">
      <form className="username-modal" onSubmit={submit}>
        <h2>Podaj nick</h2>
        <input
          autoFocus
          value={name}
          maxLength={60}
          onChange={(event) => setName(event.target.value)}
          placeholder="Nick"
          aria-label="Nick"
        />
        <button type="submit" className="log-button" disabled={!name.trim()}>
          Zapisz
        </button>
      </form>
    </div>
  )
}
