import importlib.util
import json
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

    def test_demo_team_world_renders(self):
        team = pelago.demo_team()
        self.assertEqual([member["name"] for member in team["team"]["members"]], ["Maya", "Noam", "Dana"])
        self.assertTrue(any(len(project["builders"]) == 3 for project in team["projects"]))
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "team.html"
            pelago.render_html(team, output)
            self.assertIn("Lighthouse Labs", output.read_text(encoding="utf-8"))

    def test_old_exports_are_enriched(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "old.json"
            legacy = pelago.demo_data()
            legacy.pop("persona"); legacy.pop("rhythm")
            source.write_text(json.dumps(legacy), encoding="utf-8")
            data = pelago.load_input(source)
            self.assertIn("persona", data)
            self.assertEqual(data["rhythm"]["activeDays"], 0)

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
