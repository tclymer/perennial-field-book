// Rasterizes public/icon.svg into the PNG sizes the web manifest and iOS expect.
// Run by hand after changing the SVG: node scripts/icons.mjs
import sharp from 'sharp'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const svg = readFileSync(fileURLToPath(new URL('../public/icon.svg', import.meta.url)))
const out = (name) => fileURLToPath(new URL(`../public/${name}`, import.meta.url))
const raster = (px) => sharp(svg, { density: 384 }).resize(px, px).png()

await raster(192).toFile(out('icon-192.png'))
await raster(512).toFile(out('icon-512.png'))
await raster(180).toFile(out('apple-touch-icon.png'))
// Maskable: brand color to the edge, the mark inside the safe zone.
const mark = await raster(400).toBuffer()
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#4d7c0f' } })
  .composite([{ input: mark, gravity: 'centre' }])
  .png()
  .toFile(out('icon-512-maskable.png'))
console.log('icons written')
