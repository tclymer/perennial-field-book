/** Photos live in IndexedDB next to the events, resized so a farm's worth stays small. */
import { useEffect, useState } from 'react'
import { getPhoto, putPhoto } from '@/events/db'
import { newId } from '@/model/ids'

const MAX_PX = 1600

/** Shrink an image so its longer side is at most `maxPx`, as a JPEG. Falls back to the original. */
export async function resizeImage(file: Blob, maxPx = MAX_PX): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxPx / Math.max(bitmap.width, bitmap.height))
    if (scale === 1 && file.type === 'image/jpeg') return file
    const w = Math.round(bitmap.width * scale)
    const h = Math.round(bitmap.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close()
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.85),
    )
    return blob ?? file
  } catch {
    return file
  }
}

/** Store a photo for the farm. Returns its id, or null when storage refused it. */
export async function addPhoto(farmId: string, file: Blob): Promise<string | null> {
  const blob = await resizeImage(file)
  const id = newId('pho')
  const ok = await putPhoto({
    id,
    farmId,
    mime: blob.type || 'image/jpeg',
    blob,
    createdAt: Date.now(),
  })
  return ok ? id : null
}

const urls = new Map<string, string>()

/** An object URL for a stored photo, cached for the page's life. */
export async function photoUrl(id: string): Promise<string | null> {
  const hit = urls.get(id)
  if (hit) return hit
  const row = await getPhoto(id)
  if (!row) return null
  const url = URL.createObjectURL(row.blob)
  urls.set(id, url)
  return url
}

export function usePhotoUrl(id: string | undefined): string | null {
  const [url, setUrl] = useState<string | null>(id ? (urls.get(id) ?? null) : null)
  useEffect(() => {
    let live = true
    if (!id) return
    void photoUrl(id).then((u) => {
      if (live) setUrl(u)
    })
    return () => {
      live = false
    }
  }, [id])
  return url
}
