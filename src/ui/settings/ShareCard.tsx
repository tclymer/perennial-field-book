import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFarmStore } from '@/state/store'
import { api } from '@/sync/api'
import { refreshAccount, useSession } from '@/sync/auth'
import { unlinkFarm } from '@/sync/engine'
import { useSync } from '@/sync/store'
import { Button, Card, Pill } from '@/ui/components'

interface Member {
  id: string
  name: string
  email: string
  role: 'owner' | 'member'
  addedAt: number
}

interface Invite {
  token: string
  createdAt: number
  expiresAt: number
}

interface FarmDetail {
  id: string
  name: string
  role: 'owner' | 'member'
  members: Member[]
  invites: Invite[]
  counts: { events: number; photos: number; photoBytes: number }
}

/** Who is on the farm, invite links, leaving, and deleting from the server. */
export function ShareCard() {
  const session = useSession()
  const token = session?.token
  const farmId = useFarmStore((s) => s.farmId)
  const linked = useSync((s) => s.linked)
  const navigate = useNavigate()
  const [detail, setDetail] = useState<FarmDetail | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<'delete' | 'leave' | string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const load = useCallback(() => {
    if (!farmId || !session || !linked) {
      setDetail(null)
      return
    }
    api<FarmDetail>('GET', `/api/farms/${farmId}`)
      .then(setDetail)
      .catch(() => setDetail(null))
  }, [farmId, token, linked])

  useEffect(load, [load])

  if (!session || !farmId || !linked || !detail) return null
  const me = session.user.id
  const owner = detail.role === 'owner'

  const act = (fn: () => Promise<unknown>) => {
    setBusy(true)
    setMessage(null)
    setConfirm(null)
    void fn()
      .then(load)
      .catch((err: unknown) =>
        setMessage(err instanceof Error ? err.message : 'That did not work.'),
      )
      .finally(() => setBusy(false))
  }

  const inviteUrl = (token: string) => `${location.origin}/#/join/${token}`

  return (
    <Card>
      <h2 className="font-semibold">People on this farm</h2>
      <ul className="mt-2 divide-y divide-stone-100 dark:divide-stone-800 text-sm">
        {detail.members.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-2 py-1.5">
            <span>
              {m.name}
              {m.id === me && ' (you)'}
              <Pill className="ml-2">{m.role}</Pill>
              <span className="block text-xs text-stone-500 dark:text-stone-400">{m.email}</span>
            </span>
            {owner && m.role !== 'owner' && (
              <span className="flex items-center gap-2">
                {confirm === m.id ? (
                  <>
                    <span className="text-xs text-stone-500 dark:text-stone-400">
                      Their phone keeps its copy, but nothing new flows either way.
                    </span>
                    <Button
                      variant="danger"
                      disabled={busy}
                      onClick={() =>
                        act(() => api('DELETE', `/api/farms/${farmId}/members/${m.id}`))
                      }
                    >
                      Remove
                    </Button>
                    <Button variant="ghost" onClick={() => setConfirm(null)}>
                      Keep
                    </Button>
                  </>
                ) : (
                  <Button variant="ghost" onClick={() => setConfirm(m.id)}>
                    Remove
                  </Button>
                )}
              </span>
            )}
          </li>
        ))}
      </ul>

      {owner && (
        <div className="mt-4 border-t border-stone-100 dark:border-stone-800 pt-3">
          <h3 className="text-sm font-medium">Invite someone</h3>
          <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
            Send them a link. It works for a week for anyone who has it, and you can revoke it here.
            They sign in with their own Google account.
          </p>
          {detail.invites.length > 0 && (
            <ul className="mt-2 space-y-2 text-sm">
              {detail.invites.map((i) => (
                <li key={i.token} className="flex flex-wrap items-center gap-2">
                  <code className="max-w-full truncate rounded bg-stone-100 dark:bg-stone-800 px-1.5 py-0.5 text-xs">
                    {inviteUrl(i.token)}
                  </code>
                  <Button
                    onClick={() => {
                      void navigator.clipboard?.writeText(inviteUrl(i.token)).then(
                        () => setCopied(i.token),
                        () => setMessage('Could not copy; select the link and copy it by hand.'),
                      )
                    }}
                  >
                    {copied === i.token ? 'Copied' : 'Copy link'}
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      act(() => api('DELETE', `/api/farms/${farmId}/invites/${i.token}`))
                    }
                  >
                    Revoke
                  </Button>
                  <span className="text-xs text-stone-500 dark:text-stone-400">
                    until {new Date(i.expiresAt).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Button
            className="mt-2"
            disabled={busy}
            onClick={() => act(() => api('POST', `/api/farms/${farmId}/invites`))}
          >
            New invite link
          </Button>
        </div>
      )}

      <div className="mt-4 border-t border-stone-100 dark:border-stone-800 pt-3 text-sm">
        <p className="text-xs text-stone-500 dark:text-stone-400">
          On the server: {detail.counts.events} changes and {detail.counts.photos} photos
          {detail.counts.photoBytes > 0 && ` (${(detail.counts.photoBytes / 1e6).toFixed(1)} MB)`}.
        </p>
        {owner ? (
          confirm === 'delete' ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span>
                Delete {detail.name} from the server? Every member loses sync; each device keeps its
                own copy.
              </span>
              <Button
                variant="danger"
                disabled={busy}
                onClick={() =>
                  act(async () => {
                    await api('DELETE', `/api/farms/${farmId}`)
                    await unlinkFarm()
                    await refreshAccount()
                  })
                }
              >
                Delete from the server
              </Button>
              <Button variant="ghost" onClick={() => setConfirm(null)}>
                Keep
              </Button>
            </div>
          ) : (
            <Button className="mt-2" variant="ghost" onClick={() => setConfirm('delete')}>
              Delete this farm from the server
            </Button>
          )
        ) : confirm === 'leave' ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span>Leave {detail.name}? Your copy stays on this device but stops updating.</span>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() =>
                act(async () => {
                  await api('DELETE', `/api/farms/${farmId}/members/${me}`)
                  await unlinkFarm()
                  await refreshAccount()
                  navigate('/settings')
                })
              }
            >
              Leave
            </Button>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Stay
            </Button>
          </div>
        ) : (
          <Button className="mt-2" variant="ghost" onClick={() => setConfirm('leave')}>
            Leave this farm
          </Button>
        )}
      </div>
      {message && (
        <p role="alert" className="mt-2 text-sm text-rose-700 dark:text-rose-400">
          {message}
        </p>
      )}
    </Card>
  )
}
