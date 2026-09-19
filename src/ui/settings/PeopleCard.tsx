import { useState } from 'react'
import { useFarmStore } from '@/state/store'
import { live } from '@/events/reduce'
import { useDevice } from '@/state/device'
import { createPerson, setCurrentPerson, updatePerson } from '@/state/people'
import { addCategory, setBucketName } from '@/state/taskActions'
import { bucketName } from '@/engine/tasks'
import { CATEGORIES } from '@/model/categories'
import { BUCKETS, DEFAULT_BUCKET_NAMES } from '@/model/types'
import { Button, Card, Field, Pill, inputClass } from '@/ui/components'

/** Who works here, and which of them this device logs as. */
export function PeopleCard() {
  const state = useFarmStore((s) => s.state)
  const personId = useDevice((s) => s.personId)
  const [name, setName] = useState('')
  const people = live.people(state).sort((a, b) => a.name.localeCompare(b.name))

  return (
    <Card>
      <h2 className="font-semibold">People</h2>
      <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
        Work logs name who did the work. Someone who signs in is matched to a person by name.
      </p>
      <ul className="mt-2 divide-y divide-stone-100 dark:divide-stone-800 text-sm">
        {people.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-2 py-1.5">
            <input
              className={inputClass}
              defaultValue={p.name}
              aria-label="Name"
              onBlur={(e) => {
                const v = e.target.value.trim()
                if (v && v !== p.name) updatePerson(p.id, { name: v })
                else e.target.value = p.name
              }}
            />
            {p.email && (
              <span className="text-xs text-stone-500 dark:text-stone-400">{p.email}</span>
            )}
            {!p.active && <Pill>inactive</Pill>}
            {personId === p.id && <Pill tone="good">this device</Pill>}
            <span className="ml-auto flex gap-1">
              {personId !== p.id && p.active && (
                <Button variant="ghost" onClick={() => setCurrentPerson(p.id)}>
                  Use on this device
                </Button>
              )}
              <Button variant="ghost" onClick={() => updatePerson(p.id, { active: !p.active })}>
                {p.active ? 'Retire' : 'Reactivate'}
              </Button>
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <Field label="Add a person">
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim()) {
                createPerson(name)
                setName('')
              }
            }}
          />
        </Field>
        <Button
          disabled={!name.trim()}
          onClick={() => {
            createPerson(name)
            setName('')
          }}
        >
          Add
        </Button>
      </div>
    </Card>
  )
}

/** Rename the task lists and add work categories for this farm. */
export function TaskSettingsCard() {
  const farm = useFarmStore((s) => s.state.farm)
  const [category, setCategory] = useState('')
  if (!farm) return null
  return (
    <Card>
      <h2 className="font-semibold">Task lists and categories</h2>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        {BUCKETS.map((b) => (
          <Field key={b} label={`List for "${DEFAULT_BUCKET_NAMES[b]}"`}>
            <input
              className={inputClass}
              defaultValue={bucketName(farm, b)}
              onBlur={(e) => {
                const v = e.target.value.trim()
                if (v && v !== bucketName(farm, b)) setBucketName(b, v)
                else e.target.value = bucketName(farm, b)
              }}
            />
          </Field>
        ))}
      </div>
      <p className="mt-3 text-xs text-stone-500 dark:text-stone-400">
        Categories: {CATEGORIES.map((c) => c.label).join(', ')}
        {farm.categories?.length ? `, ${farm.categories.join(', ')}` : ''}.
      </p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <Field label="Add a category">
          <input
            className={inputClass}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
        </Field>
        <Button
          disabled={!category.trim()}
          onClick={() => {
            addCategory(category)
            setCategory('')
          }}
        >
          Add
        </Button>
      </div>
    </Card>
  )
}
