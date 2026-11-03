# Room Defense

A local two-player tower defense projected onto a real room.

**Status: first playable.** Map your room in the room editor (from the PC or your phone), then
play all 10 waves with two controllers.

## Requirements

- Windows PC with [Node.js](https://nodejs.org/) 20.19 or newer (22 LTS recommended).
- **Google Chrome or Microsoft Edge.** These are the only browsers that let the game pick the
  projector display. Other browsers work too, but you have to move the window by hand.
- An Xbox controller (USB or Bluetooth) for each player.

## Start the game

Open a terminal (PowerShell or Command Prompt) in the project folder (where this README is):

```bash
npm install
```

```bash
npm run dev
```

If PowerShell says _"npm.ps1 cannot be loaded because running scripts is disabled on this
system"_, allow local scripts for your Windows user once (no admin needed), then run the
commands again:

```bash
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

Alternatively, type `npm.cmd` instead of `npm`, or use Command Prompt instead of PowerShell.

The first command is only needed once. The second starts the game at
<http://localhost:5173/> and opens it in your default browser. If the browser does not open
by itself, paste that address into Chrome or Edge. Press `Ctrl + C` in the terminal to stop.

## Put it on the projector

1. Connect the projector and set Windows to **Extend** the desktop (press `Win + P` and choose
   _Extend_). Do not use _Duplicate_: the projector should be its own display.
2. Click **Go fullscreen on projector** (top-right panel).
3. The first time, the browser asks to **manage windows on all your displays**. Click _Allow_.
4. A list of your displays appears. Click the projector, and the game fills it in fullscreen.

If the browser cannot list displays, or you clicked _Block_, the panel says so. Then:

- drag the browser window onto the projector screen and press **F11**, or click
  **Fullscreen on this screen** once it is there.
- To undo a _Block_, click the icon left of the address bar, open the site settings and set
  **Window management** to _Allow_.

Press **Esc** to leave fullscreen.

### Can't read the text on the projector?

Make it bigger: click **A+** at the top of the panel, or press `=` (and `-` to shrink). It goes
up to 300% and is remembered next time. Labels and handles in the room editor grow with it.

- In the room editor, the **yellow box** in the corner always shows the current tool and what
  to do next, even when the panels are hidden with `H`.
- If the panel covers what you are working on, press `P` to move it to the other side, or `H` to
  hide it.
- A long panel scrolls: use the mouse wheel over it.

### What the test pattern should look like

- A **white border** touching all four edges of the projected image. If part of it is missing,
  the image is cropped (check the projector's zoom or overscan settings).
- A **10 × 10 cyan grid** with square-looking cells only if the projector's aspect ratio matches.
- **Magenta diagonals** from corner to corner, crossing exactly at the **yellow crosshair** in
  the middle of the **green circle**. The circle should look round, not oval.
- **Colour bars** (white, yellow, cyan, green, magenta, red, blue), all clearly visible. Blue
  is the dimmest on most projectors. If it is hard to see, the room is too bright.
- The number in the circle is the resolution the projector is receiving.

The pattern uses only bright colours on pure black, because dark colours disappear on a
projector.

## Check the controllers

1. Plug in the Xbox controller (or pair it over Bluetooth).
2. **Press any button on it.** Browsers hide controllers until a button is pressed.
3. The **Controllers** panel shows _#1 Xbox controller_. Every button lights up magenta while
   held, the trigger bars fill as you squeeze LT and RT, and the yellow dot follows each stick.
   The stick ring turns magenta once the stick is pushed past the dead zone.
4. Connect the second controller the same way; it appears as _#2_. Unplugging a controller
   removes its card.

If a controller shows _not recognised as Xbox_ or _non-standard mapping_, the labels may not
match the physical buttons.

## Check the mouse and keyboard

The **Mouse & keyboard** panel shows the cursor position (in window units and in real output
pixels), which mouse buttons are held, the scroll wheel count, every key that is held down,
and the last key pressed. A yellow crosshair follows the mouse on the pattern and turns magenta
while a button is held.

## Map your room (room editor)

Press **F2** (or click **Room editor** at the top of the panel) to switch between the checks
and the editor. Do this with the game fullscreen on the projector, using the PC mouse: you draw
directly onto the projected image, so what you see in the room is what you get.

**1. Surfaces.** Add one surface for each flat area the projector hits: the floor, a wall, a
table top. Each surface is drawn as a grid. With the **Corners** tool (`2`), drag its four
corners onto four real corners in the room, such as the corners of a rug, a doorway or tape
marks on the floor. The grid bends to match the perspective. Click a corner and use the
**arrow keys** to nudge it one pixel at a time (**Shift** for 10). The thick edge is the top.

**2. Game layout.** Everything you draw sticks to the surface it is on. If the projector gets
bumped, just drag the corners back into place and the whole layout follows.

| Tool       | Key | How                                                                  |
| ---------- | --- | -------------------------------------------------------------------- |
| Select     | `1` | Click to select. Drag points or whole zones to move them.            |
| Corners    | `2` | Drag surface corners onto the real room.                             |
| Spawn      | `3` | Click where enemies appear.                                          |
| Goal       | `4` | Click the base enemies attack.                                       |
| Path       | `5` | Click a spawn, then waypoints, then a goal. Can cross surfaces.      |
| Build zone | `6` | Click the corners of an area where towers may go. `Enter` closes it. |
| Blocked    | `7` | Click the corners of an area to keep clear (furniture, TV, doors).   |

- `Enter` or a double-click finishes a path or zone, `Backspace` removes the last point and
  `Esc` cancels.
- With **Select**, double-click an edge of the selected path or zone to add a point, and
  right-click a point to remove it. `Delete` removes the selected item.
- `Ctrl + Z` undoes, `Ctrl + Y` redoes.
- **Panel in the way?** Press `P` to move it to the other side of the screen, or `H` to hide it.
  The keyboard shortcuts keep working while it is hidden.

**3. Check and save.** The **Room check** list says what is still missing, such as a path that
doesn't reach a goal. Press `Ctrl + S` to save. Rooms are saved as
`rooms/<room-name>.json`, and the last room you opened reopens next time. Use **Open** to switch
rooms and **New room** to start another. Saving only works while the game runs from
`npm run dev`.

## Play

Press **F2** until **Play** is highlighted (it cycles Checks → Room editor → Play), or click
**Play** in the top bar. The game uses the room open in the editor. If the room isn't ready
(for example a path that doesn't reach a goal), it tells you what to fix.

Two players defend together with one Xbox controller each, sharing credits and lives. Enemies
come from the spawns and follow the paths to the goals, even when a path climbs from the floor
onto a wall. Build towers in the cyan build zones to stop them. You can't build on a path or in
a blocked area.

| Controller              | Mouse and keyboard  | Action                                     |
| ----------------------- | ------------------- | ------------------------------------------ |
| Left stick / D-pad      | Move the mouse      | Move your cursor                           |
| `A`                     | Left click          | Build the selected tower                   |
| `B`                     | Right click         | Sell the tower under the cursor (70% back) |
| `Y` (or `A` on a tower) | `U` or middle click | Upgrade the tower under the cursor         |
| `X`, `RB` / `LB`        | `1`-`3`, `E` / `Q`  | Next / previous tower                      |
| `Menu`                  | `Space`             | Start the next wave · pause · play again   |

Your cursor shows the selected tower and its range: **green** means you can build there,
**red** means you can't (the reason appears next to the cursor).

| Tower | Cost | What it does                                  |
| ----- | ---- | --------------------------------------------- |
| Pulse | 50   | Fast shots at one enemy, medium range         |
| Lance | 100  | Slow, heavy shots at one enemy, long range    |
| Frost | 70   | Hits every enemy close by and slows them down |

| Enemy   | Looks like      | Notes                                            |
| ------- | --------------- | ------------------------------------------------ |
| Crawler | Magenta circle  | The usual                                        |
| Dart    | Orange triangle | Fast but fragile                                 |
| Brute   | Red square      | Slow and tough, costs 3 lives if it gets through |

**Upgrades:** every tower can be upgraded twice (levels 2 and 3) for more damage and range;
Frost also slows harder. Point at a tower to see its level, the upgrade price and what selling
would give back. Dots under a tower show its level. Selling returns 70% of everything spent on
it, upgrades included.

**Sound and rumble:** shots, kills, enemies getting through, waves, wins and losses all have
sounds. Press `M` (or **Sound on/off** in the top bar) to mute; the slider next to it sets the
volume. Sound starts after your first key press or click (a browser rule). Controllers rumble
when you build or upgrade, and everyone's rumbles when an enemy reaches a goal.

Hold off all **10 waves** to win. Each enemy that reaches a goal costs lives, and you lose when
they run out. Kills and cleared waves earn credits. Mixing tower types works much better than
building only one kind.

The panels hide while you play. Press `F2` to leave Play: the game pauses and carries on
when you come back, unless you changed the room in the meantime.

## Edit the room from your phone

Stand next to the real corner of the rug and drag the projected corner onto it, without walking
back to the PC.

1. Start the game with the phone command instead of the normal one:

   ```bash
   npm run dev:phone
   ```

2. **The first time only**, Windows Firewall asks whether Node.js may use the network. Tick
   **Private networks** (your home Wi-Fi), leave _Public_ unticked, and click **Allow**.
3. Open the **Room editor** (`F2`). The **Phone** panel shows a QR code and a 6-digit pairing
   code.
4. Make sure your phone is on the **same Wi-Fi** as the PC, then scan the QR code with the phone
   camera. The phone editor opens in the browser, already paired. You can also type the address
   shown under the QR code and enter the pairing code by hand.

On the phone:

- **Tap** a tool, then tap the map to place points. **Drag** points and corners to move them.
  The projector updates as you go, so watch the wall, not the phone.
- **Two fingers** zoom and pan the map; **Fit** resets it. **Fine** makes drags 4× slower for
  precise corner placement.
- **Nudge** arrows move the selected corner (or spawn/goal) by 1 or 10 projector pixels.
- **Long-press** a point to remove it (Select tool). **Finish**, **Remove last point** and
  **Cancel** are under the map while drawing.
- **Save** saves the room on the PC (`rooms/*.json`). You can also open other rooms or start a
  new one from the bottom of the phone page.

Good to know:

- Phone editing only works while the game runs from `npm run dev:phone`. Plain `npm run dev`
  stays on the PC only and doesn't show the QR code.
- It only works on your home network, not over the internet.
- The pairing code changes every time you restart the game. A paired phone reconnects by itself
  until then. After 5 wrong codes, pairing is blocked for a minute.
- If the phone can't connect: check it's on the same Wi-Fi (not mobile data or a guest network),
  and that you allowed Node.js on **Private** networks. In Windows settings, your Wi-Fi should be
  set to a **Private** network.

## Keys

| Key       | Action                                          |
| --------- | ----------------------------------------------- |
| `F2`      | Switch between Checks, Room editor and Play     |
| `F3`      | Show / hide the fps counter                     |
| `=` / `-` | Bigger / smaller text                           |
| `H`       | Hide / show the panels                          |
| `P`       | Move the panels to the other side of the screen |
| `M`       | Sound on / off                                  |
| `F11`     | Browser fullscreen on the current screen        |
| `Esc`     | Leave fullscreen                                |

The fps counter shows frames drawn per second, simulation steps per second (always 60) and the
slowest frame in the last second. On a 60 Hz projector both numbers should read 60.

## Folders

| Folder      | Contents                                                        |
| ----------- | --------------------------------------------------------------- |
| `config/`   | Settings files (placeholders for now, not read by the game yet) |
| `rooms/`    | Rooms saved by the room editor                                  |
| `profiles/` | Player profiles                                                 |
| `saves/`    | Saved games (not committed to git)                              |
| `src/`      | Game source code (TypeScript + PixiJS)                          |

## Other commands

```bash
npm run dev:phone
```

Like `npm run dev`, but also lets a paired phone edit rooms over your home Wi-Fi.

```bash
npm run check
```

Checks formatting, runs the unit tests and builds the game.

```bash
npm run build
```

Type-checks and builds a static copy into `dist/`. `npm run preview` serves that build.
