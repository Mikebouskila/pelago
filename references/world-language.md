# Pelago world language

Use this mapping when explaining or customizing a generated world.

| Work signal | World expression |
|---|---|
| Project | One island, generated procedurally and seeded from the project, so it is stable across runs |
| Total tokens (input + output + cache) | Island footprint (grid of 8–30 tiles on a log scale) and waterfalls: `floor(log10(tokens)) - 5`, capped at 4 |
| Sessions | Buildings, one per session up to 48. Beyond that each building stands for several sessions. Height follows that session's message count. |
| Biggest session | The landmark, chosen by category: web → striped lighthouse with a sweeping beam, ai → observatory with telescope, data → clock tower, cli → lattice radio mast, mobile → four-tier pagoda, game → castle with hot-air balloons, other → ancient lantern tree. It flies one flag per crew with at least 15% of the work. |
| Requests (user prompts) | Trees, one per prompt up to 90, then one per N prompts |
| Prompt volume | Hill height (2–7 levels) |
| Tool mix | Building types in proportion: shell → forge (chimney, smoke), edits → workshop (crane), reading/search → library (dome), web/browser → signal tower (antenna), subagents/teams → windmill, other → cottage |
| Output tokens | Lanterns and the share of lit windows |
| Category | Biome: web → meadow harbor, ai → crystal observatory, data → autumn terraces, cli → tundra workshops, mobile → blossom village, game → candy citadel, other → lighthouse meadow |
| Category (underside) | Bedrock: every island hangs from an inverted mountain of rock 0.6–1× its width, in its biome's stone (`ROCKS`, seven tones darkening toward the tip, a cool moonlit rim on the lit face, a few stones orbiting it). One motif per biome: data → sandstone strata, ai → geodes and crystal seams, cli → icicles, game → glowing lava seams, mobile → blossom vines, web → ivy, other → a lip of moss |
| Active in the last 3 weeks | Lit beacon on the keep. Within 2 weeks, forge chimneys smoke. |
| Idle more than 60 days | Snow on grass, trees and roofs, and fewer lit windows |
| Claude Code / Codex | Coral / sea-green flags on the landmark. A project worked on by both agents is one island with both flags. |
| Subagent calls | Airships circling the island: 1 for any delegation, up to 3 (log scale) |
| Active in the last 30 days | Fireflies (night skies only) |

## Sky and moon

- **Sky at your hour** (`SKIES` in `assets/world.js`): the archetype's adjective picks the sky (Midnight → midnight, Dawn → dawn, Morning → morning, Sunlit → golden hour, Twilight → twilight). Any other adjective falls back to the busiest hour (`peakHour`): 22–04 midnight, 05–08 dawn, 09–11 morning, 12–16 golden hour, 17–21 twilight; no timestamps at all → midnight. Each sky sets the gradient, horizon glow, how many stars and how much Milky Way show, a moon or a pixel sun, the tint of the clouds, the haze colour, and how strongly island lights glow (full at midnight, about a third in the morning), so day skies never look like night lights at noon.
- **Moon or sun** hangs upper left, on the side the islands are lit from. On share cards it rides above the scrim, never under the words: between the wordmark and the overline on story and square cards, just right of the text column on wide ones.
- **Moon phase**: active days in the last 28 (from the daily counts). Every day active → full moon; a quiet month → a thin crescent. The terminator is Bayer-dithered and the dark side keeps a faint earthshine. Sun skies do not show the moon; the Field Guide still names the count.
- **Atmospheric depth**: on the map, islands higher on screen sit further back and take on a little of the sky's haze, in two fixed steps (7% and 14%).
- The still sky is cached in an offscreen canvas keyed by size, sky, phase, device pixel ratio and seed, so a frame only copies it and moves the clouds.

## Connections

- **Rope bridge (`nest`)**: one project's folder is inside another's. The home folder and scratch checkouts never count as parents.
- **Light bridge (`name`)**: two project names share a distinctive word of 4+ letters (common words like "project", "new", "chat" are ignored).
- Each island keeps at most 4 bridges, strongest first. Bridges are computed in `find_links()` and exported as id pairs only.
- **Golden route**: islands joined in order of `firstActive`.
- **Layout**: golden-spiral packing from the capital outward. An island with a bridge to one already placed is packed outward from that neighbour.

## Relics

Relics are defined in `assets/relics.js` (`RELICS`). Each has a sprite, a rarity, a group and a test against one project's aggregates. An island shows up to four of its rarest relics on its front edge; the Cargo Whale floats beside the island. Every earned relic is listed in the island sheet with the reason it was earned, and the Field Guide shows the full catalogue with hints for locked ones.

- **Craft**: a technology from the fixed `TECH_RULES` list in `scripts/pelago.py` was mentioned in at least max(6, 0.4% of the project's messages) messages.
- **Scale**: tokens ≥ 100M (Golden Obelisk) or ≥ 1B (Titan's Crown); 100+ sessions (Great Bell); a 1,000+ message session (Marathon Hourglass); 500+ requests (Scroll Archive).
- **Tools**: 100+ subagent calls (Beehive); 2,000+ shell commands (Lightning Rod); 1,000+ edits (Master's Hammer); 200+ web calls (Star Dish); every tool group used (Compass Rose).
- **Crew**: both agents with at least 15% of the work (Twin Arch).
- **Time**: active for 60+ days (Ancient Oak); founded in the last 7 days (Seedling of Light); idle 60+ days (Sleeping Snowman).

## Archetype

The archetype is `The <Adjective> <Title>`, computed in `scripts/pelago.py` (`persona()`).

**Title** comes from the realm holding the most activity: web → Harbormaster, mobile → Gardener, AI → Stargazer, CLI → Toolsmith, data → Archivist, games → Castle Builder, anything else → Wayfinder. Web and uncategorised work are the commonest realms, so they count at 70% and 75% when picking: a rarer realm close behind them names you instead. When no realm holds 35% of activity (and at least three realms appear), the title is Cartographer.

**Adjective**: the first rule that matches wins.

| Rule | Adjective |
|---|---|
| More than 33% of timestamped activity is between 22:00 and 04:59 local time | Midnight |
| More than 25% is between 05:00 and 08:59 | Dawn |
| More than 40% falls on Saturday or Sunday | Weekend |
| Both agents hold more than 25% of activity | Two-Tide |
| A streak of 30 or more days | Unbroken |
| Subagent launches are more than 12% of tool calls | Hive |
| 20 or more projects and none holds 40% of activity | Wandering |
| Otherwise, whichever of 06–11, 12–16 or 17–21 holds the most activity | Morning, Sunlit or Twilight |
| No timestamps at all | Steady |

When one island holds more than 60% of activity, the line adds "One island holds most of your heart."

Each title has a keeper and an accent colour, which share cards wear on their overline, pixel frame and relic seal. `persona()` also returns two `clues`, one per word, built from the exact numbers that decided it ("39% of your building happened after 10 PM", "71% of your work was web"). The archetype slide of the story shows them, so the title always comes with its reason. `tests/test_pelago.py` simulates 2,000 varied builders and fails if any one archetype passes 15% or any first word passes 30%. A second run of mostly-web, evening-heavy builders (three in four are Harbormasters there) allows one archetype up to 20%.

## Story

The story has up to ten slides (eleven in a team world), and a slide is skipped when its data is missing:

1. Total sessions and days at sea.
- Team worlds only: the crew, each builder with their own archetype, islands, shared islands and sessions.
2. The capital: the most active island, its share of the total, and what it is built from.
3. Tokens, compared to War and Peace (~780k tokens) or English Wikipedia (~6B tokens), plus total requests.
4. The receipts: up to four lines in pixel numbers, over the island with the most of them. Skipped when every count is zero.
5. The 24-hour clock with the busiest hour.
6. The longest run of consecutive active days, plus the busiest date.
7. The crew: Claude Code versus Codex activity share, shown only when both are present.
8. Relics found, rarest first, and the locked relic closest to unlocking.
9. The archetype reveal, over the top islands: two reels spin through every first word and title and lock on yours, your keeper (one pixel character per title, `keeperFor()` in `assets/relics.js`) dithers in, then the two clues. With reduced motion everything appears at once.
10. The share card, with share, post, more formats, and explore actions.

## Receipts

Each project stores `habits`, counted while scanning; the text is never stored (the same model as the tech list):

| Count | What is counted |
|---|---|
| `interrupts` | Times you stopped the agent: main-thread user records starting `[Request interrupted` (Claude Code) and `turn_aborted` events with reason `interrupted` (Codex). Subagent copies of the notice are not counted, and the notices are never requests. |
| `please` | Typed requests matching `\bplease\b` |
| `thanks` | Typed requests matching `\b(thanks\|thank you\|thx\|ty)\b` |
| `nudges` | Typed requests that are only a go-ahead once punctuation and spaces are stripped: continue, go, go on, keep going, yes, y, ok, okay, proceed, do it, next |
| `nudgeWord` | The most common of those go-aheads |
| `longestStretch` | Minutes of the longest run in one session where no two messages are 20 or more minutes apart |

The world's receipts are always recomputed from the projects on the map (`world_habits()`): counts add up, the longest stretch is the maximum, and the go-ahead word is the one with the most go-aheads behind it. So `--only` exports and team merges carry only the receipts of the islands they keep.

Claude Code deletes transcripts after 30 days unless `cleanupPeriodDays` says otherwise. When the world has Claude Code islands whose history starts within 35 days of `generatedAt` (and the scan was not limited with `--since-days`, and `cleanupPeriodDays` is not already above 35), the Field Guide and the terminal summary suggest adding `"cleanupPeriodDays": 365` to `~/.claude/settings.json`. Pelago never edits settings.

The tokens, relics and archetype slides carry a *Share this* pill, and a relic's popover a *Share this relic* button: each opens the export studio on a moment card (`renderMomentCard()`), the moment big over the dimmed world with the brand and call to action inside a story's safe zones. The video is the rise reel (`renderReelFrame(canvas, t, format)`, a pure function of t over 12 seconds): the capital is there from the first frame, the other islands rise from the cloud sea in founding order (`foundingOrder()`, `riseAt()`) through a Bayer-dither dissolve and a hard-pixel cloud puff while the golden route draws and the counters tick; then the camera pulls back, the archetype and keeper slam in, and it holds on the brand and the call to action. None of these owner surfaces appear in the sample world.

Rhythm data is stored only as 24 hour buckets, 7 weekday buckets, the active-day count, the longest streak, and the first, last, and busiest dates.

## Team worlds

Before sharing, each person can run `--only "<names>"` on their export: projects not named are dropped together with their links, their share of the rhythm (every project records its own hour, weekday and day counts), and the scan's file counts. `--team` merges several people's `--json-output` exports, and `--shared-only` keeps only islands two or more people built. Projects whose names match (ignoring case and punctuation) become one island: counts, tokens, tools and technologies add up, and the island keeps the seed and realm of whoever built the most of it. Each island records `builders` (each person's share of the activity) and `work` (their sessions, requests and tokens there).

On the map every builder has a colour. Roofs are assigned to builders in proportion to their share, the keep flies one pennant per top builder (up to three, longest for the biggest share), airships show the top builders, and a colour strip under each label shows the split. Bridges wear both builders' colours: each end takes the colour of whoever leads that island (when one person leads both, the next builder of either island takes the far end); rope bridges get two-tone planks and a pennant on each post, light bridges a gradient between the two colours. Shared islands are packed at the heart of the map and each builder's own islands gather in their own direction. Rhythm is the sum of everyone's, so the team archetype describes the crew as a whole; each member's own archetype is kept for the crew slide.

## Tone

The mapping is expressive rather than evaluative. A small island is not a worse project; it records a smaller activity footprint. Avoid productivity scores, rankings between users, or claims about code quality.

For custom worlds, preserve the project-to-island metaphor and privacy boundary. Color, season, labels, and card copy can change freely.
