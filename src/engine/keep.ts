/**
 * Turns a pasted Google Keep note into guessed groups of tasks (DESIGN.md §3.3, §12).
 * Indentation is usually lost in a paste, so headings are guessed from their words and from
 * what follows them; the person confirms each guess before anything is created.
 */
import type { Bucket } from '@/model/types'
import { parseTitle, type ParseContext, type ParsedTitle } from './tasks'

export type Guess = 'bucket' | 'project' | 'task' | 'skip'

export interface KeepItem {
  raw: string
  parsed: ParsedTitle
}

export interface KeepGroup {
  /** The heading line, or null for lines before any heading. */
  heading: string | null
  guess: Guess
  /** For a bucket heading: which bucket. */
  bucket?: Bucket
  /** Why it was guessed, for the confirmation screen. */
  reason: string
  items: KeepItem[]
}

const BUCKET_WORDS: [RegExp, Bucket][] = [
  [/catch[- ]?up/i, 'now'],
  [/monkey/i, 'now'],
  [/\bnow\b/i, 'now'],
  [/mini[- ]?task/i, 'soon'],
  [/\bsoon\b/i, 'soon'],
  [/long[- ]?term/i, 'later'],
  [/\blater\b/i, 'later'],
  [/spinning[- ]?plate/i, 'recurring'],
  [/recurring|keep up with|standing/i, 'recurring'],
]

const SKIP_WORDS = /graft list|graft plan/i

function stripMarker(line: string): string {
  return line.replace(/^(?:[-*•‣▪]\s*|\[( |x|X)\]\s*|[☐☑✓✔]\s*)/, '').trim()
}

function hasMarker(line: string): boolean {
  return /^(?:[-*•‣▪]\s|\[( |x|X)\]|[☐☑✓✔])/.test(line.trim())
}

function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length
}

/** First words that make a line a task, never a heading. */
const VERBS = new Set(
  (
    'mow water order build fix hang move paint remove train graft prune spray weed plant buy ' +
    'get call check clean install replace make put set take run label mount dig cut pull tie ' +
    'wrap cover uncover fertilize harvest pick trim thin stake prep prepare finish start ' +
    'research ask email schedule plan pay renew mulch collect cage flag mark measure repair ' +
    'sharpen service sort tidy organize burn haul spread top add drop see look figure decide'
  ).split(' '),
)

function firstWord(s: string): string {
  return (s.split(/\s+/)[0] ?? '').toLowerCase().replace(/[^a-z]/g, '')
}

export function parseKeep(
  text: string,
  ctx: ParseContext,
  bucketNames: Partial<Record<Bucket, string>> = {},
): KeepGroup[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+$/, ''))
    .filter((l) => l.trim().length > 0)
  const custom: [RegExp, Bucket][] = Object.entries(bucketNames)
    .filter(([, name]) => name)
    .map(([bucket, name]) => [
      new RegExp(`^${String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      bucket as Bucket,
    ])

  const groups: KeepGroup[] = []
  let current: KeepGroup = { heading: null, guess: 'bucket', bucket: 'now', reason: '', items: [] }

  const isHeading = (i: number): Omit<KeepGroup, 'items' | 'heading'> | null => {
    const raw = lines[i]!
    const line = stripMarker(raw)
    if (raw.trim().length === 0 || wordCount(line) > 7 || /[?.]$/.test(line)) return null
    if (SKIP_WORDS.test(line)) {
      return { guess: 'skip', reason: 'Graft plans live on the block grid, not in tasks.' }
    }
    for (const [re, bucket] of [...custom, ...BUCKET_WORDS]) {
      if (re.test(line)) return { guess: 'bucket', bucket, reason: 'Matches a bucket name.' }
    }
    if (/\b(punch )?list$/i.test(line) || /^(todo|to do)$/i.test(line)) {
      return { guess: 'project', reason: 'Ends in "list".' }
    }
    // A short capitalized line that does not start with a verb, followed by at least two more
    // lines, reads as a project heading ("Solar punch list", "Farm Trials").
    if (
      !hasMarker(raw) &&
      wordCount(line) <= 5 &&
      /^[A-Z]/.test(line) &&
      !VERBS.has(firstWord(line)) &&
      i + 2 < lines.length
    ) {
      const nextTwo = lines.slice(i + 1, i + 3)
      const bothItems = nextTwo.every((l) => wordCount(stripMarker(l)) >= 2)
      if (bothItems) return { guess: 'project', reason: 'A short line followed by items.' }
    }
    return null
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!
    const head = isHeading(i)
    if (head) {
      if (current.items.length || current.heading !== null) groups.push(current)
      current = { heading: stripMarker(raw), ...head, items: [] }
      continue
    }
    current.items.push({ raw, parsed: parseTitle(raw, ctx) })
  }
  if (current.items.length || current.heading !== null) groups.push(current)
  return groups
}
