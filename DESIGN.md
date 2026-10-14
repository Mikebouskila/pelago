# Pelago visual system

## Direction

Pelago is a midnight atlas of floating project realms. It should feel like opening a treasured strategy-game save: dense, luminous, explorable, and personal. The game world owns the screen; interface chrome stays compact, translucent, and calm.

## Islands

Islands are not stock art. `assets/island.js` generates each one as isometric pixel art on a native-resolution canvas and scales it up with nearest-neighbour sampling. It draws in this order: a seeded heightmap with lobed coastlines, a floating rock underside with strata and hanging vines, rivers that run downhill into waterfalls, a settlement where every building is a session and streets link each building to its nearest neighbour, then trees and lanterns. A separate glow layer adds light from windows, beacons, crystals and water. See `references/world-language.md` for the full mapping.

## Sharing

The story is the main path to sharing. It is a 9:16 sequence that ends on the share card. Every card leads with the archetype, keeps the archipelago in the middle, and puts the stats and the `Map yours → github.com/Mikebouskila/pelago` call to action at the bottom. Cards show at most the 7 most active islands so each settlement stays readable at phone size.

## Color and light

- Background: deep navy void with cyan-blue atmospheric bloom.
- World highlights: turquoise water, amber windows, sapphire roofs, emerald foliage.
- Primary action: warm coral, used sparingly.
- Selection: golden dashed orbit.
- Claude Code: coral-orange accent.
- Codex: sea-green accent.

## Composition

The initial view reads as one rich archipelago. Islands overlap slightly to create depth, but labels and selection orbits keep projects identifiable. Selecting a project zooms its realm into a hero composition and opens an explanatory sheet. Export cards use more separation for legibility at social sizes.

## Interaction

- Drag to pan and use wheel or controls to zoom.
- Hover reveals project name, realm, and recency.
- Selection zooms, opens the project sheet, and explains every data signal.
- The island index is the keyboard- and touch-friendly navigation fallback.
- Motion is short, purposeful, and disabled under reduced-motion preferences.

## Accessibility

Interface copy targets WCAG AA against the dark panels. Color is never the only agent identifier. Every project remains reachable from labeled buttons, and focus rings are visibly golden.
