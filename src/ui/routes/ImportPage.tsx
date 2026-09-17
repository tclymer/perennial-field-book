import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useFarmStore } from '@/state/store'
import { live } from '@/events/reduce'
import { parsePlannerBackup, proposeBlocks, type BlockProposal } from '@/engine/planner'
import { codeAvailable, createBlock } from '@/state/actions'
import { CODE_RE } from '@/model/ids'
import { Button, Card, PageHeader, Pill, inputClass } from '@/ui/components'

interface Row extends BlockProposal {
  include: boolean
  alreadyLinked: boolean
}

export default function ImportPage() {
  const navigate = useNavigate()
  const state = useFarmStore((s) => s.state)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const load = async (file: File) => {
    setMessage(null)
    try {
      const parsed = parsePlannerBackup(await file.text())
      const blocks = live.blocks(state)
      const linked = new Set(blocks.map((b) => b.planner?.plantingId).filter(Boolean))
      const proposals = proposeBlocks(
        parsed.plantings,
        blocks.map((b) => b.code),
      )
      setRows(
        proposals.map((p) => ({
          ...p,
          alreadyLinked: linked.has(p.plantingId),
          include: !linked.has(p.plantingId) && p.status !== 'removed',
        })),
      )
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'That file could not be read.')
    }
  }

  const create = () => {
    if (!rows) return
    let made = 0
    for (const r of rows) {
      if (!r.include || r.alreadyLinked) continue
      if (!CODE_RE.test(r.code) || !codeAvailable(r.code)) {
        setMessage(`Fix the code for ${r.name} first: letters and digits only, and not in use.`)
        return
      }
      createBlock({
        code: r.code,
        name: r.name,
        ...(r.species ? { species: r.species } : {}),
        ...(r.rowSpacingFt ? { rowSpacingFt: r.rowSpacingFt } : {}),
        ...(r.inRowSpacingFt ? { inRowSpacingFt: r.inRowSpacingFt } : {}),
        planner: r.planner,
      })
      made += 1
    }
    setMessage(`Created ${made} ${made === 1 ? 'block' : 'blocks'}. Draw their rows on the map.`)
    setRows(null)
    if (made) navigate('/blocks')
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Import from the planner"
        subtitle="Turn each planting in a Perennial Profit Planner backup into a block, linked for the comparison later."
      />
      <Card>
        <label className="text-sm">
          Planner backup file:{' '}
          <input
            type="file"
            accept=".json,application/json"
            className="text-sm"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void load(f)
              e.target.value = ''
            }}
          />
        </label>
        <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">
          In the planner, Settings → Download a backup. Nothing else in the file is read.
        </p>
        {message && (
          <p role="status" className="mt-2 text-sm">
            {message}
          </p>
        )}
      </Card>

      {rows && (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-stone-500 dark:text-stone-400">
                <th className="py-1 pr-2">Import</th>
                <th className="py-1 pr-2">Planting</th>
                <th className="py-1 pr-2">Code</th>
                <th className="py-1 pr-2">Rows</th>
                <th className="py-1 pr-2">Row × spacing</th>
                <th className="py-1 pr-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.plantingId} className="border-t border-stone-100 dark:border-stone-800">
                  <td className="py-1.5 pr-2">
                    <input
                      type="checkbox"
                      aria-label={`Import ${r.name}`}
                      checked={r.include && !r.alreadyLinked}
                      disabled={r.alreadyLinked}
                      onChange={(e) =>
                        setRows(
                          rows.map((x, j) => (j === i ? { ...x, include: e.target.checked } : x)),
                        )
                      }
                    />
                  </td>
                  <td className="py-1.5 pr-2">
                    {r.name}
                    {r.alreadyLinked && (
                      <Pill className="ml-2" tone="info">
                        already a block
                      </Pill>
                    )}
                  </td>
                  <td className="py-1.5 pr-2">
                    <input
                      className={`${inputClass} w-24`}
                      value={r.code}
                      aria-label={`Code for ${r.name}`}
                      onChange={(e) =>
                        setRows(
                          rows.map((x, j) =>
                            j === i ? { ...x, code: e.target.value.toUpperCase() } : x,
                          ),
                        )
                      }
                    />
                  </td>
                  <td className="py-1.5 pr-2 tabular-nums">{r.planner.rows ?? '—'}</td>
                  <td className="py-1.5 pr-2 tabular-nums">
                    {r.planner.rowLengthFt ?? '—'} ft × {r.planner.inRowSpacingFt ?? '—'} ft
                  </td>
                  <td className="py-1.5 pr-2">{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="primary" onClick={create}>
              Create blocks
            </Button>
            <Button variant="ghost" onClick={() => setRows(null)}>
              Cancel
            </Button>
            <Link to="/blocks" className="text-xs underline decoration-dotted">
              Existing blocks
            </Link>
          </div>
        </Card>
      )}
    </div>
  )
}
