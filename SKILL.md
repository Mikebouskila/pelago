---
name: pelago
description: Make an AI coding Wrapped from local Claude Code and Codex history. Turns every project into a pixel-art island and adds a story-style recap, a coding archetype such as "The Midnight Harbormaster", relics, shareable cards and a short video reel, all in one offline HTML page. Use when the user asks for their Claude Code Wrapped, Codex Wrapped or AI coding Wrapped, a year in review or monthly recap of what they built with AI agents, their coding archetype or coding personality, a stats recap of sessions and tokens, a team recap or team Wrapped merged from several people's exports, or a way to visualize, celebrate or share their AI coding history, or says "pelago". Reads only ~/.claude/projects and ~/.codex/sessions and keeps aggregates, never prompts.
allowed-tools: Bash(python3 ${CLAUDE_SKILL_DIR}/scripts/pelago.py *)
---

# Pelago

Pelago turns local AI coding history into a living world. Every project becomes a procedurally generated pixel-art island built from its own data: one building per session, trees from requests, land and waterfalls from tokens, and architecture from the tools the agent used. The result is one offline HTML file with:

- **The map**: an explorable, animated archipelago under a night sky. Related projects sit side by side, joined by rope and light bridges; on the first visit they rise from the clouds along a golden route, in the order they were founded.
- **The story**: a ten-slide recap (sessions, capital island, tokens, the receipts, busiest hour, longest streak, agents, relics with the next one to unlock, archetype, card).
- **The relics**: 31 collectible items earned by technologies, scale, tools and time, standing on the islands and collected in the Field Guide.
- **The archetype**: a playful title such as *The Midnight Harbormaster* or *The Dawn Stargazer*.
- **The cards**: PNG cards and a 12-second rise reel (islands rise from the clouds in the order you founded them) for Story, Square, X/LinkedIn, and GitHub; moment cards for your tokens, your receipts, a relic or your archetype; copy, native share, and post buttons for X, LinkedIn, Bluesky and Threads that copy the image and open the composer.
- **Team worlds**: several people's exports merged into one archipelago, every builder in their own colour.

## Run it

```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/pelago.py --output "${CLAUDE_PROJECT_DIR}/pelago-world.html" --open
```

In Codex, resolve `scripts/pelago.py` from this skill's directory and run it by absolute path, writing `pelago-world.html` to the current workspace. The `${CLAUDE_SKILL_DIR}` and `${CLAUDE_PROJECT_DIR}` substitutions are for Claude Code; do not use them literally in Codex.

Options:

- `--year 2026` makes a Wrapped edition: only that calendar year (local time), with the story and card titled CLAUDE CODE WRAPPED 2026, CODEX WRAPPED 2026 or AI CODING WRAPPED 2026 by the agents found. Use it for a Wrapped or a year in review. Team exports made with the same `--year` merge into a team Wrapped.
- `--since-days 30` limits the recap window instead, for example a monthly recap.
- `--demo` builds a polished sample world without reading any history. Use it when the user wants a preview.
- `--open` opens the result in the default browser. Drop it in headless or remote environments.
- `--json-output <path>` also saves the aggregate data. `--input <path>` rebuilds from that file.
- Team worlds: when the user wants a world for their team, ask for their first name and whether they are collecting. First run a private full scan with `--json-output pelago-me.json --list-projects`, show them the printed project list, and ask which are team projects. Then export only those with `--input pelago-me.json --only "<a>, <b>" --name "<name>" --json-output pelago-team/<name>.json --output pelago-team/<name>-preview.html`. `pelago-me.json` holds their whole history: tell them never to send it, only the file in `pelago-team/`. The collector puts every export in one folder and runs `--team pelago-team/ --team-name "<team>" --shared-only --output pelago-team-world.html` (`--shared-only` keeps islands two or more people built; drop it to also show solo projects). Islands merge by project name, so if nothing is shared, check the names match. After merging, tell them each person's archetype and shared-island count (the script prints them) and the team archetype.
- `--demo-team` builds a sample team world without reading any history.

Write outputs to the user's current workspace unless they name another location. If the environment needs permission to read `~/.claude/projects` or `~/.codex/sessions`, ask for read access to those two directories only.

## After it runs

The script prints a short summary: island count, sessions, capital island, longest streak, and the archetype. Relay it in two or three lines and keep the archetype as the punchline, for example:

> 26 islands, 4.8k sessions, 36B tokens and 28 of 31 relics. Your capital is Atlas Studio, a town of 48 buildings crowned with a legendary Titan's Crown, and you are **The Midnight Harbormaster**.

Mention how many relics they found and the rarest one. Then tell the user to press **▶ Play your story** in the page. The story ends on their share card. If the page did not open automatically, give them the file path.

## Privacy boundary

Pelago is local-first. Never upload history, prompts, file contents, or project data. The generator reads message text transiently to classify projects. It keeps only aggregates: project name, agent, category, dates, session/request/message counts, per-session message counts, token totals, tool-category counts, model family names, hour/weekday/day counts (overall and per project), which islands are related (as id pairs), mention counts for a fixed list of 17 technologies, and the receipts: per-project counts of interrupted requests, requests saying please or thanks, and bare go-aheads from a fixed list (plus the most common of those words), and the longest focused stretch in minutes. Do not quote or summarize prompt content in the response.

Do not scan unrelated folders or shell history. Do not publish or share a card without an explicit user request. Project names appear on cards by default. If the user plans to share publicly and has client or confidential project names, point out the "Show project names" toggle in the export studio, or the **Aa** button on the map, which hides every project name on the page and on cards (islands are described by their kind instead) for screenshots and screen sharing.

## Explaining the world

Use [references/world-language.md](references/world-language.md) when the user asks how the map, the archetype, or the story is derived, or wants a custom interpretation. Keep the default mapping stable so regenerated worlds stay recognizable.

If no history is found, say which two locations were checked, and offer `--demo` as a preview.
