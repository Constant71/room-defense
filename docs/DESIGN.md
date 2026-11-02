# Room Defense design

There is no separate spec. This file records what has been agreed so far and is updated as
each milestone is decided.

## Game

- Local two-player tower defense, projected onto a real room. Windows PC, runs in Chrome or
  Edge from `npm run dev`. No server hosting or networking.
- Bright colours on black only: dark colours vanish on a projector.
- Each player uses an Xbox controller. The PC mouse and keyboard are for setup.

## Milestones

1. **Project skeleton (done).** Fullscreen 60 fps canvas, projector fullscreen with display
   picker, test pattern, controller, mouse and keyboard checks.
2. **Calibration (dropped).** Mapping is done in the room editor instead.
3. **Room editor (done).** See below.
4. **Phone editing (done).** See below.
5. Next: not decided yet.

## Room editor

- The room is mapped **in the editor, directly on the projected image**, using the mouse.
- A room has one or more **surfaces** (floor, wall, table...). Each surface is a four-corner
  pin with a perspective warp, so it can match a floor or wall seen at an angle.
- On each surface you place:
  - **spawns** (where enemies enter) and **goals** (what they attack);
  - **enemy paths**: fixed routes from a spawn, through waypoints, to a goal. Enemies follow the
    drawn path, with no pathfinding. A path stays on one surface;
  - **build zones**: polygons where towers may be placed;
  - **blocked areas**: polygons to keep clear (furniture, a TV, doors).
- Everything is stored in surface coordinates, so re-pinning a surface's corners after the
  projector moves re-aligns its whole layout.
- A room is playable when it has at least one surface, spawn, goal and path, and every path
  starts at a spawn and ends at a goal. No build zones is only a warning.

## Room file (`rooms/<name>.json`)

```json
{
  "version": 1,
  "name": "Living room",
  "output": { "width": 1920, "height": 1080 },
  "surfaces": [
    { "id": "surface1", "name": "Floor", "corners": [{ "x": 0.1, "y": 0.2 }, "...4 total"] }
  ],
  "spawns": [{ "id": "spawn1", "surfaceId": "surface1", "at": { "x": 0.05, "y": 0.5 } }],
  "goals": [{ "id": "goal1", "surfaceId": "surface1", "at": { "x": 0.95, "y": 0.5 } }],
  "paths": [
    {
      "id": "path1",
      "surfaceId": "surface1",
      "spawnId": "spawn1",
      "goalId": "goal1",
      "waypoints": []
    }
  ],
  "buildZones": [
    { "id": "build1", "surfaceId": "surface1", "points": [{ "x": 0.3, "y": 0.3 }, "...3+"] }
  ],
  "blocked": []
}
```

- Surface corners are in **output space**: 0–1 across the projected image (top-left, top-right,
  bottom-right, bottom-left). This is resolution independent.
- All other points are in **surface space**: 0–1 across that surface.
- `output` records the resolution the room was mapped at, for reference only.

## Phone editing

- The room editor can be driven from a phone on the same home network, so corners can be lined
  up while standing at them. Opt in with `npm run dev:phone`.
- Pairing: the editor's Phone panel shows a QR code (link with the code) and a 6-digit code that
  changes on every restart. A paired phone gets a session token and reconnects by itself.
- The PC browser stays in charge: phones send editing commands, the PC runs them on its editor,
  and the PC sends the updated state back. Saving always happens on the PC.
- Phone controls: tool buttons, a pinch-zoomable map, drag/tap/long-press, Fine (4× slower)
  drags, a nudge pad (1 or 10 px), undo/redo/delete, surfaces and rooms.
