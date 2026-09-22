/**
 * Tasks: the rule-based title parser, staleness of recurring items, what belongs on This
 * Week, and what the weekly review shows (DESIGN.md §3.3, §4). Pure functions over plain
 * data so they are testable without a store.
 */
import type { Bucket, FarmMeta, FarmState, Target, Task, WorkLog } from '@/model/types'
import { DEFAULT_BUCKET_NAMES } from '@/model/types'
import { live } from '@/events/reduce'

export interface ParseContext {
  blocks: { id: string; code: string; name: string; species?: string }[]
  rows: { id: string; blockId: string; number: number }[]
  features: { id: string; name: string }[]
  people: { id: string; name: string }[]
  /** Tree labels that exist, any case. */
  labels: Iterable<string>
}

export interface ParsedTitle {
  title: string
  targets: Target[]
  category?: string
  season?: string
  seasonMonths?: number[]
  ownerId?: string
  needsDiscussion?: boolean
  notes?: string
  /** A checked-off line in a pasted list. */
  done?: boolean
}

/** Days without a log after which a recurring item with no interval reads as stale. */
export const STALE_DAYS = 30

// --- seasons

interface SeasonRule {
  re: RegExp
  months: number[]
}

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
]

const SEASONS: SeasonRule[] = [
  { re: /\bbefore cold weather\b/, months: [9, 10] },
  { re: /\bbefore (?:the )?frost\b/, months: [9, 10] },
  { re: /\b(?:as|when|once) (?:the )?trees go dormant\b/, months: [10, 11] },
  { re: /\bdormant\b/, months: [11, 12, 1, 2] },
  { re: /\bbefore fall\b/, months: [7, 8] },
  { re: /\blate fall\b/, months: [10, 11] },
  { re: /\bearly fall\b/, months: [9] },
  { re: /\b(?:fall|autumn)\b/, months: [9, 10, 11] },
  { re: /\bearly winter\b/, months: [11, 12] },
  { re: /\blate winter\b/, months: [2, 3] },
  { re: /\bwinter\b/, months: [12, 1, 2] },
  { re: /\bearly spring\b/, months: [3, 4] },
  { re: /\blate spring\b/, months: [5] },
  { re: /\bspring\b/, months: [3, 4, 5] },
  { re: /\bearly summer\b/, months: [6] },
  { re: /\blate summer\b/, months: [8] },
  { re: /\bsummer\b/, months: [6, 7, 8] },
]

function monthIndex(word: string): number {
  const w = word.toLowerCase()
  const i = MONTHS.findIndex((m) => m === w || (w.length >= 3 && m.startsWith(w)))
  return i + 1
}

function monthRange(from: number, to: number): number[] {
  const out: number[] = []
  for (let m = from; ; m = (m % 12) + 1) {
    out.push(m)
    if (m === to) break
    if (out.length > 12) break
  }
  return out
}

/** The season phrase in a text and the months it means, if any. */
export function parseSeason(text: string): { season: string; months: number[] } | null {
  const lower = text.toLowerCase()
  const monthWord = `(${MONTHS.map((m) => m.slice(0, 3)).join('|')})[a-z]*`
  const range = new RegExp(`\\b${monthWord}\\s*(?:-|–|to|through|thru)\\s*${monthWord}\\b`)
  const r = range.exec(lower)
  if (r) {
    const a = monthIndex(r[1]!)
    const b = monthIndex(r[2]!)
    if (a && b) return { season: r[0], months: monthRange(a, b) }
  }
  const found: { at: number; season: string; months: number[] }[] = []
  for (const rule of SEASONS) {
    const m = rule.re.exec(lower)
    if (m) found.push({ at: m.index, season: m[0], months: rule.months })
  }
  const single = new RegExp(`\\b${monthWord}\\b`).exec(lower)
  if (single) {
    const i = monthIndex(single[1]!)
    if (i) found.push({ at: single.index, season: single[0], months: [i] })
  }
  if (found.length === 0) return null
  // The most specific phrase wins: earlier rules are more specific, and the longest match.
  found.sort((a, b) => b.season.length - a.season.length || a.at - b.at)
  const best = found[0]!
  return { season: best.season, months: best.months }
}

// --- categories

const CATEGORY_RULES: [RegExp, string][] = [
  [/\bprun/, 'pruning'],
  [/\b(train|trellis|tie up|tie down|stake)/, 'training'],
  [/\b(fertiliz|compost|amend|lime\b|manure)/, 'fertilizing'],
  [/\bmow/, 'mowing'],
  [/\bweed/, 'weeding'],
  [/\bspray/, 'spraying'],
  [/\b(water|irrigat)/, 'watering'],
  [/\bgraft/, 'grafting'],
  [/\b(plant|transplant|pot up|seed)/, 'planting'],
  [/\b(harvest|pick|picking)\b/, 'harvest'],
  [/\b(build|install|hang|construct|pour|frame|wire up|assemble|mount)/, 'construction'],
  [/\b(fix|repair|replace|patch|service|sharpen|tune)/, 'maintenance'],
  // A place word only decides the category when no verb above did.
  [/\b(greenhouse|gray house|grey house|high tunnel|hoop house)/, 'greenhouse'],
  [/\b(organiz|clean|sort|tidy|inventory)/, 'organization'],
  [
    /\b(order|research|call|email|plan\b|schedule|meeting|budget|pay\b|renew|apply for|look into)/,
    'admin',
  ],
]

export function guessCategory(title: string): string | undefined {
  const lower = title.toLowerCase()
  for (const [re, cat] of CATEGORY_RULES) if (re.test(lower)) return cat
  return undefined
}

// --- names and places

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Tokens with a crude singular form so "pawpaws" matches "pawpaw". */
function tokens(s: string): string[] {
  return norm(s)
    .split(' ')
    .filter(Boolean)
    .map((t) => (t.length > 3 && t.endsWith('s') ? t.slice(0, -1) : t))
}

/** Where a phrase's tokens appear contiguously in the text tokens, or -1. */
function phraseAt(textTokens: string[], phrase: string[]): number {
  if (phrase.length === 0) return -1
  outer: for (let i = 0; i + phrase.length <= textTokens.length; i++) {
    for (let j = 0; j < phrase.length; j++) if (textTokens[i + j] !== phrase[j]) continue outer
    return i
  }
  return -1
}

function findPerson(name: string, people: ParseContext['people']): string | undefined {
  const n = norm(name)
  if (!n) return undefined
  const exact = people.find((p) => norm(p.name) === n)
  if (exact) return exact.id
  const first = people.find((p) => norm(p.name).split(' ')[0] === n.split(' ')[0])
  return first?.id
}

function capitalize(s: string): string {
  return s ? s[0]!.toUpperCase() + s.slice(1) : s
}

const OWNER_PAREN = /^(?:mostly |mainly |probably )?([a-z][a-z .'-]{0,40})$/i

/** Turn one typed or pasted line into a task's fields. */
export function parseTitle(raw: string, ctx: ParseContext): ParsedTitle {
  let text = raw.trim()
  let done = false
  // List markers, possibly stacked ("- [x] mow").
  for (let i = 0; i < 3; i++) {
    const marker = /^(?:[-*•‣▪]\s*|\[( |x|X)\]\s*|☐\s*|☑\s*|✓\s*|✔\s*)/.exec(text)
    if (!marker) break
    if (/x/i.test(marker[1] ?? '') || /^[☑✓✔]/.test(text)) done = true
    text = text.slice(marker[0].length).trim()
  }

  const notes: string[] = []
  let ownerId: string | undefined
  let needsDiscussion = false
  let seasonText: string | null = null

  // URLs go to notes.
  text = text.replace(/https?:\/\/\S+/g, (url) => {
    notes.push(url)
    return ' '
  })

  // Parentheticals: an owner, a discussion flag, or a note (which may carry the season).
  text = text.replace(/\(([^)]*)\)/g, (_m, inner: string) => {
    const s = inner.trim()
    if (!s) return ' '
    if (/needs? discussion|discuss/i.test(s)) {
      needsDiscussion = true
      return ' '
    }
    const owner = OWNER_PAREN.exec(s)
    if (owner) {
      const id = findPerson(owner[1]!, ctx.people)
      if (id) {
        ownerId = id
        return ' '
      }
    }
    notes.push(s)
    if (!seasonText) seasonText = s
    return ' '
  })

  // "needs discussion", "question for Kat", trailing "?".
  if (/\bneeds? discussion\b/i.test(text)) {
    needsDiscussion = true
    text = text.replace(/[,;:-]?\s*\bneeds? discussion\b/gi, ' ')
  }
  const question = /\bquestion for ([a-z][a-z .'-]{0,40}?)(?=[:,?]|\s*$)/i.exec(text)
  if (question) {
    needsDiscussion = true
    ownerId = ownerId ?? findPerson(question[1]!, ctx.people)
  }
  if (/\?\s*$/.test(text)) needsDiscussion = true

  // Trailing owner: "... - Tim" or "... – Tim".
  const trailing = /\s[-–—]\s*([a-z][a-z .'-]{0,40})$/i.exec(text)
  if (trailing) {
    const id = findPerson(trailing[1]!, ctx.people)
    if (id) {
      ownerId = ownerId ?? id
      text = text.slice(0, trailing.index)
    }
  }

  text = text.replace(/\s+/g, ' ').trim()

  // Season: from a parenthetical first, else from the title itself.
  let season: string | undefined
  let seasonMonths: number[] | undefined
  const found = parseSeason(seasonText ?? '') ?? parseSeason(text)
  if (found) {
    season = found.season
    seasonMonths = found.months
  }

  // Targets.
  const targets: Target[] = []
  const tt = tokens(text)
  if (/\b(whole|entire) (farm|orchard)\b|\bfarm[- ]wide\b|\bthe farm\b/i.test(text)) {
    targets.push({ kind: 'farm' })
  }
  let blockHit: { id: string; at: number } | null = null
  for (const b of ctx.blocks) {
    const byCode = phraseAt(tt, tokens(b.code))
    const byName = phraseAt(tt, tokens(b.name))
    const at = byCode >= 0 ? byCode : byName
    if (at >= 0 && (!blockHit || at < blockHit.at)) blockHit = { id: b.id, at }
  }
  const rowRe = /\brows?\s+(\d{1,3})(?:\s*(?:-|–|to|through|thru|and)\s*(\d{1,3}))?/gi
  const rowNumbers: number[] = []
  for (let m = rowRe.exec(text); m; m = rowRe.exec(text)) {
    const a = Number(m[1])
    const b = m[2] ? Number(m[2]) : a
    for (let n = Math.min(a, b); n <= Math.max(a, b) && rowNumbers.length < 100; n++) {
      rowNumbers.push(n)
    }
  }
  const blockForRows = blockHit?.id ?? (ctx.blocks.length === 1 ? ctx.blocks[0]!.id : undefined)
  if (rowNumbers.length && blockForRows) {
    for (const n of rowNumbers) {
      const row = ctx.rows.find((r) => r.blockId === blockForRows && r.number === n)
      if (row) targets.push({ kind: 'row', id: row.id })
    }
  }
  if (blockHit && !targets.some((t) => t.kind === 'row')) {
    targets.push({ kind: 'block', id: blockHit.id })
  }
  // A crop word with no particular block means every block of that crop.
  if (!blockHit) {
    const seen = new Set<string>()
    for (const b of ctx.blocks) {
      const sp = b.species?.trim()
      if (!sp || seen.has(sp.toLowerCase())) continue
      seen.add(sp.toLowerCase())
      if (phraseAt(tt, tokens(sp)) >= 0) targets.push({ kind: 'species', species: sp })
    }
  }
  const labels = new Set([...ctx.labels].map((l) => l.toUpperCase()))
  for (const word of text.split(/[\s,;]+/)) {
    const w = word.replace(/[^A-Za-z0-9-]/g, '').toUpperCase()
    if (/^[A-Z0-9]{1,8}-\d+(?:-\d+)?$/.test(w) && labels.has(w)) {
      targets.push({ kind: 'tree', posKey: w })
    }
  }
  for (const f of ctx.features) {
    if (phraseAt(tt, tokens(f.name)) >= 0) targets.push({ kind: 'feature', id: f.id })
  }

  const category = guessCategory(text)
  const title = capitalize(text.replace(/\s+([,.;:])/g, '$1'))

  const out: ParsedTitle = { title, targets }
  if (category) out.category = category
  if (season) {
    out.season = season
    out.seasonMonths = seasonMonths
  }
  if (ownerId) out.ownerId = ownerId
  if (needsDiscussion) out.needsDiscussion = true
  if (notes.length) out.notes = notes.join('\n')
  if (done) out.done = true
  return out
}

/** Build a parse context from the farm state. Tree labels are passed in by the caller. */
export function contextFrom(state: FarmState, labels: Iterable<string>): ParseContext {
  return {
    blocks: live.blocks(state).map((b) => ({
      id: b.id,
      code: b.code,
      name: b.name,
      ...(b.species ? { species: b.species } : {}),
    })),
    rows: live.rows(state).map((r) => ({ id: r.id, blockId: r.blockId, number: r.number })),
    features: live.features(state).map((f) => ({ id: f.id, name: f.name })),
    people: live
      .people(state)
      .filter((p) => p.active)
      .map((p) => ({ id: p.id, name: p.name })),
    labels,
  }
}

// --- buckets

export function bucketName(farm: FarmMeta | null | undefined, bucket: Bucket): string {
  return farm?.bucketNames?.[bucket] ?? DEFAULT_BUCKET_NAMES[bucket]
}

// --- dates

export function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y!, m! - 1, d! + days)
  return isoDate(date)
}

function utcOf(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y!, m! - 1, d!)
}

export function daysBetween(from: string, to: string): number {
  return Math.round((utcOf(to) - utcOf(from)) / 86_400_000)
}

export function monthOf(iso: string): number {
  return Number(iso.slice(5, 7))
}

// --- recurring

export function lastDone(task: Task, logs: readonly WorkLog[]): string | undefined {
  let best: string | undefined
  for (const l of logs) {
    if (l.taskId === task.id && !l.deleted && (!best || l.date > best)) best = l.date
  }
  return best
}

export function isInSeason(task: Task, month: number): boolean {
  return !task.seasonMonths || task.seasonMonths.length === 0 || task.seasonMonths.includes(month)
}

export type DueState = 'due' | 'stale' | 'ok' | 'out-of-season'

export function dueState(task: Task, logs: readonly WorkLog[], today: string): DueState {
  if (!isInSeason(task, monthOf(today))) return 'out-of-season'
  const last = lastDone(task, logs)
  const since = last ? daysBetween(last, today) : Infinity
  if (task.intervalDays) return since >= task.intervalDays ? 'due' : 'ok'
  return since >= STALE_DAYS ? 'stale' : 'ok'
}

/** Recurring items: in season first, then the longest untouched first. */
export function sortRecurring(tasks: Task[], logs: readonly WorkLog[], today: string): Task[] {
  const month = monthOf(today)
  const since = (t: Task) => {
    const last = lastDone(t, logs)
    return last ? daysBetween(last, today) : Infinity
  }
  return [...tasks].sort((a, b) => {
    const ia = isInSeason(a, month) ? 0 : 1
    const ib = isInSeason(b, month) ? 0 : 1
    if (ia !== ib) return ia - ib
    return since(b) - since(a) || a.order - b.order
  })
}

export function openTasks(state: FarmState): Task[] {
  return live.tasks(state).filter((t) => !t.done)
}

function byOrder(a: Task, b: Task): number {
  return a.order - b.order || a.createdAt - b.createdAt
}

export interface ThisWeek {
  now: Task[]
  /** Recurring items due or stale, in season. */
  due: Task[]
  /** Soon and Long Term items whose season includes this month. */
  opened: Task[]
  /** Small jobs waiting for a gap, so one can be added or picked up from the orchard. */
  soon: Task[]
  /** Projects, with how many of their subtasks are still open. */
  projects: { task: Task; open: number }[]
}

export function thisWeek(state: FarmState, today: string): ThisWeek {
  const open = openTasks(state)
  const logs = live.logs(state)
  const month = monthOf(today)
  const now = open.filter((t) => t.bucket === 'now' && !t.projectId).sort(byOrder)
  const due = sortRecurring(
    open.filter(
      (t) => t.bucket === 'recurring' && ['due', 'stale'].includes(dueState(t, logs, today)),
    ),
    logs,
    today,
  )
  const opened = open
    .filter(
      (t) =>
        (t.bucket === 'soon' || t.bucket === 'later') &&
        t.seasonMonths?.length &&
        t.seasonMonths.includes(month),
    )
    .sort(byOrder)
  const soon = open.filter((t) => t.bucket === 'soon' && !t.projectId).sort(byOrder)
  const projects = open
    .filter((t) => t.bucket === 'project' && !t.projectId)
    .sort(byOrder)
    .map((task) => ({ task, open: open.filter((t) => t.projectId === task.id).length }))
  return { now, due, opened, soon, projects }
}

export interface Review {
  from: string
  to: string
  done: { log: WorkLog; task?: Task }[]
  stillNow: Task[]
  stale: Task[]
  opened: Task[]
  discussion: Task[]
  /** Recurring items in season with no log this week. */
  suggestions: Task[]
}

export function weeklyReview(state: FarmState, today: string): Review {
  const from = addDays(today, -6)
  const logs = live.logs(state)
  const open = openTasks(state)
  const month = monthOf(today)
  const week = logs.filter((l) => l.date >= from && l.date <= today)
  const done = week
    .map((log) => ({ log, task: log.taskId ? state.tasks[log.taskId] : undefined }))
    .sort((a, b) => (a.log.date < b.log.date ? 1 : a.log.date > b.log.date ? -1 : 0))
  const recurring = open.filter((t) => t.bucket === 'recurring')
  const stale = sortRecurring(
    recurring.filter((t) => ['due', 'stale'].includes(dueState(t, logs, today))),
    logs,
    today,
  )
  const loggedThisWeek = new Set(week.map((l) => l.taskId).filter(Boolean))
  const suggestions = recurring.filter(
    (t) => isInSeason(t, month) && !loggedThisWeek.has(t.id) && !stale.includes(t),
  )
  return {
    from,
    to: today,
    done,
    stillNow: open.filter((t) => t.bucket === 'now' && !t.projectId).sort(byOrder),
    stale,
    opened: thisWeek(state, today).opened,
    discussion: open.filter((t) => t.needsDiscussion).sort(byOrder),
    suggestions,
  }
}
