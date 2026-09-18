import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '@/sync/api'
import { signIn, useSession } from '@/sync/auth'
import { openRemoteFarm } from '@/sync/engine'
import { Button, Card, PageHeader } from '@/ui/components'

interface Preview {
  farmId: string
  farmName: string
  ownerName: string
  alreadyMember: boolean
}

/** `/#/join/<token>`: the page an invite link opens. */
export default function JoinPage() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const session = useSession()
  const [preview, setPreview] = useState<Preview | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const here = `/join/${token}`

  useEffect(() => {
    if (!session || !token) return
    let live = true
    api<Preview>('GET', `/api/invites/${encodeURIComponent(token)}`)
      .then((p) => live && setPreview(p))
      .catch((err: unknown) => {
        if (live) setProblem(err instanceof Error ? err.message : 'That link did not work.')
      })
    return () => {
      live = false
    }
  }, [session, token])

  const join = async () => {
    if (!preview) return
    setBusy(true)
    setProblem(null)
    try {
      await api('POST', '/api/join', { token })
      const ok = await openRemoteFarm(preview.farmId)
      if (ok) navigate('/', { replace: true })
      else {
        setProblem(
          'You are on the farm now, but nothing has been synced to it yet. Open it from Settings once the owner turns on sync.',
        )
      }
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'Could not join.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Join a farm" />
      <Card className="space-y-3">
        {!session ? (
          <>
            <p className="text-sm text-stone-600 dark:text-stone-400">
              Someone shared a farm with you. Sign in with your Google account to join it; the owner
              can see who is on the farm and can remove people later.
            </p>
            <Button variant="primary" onClick={() => signIn(here)}>
              Sign in with Google
            </Button>
          </>
        ) : problem && !preview ? (
          <p role="alert" className="text-sm text-rose-700 dark:text-rose-400">
            {problem}
          </p>
        ) : !preview ? (
          <p className="text-sm text-stone-600 dark:text-stone-400">Checking the link…</p>
        ) : (
          <>
            <p className="text-sm">
              <span className="font-medium">{preview.ownerName}</span> invited you to{' '}
              <span className="font-medium">{preview.farmName}</span>.
              {preview.alreadyMember && ' You are already on it.'}
            </p>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              The farm's map, trees, and records will be copied to this device and kept in step with
              everyone else's. Signed in as {session.user.email}.
            </p>
            {problem && (
              <p role="alert" className="text-sm text-rose-700 dark:text-rose-400">
                {problem}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" disabled={busy} onClick={() => void join()}>
                {busy ? 'Joining…' : preview.alreadyMember ? 'Open the farm' : 'Join the farm'}
              </Button>
              <Button variant="ghost" onClick={() => navigate('/')}>
                Not now
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}
