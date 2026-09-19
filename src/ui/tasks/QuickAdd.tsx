import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { useFarmStore } from '@/state/store'
import { parseLine, quickAdd } from '@/state/taskActions'
import { targetLabel } from '@/engine/logs'
import type { ParsedTitle } from '@/engine/tasks'
import { categoryLabel } from '@/model/categories'
import type { Bucket } from '@/model/types'
import { inputClass } from '@/ui/components'

/**
 * One box: type or dictate, press Enter. While typing, chips show what the parser
 * understood (place, category, owner, season), so a wrong guess is visible before saving.
 */
export function QuickAdd({
  bucket = 'now',
  projectId,
  placeholder = 'Add a task… e.g. "prune PP1 rows 1-4"',
  autoFocus,
  onAdded,
}: {
  bucket?: Bucket
  projectId?: string
  placeholder?: string
  autoFocus?: boolean
  onAdded?: (id: string) => void
}) {
  const state = useFarmStore((s) => s.state)
  const [text, setText] = useState('')
  const [preview, setPreview] = useState<ParsedTitle | null>(null)

  useEffect(() => {
    if (!text.trim()) {
      setPreview(null)
      return
    }
    const t = setTimeout(() => setPreview(parseLine(text)), 150)
    return () => clearTimeout(t)
  }, [text])

  const add = () => {
    const id = quickAdd(text, bucket, projectId)
    if (!id) return
    setText('')
    setPreview(null)
    onAdded?.(id)
  }

  const chips: string[] = []
  if (preview) {
    for (const t of preview.targets) chips.push(targetLabel(state, t))
    if (preview.category) chips.push(categoryLabel(preview.category, state.farm?.categories))
    if (preview.ownerId) chips.push(state.people[preview.ownerId]?.name ?? 'owner')
    if (preview.season) chips.push(preview.season)
    if (preview.needsDiscussion) chips.push('discuss')
  }

  return (
    <div>
      <input
        className={clsx(inputClass, 'w-full py-2 text-base')}
        value={text}
        placeholder={placeholder}
        autoFocus={autoFocus}
        enterKeyHint="done"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            add()
          }
        }}
        aria-label="Add a task"
      />
      {chips.length > 0 && (
        <p className="mt-1 flex flex-wrap gap-1 text-xs text-stone-500 dark:text-stone-400">
          {chips.map((c, i) => (
            <span key={i} className="rounded-full bg-stone-100 dark:bg-stone-800 px-2 py-0.5">
              {c}
            </span>
          ))}
        </p>
      )}
    </div>
  )
}
