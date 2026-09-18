import { NavLink } from 'react-router-dom'
import clsx from 'clsx'
import { useSession } from '@/sync/auth'
import { useSync } from '@/sync/store'

/** A small colored dot in the header: how sync is going, linking to Settings. */
export function SyncDot() {
  const session = useSession()
  const linked = useSync((s) => s.linked)
  const phase = useSync((s) => s.phase)
  const pending = useSync((s) => s.pending)
  if (!session || !linked) return null
  const [tone, label] =
    phase === 'syncing'
      ? ['bg-amber-400 animate-pulse', 'Syncing']
      : phase === 'offline'
        ? ['bg-stone-400', `Offline${pending ? `, ${pending} waiting` : ''}`]
        : phase === 'error'
          ? ['bg-rose-500', 'Sync problem']
          : pending > 0
            ? ['bg-amber-400', `${pending} waiting to sync`]
            : ['bg-lime-500', 'Synced']
  return (
    <NavLink
      to="/settings"
      className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100"
      title={label}
      aria-label={`Sync: ${label}`}
    >
      <span aria-hidden className={clsx('inline-block h-2.5 w-2.5 rounded-full', tone)} />
      <span className="hidden sm:inline">{label}</span>
    </NavLink>
  )
}
