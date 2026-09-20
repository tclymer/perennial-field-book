import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { useFarmStore } from '@/state/store'
import { search, type SearchHit } from '@/engine/search'
import { inputClass } from './components'
import { useIsDesktop } from './useIsDesktop'

const KIND_LABEL: Record<SearchHit['kind'], string> = {
  tree: 'Tree',
  row: 'Row',
  block: 'Block',
  variety: 'Variety',
  feature: 'Place',
  task: 'Task',
}

/**
 * Search where you already are, rather than a page you have to go to. A box in the header on
 * a desktop; on a phone a magnifier that drops the same box below the header.
 */
export function HeaderSearch() {
  const state = useFarmStore((s) => s.state)
  const navigate = useNavigate()
  const isDesktop = useIsDesktop()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [active, setActive] = useState(0)
  const box = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)

  const result = useMemo(() => (q.trim() ? search(state, q) : { hits: [] }), [state, q])
  const hits = useMemo(
    () => (result.exact ? [result.exact, ...result.hits] : result.hits).slice(0, 8),
    [result],
  )

  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [open])

  useEffect(() => setActive(0), [q])

  const close = () => {
    setOpen(false)
    setExpanded(false)
  }

  const go = (hit: SearchHit | undefined) => {
    if (!hit) return
    navigate(hit.to)
    setQ('')
    close()
    input.current?.blur()
  }

  const seeAll = () => {
    if (!q.trim()) return
    navigate(`/search?q=${encodeURIComponent(q.trim())}`)
    close()
  }

  const field = (
    <div className="relative w-full" ref={box}>
      <input
        ref={input}
        className={clsx(inputClass, 'w-full py-1 pr-7 text-sm md:w-56 lg:w-72')}
        placeholder="PP1-3-12, Shenandoah, barn…"
        value={q}
        inputMode="search"
        aria-label="Search the farm"
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            close()
            input.current?.blur()
          }
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActive((i) => Math.min(i + 1, hits.length - 1))
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((i) => Math.max(i - 1, 0))
          }
          if (e.key === 'Enter') {
            e.preventDefault()
            if (hits[active]) go(hits[active])
            else seeAll()
          }
        }}
      />
      {q && (
        <button
          type="button"
          aria-label="Clear the search"
          onClick={() => {
            setQ('')
            input.current?.focus()
          }}
          className="absolute right-1 top-1/2 -translate-y-1/2 px-1 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
        >
          ×
        </button>
      )}
      {open && q.trim() && (
        <div className="absolute right-0 top-full z-40 mt-1 w-full min-w-72 overflow-hidden rounded-md border border-stone-200 bg-white shadow-lg md:w-72 dark:border-stone-700 dark:bg-stone-900">
          {hits.length === 0 ? (
            <p className="px-3 py-2 text-sm text-stone-500 dark:text-stone-400">Nothing matches.</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto py-1 text-sm">
              {hits.map((h, i) => (
                <li key={`${h.kind}-${h.title}-${i}`}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(h)}
                    className={clsx(
                      'flex w-full items-baseline gap-2 px-3 py-1.5 text-left',
                      i === active && 'bg-stone-100 dark:bg-stone-800',
                    )}
                  >
                    <span className="w-12 shrink-0 text-xs text-stone-500 dark:text-stone-400">
                      {KIND_LABEL[h.kind]}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{h.title}</span>
                    {h.detail && (
                      <span className="shrink-0 truncate text-xs text-stone-500 dark:text-stone-400">
                        {h.detail}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={seeAll}
            className="block w-full border-t border-stone-100 px-3 py-1.5 text-left text-xs text-stone-500 hover:bg-stone-100 dark:border-stone-800 dark:text-stone-400 dark:hover:bg-stone-800"
          >
            See all results
          </button>
        </div>
      )}
    </div>
  )

  if (isDesktop) return field
  return (
    <>
      <button
        type="button"
        aria-label="Search the farm"
        className="rounded-md border border-stone-300 bg-stone-100 px-2.5 py-1 text-base text-stone-600 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-400"
        onClick={() => {
          setExpanded((x) => !x)
          setTimeout(() => input.current?.focus(), 0)
        }}
      >
        <span aria-hidden>⌕</span>
      </button>
      {expanded && (
        <div className="absolute inset-x-0 top-full z-40 border-b border-stone-200 bg-white p-2 shadow dark:border-stone-700 dark:bg-stone-900">
          {field}
        </div>
      )}
    </>
  )
}
