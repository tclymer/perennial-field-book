import { useEffect, useMemo, useState } from 'react'
import { useFarmStore } from '@/state/store'
import { initialView, useDevice } from '@/state/device'
import { presetFor } from '@/map/presets'
import {
  cachedCount,
  clearOfflineTiles,
  plannedTiles,
  saveMapForOffline,
  type SaveProgress,
} from '@/map/offline'
import { Button, Card } from '@/ui/components'

/** Settings card: keep the free imagery over the farm for use without signal. */
export function OfflineSave() {
  const state = useFarmStore((s) => s.state)
  const prefs = useDevice()
  const set = useDevice((s) => s.set)
  const spec = useMemo(() => presetFor(prefs, initialView().center), [prefs])
  const plan = useMemo(() => plannedTiles(state, spec), [state, spec])
  const [cached, setCached] = useState<number | null>(null)
  const [progress, setProgress] = useState<SaveProgress | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    if (plan.ok && spec) {
      void cachedCount(spec, plan.tiles).then((n) => live && setCached(n))
    } else setCached(null)
    return () => {
      live = false
    }
  }, [plan, spec])

  const save = async () => {
    if (!plan.ok || !spec) return
    setMessage(null)
    setProgress({ done: 0, total: plan.tiles.length, failed: 0 })
    try {
      const result = await saveMapForOffline(spec, plan.tiles, setProgress)
      setCached(result.total - result.failed)
      set({
        offlineMap: {
          presetId: spec.id,
          presetName: spec.name,
          vintage: spec.vintage ?? null,
          savedAt: Date.now(),
          tiles: result.total - result.failed,
        },
      })
      setMessage(
        result.failed
          ? `Saved ${result.total - result.failed} tiles; ${result.failed} could not be fetched.`
          : `Saved ${result.total} tiles. The map over the farm now works without signal.`,
      )
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'The save failed.')
    } finally {
      setProgress(null)
    }
  }

  return (
    <Card>
      <h2 className="font-semibold">Map without signal</h2>
      <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
        Keeps the free imagery over the farm in this browser. Google imagery is never kept; offline,
        the map shows this saved imagery or just the drawn rows and trees.
      </p>
      {plan.ok ? (
        <p className="mt-2 text-sm">
          {spec?.name}: {plan.tiles.length} tiles cover the farm
          {cached !== null && `, ${cached} already saved`}.
          {prefs.offlineMap && prefs.offlineMap.presetId === spec?.id && (
            <span className="text-stone-500 dark:text-stone-400">
              {' '}
              Last saved {new Date(prefs.offlineMap.savedAt).toLocaleDateString()}
              {prefs.offlineMap.vintage && `, imagery from ${prefs.offlineMap.vintage}`}.
            </span>
          )}
        </p>
      ) : (
        <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">{plan.reason}</p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          disabled={!plan.ok || progress !== null}
          onClick={() => void save()}
        >
          {progress ? `Saving ${progress.done} of ${progress.total}…` : 'Save map for offline'}
        </Button>
        <Button
          variant="ghost"
          disabled={progress !== null}
          onClick={() => {
            void clearOfflineTiles().then(() => {
              setCached(0)
              set({ offlineMap: null })
              setMessage('Saved imagery removed.')
            })
          }}
        >
          Remove saved imagery
        </Button>
      </div>
      {message && (
        <p role="status" className="mt-2 text-sm">
          {message}
        </p>
      )}
    </Card>
  )
}
