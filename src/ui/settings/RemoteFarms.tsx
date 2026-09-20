import { useEffect, useState } from 'react'
import { useFarmStore } from '@/state/store'
import { refreshAccount, signIn, useSession } from '@/sync/auth'
import { openRemoteFarm } from '@/sync/engine'
import { useSync } from '@/sync/store'
import { Button, Card, Pill } from '@/ui/components'

/**
 * The farms the signed-in account can open, other than the one already open. Used in
 * Settings and on the set-up page.
 */
export function RemoteFarms({ onOpened, returnTo }: { onOpened: () => void; returnTo: string }) {
  const session = useSession()
  const farms = useSync((s) => s.farms)
  const current = useFarmStore((s) => s.farmId)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  // The token, not the session object: watching the object would refresh in a loop.
  const token = session?.token
  useEffect(() => {
    if (token) void refreshAccount()
  }, [token])

  if (!session) {
    return (
      <Card>
        <h2 className="font-semibold">Already using the field book elsewhere?</h2>
        <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
          Sign in with the same Google account to open a farm from another device, or one that
          someone invited you to.
        </p>
        <Button className="mt-3" onClick={() => signIn(returnTo)}>
          Sign in with Google
        </Button>
      </Card>
    )
  }
  const others = farms.filter((f) => f.id !== current)
  if (others.length === 0 && current) return null
  return (
    <Card>
      <h2 className="font-semibold">Farms on your account</h2>
      {others.length === 0 ? (
        <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
          None yet. Turn on sync for a farm on the device that has it, or ask the owner for an
          invite link.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-stone-100 dark:divide-stone-800 text-sm">
          {others.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-2 py-1.5">
              <span>
                {f.name} <Pill className="ml-1">{f.role}</Pill>
              </span>
              <Button
                disabled={busy !== null}
                onClick={() => {
                  setBusy(f.id)
                  setMessage(null)
                  openRemoteFarm(f.id)
                    .then((ok) => {
                      if (ok) onOpened()
                      else setMessage('Nothing has been synced to that farm yet.')
                    })
                    .catch((err: unknown) =>
                      setMessage(err instanceof Error ? err.message : 'Could not open that farm.'),
                    )
                    .finally(() => setBusy(null))
                }}
              >
                {busy === f.id ? 'Opening…' : 'Open'}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {message && (
        <p role="alert" className="mt-2 text-sm text-rose-700 dark:text-rose-400">
          {message}
        </p>
      )}
    </Card>
  )
}
