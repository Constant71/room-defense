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
- **Paths can cross surfaces** (room file version 2). Each waypoint stores its own surface, so a
  path can run from the floor up a wall. The step between two surfaces is a straight line across
  the projected image. Version 1 files (one surface per path) are upgraded when opened.
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

## Phone editing

- **Opt-in network access.** Only `npm run dev:phone` (Vite mode `phone`) listens on the network
  (`0.0.0.0`); plain `npm run dev` stays on `localhost`.
- **PC is the authority.** The Editor runs only in the PC browser. Phones send small commands
  (pointer down/move/up in output space, tool changes, nudge...) and draw the state the PC
  sends back (~30 updates/s). This reuses all editor logic and means a phone can never write
  files directly.
- **Server is a relay** (`tools/remote.ts`, WebSocket on `/remote-ws`, using `ws`). The PC
  connection and `/api/remote/info` (which reveals the code) only accept this PC (loopback).
  `/api/rooms` is loopback-only too.
- **Pairing.** 6-digit code from `crypto.randomInt`, new each server start, compared in constant
  time; 5 wrong codes per address per minute locks that address out for a minute; unpaired
  sockets are closed after 30 s. A successful pairing returns a random 192-bit token that
  survives reconnects until the server restarts. The QR link carries the code in the URL
  fragment, which browsers never send to the server.
- **Untrusted input.** Every phone command is validated on the PC (`parseCommand`); unknown or
  malformed commands are dropped. Messages are capped at 512 KB.
- **Finger-sized hit areas.** Each phone press carries the finger radius, so the PC widens its
  hit test for that press only.
- **No dialogs on the projector for phone actions.** The phone asks "discard unsaved changes?"
  itself; saving over an existing file from the phone needs a second Save instead of a pop-up.
- **Plain HTTP on the home network.** Fine for a local game; nothing sensitive is sent and the
  code is short-lived. HTTPS would need certificates on every phone.
- **Known test quirk:** in the headless test browser, screenshots can show a transparent patch
  the size of the editor status box at the top-left. It is a headless compositing artifact (no
  element is there and the page background is opaque), not something drawn by the game.

## First playable

- **Rules are pure logic** (`src/game/sim.ts`): `Game.step(dt)` in fixed 1/60 s steps, no clock
  or graphics, so whole games run instantly in tests.
- **World units** are fractions of the image height (`src/game/world.ts`), using the aspect ratio
  the room was saved at. Enemies move along the path as drawn on the projected image,
  including the jump between surfaces, at a constant on-screen speed.
- **Balance is guarded by a test** (`test/balance.test.ts`): a simple bot that spends everything
  before each wave must win when it mixes tower types and must lose when it builds only one
  kind. Tuning was done with that bot: 20% more enemy health per wave was the sweet spot (18%
  was too easy, 22% too hard).
- **Controllers:** the first two connected pads are P1 (cyan) and P2 (magenta). Buttons act on
  press, not hold. The mouse is a third, optional player (white).
- **Leaving Play pauses** the game and coming back resumes it, unless the room changed. The
  panels hide during play so they don't cover the room.
- **No saves yet** (upgrades and sound came in the next phase).

## Upgrades and game feel

- **Upgrade prices were tuned with the balance bot.** Putting everything into 4 fully upgraded
  towers must lose; building around 10 towers and upgrading them must win. 15% cheaper upgrades
  made that too easy (17 of 20 lives left), the original prices made upgrading slightly worse
  than building; the shipped prices sit in between (4-8 lives left). Guarded in
  `test/balance.test.ts`.
- **Sound is synthesised** (`src/game/sound.ts`) instead of using audio files: nothing to license
  or download, and it fits the bright, simple look. Repeated sounds are rate-limited per kind and
  everything runs through a compressor so ten towers firing don't clip.
- **Browsers block audio until a key press or click.** Controllers don't count, so the sound
  starts on the first key/click (switching to Play with F2 is enough).
- **Rumble uses `vibrationActuator.playEffect('dual-rumble')`**, which Chrome and Edge support
  for Xbox controllers. It does nothing where unsupported.
