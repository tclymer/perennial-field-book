import clsx from 'clsx'
import { BLOCK_PALETTE, SPECIES_PALETTE } from '@/state/colors'

/**
 * Colour swatches with the full picker beside them. A free colour wheel is the wrong first
 * offer: most of the time you want the colour the fruit already has, or one that reads
 * clearly against satellite imagery, and both are on this row.
 */
const SWATCHES: { color: string; name: string }[] = [
  { color: '#a3e635', name: 'light green' },
  { color: '#65a30d', name: 'green' },
  { color: '#16a34a', name: 'deep green' },
  { color: '#4d7c0f', name: 'olive' },
  { color: '#eab308', name: 'yellow' },
  { color: '#f59e0b', name: 'amber' },
  { color: '#f97316', name: 'orange' },
  { color: '#fb923c', name: 'peach' },
  { color: '#dc2626', name: 'red' },
  { color: '#e11d48', name: 'rose' },
  { color: '#be123c', name: 'cherry' },
  { color: '#a855f7', name: 'purple' },
  { color: '#7c3aed', name: 'violet' },
  { color: '#6b21a8', name: 'mulberry' },
  { color: '#3b82f6', name: 'blue' },
  { color: '#0ea5e9', name: 'sky' },
  { color: '#14b8a6', name: 'teal' },
  { color: '#ec4899', name: 'pink' },
  { color: '#92400e', name: 'brown' },
  { color: '#57534e', name: 'stone' },
  { color: '#334155', name: 'slate' },
  { color: '#1f2937', name: 'near black' },
]

export function ColorPicker({
  value,
  onChange,
  onClear,
  suggested,
  id,
}: {
  value?: string
  onChange: (color: string) => void
  /** Offered when a colour has been set, to go back to the one chosen for you. */
  onClear?: () => void
  /** The colour that would be used if none were set, shown first and marked. */
  suggested?: string
  id?: string
}) {
  const current = value?.toLowerCase()
  const swatches = suggested
    ? [
        { color: suggested, name: 'suggested' },
        ...SWATCHES.filter((sw) => sw.color.toLowerCase() !== suggested.toLowerCase()),
      ]
    : SWATCHES

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {swatches.map((sw, i) => (
        <button
          key={`${sw.color}-${i}`}
          type="button"
          title={suggested && i === 0 ? `${sw.name} (suggested)` : sw.name}
          aria-label={suggested && i === 0 ? `${sw.name}, suggested` : sw.name}
          aria-pressed={current === sw.color.toLowerCase()}
          onClick={() => onChange(sw.color)}
          className={clsx(
            'h-6 w-6 rounded-full border',
            current === sw.color.toLowerCase()
              ? 'border-stone-900 ring-2 ring-stone-900 dark:border-white dark:ring-white'
              : 'border-stone-300 dark:border-stone-600',
            suggested && i === 0 && 'outline outline-1 outline-offset-2 outline-stone-400',
          )}
          style={{ background: sw.color }}
        />
      ))}
      <input
        id={id}
        type="color"
        aria-label="Any other colour"
        title="Any other colour"
        className="h-6 w-8 cursor-pointer rounded border border-stone-300 bg-transparent dark:border-stone-600"
        value={value ?? suggested ?? '#a3e635'}
        onChange={(e) => onChange(e.target.value)}
      />
      {onClear && value && (
        <button
          type="button"
          className="text-xs underline decoration-dotted text-stone-500 dark:text-stone-400"
          onClick={onClear}
        >
          use the suggested one
        </button>
      )}
    </div>
  )
}

/** Kept so the palettes stay one source of truth for anything that lists them. */
export const PALETTES = { SPECIES_PALETTE, BLOCK_PALETTE }
