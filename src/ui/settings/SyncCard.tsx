import { useState } from 'react'
import { useFarmStore } from '@/state/store'
import { useSession } from '@/sync/auth'
import { linkFarm, syncNow, unlinkFarm } from '@/sync/engine'
import { useSync } from '@/sync/store'
import { Button, Card } from '@/ui/components'

/** Sync status and controls for the open farm. Shown only when signed in. */
export function SyncCard() {
  const session = useSession()
  const farmId = useFarmStore((s) => s.farmId)
  const farmName = useFarmStore((s) => s.state.farm?.name)
  const linked = useSync((s) => s.linked)
  const phase = useSync((s) => s.phase)
  const pending = useSync((s) => s.pending)
  const lastSyncAt = useSync((s) => s.lastSyncAt)
  const error = useSync((s) => s.error)
  const farms = useSync((s) => s.farms)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [confirmStop, setConfirmStop] = useState(false)
  if (!session || !farmId) return null
  const onServer = farms.some((f) => f.id === farmId)

  const act = (fn: () => Promise<unknown>) => {
    setBusy(true)
    setMessage(null)
    void fn()
      .catch((err: unknown) =>
        setMessage(err instanceof Error ? err.message : 'That did not work.'),
      )
      .finally(() => setBusy(false))
  }

  if (!linked) {
    return (
      <Card>
        <h2 className="font-semibold">Sync</h2>
        <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
          {onServer
            ? `${farmName ?? 'This farm'} is on the server. Turn on sync here to keep this device up to date with it.`
            : 'Keep a copy of this farm on the server so your other devices and the people you invite see the same thing. Everything stays on this device too.'}
        </p>
        {error && (
          <p role="alert" className="mt-2 text-sm text-amber-700 dark:text-amber-400">
            {error}
          </p>
        )}
        {message && (
          <p role="alert" className="mt-2 text-sm text-rose-700 dark:text-rose-400">
            {message}
          </p>
        )}
        <Button className="mt-3" variant="primary" disabled={busy} onClick={() => act(linkFarm)}>
          {onServer ? 'Turn on sync on this device' : 'Turn on sync for this farm'}
        </Button>
      </Card>
    )
  }

  const status =
    phase === 'syncing'
      ? 'Syncing…'
      : phase === 'offline'
        ? 'Offline. Changes are kept here and sent when the connection is back.'
        : phase === 'error'
          ? (error ?? 'Sync failed.')
          : lastSyncAt
            ? `Synced ${ago(lastSyncAt)}.`
            : 'Not synced yet.'
  return (
    <Card>
      <h2 className="font-semibold">Sync</h2>
      <p
        role={phase === 'error' ? 'alert' : 'status'}
        className={
          phase === 'error'
            ? 'mt-1 text-sm text-rose-700 dark:text-rose-400'
            : 'mt-1 text-sm text-stone-600 dark:text-stone-400'
        }
      >
        {status}
        {pending > 0 && ` ${pending} ${pending === 1 ? 'change' : 'changes'} waiting to go up.`}
      </p>
      {message && (
        <p role="alert" className="mt-2 text-sm text-rose-700 dark:text-rose-400">
          {message}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button disabled={busy || phase === 'syncing'} onClick={() => act(() => syncNow('manual'))}>
          Sync now
        </Button>
        {confirmStop ? (
          <span className="flex flex-wrap items-center gap-2 text-sm">
            <span>Stop syncing on this device? Your copy here and the server copy both stay.</span>
            <Button
              variant="danger"
              onClick={() => {
                setConfirmStop(false)
                act(unlinkFarm)
              }}
            >
              Stop
            </Button>
            <Button variant="ghost" onClick={() => setConfirmStop(false)}>
              Keep syncing
            </Button>
          </span>
        ) : (
          <Button variant="ghost" onClick={() => setConfirmStop(true)}>
            Stop syncing on this device
          </Button>
        )}
      </div>
    </Card>
  )
}

export function ago(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000))
  if (s < 45) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 36) return `${h} ${h === 1 ? 'hour' : 'hours'} ago`
  const d = Math.round(h / 24)
  return `${d} ${d === 1 ? 'day' : 'days'} ago`
}
