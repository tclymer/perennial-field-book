import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { useFarmStore } from '@/state/store'
import {
  positionCountByVariety,
  treeCountByVariety,
  varietiesByName,
  varietyColors,
} from '@/state/derived'
import { createVariety, deleteVariety, updateVariety } from '@/state/actions'
import { Button, Card, Field, PageHeader, Pill, inputClass } from '@/ui/components'
import type { Variety } from '@/model/types'

interface SpeciesGroup {
  species: string
  varieties: Variety[]
  trees: number
  /** Types within the species (Asian, American…), in name order; '' for untyped. */
  types: { name: string; varieties: Variety[] }[]
}

function groupBySpecies(varieties: Variety[], counts: Map<string, number>): SpeciesGroup[] {
  const by = new Map<string, Variety[]>()
  for (const v of varieties) {
    const key = v.species.trim().toLowerCase()
    by.set(key, [...(by.get(key) ?? []), v])
  }
  const groups: SpeciesGroup[] = []
  for (const list of by.values()) {
    const types = new Map<string, Variety[]>()
    for (const v of list) {
      const t = (v.group ?? '').trim()
      types.set(t, [...(types.get(t) ?? []), v])
    }
    groups.push({
      species: list[0]!.species,
      varieties: list,
      trees: list.reduce((n, v) => n + (counts.get(v.id) ?? 0), 0),
      types: [...types.entries()]
        .sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)))
        .map(([name, vs]) => ({ name, varieties: vs })),
    })
  }
  // Biggest plantings first, then alphabetical.
  return groups.sort((a, b) => b.trees - a.trees || a.species.localeCompare(b.species))
}

export default function VarietiesPage() {
  const state = useFarmStore((s) => s.state)
  const varieties = varietiesByName(state)
  const counts = positionCountByVariety(state)
  const recorded = treeCountByVariety(state)
  const colors = varietyColors(state)
  const groups = useMemo(() => groupBySpecies(varieties, counts), [varieties, counts])
  const [adding, setAdding] = useState<string | null>(null)
  const [only, setOnly] = useState<string | null>(null)
  const shown = only ? groups.filter((g) => g.species.toLowerCase() === only) : groups
  const speciesNames = groups.map((g) => g.species)
  const typeNames = [...new Set(varieties.map((v) => v.group?.trim()).filter(Boolean))] as string[]

  return (
    <div className="space-y-4">
      <PageHeader
        title="Varieties"
        subtitle={`${varieties.length} in this farm, ${groups.length} ${groups.length === 1 ? 'species' : 'species'}`}
      >
        <Button variant="primary" onClick={() => setAdding(only ?? '')}>
          New variety
        </Button>
      </PageHeader>
      {groups.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          <Chip active={only === null} onClick={() => setOnly(null)}>
            All
          </Chip>
          {groups.map((g) => (
            <Chip
              key={g.species}
              active={only === g.species.toLowerCase()}
              onClick={() =>
                setOnly(only === g.species.toLowerCase() ? null : g.species.toLowerCase())
              }
            >
              {g.species} <span className="opacity-60">{g.varieties.length}</span>
            </Chip>
          ))}
        </div>
      )}
      {adding !== null && (
        <NewVariety
          species={adding}
          speciesNames={speciesNames}
          typeNames={typeNames}
          onDone={() => setAdding(null)}
        />
      )}
      {varieties.length === 0 && adding === null && (
        <Card>
          <p className="text-sm text-stone-600 dark:text-stone-400">
            No varieties yet. Add them here, or type a new one when you record a graft.
          </p>
        </Card>
      )}
      {shown.map((g) => (
        <section key={g.species}>
          <div className="mb-1 flex items-baseline justify-between gap-2 px-1">
            <h2 className="font-semibold capitalize">
              {g.species}{' '}
              <span className="text-sm font-normal text-stone-500 dark:text-stone-400">
                {g.varieties.length} {g.varieties.length === 1 ? 'variety' : 'varieties'}
                {g.trees > 0 && ` · ${g.trees} trees`}
              </span>
            </h2>
            <Button variant="ghost" onClick={() => setAdding(g.species)}>
              + {g.species}
            </Button>
          </div>
          {g.types.map((t) => (
            <div key={t.name} className="mb-2">
              {(g.types.length > 1 || t.name) && (
                <h3 className="mb-1 px-1 text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-stone-400">
                  {t.name || 'Other'}
                </h3>
              )}
              <ul className="space-y-2">
                {t.varieties.map((v) => (
                  <li key={v.id}>
                    <VarietyCard
                      variety={v}
                      count={counts.get(v.id) ?? 0}
                      recorded={recorded.get(v.id) ?? 0}
                      color={colors.get(v.id)}
                      typeNames={typeNames}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        'rounded-full border px-3 py-1 text-sm capitalize',
        active
          ? 'border-stone-900 bg-stone-900 text-white dark:border-stone-100 dark:bg-stone-100 dark:text-stone-900'
          : 'border-stone-300 dark:border-stone-600 text-stone-700 dark:text-stone-300',
      )}
    >
      {children}
    </button>
  )
}

function NewVariety({
  species: initialSpecies,
  speciesNames,
  typeNames,
  onDone,
}: {
  species: string
  speciesNames: string[]
  typeNames: string[]
  onDone: () => void
}) {
  const [name, setName] = useState('')
  const [species, setSpecies] = useState(initialSpecies)
  const [group, setGroup] = useState('')
  const [source, setSource] = useState('')
  return (
    <Card>
      <form
        className="grid gap-3 sm:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim()) return
          createVariety({
            species: species.trim() || 'unknown',
            name: name.trim(),
            ...(group.trim() ? { group: group.trim() } : {}),
            ...(source.trim() ? { source: source.trim() } : {}),
          })
          onDone()
        }}
      >
        <datalist id="species-names">
          {speciesNames.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <datalist id="type-names">
          {typeNames.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
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
            list="species-names"
            onChange={(e) => setSpecies(e.target.value)}
          />
        </Field>
        <Field label="Type" hint="Optional: Asian, American, hybrid…">
          <input
            className={inputClass}
            value={group}
            list="type-names"
            onChange={(e) => setGroup(e.target.value)}
          />
        </Field>
        <Field label="Source" hint="Where the scionwood or trees came from">
          <input
            className={inputClass}
            value={source}
            onChange={(e) => setSource(e.target.value)}
          />
        </Field>
        <div className="flex gap-2 sm:col-span-4">
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
  recorded,
  color,
  typeNames,
}: {
  variety: Variety
  /** Positions the map shows in this variety, by tree or by row default. */
  count: number
  /** Trees with their own record naming this variety. */
  recorded: number
  color?: string
  typeNames: string[]
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
          {variety.group && (
            <span className="text-sm text-stone-500 dark:text-stone-400">{variety.group}</span>
          )}
        </button>
        <Pill
          title={`${recorded} with a tree record of their own; the rest come from a row default`}
        >
          {count} {count === 1 ? 'tree' : 'trees'}
          {recorded !== count && (
            <span className="ml-1 text-stone-500 dark:text-stone-400">· {recorded} recorded</span>
          )}
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
          <Field label="Type within the species" hint="Asian, American, hybrid…">
            <input
              className={inputClass}
              defaultValue={variety.group ?? ''}
              list={`type-names-${variety.id}`}
              onBlur={(e) => {
                const v = e.target.value.trim()
                if (v !== (variety.group ?? '')) updateVariety(variety.id, { group: v || null })
              }}
            />
            <datalist id={`type-names-${variety.id}`}>
              {typeNames.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
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
