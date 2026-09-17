/** What the map editor is doing right now. Not persisted. */
import { create } from 'zustand'
import type { Map as MlMap } from 'maplibre-gl'
import type { FeatureKind } from '@/model/types'
import type { ColorBy } from '@/map/geojson'

export type Tool = 'none' | 'row' | 'outline' | 'loose' | 'feature-point' | 'feature-polygon'

/** What is loaded into Terra Draw for editing. */
export type EditMode = 'none' | 'shapes' | 'trees'

interface EditorState {
  map: MlMap | null
  selectedBlockId: string | null
  tool: Tool
  editMode: EditMode
  colorBy: ColorBy
  planYear: number
  featureDraft: { name: string; kind: FeatureKind }
  message: string | null
  setMap: (map: MlMap | null) => void
  selectBlock: (id: string | null) => void
  setTool: (tool: Tool) => void
  setEditMode: (mode: EditMode) => void
  setColorBy: (c: ColorBy) => void
  setPlanYear: (y: number) => void
  setFeatureDraft: (d: Partial<{ name: string; kind: FeatureKind }>) => void
  say: (message: string | null) => void
}

export const useEditor = create<EditorState>()((set) => ({
  map: null,
  selectedBlockId: null,
  tool: 'none',
  editMode: 'none',
  colorBy: 'variety',
  planYear: new Date().getFullYear() + 1,
  featureDraft: { name: '', kind: 'building' },
  message: null,
  setMap: (map) => set({ map }),
  selectBlock: (id) => set({ selectedBlockId: id, tool: 'none', editMode: 'none' }),
  setTool: (tool) => set({ tool, editMode: 'none', message: null }),
  setEditMode: (editMode) => set({ editMode, tool: 'none', message: null }),
  setColorBy: (colorBy) => set({ colorBy }),
  setPlanYear: (planYear) => set({ planYear }),
  setFeatureDraft: (d) => set((s) => ({ featureDraft: { ...s.featureDraft, ...d } })),
  say: (message) => set({ message }),
}))

export const TOOL_HINT: Record<Tool, string> = {
  none: '',
  row: 'Drawing a row: click at position 1, click at each turn, click the last tree, then press Enter (or click it again).',
  outline:
    'Drawing the block outline: click each corner, then press Enter (or click the first corner) to close.',
  loose: 'Click where the tree stands.',
  'feature-point': 'Click where the feature is.',
  'feature-polygon':
    'Click each corner of the area, then press Enter (or click the first corner) to close.',
}
