# Farm Manager: design notes

Working title. Companion to the Perennial Profit Planner (`../crop-profit-analysis/app`).
Status: brainstorm in progress. Started 2026-09-16. This document is the source of truth for
what the tool is, what it is not, and what has been decided. Update it as decisions change.

---

## 1. Purpose

The planner answers "should we plant this and what will it earn". This tool answers the three
questions the planner cannot:

1. **Where is everything?** Blocks, rows, individual trees, and the structures and areas
   around them, on a map.
2. **What needs doing?** The farm's running task list, recurring care, projects, and
   long-term items.
3. **What actually happened?** Work logs, harvests, and tree histories, captured with almost
   no effort, so that real labor and yield can be compared against the planner's estimates and
   so that organic certification records exist without a separate effort.

**The fence.** A feature belongs only if it helps lay out, find, work on, or measure the farm's
plantings, or run the task list that keeps the farm going. Anything else is out, however
useful it might be to a farm.

**Non-goals** (explicitly out, at least until the core is proven):

- Sales, invoicing, accounting, point of sale (a POS system covers this).
- Payroll and timesheets. Hours are for analysis and records, never for pay.
- Equipment maintenance, inventory, parts, fuel.
- Structure maintenance schedules. Structures are places where work happens, nothing more.
- Irrigation control, sensors, weather stations, IoT of any kind.
- Timers and background location tracking (see §4).
- Multi-variety trees (one variety per tree; a topworked tree changes variety, it does not add
  one).

---

## 2. Decisions so far

| Date | Decision | Why |
|---|---|---|
| 2026-09-16 | Public tool, piloted at Threefold Farm. | Same posture as the planner. The model must serve pome and stone fruit orchards too, not only Threefold's crops. |
| 2026-09-16 | One web codebase, installable PWA. Phone-first capture screens; desktop for layout, review, and reports. | Two devices, two people, one of whom may rarely use the phone. No native app. |
| 2026-09-16 | Local-first. Every write is an immutable event. Devices sync by exchanging events through a pluggable adapter. Google Drive is the first adapter. | Keeps the self-contained feel of the planner, avoids hosting other farms' data, makes two-phone sync conflict-free. See §8. |
| 2026-09-16 | No timers. No background GPS. | Remembering to start and stop a timer is a non-starter, and web apps cannot read location with the screen off. |
| 2026-09-16 | Task buckets mirror the existing Google Keep structure. | It already works. Do not invent a taxonomy. See §3.3 and §12. |
| 2026-09-16 | A work log is the side effect of checking a task off. One optional duration chip and a people chip. | This is the "mostly automatic" answer. |
| 2026-09-16 | Weekly review instead of a daily nudge. Evening notifications are annoying. | User preference. |
| 2026-09-16 | Recurring items are a standing list, sorted by how long since last done, active within a season. An interval is optional and only affects sorting and a "due" hint. | Care work follows the plant and the weather, not the calendar. Nothing nags. |
| 2026-09-16 | Long-term items are undated but can carry a season tag ("before cold weather", "late fall"). | Weather-dependent jobs like painting and burning. |
| 2026-09-16 | One log can have several people. Labor hours = duration × people. | Both owners often work a task together. |
| 2026-09-16 | Structures and named areas are places, and most tasks target one of them or nothing at all. That is expected. Their hours allocate to overhead. | The Keep note shows about half of all tasks target a barn, greenhouse, or area, and a quarter target nothing. Only a quarter target a planting. |
| 2026-09-16 | Map and places are iteration one. Placement by eye on satellite imagery. | Plantings are old enough to be visible from above. Cut and dried compared to tasks. |
| 2026-09-16 | Tree id = block code + row + position, e.g. `PP1-3-12`. Row and position numbering convention stored per block. | Rows are not physically labeled today; a scheme is needed. Some blocks run east-west, some north-south. |
| 2026-09-16 | Keep the legible metal tags. NFC or QR tags are an optional confirmation layer that opens the tree page. | Legibility matters when collecting scionwood. Phones read NFC, not UHF RFID. |
| 2026-09-16 | A graft plan is part of the model: planned variety per position for a coming year, converted to a graft event when done. | The "Graft List 2027" in Keep is tree-level layout planning and belongs on the map, not in a note. |
| 2026-09-16 | Harvest is logged the way the boxes are labeled: variety + block + weight, or per tree in trial blocks. Units per crop (lb, half pint). | Matches the current paper record. |
| 2026-09-16 | Planner link is a side-by-side comparison with an explicit "push actuals to planner" action. | Keep the apps separate; share ids and a JSON exchange. |
| 2026-09-16 | Phenology and observations are not first-class. A dated note or photo on a tree covers it for now. | Would clutter the interface. Revisit if notes prove insufficient. |
| 2026-09-16 | "Catch up activities" folds into `now`. "Farm Trials" is a project (or several). | Catch-up was a post-vacation Monkeys list, not a standing bucket. |
| 2026-09-16 | In trial blocks, harvest is logged per variety within the block and split equally across that variety's trees to derive per-tree yield. No per-tree harvest entry. | Simplicity. A variety in the persimmon block is often a single tree anyway. |
| 2026-09-16 | Iteration one draws the six planner blocks plus jujubes. Citrus in the gray house is many single-variety trees and can be added later as loose positions inside the greenhouse. | User's call on scope. |
| 2026-09-16 | The basemap is a configurable tile source. Presets: Pennsylvania's PEMA imagery, Esri World Imagery, USGS, MapTiler, any custom XYZ or WMS URL. Google is not a preset. | Google forbids offline caching and needs a billing account; the unofficial keyless endpoint other hobby tools use is unlicensed. See §8.1. |
| 2026-09-16 | Imagery compared over the farm: Google is the most recent and the only source with zoom 20; PEMA is the sharpest per pixel but 2018–2020; Esri is good at zoom 19; USGS is unusable. | Measured, not assumed. See §8.4. |
| 2026-09-16 | Google satellite imagery through the official Map Tiles API is the default online basemap, on desktop and phone. A Google Cloud billing account is accepted. Usage is held inside the free tier by a hard daily quota in the Cloud console, never by hoping. | Most consistently current imagery, and what people already know from their phones. The card on file must never be charged by accident. See §8.6. |
| 2026-09-16 | When Google tiles are unavailable (daily quota reached, offline, or an error), the map falls back automatically to a free source (PEMA in Pennsylvania, Esri elsewhere) or to drawn features over a plain background. Google tiles are never stored by the service worker. | Google's terms forbid caching; the quota is a soft ceiling on Google, not on the app. |
| 2026-09-16 | If the tool takes off, revisit paid Google usage or a bring-your-own-key option. Add a donation link on the About page at some point. | User's call. Not iteration one. |

---

## 3. Domain model

Everything is plain JSON, validated with zod, materialized from an event log (§8).

### 3.1 Places

```
Farm
├── Block            code, name, plannerPlantingId?, numbering convention, outline?
│   ├── Row          number, polyline, tree count (or spacing), default variety?, start end
│   │   └── Position index, coordinate (generated, may be nudged)
│   └── Position     loose positions for blocks without rows (yard trees, trial spots)
└── Feature          name, kind (building, greenhouse, area, fence, windbreak, other),
                     point or polygon
```

- **Block.** A named group with a short code. It may contain rows, loose positions, or both.
  A block called "Yard" with code `Y` and loose positions `Y-1`, `Y-2` holds the trees by
  buildings. A block may link to one planner planting; the six current planner plantings are
  six blocks. Older plantings that the planner does not model (elderberries, jujubes, the "old
  berry" rows, the windbreak) are blocks too, with no planner link.
- **Row.** A polyline drawn over the satellite image, with a vertex wherever the row turns.
  Each row has its own length. Positions are generated along the line from the tree count
  (spacing derived) or from a spacing (count derived). Individual positions can be nudged.
  A row may have a default variety; trees inherit it unless overridden, which handles both
  single-variety rows and half-and-half rows.
- **Numbering convention, per block.** Rows are numbered from a chosen side (e.g. from the
  west for north-south rows, from the north for east-west rows). Positions are numbered from
  the row's start end (e.g. the road end). The convention is stored on the block and shown on
  every tree page ("row 3 starts at the road end").
- **Feature.** Barns (berry, black, goat, green, run-in), greenhouses (gray house, blue house),
  the compost and wood chip area, the back property, the windbreak, fence lines. A feature is
  a map landmark and a place a task, log, or harvest can point at. A greenhouse can contain a
  block (Gray House Figs, Blue House Figs). Features carry no schedules, inventories, or
  maintenance records of their own.
- **Area.** Each block has an area, taken from the planner planting when linked, otherwise
  computed from rows (length × row spacing) or a drawn outline. Used to split farm-wide labor.

### 3.2 Trees, varieties, and the graft plan

- **Variety.** Species, name, aliases, scion source (where it was ordered from), notes.
- **Tree.** Occupies one position. Fields: variety, status (alive, struggling, dead, removed),
  planted date, grafted date, first fruit year, rootstock (optional; Threefold ignores it,
  pome and stone fruit farms will not), notes.
- **Tree history.** A list of dated events: planted, grafted to variety X, died, removed,
  scionwood collected, note, photo, status change. The current variety is derived from the
  latest graft. Replacing a dead tree creates a new tree record in the same position; the
  position's page shows both, so "what has happened at PP1-3-12 since 2019" is one screen.
- **Tree id.** The position label (`PP1-3-12`). Stable for the life of the position.
- **Graft plan.** A planned graft is `{ year, varietyId, positionId }`. Plans are made on the
  block grid or the map by painting a variety onto positions ("Gwang Yang, whole row, first old
  berry south row"). The plan shows as a hatched overlay, produces a count per variety (the
  scionwood order), generates the "stake and ribbon" task, and each entry converts to a graft
  event with one tap when the graft is done. Unfulfilled plans roll to the next year.

### 3.3 Tasks

| Field | Notes |
|---|---|
| title | The only required field. |
| bucket | `now` (Monkeys), `soon` (Mini Tasks/Projects), `later` (Long Term), `recurring` (Spinning Plates), or a project. A farm can rename buckets; the defaults are Threefold's. |
| project | Optional parent. A project is a task with subtasks and its own page ("Solar punch list", "Greenhouse changes before fall"). Buckets can hold projects. |
| season | Optional tag: a month range or a phrase ("late fall", "before cold weather", "as trees go dormant"). Surfaces in the weekly review when the window opens. |
| recurring | Optional `{ intervalDays?, seasonMonths? }`. See below. |
| targets | Zero or more places (block, row, tree, feature), or `farm` (whole orchard). |
| category | See §3.5. Inferred from the title when possible. |
| owner | Optional person. Parsed from "(Tim)", "(mostly Tim)", or a trailing "- Tim". |
| needsDiscussion | Optional flag, inferred from a trailing "?" or "needs discussion" or "question for". The weekly review lists these separately. |
| estimatedMinutes | Optional. Becomes the default log duration for recurring tasks. |
| subtasks | Optional checklist. |
| notes | Free text. Parentheticals, links, and material lists from the title land here. |

**Recurring (Spinning Plates).** A standing list of things to keep up with: train kiwis, graft
care, water the gray house, train figs, water the pomegranates, mow over the figs. Checking one
off logs an occurrence and leaves it on the list, showing "last done 3 days ago". The list
sorts by staleness. An optional interval adds a "due" hint and moves the item into This Week.
An optional season greys the item outside it. Nothing nags, and a taper in fall needs no
configuration: you just do it less often.

**Title parsing** is rule-based, no model call. It recognizes block, row, tree, feature, and
variety names; row ranges ("rows 1-4"); category keywords; season phrases; owners; and
questions. "prune pawpaw block 1 rows 1-4" lands with targets and category filled. "Hang
electric backup heaters in gray house (late fall after fig harvest)" lands with the gray house
as target, season late fall, and the parenthetical in notes.

**Keep import.** Paste the note. Indentation is usually lost in a paste, so the importer guesses
headings (known bucket names, lines ending in "list", lines followed by several items) and
shows each guessed heading with a choice: bucket, project, or plain task. Confirm, and the
whole list lands at once.

### 3.4 Work logs

| Field | Notes |
|---|---|
| date | Defaults to today. |
| people | One or more. Defaults to the current user. Hours = duration × people. |
| durationMinutes | From a chip: 15m, 30m, 1h, 2h, half day, day. Editable. |
| category | From the task, or chosen. |
| targets | Places, `farm`, or none. From the task. |
| taskId | When created by completing a task. |
| materials | Optional list: product, rate, amount, unit, lot. Shown only for spraying and fertilizing, or on request. This is the organic input record. |
| notes | Free text. |

**Allocation is computed at report time, not at entry.** A log records facts. Rules turn
facts into planting-level hours for the planner comparison:

- a named block, row, or tree → that block;
- `farm` → split across blocks by area (mowing, weeding);
- a feature or no target → overhead (barns, solar, drainage, organization), compared against
  the planner's overhead assumption rather than against any planting.

Default rules per category live in settings and can be changed retroactively.

### 3.5 Categories

Aligned with the planner's labor cost items so the comparison is a straight join:

pruning · trellising and training · fertilizing · mowing · weeding · spraying · watering ·
planting · grafting · greenhouse work · harvest · construction · maintenance · organization ·
admin · other

The planner splits winter and summer pruning; the comparison maps pruning hours by month
(roughly November through March = winter). A farm can add categories. The last five are
overhead categories that the Keep note shows are most of the farm's task volume.

### 3.6 Harvest logs

| Field | Notes |
|---|---|
| date | |
| crop | Species. Determines the unit (lb for pawpaws, persimmons, kiwi berries; half pint for figs). |
| variety | Required for production rows. |
| block | Optional but encouraged; the box label can carry it. |
| row / tree | Optional. Used in trial blocks and test rows. |
| quantity, unit | |
| people | Optional. |

A harvest session is a date plus a crop; entries are added rapidly one box at a time. Yield
by variety, by block, by year, and variety-across-blocks (Shenandoah in PP1 versus PP2) are all
group-bys over this table. Rows roll up to variety automatically because trees carry variety.

**Trial blocks.** Harvest is still entered as variety + block. Per-tree yield is derived by
splitting the quantity equally across the living trees of that variety in that block. A
variety with one tree in the block is therefore tracked per tree with no extra effort. The
tree page shows its derived share by year.

### 3.7 People

Name, active flag. Every device has a current user. Logs default to that person and can be
switched with one tap, which covers the owner who will not carry the phone.

---

## 4. Phone experience

The phone is for capture and for finding things. Five screens, each one job.

1. **This week.** The `now` bucket, recurring items that are due, and overdue items. Big
   checkboxes. Tapping done opens the two-chip sheet (duration, people) and files the log.
   A recurring task with an estimated duration logs with zero extra taps.
2. **Quick add.** One text box at the top of every list. Dictation works. The parser fills
   place and category. Nothing else is asked.
3. **Weekly review.** Runs whenever you open it, typically once a week, no fixed day. It shows:
   what got done, what is still in `now` (keep, push to `soon`, push to `later`), recurring
   items that are stale, `later` items whose season has opened, items flagged for discussion,
   and "anything you did this week that isn't logged?" with chips suggested from the list and
   the season. An optional weekly reminder on a chosen day, off by default.
4. **Tree page.** Reached by NFC tap, QR scan, map tap, or search. Shows variety, status,
   history, photos, planned graft if any, and the block's numbering convention. One-tap
   actions: collected scionwood, grafted to…, died, note, photo.
5. **Harvest.** Pick crop, then rapid entry of variety + block + quantity per box, with totals.
   Recent varieties and blocks appear as chips. In trial blocks, tap the tree (or its tag) then
   enter quantity.

The map is also available on the phone, with a GPS dot for "which row am I in", but layout
editing is a desktop job.

### Tags

- Phones read **NFC** (NTAG213/215/216), not UHF RFID. Outdoor-rated laminated tags cost tens
  of cents each; metal-backed tags that work when stuck to the existing metal tag cost a dollar
  or two. Read range is about an inch, so it confirms a tree rather than locating it.
- The tag holds a URL to the tree page. Reading needs no app on either platform. Writing tags
  is done once with a free NFC writer app (or in-app on Android Chrome).
- Print the tree id and a QR code on the same laminate as a fallback. Keep the metal tags.
- Open question: tag URL format for a public tool (§10).

---

## 5. Desktop experience

- **Map editor.** Satellite basemap. Draw a block outline, draw rows as lines over the visible
  trees, set the count, adjust. Place loose trees and features by click. Rotate the map so
  rows read straight. Layers: block outlines, rows, trees colored by variety or status or last
  activity or planned graft, features, labels.
- **Block grid view.** A schematic of one block: rows as columns, positions as cells, colored
  by variety, status, last pruned, harvested, or planned graft. Better than the map for seeing
  patterns and for bulk edits ("row 3 positions 1-10 are Shenandoah", "paint Gwang Yang onto
  this row for 2027").
- **Tasks board.** Buckets as columns. Projects page with subtask checklists. Recurring list
  with last-done. Discussion list.
- **Search.** One box across trees, varieties, rows, blocks, features, tasks. "Shenandoah"
  returns every row and tree of it, grouped by block.
- **Reports.** Hours by category, block, month, person. Harvest by variety, block, year.
  Tree list with filters. Graft plan by variety with counts. Certification exports (§7).
  Planner comparison (§6).
- **Data.** Full JSON export and import. CSV of logs, harvests, trees.

---

## 6. Planner link

- **Linking.** Import a planner backup file. Each block picks a planting id (or none).
  Categories map to the planner's labor cost items through a small editable table.
- **Hours comparison.** Per planting, per category, per month: planner estimate (from cost item
  hours per row × rows, timed by the planner's task calendar) beside logged hours after
  allocation. Farm-wide categories split by area. Overhead hours × loaded wage beside the
  planner's overhead assumption. Expect overhead to be the surprise: the task list is mostly
  barns, solar, fences, drainage, and organization.
- **Yield comparison.** Harvested quantity per planting beside the planner's expected yield for
  that year (mature yield per plant × plants × ramp fraction).
- **Push actuals.** The planner stores per-year actuals as a fraction of mature yield
  (`YearActual { year, yieldRealization, note }`), entered by hand in its planting editor
  today. The manager computes that fraction as `harvested / (maturePerPlant × plantsPerRow ×
  rows)`. Three ways to get it across, in order of effort:
  1. The manager shows the fraction per planting and it is typed into the planner. Works today.
  2. The manager writes a full planner backup with actuals inserted, and the planner restores
     it. Overwrites any planner edits made since the backup was taken, so it is fragile.
  3. The planner gains a small "import actuals" action that merges only the actuals from a
     file the manager exports. The right answer for iteration five; a modest planner change.
- **Seed seasonal tasks.** The planner's task calendar (cost item + months) can generate
  `later` tasks per block with a season tag, e.g. "Winter pruning, Pawpaw Block 1, Jan–Feb".

---

## 7. Certification records

Threefold is not currently certified but was, and the certifier asked for input logs, harvest
logs, planting stock sourcing, buffer zones, and equipment cleaning. The tool produces these
from records it keeps anyway:

- **Input application log:** work logs with materials, target, date, person. Optional weather
  snapshot on spray logs (later).
- **Harvest log:** harvest logs.
- **Planting stock:** variety source and tree planted date.
- **Equipment cleaning, buffer zones:** categories and notes, if a farm wants them. Not
  first-class.

Exports: date-range CSV and a printable summary.

---

## 8. Architecture

### 8.1 Stack

Same as the planner where it fits: React 19, TypeScript, Vite, Tailwind 4, zustand,
react-router, vitest, vite-plugin-pwa. Static hosting on Cloudflare Pages.

New pieces:

- **MapLibre GL JS** for the map. Vector rendering, thousands of points, rotation to align
  with rows. Draw tools for lines and polygons.
- **Imagery.** Google satellite tiles through the Map Tiles API are the default basemap
  whenever the device is online and the daily quota has room (set-up and quota in §8.6). The
  basemap is still a configurable raster source with presets, because the app needs a
  fallback the moment Google is unavailable, and because the layout is traced once against the
  sharpest imagery and the drawn geometry is the truth after that. Presets, as measured over
  Threefold on 2026-09-16 (§8.4):
  - **PEMA / PASDA Pennsylvania orthoimagery**: 15 cm imagery flown 2018–2020, free, keyless,
    from `apps.pasda.psu.edu` (`PEMAImagery2018_WEB/MapServer`). Cached tiles to zoom 19
    (0.3 m per pixel) in the standard web tiling scheme, so it works as an XYZ source. The
    `export` endpoint renders the native 15 cm data at any size, and individual plants are
    visible along the rows. The catch is vintage: anything planted or built after 2020 is
    missing. Other states publish similar services; the preset list should grow as farms ask.
  - **Esri World Imagery**: zoom 19 available over the farm (0.3 m), zoom 20 not. Date
    unknown but different from both PEMA and Google. 2 million free tiles per month with a
    free ArcGIS Location Platform account and a referrer-restricted key, MapLibre-native.
    Sensible default outside Pennsylvania.
  - **USGS National Map imagery**: cached only to zoom 16 near the farm (2.4 m per pixel).
    Useless for trees here. Kept only as a coarse, keyless fallback for the overview.
  - **MapTiler**: a farm pastes its own key.
  - **Custom XYZ or WMS URL**, for a state service or a farm's own drone orthomosaic. A farm
    can point this at anything it chooses; the app ships no unlicensed sources itself.
  - **Google (default)**: the most recent imagery over the farm and the only source with
    zoom 20 (0.15 m). Used only through the licensed Map Tiles API (§8.6), with the Google
    logo and the attribution text the API returns kept visible. Its terms forbid pre-fetching
    and caching, so Google tiles never enter the service worker cache; ordinary browser HTTP
    caching of tiles already viewed is fine. Other hobby tools, the orchard planner at
    orchard-planner.pages.dev among them, instead load `mt1.google.com/vt/lyrs=s` directly in
    Leaflet with no key and the attribution hidden. That endpoint is undocumented, unlicensed
    for this use, and can be cut off at any time, so this app does not ship it. Google's
    public-benefit credits (checked 2026-09-16) go only to verified nonprofits, news media,
    crisis responders, transit agencies, and similar, and every production key needs a
    billing account regardless; there is no program for free tools run by individuals or
    businesses.

  **Fallback order.** Google while online and under quota; otherwise the farm's chosen free
  preset (PEMA in Pennsylvania, Esri elsewhere) from the service worker cache if it has the
  area, or live if online; otherwise the drawn blocks, rows, trees, and features over a plain
  background, which is still enough for "which row am I in" with the GPS dot. The switch is
  automatic, with a one-line notice such as "Google imagery limit reached for today".

  **Caching policy, per source.**
  - *Google:* only the browser's ordinary HTTP cache, honoring whatever cache headers Google
    sends on each tile. The app never pre-fetches, never writes Google tiles to the service
    worker cache or IndexedDB, and never serves them offline. Google's terms name
    pre-fetching, storing, caching, and offline use as prohibited, and this is the line
    between a licensed integration and the hobby-tool shortcut.
  - *Free public sources (PEMA, USGS, other state imagery):* "fetch once for the farm". A
    "Save map for offline" action pre-fetches the farm's extent at the zooms that matter into
    the service worker cache and keeps it indefinitely. The app records the source and vintage
    and offers a refresh when the source publishes a newer collection (every two to four years
    for PEMA). Confirm each source's license when adding its preset; state and federal
    orthoimagery is generally published for unrestricted public use.
  - *Esri:* to be checked. If offline caching is not permitted, Esri behaves like Google.
  - *A farm's own imagery* (a drone orthomosaic, a purchased image): stored permanently, the
    farm owns it. This is the best offline basemap a farm can have and the only way to get
    imagery sharper and newer than Google's, so importing a GeoTIFF or a pre-tiled folder is a
    later candidate.
- **Dexie** (IndexedDB) for the local event log, materialized state cache, and outbox.
- **Google Identity Services + Drive REST API** for the Drive sync adapter. `drive.file`
  scope only (non-sensitive, no verification burden).
- **zod** schemas shared by events, state, and exports.

No server. The optional exception is a tiny token-refresh Worker (§8.4).

### 8.2 Event log

- Every change is an event: `{ id, farmId, deviceId, ts, type, payload }`. Logs, harvests,
  tree events, task edits, place edits, deletions (tombstones). Events are never modified.
- State is materialized by applying events in `(ts, deviceId)` order. Mutable entities use
  last-writer-wins per field. Appends never conflict.
- The local store holds all events plus the materialized state. The outbox is the set of local
  events not yet uploaded.
- Full export is the event log plus a state snapshot. Import replays.

### 8.3 Sync adapter

```
interface SyncAdapter {
  push(events: Event[]): Promise<void>
  pull(since: Cursor): Promise<{ events: Event[]; cursor: Cursor }>
  putBlob(id, bytes): Promise<void>      // photos, resized client-side to ≤1600 px
  getBlob(id): Promise<Uint8Array>
}
```

Sync runs on open, after each write when online, and every few minutes. It is never required:
a single device works with no adapter at all, exactly like the planner.

**Drive adapter.** One folder per farm in the owner's Drive. Each device appends small batch
files under `events/<deviceId>/`. A periodic snapshot file lets a new device catch up without
reading every batch. Photos live in `photos/`. To share: the owner shares the folder with the
other person in Drive as usual; the other person's app "joins" the farm by picking that folder.
Each person signs in with their own Google account.

**Hosted adapter (later, optional).** A Cloudflare Worker with D1 and R2 for farms that would
rather not use Drive. Cloudflare's free tier (100k requests/day, 5 GB D1, 10 GB R2) covers a
single farm indefinitely and would likely cover many. The cost is not money but custody: the
operator holds every farm's data, runs accounts, backups, and migrations. Not planned until
someone asks.

### 8.4 Risks to spike early

1. **Google sign-in inside an installed PWA on iOS.** Popup-based token flows are known to
   misbehave in standalone mode, and browser-only tokens expire hourly. Verify sign-in and
   silent refresh on an installed iOS PWA and on Android. If it is unreliable, the fallback is
   a roughly fifty-line Worker that only exchanges and refreshes tokens (holds the client
   secret, stores no data). That keeps the app serverless in every way that matters.
2. **`drive.file` visibility across accounts.** Confirm that files the app created under
   account A and shared with account B are listable by the same app under B. If not, the
   Picker-based join flow grants access explicitly and is the fallback.
3. **Imagery comparison.** Done 2026-09-16 with the same zoom-19 tile over the farm from
   each source (about 76 m across). Google: sharp, most recent, zoom 20 available. PEMA:
   sharpest per pixel at native resolution, individual plants visible, but 2018–2020 vintage;
   the area east of the old rows has changed since. Esri: sharp at zoom 19, no zoom 20,
   vintage unknown. USGS: zoom 16 only, unusable for trees. Decision: Google by default (§8.6).
   Still open: Esri's terms on offline tile caching.
4. **Map Tiles API in the browser.** Stand up the key and quota per §8.6, render Google
   satellite tiles in MapLibre with the session flow, show the attribution, then prove the
   guard rails: confirm the Websites key restriction is honored, set the daily quota to a tiny
   number temporarily, exhaust it, and confirm the map falls back to the free preset with a
   notice and no billing.

### 8.5 Routes for tags

`/#/t/<treeId>` opens the tree page in the currently open farm. If the phone has no farm open
it prompts to join one. Tags are written once, so this format must not change.

### 8.6 Google Map Tiles API: set-up, quota, and use

**How the API works** (checked 2026-09-16). The browser POSTs to
`https://tile.googleapis.com/v1/createSession?key=KEY` with `{ mapType: "satellite",
language: "en-US", region: "US" }` and gets a session token valid for two weeks; the app keeps
it in local storage and renews it on expiry. Tiles come from
`https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session=TOKEN&key=KEY`, 256 px, and plug
into a MapLibre raster source. A `viewport` request for the visible bounds returns the
attribution text to display and the maximum zoom available there; session and viewport
requests are free and do not count against quota. Every tile request is one billable event.
The Map Tiles 2D SKU is in the Essentials tier with 100,000 free requests a month. Google's
own default ceiling is 15,000 tiles a day, which is far above the free tier, so it must be
lowered.

**One-time set-up checklist.**

1. Create a Google Cloud project for the app and attach the billing account.
2. Enable only the Map Tiles API. Nothing else.
3. Create one API key. API restriction: Map Tiles API only. Application restriction:
   Websites, listing the app's domain and `localhost` for development. Spike: confirm the
   Websites restriction is honored for tile and session requests made from the browser; if
   Google only honors IP restrictions for this API, the quota cap below is the real guard and
   the key is treated as public.
4. In Google Maps Platform → Quotas, set the Map Tiles API daily request quota to **3,000**
   (100,000 free per month ÷ 30 days is 3,333). This is the hard stop: when it is reached, tile
   requests fail for the rest of the day and nothing is billed. Lower it further if the free
   tier changes.
5. Set a Cloud Billing budget alert at $1 as a second signal. Alerts notify; only the quota
   prevents charges.
6. Put the key in the app's build configuration, not in the repository.
7. Before trusting the cap, set it to a tiny number such as 50, use the map until Google
   refuses, confirm the fallback imagery and notice appear and the billing page shows zero,
   then raise the cap to 3,000.
8. Once a year, re-check Google's free monthly allowance for the Map Tiles 2D SKU and lower
   the daily cap if the allowance has dropped. Nothing else about this set-up needs
   attention.

Tim will be walked through these steps in the console when the set-up spike happens.

**Quota math.** A desktop tracing session over a block is a few hundred to two thousand
tiles. A phone opening the map is twenty to fifty tiles, less with browser caching. One farm
with two phones uses a few hundred tiles a day. The 3,000 cap therefore covers Threefold with
room to spare and roughly five to ten active farms before the fallback starts kicking in
during the afternoon. That is the signal to revisit: a paid tier, a bring-your-own-key option
per farm, or asking users to donate. The app must degrade gracefully at the cap (§8.1
fallback order), never break.

---

## 9. Iterations

Each iteration is usable on its own.

1. **Map and places.** Draw blocks, rows, loose trees, features on satellite imagery.
   Numbering convention. Tree pages with history events, photos, search. Block grid view.
   Graft plan painting. Tree-page route for tags. Single device, no sync. **In parallel:** the
   three spikes in §8.4, time-boxed, because their outcome could change §8.
   *Done when:* the whole orchard is drawn, every tree is findable by id, variety, or map, and
   the 2027 graft list lives on the grid.
2. **Sync.** Drive adapter, join flow, outbox, photos. Two phones see the same farm.
3. **Tasks and logs.** Buckets, quick add with parsing, Keep import, done-sheet with chips,
   standing recurring list with season, projects with subtasks, weekly review, people,
   discussion flag.
   *Done when:* Google Keep is retired.
4. **Harvest.** Sessions, rapid entry, per-tree entry, yield reports by variety and block.
   *Done when:* paper harvest records are retired.
5. **Planner comparison.** Linking, category map, hours and yield comparison, push actuals,
   seasonal task seeding. May need a small import feature on the planner side.
6. **Certification exports.** Materials on logs, date-range exports.
7. **Later candidates.** NFC tag kit and printing, weather snapshot on spray logs, voice
   entry parsed to a log, Bluetooth scale, box labels with QR for harvest entry, a donation
   link on the About page, a bring-your-own-Google-key option per farm if the shared quota
   gets tight, import of a farm's own drone orthomosaic as a permanent offline basemap.

---

## 10. Open questions

- **Farm-wide split.** By area, or by row-feet? Area is the default.
- **Esri offline caching terms.** Whether Esri World Imagery tiles may be cached by the
  service worker for offline use. If not, PEMA is the offline source in Pennsylvania and
  farms elsewhere get drawn features over a plain background when offline.
- **Donation platform.** GitHub Sponsors, Ko-fi, or similar, for the About page. Later.
- **Tag URL format** for a public tool: tree id only (resolved in the open farm) versus a farm
  id in the URL. Tree id only is simpler and is the current plan.
- **Name** for the tool.
- **Planner-side change** for merging actuals: an "import actuals" action on the planner is
  the plan for iteration five (§6). Confirm when that iteration starts.

---

## 11. Reference: the planner's shape

From `../crop-profit-analysis/app/src/model/types.ts`:

- `Planting` has `geometry { rowLengthFt, rowWidthFt, inRowSpacingFt, rows }`, `yield
  { maturePerPlant, unit, unitsPerHarvestHour }`, labor `costItems` (isLabor, hours per row),
  `taskCalendar [{ costItemId, months }]`, `harvestWindow`, `yieldRamp`, and
  `actuals [{ year, yieldRealization, note }]`.
- Labor items are consistent across Threefold's six plantings: plant, trellis, weeding,
  winter pruning, summer pruning, trellising, fertilizing, mowing, spraying, greenhouse work,
  trimming.
- Units in use: lb (kiwi berries, pawpaws, persimmons), half pint (figs).

---

## 12. Reference: what the Keep note showed (2026-09-16)

The current Google Keep task note, pasted flat, had about 53 top-level items and 11 subtasks
under these headings: Catch up activities, Solar punch list, Monkeys, Mini Tasks/Projects,
Spinning Plates, Greenhouse Changes Before Fall, Long Term, Farm Trials, Graft List 2027.

What it taught the design:

- **Targets.** Roughly a quarter of items point at a planting (train kiwis, train figs, mow
  over figs, graft care, pawpaw and persimmon plastic, elderberry posts, jujube removal, the
  windbreak). About half point at a barn, greenhouse, or area. A quarter point at nothing
  (orders, research, a planning meeting, a burn day). Features must be first-class targets and
  "no target" must be normal. Hence the overhead allocation rule.
- **Projects.** Two headings were really projects with subtasks (solar, greenhouse changes),
  and a few single lines were mini projects (build and hang barn doors).
- **Owners** appear as "(mostly Tim)", "(Marissa)", "- Tim", "question for Kat".
- **Seasons** appear as free text: "fall task as trees go dormant", "late fall, early winter",
  "late fall after fig harvest", "before cold weather", "Before Fall".
- **Questions** appear as a trailing "?", "(Needs discussion)", or "question for". Hence the
  discussion flag and its place in the weekly review.
- **Recurring** items had no intervals at all. They are things to keep up with, not schedules.
  Hence the standing-list model.
- **The graft list** is layout planning by variety, count, and row ("whole row, 1st old berry
  south rows"). Hence the graft plan on the grid, and the need for blocks the planner does not
  know about.
- **Notes** carry links, material questions, and alternatives in parentheses. The parser moves
  these to notes rather than leaving them in titles.
