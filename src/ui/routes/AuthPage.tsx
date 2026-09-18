import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { finishSignIn, signIn } from '@/sync/auth'
import { Button, Card, PageHeader } from '@/ui/components'

const REASONS: Record<string, string> = {
  denied: 'Google did not complete the sign-in. Nothing was changed.',
  expired: 'That sign-in attempt timed out. Start again from here.',
  google: 'Google returned something unexpected. Try once more.',
}

/** Where the server sends the browser after Google: `?c=<code>&return=<route>` or `?error=`. */
export default function AuthPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [message, setMessage] = useState<string | null>(null)
  const started = useRef(false)
  const code = params.get('c')
  const returnTo = safeRoute(params.get('return'))
  const error = params.get('error')

  useEffect(() => {
    if (!code || started.current) return
    started.current = true
    finishSignIn(code)
      .then(() => navigate(returnTo, { replace: true }))
      .catch((err: unknown) => {
        setMessage(err instanceof Error ? err.message : 'The sign-in could not be completed.')
      })
  }, [code, navigate, returnTo])

  const problem = message ?? (error ? (REASONS[error] ?? 'The sign-in did not complete.') : null)
  return (
    <div className="space-y-4">
      <PageHeader title="Signing in" />
      <Card>
        {problem ? (
          <div className="space-y-3">
            <p role="alert" className="text-sm text-rose-700 dark:text-rose-400">
              {problem}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => signIn(returnTo)}>
                Try again
              </Button>
              <Button onClick={() => navigate(returnTo, { replace: true })}>Not now</Button>
            </div>
          </div>
        ) : code ? (
          <p className="text-sm text-stone-600 dark:text-stone-400">Finishing your sign-in…</p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-stone-600 dark:text-stone-400">
              Sign in with Google to back up this farm and share it with the people who work on it.
            </p>
            <Button variant="primary" onClick={() => signIn(returnTo)}>
              Sign in with Google
            </Button>
          </div>
        )}
      </Card>
    </div>
  )
}

function safeRoute(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.length > 200) return '/settings'
  return raw
}
