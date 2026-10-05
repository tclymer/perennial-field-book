# What changed

One entry per release of Perennial Field Book, newest first. The version is shown in the app
under Settings. Each release is also a tag on GitHub (`v0.8.7` and so on), so the code as it
stood at any release can be looked at or compared with another.

## 0.9.0 (2026-10-05)

The week planner: what is on everyone's plate today, without a calendar.

- **Today** is the phone's home now. It shows today's tasks grouped by who does them (yours
  first, then each person, then Anyone), the Spinning Plates that are due, and a glance at
  the rest of the week. The app opens on it.
- **Put a task on a day** with the Plan chip on any task in the lists, the Day row on a
  task's page, or by dragging on the desktop's new **Week** view (a column per working day,
  with the lists down the side). The + on a day adds straight onto it.
- **Unfinished tasks roll to the next working day** on their own, with a small ↻ showing
  how far they slid. After three days one stops rolling and asks **Still on?**: keep it for
  today, or put it back in its list.
- **Anyone** marks a task nobody owns, with **I'll take it** to claim it. Tap a name to
  change who it is for. A task's page says who added it.
- **One tap checks off** a task on a day, logged as you, with Undo and **Add time** on the
  message. A project on a day is _Worked on it_: logged, and still open.
- **Rain day** pushes everything still open today to the next working day.
- Done tasks stay on their day, crossed out.
- The weekly review opens with **Plan the week**, and what slid the furthest.
- Settings: **Working days**, Monday to Friday unless you add the weekend.

Both phones need this version before planning: an older one would set the day changes
aside.

## 0.8.8 (2026-09-30)

- Spinning Plates: a **Done for the season** button on each plate puts it away until its
  season comes round again (kiwi pruning set to May to September, finished in August, comes
  back next May). A plate with no months set asks which month to bring it back. The plate's
  own page says when it returns and has "Bring it back now". Undo is on the message that
  appears.

## 0.8.7 (2026-09-29)

- This week (phone): every section has a **+** beside its title (Monkeys, Spinning Plates,
  Mini Tasks/Projects, Projects), which opens an add box for that list right where you are.
  The box stays open for another and closes with the same button. Something just added
  shows even if the list is longer than the eight it normally shows.
- Reorder tasks on a phone: hold the ⋮⋮ grip at the left of a task and slide it up or down.
  Works on This week (Monkeys and Mini Tasks/Projects) and on a task's subtasks.
- Mini Tasks/Projects and Projects now show on the week page even when empty, so there is
  somewhere to add the first one.

## 0.8.6 (2026-09-28)

- Map: side lengths in feet appear as a block outline, row, or area is drawn, live to the
  cursor, so a block not yet on the imagery can be drawn to dimensions you know. A row with
  a bend also shows its whole length. Lengths follow a corner being dragged in Reshape and
  show on a row or outline when it is clicked.

## 0.8.5 (2026-09-24)

- Varieties: traits, like "precocious" or "vigor: high", with suggestions from the same
  species. The list can be filtered by a trait, and traits go into the exports.
- Search finds varieties by their traits and their notes.

## 0.8.4 (2026-09-22)

- Tree page: three actions (Note, Photo, Grafted over to) in place of ten buttons, and one
  "dead or gone" control that asks whether the spot stays in the row. Marking a tree gone
  offers to plant a new one in its place.

## 0.8.3 (2026-09-22)

- This week (phone): add to any list, not only this week's, and see the small jobs and
  projects there.

## 0.8.2 (2026-09-21)

- Map: a new planting's row direction waits for the second corner to be clicked, fixing the
  rows that sometimes came out at a random angle.

## 0.8.1 (2026-09-21)

- Map: an edit session opens with the outline selected, so its corners are visible straight
  away.
- Sizes of blocks, buildings, and areas in the sidebar; small ones in square feet.

## 0.8.0 (2026-09-21)

- Certification records under Records: inputs applied, harvests, planting stock, and
  equipment and buffers for a season, each as a CSV, plus a printable summary sheet. It also
  lists gaps, like varieties with no source recorded.
- Buildings and areas can be reshaped, moved, and renamed after drawing, with a short
  description shown on the map and notes.

## 0.7.0 (2026-09-21)

- Records made by a newer version of the app on another device are kept safely rather than
  misread, and "Fetch everything again" in Settings recovers from a device that fell behind.

## 0.6.3 (2026-09-21)

- Fixed an older version of the app dropping details it did not recognise when syncing.

## 0.6.2 (2026-09-20)

- Map: clicking a tree picks the tree, not the block it stands in.
- Long lists (like recently deleted) load in pages instead of all at once.

## 0.6.1 (2026-09-20)

- Take a tree out from the map popup; row tree counts stay correct.
- Harvest containers per crop (pints, half pints, pounds, bins).
- A colour per fruit, with a picker and sensible defaults.

## 0.6.0 (2026-09-20)

- Take a spot out of a row (a dead tree, a rock) and the rest renumber.
- NFC tags: pair a tag with a tree, row, block, or building, then tap it with a phone to
  open that page.

## 0.5.4 (2026-09-20)

- Fixed Move trees and Reshape, which could silently refuse a shape.

## 0.5.3 (2026-09-20)

- Harvest offers a greenhouse as a place only when the crop has no block.

## 0.5.2 (2026-09-20)

- Map sidebar reworked to a single header layout.

## 0.5.1 (2026-09-20)

The first numbered release. Everything built up to here, in four iterations:

- **Map and trees:** imagery over the farm (saved for use without signal), blocks drawn as
  an outline filled with rows, loose trees, buildings and areas, a page per tree with its
  history and photos, varieties, the block grid, and a graft plan.
- **Sync:** Google sign-in, farms shared by invite link, and records and photos kept in step
  across devices, working offline.
- **Tasks and work logs:** the week page, lists (Monkeys, Mini Tasks/Projects, Long Term,
  Spinning Plates, Projects), the weekly review, and hours logged against places.
- **Harvest:** the weighing station, reports, and yield per tree.
- **Planner:** import from the Perennial Profit Planner, then compare a season's records with
  it and write corrections back.
- The version and build time are shown in Settings.
