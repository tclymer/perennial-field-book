// Tags each release in CHANGELOG.md at the commit that set its version in package.json, with
// that release's notes as the tag message. Safe to run after every deploy: releases already
// tagged, and ones not yet committed, are left alone. Push the tags with: git push --tags
//
// With --github it also publishes a GitHub Release for each tag that has none, which needs
// the GitHub CLI (gh) installed and signed in.
// Run: node scripts/tag-releases.mjs [--github]
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()
const changelog = readFileSync(fileURLToPath(new URL('../CHANGELOG.md', import.meta.url)), 'utf8')

/** version → notes, from the "## 0.8.6 (date)" headings. */
const releases = []
for (const part of changelog.split(/^## /m).slice(1)) {
  const [heading, ...body] = part.split('\n')
  const version = heading.match(/^(\d+\.\d+\.\d+)/)?.[1]
  if (version) releases.push({ version, heading: heading.trim(), notes: body.join('\n').trim() })
}

/** The first commit at which package.json carried each version. */
const firstCommit = new Map()
const log = git('log', '--reverse', '--format=@%H', '-p', '--', 'package.json')
let commit = ''
for (const line of log.split('\n')) {
  if (line.startsWith('@')) commit = line.slice(1)
  const v = line.match(/^\+\s*"version":\s*"([^"]+)"/)?.[1]
  if (v && !firstCommit.has(v)) firstCommit.set(v, commit)
}

const tags = new Set(git('tag', '--list', 'v*').split('\n').filter(Boolean))
for (const { version, heading, notes } of releases.reverse()) {
  const tag = `v${version}`
  if (tags.has(tag)) continue
  const at = firstCommit.get(version)
  if (!at) {
    console.log(`${tag}: not committed yet, skipped`)
    continue
  }
  execFileSync('git', ['tag', '-a', tag, at, '-F', '-'], { input: `${heading}\n\n${notes}\n` })
  console.log(`${tag}: tagged ${at.slice(0, 7)}`)
}

if (process.argv.includes('--github')) {
  const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8' }).trim()
  const published = new Set(
    gh('release', 'list', '--limit', '1000', '--json', 'tagName', '--jq', '.[].tagName')
      .split('\n')
      .filter(Boolean),
  )
  for (const { version, heading, notes } of releases) {
    const tag = `v${version}`
    if (published.has(tag) || !firstCommit.has(version)) continue
    execFileSync('gh', ['release', 'create', tag, '--verify-tag', '--title', heading, '-F', '-'], {
      input: notes,
    })
    console.log(`${tag}: published on GitHub`)
  }
}
