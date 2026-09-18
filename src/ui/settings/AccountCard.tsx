import { useEffect, useState } from 'react'
import { refreshAccount, signIn, signOut, useSession } from '@/sync/auth'
import { useSync } from '@/sync/store'
import { Button, Card } from '@/ui/components'

/** Who is signed in, with sign-in and sign-out. Sync itself is the card below it. */
export function AccountCard() {
  const session = useSession()
  const error = useSync((s) => s.error)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (session) void refreshAccount()
    // Only on first render: later refreshes come from sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Card>
      <h2 className="font-semibold">Account</h2>
      {session ? (
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
          {session.user.picture && (
            <img
              src={session.user.picture}
              alt=""
              referrerPolicy="no-referrer"
              className="h-8 w-8 rounded-full"
            />
          )}
          <span>
            <span className="font-medium">{session.user.name}</span>
            <span className="block text-xs text-stone-500 dark:text-stone-400">
              {session.user.email}
            </span>
          </span>
          <Button
            className="ml-auto"
            disabled={busy}
            onClick={() => {
              setBusy(true)
              void signOut().finally(() => setBusy(false))
            }}
          >
            Sign out
          </Button>
        </div>
      ) : (
        <div className="mt-2 space-y-2 text-sm">
          <p className="text-stone-600 dark:text-stone-400">
            Sign in with Google to keep a copy of this farm on the server and share it with the
            people who work here. Google is used only to know who you are; nothing is posted to it.
          </p>
          {error && (
            <p role="alert" className="text-amber-700 dark:text-amber-400">
              {error}
            </p>
          )}
          <Button variant="primary" onClick={() => signIn('/settings')}>
            Sign in with Google
          </Button>
        </div>
      )}
    </Card>
  )
}
