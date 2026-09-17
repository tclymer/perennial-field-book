/** Export and import of a whole farm: the event log plus photos, as one JSON file. */
import { exportBundle, parseEvent, type ExportBundle } from '@/model/schema'
import { APP_VERSION } from '@/version'
import type { AnyEvent } from './types'
import { sortEvents } from './reduce'

export interface PhotoExport {
  id: string
  mime: string
  base64: string
}

export function buildExport(
  farmId: string,
  events: readonly AnyEvent[],
  photos: PhotoExport[] = [],
  now = new Date(),
): ExportBundle {
  return {
    app: 'perennial-field-book',
    formatVersion: 1,
    appVersion: APP_VERSION,
    exportedAt: now.toISOString(),
    farmId,
    events: sortEvents(events),
    ...(photos.length ? { photos } : {}),
  }
}

export interface ParsedImport {
  farmId: string
  events: AnyEvent[]
  photos: PhotoExport[]
}

/** Validates a file's text. Throws with a readable message when it is not a farm export. */
export function parseImport(text: string): ParsedImport {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('That file is not JSON.')
  }
  const result = exportBundle.safeParse(raw)
  if (!result.success) throw new Error('That file is not a Perennial Field Book export.')
  const bundle = result.data
  const events: AnyEvent[] = []
  bundle.events.forEach((e, i) => {
    try {
      events.push(parseEvent(e) as AnyEvent)
    } catch {
      throw new Error(`Event ${i + 1} in the file is malformed.`)
    }
  })
  const wrongFarm = events.find((e) => e.farmId !== bundle.farmId)
  if (wrongFarm) throw new Error('The file mixes events from different farms.')
  return { farmId: bundle.farmId, events, photos: bundle.photos ?? [] }
}

export function fileSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'farm'
  )
}

export function downloadJson(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.readAsDataURL(blob)
  })
}

export function base64ToBlob(base64: string, mime: string): Blob {
  const bytes = atob(base64)
  const out = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) out[i] = bytes.charCodeAt(i)
  return new Blob([out], { type: mime })
}
