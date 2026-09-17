import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { CompassSide, FeatureKind, FillParams, Row } from '@/model/types'
import { live } from '@/events/reduce'
import { useFarmStore } from '@/state/store'
import { blockSpecies, varietiesByName } from '@/state/derived'
import {
  autoNumberRows,
  clearEmptyRows,
  codeAvailable,
  createBlock,
  deleteBlock,
  deleteFeature,
  deleteLoosePosition,
  deleteRow,
  applyRelayout,
  fillBlock,
  moveBlock,
  refillBlock,
  reverseRow,
  setBlockOutline,
  setRowDefaultVariety,
  setRowLayout,
  setRowNumber,
  updateBlock,
} from '@/state/actions'
import { blockAreaSqFt, describeNumbering, rowLengthFt, rowUpBearing } from '@/engine/layout'
import { positionCount, sqFtToAcres } from '@/engine/geo'
import { fillOutline, fillSummary, firstEdgeHeading } from '@/engine/fill'
import { planRelayout } from '@/engine/relayout'
import { centroidOf, isIdentity } from '@/engine/transform'
import { VarietyPicker } from '@/ui/tree/VarietyPicker'
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
  const editMode = useEditor((s) => s.editMode)
  const hint = message ?? TOOL_HINT[tool] ?? ''
  const modeHint =
    editMode === 'shapes'
      ? 'Reshaping: drag a vertex, drag the midpoint of a segment to add one, or select a vertex and press Delete. Esc when done.'
      : editMode === 'trees'
        ? 'Moving trees: drag any tree to where it really stands. Esc when done.'
        : editMode === 'outline'
          ? 'Drag a corner of the outline, or the midpoint of an edge to add one; the preview follows.'
          : ''
  return (
    <aside className="flex w-80 shrink-0 flex-col border-r border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900">
      <div className="flex-1 overflow-y-auto p-3 text-sm">
        {(hint || modeHint) && (
          <p
            role="status"
            className="mb-3 rounded-md bg-lime-50 dark:bg-lime-950/40 px-2.5 py-2 text-xs text-lime-900 dark:text-lime-200"
          >
            {hint || modeHint}
          </p>
        )}
        {selectedBlockId ? <BlockEditor blockId={selectedBlockId} /> : <BlockList />}
        {!selectedBlockId && <FeatureSection />}
        <ViewSection />
      </div>
    </aside>
  )
}

function BlockList() {
  const state = useFarmStore((s) => s.state)
  const select = useEditor((s) => s.selectBlock)
  const blocks = live.blocks(state).sort((a, b) => a.code.localeCompare(b.code))
  const [adding, setAdding] = useState(false)
  return (
    <section>
      <h2 className="mb-2 font-semibold">Blocks</h2>
      {blocks.length === 0 && !adding && (
        <p className="text-stone-500 dark:text-stone-400">
          No blocks yet. A block is a group of rows, or a place for loose trees.
        </p>
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
  const fill = useEditor((s) => s.fill)
  const move = useEditor((s) => s.move)
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
  const empty = rows.length === 0 && loose.length === 0
  const toolButton = (t: Tool, label: string, title?: string) => (
    <Button
      variant={tool === t ? 'primary' : 'secondary'}
      onClick={() => setTool(tool === t ? 'none' : t)}
      title={title}
    >
      {tool === t ? 'Cancel' : label}
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

      {fill && fill.blockId === blockId ? (
        <FillForm blockId={blockId} />
      ) : move && move.blockId === blockId ? (
        <MoveForm blockId={blockId} />
      ) : empty && !block.outline && tool === 'none' ? (
        <LayoutChoice blockId={blockId} />
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {tool !== 'none' ? (
              <Button variant="primary" onClick={() => setTool('none')}>
                Cancel
              </Button>
            ) : editMode !== 'none' ? (
              <Button variant="primary" onClick={() => setEditMode('none')}>
                Done
              </Button>
            ) : (
              <>
                {block.outline && rows.length === 0 && (
                  <Button
                    variant="primary"
                    onClick={() => {
                      const rowSpacingFt = block.rowSpacingFt ?? 16
                      useEditor.getState().openFill({
                        blockId,
                        headingDeg: firstEdgeHeading(block.outline!),
                        rotateDeg: 0,
                        rowSpacingFt,
                        treeSpacingFt: block.inRowSpacingFt ?? 12,
                        insetFt: rowSpacingFt / 2,
                        insetEndFt: rowSpacingFt / 2,
                        shiftAlongFt: 0,
                        shiftAcrossFt: 0,
                        pattern: 'square',
                        drawing: false,
                        adjust: false,
                        previewOutline: null,
                      })
                      useEditor.setState({ editMode: 'outline' })
                    }}
                  >
                    Fill outline with rows
                  </Button>
                )}
                {block.outline && block.fill && rows.length > 0 && (
                  <Button
                    onClick={() => {
                      const f = block.fill!
                      useEditor.getState().openFill({
                        blockId,
                        headingDeg: f.headingDeg,
                        rotateDeg: 0,
                        rowSpacingFt: f.rowSpacingFt,
                        treeSpacingFt: f.treeSpacingFt,
                        insetFt: f.insetFt,
                        insetEndFt: f.insetEndFt ?? f.insetFt,
                        shiftAlongFt: f.shiftAlongFt ?? 0,
                        shiftAcrossFt: f.shiftAcrossFt ?? 0,
                        pattern: f.pattern,
                        drawing: false,
                        adjust: true,
                        previewOutline: null,
                      })
                      useEditor.setState({ editMode: 'outline' })
                    }}
                    title="Reshape the outline or change spacing; trees keep their labels and records"
                  >
                    Adjust layout
                  </Button>
                )}
                {(rows.length > 0 || loose.length > 0) && (
                  <Button
                    onClick={() => {
                      const pts = [
                        ...rows.flatMap((r) => r.polyline),
                        ...loose.map((p) => p.coord),
                        ...(block.outline ?? []),
                      ]
                      useEditor.getState().openMove({
                        blockId,
                        headingDeg:
                          block.fill?.headingDeg ?? (rows.length ? rowUpBearing(rows) : 0),
                        alongFt: 0,
                        acrossFt: 0,
                        rotateDeg: 0,
                        pivot: centroidOf(pts),
                      })
                    }}
                    title="Slide or turn the whole planting to line it up with the imagery; nothing changes relative to anything else"
                  >
                    Move planting
                  </Button>
                )}
                {toolButton('row', 'Add a row')}
                {toolButton('loose', 'Add a loose tree')}
                {!block.outline && rows.length > 0 && toolButton('outline', 'Draw outline')}
                {(rows.length > 0 || loose.length > 0 || block.outline) && (
                  <Button
                    onClick={() => setEditMode('shapes')}
                    title="Drag vertices of rows and the outline"
                  >
                    Reshape rows and outline
                  </Button>
                )}
                {rows.length > 0 && (
                  <Button
                    onClick={() => setEditMode('trees')}
                    title="Drag individual trees to where they really stand"
                  >
                    Move trees
                  </Button>
                )}
              </>
            )}
          </div>
          <AlignToggle rows={rows} />
        </>
      )}

      <BlockFields blockId={blockId} />

      {rows.length > 0 && (
        <>
          <div className="mt-4 mb-1 flex items-center justify-between">
            <h3 className="font-semibold">Rows</h3>
            {rows.length > 1 && (
              <button
                className="text-xs underline decoration-dotted"
                onClick={() => {
                  const n = autoNumberRows(blockId)
                  say(n ? `Renumbered ${n} rows.` : 'Rows are already in order.')
                }}
                title={describeNumbering(block)}
              >
                Renumber
              </button>
            )}
          </div>
          <ul className="divide-y divide-stone-100 dark:divide-stone-800">
            {rows.map((r) => (
              <RowEditor key={r.id} row={r} code={block.code} />
            ))}
          </ul>
        </>
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
        {block.outline && block.fill && rows.length > 0 && (
          <button
            className="text-xs underline decoration-dotted"
            title="After reshaping the outline: rows without trees are generated again"
            onClick={() => {
              const r = refillBlock(blockId)
              say(r.ok ? 'Empty rows regenerated from the outline.' : r.reason)
            }}
          >
            Refill from outline
          </button>
        )}
        {block.outline && rows.length > 0 && (
          <button
            className="text-xs underline decoration-dotted"
            onClick={() => {
              const n = clearEmptyRows(blockId)
              say(
                n
                  ? `Removed ${n} empty rows. Fill the outline again.`
                  : 'Every row holds a tree; nothing removed.',
              )
            }}
          >
            Remove empty rows
          </button>
        )}
        {block.outline && (
          <button
            className="text-xs underline decoration-dotted"
            onClick={() => setBlockOutline(blockId, null)}
          >
            Clear outline
          </button>
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
          <button
            className="text-xs underline decoration-dotted"
            onClick={() => setConfirmDelete(true)}
          >
            Delete block
          </button>
        )}
      </div>
    </section>
  )
}

/** The first question for an empty block. */
function LayoutChoice({ blockId }: { blockId: string }) {
  const setTool = useEditor((s) => s.setTool)
  const openFill = useEditor((s) => s.openFill)
  const block = useFarmStore((s) => s.state.blocks[blockId])
  const start = (t: Tool) => {
    if (t !== 'outline') {
      setTool(t)
      return
    }
    // Spacing comes first so trees can preview inside the outline as it is drawn.
    const rowSpacingFt = block?.rowSpacingFt ?? 16
    openFill(
      {
        blockId,
        headingDeg: 0,
        rotateDeg: 0,
        rowSpacingFt,
        treeSpacingFt: block?.inRowSpacingFt ?? 12,
        insetFt: rowSpacingFt / 2,
        insetEndFt: rowSpacingFt / 2,
        shiftAlongFt: 0,
        shiftAcrossFt: 0,
        pattern: 'square',
        drawing: true,
        adjust: false,
        previewOutline: null,
        anchor: null,
      },
      true,
    )
  }
  const card = (t: Tool, title: string, body: string) => (
    <button
      className="w-full rounded-md border border-stone-200 dark:border-stone-700 p-2.5 text-left hover:border-lime-600 hover:bg-lime-50 dark:hover:bg-lime-950/30"
      onClick={() => start(t)}
    >
      <span className="block font-medium">{title}</span>
      <span className="block text-xs text-stone-600 dark:text-stone-400">{body}</span>
    </button>
  )
  return (
    <div className="space-y-2">
      <p className="text-xs text-stone-600 dark:text-stone-400">How is this block laid out?</p>
      {card(
        'outline',
        'Outline and fill',
        'Draw the edge of the block; rows and trees fill it on your spacing. Best for a regular planting.',
      )}
      {card(
        'row',
        'Rows one at a time',
        'Draw each row as a line over the trees. Best when rows differ.',
      )}
      {card('loose', 'Single trees', 'Click each tree. For yard trees and one-offs.')}
    </div>
  )
}

function FillForm({ blockId }: { blockId: string }) {
  const state = useFarmStore((s) => s.state)
  const fill = useEditor((s) => s.fill)!
  const update = useEditor((s) => s.updateFill)
  const close = useEditor((s) => s.closeFill)
  const say = useEditor((s) => s.say)
  const map = useEditor((s) => s.map)
  const setTool = useEditor((s) => s.setTool)
  const block = state.blocks[blockId]
  const heading = fill.headingDeg + fill.rotateDeg
  const outline = fill.drawing ? fill.previewOutline : (block?.outline ?? null)
  const preview = useMemo(
    () =>
      outline && outline.length >= 3
        ? fillOutline(outline, {
            headingDeg: heading,
            rowSpacingFt: fill.rowSpacingFt,
            treeSpacingFt: fill.treeSpacingFt,
            insetFt: fill.insetFt,
            insetEndFt: fill.insetEndFt,
            shiftAlongFt: fill.shiftAlongFt,
            shiftAcrossFt: fill.shiftAcrossFt,
            pattern: fill.pattern,
          })
        : [],
    [
      outline,
      heading,
      fill.rowSpacingFt,
      fill.treeSpacingFt,
      fill.insetFt,
      fill.insetEndFt,
      fill.shiftAlongFt,
      fill.shiftAcrossFt,
      fill.pattern,
    ],
  )
  const params: FillParams = {
    headingDeg: heading,
    rowSpacingFt: fill.rowSpacingFt,
    treeSpacingFt: fill.treeSpacingFt,
    insetFt: fill.insetFt,
    insetEndFt: fill.insetEndFt,
    shiftAlongFt: fill.shiftAlongFt,
    shiftAcrossFt: fill.shiftAcrossFt,
    pattern: fill.pattern,
  }
  const plan = useMemo(
    () =>
      fill.adjust && !fill.drawing
        ? planRelayout(state, blockId, preview, fill.rowSpacingFt, fill.treeSpacingFt)
        : null,
    [fill.adjust, fill.drawing, state, blockId, preview, fill.rowSpacingFt, fill.treeSpacingFt],
  )
  const [confirming, setConfirming] = useState(false)
  const [step, setStep] = useState(1)
  const [showMargins, setShowMargins] = useState(false)
  const summary = fillSummary(preview)
  // Once the outline is closed, turn the map so the preview rows run upright.
  useEffect(() => {
    if (!fill.drawing) map?.easeTo({ bearing: heading, duration: 400 })
  }, [map, heading, fill.drawing])

  const slider = (
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    unit: string,
    onChange: (v: number) => void,
    hint?: string,
  ) => (
    <Field label={label} hint={hint} className="col-span-2">
      <div className="flex items-center gap-2">
        <input
          type="range"
          className="w-full accent-lime-700"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label={label}
        />
        <NumberInput
          value={value}
          min={min}
          max={max}
          step={step}
          unit={unit}
          onChange={onChange}
        />
      </div>
    </Field>
  )

  return (
    <div className="space-y-2 rounded-md border border-lime-300 dark:border-lime-800 p-2.5">
      {fill.drawing ? (
        <p className="text-xs text-stone-600 dark:text-stone-400">
          Set the spacing, then draw the outline on the map. Trees preview inside it as you go; you
          can fine-tune the rotation and inset after the outline is closed.
        </p>
      ) : fill.adjust ? (
        <p className="text-xs text-stone-600 dark:text-stone-400">
          The orange preview is the new layout over the trees you have now. Drag corners, add points
          on an edge, or slide the pattern; rows keep their identity where the new row lands nearby,
          so trees keep their labels and records.
        </p>
      ) : (
        <p className="text-xs text-stone-600 dark:text-stone-400">
          The outline decides how many rows and trees fit; drag its corners (or the midpoint of an
          edge to add one) until the count is right. Nudge the trees with the arrows and turn the
          rows until the orange trees sit on the real ones.
        </p>
      )}
      <p className="sticky top-0 z-10 -mx-2.5 border-b border-lime-200 dark:border-lime-900 bg-white/95 dark:bg-stone-900/95 px-2.5 py-1.5 text-base">
        {outline && outline.length >= 3 ? (
          <>
            <strong className="tabular-nums">{summary.rows}</strong> rows ·{' '}
            <strong className="tabular-nums">{summary.trees}</strong> trees
            {plan && (
              <span className="ml-2 text-xs text-stone-500 dark:text-stone-400">
                {plan.moves + plan.orphans === 0
                  ? 'no tree moves'
                  : `${plan.moves} move, ${plan.orphans} lose a spot`}
              </span>
            )}
          </>
        ) : (
          <span className="text-sm text-stone-500 dark:text-stone-400">
            Click the corners on the map; the preview appears from the third corner.
          </span>
        )}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {slider('Tree spacing', fill.treeSpacingFt, 1, 40, 0.5, 'ft', (v) =>
          update({ treeSpacingFt: v }),
        )}
        {slider('Row spacing', fill.rowSpacingFt, 1, 40, 0.5, 'ft', (v) =>
          update({
            rowSpacingFt: v,
            insetFt: fill.insetFt === fill.rowSpacingFt / 2 ? v / 2 : fill.insetFt,
            insetEndFt: fill.insetEndFt === fill.rowSpacingFt / 2 ? v / 2 : fill.insetEndFt,
          }),
        )}
        {!fill.drawing &&
          slider(
            'Turn rows',
            fill.rotateDeg,
            -45,
            45,
            0.25,
            '°',
            (v) => update({ rotateDeg: v }),
            `Heading ${Math.round((((heading % 360) + 360) % 360) * 10) / 10}°`,
          )}
        {!fill.drawing && (
          <Field
            label="Nudge the trees"
            hint="Slides the pattern inside the outline; the outline decides how many fit"
            className="col-span-2"
          >
            <Compass
              along={fill.shiftAlongFt}
              across={fill.shiftAcrossFt}
              step={step}
              setStep={setStep}
              onChange={(shiftAlongFt, shiftAcrossFt) => update({ shiftAlongFt, shiftAcrossFt })}
            />
          </Field>
        )}
        {!fill.drawing && (
          <div className="col-span-2">
            <button
              type="button"
              className="text-xs underline decoration-dotted"
              onClick={() => setShowMargins((v) => !v)}
            >
              {showMargins ? 'Hide margins' : 'Margins…'}
            </button>
            {showMargins && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                {slider(
                  'From the sides',
                  fill.insetFt,
                  0,
                  Math.max(fill.rowSpacingFt, 20),
                  0.5,
                  'ft',
                  (v) => update({ insetFt: v }),
                  'Outline to the first row',
                )}
                {slider(
                  'From the ends',
                  fill.insetEndFt,
                  0,
                  Math.max(fill.treeSpacingFt * 2, 20),
                  0.5,
                  'ft',
                  (v) => update({ insetEndFt: v }),
                  'Outline to the first tree',
                )}
              </div>
            )}
          </div>
        )}
        <Field label="Pattern">
          <select
            className={inputClass}
            value={fill.pattern}
            onChange={(e) => update({ pattern: e.target.value as typeof fill.pattern })}
          >
            <option value="square">square</option>
            <option value="diamond">diamond</option>
          </select>
        </Field>
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
      </div>
      <div className="flex gap-2">
        {fill.drawing ? (
          <Button variant="ghost" onClick={() => setTool('none')}>
            Cancel
          </Button>
        ) : (
          <>
            {plan ? (
              confirming ? (
                <span className="flex flex-wrap items-center gap-2 text-xs">
                  <span>
                    {plan.stays} trees stay put, {plan.moves} will be drawn at a new spot,{' '}
                    {plan.orphans} lose their position (kept on record, flagged in the grid).
                    {plan.creates.length > 0 && ` ${plan.creates.length} new rows.`}
                    {plan.deletes.length > 0 && ` ${plan.deletes.length} empty rows removed.`}
                    {plan.kept.length > 0 && ` ${plan.kept.length} planted rows left as they were.`}
                  </span>
                  <Button
                    variant="primary"
                    onClick={() => {
                      applyRelayout(blockId, plan, params)
                      setConfirming(false)
                      close()
                      say('Layout adjusted. Every tree kept its label and history.')
                    }}
                  >
                    Apply
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirming(false)}>
                    Back
                  </Button>
                </span>
              ) : (
                <>
                  <Button
                    variant="primary"
                    disabled={summary.trees === 0}
                    onClick={() => {
                      if (plan.moves + plan.orphans + plan.deletes.length === 0) {
                        applyRelayout(blockId, plan, params)
                        close()
                        say('Layout adjusted; no tree moved.')
                      } else setConfirming(true)
                    }}
                  >
                    Apply changes
                  </Button>
                  <Button variant="ghost" onClick={close}>
                    Cancel
                  </Button>
                  <span className="text-xs text-stone-500 dark:text-stone-400">
                    {plan.moves + plan.orphans === 0
                      ? 'No tree would move.'
                      : `${plan.moves} would move, ${plan.orphans} would lose a position.`}
                  </span>
                </>
              )
            ) : (
              <>
                <Button
                  variant="primary"
                  disabled={summary.trees === 0}
                  onClick={() => {
                    const n = fillBlock(blockId, preview, params)
                    close()
                    say(
                      `Filled with ${n} rows and ${summary.trees} trees. Rows are numbered ${describeNumbering(block).slice(4).split(';')[0]}.`,
                    )
                  }}
                >
                  Create {summary.rows} rows
                </Button>
                <Button variant="ghost" onClick={close}>
                  Keep only the outline
                </Button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

const STEPS = [0.5, 1, 5, 20]

/**
 * Four arrows that nudge something on the map by a chosen number of feet. With the map
 * turned to the rows, up is along the rows and right is across them.
 */
function Compass({
  along,
  across,
  onChange,
  step,
  setStep,
}: {
  along: number
  across: number
  onChange: (along: number, across: number) => void
  step: number
  setStep: (s: number) => void
}) {
  const round = (v: number) => Math.round(v * 100) / 100
  const arrow = (label: string, glyph: string, dAlong: number, dAcross: number) => (
    <button
      type="button"
      aria-label={label}
      title={`${label} ${step} ft`}
      className="h-8 w-8 rounded border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900 text-base hover:bg-stone-100 dark:hover:bg-stone-800"
      onClick={() => onChange(round(along + dAlong * step), round(across + dAcross * step))}
    >
      {glyph}
    </button>
  )
  return (
    <div className="flex items-center gap-3">
      <div className="grid grid-cols-3 gap-1">
        <span />
        {arrow('Up, along the rows', '▲', 1, 0)}
        <span />
        {arrow('Left, across the rows', '◄', 0, -1)}
        <button
          type="button"
          title="Back to where it started"
          className="h-8 w-8 rounded border border-transparent text-xs text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
          onClick={() => onChange(0, 0)}
        >
          ·
        </button>
        {arrow('Right, across the rows', '►', 0, 1)}
        <span />
        {arrow('Down, against the rows', '▼', -1, 0)}
        <span />
      </div>
      <div className="text-xs text-stone-600 dark:text-stone-400">
        <div className="mb-1">
          Step{' '}
          <select
            className={`${inputClass} py-0.5`}
            value={step}
            onChange={(e) => setStep(Number(e.target.value))}
            aria-label="Step in feet"
          >
            {STEPS.map((s) => (
              <option key={s} value={s}>
                {s} ft
              </option>
            ))}
          </select>
        </div>
        <div className="tabular-nums">
          along {along >= 0 ? '+' : ''}
          {along} ft · across {across >= 0 ? '+' : ''}
          {across} ft
        </div>
      </div>
    </div>
  )
}

/** Slide and turn a whole block with live preview. Records are untouched by construction. */
function MoveForm({ blockId }: { blockId: string }) {
  const [step, setStep] = useState(1)
  const move = useEditor((s) => s.move)!
  const update = useEditor((s) => s.updateMove)
  const close = useEditor((s) => s.closeMove)
  const say = useEditor((s) => s.say)
  const map = useEditor((s) => s.map)
  useEffect(() => {
    map?.easeTo({ bearing: move.headingDeg + move.rotateDeg, duration: 400 })
  }, [map, move.headingDeg, move.rotateDeg])
  const slider = (
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    unit: string,
    onChange: (v: number) => void,
    hint?: string,
  ) => (
    <Field label={label} hint={hint}>
      <div className="flex items-center gap-2">
        <input
          type="range"
          className="w-full accent-lime-700"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label={label}
        />
        <NumberInput
          value={value}
          min={min}
          max={max}
          step={step}
          unit={unit}
          onChange={onChange}
        />
      </div>
    </Field>
  )
  return (
    <div className="space-y-2 rounded-md border border-lime-300 dark:border-lime-800 p-2.5">
      <p className="text-xs text-stone-600 dark:text-stone-400">
        The orange preview is the whole planting after the move. Slide it onto the real trees. Rows,
        trees, and the outline move together; every label and record stays as it is.
      </p>
      <Compass
        along={move.alongFt}
        across={move.acrossFt}
        step={step}
        setStep={setStep}
        onChange={(alongFt, acrossFt) => update({ alongFt, acrossFt })}
      />
      {slider(
        'Turn',
        move.rotateDeg,
        -30,
        30,
        0.1,
        '°',
        (v) => update({ rotateDeg: v }),
        'About the middle of the planting',
      )}
      <div className="flex gap-2">
        <Button
          variant="primary"
          disabled={isIdentity(move)}
          onClick={() => {
            moveBlock(blockId, move)
            close()
            say('Planting moved. Nothing changed relative to anything else.')
          }}
        >
          Apply move
        </Button>
        <Button variant="ghost" onClick={close}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

function AlignToggle({ rows }: { rows: Row[] }) {
  const map = useEditor((s) => s.map)
  const aligned = useEditor((s) => s.aligned)
  const setAligned = useEditor((s) => s.setAligned)
  const bearing = rows.length ? rowUpBearing(rows) : 0
  // The compass button also resets north; follow whatever the map is actually doing.
  useEffect(() => {
    if (!map) return
    const onRotate = () => {
      const diff = Math.abs(((((map.getBearing() - bearing) % 360) + 540) % 360) - 180)
      setAligned(rows.length > 0 && diff < 1)
    }
    map.on('rotateend', onRotate)
    return () => {
      map.off('rotateend', onRotate)
    }
  }, [map, bearing, rows.length, setAligned])
  if (rows.length === 0 || !map) return null
  return (
    <label className="flex items-center gap-2 text-xs text-stone-600 dark:text-stone-400">
      <input
        type="checkbox"
        checked={aligned}
        onChange={(e) => {
          map.easeTo({ bearing: e.target.checked ? bearing : 0, duration: 600 })
          setAligned(e.target.checked)
        }}
      />
      Turn the map so rows run bottom to top
    </label>
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
    <div className="mt-3 rounded-md border border-stone-200 dark:border-stone-700">
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
  const [newVariety, setNewVariety] = useState(false)
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
    <li className="py-0.5">
      <button
        className="flex w-full items-center justify-between gap-2 rounded px-1 py-1 text-left hover:bg-stone-50 dark:hover:bg-stone-800"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span>
          <span className="font-medium">
            {code}-{row.number}
          </span>{' '}
          <span className="text-xs text-stone-500 dark:text-stone-400">
            {count} trees · {Math.round(length)} ft
            {row.defaultVarietyId && state.varieties[row.defaultVarietyId]
              ? ` · ${state.varieties[row.defaultVarietyId].name}`
              : ''}
          </span>
        </span>
        <span aria-hidden className="text-xs text-stone-400">
          {open ? '▾' : '▸'}
        </span>
      </button>
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
              {newVariety ? (
                <VarietyPicker
                  value={null}
                  species={blockSpecies(state, row.blockId)}
                  startAdding
                  onCancel={() => setNewVariety(false)}
                  onChange={(id) => {
                    if (id) setRowDefaultVariety(row.id, id)
                    setNewVariety(false)
                  }}
                />
              ) : (
                <select
                  className={inputClass}
                  value={row.defaultVarietyId ?? ''}
                  onChange={(e) => {
                    if (e.target.value === '__new') setNewVariety(true)
                    else setRowDefaultVariety(row.id, e.target.value || null)
                  }}
                >
                  <option value="">none (mixed row)</option>
                  {varieties.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                  <option value="__new">+ new variety…</option>
                </select>
              )}
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
              {tool === 'feature-point' ? 'Cancel' : 'Place a point'}
            </Button>
            <Button
              variant={tool === 'feature-polygon' ? 'primary' : 'secondary'}
              onClick={() => setTool(tool === 'feature-polygon' ? 'none' : 'feature-polygon')}
            >
              {tool === 'feature-polygon' ? 'Cancel' : 'Draw an area'}
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
  return (
    <section className="mt-5 border-t border-stone-200 dark:border-stone-700 pt-3">
      <h2 className="mb-2 font-semibold">View</h2>
      <div className="flex flex-wrap items-end gap-2">
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
      </div>
    </section>
  )
}
