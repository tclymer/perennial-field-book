import { useEffect } from 'react'
import { Button } from '@/ui/components'

/** A short-lived message above the phone tab bar, with an optional Undo. */
export function Toast({
  message,
  onUndo,
  onClose,
  ms = 6000,
}: {
  message: string
  onUndo?: () => void
  onClose: () => void
  ms?: number
}) {
  useEffect(() => {
    const t = setTimeout(onClose, ms)
    return () => clearTimeout(t)
  }, [onClose, ms])
  return (
    <div
      role="status"
      className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+4.25rem)] z-30 mx-auto flex max-w-md items-center gap-3 rounded-lg bg-stone-900 px-4 py-2.5 text-sm text-white shadow-lg dark:bg-stone-100 dark:text-stone-900 md:bottom-4"
    >
      <span className="flex-1">{message}</span>
      {onUndo && (
        <Button
          variant="ghost"
          className="text-lime-300 dark:text-lime-700"
          onClick={() => {
            onUndo()
            onClose()
          }}
        >
          Undo
        </Button>
      )}
    </div>
  )
}
