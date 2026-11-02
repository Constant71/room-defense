# Room Defense

A local two-player tower defense projected onto a real room.

**Status: milestone 1 (project skeleton).** For now it shows a projector test pattern plus
controller, mouse and keyboard checks. There is no calibration, editor or gameplay yet.

## Requirements

- Windows PC with [Node.js](https://nodejs.org/) 20.19 or newer (22 LTS recommended).
- **Google Chrome or Microsoft Edge.** These are the only browsers that let the game pick the
  projector display. Other browsers work too, but you have to move the window by hand.
- An Xbox controller (USB or Bluetooth) for each player.

## Start the game

Open a terminal (PowerShell or Command Prompt) in this `room-defense` folder:

```bash
npm install
```

```bash
npm run dev
```

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

## Keys

| Key   | Action                                   |
| ----- | ---------------------------------------- |
| `F3`  | Show / hide the fps counter              |
| `H`   | Hide / show the panels (pattern only)    |
| `F11` | Browser fullscreen on the current screen |
| `Esc` | Leave fullscreen                         |

The fps counter shows frames drawn per second, simulation steps per second (always 60) and the
slowest frame in the last second. On a 60 Hz projector both numbers should read 60.

## Folders

| Folder      | Contents                                                        |
| ----------- | --------------------------------------------------------------- |
| `config/`   | Settings files (placeholders for now, not read by the game yet) |
| `rooms/`    | Calibrated rooms (from milestone 2)                             |
| `profiles/` | Player profiles                                                 |
| `saves/`    | Saved games (not committed to git)                              |
| `src/`      | Game source code (TypeScript + PixiJS)                          |

## Other commands

```bash
npm run build
```

Type-checks and builds a static copy into `dist/`. `npm run preview` serves that build.
