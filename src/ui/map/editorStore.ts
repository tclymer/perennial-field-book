/** What the map editor is doing right now. Not persisted. */
import { create } from 'zustand'
import type { Map as MlMap } from 'maplibre-gl'
import type { FeatureKind, LngLat } from '@/model/types'
import type { ColorBy } from '@/map/geojson'
import type { FillPattern } from '@/engine/fill'

export type Tool = 'none' | 'row' | 'outline' | 'loose' | 'feature-point' | 'feature-polygon'

/** What is loaded into Terra Draw for editing. */
export type EditMode = 'none' | 'shapes' | 'trees' | 'outline'

/** The fill form's values while an outline is being filled with rows. */
export interface FillDraft {
  blockId: string
  headingDeg: number
  /** Degrees added to the heading the outline's first edge gave. */
  rotateDeg: number
  rowSpacingFt: number
  treeSpacingFt: number
  insetFt: number
  insetEndFt: number
  shiftAlongFt: number
  shiftAcrossFt: number
  pattern: FillPattern
  /** True while the outline is still being drawn; the preview follows the cursor. */
  drawing: boolean
  /** True when re-laying out a block that already has rows; applying reconciles them. */
  adjust: boolean
  /** The outline as drawn so far, before it is committed to the block. */
  previewOutline: LngLat[] | null
  /** The first corner and the heading of the first edge, locked once the second corner is placed. */
  anchor?: { corner: LngLat; headingDeg: number } | null
}

/** A rigid move of a whole block while its sliders are open. */
export interface MoveDraft {
  blockId: string
  headingDeg: number
  alongFt: number
  acrossFt: number
  rotateDeg: number
  pivot: LngLat
}

interface EditorState {
  map: MlMap | null
  move: MoveDraft | null
  openMove: (draft: MoveDraft) => void
  updateMove: (patch: Partial<MoveDraft>) => void
  closeMove: () => void
  selectedBlockId: string | null
  tool: Tool
  editMode: EditMode
  fill: FillDraft | null
  /** True while the map is turned so the selected block's rows run bottom to top. */
  aligned: boolean
  colorBy: ColorBy
  /** Variety ids lit up on the map; empty means none. */
  highlight: string[]
  planYear: number
  featureDraft: { name: string; kind: FeatureKind }
  message: string | null
  setMap: (map: MlMap | null) => void
  selectBlock: (id: string | null) => void
  setTool: (tool: Tool) => void
  setEditMode: (mode: EditMode) => void
  /** Open the fill form; with `draw` the outline tool is active so the preview follows the cursor. */
  openFill: (draft: FillDraft, draw?: boolean) => void
  updateFill: (patch: Partial<FillDraft>) => void
  closeFill: () => void
  setAligned: (aligned: boolean) => void
  setColorBy: (c: ColorBy) => void
  setHighlight: (ids: string[]) => void
  setPlanYear: (y: number) => void
  setFeatureDraft: (d: Partial<{ name: string; kind: FeatureKind }>) => void
  say: (message: string | null) => void
}

export const useEditor = create<EditorState>()((set) => ({
  map: null,
  move: null,
  openMove: (move) => set({ move, tool: 'none', editMode: 'none', fill: null, message: null }),
  updateMove: (patch) => set((s) => (s.move ? { move: { ...s.move, ...patch } } : {})),
  closeMove: () => set({ move: null }),
  selectedBlockId: null,
  tool: 'none',
  editMode: 'none',
  fill: null,
  aligned: false,
  colorBy: 'species',
  highlight: [],
  planYear: new Date().getFullYear() + 1,
  featureDraft: { name: '', kind: 'building' },
  message: null,
  setMap: (map) => set({ map }),
  selectBlock: (id) =>
    set({
      selectedBlockId: id,
      tool: 'none',
      editMode: 'none',
      fill: null,
      move: null,
      message: null,
    }),
  setTool: (tool) =>
    set((s) => ({
      tool,
      editMode: 'none',
      message: null,
      // Leaving the outline tool mid-draw abandons the fill.
      fill: s.fill?.drawing && tool !== 'outline' ? null : s.fill,
    })),
  setEditMode: (editMode) => set({ editMode, tool: 'none', message: null }),
  openFill: (fill, draw = false) =>
    set({ fill, tool: draw ? 'outline' : 'none', editMode: 'none', message: null }),
  updateFill: (patch) => set((s) => (s.fill ? { fill: { ...s.fill, ...patch } } : {})),
  closeFill: () => set({ fill: null, editMode: 'none' }),
  setAligned: (aligned) => set({ aligned }),
  setColorBy: (colorBy) => set({ colorBy }),
  setHighlight: (highlight) => set({ highlight }),
  setPlanYear: (planYear) => set({ planYear }),
  setFeatureDraft: (d) => set((s) => ({ featureDraft: { ...s.featureDraft, ...d } })),
  say: (message) => set({ message }),
}))

export const TOOL_HINT: Record<Tool, string> = {
  none: '',
  row: 'Drawing a row: click at position 1, click at each turn, click the last tree, then press Enter. Esc cancels.',
  outline:
    'Drawing the outline: click the corner where position 1 will be, then the corner at the far end of that first row (this sets the row direction), then the remaining corners. Press Enter to close. Esc cancels.',
  loose: 'Click where the tree stands. Esc when done.',
  'feature-point': 'Click where it is. Esc cancels.',
  'feature-polygon': 'Click each corner, then press Enter to close. Esc cancels.',
}
