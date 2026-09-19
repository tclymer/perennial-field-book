import { useState } from 'react'
import clsx from 'clsx'
import { useFarmStore } from '@/state/store'
import { varietiesByName } from '@/state/derived'
import { varietyColorsBySpecies } from '@/state/colors'
import { useEditor } from './editorStore'
import { inputClass } from '@/ui/components'

/**
 * Highlight varieties on the map: chosen ones keep their color, everything else goes grey.
 * Shown over the map on every device; the desktop View section has the same control.
 */
export function HighlightBar({ className }: { className?: string }) {
  const state = useFarmStore((s) => s.state)
  const highlight = useEditor((s) => s.highlight)
  const setHighlight = useEditor((s) => s.setHighlight)
  const [query, setQuery] = useState('')
  const colors = varietyColorsBySpecies(state)
  const all = varietiesByName(state)
  const q = query.trim().toLowerCase()
  const matches = q
    ? all.filter((v) => !highlight.includes(v.id) && v.name.toLowerCase().includes(q)).slice(0, 8)
    : []

  if (all.length === 0) return null
  return (
    <div className={clsx('pointer-events-auto flex flex-wrap items-center gap-1.5', className)}>
      {highlight.map((id) => {
        const v = state.varieties[id]
        if (!v) return null
        return (
          <button
            key={id}
            type="button"
            onClick={() => setHighlight(highlight.filter((x) => x !== id))}
            title="Stop highlighting"
            className="flex items-center gap-1 rounded-full border border-stone-300 bg-white/95 px-2 py-0.5 text-xs shadow dark:border-stone-600 dark:bg-stone-900/95"
          >
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: colors.get(id) }}
            />
            {v.name} ×
          </button>
        )
      })}
      <div className="relative">
        <input
          className={clsx(inputClass, 'w-40 bg-white/95 py-0.5 text-xs dark:bg-stone-900/95')}
          placeholder={highlight.length ? '+ another variety' : 'Highlight a variety…'}
          value={query}
          aria-label="Highlight a variety"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && matches[0]) {
              setHighlight([...highlight, matches[0].id])
              setQuery('')
            }
            if (e.key === 'Escape') setQuery('')
          }}
        />
        {matches.length > 0 && (
          <ul className="absolute left-0 top-full z-10 mt-1 w-56 rounded-md border border-stone-200 bg-white py-1 text-sm shadow-lg dark:border-stone-700 dark:bg-stone-900">
            {matches.map((v) => (
              <li key={v.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-2 py-1 text-left hover:bg-stone-100 dark:hover:bg-stone-800"
                  onClick={() => {
                    setHighlight([...highlight, v.id])
                    setQuery('')
                  }}
                >
                  <span
                    aria-hidden
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ background: colors.get(v.id) }}
                  />
                  {v.name}
                  <span className="text-xs text-stone-500 dark:text-stone-400">{v.species}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {highlight.length > 0 && (
        <button
          type="button"
          onClick={() => setHighlight([])}
          className="rounded-full bg-white/95 px-2 py-0.5 text-xs text-stone-600 underline decoration-dotted shadow dark:bg-stone-900/95 dark:text-stone-300"
        >
          Clear
        </button>
      )}
    </div>
  )
}
