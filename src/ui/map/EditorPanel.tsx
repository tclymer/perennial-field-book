import { useState } from 'react'
import clsx from 'clsx'
import { Link } from 'react-router-dom'
import type { CompassSide, FeatureKind, Row } from '@/model/types'
import { live } from '@/events/reduce'
import { useFarmStore } from '@/state/store'
import { varietiesByName } from '@/state/derived'
import {
  autoNumberRows,
  codeAvailable,
  createBlock,
  deleteBlock,
  deleteFeature,
  deleteLoosePosition,
  deleteRow,
  reverseRow,
  setBlockOutline,
  setRowDefaultVariety,
  setRowLayout,
  setRowNumber,
  updateBlock,
} from '@/state/actions'
import { blockAreaSqFt, describeNumbering, rowLengthFt, rowUpBearing } from '@/engine/layout'
import { positionCount, sqFtToAcres } from '@/engine/geo'
import { Button, Field, NumberInput, Pill, inputClass } from '@/ui/components'
import { TOOL_HINT, useEditor, type Tool } from './editorStore'

const SIDES: [CompassSide, string][] = [
  ['W', 'west'],
  ['E', 'east'],
  ['N', 'north'],
  ['S', 'south'],
]

const KINDS: [FeatureKind, string][] = [
  ['building', 'Building'],
  ['greenhouse', 'Greenhouse'],
  ['area', 'Area'],
  ['fence', 'Fence'],
  ['windbreak', 'Windbreak'],
  ['other', 'Other'],
]

/** The desktop side panel: blocks, rows, features, and the drawing tools. */
export function EditorPanel() {
  const selectedBlockId = useEditor((s) => s.selectedBlockId)
  const message = useEditor((s) => s.message)
  const tool = useEditor((s) => s.tool)
  return (
    <aside className="flex w-80 shrink-0 flex-col border-r border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900">
      <div className="flex-1 overflow-y-auto p-3 text-sm">
        {(message || TOOL_HINT[tool]) && (
          <p
            role="status"
            className="mb-3 rounded-md bg-lime-50 dark:bg-lime-950/40 px-2.5 py-2 text-xs text-lime-900 dark:text-lime-200"
          >
            {message ?? TOOL_HINT[tool]}
          </p>
        )}
        {selectedBlockId ? <BlockEditor blockId={selectedBlockId} /> : <BlockList />}
        <FeatureSection />
        <ViewSection />
      </div>
    </aside>
  )
}

function BlockList() {
  const state = useFarmStore((s) => s.state)
  const select = useEditor((s) => s.selectBlock)
  const blocks = live.blocks(state).sort((a, b) => a.code.localeCompare(b.code))
  const [adding, setAdding] = useState(blocks.length === 0)
  return (
    <section>
      <h2 className="mb-2 font-semibold">Blocks</h2>
      {blocks.length === 0 && !adding && (
        <p className="text-stone-500 dark:text-stone-400">No blocks yet.</p>
      )}
      <ul className="divide-y divide-stone-100 dark:divide-stone-800">
        {blocks.map((b) => {
          const rows = live.rows(state).filter((r) => r.blockId === b.id)
          return (
            <li key={b.id}>
              <button
                className="flex w-full items-center justify-between py-2 text-left hover:text-lime-700 dark:hover:text-lime-400"
                onClick={() => select(b.id)}
              >
                <span>
                  <span className="font-medium">{b.code}</span> {b.name}
                </span>
                <span className="text-xs text-stone-500 dark:text-stone-400">
                  {rows.length} {rows.length === 1 ? 'row' : 'rows'}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {adding ? (
        <NewBlockForm onDone={() => setAdding(false)} />
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => setAdding(true)}>
            New block
          </Button>
          <Link to="/import" className="self-center text-xs underline decoration-dotted">
            Import from the planner
          </Link>
        </div>
      )}
    </section>
  )
}

function NewBlockForm({ onDone }: { onDone: () => void }) {
  const select = useEditor((s) => s.selectBlock)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [rowsFrom, setRowsFrom] = useState<CompassSide>('W')
  const [positionsFrom, setPositionsFrom] = useState('')
  const [error, setError] = useState<string | null>(null)
  const submit = () => {
    const c = code.trim().toUpperCase()
    if (!/^[A-Z0-9]{1,8}$/.test(c)) {
      setError('Code: 1 to 8 letters or digits, like PP1 or Y.')
      return
    }
    if (!codeAvailable(c)) {
      setError(`${c} is already used by another block.`)
      return
    }
    if (!name.trim()) {
      setError('Give the block a name.')
      return
    }
    const id = createBlock({ code: c, name: name.trim(), numbering: { rowsFrom, positionsFrom } })
    select(id)
    onDone()
  }
  return (
    <form
      className="mt-3 space-y-2 rounded-md border border-stone-200 dark:border-stone-700 p-2"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <div className="grid grid-cols-3 gap-2">
        <Field label="Code" hint="Starts every tree label">
          <input
            className={inputClass}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="PP1"
            autoFocus
          />
        </Field>
        <Field label="Name" className="col-span-2">
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Pawpaws Block 1"
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Rows numbered from the">
          <select
            className={inputClass}
            value={rowsFrom}
            onChange={(e) => setRowsFrom(e.target.value as CompassSide)}
          >
            {SIDES.map(([v, w]) => (
              <option key={v} value={v}>
                {w}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Position 1 is at">
          <input
            className={inputClass}
            value={positionsFrom}
            onChange={(e) => setPositionsFrom(e.target.value)}
            placeholder="the road end"
          />
        </Field>
      </div>
      {error && (
        <p role="alert" className="text-xs text-rose-700 dark:text-rose-400">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button variant="primary" type="submit">
          Create block
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

function BlockEditor({ blockId }: { blockId: string }) {
  const state = useFarmStore((s) => s.state)
  const block = state.blocks[blockId]
  const select = useEditor((s) => s.selectBlock)
  const tool = useEditor((s) => s.tool)
  const setTool = useEditor((s) => s.setTool)
  const editMode = useEditor((s) => s.editMode)
  const setEditMode = useEditor((s) => s.setEditMode)
  const map = useEditor((s) => s.map)
  const say = useEditor((s) => s.say)
  const [confirmDelete, setConfirmDelete] = useState(false)
  if (!block || block.deleted) {
    return (
      <p>
        That block is gone.{' '}
        <button className="underline" onClick={() => select(null)}>
          Back to blocks
        </button>
      </p>
    )
  }
  const rows = live
    .rows(state)
    .filter((r) => r.blockId === blockId)
    .sort((a, b) => a.number - b.number)
  const loose = live.loosePositions(state).filter((p) => p.blockId === blockId)
  const acres = sqFtToAcres(blockAreaSqFt(block, rows))
  const toolButton = (t: Tool, label: string) => (
    <Button
      variant={tool === t ? 'primary' : 'secondary'}
      onClick={() => setTool(tool === t ? 'none' : t)}
    >
      {label}
    </Button>
  )
  return (
    <section>
      <button
        className="mb-2 text-xs text-stone-500 dark:text-stone-400 underline decoration-dotted"
        onClick={() => select(null)}
      >
        ← All blocks
      </button>
      <h2 className="font-semibold">
        {block.code} · {block.name}
      </h2>
      <p className="mb-2 text-xs text-stone-500 dark:text-stone-400">
        {rows.length} rows · {loose.length} loose trees
        {acres > 0 && ` · ${acres.toFixed(2)} ac`}
        {block.planner && ' · linked to the planner'}
      </p>
      <p className="mb-3 text-xs text-stone-600 dark:text-stone-400">{describeNumbering(block)}</p>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {toolButton('row', 'Draw a row')}
        {toolButton('outline', block.outline ? 'Redraw outline' : 'Draw outline')}
        {toolButton('loose', 'Add a loose tree')}
        <Button
          variant={editMode === 'shapes' ? 'primary' : 'secondary'}
          onClick={() => setEditMode(editMode === 'shapes' ? 'none' : 'shapes')}
          disabled={rows.length + loose.length === 0 && !block.outline}
          title="Drag vertices of rows and the outline"
        >
          {editMode === 'shapes' ? 'Done editing shapes' : 'Edit shapes'}
        </Button>
        <Button
          variant={editMode === 'trees' ? 'primary' : 'secondary'}
          onClick={() => setEditMode(editMode === 'trees' ? 'none' : 'trees')}
          disabled={rows.length === 0}
          title="Drag individual trees to where they really stand"
        >
          {editMode === 'trees' ? 'Done adjusting trees' : 'Adjust trees'}
        </Button>
        <Button
          onClick={() => {
            if (!map || rows.length === 0) return
            map.easeTo({ bearing: rowUpBearing(rows), duration: 600 })
          }}
          disabled={rows.length === 0}
        >
          Rows up
        </Button>
        <Button
          onClick={() => {
            const n = autoNumberRows(blockId)
            say(
              n
                ? `Renumbered ${n} rows from the ${describeNumbering(block).split(' ')[5]}.`
                : 'Rows are already in order.',
            )
          }}
          disabled={rows.length < 2}
        >
          Number rows
        </Button>
      </div>

      <BlockFields blockId={blockId} />

      <h3 className="mt-4 mb-1 font-semibold">Rows</h3>
      {rows.length === 0 ? (
        <p className="text-xs text-stone-500 dark:text-stone-400">
          Draw the first row over the trees on the map: click at position 1, click at any turn, then
          double-click on the last tree.
        </p>
      ) : (
        <ul className="divide-y divide-stone-100 dark:divide-stone-800">
          {rows.map((r) => (
            <RowEditor key={r.id} row={r} code={block.code} />
          ))}
        </ul>
      )}

      {loose.length > 0 && (
        <>
          <h3 className="mt-4 mb-1 font-semibold">Loose trees</h3>
          <ul className="divide-y divide-stone-100 dark:divide-stone-800">
            {loose.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-1.5">
                <Link to={`/t/${block.code}-${p.number}`} className="underline decoration-dotted">
                  {block.code}-{p.number}
                </Link>
                <Button variant="ghost" onClick={() => deleteLoosePosition(p.id)}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-stone-100 dark:border-stone-800 pt-3">
        <Link to={`/blocks/${blockId}/grid`} className="text-xs underline decoration-dotted">
          Open the block grid
        </Link>
        {block.outline && (
          <Button variant="ghost" onClick={() => setBlockOutline(blockId, null)}>
            Clear outline
          </Button>
        )}
        {confirmDelete ? (
          <span className="flex items-center gap-1 text-xs">
            Delete the block and hide its rows?
            <Button
              variant="danger"
              onClick={() => {
                deleteBlock(blockId)
                select(null)
              }}
            >
              Delete
            </Button>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Keep
            </Button>
          </span>
        ) : (
          <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
            Delete block
          </Button>
        )}
      </div>
    </section>
  )
}

function BlockFields({ blockId }: { blockId: string }) {
  const block = useFarmStore((s) => s.state.blocks[blockId])
  const [code, setCode] = useState(block.code)
  const [name, setName] = useState(block.name)
  const [positionsFrom, setPositionsFrom] = useState(block.numbering.positionsFrom)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-md border border-stone-200 dark:border-stone-700">
      <button
        className="flex w-full items-center justify-between px-2 py-1.5 text-xs font-medium"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        Block details
        <span aria-hidden>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-stone-100 dark:border-stone-800 p-2">
          <div className="grid grid-cols-3 gap-2">
            <Field label="Code">
              <input
                className={inputClass}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onBlur={() => {
                  const c = code.trim().toUpperCase()
                  if (c === block.code) return
                  if (!/^[A-Z0-9]{1,8}$/.test(c) || !codeAvailable(c, blockId)) {
                    setError('That code is invalid or already used.')
                    setCode(block.code)
                    return
                  }
                  setError(null)
                  updateBlock(blockId, { code: c })
                }}
              />
            </Field>
            <Field label="Name" className="col-span-2">
              <input
                className={inputClass}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => {
                  const v = name.trim()
                  if (v && v !== block.name) updateBlock(blockId, { name: v })
                  else setName(block.name)
                }}
              />
            </Field>
          </div>
          {code !== block.code && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Changing the code changes every tree label in this block. Tags already printed would
              no longer match.
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Field label="Rows numbered from the">
              <select
                className={inputClass}
                value={block.numbering.rowsFrom}
                onChange={(e) =>
                  updateBlock(blockId, {
                    numbering: { ...block.numbering, rowsFrom: e.target.value as CompassSide },
                  })
                }
              >
                {SIDES.map(([v, w]) => (
                  <option key={v} value={v}>
                    {w}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Position 1 is at">
              <input
                className={inputClass}
                value={positionsFrom}
                placeholder="the road end"
                onChange={(e) => setPositionsFrom(e.target.value)}
                onBlur={() => {
                  if (positionsFrom !== block.numbering.positionsFrom) {
                    updateBlock(blockId, { numbering: { ...block.numbering, positionsFrom } })
                  }
                }}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Row spacing" hint="Between rows, for area">
              <NumberInput
                value={block.rowSpacingFt ?? 0}
                min={0}
                unit="ft"
                onChange={(v) => updateBlock(blockId, { rowSpacingFt: v > 0 ? v : null })}
              />
            </Field>
            <Field label="Tree spacing" hint="Default for new rows">
              <NumberInput
                value={block.inRowSpacingFt ?? 0}
                min={0}
                unit="ft"
                onChange={(v) => updateBlock(blockId, { inRowSpacingFt: v > 0 ? v : null })}
              />
            </Field>
          </div>
          <Field label="Species">
            <input
              className={inputClass}
              defaultValue={block.species ?? ''}
              onBlur={(e) => {
                const v = e.target.value.trim()
                if (v !== (block.species ?? '')) updateBlock(blockId, { species: v || null })
              }}
            />
          </Field>
          {error && (
            <p role="alert" className="text-xs text-rose-700 dark:text-rose-400">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function RowEditor({ row, code }: { row: Row; code: string }) {
  const state = useFarmStore((s) => s.state)
  const say = useEditor((s) => s.say)
  const varieties = varietiesByName(state)
  const [open, setOpen] = useState(false)
  const count = positionCount(row.polyline, row.layout)
  const length = rowLengthFt(row)
  const setBy = (by: 'count' | 'spacing') => {
    const layout =
      by === 'count'
        ? { by: 'count' as const, count }
        : {
            by: 'spacing' as const,
            spacingFt: Math.max(1, Math.round(length / Math.max(1, count - 1))),
          }
    const r = setRowLayout(row.id, layout)
    if (!r.ok) say(r.reason)
  }
  return (
    <li className="py-1.5">
      <div className="flex items-center justify-between gap-2">
        <button className="text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <span className="font-medium">
            {code}-{row.number}
          </span>{' '}
          <span className="text-xs text-stone-500 dark:text-stone-400">
            {count} trees · {Math.round(length)} ft
            {row.defaultVarietyId && state.varieties[row.defaultVarietyId]
              ? ` · ${state.varieties[row.defaultVarietyId].name}`
              : ''}
          </span>
        </button>
        <span aria-hidden className="text-xs text-stone-400">
          {open ? '▾' : '▸'}
        </span>
      </div>
      {open && (
        <div className="mt-2 space-y-2 rounded-md bg-stone-50 dark:bg-stone-800/60 p-2">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Row number">
              <NumberInput
                value={row.number}
                min={1}
                step={1}
                onChange={(n) => setRowNumber(row.id, Math.round(n))}
              />
            </Field>
            <Field label="Trees by">
              <select
                className={inputClass}
                value={row.layout.by}
                onChange={(e) => setBy(e.target.value as 'count' | 'spacing')}
              >
                <option value="count">count</option>
                <option value="spacing">spacing</option>
              </select>
            </Field>
            {row.layout.by === 'count' ? (
              <Field label="Tree count">
                <NumberInput
                  value={row.layout.count}
                  min={1}
                  step={1}
                  onChange={(n) => {
                    const r = setRowLayout(row.id, { by: 'count', count: Math.round(n) })
                    if (!r.ok) say(r.reason)
                  }}
                />
              </Field>
            ) : (
              <Field label="Spacing">
                <NumberInput
                  value={row.layout.spacingFt}
                  min={0.5}
                  unit="ft"
                  onChange={(n) => {
                    const r = setRowLayout(row.id, { by: 'spacing', spacingFt: n })
                    if (!r.ok) say(r.reason)
                  }}
                />
              </Field>
            )}
            <Field label="Default variety" className="col-span-2">
              <select
                className={inputClass}
                value={row.defaultVarietyId ?? ''}
                onChange={(e) => setRowDefaultVariety(row.id, e.target.value || null)}
              >
                <option value="">none (mixed row)</option>
                {varieties.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button
              onClick={() => {
                const r = reverseRow(row.id)
                say(r.ok ? 'Row reversed: position 1 is now at the other end.' : r.reason)
              }}
              title="Swap which end is position 1"
            >
              Reverse
            </Button>
            <Button variant="ghost" onClick={() => deleteRow(row.id)}>
              Delete row
            </Button>
          </div>
        </div>
      )}
    </li>
  )
}

function FeatureSection() {
  const state = useFarmStore((s) => s.state)
  const tool = useEditor((s) => s.tool)
  const setTool = useEditor((s) => s.setTool)
  const draft = useEditor((s) => s.featureDraft)
  const setDraft = useEditor((s) => s.setFeatureDraft)
  const features = live.features(state).sort((a, b) => a.name.localeCompare(b.name))
  const [open, setOpen] = useState(false)
  return (
    <section className="mt-5 border-t border-stone-200 dark:border-stone-700 pt-3">
      <button
        className="flex w-full items-center justify-between font-semibold"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        Buildings and areas <Pill>{features.length}</Pill>
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          <ul className="divide-y divide-stone-100 dark:divide-stone-800">
            {features.map((f) => (
              <li key={f.id} className="flex items-center justify-between py-1">
                <span>
                  {f.name}{' '}
                  <span className="text-xs text-stone-500 dark:text-stone-400">{f.kind}</span>
                </span>
                <Button variant="ghost" onClick={() => deleteFeature(f.id)}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Name">
              <input
                className={inputClass}
                value={draft.name}
                placeholder="Blue House"
                onChange={(e) => setDraft({ name: e.target.value })}
              />
            </Field>
            <Field label="Kind">
              <select
                className={inputClass}
                value={draft.kind}
                onChange={(e) => setDraft({ kind: e.target.value as FeatureKind })}
              >
                {KINDS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button
              variant={tool === 'feature-point' ? 'primary' : 'secondary'}
              onClick={() => setTool(tool === 'feature-point' ? 'none' : 'feature-point')}
            >
              Place a point
            </Button>
            <Button
              variant={tool === 'feature-polygon' ? 'primary' : 'secondary'}
              onClick={() => setTool(tool === 'feature-polygon' ? 'none' : 'feature-polygon')}
            >
              Draw an area
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}

function ViewSection() {
  const colorBy = useEditor((s) => s.colorBy)
  const setColorBy = useEditor((s) => s.setColorBy)
  const planYear = useEditor((s) => s.planYear)
  const setPlanYear = useEditor((s) => s.setPlanYear)
  const map = useEditor((s) => s.map)
  return (
    <section className="mt-5 border-t border-stone-200 dark:border-stone-700 pt-3">
      <h2 className="mb-2 font-semibold">View</h2>
      <div className="flex flex-wrap items-center gap-2">
        <Field label="Color trees by">
          <select
            className={inputClass}
            value={colorBy}
            onChange={(e) => setColorBy(e.target.value as typeof colorBy)}
          >
            <option value="variety">variety</option>
            <option value="status">status</option>
            <option value="plan">graft plan</option>
          </select>
        </Field>
        {colorBy === 'plan' && (
          <Field label="Plan year">
            <NumberInput value={planYear} min={2000} max={2100} step={1} onChange={setPlanYear} />
          </Field>
        )}
        <Button
          className={clsx('self-end')}
          onClick={() => map?.easeTo({ bearing: 0, duration: 600 })}
          disabled={!map}
        >
          North up
        </Button>
      </div>
    </section>
  )
}
