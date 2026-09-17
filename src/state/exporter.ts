/** Writes the open farm to a file the user keeps. */
import { listPhotos, loadEvents } from '@/events/db'
import {
  blobToBase64,
  buildExport,
  downloadJson,
  fileSlug,
  type PhotoExport,
} from '@/events/bundle'
import { useFarmStore, whenWritten } from './store'

export async function exportCurrentFarm(): Promise<boolean> {
  const { farmId, state } = useFarmStore.getState()
  if (!farmId) return false
  await whenWritten()
  const events = await loadEvents(farmId)
  if (events === null) return false
  const photos: PhotoExport[] = []
  for (const p of await listPhotos(farmId)) {
    photos.push({ id: p.id, mime: p.mime, base64: await blobToBase64(p.blob) })
  }
  const bundle = buildExport(farmId, events, photos)
  const date = new Date().toISOString().slice(0, 10)
  downloadJson(
    `${fileSlug(state.farm?.name ?? 'farm')}-${date}.fieldbook.json`,
    JSON.stringify(bundle, null, 2),
  )
  return true
}
