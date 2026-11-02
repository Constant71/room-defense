# Decisions

## Milestone 1

- **Location.** Room Defense lives in `room-defense/` as a standalone npm project, separate from
  the Neumann Probe monorepo at the repo root. It is not an npm workspace of the root.
- **Spec.** The Room Defense SPEC.md was not in the repository. Milestone 1 was built from the
  task description; config file names are guesses until the spec is available.
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
