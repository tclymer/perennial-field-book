# Perennial Field Book

Map your orchard, find every tree, keep its history. A companion to the
[Perennial Profit Planner](https://planner.theorganicorchard.org): the planner says what a
planting should earn, the field book records where everything is and what actually happened.

**Live:** https://fieldbook.theorganicorchard.org

Status: iteration one (map, places, trees) built; sync, tasks, and harvest follow. The
product design lives in [DESIGN.md](DESIGN.md).

## What it does today

- **Map.** Draw blocks, rows (as lines over the visible trees, with turns), block outlines,
  loose trees, and buildings or areas on satellite imagery. Positions are generated along
  each row by count or spacing; any tree can be dragged to where it really stands.
- **Trees.** Every position has a label like `PP1-3-12` and a page at `/#/t/PP1-3-12` with
  its variety, status, dated history (planted, grafted, first fruit, died, removed, scionwood
  collected, notes, photos), and every tree that has ever stood there.
- **Block grid.** Rows as columns, positions as cells, colored by variety, status, or graft
  plan. Select and assign varieties or plan grafts for a year; the plan reports scionwood to
  gather per variety and converts to a graft event with one tap.
- **Search** across trees, rows, blocks, varieties, and places.
- **Imagery.** Google satellite through the Map Tiles API when a key is present, held to the
  free tier by a daily quota, with automatic fallback to free public imagery (Pennsylvania's
  6-inch PEMA orthoimagery, Esri World Imagery, USGS, or any XYZ URL). The free imagery over
  the farm can be saved for use without signal.
- **Import** a planner backup to create linked blocks.

## Run it locally

```
npm ci
npm run dev        # http://localhost:5173
npm test           # unit and route tests
npm run build      # type-check and build to dist/
npm run preview    # serve the build
```

Node 22 or newer. `npm run lint` checks formatting; `npm run format` applies it.

Google imagery needs a Map Tiles API key in `.env.local`:

```
VITE_GOOGLE_MAPS_KEY=...
VITE_DEV_CENTER=40.17940,-77.08304   # optional: where a fresh map opens in development
```

Without a key the map uses free public imagery. DESIGN.md §8.6 has the key set-up and the
daily quota that keeps usage inside Google's free tier. `?simulateGoogle=429` on the map URL
in development exercises the fallback.

## Privacy and data

Your farm lives only in your browser (IndexedDB) as an append-only log of changes. There is
no server, no account, and no analytics. Map tiles are fetched from the imagery provider
chosen in Settings; nothing else leaves the browser. Export a copy from Settings.

## Deploy

A static build. The intended host is a Cloudflare Pages project connected to this repository:
build command `npm run build`, output directory `dist`, `NODE_VERSION=22`, and
`VITE_GOOGLE_MAPS_KEY` as a build variable. `public/_headers` sets the security headers;
the app uses hash routes so no redirects are needed. CI runs lint, tests, and the build on
every push and deploys `main` when the Cloudflare secrets are set.

## License

MIT, copyright (c) 2026 Threefold Farm. See [LICENSE](LICENSE).
