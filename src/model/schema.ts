/**
 * Validation for event payloads and the export bundle. Bounded primitives so a hostile
 * file cannot cause absurd loops; ids are plain strings so imports from other devices pass.
 */
import { z } from 'zod'
import { CODE_RE } from './ids'

export const lngLat = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)])
export const polyline = z.array(lngLat).min(2).max(200)
export const ring = z.array(lngLat).min(3).max(500)

const id = z.string().min(1).max(80)
const short = z.string().max(120)
const text = z.string().max(4000)
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const year = z.number().int().min(1900).max(2200)
const feet = z.number().min(0.1).max(5000)
const compass = z.enum(['N', 'S', 'E', 'W'])
const treeStatus = z.enum(['alive', 'struggling', 'dead', 'removed'])
const featureKind = z.enum(['building', 'greenhouse', 'area', 'fence', 'windbreak', 'other'])
const treeEventKind = z.enum([
  'planted',
  'grafted',
  'fruited',
  'died',
  'removed',
  'scionwood',
  'note',
  'photo',
  'status',
])

export const numbering = z.object({ rowsFrom: compass, positionsFrom: short })

export const plannerLink = z.object({
  plantingId: id,
  name: short.optional(),
  rowLengthFt: feet.optional(),
  rowWidthFt: feet.optional(),
  inRowSpacingFt: feet.optional(),
  rows: z.number().min(0).max(10000).optional(),
  unit: short.optional(),
  plantedYear: year.optional(),
})

export const rowLayout = z.discriminatedUnion('by', [
  z.object({ by: z.literal('count'), count: z.number().int().min(1).max(2000) }),
  z.object({ by: z.literal('spacing'), spacingFt: feet }),
])

export const featureGeometry = z.discriminatedUnion('type', [
  z.object({ type: z.literal('Point'), coordinates: lngLat }),
  z.object({ type: z.literal('Polygon'), coordinates: ring }),
])

// Payloads. `create` payloads carry every field; `patch` payloads carry any subset, with
// `null` meaning "clear this field".

const blockFields = {
  code: z.string().regex(CODE_RE),
  name: short.min(1),
  numbering,
  species: short.optional(),
  rowSpacingFt: feet.optional(),
  inRowSpacingFt: feet.optional(),
  notes: text.optional(),
  planner: plannerLink.optional(),
  outline: ring.optional(),
  color: short.optional(),
}
export const blockCreate = z.object({ id, ...blockFields })
export const blockPatch = z.object({
  id,
  code: blockFields.code.optional(),
  name: blockFields.name.optional(),
  numbering: numbering.optional(),
  species: short.nullable().optional(),
  rowSpacingFt: feet.nullable().optional(),
  inRowSpacingFt: feet.nullable().optional(),
  notes: text.nullable().optional(),
  planner: plannerLink.nullable().optional(),
  outline: ring.nullable().optional(),
  color: short.nullable().optional(),
})

export const rowCreate = z.object({
  id,
  blockId: id,
  number: z.number().int().min(1).max(10000),
  polyline,
  layout: rowLayout,
  defaultVarietyId: id.optional(),
  notes: text.optional(),
})
export const rowPatch = z.object({
  id,
  number: z.number().int().min(1).max(10000).optional(),
  polyline: polyline.optional(),
  layout: rowLayout.optional(),
  defaultVarietyId: id.nullable().optional(),
  notes: text.nullable().optional(),
})

export const positionCreate = z.object({
  id,
  blockId: id,
  number: z.number().int().min(1).max(10000),
  coord: lngLat,
})
export const positionPatch = z.object({
  id,
  number: z.number().int().min(1).max(10000).optional(),
  coord: lngLat.optional(),
})

export const featureCreate = z.object({
  id,
  name: short.min(1),
  kind: featureKind,
  geometry: featureGeometry,
  notes: text.optional(),
})
export const featurePatch = z.object({
  id,
  name: short.min(1).optional(),
  kind: featureKind.optional(),
  geometry: featureGeometry.optional(),
  notes: text.nullable().optional(),
})

export const varietyCreate = z.object({
  id,
  species: short.min(1),
  name: short.min(1),
  aliases: z.array(short).max(20).optional(),
  source: short.optional(),
  notes: text.optional(),
  color: short.optional(),
})
export const varietyPatch = z.object({
  id,
  species: short.min(1).optional(),
  name: short.min(1).optional(),
  aliases: z.array(short).max(20).optional(),
  source: short.nullable().optional(),
  notes: text.nullable().optional(),
  color: short.nullable().optional(),
})

export const treeCreate = z.object({
  id,
  posKey: id,
  varietyId: id.optional(),
  status: treeStatus.optional(),
  plantedDate: isoDate.optional(),
  graftedDate: isoDate.optional(),
  firstFruitYear: year.optional(),
  rootstock: short.optional(),
  notes: text.optional(),
})
export const treePatch = z.object({
  id,
  varietyId: id.nullable().optional(),
  status: treeStatus.optional(),
  plantedDate: isoDate.nullable().optional(),
  graftedDate: isoDate.nullable().optional(),
  firstFruitYear: year.nullable().optional(),
  rootstock: short.nullable().optional(),
  notes: text.nullable().optional(),
})

export const treeEventCreate = z.object({
  id,
  treeId: id,
  kind: treeEventKind,
  date: isoDate,
  varietyId: id.optional(),
  status: treeStatus.optional(),
  note: text.optional(),
  photoId: id.optional(),
})

const byId = z.object({ id })
const nudge = z.object({ posKey: id, coord: lngLat.nullable() })
const planRef = z.object({ year, posKey: id })

export const farmCreate = z.object({
  id,
  name: short.min(1),
  center: lngLat,
  zoom: z.number().min(0).max(24),
})
export const farmPatch = z.object({
  name: short.min(1).optional(),
  center: lngLat.optional(),
  zoom: z.number().min(0).max(24).optional(),
})

/** Every event type and its payload schema. */
export const PAYLOADS = {
  'farm.create': farmCreate,
  'farm.patch': farmPatch,
  'block.create': blockCreate,
  'block.patch': blockPatch,
  'block.delete': byId,
  'block.restore': byId,
  'row.create': rowCreate,
  'row.patch': rowPatch,
  'row.delete': byId,
  'row.restore': byId,
  'position.create': positionCreate,
  'position.patch': positionPatch,
  'position.delete': byId,
  'position.restore': byId,
  'position.nudge': nudge,
  'feature.create': featureCreate,
  'feature.patch': featurePatch,
  'feature.delete': byId,
  'feature.restore': byId,
  'variety.create': varietyCreate,
  'variety.patch': varietyPatch,
  'variety.delete': byId,
  'variety.restore': byId,
  'tree.create': treeCreate,
  'tree.patch': treePatch,
  'tree.delete': byId,
  'tree.restore': byId,
  'tree.event': treeEventCreate,
  'tree.event.delete': byId,
  'graft.plan': planRef.extend({ varietyId: id }),
  'graft.unplan': planRef,
  'graft.done': planRef.extend({ treeEventId: id }),
} as const

export type EventType = keyof typeof PAYLOADS
export type PayloadOf<T extends EventType> = z.infer<(typeof PAYLOADS)[T]>

export const EVENT_TYPES = Object.keys(PAYLOADS) as EventType[]

export const envelope = z.object({
  id,
  farmId: id,
  deviceId: id,
  ts: z.number().int().min(0),
  type: z.string().min(1).max(60),
  payload: z.unknown(),
})

/**
 * Validates one event. Known types get their payload checked; unknown types pass through so
 * a newer device's events survive in an older app's log.
 */
export function parseEvent(raw: unknown) {
  const env = envelope.parse(raw)
  const schema = (PAYLOADS as Record<string, z.ZodTypeAny>)[env.type]
  if (!schema) return env
  return { ...env, payload: schema.parse(env.payload) }
}

export const exportBundle = z.object({
  app: z.literal('perennial-field-book'),
  formatVersion: z.literal(1),
  appVersion: z.string(),
  exportedAt: z.string(),
  farmId: id,
  events: z.array(z.unknown()).max(1_000_000),
  photos: z
    .array(z.object({ id, mime: z.string().max(60), base64: z.string() }))
    .max(50_000)
    .optional(),
})
export type ExportBundle = z.infer<typeof exportBundle>
