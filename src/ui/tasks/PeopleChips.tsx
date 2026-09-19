import { useState } from 'react'
import clsx from 'clsx'
import { useFarmStore } from '@/state/store'
import { live } from '@/events/reduce'
import { createPerson, setCurrentPerson } from '@/state/people'
import { inputClass } from '@/ui/components'

/** Who did the work: tap to toggle people, add one by name when someone is missing. */
export function PeopleChips({
  selected,
  onChange,
}: {
  selected: string[]
  onChange: (ids: string[]) => void
}) {
  const state = useFarmStore((s) => s.state)
  const people = live
    .people(state)
    .filter((p) => p.active || selected.includes(p.id))
    .sort((a, b) => a.name.localeCompare(b.name))
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')

  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])

  const add = () => {
    const n = name.trim()
    if (!n) return
    const id = createPerson(n)
    if (selected.length === 0) setCurrentPerson(id)
    onChange([...selected, id])
    setName('')
    setAdding(false)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {people.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => toggle(p.id)}
          aria-pressed={selected.includes(p.id)}
          className={clsx(
            'rounded-full border px-3 py-1.5 text-sm font-medium',
            selected.includes(p.id)
              ? 'border-lime-700 bg-lime-700 text-white'
              : 'border-stone-300 dark:border-stone-600 text-stone-700 dark:text-stone-300',
          )}
        >
          {p.name}
        </button>
      ))}
      {adding ? (
        <span className="flex items-center gap-1">
          <input
            className={clsx(inputClass, 'w-32')}
            value={name}
            placeholder="Name"
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                add()
              }
              if (e.key === 'Escape') setAdding(false)
            }}
            onBlur={() => (name.trim() ? add() : setAdding(false))}
          />
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="rounded-full border border-dashed border-stone-300 dark:border-stone-600 px-3 py-1.5 text-sm text-stone-500 dark:text-stone-400"
        >
          {people.length === 0 ? '+ Who did it?' : '+ someone else'}
        </button>
      )}
    </div>
  )
}
