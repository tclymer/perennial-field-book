/**
 * Drag a task row to reorder it, or drop it on another list to move it. A mouse uses native
 * HTML drag events, which also carry a task between lists. Touch screens do not fire those,
 * so a finger on the grip is followed with pointer events instead, reordering within the
 * one list.
 */
import {
  useRef,
  useState,
  type DragEvent,
  type HTMLAttributes,
  type PointerEvent as ReactPointerEvent,
} from 'react'
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

/** How close to the top or bottom of the screen a finger has to be to scroll the page. */
const EDGE_PX = 64

export function useTaskDrag(items: Task[], dest: DragDest) {
  const [over, setOver] = useState<{ id: string; after: boolean } | null>(null)
  const [overEnd, setOverEnd] = useState(false)
  const [touching, setTouching] = useState<string | null>(null)
  const target = useRef<{ id: string; after: boolean } | null>(null)

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

  /** The row under a finger, and whether the finger is in its lower half. */
  const rowAt = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-task-id]')
    const id = el?.dataset.taskId
    if (!el || !id || !items.some((t) => t.id === id)) return null
    const r = el.getBoundingClientRect()
    return { id, after: y > r.top + r.height / 2 }
  }

  /** Spread on the grip: press it and slide to reorder, on a touch screen or with a pen. */
  const handleProps = (task: Task): HTMLAttributes<HTMLElement> => ({
    style: { touchAction: 'none' },
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.pointerType === 'mouse') return
      e.preventDefault()
      e.currentTarget.setPointerCapture?.(e.pointerId)
      target.current = null
      setTouching(task.id)
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      if (touching !== task.id) return
      if (e.clientY < EDGE_PX) window.scrollBy(0, -12)
      else if (e.clientY > window.innerHeight - EDGE_PX) window.scrollBy(0, 12)
      const hit = rowAt(e.clientX, e.clientY)
      target.current = hit && hit.id !== task.id ? hit : null
      setOver(target.current)
    },
    onPointerUp: () => {
      if (touching !== task.id) return
      const hit = target.current
      if (hit) {
        const i = items.findIndex((x) => x.id === hit.id) + (hit.after ? 1 : 0)
        const from = items.findIndex((x) => x.id === task.id)
        placeTask(task.id, { ...dest, index: from < i ? i - 1 : i })
      }
      target.current = null
      setOver(null)
      setTouching(null)
    },
    onPointerCancel: () => {
      target.current = null
      setOver(null)
      setTouching(null)
    },
  })

  const rowProps = (
    task: Task,
  ): HTMLAttributes<HTMLLIElement> & { draggable: boolean; 'data-task-id': string } => ({
    draggable: true,
    'data-task-id': task.id,
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

  return { rowProps, handleProps, containerProps, indicator, overEnd, touching }
}
