import importlib.util
import json
import re
import sys
import tempfile
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).parents[1] / "scripts" / "pelago.py"
SPEC = importlib.util.spec_from_file_location("pelago", MODULE_PATH)
pelago = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
sys.modules[SPEC.name] = pelago
SPEC.loader.exec_module(pelago)


# Records shaped like the real Claude Code and Codex transcripts.
def claude_user(cwd, text, ts="2026-03-01T10:00:00Z", **extra):
    return {"type": "user", "cwd": cwd, "timestamp": ts, "message": {"role": "user", "content": text}, **extra}


def claude_tool_result(cwd, ts="2026-03-01T10:00:02Z"):
    return {"type": "user", "cwd": cwd, "timestamp": ts, "message": {"role": "user", "content": [{"type": "tool_result", "content": "ok"}]}}


def claude_reply(cwd, message_id, ts="2026-03-01T10:00:01Z", tool=None, usage=None, text="done", model="claude-opus-5-5"):
    block = {"type": "tool_use", "name": tool, "input": {"cwd": "/somewhere/else"}} if tool else {"type": "text", "text": text}
    message = {"id": message_id, "role": "assistant", "model": model, "content": [block]}
    if usage:
        message["usage"] = usage
    return {"type": "assistant", "cwd": cwd, "timestamp": ts, "message": message}


def codex_meta(cwd, thread, parent=None, ts="2026-03-01T10:00:00Z"):
    payload = {"id": thread, "cwd": cwd}
    if parent:
        payload["parent_thread_id"] = parent
    return {"type": "session_meta", "timestamp": ts, "payload": payload}


def codex_user(text, ts="2026-03-01T10:00:00Z"):
    return {"type": "response_item", "timestamp": ts, "payload": {"type": "message", "role": "user", "content": [{"type": "input_text", "text": text}]}}


def codex_reply(text, ts="2026-03-01T10:00:01Z"):
    return {"type": "response_item", "timestamp": ts, "payload": {"type": "message", "role": "assistant", "content": [{"type": "output_text", "text": text}]}}


def write(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(json.dumps(row) for row in rows), encoding="utf-8")


class PelagoTests(unittest.TestCase):
    def test_scan_aggregates_both_agents_without_persisting_content(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            write(home / ".claude" / "projects" / "-work-secret-web" / "one.jsonl", [
                claude_user("/work/secret-web", "React private prompt with tailwind css"),
                claude_reply("/work/secret-web", "m1", text="React component and CSS done"),
            ])
            write(home / ".codex" / "sessions" / "2026" / "two.jsonl", [
                codex_meta("/work/agent-lab", "t1"),
                codex_user("LLM agent private embeddings work"),
                codex_reply("Wired the OpenAI embedding pipeline"),
            ])

            result = pelago.scan(home)

            self.assertEqual({project["name"] for project in result["projects"]}, {"secret web", "agent lab"})
            self.assertEqual({project["agent"] for project in result["projects"]}, {"claude", "codex"})
            serialized = json.dumps(result)
            self.assertNotIn("private prompt", serialized)
            self.assertNotIn("LLM agent private", serialized)
            self.assertEqual(next(p for p in result["projects"] if p["name"] == "secret web")["category"], "web")

    def test_invalid_lines_are_ignored(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            path = home / ".codex" / "sessions" / "session.jsonl"
            path.parent.mkdir(parents=True)
            rows = [codex_meta("/work/tool", "t1"), codex_user("a terminal cli with argparse subcommand"), codex_reply("cli done")]
            path.write_text("{bad}\n" + "\n".join(json.dumps(row) for row in rows), encoding="utf-8")
            result = pelago.scan(home)
            self.assertEqual(len(result["projects"]), 1)
            self.assertEqual(result["projects"][0]["category"], "cli")

    def test_undated_projects_emit_null_and_names_drop_bidi_marks(self):
        public = pelago.Project(key="k", name="Dateless", agent="codex").public()
        self.assertIsNone(public["firstActive"])
        self.assertIsNone(public["lastActive"])
        self.assertEqual(pelago.clean_name("/work/‮evil‬‏-app", "x"), "evil app")

    def test_scan_sorts_undated_projects_beside_dated_ones(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            undated = [codex_meta("/work/undated-tool", "t1"), codex_user("a cli with argparse"), codex_reply("ok")]
            write(home / ".codex" / "sessions" / "a.jsonl", [{k: v for k, v in row.items() if k != "timestamp"} for row in undated])
            write(home / ".codex" / "sessions" / "b.jsonl", [codex_meta("/work/dated-tool", "t2"), codex_user("a cli with argparse"), codex_reply("ok")])
            projects = {project["name"]: project for project in pelago.scan(home)["projects"]}
            self.assertIsNone(projects["undated tool"]["lastActive"])
            self.assertIsNone(projects["undated tool"]["firstActive"])
            self.assertEqual(projects["dated tool"]["lastActive"][:10], "2026-03-01")

    def test_demo_renders_self_contained_html(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "world.html"
            pelago.render_html(pelago.demo_data(), output)
            html = output.read_text(encoding="utf-8")
            self.assertIn("Atlas Studio", html)
            self.assertIn("Download PNG", html)
            self.assertNotIn("__PELAGO", html)
            self.assertIn("Reading your archipelago", html)
            # Hidden overlays (the story) must never swallow clicks.
            self.assertIn("[hidden] { display: none !important; }", html)
            self.assertIn("Spark Monolith", html)
            self.assertIn("Play your story", html)
            self.assertIn("The Midnight Harbormaster", html)
            self.assertLess(len(html), 3_000_000)
            self.assertIn("Download video", html)
            self.assertIn('id="toggleNames"', html)
            self.assertIn("function nameOf", html)
            self.assertIn("function nextRelics", html)
            # Every title has a keeper, and the archetype arrives with its reasons.
            self.assertIn("function keeperFor", html)
            for title in pelago.TITLES.values():
                self.assertIn(f"title: '{title}'", html)
            self.assertIn("39% of your building happened after 10 PM", html)
            self.assertIn("SAMPLE ARCHETYPE", html)
            # The sample doubles as the live demo, so it carries link previews; a real world never does.
            self.assertIn('property="og:image"', html)
            data = pelago.demo_data()
            data.pop("demo")
            pelago.render_html(data, output)
            self.assertNotIn('property="og:image"', output.read_text(encoding="utf-8"))

    def test_sessions_are_files_and_worktrees_fold_into_their_repo(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            root = home / ".claude" / "projects"
            write(root / "-work-atlas" / "s1.jsonl", [claude_user("/work/atlas", "fix the header")] + [claude_reply("/work/atlas", f"m{i}") for i in range(4)])
            write(root / "-work-atlas" / "s1" / "subagents" / "agent-x.jsonl", [claude_user("/work/atlas", "You are a helper. Review the diff.", isSidechain=True), claude_reply("/work/atlas", "m9")])
            write(root / "-work-atlas--claude-worktrees-happy-otter-1a2b3c" / "s2.jsonl", [claude_user("/work/atlas/.claude/worktrees/happy-otter-1a2b3c", "ship it")])

            result = pelago.scan(home)

            self.assertEqual(len(result["projects"]), 1)
            atlas = result["projects"][0]
            self.assertEqual(atlas["name"], "atlas")
            self.assertEqual(atlas["sessions"], 2)
            self.assertEqual(atlas["prompts"], 2, "a subagent brief is not a request the person typed")
            self.assertEqual(atlas["messages"], 1 + 4 + 2 + 1)

    def test_only_typed_requests_count_as_prompts(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            cwd = "/work/app"
            write(home / ".claude" / "projects" / "-work-app" / "s.jsonl", [
                claude_user(cwd, "build the login page"),
                claude_user(cwd, "<task-notification>\n<task-id>x</task-id>"),
                claude_user(cwd, "This session is being continued from a previous conversation", isCompactSummary=True),
                claude_user(cwd, "[Request interrupted by user]"),
                claude_user(cwd, "<command-name>/compact</command-name>"),
                claude_user(cwd, "Caveat: the messages below were generated", isMeta=True),
                claude_tool_result(cwd),
                {"type": "attachment", "cwd": cwd, "timestamp": "2026-03-01T10:00:03Z"},
                {"type": "custom-title", "customTitle": "my title", "cwd": cwd},
            ])
            write(home / ".codex" / "sessions" / "r.jsonl", [
                codex_meta("/work/other", "t1"),
                codex_user("<environment_context>cwd</environment_context>"),
                codex_user("add dark mode"),
                codex_reply("added"),
            ])

            projects = {project["name"]: project for project in pelago.scan(home)["projects"]}

            self.assertEqual(projects["app"]["prompts"], 1)
            self.assertEqual(projects["app"]["messages"], 7, "attachments and titles are not messages")
            self.assertEqual(projects["other"]["prompts"], 1)
            self.assertEqual(projects["other"]["messages"], 2)

    def test_a_tool_call_mentioning_another_folder_does_not_move_the_work(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            write(home / ".claude" / "projects" / "-work-app" / "s.jsonl", [
                claude_user("/work/app", "run the tests"),
                claude_reply("/work/app", "m1", tool="Bash"),
            ])
            names = [project["name"] for project in pelago.scan(home)["projects"]]
            self.assertEqual(names, ["app"])

    def test_codex_file_uris_and_temp_checkouts(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            root = home / ".codex" / "sessions" / "2026"
            write(root / "rollout-a.jsonl", [codex_meta("file:///Users/me/%D7%97%D7%A7%D7%99%D7%A8%D7%94", "a"), codex_user("hello"), codex_reply("hi")])
            for name in ("b", "c"):
                write(root / f"rollout-{name}.jsonl", [codex_meta(f"/private/tmp/run-{name}/repo", name), codex_user("try this")])

            names = {project["name"]: project for project in pelago.scan(home)["projects"]}

            self.assertIn("חקירה", names)
            self.assertEqual(names["חקירה"]["messages"], 2)
            self.assertEqual(names["Scratch waters"]["sessions"], 2)

    def test_rhythm_and_persona_are_aggregate_only(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            rows = [codex_meta("/work/quest", "t1")]
            for day in (1, 2, 3, 5):
                rows.append(codex_user("phaser game sprite tilemap level design", ts=f"2026-04-0{day}T12:00:00Z"))
            write(home / ".codex" / "sessions" / "s.jsonl", rows)

            result = pelago.scan(home)

            rhythm = result["rhythm"]
            self.assertEqual(sum(rhythm["hours"]), 4)
            self.assertEqual(sum(sum(project["rhythm"]["hours"]) for project in result["projects"]), 4)
            self.assertEqual(rhythm["activeDays"], 4)
            self.assertEqual(rhythm["longestStreak"], 3)
            self.assertTrue(result["persona"]["title"].endswith("Castle Builder"))
            self.assertNotIn("phaser", json.dumps(result))

    def test_persona_prefix_follows_rhythm(self):
        data = pelago.demo_data()
        self.assertEqual(data["persona"]["title"], "The Midnight Harbormaster")
        data["rhythm"]["hours"] = [0] * 5 + [50] * 4 + [1] * 15
        self.assertEqual(pelago.persona(data)["title"], "The Dawn Harbormaster")

    def test_persona_spreads_across_builders(self):
        def builder(category, peak, crew=0, codex=0.0):
            hours = [0] * 24
            hours[peak] = 100
            crews = {"claude": 1 - codex, "codex": codex} if codex else {"claude": 1.0}
            project = {"name": "Main", "agent": "claude", "category": category, "activity": 900, "crews": crews,
                       "tools": {"shell": 100, "crew": crew}}
            return {"projects": [project], "rhythm": {"hours": hours, "weekdays": [1] * 7, "longestStreak": 5}}

        self.assertEqual(pelago.persona(builder("web", 10))["title"], "The Morning Harbormaster")
        self.assertEqual(pelago.persona(builder("web", 14))["title"], "The Sunlit Harbormaster")
        self.assertEqual(pelago.persona(builder("mobile", 19))["title"], "The Twilight Gardener")
        self.assertEqual(pelago.persona(builder("cli", 14, crew=40))["title"], "The Hive Toolsmith")
        self.assertEqual(pelago.persona(builder("other", 14, codex=0.4))["title"], "The Two-Tide Wayfinder")
        streak = builder("web", 14); streak["rhythm"]["longestStreak"] = 30
        self.assertEqual(pelago.persona(streak)["title"], "The Unbroken Harbormaster")
        weekend = builder("web", 14); weekend["rhythm"]["weekdays"] = [1] * 5 + [9, 9]
        self.assertEqual(pelago.persona(weekend)["title"], "The Weekend Harbormaster")
        many = builder("web", 14); many["projects"] = [dict(many["projects"][0], name=f"P{index}") for index in range(20)]
        self.assertEqual(pelago.persona(many)["title"], "The Wandering Harbormaster")
        quiet = builder("web", 14); quiet["rhythm"] = {}
        self.assertEqual(pelago.persona(quiet)["title"], "The Steady Harbormaster")
        self.assertIn("returning", pelago.persona(quiet)["line"])

    def test_persona_clues_quote_the_numbers_that_decided_it(self):
        def why(data):
            return [clue["why"] for clue in pelago.persona(data)["clues"]]

        def builder(mix, hours=None, **rhythm):
            projects = [{"name": f"P{index}", "agent": "claude", "category": category, "activity": activity, "tools": {"shell": 100}}
                        for index, (category, activity) in enumerate(mix)]
            return {"projects": projects, "rhythm": {"hours": hours or [0] * 17 + [48, 0, 0, 0, 0] + [52, 0], "weekdays": [1] * 7, **rhythm}}

        demo = pelago.demo_data()["persona"]
        self.assertEqual([clue["label"] for clue in demo["clues"]], ["Midnight", "Harbormaster"])
        self.assertEqual(demo["clues"][0]["why"], "39% of your building happened after 10 PM")
        evening = [0] * 24; evening[18] = 48; evening[9] = 30; evening[14] = 22
        self.assertEqual(why(builder([("web", 71), ("ai", 29)], evening)), ["48% of your building happened between 5 and 10 PM", "71% of your work was web"])
        self.assertEqual(why(builder([("web", 50), ("ai", 45), ("cli", 5)], evening))[1], "45% of your work was AI and agents, 50% web")
        self.assertEqual(why(builder([("web", 30), ("ai", 30), ("cli", 20), ("data", 20)], evening))[1], "4 realms, none above 35%")
        self.assertEqual(why(builder([("cli", 100)], evening, longestStreak=41))[0], "41 days in a row")
        both = builder([("cli", 100)], evening); both["projects"][0]["crews"] = {"claude": .55, "codex": .45}
        self.assertEqual(why(both)[0], "Claude Code 55%, Codex 45%")
        hive = builder([("cli", 100)], evening); hive["projects"][0]["tools"] = {"shell": 86, "crew": 14}
        self.assertEqual(why(hive)[0], "14% of tool calls were subagents")
        many = builder([("web", 10)] * 22, evening)
        self.assertEqual(why(many)[0], "22 islands, none above 40%")
        weekend = builder([("web", 10)], evening); weekend["rhythm"]["weekdays"] = [1] * 5 + [3, 3]
        self.assertEqual(why(weekend)[0], "55% of your building happened on weekends")

    def test_archetypes_spread_across_many_kinds_of_builder(self):
        """2,000 synthetic builders: no archetype may claim more than 15%, and no first word more than 30%."""
        import math
        import random
        from collections import Counter

        def builder(rng, web_heavy=False):
            base = {"web": .62, "other": .1, "ai": .1, "cli": .07, "data": .04, "mobile": .04, "game": .03} if web_heavy else \
                {"web": .42, "other": .16, "ai": .13, "cli": .1, "data": .07, "mobile": .06, "game": .06}
            home = rng.choices(list(base), list(base.values()))[0]
            prefs = {kind: weight * (rng.uniform(2, 7) if kind == home else rng.uniform(.3, 1.5)) for kind, weight in base.items()}
            count = rng.choice([rng.randint(1, 3), rng.randint(4, 10), rng.randint(4, 10), rng.randint(11, 19), rng.randint(20, 45)])
            mode = rng.choices(["claude", "codex", "both"], [.6, .15, .25])[0]
            codex_mean = rng.uniform(.15, .6)
            crew_share = rng.choices([rng.uniform(0, .05), rng.uniform(.05, .15), rng.uniform(.1, .35)], [.7, .2, .1])[0]
            projects = []
            for index in range(count):
                codex = min(1.0, max(0.0, rng.gauss(codex_mean, .2))) if mode == "both" else float(mode == "codex")
                tools = {"shell": rng.randint(50, 500), "build": rng.randint(50, 500), "read": rng.randint(20, 300), "web": rng.randint(0, 80)}
                tools["crew"] = int(sum(tools.values()) * crew_share / (1 - crew_share) * rng.uniform(.6, 1.4))
                projects.append({"name": f"P{index}", "category": rng.choices(list(prefs), list(prefs.values()))[0], "tools": tools,
                                 "activity": int(math.exp(rng.gauss(6, 1.4))) + 1, "crews": {key: value for key, value in (("claude", 1 - codex), ("codex", codex)) if value}})
            # A day shift, an evening shift, late nights and early mornings, mixed differently for everyone.
            mix = [rng.gammavariate(alpha, 1) for alpha in ((1.0, 1.6, .45, .1) if web_heavy else (1.3, 1.1, .45, .15))]
            centres = (rng.uniform(10, 15.5), rng.uniform(19, 21.5), rng.uniform(23, 25.5), rng.uniform(5.5, 7.5))
            hours = [sum(weight * math.exp(-min(abs(hour - centre), 24 - abs(hour - centre)) ** 2 / (2 * width ** 2))
                         for weight, centre, width in zip(mix, centres, (2.8, 1.6, 1.6, 1.0))) for hour in range(24)]
            hours = [int(value / sum(hours) * 2000 * rng.uniform(.8, 1.2)) for value in hours]
            weekend = min(.6, max(.02, rng.betavariate(2.5, 7.5)))
            weekdays = [int((1 - weekend) * 200)] * 5 + [int(weekend * 500)] * 2
            return {"projects": projects, "rhythm": {"hours": hours, "weekdays": weekdays, "longestStreak": min(120, int(rng.expovariate(1 / 11)) + 1)}}

        for web_heavy, limit in ((False, .15), (True, .2)):
            rng = random.Random(7)
            titles = Counter(pelago.persona(builder(rng, web_heavy))["title"] for _ in range(2000))
            prefixes = Counter(title.split()[1] for title in titles.elements())
            self.assertLessEqual(titles.most_common(1)[0][1] / 2000, limit, titles.most_common(3))
            self.assertLessEqual(prefixes.most_common(1)[0][1] / 2000, .3, prefixes.most_common(3))
            self.assertGreaterEqual(len(titles), 60)

    def test_team_worlds_merge_shared_islands(self):
        def export(builder, projects, daily):
            data = pelago.demo_data()
            data.pop("demo")
            data["builder"] = builder
            data["projects"] = projects
            data["links"] = [{"a": projects[0]["id"], "b": projects[-1]["id"], "kind": "name", "word": "pelago"}]
            data["rhythm"] = {**data["rhythm"], "daily": daily}
            return data

        def project(pid, name, activity, sessions, shell, agent="claude"):
            return {"id": pid, "name": name, "agent": agent, "category": "web", "sessions": sessions, "messages": activity,
                    "activity": activity, "prompts": 10, "seed": activity, "crews": {agent: 1.0},
                    "firstActive": "2026-05-01T00:00:00+00:00", "lastActive": "2026-06-01T00:00:00+00:00",
                    "tokens": {"input": 10, "output": 5, "cached": 85, "total": 100}, "tools": {"shell": shell},
                    "models": [], "sessionSizes": [activity], "techSample": activity, "tech": {}}

        maya = export("Maya", [project("a1", "Pelago", 300, 3, 20), project("a2", "Notes", 50, 1, 2)], {"2026-05-01": 4, "2026-05-02": 1})
        noam = export("Noam", [project("b1", "pelago", 100, 2, 5, "codex"), project("b2", "CLI kit", 80, 1, 1, "codex")], {"2026-05-03": 2})
        with tempfile.TemporaryDirectory() as directory:
            paths = []
            for data in (maya, noam):
                path = Path(directory) / f"{data['builder'].lower()}.json"
                path.write_text(json.dumps(data), encoding="utf-8")
                paths.append(path)
            team = pelago.merge_team(pelago.load_team([Path(directory)]), "Crew")

        self.assertEqual(len(team["projects"]), 3)
        shared = next(p for p in team["projects"] if p["name"] == "Pelago")
        self.assertEqual((shared["sessions"], shared["activity"], shared["tokens"]["total"]), (5, 400, 200))
        self.assertEqual(shared["tools"], {"shell": 25})
        self.assertEqual(shared["builders"], {"Maya": 0.75, "Noam": 0.25})
        self.assertEqual(shared["work"]["Noam"], {"sessions": 2, "prompts": 10, "tokens": 100})
        self.assertTrue(all(member["title"].startswith("The ") and member["shared"] == 1 for member in team["team"]["members"]))
        self.assertEqual(shared["crews"], {"claude": 0.75, "codex": 0.25})
        self.assertEqual(shared["seed"], 300)  # the look of whoever built the most of it
        self.assertEqual(team["team"]["name"], "Crew")
        self.assertEqual([m["name"] for m in team["team"]["members"]], ["Maya", "Noam"])
        self.assertEqual(team["rhythm"]["longestStreak"], 3)
        ids = {p["id"] for p in team["projects"]}
        self.assertTrue(team["links"] and all(link["a"] in ids and link["b"] in ids for link in team["links"]))
        self.assertTrue(team["persona"]["title"].startswith("The "))

    def test_only_keeps_chosen_projects_and_their_rhythm(self):
        data = pelago.demo_data()
        for index, project in enumerate(data["projects"]):
            hours = [0] * 24
            hours[index % 24] = 5
            project["rhythm"] = {"hours": hours, "weekdays": [5, 0, 0, 0, 0, 0, 0], "daily": {f"2026-05-{index + 1:02d}": 5}}
        picked, missing = pelago.select_projects(data, ["atlas studio", " Tiny-Quest ", "Nowhere"])
        self.assertEqual(sorted(p["name"] for p in picked["projects"]), ["Atlas Studio", "Tiny Quest"])
        self.assertEqual(missing, ["Nowhere"])
        self.assertEqual(sum(picked["rhythm"]["hours"]), 10)
        self.assertEqual(picked["rhythm"]["activeDays"], 2)
        self.assertEqual(picked["sources"], [])
        ids = {p["id"] for p in picked["projects"]}
        self.assertTrue(all(link["a"] in ids and link["b"] in ids for link in picked["links"]))

    def test_shared_only_team_keeps_islands_built_together(self):
        team = pelago.merge_team(self._crew(), "Crew", shared_only=True)
        self.assertTrue(team["projects"])
        self.assertTrue(all(len(project["builders"]) > 1 for project in team["projects"]))
        for member in team["team"]["members"]:
            self.assertEqual(member["islands"], sum(1 for p in team["projects"] if member["name"] in p["builders"]))

    def _crew(self):
        base = pelago.demo_data()
        crew = []
        for index, name in enumerate(("Maya", "Noam")):
            data = json.loads(json.dumps(base))
            data["projects"] = data["projects"][:3] + data["projects"][3 + index::2]
            crew.append((name, pelago.enrich(data)))
        return crew

    def test_share_loop_posts_the_picture_and_keeps_the_demo_clean(self):
        root = Path(__file__).parents[1]
        script = (root / "assets" / "world.js").read_text(encoding="utf-8")
        template = (root / "assets" / "world-template.html").read_text(encoding="utf-8")
        for intent in ("https://x.com/intent/post?text=", "https://www.linkedin.com/feed/?shareActive=true&text=",
                       "https://bsky.app/intent/compose?text=", "https://www.threads.net/intent/post?text="):
            self.assertIn(intent, script)
        for platform in ("x", "linkedin", "bluesky", "threads"):
            self.assertIn(f'data-post="{platform}"', template)
        self.assertIn("Tip: post the image and put the link in the first comment.", template)
        # Posts link to the live demo, name the agents in words people search, and carry at most one hashtag.
        share = re.search(r"function shareText\(.*?\n}\n", script, re.S).group(0)
        self.assertIn("DEMO_URL", share)
        self.assertNotIn("REPO_URL", share)
        self.assertEqual(set(re.findall(r"#\w+", share)), {"#ClaudeCode"})
        self.assertIn("'Claude Code + Codex' : claude >= codex ? 'Claude Code' : 'Codex'", script)
        # Names in posts and file names go through sharedName(), which honours hide-names and the card's checkbox.
        file_name = re.search(r"function cardFileName\(\).*?\n}\n", script, re.S).group(0)
        for source in (share, file_name):
            self.assertIn("sharedName(", source)
            self.assertNotIn("nameOf(", source)
        self.assertIn("function sharedName(project) { return state.showNames ? nameOf(project) : ''; }", script)
        # The reel dissolves islands in whole pixels; nothing in the rise helpers fades with globalAlpha.
        for name in ("renderReelFrame", "foundingOrder", "riseAt", "renderMomentCard", "drawRisingIsland", "drawPuff"):
            self.assertIn(f"function {name}(", script)
        rise = script[script.index("function foundingOrder("):script.index("// The beats of the rise reel")]
        self.assertNotIn("globalAlpha", rise)
        self.assertIn("seconds: 12", script)
        # Owner share surfaces never appear in the sample world.
        self.assertIn("'#relicPopShare'", re.search(r"function markDemo\(\).*?\n}\n", script, re.S).group(0))
        self.assertIn("if (DATA.demo) return null;", re.search(r"function sharePill\(.*?\n}\n", script, re.S).group(0))

    def test_demo_team_world_renders(self):
        team = pelago.demo_team()
        self.assertEqual([member["name"] for member in team["team"]["members"]], ["Maya", "Noam", "Dana"])
        self.assertTrue(any(len(project["builders"]) == 3 for project in team["projects"]))
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "team.html"
            pelago.render_html(team, output)
            self.assertIn("Lighthouse Labs", output.read_text(encoding="utf-8"))
        # Relic reasons quote a technology's share of the messages read, so no count may outgrow its sample.
        for project in team["projects"]:
            self.assertGreaterEqual(project["techSample"], max(project["tech"].values(), default=0), project["name"])

    def test_readme_prompt_is_the_one_the_demo_copies(self):
        root = Path(__file__).parents[1]
        readme = (root / "README.md").read_text(encoding="utf-8")
        block = re.search(r"### 🧍 Just me\n\n```text\n(.*?)\n```", readme, re.S).group(1)
        prompt = re.search(r"const GET_PROMPT = String\.raw`(.*?)`;", (root / "assets" / "world.js").read_text(encoding="utf-8"), re.S).group(1)
        self.assertEqual(block, prompt)
        self.assertNotIn("${", prompt)
        self.assertTrue(all(len(line) <= 70 for line in prompt.splitlines()))
        self.assertIn("It only reads ~/.claude/projects and ~/.codex/sessions.", prompt)
        self.assertIn("## ⚡ Get yours in one prompt", readme)
        self.assertIn(f"{len(pelago.PREFIXES) * len(pelago.TITLES)} combinations", readme)

    def test_archetypes_are_listed_and_titles_name_the_world(self):
        data = pelago.demo_data()
        self.assertEqual(data["archetypes"]["prefixes"], list(pelago.PREFIXES))
        self.assertEqual(len(data["archetypes"]["prefixes"]) * len(data["archetypes"]["titles"]), 88)
        self.assertEqual(list(pelago.PERIODS), ["Morning", "Sunlit", "Twilight"])
        self.assertIn(data["persona"]["title"].split()[1], pelago.PREFIXES)
        self.assertEqual(len(data["projects"]), 14)
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "world.html"
            pelago.render_html(data, output)
            html = output.read_text(encoding="utf-8")
            self.assertIn("<title>Pelago · your AI coding history as a pixel-art world</title>", html)
            self.assertIn("YOUR CLAUDE CODE + CODEX HISTORY, MAPPED", html)
            self.assertIn('data-sprite="lg-falls"', html)
            self.assertIn("function openGetYours", html)
            self.assertNotIn('class="welcome-copy"', html)
            pelago.render_html(pelago.demo_team(), output)
            self.assertIn("<title>Lighthouse Labs · Pelago</title>", output.read_text(encoding="utf-8"))
            data.pop("demo")
            pelago.render_html(data, output)
            self.assertIn("<title>My Pelago · The world I built with AI</title>", output.read_text(encoding="utf-8"))

    def test_old_exports_are_enriched(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "old.json"
            legacy = pelago.demo_data()
            legacy.pop("persona"); legacy.pop("rhythm")
            source.write_text(json.dumps(legacy), encoding="utf-8")
            data = pelago.load_input(source)
            self.assertIn("persona", data)
            self.assertEqual(data["rhythm"]["activeDays"], 0)
            self.assertEqual([clue["label"] for clue in data["persona"]["clues"]], ["Two-Tide", "Harbormaster"])
            self.assertEqual(data["persona"]["clues"][0]["why"], "Claude Code 55%, Codex 45%")

    def test_tokens_tools_and_requests_are_counted(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            usage = {"input_tokens": 0, "output_tokens": 0, "iterations": [{"input_tokens": 10, "output_tokens": 5, "cache_read_input_tokens": 100}]}
            cwd = "/work/forge"
            write(home / ".claude" / "projects" / "-work-forge" / "s.jsonl", [
                claude_user(cwd, "please fix it"),
                claude_tool_result(cwd),
                claude_reply(cwd, "m1", tool="Bash", usage=usage),
                claude_reply(cwd, "m1", tool="Edit", usage=usage),
            ])
            write(home / ".codex" / "sessions" / "2026" / "rollout.jsonl", [
                codex_meta("/work/relay", "t1"),
                codex_user("ship the relay"),
                {"type": "response_item", "payload": {"type": "function_call", "name": "exec"}},
                {"type": "event_msg", "payload": {"type": "token_count", "info": {"total_token_usage": {"input_tokens": 50, "cached_input_tokens": 30, "output_tokens": 7}}}},
                {"type": "event_msg", "payload": {"type": "token_count", "info": {"total_token_usage": {"input_tokens": 90, "cached_input_tokens": 40, "output_tokens": 9}}}},
            ])

            projects = {project["name"]: project for project in pelago.scan(home)["projects"]}

            forge = projects["forge"]
            self.assertEqual(forge["prompts"], 1)
            self.assertEqual(forge["tokens"], {"input": 10, "output": 5, "cached": 100, "total": 115}, "one reply split over two records is billed once")
            self.assertEqual(forge["tools"], {"shell": 1, "build": 1})
            self.assertEqual(forge["models"], ["Opus"])
            self.assertEqual(forge["messages"], 3)
            relay = projects["relay"]
            self.assertEqual(relay["prompts"], 1)
            self.assertEqual(relay["tokens"]["total"], 50 + 9 + 40)
            self.assertEqual(relay["tools"], {"shell": 1})
            self.assertEqual(relay["sessionSizes"], [2])

    def test_links_connect_nested_folders_and_shared_names(self):
        projects = [
            ({"id": "core", "name": "Harborlight", "activity": 90}, "/work/harborlight"),
            ({"id": "spike", "name": "orbit platform v2", "activity": 10}, "/work/harborlight/docs/orbit-platform-v2"),
            ({"id": "steps", "name": "orbit ten steps", "activity": 40}, "/work/steps"),
            ({"id": "alone", "name": "new chat", "activity": 5}, "/work/chat"),
        ]
        links = pelago.find_links(projects)
        pairs = {(link["a"], link["b"], link["kind"]) for link in links}
        self.assertIn(("core", "spike", "nest"), pairs)
        self.assertIn(("spike", "steps", "name"), pairs)
        self.assertFalse(any("alone" in (link["a"], link["b"]) for link in links))
        self.assertNotIn("/work", json.dumps(links))

    def test_tech_relic_signals_are_whitelisted_counts(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            rows = [codex_meta("/work/shop", "t1")]
            rows += [codex_user(f"secret plan {i}: React page with Stripe checkout session, deploy via docker") for i in range(8)]
            write(home / ".codex" / "sessions" / "s.jsonl", rows)
            project = pelago.scan(home)["projects"][0]
            self.assertEqual(project["tech"], {"react": 8, "payments": 8, "docker": 8})
            self.assertNotIn("secret plan", json.dumps(project))

    def test_codex_subagent_threads_fold_into_their_parent_session(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            root = home / ".codex" / "sessions"
            write(root / "rollout-a.jsonl", [codex_meta("/work/app", "main-1"), codex_user("plan the release"), codex_reply("ok")])
            for name in ("b", "c"):
                write(root / f"rollout-{name}.jsonl", [codex_meta("/work/app", f"sub-{name}", parent="main-1"), codex_user("Guardian: review this step"), codex_reply("approved")])
            project = pelago.scan(home)["projects"][0]
            self.assertEqual(project["sessions"], 1)
            self.assertEqual(project["prompts"], 1, "subagent briefs are not requests the person typed")

    def test_session_metadata_files_are_not_sessions(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            root = home / ".claude" / "projects" / "-work-app"
            write(root / "s1.jsonl", [claude_user("/work/app", "hi")])
            (root / "s1").mkdir(parents=True, exist_ok=True)
            (root / "s1" / "custom-title.json").write_text(json.dumps({"type": "custom-title", "customTitle": "secret title", "cwd": "/work/app"}), encoding="utf-8")
            (root / "s1" / "agent-1.meta.json").write_text(json.dumps({"cwd": "/work/app"}), encoding="utf-8")
            result = pelago.scan(home)
            self.assertEqual(result["projects"][0]["sessions"], 1)
            self.assertNotIn("secret title", json.dumps(result))

    def test_split_replies_use_their_fullest_usage(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            cwd = "/work/app"
            early = {"input_tokens": 10, "output_tokens": 1, "cache_read_input_tokens": 100}
            final = {"input_tokens": 10, "output_tokens": 40, "cache_read_input_tokens": 100}
            steps = {"input_tokens": 5, "output_tokens": 5, "iterations": [{"input_tokens": 5, "output_tokens": 5}, {"input_tokens": 50, "output_tokens": 20, "cache_read_input_tokens": 300}]}
            write(home / ".claude" / "projects" / "-work-app" / "s.jsonl", [
                claude_user(cwd, "go"),
                claude_reply(cwd, "m1", usage=early),
                claude_reply(cwd, "m1", tool="Bash", usage=final),
                claude_reply(cwd, "m2", usage=steps),
            ])
            tokens = pelago.scan(home)["projects"][0]["tokens"]
            self.assertEqual(tokens["total"], (10 + 40 + 100) + (55 + 25 + 300))


if __name__ == "__main__":
    unittest.main()
