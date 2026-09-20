/**
 * Pairing NFC tags to places on the farm. A tag is created the first time it is seen, and
 * from then on only its target changes. Nothing here rewrites a tag: the link burned into it
 * names the tag, and this is where the app decides what that tag means today.
 */
import type { Tag, Target } from '@/model/types'
import type { NewEvent } from '@/events/types'
import { normalizeTagId } from '@/engine/tags'
import { today } from './actions'
import { useFarmStore } from './store'

export type TagResult = { ok: true; id: string } | { ok: false; reason: string }

function state() {
  return useFarmStore.getState().state
}

function commit(events: NewEvent[]) {
  return useFarmStore.getState().commit(events)
}

/** Record a tag without pairing it, so a tag can be written before anyone decides its job. */
export function ensureTag(rawId: string, name?: string): TagResult {
  const id = normalizeTagId(rawId)
  if (!id) return { ok: false, reason: 'That does not look like a tag serial number.' }
  if (state().tags[id] && !state().tags[id]!.deleted) {
    if (name) commit([{ type: 'tag.patch', payload: { id, name } }])
    return { ok: true, id }
  }
  commit([{ type: 'tag.create', payload: { id, ...(name ? { name } : {}) } }])
  return { ok: true, id }
}

/** Point a tag at something. Re-pairing an already paired tag simply replaces its target. */
export function pairTag(rawId: string, target: Target, date?: string): TagResult {
  const id = normalizeTagId(rawId)
  if (!id) return { ok: false, reason: 'That does not look like a tag serial number.' }
  const existing = state().tags[id]
  const events: NewEvent[] = []
  if (!existing || existing.deleted) {
    events.push({ type: 'tag.create', payload: { id, target, pairedAt: date ?? today() } })
  } else {
    events.push({ type: 'tag.patch', payload: { id, target, pairedAt: date ?? today() } })
  }
  commit(events)
  return { ok: true, id }
}

/** Leave the tag on record but pointing at nothing, ready to go on something else. */
export function unpairTag(id: string): void {
  commit([{ type: 'tag.patch', payload: { id, target: null, pairedAt: null } }])
}

export function renameTag(id: string, name: string): void {
  commit([{ type: 'tag.patch', payload: { id, name: name.trim() || null } }])
}

/** Forget a tag entirely: the sticker is gone, or was never ours. */
export function forgetTag(id: string): void {
  commit([{ type: 'tag.delete', payload: { id } }])
}

export function restoreTag(id: string): void {
  commit([{ type: 'tag.restore', payload: { id } }])
}

export function tagList(): Tag[] {
  return Object.values(state().tags).filter((t) => !t.deleted)
}
