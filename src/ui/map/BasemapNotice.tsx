import type { ReactNode } from 'react'

/** A one-line notice floating over the map, for imagery changes and fallbacks. */
export function BasemapNotice({ children }: { children: ReactNode }) {
  if (!children) return null
  return (
    <div
      role="status"
      className="pointer-events-none absolute left-1/2 top-3 z-10 max-w-[90%] -translate-x-1/2 rounded-md border border-stone-300 dark:border-stone-600 bg-white/95 dark:bg-stone-900/95 px-3 py-1.5 text-xs text-stone-700 dark:text-stone-300 shadow"
    >
      <span className="pointer-events-auto">{children}</span>
    </div>
  )
}
