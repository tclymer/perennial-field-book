import { useState } from 'react'
import { addLog } from '@/state/taskActions'
import { Button } from '@/ui/components'
import { DoneSheet } from '@/ui/tasks/DoneSheet'

/** "Log work here" on a tree page: a work log with this tree as its place. */
export function LogWork({
  posKey,
  onDone,
}: {
  posKey: string
  onDone?: (message: string) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>Log work here</Button>
      {open && (
        <DoneSheet
          title="Work on this tree"
          showDetails
          initial={{ targets: [{ kind: 'tree', posKey }] }}
          onSubmit={(v) => {
            addLog({ ...v, category: v.category ?? undefined, targets: v.targets ?? [] })
            setOpen(false)
            onDone?.('Work logged.')
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
