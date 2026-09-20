import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Card, Field, NumberInput, PageHeader, Pill, inputClass } from '@/ui/components'
import { PRESETS, PRESET_IDS, autoPreset } from '@/map/presets'
import { initialView, useDevice } from '@/state/device'
import { useFarmStore } from '@/state/store'
import { exportCurrentFarm } from '@/state/exporter'
import { parseImport } from '@/events/bundle'
import { nextTheme, themeLabel, useTheme } from '@/ui/theme'
import { OfflineSave } from '@/ui/map/OfflineSave'
import type { EntityKind } from '@/model/types'
import { APP_VERSION, BUILD_DATE } from '@/version'
import { AccountCard } from '@/ui/settings/AccountCard'
import { SyncCard } from '@/ui/settings/SyncCard'
import { ShareCard } from '@/ui/settings/ShareCard'
import { PeopleCard, TaskSettingsCard } from '@/ui/settings/PeopleCard'
import { HarvestUnitsCard } from '@/ui/settings/HarvestUnitsCard'
import { CoverageCard } from '@/ui/settings/CoverageCard'
import { RemoteFarms } from '@/ui/settings/RemoteFarms'
import { LongList } from '@/ui/LongList'

export default function SettingsPage() {
  const navigate = useNavigate()
  return (
    <div className="space-y-4">
      <PageHeader
        title="Settings"
        subtitle={`Version ${APP_VERSION}${BUILD_DATE ? `, built ${BUILD_DATE}` : ''}`}
      />
      <FarmSettings />
      <AccountCard />
      <SyncCard />
      <ShareCard />
      <RemoteFarms onOpened={() => navigate('/')} returnTo="/settings" />
      <PeopleCard />
      <TaskSettingsCard />
      <HarvestUnitsCard />
      <TagsCard />
      <CoverageCard />
      <ImagerySettings />
      <OfflineSave />
      <DataSettings />
      <RecentlyDeleted />
      <Appearance />
    </div>
  )
}

function TagsCard() {
  const tags = useFarmStore((s) => s.state.tags)
  const n = Object.values(tags).filter((t) => !t.deleted).length
  const paired = Object.values(tags).filter((t) => !t.deleted && t.target).length
  return (
    <Card>
      <h2 className="font-semibold">NFC tags</h2>
      <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
        {n === 0
          ? 'None yet. A tag is written once and then points at whatever you pair it to, so it keeps working when a row is renumbered or a tree is regrafted.'
          : `${n} tag${n === 1 ? '' : 's'}, ${paired} paired.`}
      </p>
      <p className="mt-2">
        <Link to="/tags" className="text-sm underline decoration-dotted">
          Tags and pairing
        </Link>
      </p>
    </Card>
  )
}

function FarmSettings() {
  const farm = useFarmStore((s) => s.state.farm)
  const commit = useFarmStore((s) => s.commit)
  const lastView = useDevice((s) => s.lastView)
  const [name, setName] = useState(farm?.name ?? '')
  if (!farm) return null
  return (
    <Card>
      <h2 className="font-semibold">Farm</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Name">
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              const v = name.trim()
              if (v && v !== farm.name) commit([{ type: 'farm.patch', payload: { name: v } }])
              else setName(farm.name)
            }}
          />
        </Field>
        <Field
          label="Home view"
          hint="Where the map opens for everyone. Uses the spot this device last left the map."
        >
          <Button
            disabled={!lastView}
            onClick={() =>
              lastView &&
              commit([
                {
                  type: 'farm.patch',
                  payload: { center: lastView.center, zoom: lastView.zoom },
                },
              ])
            }
          >
            Set home view to the last map position
          </Button>
        </Field>
      </div>
    </Card>
  )
}

const HAS_GOOGLE_KEY = Boolean(import.meta.env.VITE_GOOGLE_MAPS_KEY)

function ImagerySettings() {
  const basemap = useDevice((s) => s.basemap)
  const custom = useDevice((s) => s.customTiles)
  const googleEnabled = useDevice((s) => s.googleEnabled)
  const set = useDevice((s) => s.set)
  const auto = autoPreset(initialView().center)
  const value = basemap ?? 'auto'
  return (
    <Card>
      <h2 className="font-semibold">Map imagery</h2>
      <label className="mt-2 flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={googleEnabled && HAS_GOOGLE_KEY}
          disabled={!HAS_GOOGLE_KEY}
          onChange={(e) => set({ googleEnabled: e.target.checked })}
        />
        <span>
          Google satellite imagery when online
          <span className="block text-xs text-stone-500 dark:text-stone-400">
            {HAS_GOOGLE_KEY
              ? 'The most recent imagery. Held to the free tier by a daily limit; the map falls back to the free source below when the limit is reached, and never stores Google tiles.'
              : 'This build has no Google key, so the free source below is used.'}
          </span>
        </span>
      </label>
      <p className="mt-3 text-sm text-stone-600 dark:text-stone-400">
        Free public imagery, used offline and whenever Google is not showing. This choice is kept on
        this device.
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
    </Card>
  )
}

function DataSettings() {
  const navigate = useNavigate()
  const importLog = useFarmStore((s) => s.importLog)
  const deleteFarm = useFarmStore((s) => s.deleteFarm)
  const applied = useFarmStore((s) => s.state.applied)
  const storageUnavailable = useFarmStore((s) => s.storageUnavailable)
  const [message, setMessage] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const restore = async (file: File) => {
    setMessage(null)
    try {
      const parsed = parseImport(await file.text())
      const ok = await importLog(parsed.farmId, parsed.events)
      if (!ok) throw new Error('The file could not be saved in this browser.')
      setMessage(`Imported ${parsed.events.length} events.`)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'That file could not be read.')
    }
  }

  return (
    <Card>
      <h2 className="font-semibold">Your data</h2>
      <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
        {applied} recorded changes live in this browser. Export a copy now and then, and turn on
        sync above to keep one on the server.
      </p>
      {storageUnavailable && (
        <p role="alert" className="mt-2 text-sm text-amber-700 dark:text-amber-400">
          This browser refused to save. Changes will be lost when the page closes, so export now.
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={() => void exportCurrentFarm()}>
          Export a copy
        </Button>
        <label className="text-sm text-stone-600 dark:text-stone-400">
          Import an export:{' '}
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
        <p role="status" className="mt-2 text-sm text-stone-700 dark:text-stone-300">
          {message}
        </p>
      )}
      <div className="mt-4 border-t border-stone-100 dark:border-stone-800 pt-3">
        {confirmDelete ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>Delete this farm from this browser? Export first if you want to keep it.</span>
            <Button
              variant="danger"
              onClick={() => {
                void deleteFarm().then(() => navigate('/start'))
              }}
            >
              Yes, delete it
            </Button>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Keep it
            </Button>
          </div>
        ) : (
          <Button variant="danger" onClick={() => setConfirmDelete(true)}>
            Delete this farm from this browser
          </Button>
        )}
      </div>
    </Card>
  )
}

const KIND_LABEL: Record<EntityKind, string> = {
  block: 'Block',
  row: 'Row',
  position: 'Position',
  feature: 'Feature',
  variety: 'Variety',
  tree: 'Tree',
  person: 'Person',
  task: 'Task',
  log: 'Work log',
  harvest: 'Harvest',
  tag: 'Tag',
}

function RecentlyDeleted() {
  const state = useFarmStore((s) => s.state)
  const commit = useFarmStore((s) => s.commit)
  const items: { kind: EntityKind; id: string; label: string; at: number }[] = []
  for (const b of Object.values(state.blocks))
    if (b.deleted)
      items.push({ kind: 'block', id: b.id, label: `${b.code} ${b.name}`, at: b.updatedAt })
  for (const r of Object.values(state.rows))
    if (r.deleted) items.push({ kind: 'row', id: r.id, label: `Row ${r.number}`, at: r.updatedAt })
  for (const p of Object.values(state.loosePositions))
    if (p.deleted)
      items.push({ kind: 'position', id: p.id, label: `Position ${p.number}`, at: p.updatedAt })
  for (const f of Object.values(state.features))
    if (f.deleted) items.push({ kind: 'feature', id: f.id, label: f.name, at: f.updatedAt })
  for (const v of Object.values(state.varieties))
    if (v.deleted) items.push({ kind: 'variety', id: v.id, label: v.name, at: v.updatedAt })
  for (const t of Object.values(state.trees))
    if (t.deleted) items.push({ kind: 'tree', id: t.id, label: t.posKey, at: t.updatedAt })
  for (const p of Object.values(state.people))
    if (p.deleted) items.push({ kind: 'person', id: p.id, label: p.name, at: p.updatedAt })
  for (const t of Object.values(state.tasks))
    if (t.deleted) items.push({ kind: 'task', id: t.id, label: t.title, at: t.updatedAt })
  for (const h of Object.values(state.harvests))
    if (h.deleted)
      items.push({
        kind: 'harvest',
        id: h.id,
        label: `${h.date} ${h.crop} ${h.quantity} ${h.unit}`,
        at: h.updatedAt,
      })
  for (const l of Object.values(state.logs))
    if (l.deleted)
      items.push({
        kind: 'log',
        id: l.id,
        label: `${l.date} ${l.category ?? 'work'}`,
        at: l.updatedAt,
      })
  if (items.length === 0) return null
  items.sort((a, b) => b.at - a.at)
  // Only the kinds actually in the list, so the filter never offers an empty choice.
  const kinds = [...new Set(items.map((it) => it.kind))]
  return (
    <Card>
      <h2 className="font-semibold">Recently deleted</h2>
      <p className="mt-1 mb-2 text-xs text-stone-500 dark:text-stone-400">
        Nothing is ever really thrown away, so this list only grows. Newest first.
      </p>
      <LongList
        items={items}
        keyOf={(it) => it.id}
        search={(it) => `${KIND_LABEL[it.kind]} ${it.label}`}
        noun="deleted things"
        placeholder="Filter by name…"
        filters={[
          { label: 'Everything', match: () => true },
          ...kinds.map((k) => ({
            label: KIND_LABEL[k],
            match: (it: (typeof items)[number]) => it.kind === k,
          })),
        ]}
        row={(it) => (
          <span className="flex items-center justify-between gap-2">
            <span>
              <Pill className="mr-2">{KIND_LABEL[it.kind]}</Pill>
              {it.label}
            </span>
            <Button
              onClick={() =>
                commit([{ type: `${it.kind}.restore`, payload: { id: it.id } } as never])
              }
            >
              Restore
            </Button>
          </span>
        )}
      />
    </Card>
  )
}

function Appearance() {
  const [theme, setTheme] = useTheme()
  return (
    <Card>
      <h2 className="font-semibold">Appearance</h2>
      <div className="mt-2 flex items-center gap-2 text-sm">
        <span>Theme: {themeLabel[theme]}</span>
        <Button onClick={() => setTheme(nextTheme[theme])}>
          Switch to {themeLabel[nextTheme[theme]].toLowerCase()}
        </Button>
      </div>
    </Card>
  )
}
