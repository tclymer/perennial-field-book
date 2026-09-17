# Perennial Field Book

Map your orchard, find every tree, keep its history. A companion to the
[Perennial Profit Planner](https://planner.theorganicorchard.org): the planner says what a
planting should earn, the field book records where everything is and what actually happened.

Status: iteration one (map, places, trees) in progress. The product design lives in
[DESIGN.md](DESIGN.md).

## Run it locally

```
npm ci
npm run dev        # http://localhost:5173
npm test           # unit and route tests
npm run build      # type-check and build to dist/
npm run preview    # serve the build
```

Node 22 or newer. `npm run lint` checks formatting; `npm run format` applies it.

Satellite imagery from Google needs a Map Tiles API key in `.env.local`:

```
VITE_GOOGLE_MAPS_KEY=...
```

Without it the map uses free public imagery. See DESIGN.md §8.6 for the key set-up and the
daily quota that keeps usage inside Google's free tier.

## Privacy and data

Your farm lives only in your browser (IndexedDB). There is no server, no account, and no
analytics. Map tiles are fetched from the imagery provider you choose in Settings; nothing
else leaves the browser. Export from Settings to keep a copy.

## License

MIT, copyright (c) 2026 Threefold Farm. See [LICENSE](LICENSE).
