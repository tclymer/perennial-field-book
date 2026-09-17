import { usePhotoUrl } from '@/state/photos'
import type { TreeEvent } from '@/model/types'

function Thumb({ event }: { event: TreeEvent }) {
  const url = usePhotoUrl(event.photoId)
  if (!url) {
    return (
      <div className="flex h-24 w-24 items-center justify-center rounded bg-stone-100 dark:bg-stone-800 text-xs text-stone-400">
        photo
      </div>
    )
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="block">
      <img
        src={url}
        alt={event.note ? `${event.date}: ${event.note}` : event.date}
        className="h-24 w-24 rounded object-cover"
        loading="lazy"
      />
      <span className="block text-[10px] text-stone-500 dark:text-stone-400">{event.date}</span>
    </a>
  )
}

/** Thumbnails of every photo event, newest first. */
export function PhotoStrip({ events }: { events: TreeEvent[] }) {
  const photos = events.filter((e) => e.kind === 'photo' && e.photoId).reverse()
  if (photos.length === 0) return null
  return (
    <div className="flex gap-2 overflow-x-auto py-1">
      {photos.map((e) => (
        <Thumb key={e.id} event={e} />
      ))}
    </div>
  )
}
