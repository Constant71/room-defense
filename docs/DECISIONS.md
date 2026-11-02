# Decisions

## Milestone 1

- **Location.** Started inside the Neumann Probe repo, then moved to its own repository
  (history kept).
- **Spec.** There is no SPEC.md. Milestone 1 was built from the task description; the config
  file names are placeholders. Agreed design is kept in `docs/DESIGN.md`.
- **Game loop.** Fixed 60 Hz simulation step (`src/loop.ts`) with rendering once per display
  frame. On a 60 Hz projector that is exactly 60 fps; faster monitors render more often but the
  game still steps at 60 Hz.
- **Check panels are HTML**, layered over the PixiJS canvas, so text stays sharp at any
  resolution. `H` hides them.
- **No unit test runner yet.** `vitest` failed to install with npm 10.9 (`Cannot read properties
of null (reading 'edgesOut')`). `npm run check` currently means type-check + production build.
- **Screen picker needs two clicks** (open list, then pick a display) because
  `requestFullscreen({ screen })` must run directly in a click handler, and the permission prompt
  from `getScreenDetails()` uses up that click.

## Room editor

- **Calibration dropped.** The owner maps the room in the editor, so there is no separate
  calibration step. Surface corner pins (perspective warp) take its place.
- **Saving through the dev server.** A web page cannot write files, so a small Vite plugin
  (`tools/roomsApi.ts`) serves `GET/PUT /api/rooms/<file>` on localhost and writes
  `rooms/<file>.json`. It validates every file before saving and only accepts simple file names.
  It works under `npm run dev` and `npm run preview`.
- **The file name is fixed at first save** (made from the room name). Renaming a room later
  keeps the same file.
- **Paths stay on one surface**, and their spawn and goal must be on it too. Crossing from floor
  to wall can be added later if gameplay needs it.
- **Points are clamped to their surface** (0–1), so nothing can be drawn off the mapped area.
- **Tests.** vitest 4 hits an npm 10.9 install bug (`Cannot read properties of null (reading
'edgesOut')`), so the project uses vitest 3.2. It has its own `vitest.config.ts` because it
  bundles an older Vite.
- **Native Vite config loading.** The import chain from `vite.config.ts` uses `.ts` extensions
  and no TypeScript-only syntax, so Vite 8 can load it with Node directly.

## Readability on the projector

- **One text size setting** (`src/ui/uiScale.ts`), 100–300%, default 150%, saved in the browser.
  All panel CSS is in `rem`, so this one root font size scales the panels. The editor canvas
  scales its labels, lines, handles and click targets by the same factor.
- **Higher contrast:** the grey text is now near-white, all text is a heavier weight, the editor
  grid is brighter, and canvas labels have a black outline so grid lines don't cut through them.
- **Status bar:** in the editor, the current tool, its instructions and any warning are shown in
  a box on the side away from the panels. It stays visible when the panels are hidden.
- The projector panel hides itself once the game is fullscreen.
