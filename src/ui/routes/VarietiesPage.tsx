import { useState } from 'react'
import { useFarmStore } from '@/state/store'
import { treeCountByVariety, varietiesByName, varietyColors } from '@/state/derived'
import { createVariety, deleteVariety, updateVariety } from '@/state/actions'
import { Button, Card, Field, PageHeader, Pill, inputClass } from '@/ui/components'
import type { Variety } from '@/model/types'

export default function VarietiesPage() {
  const state = useFarmStore((s) => s.state)
  const varieties = varietiesByName(state)
  const counts = treeCountByVariety(state)
  const colors = varietyColors(state)
  const [adding, setAdding] = useState(false)
  return (
    <div className="space-y-4">
      <PageHeader title="Varieties" subtitle={`${varieties.length} in this farm`}>
        <Button variant="primary" onClick={() => setAdding(true)}>
          New variety
        </Button>
      </PageHeader>
      {adding && <NewVariety onDone={() => setAdding(false)} />}
      {varieties.length === 0 && !adding && (
        <Card>
          <p className="text-sm text-stone-600 dark:text-stone-400">
            No varieties yet. Add them here, or type a new one when you record a graft.
          </p>
        </Card>
      )}
      <ul className="space-y-2">
        {varieties.map((v) => (
          <li key={v.id}>
            <VarietyCard variety={v} count={counts.get(v.id) ?? 0} color={colors.get(v.id)} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function NewVariety({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('')
  const [species, setSpecies] = useState('')
  const [source, setSource] = useState('')
  return (
    <Card>
      <form
        className="grid gap-3 sm:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim()) return
          createVariety({
            species: species.trim() || 'unknown',
            name: name.trim(),
            ...(source.trim() ? { source: source.trim() } : {}),
          })
          onDone()
        }}
      >
        <Field label="Name">
          <input
            className={inputClass}
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Species">
          <input
            className={inputClass}
            value={species}
            placeholder="pawpaw"
            onChange={(e) => setSpecies(e.target.value)}
          />
        </Field>
        <Field label="Source" hint="Where the scionwood or trees came from">
          <input
            className={inputClass}
            value={source}
            onChange={(e) => setSource(e.target.value)}
          />
        </Field>
        <div className="flex gap-2 sm:col-span-3">
          <Button variant="primary" type="submit">
            Add
          </Button>
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  )
}

function VarietyCard({
  variety,
  count,
  color,
}: {
  variety: Variety
  count: number
  color?: string
}) {
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState(false)
  return (
    <Card className="p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button className="flex items-center gap-2 text-left" onClick={() => setOpen((o) => !o)}>
          <span
            aria-hidden
            className="inline-block h-3.5 w-3.5 rounded-full border border-stone-400"
            style={{ background: color }}
          />
          <span className="font-medium">{variety.name}</span>
          <span className="text-sm text-stone-500 dark:text-stone-400">{variety.species}</span>
        </button>
        <Pill>
          {count} {count === 1 ? 'tree' : 'trees'}
        </Pill>
      </div>
      {open && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <input
              className={inputClass}
              defaultValue={variety.name}
              onBlur={(e) => {
                const v = e.target.value.trim()
                if (v && v !== variety.name) updateVariety(variety.id, { name: v })
              }}
            />
          </Field>
          <Field label="Species">
            <input
              className={inputClass}
              defaultValue={variety.species}
              onBlur={(e) => {
                const v = e.target.value.trim()
                if (v && v !== variety.species) updateVariety(variety.id, { species: v })
              }}
            />
          </Field>
          <Field label="Source">
            <input
              className={inputClass}
              defaultValue={variety.source ?? ''}
              onBlur={(e) => {
                const v = e.target.value.trim()
                if (v !== (variety.source ?? '')) updateVariety(variety.id, { source: v || null })
              }}
            />
          </Field>
          <Field label="Color on the map">
            <input
              type="color"
              className="h-9 w-16 cursor-pointer rounded border border-stone-300 dark:border-stone-600"
              defaultValue={color ?? '#a3e635'}
              onChange={(e) => updateVariety(variety.id, { color: e.target.value })}
            />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <textarea
              className={`${inputClass} min-h-16 w-full`}
              defaultValue={variety.notes ?? ''}
              placeholder="Hardiness, ripening time, flavor, anything worth remembering"
              onBlur={(e) => {
                const v = e.target.value.trim()
                if (v !== (variety.notes ?? '')) updateVariety(variety.id, { notes: v || null })
              }}
            />
          </Field>
          <div className="flex items-center gap-2 sm:col-span-2">
            {confirm ? (
              <>
                <span className="text-sm">
                  Delete {variety.name}? Trees keep the id and show as unknown.
                </span>
                <Button
                  variant="danger"
                  onClick={() => {
                    deleteVariety(variety.id)
                    setConfirm(false)
                  }}
                >
                  Delete
                </Button>
                <Button variant="ghost" onClick={() => setConfirm(false)}>
                  Keep
                </Button>
              </>
            ) : (
              <Button variant="ghost" onClick={() => setConfirm(true)}>
                Delete variety
              </Button>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}
