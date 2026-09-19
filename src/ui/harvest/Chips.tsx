import clsx from 'clsx'
import type { ReactNode } from 'react'

/** A row of choices where one is picked. Big enough for a thumb with cold hands. */
export function Chip({
  active,
  onClick,
  children,
  tone = 'plain',
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
  tone?: 'plain' | 'dashed'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        'rounded-full border px-3 py-1.5 text-sm font-medium',
        tone === 'dashed' && !active && 'border-dashed',
        active
          ? 'border-lime-700 bg-lime-700 text-white'
          : 'border-stone-300 text-stone-700 dark:border-stone-600 dark:text-stone-300',
      )}
    >
      {children}
    </button>
  )
}

export function ChipRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-stone-500 dark:text-stone-400">{label}</p>
      <div className="mt-1 flex flex-wrap gap-1.5">{children}</div>
    </div>
  )
}
