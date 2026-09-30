# Cable Planner

Plan every cable run in your home office before you buy or drill anything.

Cable Planner is a local-first web app. You describe your room, desks, devices and cable-management gear with tape-measure dimensions; it routes every cable automatically (hugging walls, using trays, grommets and spines), then tells you exactly what length to buy, whether your power strips are overloaded, where bundles form, and in what order to install everything.

Everything runs in your browser. Layouts are saved to `localStorage` and can be exported/imported as JSON for backup and version control.

## Features

- **Room builder**: rectangular or L-shaped rooms, labelled walls, outlets (wall, USB, floor), Ethernet jacks, and windows/heaters/doors to avoid. Accepts `5' 3.5"`, `63.5`, `161cm`, `1.6m`; toggle inches/cm.
- **Desks and surfaces**: any number of desks, tables and shelves with rotation, standing-desk height range, grommets, frame beams and drawers.
- **Devices and gear**: a preset library (monitors, laptop, tower, Mac mini, Thunderbolt dock, speakers, mic, webcam, router, lamp, charger, NAS) you can customize and extend, with ports, power draw and power bricks. Power strips, trays, raceways, clips, spines, monitor arms and brick holders.
- **Automatic routing**: cables are planned over a weighted network that prefers baseboards, trays, grommets and spines, avoids open floor, heaters and doorways, never passes through other ports, and dips under desk beams. Pin waypoints to steer a route, or switch a cable to manual.
- **Auto-connect**: select a device or power strip and click *Auto-connect*, or use *Auto-connect all*. It plugs things into the best free receptacle (preferring a strip on the same desk, respecting wattage, free receptacles and wall-wart bricks) and wires data by device type: displays to a computer or dock, laptops to a dock's host port, USB peripherals and speakers to the dock, routers to the wall jack, and NAS/docks/computers to the router. Anything it can't connect is listed with the reason. Each device's *Type* (display, computer, laptop, dock, …) comes from its preset and can be changed.
- **Three views**, all editable: top-down room, top-down desk (on-desk / under-desk layers), and front elevation. Drag to move with grid, wall and edge snapping; draw cables port-to-port.
- **Calculations**
  - Cable length = 3D path + slack (default 15%). Cables touching a standing desk are routed at both minimum and maximum height and the longer length is used. Rounded up to retail sizes (1/3/6/10/15 ft or 0.5/1/2/3/5 m).
  - Power budget per strip and wall outlet (warn at 80%, error at 100%), receptacle counts including ones blocked by wall-wart bricks, daisy-chained strips, and strip cords that can't reach.
  - Bundle detection with estimated diameters, checked against tray, grommet, spine and clip capacity.
  - Warnings for power/data parallel runs, passive-cable length limits (USB, Thunderbolt, HDMI 2.1, DisplayPort), unsupported spans, open-floor crossings and paths through beams.
- **Outputs**: shopping list, 3D-printable parts (dimensions in mm with clearance), wiring table, install checklist, and power budget, exported as CSV or Markdown, plus a print stylesheet.

## Getting started

Requires Node 20+.

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (Vitest)
npm run build      # type-check and production build into dist/
```

The app opens with an **example office** so you can see every feature. Use **New** for a blank layout.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `C` | Toggle cable drawing |
| `Esc` | Cancel the cable being drawn → leave cable mode → clear selection |
| `Delete` / `Backspace` | Delete the selection (and anything that depends on it) |
| `⌘/Ctrl D` | Duplicate the selection |
| `⌘/Ctrl Z`, `⇧⌘/Ctrl Z` or `Ctrl Y` | Undo / redo |
| Scroll, drag empty space | Zoom, pan |

## How it works

| Folder | What's there |
| --- | --- |
| `src/model` | Layout schema (`types.ts`), presets and cable spec tables (`defaults.ts`), factories, the example layout, unit parsing, and import validation/migration |
| `src/geometry` | Room/wall geometry and resolution of every item and port to 3D room coordinates, following standing-desk height |
| `src/routing` | The routing network (`network.ts`), Dijkstra search, and per-cable routing with beam avoidance (`route.ts`) |
| `src/calc` | Pure calculations: lengths, retail rounding, power budget, bundles and fill, warnings, and `analyzeLayout` which ties them together |
| `src/outputs` | Shopping list, printable parts, wiring table, install checklist, CSV/Markdown export, and the outputs view |
| `src/state` | Undo/redo history, persistence, edit actions, UI state |
| `src/views`, `src/panels` | SVG views and side panels |

Coordinates are inches internally (x east, y south, z up; wall offsets measured from the left corner when facing the wall). The cm toggle only affects display and input.

Spec length limits and cable diameters live in `SPECS` in `src/model/defaults.ts`. They are conservative rules of thumb for passive cables; edit them if your cables are rated differently.

## Dependencies

Runtime: React only. Tooling: Vite, TypeScript and Vitest. No UI kit, state library or JSX plugin.
