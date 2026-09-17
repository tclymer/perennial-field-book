import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapView } from '@/map/MapView'
import { presetFor } from '@/map/presets'
import { initialView, useDevice, type MapView as View } from '@/state/device'
import { useFarmStore } from '@/state/store'
import { parseImport } from '@/events/bundle'
import { Button, Card, Field, PageHeader, inputClass } from '@/ui/components'

export default function FirstRunPage() {
  const navigate = useNavigate()
  const createFarm = useFarmStore((s) => s.createFarm)
  const importLog = useFarmStore((s) => s.importLog)
  const prefs = useDevice()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const start = useRef<View>(initialView())
  const view = useRef<View>(start.current)
  const basemap = presetFor(prefs, start.current.center)

  const create = async () => {
    setBusy(true)
    try {
      await createFarm(name.trim() || 'My Farm', view.current.center, view.current.zoom)
      navigate('/')
    } finally {
      setBusy(false)
    }
  }

  const restore = async (file: File) => {
    setMessage(null)
    try {
      const parsed = parseImport(await file.text())
      const ok = await importLog(parsed.farmId, parsed.events)
      if (!ok) throw new Error('The file could not be saved in this browser.')
      navigate('/')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'That file could not be read.')
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Set up your farm"
        subtitle="Name it and point the map at it. Everything stays in this browser."
      />
      <Card className="space-y-3">
        <Field label="Farm name">
          <input
            className={inputClass}
            value={name}
            placeholder="Threefold Farm"
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </Field>
        <div>
          <p className="mb-1 text-sm text-stone-600 dark:text-stone-400">
            Pan and zoom until the orchard fills the map. This becomes the home view.
          </p>
          <div className="relative h-[50vh] overflow-hidden rounded-lg border border-stone-200 dark:border-stone-700">
            <MapView
              className="absolute inset-0"
              initialView={start.current}
              basemap={basemap}
              onViewChange={(v) => {
                view.current = v
              }}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={() => void create()} disabled={busy}>
            Create farm
          </Button>
          <label className="text-sm text-stone-600 dark:text-stone-400">
            or restore an export:{' '}
            <input
              type="file"
              accept=".json,application/json"
              className="text-sm"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void restore(f)
                e.target.value = ''
              }}
            />
          </label>
        </div>
        {message && (
          <p role="alert" className="text-sm text-rose-700 dark:text-rose-400">
            {message}
          </p>
        )}
      </Card>
    </div>
  )
}
