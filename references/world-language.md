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
| Active in the last 3 weeks | Lit beacon on the keep. Within 2 weeks, forge chimneys smoke. |
| Idle more than 60 days | Snow on grass, trees and roofs, and fewer lit windows |
| Claude Code / Codex | Coral / sea-green flags on the landmark. A project worked on by both agents is one island with both flags. |
| Subagent calls | Airships circling the island: 1 for any delegation, up to 3 (log scale) |
| Active in the last 30 days | Fireflies |

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

**Title** comes from the realm holding the most activity: web → Harbormaster, mobile → Gardener, AI → Stargazer, CLI → Toolsmith, data → Archivist, games → Castle Builder, anything else → Wayfinder. When no realm holds 35% of activity (and at least three realms appear), the title is Cartographer.

**Adjective**: the first rule that matches wins.

| Rule | Adjective |
|---|---|
| More than 30% of timestamped activity is between 22:00 and 04:59 local time | Midnight |
| More than 25% is between 05:00 and 08:59 | Dawn |
| More than 40% falls on Saturday or Sunday | Weekend |
| Both agents hold more than 25% of activity | Two-Tide |
| A streak of 30 or more days | Unbroken |
| Subagent launches are more than 12% of tool calls | Hive |
| 20 or more projects and none holds 40% of activity | Wandering |
| Otherwise, whichever of 09–11, 12–16 or 17–21 holds the most activity | Morning, Sunlit or Twilight |
| No timestamps at all | Steady |

When one island holds more than 60% of activity, the line adds "One island holds most of your heart."

## Story

The story has up to nine slides (ten in a team world), and a slide is skipped when its data is missing:

1. Total sessions and days at sea.
- Team worlds only: the crew, each builder with their own archetype, islands, shared islands and sessions.
2. The capital: the most active island, its share of the total, and what it is built from.
3. Tokens, compared to War and Peace (~780k tokens) or English Wikipedia (~6B tokens), plus total requests.
4. The 24-hour clock with the busiest hour.
5. The longest run of consecutive active days, plus the busiest date.
6. The crew: Claude Code versus Codex activity share, shown only when both are present.
7. Relics found, rarest first, and the locked relic closest to unlocking.
8. The archetype reveal, over the top islands.
9. The share card, with share, post, more formats, and explore actions.

Rhythm data is stored only as 24 hour buckets, 7 weekday buckets, the active-day count, the longest streak, and the first, last, and busiest dates.

## Team worlds

`--team` merges several people's `--json-output` exports. Projects whose names match (ignoring case and punctuation) become one island: counts, tokens, tools and technologies add up, and the island keeps the seed and realm of whoever built the most of it. Each island records `builders` (each person's share of the activity) and `work` (their sessions, requests and tokens there).

On the map every builder has a colour. Roofs are assigned to builders in proportion to their share, flags and airships show the top builders, and a colour strip under each label shows the split. Shared islands are packed at the heart of the map and each builder's own islands gather in their own direction. Rhythm is the sum of everyone's, so the team archetype describes the crew as a whole; each member's own archetype is kept for the crew slide.

## Tone

The mapping is expressive rather than evaluative. A small island is not a worse project; it records a smaller activity footprint. Avoid productivity scores, rankings between users, or claims about code quality.

For custom worlds, preserve the project-to-island metaphor and privacy boundary. Color, season, labels, and card copy can change freely.
