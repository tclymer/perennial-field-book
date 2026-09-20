import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useFarmStore } from '@/state/store'
import { live } from '@/events/reduce'
import { positionByKey } from '@/state/derived'
import { formatTagId, normalizeTagId, routeForTarget, tagUrl, targetMissing } from '@/engine/tags'
import { targetLabel } from '@/engine/logs'
import { ensureTag, forgetTag, renameTag, unpairTag } from '@/state/tagActions'
import { nfcSupported, scanOnce, writeTagUrl } from '@/state/nfc'
import { Button, Card, Field, PageHeader, Pill, inputClass } from '@/ui/components'
import { LongList } from '@/ui/LongList'

/**
 * The tags on the farm and what each is on. Pairing happens on a tag's own page, which is
 * where a tap lands; this is the list for when the tag is not in your hand.
 */
export default function TagsPage() {
  const state = useFarmStore((s) => s.state)
  const navigate = useNavigate()
  const tags = live.tags(state).sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id))
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState<'scan' | 'write' | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [writeTo, setWriteTo] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)
  const canScan = nfcSupported()
  const origin = window.location.origin

  useEffect(() => () => abort.current?.abort(), [])

  const stop = () => {
    abort.current?.abort()
    abort.current = null
    setBusy(null)
  }

  const scan = async () => {
    const c = new AbortController()
    abort.current = c
    setBusy('scan')
    setMessage('Hold the tag against the back of the phone.')
    const r = await scanOnce(c.signal)
    setBusy(null)
    if (!r.ok) {
      setMessage(r.reason)
      return
    }
    const id = normalizeTagId(r.serial)
    if (!id) {
      setMessage(`That tag's serial (${r.serial}) is not one this app can store.`)
      return
    }
    ensureTag(id)
    navigate(`/tag/${id}`)
  }

  const write = async (id: string) => {
    const c = new AbortController()
    abort.current = c
    setBusy('write')
    setWriteTo(id)
    setMessage('Hold the tag against the back of the phone to write it.')
    const r = await writeTagUrl(id, origin, c.signal)
    setBusy(null)
    setWriteTo(null)
    setMessage(r.ok ? 'Tag written. Tapping it will now open the app.' : r.reason)
  }

  const addTyped = () => {
    const r = ensureTag(typed)
    if (!r.ok) {
      setMessage(r.reason)
      return
    }
    setTyped('')
    navigate(`/tag/${r.id}`)
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Tags" subtitle="NFC tags and what each one is on" />

      <Card>
        <h2 className="font-semibold">Add a tag</h2>
        <p className="mt-1 text-xs text-stone-600 dark:text-stone-400">
          A tag is written once, with a link that carries its own serial number. After that the tag
          never changes: what it points at is decided here, so moving a tag to another tree is a
          change in the app, not a rewrite of the tag.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          {canScan ? (
            busy === 'scan' ? (
              <Button onClick={stop}>Stop scanning</Button>
            ) : (
              <Button variant="primary" onClick={() => void scan()}>
                Scan a tag
              </Button>
            )
          ) : null}
          <Field label="Or type its serial">
            <input
              className={inputClass}
              value={typed}
              placeholder="04:a1:b2:c3:d4:e5:f6"
              onChange={(e) => setTyped(e.target.value)}
            />
          </Field>
          <Button disabled={!typed.trim()} onClick={addTyped}>
            Add
          </Button>
        </div>
        {!canScan && (
          <p className="mt-2 text-xs text-stone-600 dark:text-stone-400">
            This browser cannot read tags directly. Chrome on Android can. Any phone can still
            follow a tag that has already been written, because that is an ordinary link.
          </p>
        )}
        {message && (
          <p role="status" className="mt-2 text-sm">
            {message}
          </p>
        )}
      </Card>

      {tags.length === 0 ? (
        <Card>
          <p className="text-sm text-stone-600 dark:text-stone-400">
            No tags yet. Scan one, or type its serial to add it by hand.
          </p>
        </Card>
      ) : (
        <Card>
          <LongList
            items={tags}
            keyOf={(t) => t.id}
            search={(t) =>
              [
                formatTagId(t.id),
                t.name ?? '',
                t.target ? targetLabel(state, t.target) : 'not paired',
              ].join(' ')
            }
            noun="tags"
            placeholder="Filter by serial, note, or what it is on…"
            filters={[
              { label: 'All tags', match: () => true },
              { label: 'Paired', match: (t) => Boolean(t.target) },
              { label: 'Not paired', match: (t) => !t.target },
            ]}
            row={(t) => {
              const missing = t.target ? targetMissing(state, t.target) : false
              const label =
                t.target?.kind === 'tree'
                  ? (positionByKey(state).get(t.target.posKey)?.label ?? '')
                  : ''
              return (
                <span className="flex flex-wrap items-center gap-2">
                  <Link
                    to={`/tag/${t.id}`}
                    className="font-mono text-xs underline decoration-dotted"
                  >
                    {formatTagId(t.id)}
                  </Link>
                  <span className="flex-1">
                    {t.target ? (
                      missing ? (
                        <Pill tone="warn">points at something that is gone</Pill>
                      ) : (
                        <Link
                          to={routeForTarget(state, t.target, label)}
                          className="underline decoration-dotted"
                        >
                          {targetLabel(state, t.target)}
                        </Link>
                      )
                    ) : (
                      <span className="text-stone-500 dark:text-stone-400">not paired</span>
                    )}
                  </span>
                  <input
                    className="w-28 rounded border border-stone-200 bg-transparent px-1.5 py-0.5 text-xs dark:border-stone-700"
                    defaultValue={t.name ?? ''}
                    placeholder="a note"
                    aria-label={`Note for tag ${formatTagId(t.id)}`}
                    onBlur={(e) => {
                      if (e.target.value !== (t.name ?? '')) renameTag(t.id, e.target.value)
                    }}
                  />
                  {canScan && (
                    <Button
                      variant="ghost"
                      onClick={() =>
                        busy === 'write' && writeTo === t.id ? stop() : void write(t.id)
                      }
                      title={`Write ${tagUrl(origin, t.id)} onto this tag`}
                    >
                      {busy === 'write' && writeTo === t.id ? 'Stop' : 'Write'}
                    </Button>
                  )}
                  {t.target && (
                    <Button variant="ghost" onClick={() => unpairTag(t.id)}>
                      Unpair
                    </Button>
                  )}
                  <Button variant="ghost" onClick={() => forgetTag(t.id)}>
                    Forget
                  </Button>
                </span>
              )
            }}
          />
        </Card>
      )}
    </div>
  )
}
