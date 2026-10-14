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


class PelagoTests(unittest.TestCase):
    def test_scan_aggregates_both_agents_without_persisting_content(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            claude = home / ".claude" / "projects" / "sample"
            codex = home / ".codex" / "sessions" / "2026" / "01"
            claude.mkdir(parents=True)
            codex.mkdir(parents=True)
            rows = [
                {"cwd": "/work/secret-web", "session_id": "a", "timestamp": "2026-01-02T00:00:00Z", "message": {"content": "React private prompt"}},
                {"cwd": "/work/secret-web", "session_id": "a", "timestamp": "2026-01-03T00:00:00Z", "message": {"content": "CSS implementation"}},
            ]
            (claude / "one.jsonl").write_text("\n".join(json.dumps(row) for row in rows), encoding="utf-8")
            (codex / "two.jsonl").write_text(json.dumps({"payload": {"cwd": "/work/agent-lab", "timestamp": "2026-02-01T00:00:00Z", "content": "LLM agent private"}, "session_id": "b"}), encoding="utf-8")

            result = pelago.scan(home)

            self.assertEqual(len(result["projects"]), 2)
            self.assertEqual({project["agent"] for project in result["projects"]}, {"claude", "codex"})
            serialized = json.dumps(result)
            self.assertNotIn("private prompt", serialized)
            self.assertNotIn("LLM agent private", serialized)
            self.assertEqual(next(p for p in result["projects"] if p["name"] == "secret web")["category"], "web")

    def test_invalid_lines_are_ignored(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            root = home / ".codex" / "sessions"
            root.mkdir(parents=True)
            (root / "session.jsonl").write_text('{bad}\n{"cwd":"/work/tool","content":"terminal cli"}\n', encoding="utf-8")
            result = pelago.scan(home)
            self.assertEqual(len(result["projects"]), 1)
            self.assertEqual(result["projects"][0]["category"], "cli")

    def test_demo_renders_self_contained_html(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "world.html"
            pelago.render_html(pelago.demo_data(), output)
            html = output.read_text(encoding="utf-8")
            self.assertIn("Atlas Studio", html)
            self.assertIn("Download PNG", html)
            self.assertNotIn("__PELAGO_DATA__", html)
            self.assertNotIn("__PELAGO_CSS__", html)
            self.assertNotIn("__PELAGO_JS__", html)
            self.assertNotIn("__PELAGO_ART__", html)
            self.assertNotIn("__PELAGO", html)
            self.assertIn("Reading your archipelago", html)
            # Hidden overlays (the story) must never swallow clicks.
            self.assertIn("[hidden] { display: none !important; }", html)
            self.assertIn("Spark Monolith", html)
            self.assertIn("Play your story", html)
            self.assertIn("The Midnight Harbormaster", html)
            self.assertLess(len(html), 3_000_000)

    def test_sessions_are_files_and_worktrees_fold_into_their_repo(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            root = home / ".claude" / "projects"
            main = root / "-work-atlas"
            tree = root / "-work-atlas--claude-worktrees-happy-otter-1a2b3c"
            sub = main / "s1" / "subagents"
            for folder in (main, tree, sub):
                folder.mkdir(parents=True)
            row = lambda cwd, uuid: json.dumps({"cwd": cwd, "uuid": uuid, "id": uuid, "timestamp": "2026-03-01T10:00:00Z", "content": "react"})
            (main / "s1.jsonl").write_text("\n".join(row("/work/atlas", f"m{i}") for i in range(5)), encoding="utf-8")
            (sub / "agent-x.jsonl").write_text(row("/work/atlas", "m9"), encoding="utf-8")
            (tree / "s2.jsonl").write_text(row("/work/atlas/.claude/worktrees/happy-otter-1a2b3c", "m10"), encoding="utf-8")

            result = pelago.scan(home)

            self.assertEqual(len(result["projects"]), 1)
            atlas = result["projects"][0]
            self.assertEqual(atlas["name"], "atlas")
            self.assertEqual(atlas["sessions"], 2)
            self.assertEqual(atlas["messages"], 7)

    def test_codex_file_uris_and_temp_checkouts(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            root = home / ".codex" / "sessions" / "2026"
            root.mkdir(parents=True)
            meta = {"type": "session_meta", "timestamp": "2026-03-01T10:00:00Z", "payload": {"cwd": "file:///Users/me/%D7%97%D7%A7%D7%99%D7%A8%D7%94"}}
            (root / "rollout-a.jsonl").write_text(json.dumps(meta) + "\n" + json.dumps({"timestamp": "2026-03-01T10:05:00Z", "content": "hello"}), encoding="utf-8")
            for name in ("b", "c"):
                tmp = {"timestamp": "2026-03-02T10:00:00Z", "payload": {"cwd": f"/private/tmp/run-{name}/repo"}}
                (root / f"rollout-{name}.jsonl").write_text(json.dumps(tmp), encoding="utf-8")

            names = {project["name"]: project for project in pelago.scan(home)["projects"]}

            self.assertIn("חקירה", names)
            self.assertEqual(names["חקירה"]["messages"], 2)
            self.assertEqual(names["Scratch waters"]["sessions"], 2)

    def test_rhythm_and_persona_are_aggregate_only(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            root = home / ".codex" / "sessions"
            root.mkdir(parents=True)
            rows = [{"cwd": "/work/quest", "timestamp": f"2026-04-0{day}T12:00:00Z", "content": "phaser game sprite"} for day in (1, 2, 3, 5)]
            (root / "s.jsonl").write_text("\n".join(json.dumps(row) for row in rows), encoding="utf-8")

            result = pelago.scan(home)

            rhythm = result["rhythm"]
            self.assertEqual(sum(rhythm["hours"]), 4)
            self.assertEqual(rhythm["activeDays"], 4)
            self.assertEqual(rhythm["longestStreak"], 3)
            self.assertTrue(result["persona"]["title"].endswith("Castle Builder"))
            self.assertNotIn("phaser", json.dumps(result))

    def test_persona_prefix_follows_rhythm(self):
        data = pelago.demo_data()
        self.assertEqual(data["persona"]["title"], "The Midnight Harbormaster")
        data["rhythm"]["hours"] = [0] * 5 + [50] * 4 + [1] * 15
        self.assertEqual(pelago.persona(data)["title"], "The Dawn Harbormaster")

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
            claude = home / ".claude" / "projects" / "-work-forge"
            codex = home / ".codex" / "sessions" / "2026"
            claude.mkdir(parents=True)
            codex.mkdir(parents=True)
            usage = {"input_tokens": 0, "output_tokens": 0, "iterations": [{"input_tokens": 10, "output_tokens": 5, "cache_read_input_tokens": 100}]}
            rows = [
                {"type": "user", "cwd": "/work/forge", "message": {"content": "please fix it"}},
                {"type": "user", "cwd": "/work/forge", "message": {"content": [{"type": "tool_result", "content": "ok"}]}},
                {"type": "assistant", "cwd": "/work/forge", "message": {"id": "m1", "model": "claude-opus-5-5", "usage": usage, "content": [{"type": "tool_use", "name": "Bash"}]}},
                {"type": "assistant", "cwd": "/work/forge", "message": {"id": "m1", "model": "claude-opus-5-5", "usage": usage, "content": [{"type": "tool_use", "name": "Edit"}]}},
            ]
            (claude / "s.jsonl").write_text("\n".join(json.dumps(row) for row in rows), encoding="utf-8")
            codex_rows = [
                {"type": "session_meta", "payload": {"cwd": "/work/relay"}},
                {"type": "event_msg", "payload": {"type": "task_started"}},
                {"type": "response_item", "payload": {"type": "function_call", "name": "exec"}},
                {"type": "event_msg", "payload": {"type": "token_count", "info": {"total_token_usage": {"input_tokens": 50, "cached_input_tokens": 30, "output_tokens": 7}}}},
                {"type": "event_msg", "payload": {"type": "token_count", "info": {"total_token_usage": {"input_tokens": 90, "cached_input_tokens": 40, "output_tokens": 9}}}},
            ]
            (codex / "rollout.jsonl").write_text("\n".join(json.dumps(row) for row in codex_rows), encoding="utf-8")

            projects = {project["name"]: project for project in pelago.scan(home)["projects"]}

            forge = projects["forge"]
            self.assertEqual(forge["prompts"], 1)
            self.assertEqual(forge["tokens"], {"input": 10, "output": 5, "cached": 100, "total": 115})
            self.assertEqual(forge["tools"], {"shell": 1, "build": 1})
            self.assertEqual(forge["models"], ["Opus"])
            relay = projects["relay"]
            self.assertEqual(relay["prompts"], 1)
            self.assertEqual(relay["tokens"]["total"], 50 + 9 + 40)
            self.assertEqual(relay["tools"], {"shell": 1})
            self.assertEqual(relay["sessionSizes"], [5])

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
            root = home / ".codex" / "sessions"
            root.mkdir(parents=True)
            rows = [{"cwd": "/work/shop", "content": f"secret plan {i}: React page with Stripe checkout session, deploy via docker"} for i in range(8)]
            (root / "s.jsonl").write_text("\n".join(json.dumps(row) for row in rows), encoding="utf-8")
            project = pelago.scan(home)["projects"][0]
            self.assertEqual(project["tech"], {"react": 8, "payments": 8, "docker": 8})
            self.assertNotIn("secret plan", json.dumps(project))


if __name__ == "__main__":
    unittest.main()
