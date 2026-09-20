import { useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useFarmStore } from '@/state/store'
import { positionByKey } from '@/state/derived'
import { formatTagId, normalizeTagId, routeForTarget, targetMissing } from '@/engine/tags'
import { targetLabel } from '@/engine/logs'
import { pairTag } from '@/state/tagActions'
import type { Target } from '@/model/types'
import { Button, Card, PageHeader } from '@/ui/components'
import { TargetPicker } from '@/ui/tasks/TargetPicker'

/**
 * Where a tag's link lands. A paired tag is a signpost, so it hands straight over to whatever
 * it points at; an unpaired one asks what it should be on. Either way the tag itself is never
 * rewritten, which is what lets a tag outlive a row being renumbered or a tree being regrafted.
 */
export default function TagPage() {
  const { id: raw = '' } = useParams()
  const state = useFarmStore((s) => s.state)
  const navigate = useNavigate()
  const id = useMemo(() => normalizeTagId(raw), [raw])
  const tag = id ? state.tags[id] : undefined
  const [pick, setPick] = useState<Target | null>(null)

  if (!id) {
    return (
      <div className="space-y-3">
        <PageHeader title="Tag" />
        <Card>
          <p className="text-sm">
            That is not a tag serial number. A tag's link carries its own serial, so this one was
            either written by something else or has been altered.
          </p>
        </Card>
      </div>
    )
  }

  const live = tag && !tag.deleted ? tag : undefined
  const target = live?.target
  const gone = target ? targetMissing(state, target) : false

  if (target && !gone) {
    const label =
      target.kind === 'tree' ? (positionByKey(state).get(target.posKey)?.label ?? '') : ''
    return <Navigate replace to={routeForTarget(state, target, label)} />
  }

  const pair = () => {
    if (!pick) return
    const r = pairTag(id, pick)
    if (!r.ok) return
    const label = pick.kind === 'tree' ? (positionByKey(state).get(pick.posKey)?.label ?? '') : ''
    navigate(routeForTarget(state, pick, label), { replace: true })
  }

  return (
    <div className="space-y-3">
      <PageHeader title="Tag" subtitle={formatTagId(id)} />
      <Card>
        {gone && target ? (
          <p className="text-sm">
            This tag was on {targetLabel(state, target)}, which is no longer on the farm. Choose
            what it is on now.
          </p>
        ) : (
          <p className="text-sm">
            This tag is not paired to anything yet. Choose what it is on, and from now on tapping it
            will open that. You can move it to something else at any time without rewriting the tag.
          </p>
        )}
        <div className="mt-3">
          <TargetPicker
            targets={pick ? [pick] : []}
            onChange={(ts) => setPick(ts.length ? ts[ts.length - 1]! : null)}
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="primary" disabled={!pick} onClick={pair}>
            Pair this tag
          </Button>
          <Button variant="ghost" onClick={() => navigate('/tags')}>
            All tags
          </Button>
        </div>
      </Card>
    </div>
  )
}
