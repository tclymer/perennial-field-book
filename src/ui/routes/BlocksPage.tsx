import { Link } from 'react-router-dom'
import { useFarmStore } from '@/state/store'
import { live } from '@/events/reduce'
import { currentTreeByPos, positions } from '@/state/derived'
import { blockAreaSqFt } from '@/engine/layout'
import { sqFtToAcres } from '@/engine/geo'
import { Card, PageHeader } from '@/ui/components'
import { useIsDesktop } from '@/ui/useIsDesktop'

export default function BlocksPage() {
  const state = useFarmStore((s) => s.state)
  const isDesktop = useIsDesktop()
  const blocks = live.blocks(state).sort((a, b) => a.code.localeCompare(b.code))
  const trees = currentTreeByPos(state)
  const all = positions(state)
  return (
    <div className="space-y-4">
      <PageHeader title="Blocks" subtitle={`${blocks.length} in this farm`}>
        {isDesktop && (
          <Link to="/" className="text-sm underline decoration-dotted">
            Draw blocks on the map
          </Link>
        )}
      </PageHeader>
      {blocks.length === 0 && (
        <Card>
          <p className="text-sm text-stone-600 dark:text-stone-400">
            No blocks yet.{' '}
            {isDesktop
              ? 'Draw the first one on the map.'
              : 'Blocks are drawn on the map from a computer.'}
          </p>
        </Card>
      )}
      <ul className="grid gap-3 sm:grid-cols-2">
        {blocks.map((b) => {
          const rows = live.rows(state).filter((r) => r.blockId === b.id)
          const here = all.filter((p) => p.blockId === b.id)
          const planted = here.filter((p) => trees.has(p.posKey)).length
          const acres = sqFtToAcres(blockAreaSqFt(b, rows))
          return (
            <li key={b.id}>
              <Card className="h-full">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="font-semibold">
                    <span className="text-stone-500 dark:text-stone-400">{b.code}</span> {b.name}
                  </h2>
                  {b.species && (
                    <span className="text-xs text-stone-500 dark:text-stone-400">{b.species}</span>
                  )}
                </div>
                <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
                  {rows.length} {rows.length === 1 ? 'row' : 'rows'} · {planted} of {here.length}{' '}
                  positions planted
                  {acres > 0 && ` · ${acres.toFixed(2)} ac`}
                </p>
                <div className="mt-3 flex flex-wrap gap-3 text-sm">
                  <Link to={`/blocks/${b.id}/grid`} className="underline decoration-dotted">
                    Grid
                  </Link>
                  {here[0] && (
                    <Link
                      to={`/?focus=${encodeURIComponent(here[0].posKey)}`}
                      className="underline decoration-dotted"
                    >
                      Map
                    </Link>
                  )}
                </div>
              </Card>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
