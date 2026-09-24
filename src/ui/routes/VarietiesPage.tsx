import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { defaultSpeciesColor, speciesColors, varietyColorsBySpecies } from '@/state/colors'
import { useFarmStore } from '@/state/store'
import { positionCountByVariety, treeCountByVariety, varietiesByName } from '@/state/derived'
import { createVariety, deleteVariety, updateVariety } from '@/state/actions'
import { downloadText, fileSlug } from '@/events/bundle'
import {
  normalizeTrait,
  sameTrait,
  splitTrait,
  traitSuggestions,
  traitsInUse,
  traitsOf,
  varietySheet,
  varietySheetToCsv,
} from '@/engine/traits'
import { Button, Card, Field, PageHeader, Pill, inputClass } from '@/ui/components'
import type { Variety } from '@/model/types'
import { ColorPicker } from '@/ui/ColorPicker'
import { setSpeciesColor } from '@/state/actions'

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
  const colors = varietyColorsBySpecies(state)
  const groups = useMemo(() => groupBySpecies(varieties, counts), [varieties, counts])
  const [adding, setAdding] = useState<string | null>(null)
  const [only, setOnly] = useState<string | null>(null)
  const [trait, setTrait] = useState<string | null>(null)
  const traitsUsed = useMemo(() => traitsInUse(state), [state])
  const byTrait = useMemo(() => {
    if (!trait) return groups
    return groups
      .map((g) => ({
        ...g,
        types: g.types
          .map((t) => ({
            ...t,
            varieties: t.varieties.filter((v) => traitsOf(v).some((x) => sameTrait(x, trait))),
          }))
          .filter((t) => t.varieties.length > 0),
        varieties: g.varieties.filter((v) => traitsOf(v).some((x) => sameTrait(x, trait))),
      }))
      .filter((g) => g.varieties.length > 0)
  }, [groups, trait])
  const shown = only ? byTrait.filter((g) => g.species.toLowerCase() === only) : byTrait
  const speciesNames = groups.map((g) => g.species)
  const typeNames = [...new Set(varieties.map((v) => v.group?.trim()).filter(Boolean))] as string[]

  return (
    <div className="space-y-4">
      <PageHeader
        title="Varieties"
        subtitle={`${varieties.length} in this farm, ${groups.length} ${groups.length === 1 ? 'species' : 'species'}`}
      >
        <Button
          onClick={() =>
            downloadText(
              `${fileSlug(state.farm?.name ?? 'farm')}-varieties.csv`,
              varietySheetToCsv(varietySheet(state)),
              'text/csv',
            )
          }
          title="Every variety with its traits, source, and how many stand here"
        >
          Variety sheet
        </Button>
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
      {traitsUsed.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-stone-500 dark:text-stone-400">Traits</span>
          {traitsUsed.slice(0, 16).map((u) => (
            <Chip
              key={u.trait}
              active={trait !== null && sameTrait(trait, u.trait)}
              onClick={() => setTrait(trait && sameTrait(trait, u.trait) ? null : u.trait)}
            >
              {u.trait} <span className="opacity-60">{u.count}</span>
            </Chip>
          ))}
          {trait && (
            <Button variant="ghost" onClick={() => setTrait(null)}>
              Clear
            </Button>
          )}
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
            <div className="flex items-center gap-2">
              <SpeciesColor species={g.species} />
              <Button variant="ghost" onClick={() => setAdding(g.species)}>
                + {g.species}
              </Button>
            </div>
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

/**
 * The colour for a whole crop. Varieties take shades of it unless they say otherwise, so
 * this is the one setting that changes how a whole orchard reads at a glance.
 */
function SpeciesColor({ species }: { species: string }) {
  const state = useFarmStore((s) => s.state)
  const [open, setOpen] = useState(false)
  const key = species.trim().toLowerCase()
  const chosen = state.farm?.speciesColors?.[key]
  const inUse = speciesColors(state).get(key)
  const suggested = defaultSpeciesColor(species)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title={`Colour for ${species} on the map`}
        aria-label={`Colour for ${species} on the map`}
        className="flex h-6 w-6 items-center justify-center rounded-full border border-stone-300 dark:border-stone-600"
        style={{ background: inUse }}
      />
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-72 rounded-md border border-stone-200 bg-white p-2 shadow-lg dark:border-stone-700 dark:bg-stone-900">
          <p className="mb-2 text-xs text-stone-500 dark:text-stone-400">
            Colour for <span className="capitalize">{species}</span>. Its varieties take shades of
            this unless one has a colour of its own.
          </p>
          <ColorPicker
            value={chosen}
            suggested={suggested}
            onChange={(c) => setSpeciesColor(species, c)}
            onClear={() => setSpeciesColor(species, null)}
          />
        </div>
      )}
    </div>
  )
}

/**
 * The traits on one variety: chips you can take off, a box to type a new one, and the ones
 * this species already uses offered underneath. The suggestions come from what the farm has
 * written before, so the vocabulary settles itself and there is nothing to set up first.
 */
function TraitEditor({ variety }: { variety: Variety }) {
  const state = useFarmStore((s) => s.state)
  const [text, setText] = useState('')
  const current = traitsOf(variety)
  const suggestions = traitSuggestions(state, variety.species, current)

  const set = (list: string[]) => updateVariety(variety.id, { traits: list.length ? list : null })
  const add = (raw: string) => {
    const clean = normalizeTrait(raw)
    if (!clean || current.some((t) => sameTrait(t, clean))) return
    set([...current, clean])
    setText('')
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {current.map((t) => {
          const { key, value } = splitTrait(t)
          return (
            <span
              key={t}
              className="group/trait inline-flex items-center gap-1 rounded-full border border-stone-300 px-2 py-0.5 text-xs dark:border-stone-600"
            >
              {key && <span className="text-stone-500 dark:text-stone-400">{key}</span>}
              <span>{value}</span>
              <button
                type="button"
                aria-label={`Remove ${t}`}
                className="text-stone-400 hover:text-rose-600"
                onClick={() => set(current.filter((x) => !sameTrait(x, t)))}
              >
                ×
              </button>
            </span>
          )
        })}
      </div>
      <input
        className={`${inputClass} mt-1.5`}
        value={text}
        placeholder="precocious, or vigor: high"
        aria-label={`Add a trait to ${variety.name}`}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            add(text)
          }
        }}
        onBlur={() => add(text)}
      />
      {suggestions.length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          <span className="text-xs text-stone-500 dark:text-stone-400">Already used:</span>
          {suggestions.map((t) => (
            <button
              key={t}
              type="button"
              className="rounded-full border border-dashed border-stone-300 px-2 py-0.5 text-xs text-stone-600 hover:border-lime-700 hover:text-lime-700 dark:border-stone-600 dark:text-stone-400"
              onClick={() => add(t)}
            >
              {t}
            </button>
          ))}
        </div>
      )}
      <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
        A colon makes a heading, as in "vigor: high". Nothing needs one.
      </p>
    </div>
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
        <span className="flex items-center gap-2">
          <Pill
            title={`${recorded} with a tree record of their own; the rest come from a row default`}
          >
            {count} {count === 1 ? 'tree' : 'trees'}
            {recorded !== count && (
              <span className="ml-1 text-stone-500 dark:text-stone-400">· {recorded} recorded</span>
            )}
          </Pill>
          {count > 0 && (
            <Link
              to={`/?highlight=${variety.id}`}
              className="text-xs underline decoration-dotted"
              title="Light these trees up on the map"
            >
              Show on map
            </Link>
          )}
        </span>
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
          <Field label="What it is like" className="sm:col-span-2">
            <TraitEditor variety={variety} />
          </Field>
          <Field label="Color on the map" className="sm:col-span-2">
            <ColorPicker
              value={variety.color}
              suggested={color}
              onChange={(c) => updateVariety(variety.id, { color: c })}
              onClear={() => updateVariety(variety.id, { color: null })}
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
