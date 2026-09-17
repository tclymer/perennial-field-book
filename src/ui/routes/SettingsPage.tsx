import { Button, Card, Field, NumberInput, PageHeader, inputClass } from '@/ui/components'
import { PRESETS, PRESET_IDS, autoPreset } from '@/map/presets'
import { initialView, useDevice } from '@/state/device'

export default function SettingsPage() {
  return (
    <div className="space-y-4">
      <PageHeader title="Settings" />
      <ImagerySettings />
    </div>
  )
}

function ImagerySettings() {
  const basemap = useDevice((s) => s.basemap)
  const custom = useDevice((s) => s.customTiles)
  const set = useDevice((s) => s.set)
  const auto = autoPreset(initialView().center)
  const value = basemap ?? 'auto'
  return (
    <Card>
      <h2 className="font-semibold">Map imagery</h2>
      <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
        Free public imagery for tracing rows and for the field map. This choice is kept on this
        device.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Source">
          <select
            className={inputClass}
            value={value}
            onChange={(e) => {
              const v = e.target.value
              set({ basemap: v === 'auto' ? null : (v as typeof basemap) })
            }}
          >
            <option value="auto">Automatic ({PRESETS[auto].name})</option>
            {PRESET_IDS.map((id) => (
              <option key={id} value={id}>
                {PRESETS[id].name}
              </option>
            ))}
            <option value="custom">Custom tile URL</option>
            <option value="none">No imagery</option>
          </select>
        </Field>
      </div>
      {basemap === 'custom' && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field
            label="Tile URL template"
            hint="An XYZ template with {z}, {x}, and {y}, for a state service or your own imagery."
            className="sm:col-span-2"
          >
            <input
              className={inputClass}
              value={custom?.url ?? ''}
              placeholder="https://example.org/tiles/{z}/{x}/{y}.png"
              onChange={(e) =>
                set({
                  customTiles: {
                    url: e.target.value,
                    maxzoom: custom?.maxzoom ?? 19,
                    attribution: custom?.attribution ?? '',
                  },
                })
              }
            />
          </Field>
          <Field label="Maximum zoom">
            <NumberInput
              value={custom?.maxzoom ?? 19}
              min={10}
              max={23}
              step={1}
              onChange={(maxzoom) =>
                set({
                  customTiles: {
                    url: custom?.url ?? '',
                    maxzoom,
                    attribution: custom?.attribution ?? '',
                  },
                })
              }
            />
          </Field>
          <Field label="Credit line">
            <input
              className={inputClass}
              value={custom?.attribution ?? ''}
              onChange={(e) =>
                set({
                  customTiles: {
                    url: custom?.url ?? '',
                    maxzoom: custom?.maxzoom ?? 19,
                    attribution: e.target.value,
                  },
                })
              }
            />
          </Field>
        </div>
      )}
      <div className="mt-3">
        <Button variant="ghost" onClick={() => set({ lastView: null })}>
          Forget the last map position
        </Button>
      </div>
    </Card>
  )
}
