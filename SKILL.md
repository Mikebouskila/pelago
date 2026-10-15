---
name: pelago
description: Turn the user's local Claude Code and Codex history into a pixel-art archipelago, a Wrapped-style story, an AI-coding archetype ("The Midnight Harbormaster"), and shareable social cards. Use when the user asks to visualize, recap, celebrate, or share what they built with AI coding agents, wants their "AI coding wrapped", year/month in review, coding archetype, or says "pelago".
allowed-tools: Bash(python3 ${CLAUDE_SKILL_DIR}/scripts/pelago.py *)
---

# Pelago

Pelago turns local AI coding history into a living world. Every project becomes a procedurally generated pixel-art island built from its own data: one building per session, trees from requests, land and waterfalls from tokens, and architecture from the tools the agent used. The result is one offline HTML file with:

- **The map**: an explorable, animated archipelago under a night sky. Related projects sit side by side, joined by rope and light bridges, and a golden route traces the order they were founded.
- **The story**: a nine-slide recap (sessions, capital island, tokens, busiest hour, longest streak, agents, relics with the next one to unlock, archetype, card).
- **The relics**: 31 collectible items earned by technologies, scale, tools and time, standing on the islands and collected in the Field Guide.
- **The archetype**: a playful title such as *The Midnight Harbormaster* or *The Dawn Stargazer*.
- **The cards**: PNG cards and 8-second videos for Story, Square, X/LinkedIn, and GitHub, with copy, native share, and post-to-X.
- **Team worlds**: several people's exports merged into one archipelago, every builder in their own colour.

## Run it

```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/pelago.py --output "${CLAUDE_PROJECT_DIR}/pelago-world.html" --open
```

In Codex, resolve `scripts/pelago.py` from this skill's directory and run it by absolute path, writing `pelago-world.html` to the current workspace. The `${CLAUDE_SKILL_DIR}` and `${CLAUDE_PROJECT_DIR}` substitutions are for Claude Code; do not use them literally in Codex.

Options:

- `--since-days 30` limits the recap window, for example a monthly recap. Use 365 for a year in review.
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

Pelago is local-first. Never upload history, prompts, file contents, or project data. The generator reads message text transiently to classify projects. It keeps only aggregates: project name, agent, category, dates, session/request/message counts, per-session message counts, token totals, tool-category counts, model family names, hour/weekday/day counts (overall and per project), which islands are related (as id pairs), and mention counts for a fixed list of 17 technologies. Do not quote or summarize prompt content in the response.

Do not scan unrelated folders or shell history. Do not publish or share a card without an explicit user request. Project names appear on cards by default. If the user plans to share publicly and has client or confidential project names, point out the "Show project names" toggle in the export studio, or the **Aa** button on the map, which hides every project name on the page and on cards (islands are described by their kind instead) for screenshots and screen sharing.

## Explaining the world

Use [references/world-language.md](references/world-language.md) when the user asks how the map, the archetype, or the story is derived, or wants a custom interpretation. Keep the default mapping stable so regenerated worlds stay recognizable.

If no history is found, say which two locations were checked, and offer `--demo` as a preview.
