/** Tap a tree dot or a feature on the map to see what it is and jump to its page. */
import { useEffect } from 'react'
import type { Map as MlMap, MapMouseEvent, Popup } from 'maplibre-gl'
import { useEditor } from '@/ui/map/editorStore'

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}

export function useMapPopup(map: MlMap | null): void {
  useEffect(() => {
    if (!map) return
    let popup: Popup | null = null
    let disposed = false
    const canvas = map.getCanvas()

    const idle = () => {
      const e = useEditor.getState()
      return e.tool === 'none' && e.editMode === 'none'
    }

    const onPosition = async (e: MapMouseEvent & { features?: GeoJSON.Feature[] }) => {
      if (!idle()) return
      const f = e.features?.[0]
      if (!f) return
      const p = f.properties as Record<string, unknown>
      const label = String(p.label ?? '')
      const posKey = String(p.posKey ?? '')
      const line2 = p.variety ? esc(p.variety) : p.empty ? 'Empty position' : 'Variety unknown'
      const line3 = p.status ? `<span class="fb-status">${esc(p.status)}</span>` : ''
      const { Popup: PopupCtor } = await import('maplibre-gl')
      if (disposed) return
      popup?.remove()

      // A DOM node rather than a string, because taking a spot out is an action and needs a
      // real button. The undo line replaces the buttons in place, so it is one tap away.
      const el = document.createElement('div')
      el.className = 'fb-popup'
      el.innerHTML =
        `<strong>${esc(label)}</strong><div>${line2} ${line3}</div>` +
        `<a href="#/t/${encodeURIComponent(label)}">Open tree page →</a>`

      if (posKey.includes(':')) {
        const actions = document.createElement('div')
        actions.className = 'fb-popup-actions'
        const remove = document.createElement('button')
        remove.type = 'button'
        remove.textContent = 'Take out of the row'
        remove.title =
          'Record this tree as removed and stop its spot counting, so the rest of the row moves up a number'
        remove.addEventListener('click', async () => {
          const { removePositions } = await import('@/state/actions')
          const { commitEvents } = await import('@/state/actions')
          const inverse = removePositions([posKey])
          actions.replaceChildren()
          const said = document.createElement('span')
          said.textContent = `${label} taken out.`
          const undo = document.createElement('button')
          undo.type = 'button'
          undo.textContent = 'Undo'
          undo.addEventListener('click', () => {
            commitEvents(inverse)
            popup?.remove()
          })
          actions.append(said, undo)
        })
        actions.append(remove)
        el.append(actions)
      }

      popup = new PopupCtor({ closeButton: true, offset: 12, maxWidth: '260px' })
        .setLngLat(e.lngLat)
        .setDOMContent(el)
        .addTo(map)
    }

    const onFeature = async (e: MapMouseEvent & { features?: GeoJSON.Feature[] }) => {
      if (!idle()) return
      const f = e.features?.[0]
      if (!f) return
      const p = f.properties as Record<string, unknown>
      const { Popup: PopupCtor } = await import('maplibre-gl')
      if (disposed) return
      popup?.remove()
      popup = new PopupCtor({ closeButton: false, offset: 12, maxWidth: '240px' })
        .setLngLat(e.lngLat)
        .setHTML(
          `<div class="fb-popup"><strong>${esc(p.name)}</strong><div>${esc(p.kind)}</div></div>`,
        )
        .addTo(map)
    }

    // A small label follows the mouse over tree dots, so a row can be read without
    // counting or clicking. Touch screens never fire mousemove, so phones are unaffected.
    let hover: Popup | null = null
    let hoverKey = ''
    const onHover = async (e: MapMouseEvent & { features?: GeoJSON.Feature[] }) => {
      if (!idle()) return
      const f = e.features?.[0]
      if (!f) return
      const p = f.properties as Record<string, unknown>
      const label = String(p.label ?? '')
      const detail = p.variety ? esc(p.variety) : p.empty ? 'empty' : ''
      const key = `${label}|${detail}`
      if (!hover) {
        const { Popup: PopupCtor } = await import('maplibre-gl')
        if (disposed || hover) return
        hover = new PopupCtor({
          closeButton: false,
          closeOnClick: false,
          offset: 10,
          anchor: 'bottom',
          className: 'fb-hover',
        })
      }
      if (key !== hoverKey) {
        hoverKey = key
        hover.setHTML(`<strong>${esc(label)}</strong>${detail ? ` ${detail}` : ''}`)
      }
      hover.setLngLat(e.lngLat)
      if (!hover.isOpen()) hover.addTo(map)
    }
    const hideHover = () => {
      hover?.remove()
      hoverKey = ''
    }

    const enter = () => {
      if (idle()) canvas.style.cursor = 'pointer'
    }
    const leave = () => {
      canvas.style.cursor = ''
      hideHover()
    }

    // A block answers the day's question: what is waiting here, and what has come off it.
    const onBlock = async (e: MapMouseEvent & { features?: GeoJSON.Feature[] }) => {
      if (!idle()) return
      const f = e.features?.[0]
      if (!f) return
      const p = f.properties as Record<string, unknown>
      const id = String(p.id ?? '')
      const tasks = Number(p.tasks ?? 0)
      const due = Number(p.due ?? 0)
      const harvest = String(p.harvest ?? '')
      const lines: string[] = []
      if (tasks > 0) {
        lines.push(
          `${tasks} open ${tasks === 1 ? 'task' : 'tasks'}${due > 0 ? `, ${due} due` : ''}`,
        )
      }
      if (harvest) lines.push(`${esc(harvest)} this year`)
      const { Popup: PopupCtor } = await import('maplibre-gl')
      if (disposed) return
      popup?.remove()
      popup = new PopupCtor({ closeButton: false, offset: 12, maxWidth: '260px' })
        .setLngLat(e.lngLat)
        .setHTML(
          `<div class="fb-popup"><strong>${esc(p.code)}</strong> ${esc(p.name)}` +
            (lines.length ? `<div>${lines.join('<br>')}</div>` : '') +
            `<a href="#/blocks/${encodeURIComponent(id)}/grid">Open the block grid →</a>` +
            (tasks > 0 ? `<br><a href="#/tasks">See the tasks →</a>` : '') +
            `</div>`,
        )
        .addTo(map)
    }

    map.on('mousemove', 'position-dot', onHover)
    map.on('click', 'position-dot', hideHover)
    map.on('click', 'position-dot', onPosition)
    map.on('click', 'feature-point', onFeature)
    map.on('click', 'feature-fill', onFeature)
    map.on('click', 'block-fill', onBlock)
    map.on('mouseenter', 'position-dot', enter)
    map.on('mouseleave', 'position-dot', leave)
    map.on('mouseenter', 'feature-point', enter)
    map.on('mouseleave', 'feature-point', leave)
    return () => {
      disposed = true
      popup?.remove()
      hover?.remove()
      map.off('mousemove', 'position-dot', onHover)
      map.off('click', 'position-dot', hideHover)
      map.off('click', 'position-dot', onPosition)
      map.off('click', 'feature-point', onFeature)
      map.off('click', 'feature-fill', onFeature)
      map.off('click', 'block-fill', onBlock)
      map.off('mouseenter', 'position-dot', enter)
      map.off('mouseleave', 'position-dot', leave)
      map.off('mouseenter', 'feature-point', enter)
      map.off('mouseleave', 'feature-point', leave)
    }
  }, [map])
}
