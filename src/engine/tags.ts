/**
 * NFC tags (DESIGN.md §3.8). A tag is written once, with a link that names the tag itself
 * rather than what it is on. The pairing from tag to place lives in the farm log, so moving
 * a tag to another tree is a change here and never a rewrite of the tag.
 *
 * That also means a tag survives everything that moves a label: thinning a row renumbers the
 * trees after the gap, and regrafting changes a tree's variety, but neither touches the key
 * a tag is paired to.
 */
import type { FarmState, Tag, Target } from '@/model/types'
import { live } from '@/events/reduce'
import { allPositions } from './layout'

/** Where a tag's link should land in the app. */
export const TAG_PATH = 'tag'

/**
 * A tag serial as the app stores it: hex, lower case, no separators. Readers hand it over in
 * several shapes, so accept the common ones rather than make the person retype it.
 */
export function normalizeTagId(raw: string): string | null {
  const hex = raw
    .trim()
    .toLowerCase()
    .replace(/[\s:.-]/g, '')
  if (!/^[0-9a-f]{8,20}$/.test(hex)) return null
  if (hex.length % 2 !== 0) return null
  return hex
}

/** How a serial reads to a person: pairs of hex separated by colons. */
export function formatTagId(id: string): string {
  return (id.match(/../g) ?? []).join(':').toUpperCase()
}

/**
 * The link written to a tag. It has to be absolute, because the phone opens it cold with no
 * app running, and it has to carry the hash route because that is how this app addresses
 * itself.
 */
export function tagUrl(origin: string, id: string): string {
  return `${origin.replace(/\/+$/, '')}/#/${TAG_PATH}/${id}`
}

/** The tag id in a link, however that link reached us. Null when it is not one of ours. */
export function tagIdFromUrl(url: string): string | null {
  const m = url.match(new RegExp(`#/${TAG_PATH}/([^/?#]+)`))
  return m ? normalizeTagId(decodeURIComponent(m[1]!)) : null
}

export function tagOf(state: FarmState, id: string): Tag | undefined {
  const tag = state.tags[id]
  return tag && !tag.deleted ? tag : undefined
}

/** Tags pointing at a target, so a tree page can say which tags are on it. */
export function tagsFor(state: FarmState, target: Target): Tag[] {
  return live.tags(state).filter((t) => t.target && sameTarget(t.target, target))
}

export function sameTarget(a: Target, b: Target): boolean {
  if (a.kind !== b.kind) return false
  switch (a.kind) {
    case 'farm':
      return true
    case 'tree':
      return a.posKey === (b as { posKey: string }).posKey
    case 'species':
      return a.species.toLowerCase() === (b as { species: string }).species.toLowerCase()
    default:
      return a.id === (b as { id: string }).id
  }
}

/**
 * Where a tag should take you. A tree opens its own page by label, which is why the label has
 * to be looked up now rather than written onto the tag: the number may have changed since.
 */
export function routeForTarget(state: FarmState, target: Target, label: string): string {
  switch (target.kind) {
    case 'tree':
      return `/t/${encodeURIComponent(label)}`
    case 'block':
      return `/blocks/${target.id}/grid`
    case 'row': {
      const row = state.rows[target.id]
      return row ? `/blocks/${row.blockId}/grid` : '/blocks'
    }
    case 'feature':
      return `/?feature=${encodeURIComponent(target.id)}`
    case 'species':
      return `/varieties?species=${encodeURIComponent(target.species)}`
    case 'farm':
      return '/'
  }
}

/** True when the thing a tag points at is gone, so the tag screen can offer to re-pair it. */
export function targetMissing(state: FarmState, target: Target): boolean {
  switch (target.kind) {
    case 'farm':
      return false
    case 'species':
      return false
    case 'tree':
      // A spot taken out of a row still has its key, but it holds nothing to send anyone to.
      return !allPositions(state).some((p) => p.posKey === target.posKey)
    case 'block':
      return !state.blocks[target.id] || Boolean(state.blocks[target.id]?.deleted)
    case 'row':
      return !state.rows[target.id] || Boolean(state.rows[target.id]?.deleted)
    case 'feature':
      return !state.features[target.id] || Boolean(state.features[target.id]?.deleted)
  }
}
