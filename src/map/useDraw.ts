/** Connects the editor's tool and edit mode to Terra Draw and turns results into actions. */
import { useEffect, useMemo, useRef } from 'react'
import type { Map as MlMap } from 'maplibre-gl'
import type { FarmState } from '@/model/types'
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

/** Which shapes the map should hide because the editor is showing them instead. */
export function useHiddenShapes(state: FarmState): HiddenShapes {
  const editMode = useEditor((s) => s.editMode)
  const blockId = useEditor((s) => s.selectedBlockId)
  return useMemo(() => {
    if (editMode === 'none' || !blockId) return NOTHING_HIDDEN
    if (editMode === 'trees') {
      return { ...NOTHING_HIDDEN, positionsOfBlocks: new Set([blockId]) }
    }
    const rows = new Set(
      live
        .rows(state)
        .filter((r) => r.blockId === blockId)
        .map((r) => r.id),
    )
    return { ...NOTHING_HIDDEN, blocks: new Set([blockId]), rows, features: new Set<string>() }
  }, [editMode, blockId, state])
}

export function useDraw(map: MlMap | null, state: FarmState, enabled: boolean): void {
  const controller = useRef<DrawController | null>(null)
  const tool = useEditor((s) => s.tool)
  const editMode = useEditor((s) => s.editMode)
  const blockId = useEditor((s) => s.selectedBlockId)
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
          setBlockOutline(blockId, g.coordinates)
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
      onEdited: (id, g) => {
        const editor = useEditor.getState()
        const s = latest.current.state
        if (id.startsWith(OUTLINE_PREFIX) && g.shape === 'polygon') {
          setBlockOutline(id.slice(OUTLINE_PREFIX.length), g.coordinates)
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

  // Edit sessions: load the selected block's shapes or tree positions.
  useEffect(() => {
    const c = controller.current
    if (!c) return
    if (editMode === 'none' || !blockId) {
      c.stopEditing()
      return
    }
    const s = latest.current.state
    const features: EditableFeature[] = []
    if (editMode === 'shapes') {
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
    c.edit(features)
    // Reloading on every state change would interrupt a drag; the session holds its shapes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMode, blockId])
}
