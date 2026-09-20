import { useMemo, useState, type ReactNode } from 'react'
import { Button, inputClass } from '@/ui/components'

/**
 * A list that stays usable when it grows. Anything that accumulates over a season, such as
 * deleted things or tags, will eventually have hundreds of rows, and a page that renders all
 * of them is one you scroll past rather than read. So: a filter box, a page of rows, and the
 * count of what is not being shown.
 *
 * Both controls only appear once there is enough to warrant them, so a short list looks
 * exactly as it did before.
 */
export function LongList<T>({
  items,
  keyOf,
  search,
  row,
  pageSize = 10,
  noun = 'items',
  placeholder = 'Filter…',
  filters,
}: {
  items: T[]
  keyOf: (item: T) => string
  /** The text a filter matches against. */
  search: (item: T) => string
  row: (item: T) => ReactNode
  pageSize?: number
  /** Plural, for "23 more items". */
  noun?: string
  placeholder?: string
  /** Optional named subsets, e.g. by kind. The first is the default. */
  filters?: { label: string; match: (item: T) => boolean }[]
}) {
  const [query, setQuery] = useState('')
  const [shown, setShown] = useState(pageSize)
  const [pick, setPick] = useState(0)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const chosen = filters?.[pick]
    return items.filter(
      (it) => (!chosen || chosen.match(it)) && (!q || search(it).toLowerCase().includes(q)),
    )
  }, [items, query, pick, filters, search])

  const visible = filtered.slice(0, shown)
  const hidden = filtered.length - visible.length
  const busy = items.length > pageSize

  return (
    <div>
      {busy && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <input
            className={`${inputClass} max-w-56`}
            value={query}
            placeholder={placeholder}
            aria-label={placeholder}
            onChange={(e) => {
              setQuery(e.target.value)
              setShown(pageSize)
            }}
          />
          {filters && filters.length > 1 && (
            <select
              className={`${inputClass} w-auto`}
              value={pick}
              aria-label="Show"
              onChange={(e) => {
                setPick(Number(e.target.value))
                setShown(pageSize)
              }}
            >
              {filters.map((f, i) => (
                <option key={f.label} value={i}>
                  {f.label}
                </option>
              ))}
            </select>
          )}
          <span className="text-xs text-stone-500 dark:text-stone-400">
            {filtered.length === items.length
              ? `${items.length} ${noun}`
              : `${filtered.length} of ${items.length} ${noun}`}
          </span>
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="py-2 text-sm text-stone-500 dark:text-stone-400">Nothing matches that.</p>
      ) : (
        <ul className="divide-y divide-stone-100 text-sm dark:divide-stone-800">
          {visible.map((it) => (
            <li key={keyOf(it)} className="py-1.5">
              {row(it)}
            </li>
          ))}
        </ul>
      )}

      {hidden > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button variant="ghost" onClick={() => setShown((n) => n + pageSize * 2)}>
            Show more
          </Button>
          <Button variant="ghost" onClick={() => setShown(filtered.length)}>
            Show all {filtered.length}
          </Button>
          <span className="text-xs text-stone-500 dark:text-stone-400">
            {hidden} more {noun}
          </span>
        </div>
      )}
    </div>
  )
}
