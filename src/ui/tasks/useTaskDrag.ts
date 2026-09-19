/**
 * Drag a task row to reorder it, or drop it on another list to move it. Native HTML drag
 * events: they work with a mouse; touch screens keep the arrow buttons.
 */
import { useState, type DragEvent, type HTMLAttributes } from 'react'
import type { Bucket, Task } from '@/model/types'
import { placeTask } from '@/state/taskActions'

const TYPE = 'text/x-fieldbook-task'

export interface DragDest {
  bucket: Bucket
  projectId: string | null
}

export type DropIndicator = 'before' | 'after' | null

function carried(e: DragEvent): boolean {
  return Array.from(e.dataTransfer.types).includes(TYPE)
}

export function useTaskDrag(items: Task[], dest: DragDest) {
  const [over, setOver] = useState<{ id: string; after: boolean } | null>(null)
  const [overEnd, setOverEnd] = useState(false)

  const drop = (e: DragEvent, index: number) => {
    const id = e.dataTransfer.getData(TYPE)
    if (!id) return
    e.preventDefault()
    e.stopPropagation()
    const from = items.findIndex((x) => x.id === id)
    placeTask(id, { ...dest, index: from >= 0 && from < index ? index - 1 : index })
    setOver(null)
    setOverEnd(false)
  }

  const rowProps = (task: Task): HTMLAttributes<HTMLLIElement> & { draggable: boolean } => ({
    draggable: true,
    onDragStart: (e) => {
      e.dataTransfer.setData(TYPE, task.id)
      e.dataTransfer.effectAllowed = 'move'
      e.stopPropagation()
    },
    onDragOver: (e) => {
      if (!carried(e)) return
      e.preventDefault()
      e.stopPropagation()
      const r = e.currentTarget.getBoundingClientRect()
      const after = e.clientY > r.top + r.height / 2
      setOver((o) => (o?.id === task.id && o.after === after ? o : { id: task.id, after }))
      setOverEnd(false)
    },
    onDragLeave: () => setOver((o) => (o?.id === task.id ? null : o)),
    onDrop: (e) => {
      const i = items.findIndex((x) => x.id === task.id)
      const after =
        e.clientY >
        e.currentTarget.getBoundingClientRect().top +
          e.currentTarget.getBoundingClientRect().height / 2
      drop(e, Math.max(0, i) + (after ? 1 : 0))
    },
  })

  const containerProps: HTMLAttributes<HTMLElement> = {
    onDragOver: (e) => {
      if (!carried(e)) return
      e.preventDefault()
      setOverEnd(true)
    },
    onDragLeave: (e) => {
      if (e.currentTarget === e.target) setOverEnd(false)
    },
    onDrop: (e) => drop(e, items.length),
  }

  const indicator = (id: string): DropIndicator =>
    over?.id === id ? (over.after ? 'after' : 'before') : null

  return { rowProps, containerProps, indicator, overEnd }
}
