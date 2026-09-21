/** Connects the editor's tool and edit mode to Terra Draw and turns results into actions. */
import { useEffect, useMemo, useRef } from 'react'
import type { Map as MlMap } from 'maplibre-gl'
import type { FarmState, LngLat } from '@/model/types'
import { live } from '@/events/reduce'
import { positions } from '@/state/derived'
import {
  createFeature,
  createLoosePosition,
  createRow,
  moveLoosePosition,
  nudgePosition,
  setBlockOutline,
  updateFeature,
  updateRowPolyline,
} from '@/state/actions'
import { firstEdgeHeading } from '@/engine/fill'
import { createDraw, type DrawController, type DrawShape, type EditableFeature } from './draw'
import { useEditor, type Tool } from '@/ui/map/editorStore'
import { NOTHING_HIDDEN, type HiddenShapes } from './useMapLayers'

const SHAPE_OF: Record<Tool, DrawShape | null> = {
  none: null,
  row: 'line',
  outline: 'polygon',
  loose: 'point',
  'feature-point': 'point',
  'feature-polygon': 'polygon',
}

const OUTLINE_PREFIX = 'outline:'

function angleDiff(a: number, b: number): number {
  const d = Math.abs(((a - b) % 360) + 360) % 360
  return Math.min(d, 360 - d)
}

/** Start the ring at the corner nearest `anchor.corner`, running so its first edge matches the heading. */
function normalizeRing(ring: LngLat[], anchor: { corner: LngLat; headingDeg: number }): LngLat[] {
  if (ring.length < 3) return ring
  let best = 0
  let bestD = Infinity
  ring.forEach((p, i) => {
    const d = Math.hypot(p[0] - anchor.corner[0], p[1] - anchor.corner[1])
    if (d < bestD) {
      bestD = d
      best = i
    }
  })
  const rotated = [...ring.slice(best), ...ring.slice(0, best)]
  const reversed = [rotated[0], ...rotated.slice(1).reverse()]
  const dForward = angleDiff(firstEdgeHeading(rotated), anchor.headingDeg)
  const dReverse = angleDiff(firstEdgeHeading(reversed), anchor.headingDeg)
  return dReverse < dForward ? reversed : rotated
}

/** Which shapes the map should hide because the editor is showing them instead. */
export function useHiddenShapes(state: FarmState): HiddenShapes {
  const editMode = useEditor((s) => s.editMode)
  const blockId = useEditor((s) => s.selectedBlockId)
  const featureId = useEditor((s) => s.editingFeatureId)
  return useMemo(() => {
    // The one being reshaped is drawn by the editor instead, so hide the map's own copy.
    if (editMode === 'feature' && featureId) {
      return { ...NOTHING_HIDDEN, features: new Set([featureId]) }
    }
    if (editMode === 'none' || !blockId) return NOTHING_HIDDEN
    if (editMode === 'trees') {
      return { ...NOTHING_HIDDEN, positionsOfBlocks: new Set([blockId]) }
    }
    if (editMode === 'outline') return { ...NOTHING_HIDDEN, blocks: new Set([blockId]) }
    const rows = new Set(
      live
        .rows(state)
        .filter((r) => r.blockId === blockId)
        .map((r) => r.id),
    )
    return { ...NOTHING_HIDDEN, blocks: new Set([blockId]), rows, features: new Set<string>() }
  }, [editMode, blockId, featureId, state])
}

export function useDraw(map: MlMap | null, state: FarmState, enabled: boolean): void {
  const controller = useRef<DrawController | null>(null)
  const tool = useEditor((s) => s.tool)
  const editMode = useEditor((s) => s.editMode)
  const blockId = useEditor((s) => s.selectedBlockId)
  const editingFeatureId = useEditor((s) => s.editingFeatureId)
  const latest = useRef({ state, tool, blockId })
  latest.current = { state, tool, blockId }

  useEffect(() => {
    if (!map || !enabled) return
    const c = createDraw(map, {
      onDrawn: (g) => {
        const { tool, blockId } = latest.current
        const editor = useEditor.getState()
        if (tool === 'row' && blockId && g.shape === 'line') {
          if (g.coordinates.length < 2) return
          createRow(blockId, g.coordinates)
          editor.say('Row added. Draw the next one, or choose another tool.')
          return
        }
        if (tool === 'outline' && blockId && g.shape === 'polygon') {
          if (g.coordinates.length < 3) return
          const fill = editor.fill
          // Terra Draw may hand the finished ring back rotated or reversed. Put the locked
          // first corner first and run the ring the way the first edge was drawn.
          const ring = fill?.anchor ? normalizeRing(g.coordinates, fill.anchor) : g.coordinates
          setBlockOutline(blockId, ring)
          if (fill && fill.blockId === blockId && fill.drawing) {
            // The outline is done: keep the form open for tuning, with the outline itself
            // editable so corners can be dragged while the preview follows.
            useEditor.setState({
              tool: 'none',
              editMode: 'outline',
              fill: {
                ...fill,
                drawing: false,
                adjust: false,
                previewOutline: null,
                headingDeg: fill.anchor?.headingDeg ?? firstEdgeHeading(ring),
              },
            })
            return
          }
          editor.setTool('none')
          return
        }
        if (tool === 'loose' && blockId && g.shape === 'point') {
          createLoosePosition(blockId, g.coordinates)
          editor.say('Tree added. Click to add another, or choose another tool.')
          return
        }
        if (tool === 'feature-point' && g.shape === 'point') {
          const { name, kind } = editor.featureDraft
          createFeature(name.trim() || 'Feature', kind, {
            type: 'Point',
            coordinates: g.coordinates,
          })
          editor.setFeatureDraft({ name: '' })
          editor.setTool('none')
          return
        }
        if (tool === 'feature-polygon' && g.shape === 'polygon') {
          if (g.coordinates.length < 3) return
          const { name, kind } = editor.featureDraft
          createFeature(name.trim() || 'Area', kind, {
            type: 'Polygon',
            coordinates: g.coordinates,
          })
          editor.setFeatureDraft({ name: '' })
          editor.setTool('none')
        }
      },
      onProvisional: (g) => {
        const editor = useEditor.getState()
        const fill = editor.fill
        if (!fill?.drawing) return
        if (!g || g.shape !== 'polygon' || g.coordinates.length < 2) {
          if (fill.previewOutline) editor.updateFill({ previewOutline: null })
          return
        }
        // The first two corners fix the row direction for good; Terra Draw may later hand
        // the ring back rotated or reversed, and that must not change the heading.
        const anchor = fill.anchor ?? {
          corner: g.coordinates[0],
          headingDeg: firstEdgeHeading(g.coordinates),
        }
        editor.updateFill({
          previewOutline: g.coordinates.length >= 3 ? g.coordinates : fill.previewOutline,
          headingDeg: anchor.headingDeg,
          anchor,
        })
      },
      onEditing: (id, g) => {
        // A corner of the outline mid-drag: let the fill preview follow it.
        const editor = useEditor.getState()
        if (id.startsWith(OUTLINE_PREFIX) && g.shape === 'polygon' && editor.fill) {
          editor.updateFill({ previewOutline: g.coordinates })
        }
      },
      onEdited: (id, g) => {
        const editor = useEditor.getState()
        const s = latest.current.state
        if (id.startsWith(OUTLINE_PREFIX) && g.shape === 'polygon') {
          setBlockOutline(id.slice(OUTLINE_PREFIX.length), g.coordinates)
          if (editor.fill) editor.updateFill({ previewOutline: null })
        } else if (s.rows[id] && g.shape === 'line') {
          const r = updateRowPolyline(id, g.coordinates)
          if (!r.ok) editor.say(r.reason)
        } else if (s.loosePositions[id] && g.shape === 'point') {
          moveLoosePosition(id, g.coordinates)
        } else if (s.features[id]) {
          if (g.shape === 'point')
            updateFeature(id, { geometry: { type: 'Point', coordinates: g.coordinates } })
          else if (g.shape === 'polygon') {
            updateFeature(id, { geometry: { type: 'Polygon', coordinates: g.coordinates } })
          }
        } else if (g.shape === 'point') {
          // A row position being dragged: keep it as a nudge.
          nudgePosition(id, g.coordinates)
        }
      },
      onRejected: (count, reason) => {
        useEditor
          .getState()
          .say(
            `${count} shape${count === 1 ? '' : 's'} could not be opened for editing (${reason}).`,
          )
      },
    })
    controller.current = c
    return () => {
      c.destroy()
      controller.current = null
    }
  }, [map, enabled])

  // Tool changes.
  useEffect(() => {
    const c = controller.current
    if (!c || editMode !== 'none') return
    c.setShape(SHAPE_OF[tool])
  }, [tool, editMode])

  // While the fill form is open with the outline tool, its inputs re-render the panel and the
  // map; make sure the drawing mode survives that, whatever knocks it off.
  const fill = useEditor((s) => s.fill)
  useEffect(() => {
    const c = controller.current
    if (!c || editMode !== 'none' || tool === 'none') return
    const shape = SHAPE_OF[tool]
    if (shape) c.ensureShape(shape)
  }, [fill, tool, editMode])

  // Esc leaves whatever tool or edit session is active.
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const ed = useEditor.getState()
      if (ed.tool !== 'none') ed.setTool('none')
      else if (ed.editMode !== 'none') ed.setEditMode('none')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled])

  // Edit sessions: load the selected block's shapes or tree positions.
  useEffect(() => {
    const c = controller.current
    if (!c) return
    const s = latest.current.state
    if (editMode === 'feature') {
      const f = editingFeatureId ? s.features[editingFeatureId] : undefined
      if (!f || f.deleted) {
        c.stopEditing()
        return
      }
      c.edit([
        {
          id: f.id,
          geometry:
            f.geometry.type === 'Point'
              ? { shape: 'point', coordinates: f.geometry.coordinates }
              : { shape: 'polygon', coordinates: f.geometry.coordinates },
        },
      ])
      return
    }
    if (editMode === 'none' || !blockId) {
      c.stopEditing()
      return
    }
    const features: EditableFeature[] = []
    if (editMode === 'outline') {
      const block = s.blocks[blockId]
      if (block?.outline && block.outline.length >= 3) {
        features.push({
          id: `${OUTLINE_PREFIX}${blockId}`,
          geometry: { shape: 'polygon', coordinates: block.outline },
        })
      }
    } else if (editMode === 'shapes') {
      const block = s.blocks[blockId]
      if (block?.outline && block.outline.length >= 3) {
        features.push({
          id: `${OUTLINE_PREFIX}${blockId}`,
          geometry: { shape: 'polygon', coordinates: block.outline },
        })
      }
      for (const r of live.rows(s).filter((r) => r.blockId === blockId)) {
        features.push({ id: r.id, geometry: { shape: 'line', coordinates: r.polyline } })
      }
      for (const p of live.loosePositions(s).filter((p) => p.blockId === blockId)) {
        features.push({ id: p.id, geometry: { shape: 'point', coordinates: p.coord } })
      }
    } else {
      for (const p of positions(s).filter((p) => p.blockId === blockId && p.rowId)) {
        features.push({ id: p.posKey, geometry: { shape: 'point', coordinates: p.coord } })
      }
    }
    // Open on the outline where there is one: it is the thing most often being matched to the
    // imagery, and whatever is selected is the only thing showing corners.
    const outline = features.find((f) => f.id.startsWith(OUTLINE_PREFIX))
    c.edit(features, (outline ?? features[0])?.id)
    // Reloading on every state change would interrupt a drag; the session holds its shapes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMode, blockId, editingFeatureId])
}
