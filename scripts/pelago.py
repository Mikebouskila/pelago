#!/usr/bin/env python3
"""Generate a privacy-safe Pelago world from local AI coding history."""

from __future__ import annotations

import argparse
import hashlib
import math
import json
import re
import sys
import webbrowser
from urllib.parse import unquote, urlparse
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable

MAX_FILES = 200_000
MAX_LINE_CHARS = 8 * 1024 * 1024
MAX_PROJECTS = 32
MAX_BUILDINGS = 64

# A fixed list of technologies. Only these ids and their mention counts are ever stored.
TECH_RULES = [
    ("react", r"\breact\b|\.jsx\b|\.tsx\b|usestate"),
    ("tailwind", r"tailwind"),
    ("typescript", r"typescript|tsconfig|\.ts\b"),
    ("python", r"\bpython3?\b|\.py\b|pip install"),
    ("rust", r"\brust\b|cargo\.toml|\.rs\b"),
    ("docker", r"\bdocker"),
    ("postgres", r"postgres|\bpsql\b|sqlite|\bsql\b"),
    ("pandas", r"\bpandas\b|\bnumpy\b|jupyter"),
    ("threejs", r"three\.js|\bthreejs\b|\bwebgl\b|\bshader"),
    ("swift", r"swiftui|\bswift\b|xcode"),
    ("playwright", r"playwright|puppeteer|selenium"),
    ("payments", r"\bstripe\b|checkout session|payment intent"),
    ("backend", r"supabase|firebase"),
    ("llm", r"anthropic|openai|\bllm\b|embeddings?\b"),
    ("mcp", r"\bmcp\b|model context protocol"),
    ("git", r"\bgit (?:commit|push|merge|rebase|checkout)|pull request"),
    ("gamedev", r"\bphaser\b|\bunity\b|\bgodot\b|tilemap"),
]
TECH_TRIGGERS = {
    "react": ("react", ".jsx", ".tsx", "usestate"), "tailwind": ("tailwind",), "typescript": ("typescript", "tsconfig", ".ts"),
    "python": ("python", ".py", "pip install"), "rust": ("rust", "cargo.toml", ".rs"), "docker": ("docker",),
    "postgres": ("postgres", "psql", "sqlite", "sql"), "pandas": ("pandas", "numpy", "jupyter"),
    "threejs": ("three", "webgl", "shader"), "swift": ("swift", "xcode"), "playwright": ("playwright", "puppeteer", "selenium"),
    "payments": ("stripe", "checkout session", "payment intent"), "backend": ("supabase", "firebase"),
    "llm": ("anthropic", "openai", "llm", "embedding"), "mcp": ("mcp", "model context protocol"),
    "git": ("git ", "pull request"), "gamedev": ("phaser", "unity", "godot", "tilemap"),
}
TECH_PATTERNS = [(name, TECH_TRIGGERS[name], re.compile(pattern, re.I)) for name, pattern in TECH_RULES]


def detect_tech(text: str) -> set[str]:
    """Cheap substring checks first; the precise pattern only runs when a keyword is present."""
    lowered = text[:3000].lower()
    found = set()
    for name, triggers, pattern in TECH_PATTERNS:
        for trigger in triggers:
            if trigger in lowered:
                if pattern.search(lowered):
                    found.add(name)
                break
    return found
TECH_MIN_MENTIONS = 6

TOOL_GROUPS = [
    ("crew", re.compile(r"^(agent|task\w*|sendmessage|send_message|wait_agent|spawn\w*|list_agents|workflow|teammate\w*)$", re.I)),
    ("build", re.compile(r"(edit|write|apply_patch|str_replace|create_file|notebook)", re.I)),
    ("shell", re.compile(r"^(bash|exec|exec_command|shell|local_shell\w*|monitor|run\w*|killshell|bashoutput)$", re.I)),
    ("read", re.compile(r"^(read|grep|glob|ls|view\w*|toolsearch|search_files|list_dir\w*|find\w*)$", re.I)),
    ("web", re.compile(r"(web|browser|chrome|navigate|computer|javascript|fetch|preview|screenshot|playwright)", re.I)),
]


@dataclass
class Project:
    key: str
    name: str
    agent: str
    category: str = "other"
    sessions: set[str] = field(default_factory=set)
    messages: int = 0
    activity: int = 0
    first_active: str = "9999-12-31T23:59:59+00:00"
    last_active: str = "1970-01-01T00:00:00+00:00"
    signals: Counter = field(default_factory=Counter)
    prompts: int = 0
    tokens: Counter = field(default_factory=Counter)
    tools: Counter = field(default_factory=Counter)
    models: Counter = field(default_factory=Counter)
    session_sizes: Counter = field(default_factory=Counter)
    crews: Counter = field(default_factory=Counter)
    tech: Counter = field(default_factory=Counter)
    analysed: int = 0
    rhythm: "Rhythm" = field(default_factory=lambda: Rhythm())

    def absorb(self, other: "Project") -> None:
        self.sessions |= other.sessions
        self.messages += other.messages
        self.activity += other.activity
        self.prompts += other.prompts
        self.analysed += other.analysed
        self.first_active = min(self.first_active, other.first_active)
        self.last_active = max(self.last_active, other.last_active)
        for mine, theirs in ((self.signals, other.signals), (self.tokens, other.tokens), (self.tools, other.tools),
                             (self.models, other.models), (self.session_sizes, other.session_sizes), (self.crews, other.crews), (self.tech, other.tech)):
            mine.update(theirs)
        self.rhythm.absorb(other.rhythm)

    def public(self) -> dict[str, Any]:
        seed = int(hashlib.sha256(self.key.encode()).hexdigest()[:8], 16)
        first = None if self.first_active.startswith("9999") else self.first_active
        last = None if self.last_active.startswith("1970") else self.last_active
        return {
            "id": hashlib.sha256(self.key.encode()).hexdigest()[:12],
            "name": self.name[:54],
            "agent": self.crews.most_common(1)[0][0] if self.crews else self.agent,
            "crews": {agent: round(weight / max(1, sum(self.crews.values())), 3) for agent, weight in self.crews.most_common()} or {self.agent: 1.0},
            "category": self.category,
            "sessions": max(1, len(self.sessions)),
            "messages": self.messages,
            "activity": self.activity,
            "firstActive": first or last,
            "lastActive": last,
            "seed": seed,
            "prompts": self.prompts,
            "tokens": {
                "input": self.tokens["input"], "output": self.tokens["output"], "cached": self.tokens["cached"],
                "total": self.tokens["input"] + self.tokens["output"] + self.tokens["cached"],
            },
            "tools": dict(self.tools.most_common()),
            "models": [name for name, _ in self.models.most_common(3)],
            "sessionSizes": sorted(self.session_sizes.values(), reverse=True)[:MAX_BUILDINGS],
            "techSample": self.analysed,
            "tech": {name: count for name, count in self.tech.most_common() if count >= TECH_MIN_MENTIONS},
            # When this project's work happened, so a world built from a few projects keeps only their rhythm.
            "rhythm": self.rhythm.buckets(),
        }


def _walk_values(value: Any, depth: int = 0) -> Iterable[tuple[str, Any]]:
    if depth > 5:
        return
    if isinstance(value, dict):
        for key, child in value.items():
            yield key, child
            yield from _walk_values(child, depth + 1)
    elif isinstance(value, list):
        for child in value[:100]:
            yield from _walk_values(child, depth + 1)


def deep_find(value: Any, names: tuple[str, ...]) -> Any:
    """Return the value of the highest-priority key found anywhere in the record."""
    found: dict[str, Any] = {}
    for key, child in _walk_values(value):
        if key in names and key not in found and child not in (None, ""):
            found[key] = child
            if key == names[0]:
                break
    return next((found[name] for name in names if name in found), None)


def extract_text(value: Any, depth: int = 0) -> str:
    if depth > 4 or value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return " ".join(extract_text(item, depth + 1) for item in value[:80])
    if isinstance(value, dict):
        if isinstance(value.get("text"), str):
            return value["text"]
        if isinstance(value.get("content"), str):
            return value["content"]
        return " ".join(extract_text(item, depth + 1) for item in list(value.values())[:80])
    return ""


WORKTREE = re.compile(r"^(?P<repo>.+?)[/\\]\.(?:claude|codex)[/\\]worktrees[/\\][^/\\]+")
CODEX_WORKTREE = re.compile(r"[/\\]\.codex[/\\]worktrees[/\\][^/\\]+[/\\](?P<repo>[^/\\]+)")


TEMP_ROOTS = ("/tmp/", "/private/tmp/", "/var/folders/", "/private/var/folders/")
SCRATCH = "scratch:"


def project_root(path_value: str) -> str:
    """Fold worktrees and throwaway checkouts back into the place they belong."""
    if path_value.startswith("file://"):
        path_value = unquote(urlparse(path_value).path)
    path_value = path_value.rstrip("/\\")
    if (path_value + "/").startswith(TEMP_ROOTS):
        return SCRATCH
    if match := WORKTREE.match(path_value):
        return match.group("repo")
    if match := CODEX_WORKTREE.search(path_value):
        return f"codex-worktree:{match.group('repo')}"
    return path_value


def clean_name(path_value: Any, fallback: str, home: Path | None = None) -> str:
    if isinstance(path_value, str) and path_value.strip():
        if path_value == SCRATCH:
            return "Scratch waters"
        if home and Path(path_value) == home:
            return "Home port"
        name = re.split(r"[/\\:]", path_value.rstrip("/\\"))[-1]
    else:
        name = fallback
    name = re.sub(r"[\u200e\u200f\u202a-\u202e\u2066-\u2069]", "", name)
    name = re.sub(r"[-_]+", " ", name).strip(" .-")
    name = re.sub(r"\s+[0-9a-f]{6,}$", "", name)
    return (name or "Untitled project")[:54]


def parse_date(value: Any) -> datetime | None:
    if isinstance(value, (int, float)):
        try:
            if value > 10_000_000_000:
                value /= 1000
            return datetime.fromtimestamp(value, tz=timezone.utc)
        except (ValueError, OSError, OverflowError):
            return None
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)
        except ValueError:
            return None
    return None


CATEGORY_RULES = [
    ("game", 1.6, r"\b(game|games|gameplay|sprite|sprites|phaser|unity|godot|tilemap|level design)\b"),
    ("mobile", 1.4, r"\b(ios|android|swiftui|react native|flutter|xcode|expo|mobile app)\b"),
    ("data", 1.0, r"\b(pandas|numpy|sql|postgres|analytics|dataframe|etl|jupyter|notebook|csv|bigquery|dataset)\b"),
    ("cli", 1.0, r"\b(cli|command line|argparse|subcommand|terminal tool|shell script)\b"),
    ("ai", 0.6, r"\b(llm|embedding|embeddings|openai|anthropic|rag|fine tune|mcp server|system prompt)\b"),
    ("web", 0.8, r"\b(react|next\.?js|vue|svelte|html|css|tailwind|website|frontend|landing page|vite)\b"),
]


def category_signals(text: str) -> Counter:
    lowered = text.lower()
    return Counter({kind: len(re.findall(pattern, lowered)) * weight for kind, weight, pattern in CATEGORY_RULES})


def pick_category(scores: Counter, minimum: float = 1) -> str:
    if not scores:
        return "other"
    kind, score = max(scores.items(), key=lambda item: item[1])
    return kind if score >= minimum else "other"


def classify(text: str, minimum: float = 1) -> str:
    return pick_category(category_signals(text), minimum)


def _iter_records(path: Path) -> Iterable[dict[str, Any]]:
    """Stream a transcript line by line. Every line is read: big sessions are the ones that matter most."""
    try:
        with path.open("r", encoding="utf-8", errors="replace") as handle:
            for line in handle:
                # A single absurd line (a pasted binary, say) is skipped rather than parsed.
                if len(line) > MAX_LINE_CHARS:
                    continue
                try:
                    value = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if isinstance(value, dict):
                    yield value
    except OSError:
        return


def tool_group(name: str) -> str:
    bare = name.split("__")[-1] if name.startswith("mcp__") else name
    for group, pattern in TOOL_GROUPS:
        if pattern.search(bare) or pattern.search(name):
            return group
    return "other"


def model_family(name: str) -> str | None:
    lowered = name.lower()
    for family in ("opus", "sonnet", "haiku", "fable"):
        if family in lowered:
            return family.capitalize()
    if lowered.startswith(("gpt", "o1", "o3", "o4", "codex")):
        return "GPT"
    return None


def _usage_tokens(usage: dict[str, Any]) -> tuple[int, int, int]:
    def read(source: dict[str, Any]) -> tuple[int, int, int]:
        number = lambda key: int(source.get(key) or 0) if isinstance(source.get(key), (int, float)) else 0
        return (number("input_tokens") + number("cache_creation_input_tokens"), number("output_tokens"), number("cache_read_input_tokens"))
    top = read(usage)
    if isinstance(usage.get("iterations"), list):
        # Multi-step replies report each step; the top level sometimes holds only the last one.
        parts = [read(item) for item in usage["iterations"] if isinstance(item, dict)]
        steps = tuple(sum(part[index] for part in parts) for index in range(3))
        if sum(steps) > sum(top):
            top = steps
    return top


NOT_TYPED = ("<", "This session is being continued", "[Request interrupted", "Caveat:", "# AGENTS.md")


def typed_text(content: Any) -> str | None:
    """The text of a message a person typed, or None for tool results, injected context and notices."""
    if isinstance(content, str):
        text = content
    elif isinstance(content, list):
        blocks = [block for block in content if isinstance(block, dict)]
        if not blocks or any(block.get("type") == "tool_result" for block in blocks):
            return None
        text = " ".join(str(block.get("text", "")) for block in blocks if block.get("type") in ("text", "input_text"))
    else:
        return None
    text = text.strip()
    return text if text and not text.startswith(NOT_TYPED) else None


def read_work(record: dict[str, Any], agent: str, seen: dict[str, tuple[int, int, int]], subagent: bool = False) -> dict[str, Any]:
    """Pull countable work out of one record.

    message: a real conversation turn (person or agent, tool calls included), each agent reply counted once.
    prompt:  something the person typed. Subagent briefs, notices and summaries are not prompts.
    """
    work: dict[str, Any] = {"message": False, "prompt": False, "tools": [], "model": None, "tokens": None, "cumulative": None}
    if agent == "claude":
        message = record.get("message") if isinstance(record.get("message"), dict) else {}
        content = message.get("content")
        kind = record.get("type")
        if kind == "user":
            work["message"] = True
            work["prompt"] = (not subagent and not record.get("isSidechain") and not record.get("isMeta")
                              and not record.get("isCompactSummary") and typed_text(content) is not None)
        elif kind == "assistant":
            message_id = message.get("id")
            usage = _usage_tokens(message["usage"]) if isinstance(message.get("usage"), dict) else None
            if not message_id or message_id not in seen:
                work["message"] = True
                work["tokens"] = usage
                if message_id:
                    seen[message_id] = usage or (0, 0, 0)
            elif usage and sum(usage) > sum(seen[message_id]):
                # A later record of the same reply carries fuller usage: add only the difference.
                work["tokens"] = tuple(max(0, new - old) for new, old in zip(usage, seen[message_id]))
                seen[message_id] = usage
            if isinstance(content, list):
                work["tools"] = [block.get("name", "") for block in content if isinstance(block, dict) and block.get("type") == "tool_use"]
            if isinstance(message.get("model"), str):
                work["model"] = message["model"]
    else:
        payload = record.get("payload") if isinstance(record.get("payload"), dict) else {}
        kind = payload.get("type")
        if record.get("type") == "response_item":
            if kind in ("function_call", "custom_tool_call", "local_shell_call"):
                work["message"] = True
                work["tools"] = [payload.get("name") or "shell"]
            elif kind == "agent_message" or (kind == "message" and payload.get("role") == "assistant"):
                work["message"] = True
            elif kind == "message" and payload.get("role") == "user":
                typed = typed_text(payload.get("content"))
                work["message"] = typed is not None or subagent
                work["prompt"] = not subagent and typed is not None
        elif kind == "token_count" and isinstance(payload.get("info"), dict):
            total = payload["info"].get("total_token_usage") or {}
            cached = int(total.get("cached_input_tokens") or 0)
            work["cumulative"] = (max(0, int(total.get("input_tokens") or 0) - cached), int(total.get("output_tokens") or 0), cached)
        if record.get("type") == "turn_context" and isinstance(payload.get("model"), str):
            work["model"] = payload["model"]
    return work


def record_cwd(record: dict[str, Any]) -> Any:
    """The working directory of the record itself, never one mentioned inside a tool call."""
    for holder in (record, record.get("payload") if isinstance(record.get("payload"), dict) else {}):
        for name in ("cwd", "project_path", "projectPath", "working_directory"):
            if isinstance(holder.get(name), str) and holder[name].strip():
                return holder[name]
    return None


def record_time(record: dict[str, Any]) -> Any:
    for holder in (record, record.get("payload") if isinstance(record.get("payload"), dict) else {}):
        for name in ("timestamp", "created_at", "createdAt", "time"):
            if holder.get(name) not in (None, ""):
                return holder[name]
    return None


def _session_for(path: Path) -> str:
    """One transcript file is one session; Claude subagent files belong to their parent."""
    if path.parent.name == "subagents":
        return path.parent.parent.name
    return path.stem


def _fallback_from_path(path: Path, root: Path, agent: str) -> str:
    if agent == "claude":
        try:
            encoded = path.relative_to(root).parts[0]
        except (ValueError, IndexError):
            return path.stem
        encoded = encoded.split("--claude-worktrees-")[0]
        chunks = [chunk for chunk in encoded.split("-") if chunk]
        return chunks[-1] if chunks else path.stem
    return "Codex session"


class Rhythm:
    """Counts when work happened. Only hour/weekday/day buckets are kept."""

    def __init__(self) -> None:
        self.hours = [0] * 24
        self.weekdays = [0] * 7
        self.days: Counter[str] = Counter()

    def add(self, timestamp: datetime) -> None:
        local = timestamp.astimezone()
        self.hours[local.hour] += 1
        self.weekdays[local.weekday()] += 1
        self.days[local.date().isoformat()] += 1

    def absorb(self, other: "Rhythm | dict[str, Any]") -> None:
        source = other.buckets() if isinstance(other, Rhythm) else other
        self.hours = [a + b for a, b in zip(self.hours, source.get("hours") or [0] * 24)]
        self.weekdays = [a + b for a, b in zip(self.weekdays, source.get("weekdays") or [0] * 7)]
        self.days.update(source.get("daily") or {})

    def buckets(self) -> dict[str, Any]:
        return {"hours": list(self.hours), "weekdays": list(self.weekdays), "daily": dict(sorted(self.days.items()))}

    def public(self) -> dict[str, Any]:
        days = sorted(self.days)
        longest = current = 0
        previous = None
        for day in days:
            date = datetime.fromisoformat(day).date()
            current = current + 1 if previous and (date - previous).days == 1 else 1
            longest = max(longest, current)
            previous = date
        busiest = max(self.days.items(), key=lambda item: item[1])[0] if self.days else None
        return {
            "hours": self.hours,
            "weekdays": self.weekdays,
            "activeDays": len(days),
            "longestStreak": longest,
            "busiestDay": busiest,
            "daily": dict(sorted(self.days.items())),
            "firstDay": days[0] if days else None,
            "lastDay": days[-1] if days else None,
        }


REALM_OF = {"web": "harbor", "mobile": "garden", "other": "wilds", "ai": "observatory", "cli": "forge", "data": "archive", "game": "citadel"}
TITLES = {
    "harbor": "Harbormaster", "garden": "Gardener", "wilds": "Wayfinder", "observatory": "Stargazer",
    "forge": "Toolsmith", "archive": "Archivist", "citadel": "Castle Builder", "atlas": "Cartographer",
}
REALM_LINES = {
    "harbor": "You build places people arrive at: interfaces, apps, front doors.",
    "garden": "You grow things that live in a pocket: small screens, gentle taps.",
    "wilds": "You build off the map, where no category quite fits.",
    "observatory": "You build things that listen and think: agents, models, signals.",
    "forge": "You build the tools other builders reach for: commands, scripts, pipes.",
    "archive": "You build order out of noise: data, measures, careful terraces.",
    "citadel": "You build worlds to play in: rules, quests, secret paths.",
    "atlas": "No single realm holds you: your islands span the whole map.",
}
# Strong rhythms and rare habits name you first; everyone else is named for the part of the day they build in.
PERIODS = (
    ("Morning", range(9, 12), "You do your best building in the bright first hours."),
    ("Sunlit", range(12, 17), "Your islands rise in broad daylight."),
    ("Twilight", range(17, 22), "Your best work arrives as the lamps come on."),
)


def persona(data: dict[str, Any]) -> dict[str, Any]:
    """Derive a playful, non-evaluative archetype from aggregate signals."""
    projects = data.get("projects") or []
    rhythm = data.get("rhythm") or {}
    realm_weight: Counter[str] = Counter()
    agent_weight: Counter[str] = Counter()
    tool_weight: Counter[str] = Counter()
    for project in projects:
        weight = max(1, int(project.get("activity") or 0))
        realm_weight[REALM_OF.get(project.get("category"), "wilds")] += weight
        tool_weight.update(project.get("tools") or {})
        for agent, share in (project.get("crews") or {project.get("agent", "claude"): 1.0}).items():
            agent_weight[agent] += weight * share
    realm = "harbor"
    if realm_weight:
        realm, top = realm_weight.most_common(1)[0]
        if len(realm_weight) >= 3 and top / sum(realm_weight.values()) < 0.35:
            realm = "atlas"

    hours = rhythm.get("hours") or [0] * 24
    weekdays = rhythm.get("weekdays") or [0] * 7
    total = sum(hours)
    peak = max(range(24), key=lambda hour: hours[hour]) if total else None
    night = sum(hours[hour] for hour in (22, 23, 0, 1, 2, 3, 4)) / total if total else 0
    dawn = sum(hours[hour] for hour in range(5, 9)) / total if total else 0
    weekend = (weekdays[5] + weekdays[6]) / sum(weekdays) if sum(weekdays) else 0
    activity = sum(p.get("activity", 0) for p in projects)
    top_share = max((p.get("activity", 0) for p in projects), default=0) / max(1, activity)
    total_agents = sum(agent_weight.values())
    both = len(agent_weight) > 1 and min(agent_weight.values()) / total_agents > 0.25
    crew = tool_weight["crew"] / max(1, sum(tool_weight.values()))

    if night > 0.3:
        prefix, line = "Midnight", "Your lamps stay lit long after the harbor sleeps."
    elif dawn > 0.25:
        prefix, line = "Dawn", "You raise the sails before anyone else is awake."
    elif weekend > 0.4:
        prefix, line = "Weekend", "Saturdays are when your islands rise."
    elif both:
        prefix, line = "Two-Tide", "You sail with two crews and know when to call each."
    elif (rhythm.get("longestStreak") or 0) >= 30:
        prefix, line = "Unbroken", "Day after day, you came back to the shore."
    elif crew > 0.12:
        prefix, line = "Hive", "You rarely sail alone: subagents fan out from every harbor."
    elif len(projects) >= 20 and top_share < 0.4:
        prefix, line = "Wandering", "You leave a new island in your wake every few weeks."
    elif total:
        prefix, _, line = max(PERIODS, key=lambda period: sum(hours[hour] for hour in period[1]))
    else:
        prefix, line = "Steady", "You keep returning, and the islands keep growing."
    if top_share > 0.6 and len(projects) > 1:
        line += " One island holds most of your heart."
    return {
        "title": f"The {prefix} {TITLES[realm]}",
        "realm": realm,
        "line": line,
        "realmLine": REALM_LINES[realm],
        "peakHour": peak,
    }


def enrich(data: dict[str, Any]) -> dict[str, Any]:
    data.setdefault("rhythm", Rhythm().public())
    data.setdefault("links", [])
    data["persona"] = persona(data)
    return data


NAME_STOPWORDS = {
    "new", "project", "projects", "scratch", "waters", "chat", "repo", "test", "tests", "untitled", "home", "port",
    "codex", "claude", "agent", "agents", "session", "app", "lab", "the", "and", "with", "main", "docs", "assets",
}


def name_tokens(name: str) -> set[str]:
    return {token for token in re.split(r"[^\w]+", name.casefold()) if len(token) >= 4 and not token.isdigit() and token not in NAME_STOPWORDS}


def find_links(projects: list[tuple[dict[str, Any], str]], per_island: int = 4) -> list[dict[str, str]]:
    """Relate islands that live inside one another's folder or share a distinctive name."""
    candidates = []
    umbrella = {"Home port", "Scratch waters"}
    for index, (first, first_key) in enumerate(projects):
        for second, second_key in projects[index + 1:]:
            if umbrella & {first["name"], second["name"]}:
                continue
            if first_key.startswith(second_key.rstrip("/") + "/") or second_key.startswith(first_key.rstrip("/") + "/"):
                candidates.append((2, first, second, "nest", ""))
                continue
            shared = sorted(name_tokens(first["name"]) & name_tokens(second["name"]))
            if shared:
                candidates.append((1, first, second, "name", shared[0]))
    candidates.sort(key=lambda item: (item[0], min(item[1]["activity"], item[2]["activity"])), reverse=True)
    degree: Counter[str] = Counter()
    links = []
    for _, first, second, kind, word in candidates:
        if degree[first["id"]] >= per_island or degree[second["id"]] >= per_island:
            continue
        degree[first["id"]] += 1
        degree[second["id"]] += 1
        links.append({"a": first["id"], "b": second["id"], "kind": kind, "word": word})
    return links


def scan(home: Path, since_days: int | None = None) -> dict[str, Any]:
    roots = [("claude", home / ".claude" / "projects"), ("codex", home / ".codex" / "sessions")]
    projects: dict[str, Project] = {}
    source_info: list[dict[str, Any]] = []
    threshold = datetime.now(timezone.utc) - timedelta(days=since_days) if since_days else None
    rhythm = Rhythm()

    for agent, root in roots:
        files = 0
        accepted = 0
        if root.exists():
            paths = root.rglob("*")
            for path in paths:
                if files >= MAX_FILES:
                    break
                # Transcripts are .jsonl; side files such as custom-title.json are metadata, not sessions.
                if not path.is_file() or path.suffix != ".jsonl":
                    continue
                files += 1
                fallback = _fallback_from_path(path, root, agent)
                session = _session_for(path)
                file_project: str | None = None
                file_had_record = False
                seen_messages: dict[str, tuple[int, int, int]] = {}
                cumulative: tuple[int, int, int] | None = None
                project = None
                subagent = path.parent.name == "subagents"
                for record in _iter_records(path):
                    # Codex writes each subagent thread to its own file; fold it into the thread that spawned it.
                    if agent == "codex" and record.get("type") == "session_meta" and isinstance(record.get("payload"), dict):
                        parent = record["payload"].get("parent_thread_id")
                        subagent = bool(parent)
                        thread = parent or record["payload"].get("id")
                        if isinstance(thread, str) and thread:
                            session = thread
                    timestamp = parse_date(record_time(record))
                    found_path = record_cwd(record)
                    if isinstance(found_path, str):
                        file_project = project_root(found_path)
                    if threshold and timestamp and timestamp < threshold:
                        continue
                    work = read_work(record, agent, seen_messages, subagent)
                    if work["cumulative"]:
                        cumulative = work["cumulative"]
                    if not work["message"] and not work["tools"] and not work["tokens"]:
                        continue
                    key = file_project or f"{agent}:{fallback}"
                    project = projects.setdefault(key, Project(key=key, name=clean_name(file_project, fallback, home), agent=agent))
                    if not work["message"]:
                        # A later block of a reply already counted: only its tool calls are new.
                        project.tools.update(tool_group(name) for name in work["tools"] if name)
                        if work["tokens"]:
                            project.tokens.update(dict(zip(("input", "output", "cached"), work["tokens"])))
                        continue
                    text = extract_text(record)
                    project.messages += 1
                    weight = max(1, min(24, (len(text) + 359) // 360))
                    project.activity += weight
                    project.crews[agent] += weight
                    project.sessions.add(session)
                    project.session_sizes[session] += 1
                    # Big projects are sampled: every message until 3,000, then one in twenty.
                    if project.analysed < 3000 or project.messages % 20 == 0:
                        project.analysed += 1
                        project.signals.update(category_signals(text[:1500]))
                        project.tech.update(detect_tech(text))
                    project.prompts += int(work["prompt"])
                    project.tools.update(tool_group(name) for name in work["tools"] if name)
                    if work["model"] and (family := model_family(work["model"])):
                        project.models[family] += 1
                    if work["tokens"]:
                        project.tokens.update(dict(zip(("input", "output", "cached"), work["tokens"])))
                    if timestamp:
                        rhythm.add(timestamp)
                        project.rhythm.add(timestamp)
                        if timestamp.isoformat() > project.last_active:
                            project.last_active = timestamp.isoformat()
                        if timestamp.isoformat() < project.first_active:
                            project.first_active = timestamp.isoformat()
                    file_had_record = True
                if cumulative and project is not None:
                    project.tokens.update(dict(zip(("input", "output", "cached"), cumulative)))
                accepted += int(file_had_record)
        source_info.append({"agent": agent, "available": root.exists(), "files": files, "sessions": accepted})

    merged: dict[str, Project] = {}
    for project in sorted(projects.values(), key=lambda item: item.activity, reverse=True):
        twin = merged.setdefault(project.name.casefold(), project)
        if twin is not project:
            twin.absorb(project)

    public_projects = []
    for project in merged.values():
        name_category = classify(project.name, minimum=0.5)
        project.category = name_category if name_category != "other" else pick_category(project.signals)
        public_projects.append((project.public(), project.key))
    public_projects.sort(key=lambda pair: (pair[0]["activity"], pair[0]["lastActive"] or ""), reverse=True)
    kept = public_projects[:MAX_PROJECTS]
    return enrich({
        "links": find_links(kept),
        "version": 2,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "projects": [public for public, _ in kept],
        "sources": source_info,
        "rhythm": rhythm.public(),
    })


DEMO_TECH = {
    "Lumen Docs": {"react": 140, "tailwind": 120},
    "Kestrel": {"llm": 160, "mcp": 50},
    "Pixel Forge": {"gamedev": 90, "threejs": 40},
    "Atlas Studio": {"react": 420, "typescript": 380, "payments": 40},
    "Orbit Agent": {"llm": 300, "python": 260, "docker": 30},
    "Tiny Quest": {"gamedev": 210, "typescript": 50},
    "Northstar": {"pandas": 140, "python": 110},
    "Signal CLI": {"rust": 90},
    "Pocket Notes": {"swift": 120},
}


def demo_data() -> dict[str, Any]:
    names = [
        # name, agent, category, sessions, messages, activity, prompts, tokens, days since active, tool mix
        ("Atlas Studio", "claude", "web", 41, 2860, 9200, 640, 182_000_000, 0, {"build": 1900, "shell": 1300, "read": 1100, "web": 420, "crew": 90}),
        ("Orbit Agent", "codex", "ai", 29, 1940, 6100, 410, 96_000_000, 2, {"shell": 1500, "build": 700, "crew": 300, "read": 200}),
        ("Tiny Quest", "claude", "game", 22, 1210, 4400, 300, 41_000_000, 6, {"build": 900, "shell": 500, "read": 300, "web": 120}),
        ("Northstar", "codex", "data", 18, 980, 3500, 220, 23_000_000, 11, {"shell": 800, "read": 400, "build": 250}),
        ("Signal CLI", "codex", "cli", 14, 620, 2100, 150, 8_600_000, 75, {"shell": 600, "build": 300, "read": 120}),
        ("Pocket Notes", "claude", "mobile", 12, 540, 1800, 120, 6_200_000, 19, {"build": 380, "shell": 200, "web": 60}),
        ("Paper Trail", "codex", "web", 8, 300, 900, 70, 2_400_000, 130, {"build": 160, "shell": 120, "read": 40}),
        ("Sunday Lab", "claude", "other", 5, 140, 420, 30, 700_000, 26, {"shell": 50, "web": 30, "crew": 10}),
        ("Lumen Docs", "claude", "web", 16, 820, 2600, 170, 12_400_000, 3, {"build": 500, "read": 300, "web": 90}),
        ("Tidepool", "codex", "data", 11, 560, 1700, 110, 5_100_000, 9, {"shell": 300, "read": 140}),
        ("Kestrel", "claude", "ai", 13, 700, 2200, 140, 9_800_000, 1, {"shell": 400, "crew": 60, "build": 200}),
        ("Pixel Forge", "claude", "game", 9, 430, 1300, 90, 3_900_000, 40, {"build": 260, "shell": 120}),
        ("Harbor API", "codex", "web", 7, 260, 800, 55, 1_900_000, 70, {"shell": 160, "build": 80}),
        ("Night Owl", "claude", "cli", 6, 190, 560, 40, 1_100_000, 2, {"shell": 120, "build": 40}),
    ]
    projects = []
    now = datetime.now(timezone.utc)
    for index, (name, agent, category, sessions, messages, activity, prompts, tokens, idle, tools) in enumerate(names):
        key = f"demo:{name}"
        seed = int(hashlib.sha256(key.encode()).hexdigest()[:8], 16)
        sizes = sorted((max(4, int(messages / sessions * (0.3 + ((seed >> (step % 24)) & 15) / 9))) for step in range(sessions)), reverse=True)
        projects.append({
            "id": hashlib.sha256(key.encode()).hexdigest()[:12], "name": name, "agent": agent,
            "category": category, "sessions": sessions, "messages": messages, "activity": activity,
            "firstActive": (now - timedelta(days=90 + index * 17)).isoformat(),
            "lastActive": (now - timedelta(days=idle)).isoformat(),
            "seed": seed, "prompts": prompts,
            "tokens": {"input": tokens // 9, "output": tokens // 40, "cached": tokens - tokens // 9 - tokens // 40, "total": tokens},
            "tools": tools, "models": ["Opus", "Sonnet"] if agent == "claude" else ["GPT"], "sessionSizes": sizes[:MAX_BUILDINGS],
            "tech": DEMO_TECH.get(name, {}),
            "crews": {"claude": 0.62, "codex": 0.38} if name == "Atlas Studio" else {"codex": 0.7, "claude": 0.3} if name == "Orbit Agent" else {agent: 1.0},
        })
    hours = [26, 17, 9, 4, 1, 0, 1, 2, 5, 9, 12, 11, 8, 10, 13, 15, 14, 12, 13, 18, 24, 31, 38, 34]
    # A plausible calendar: busy weekdays, quiet stretches, and a long streak leading up to today.
    demo_rhythm = Rhythm()
    for back in range(209, -1, -1):
        day = now - timedelta(days=back)
        busy = back < 23 or (back % 9 not in (0, 4) and back % 31 > 3)
        for _ in range(int(abs(math.sin(back * 1.7) * 24 + math.sin(back / 9) * 18) + 3) if busy else 0):
            demo_rhythm.days[day.astimezone().date().isoformat()] += 1
    rhythm = {**demo_rhythm.public(), "hours": hours, "weekdays": [41, 46, 44, 39, 35, 52, 48]}
    by_name = {project["name"]: project["id"] for project in projects}
    links = [
        {"a": by_name["Atlas Studio"], "b": by_name["Paper Trail"], "kind": "nest", "word": ""},
        {"a": by_name["Atlas Studio"], "b": by_name["Pocket Notes"], "kind": "name", "word": "atlas"},
        {"a": by_name["Orbit Agent"], "b": by_name["Signal CLI"], "kind": "name", "word": "orbit"},
        {"a": by_name["Northstar"], "b": by_name["Sunday Lab"], "kind": "nest", "word": ""},
        {"a": by_name["Atlas Studio"], "b": by_name["Lumen Docs"], "kind": "nest", "word": ""},
        {"a": by_name["Northstar"], "b": by_name["Tidepool"], "kind": "name", "word": "tide"},
        {"a": by_name["Tiny Quest"], "b": by_name["Pixel Forge"], "kind": "nest", "word": ""},
    ]
    return enrich({"version": 2, "demo": True, "generatedAt": now.isoformat(), "projects": projects, "links": links, "rhythm": rhythm, "sources": [
        {"agent": "claude", "available": True, "files": 4, "sessions": 4},
        {"agent": "codex", "available": True, "files": 4, "sessions": 4},
    ]})


def load_input(path: Path) -> dict[str, Any]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or not isinstance(data.get("projects"), list):
        raise ValueError("Input must be a Pelago JSON export with a projects array")
    return enrich(data)


def island_key(name: str) -> str:
    return re.sub(r"[^0-9a-z]+", "", name.casefold()) or name


def select_projects(data: dict[str, Any], names: list[str]) -> tuple[dict[str, Any], list[str]]:
    """Keep only the named projects (matched ignoring case and punctuation), and only their rhythm."""
    wanted = {island_key(name): name.strip() for name in names if name.strip()}
    kept = [project for project in data.get("projects") or [] if island_key(project["name"]) in wanted]
    missing = [name for key, name in wanted.items() if key not in {island_key(project["name"]) for project in kept}]
    ids = {project["id"] for project in kept}
    rhythm = Rhythm()
    if all(project.get("rhythm") for project in kept):
        for project in kept:
            rhythm.absorb(project["rhythm"])
    # Nothing about the projects left out survives: not their rhythm, links, or how many files were scanned.
    selected = {key: value for key, value in data.items() if key not in ("persona", "rhythm", "sources")}
    selected.update(projects=kept, sources=[], links=[link for link in data.get("links") or [] if link.get("a") in ids and link.get("b") in ids],
                    rhythm=rhythm.public())
    return enrich(selected), missing


def merge_team(exports: list[tuple[str, dict[str, Any]]], team_name: str | None = None, shared_only: bool = False) -> dict[str, Any]:
    """Merge several people's aggregate exports into one archipelago.

    Projects with the same name (ignoring case and punctuation) become one island built by everyone who
    worked on it. Only the aggregates in each export are used; nothing is rescanned.
    """
    islands: dict[str, dict[str, Any]] = {}
    contributions: dict[str, Counter[str]] = {}
    work_by: dict[str, dict[str, Counter[str]]] = {}
    rhythm = Rhythm()
    members = []
    id_map: dict[tuple[int, str], str] = {}
    for index, (builder, data) in enumerate(exports):
        projects = data.get("projects") or []
        members.append({
            "name": builder,
            "title": (data.get("persona") or persona(data))["title"],
            "islands": len(projects),
            "sessions": sum(project.get("sessions", 0) for project in projects),
            "tokens": sum((project.get("tokens") or {}).get("total", 0) for project in projects),
            "activity": sum(project.get("activity", 0) for project in projects),
        })
        source = data.get("rhythm") or {}
        rhythm.hours = [a + b for a, b in zip(rhythm.hours, (source.get("hours") or [0] * 24))]
        rhythm.weekdays = [a + b for a, b in zip(rhythm.weekdays, (source.get("weekdays") or [0] * 7))]
        rhythm.days.update(source.get("daily") or {})
        for project in projects:
            key = island_key(project["name"])
            id_map[(index, project["id"])] = hashlib.sha256(f"team:{key}".encode()).hexdigest()[:12]
            weight = max(1, int(project.get("activity") or 0))
            contributions.setdefault(key, Counter())[builder] += weight
            work = work_by.setdefault(key, {}).setdefault(builder, Counter())
            work.update({"sessions": int(project.get("sessions") or 0), "prompts": int(project.get("prompts") or 0),
                         "tokens": int((project.get("tokens") or {}).get("total") or 0)})
            island = islands.get(key)
            if island is None:
                islands[key] = island = {
                    "id": id_map[(index, project["id"])], "name": project["name"], "seed": project.get("seed", 0),
                    "category": project.get("category", "other"), "lead": weight,
                    "sessions": 0, "messages": 0, "activity": 0, "prompts": 0, "techSample": 0,
                    "firstActive": project.get("firstActive"), "lastActive": project.get("lastActive"),
                    "tokens": Counter(), "tools": Counter(), "tech": Counter(), "crews": Counter(), "models": Counter(), "sessionSizes": [],
                    "rhythm": Rhythm(), "timed": True,
                }
            elif weight > island["lead"]:
                # The island keeps the look and realm of whoever built the most of it.
                island.update(name=project["name"], seed=project.get("seed", 0), category=project.get("category", "other"), lead=weight)
            for field_name in ("sessions", "messages", "activity", "prompts"):
                island[field_name] += int(project.get(field_name) or 0)
            island["techSample"] += int(project.get("techSample") or project.get("messages") or 0)
            island["firstActive"] = min(filter(None, (island["firstActive"], project.get("firstActive"))), default=None)
            island["lastActive"] = max(filter(None, (island["lastActive"], project.get("lastActive"))), default=None)
            island["tokens"].update({k: v for k, v in (project.get("tokens") or {}).items() if k != "total"})
            island["tools"].update(project.get("tools") or {})
            island["tech"].update(project.get("tech") or {})
            for agent, share in (project.get("crews") or {project.get("agent", "claude"): 1.0}).items():
                island["crews"][agent] += weight * share
            island["models"].update({model: weight for model in project.get("models") or []})
            island["sessionSizes"].extend(project.get("sessionSizes") or [])
            if project.get("rhythm"):
                island["rhythm"].absorb(project["rhythm"])
            else:
                island["timed"] = False

    merged = []
    for key, island in islands.items():
        crews = island.pop("crews"); models = island.pop("models"); tokens = island.pop("tokens"); island.pop("lead")
        builders = contributions[key]
        if shared_only and len(builders) < 2:
            continue
        merged.append({
            **island,
            "agent": crews.most_common(1)[0][0] if crews else "claude",
            "crews": {agent: round(weight / max(1, sum(crews.values())), 3) for agent, weight in crews.most_common()},
            "models": [name for name, _ in models.most_common(3)],
            "tokens": {"input": tokens["input"], "output": tokens["output"], "cached": tokens["cached"],
                       "total": tokens["input"] + tokens["output"] + tokens["cached"]},
            "tools": dict(island["tools"].most_common()),
            "tech": dict(island["tech"].most_common()),
            "sessionSizes": sorted(island["sessionSizes"], reverse=True)[:MAX_BUILDINGS],
            "builders": {name: round(weight / sum(builders.values()), 3) for name, weight in builders.most_common()},
            "work": {name: dict(work_by[key][name]) for name, _ in builders.most_common()},
            "rhythm": island["rhythm"].buckets() if island["timed"] else None,
            "timed": None,
        })
    for island in merged:
        island.pop("timed")
        if island["rhythm"] is None:
            island.pop("rhythm")
    merged.sort(key=lambda project: project["activity"], reverse=True)
    # The team's rhythm comes from the islands on the map, so private projects never shape it.
    if merged and all(island.get("rhythm") for island in merged):
        rhythm = Rhythm()
        for island in merged:
            rhythm.absorb(island["rhythm"])
    # Each builder's numbers are counted from the islands that made it onto the map.
    for member in members:
        mine = [island for island in merged if member["name"] in island["builders"]]
        member.update(
            islands=len(mine),
            sessions=sum(island["work"][member["name"]].get("sessions", 0) for island in mine),
            tokens=sum(island["work"][member["name"]].get("tokens", 0) for island in mine),
            activity=round(sum(island["activity"] * island["builders"][member["name"]] for island in mine)),
        )
    members = [member for member in members if member["islands"]]

    links, seen = [], set()
    for index, (_, data) in enumerate(exports):
        for link in data.get("links") or []:
            a, b = id_map.get((index, link.get("a"))), id_map.get((index, link.get("b")))
            pair = tuple(sorted((a or "", b or "")))
            if a and b and a != b and pair not in seen:
                seen.add(pair)
                links.append({**link, "a": a, "b": b})
    for member in members:
        member["shared"] = sum(1 for island in merged if member["name"] in island["builders"] and len(island["builders"]) > 1)
    names = [member["name"] for member in members]
    return enrich({
        "version": 2, "generatedAt": datetime.now(timezone.utc).isoformat(), "projects": merged, "links": links,
        "rhythm": rhythm.public(), "sources": [],
        "team": {"name": team_name or " & ".join(names[:2]) + (f" +{len(names) - 2}" if len(names) > 2 else ""),
                 "members": sorted(members, key=lambda member: member["activity"], reverse=True)},
    })


def demo_team() -> dict[str, Any]:
    """A sample crew of three, carved deterministically out of the demo world."""
    base = demo_data()
    crew = ("Maya", "Noam", "Dana")
    exports = []
    for index, name in enumerate(crew):
        data = json.loads(json.dumps(base))
        kept = []
        for position, project in enumerate(data["projects"]):
            owner = position % 3
            share = (.62, .28, .1)[(index - owner) % 3] if position < 5 else (1.0 if owner == index else 0)
            if not share:
                continue
            for field_name in ("sessions", "messages", "activity", "prompts", "techSample"):
                project[field_name] = max(1, round((project.get(field_name) or 0) * share))
            project["tokens"] = {k: round(v * share) for k, v in project["tokens"].items()}
            project["tools"] = {k: max(1, round(v * share)) for k, v in project["tools"].items()}
            project["sessionSizes"] = project["sessionSizes"][index::3] or project["sessionSizes"][:1]
            kept.append(project)
        data["projects"] = kept
        hours = base["rhythm"]["hours"]
        data["rhythm"] = {**base["rhythm"], "hours": hours[index * 5:] + hours[:index * 5]}
        exports.append((name, enrich(data)))
    team = merge_team(exports, "Lighthouse Labs")
    team["demo"] = True
    return team


def load_team(paths: list[Path], names: list[str] | None = None) -> list[tuple[str, dict[str, Any]]]:
    """Read team exports; a folder stands for every .json file inside it."""
    files = []
    for path in paths:
        files.extend(sorted(path.glob("*.json")) if path.is_dir() else [path])
    if len(files) < 1:
        raise ValueError("No Pelago exports found for the team world")
    exports, used = [], Counter()
    for index, path in enumerate(files):
        data = load_input(path)
        builder = (names[index] if names and index < len(names) else None) or data.get("builder") or path.stem
        used[builder] += 1
        exports.append((builder if used[builder] == 1 else f"{builder} {used[builder]}", data))
    return exports


DEMO_URL = "https://mikebouskila.github.io/pelago/"
DEMO_META = "\n  ".join((
    '<meta property="og:title" content="Pelago: your AI coding history as a pixel-art world">',
    '<meta property="og:description" content="Every project becomes an island built from your Claude Code and Codex sessions, tokens and tools. Explore a sample world.">',
    f'<meta property="og:image" content="{DEMO_URL}hero.jpg">',
    f'<meta property="og:url" content="{DEMO_URL}">',
    '<meta name="twitter:card" content="summary_large_image">',
))


def render_html(data: dict[str, Any], destination: Path) -> None:
    asset_dir = Path(__file__).resolve().parent.parent / "assets"
    template = asset_dir / "world-template.html"
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c")
    html = template.read_text(encoding="utf-8")
    html = html.replace("__PELAGO_CSS__", (asset_dir / "world.css").read_text(encoding="utf-8"))
    script = "\n".join((asset_dir / name).read_text(encoding="utf-8") for name in ("island.js", "relics.js", "world.js"))
    html = html.replace("__PELAGO_JS__", script.replace("</script", "<\\/script"))
    html = html.replace("__PELAGO_DATA__", payload)
    if data.get("demo"):
        # The sample world is also the public live demo, so links to it unfurl with a preview.
        html = html.replace("<title>", DEMO_META + "\n  <title>", 1)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(html, encoding="utf-8")


def short_number(value: float) -> str:
    for limit, suffix in ((1e9, "B"), (1e6, "M"), (1e3, "k")):
        if value >= limit:
            scaled = value / limit
            return f"{scaled:.0f}{suffix}" if scaled >= 10 else f"{scaled:.1f}".rstrip("0").rstrip(".") + suffix
    return str(int(value))


def print_projects(data: dict[str, Any]) -> None:
    print()
    print("  Projects found (most active first):")
    for index, project in enumerate(data.get("projects") or [], 1):
        print(f"  {index:>3}. {project['name']}  ·  {project.get('sessions', 0)} sessions  ·  last active {str(project.get('lastActive') or '')[:10]}")


def print_summary(data: dict[str, Any], output: Path) -> None:
    projects = data["projects"]
    rhythm = data.get("rhythm") or {}
    who = data.get("persona") or persona(data)
    sessions = sum(project.get("sessions", 0) for project in projects)
    print()
    print("  ~~ PELAGO ~~")
    tokens = sum((project.get("tokens") or {}).get("total", 0) for project in projects)
    prompts = sum(project.get("prompts", 0) for project in projects)
    print(f"  {len(projects)} islands raised  ·  {sessions} sessions  ·  {rhythm.get('activeDays', 0)} days at sea")
    if tokens or prompts:
        print(f"  {short_number(tokens)} tokens became land  ·  {short_number(prompts)} requests became trees")
    if projects:
        print(f"  Capital: {projects[0]['name']}")
    if rhythm.get("longestStreak"):
        print(f"  Longest voyage: {rhythm['longestStreak']} days in a row")
    team = data.get("team")
    if team:
        print(f"  Built by {len(team['members'])}:")
        for member in team["members"]:
            print(f"    {member['name']}: {member.get('title', '')}, {member['islands']} islands ({member.get('shared', 0)} shared), {member['sessions']} sessions")
    print(f"  {'Together you are' if team else 'You are'} {who['title']}.")
    print()
    print(f"  World: {output}")
    print("  Only aggregate metadata was saved; prompts and file contents were not persisted.")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Turn Claude Code and Codex history into a Pelago world")
    parser.add_argument("--output", type=Path, default=Path("pelago-world.html"), help="self-contained HTML output")
    parser.add_argument("--json-output", type=Path, help="optional privacy-safe aggregate JSON output")
    parser.add_argument("--input", type=Path, help="build from a Pelago JSON export instead of scanning")
    parser.add_argument("--home", type=Path, default=Path.home(), help=argparse.SUPPRESS)
    parser.add_argument("--since-days", type=int, help="only include records newer than this many days")
    parser.add_argument("--demo", action="store_true", help="generate a sample world without scanning")
    parser.add_argument("--open", action="store_true", help="open the world in the default browser when done")
    parser.add_argument("--name", help="your name, stamped into --json-output so a team world can credit you")
    parser.add_argument("--team", type=Path, nargs="+", metavar="EXPORT", help="merge several people's --json-output files (or a folder of them) into one team world")
    parser.add_argument("--demo-team", action="store_true", help="generate a sample team world without scanning")
    parser.add_argument("--team-name", help="what to call the team world")
    parser.add_argument("--only", action="append", metavar="NAMES", help="keep only these projects (comma-separated names); use it before sharing an export")
    parser.add_argument("--shared-only", action="store_true", help="in a team world, keep only islands two or more people built")
    parser.add_argument("--list-projects", action="store_true", help="print every project found, to choose which to share")
    args = parser.parse_args(argv)

    if args.since_days is not None and args.since_days < 1:
        parser.error("--since-days must be at least 1")
    try:
        if args.demo_team:
            data = demo_team()
        elif args.team:
            data = merge_team(load_team(args.team), args.team_name, args.shared_only)
        else:
            data = demo_data() if args.demo else load_input(args.input) if args.input else scan(args.home.expanduser(), args.since_days)
        if args.list_projects:
            print_projects(data)
        if args.only:
            data, missing = select_projects(data, [name for value in args.only for name in value.split(",")])
            if missing:
                print(f"Pelago found no project named: {', '.join(missing)} (see --list-projects)", file=sys.stderr)
            if not data["projects"]:
                return 2
        if args.name:
            data["builder"] = args.name.strip()[:40]
        if args.team and not data["projects"]:
            print("Pelago found no island that two or more people built. Shared islands are matched by project name, "
                  "so check the names match, or leave out --shared-only to map everyone's chosen projects.", file=sys.stderr)
            return 2
        if not data["projects"] and not (args.demo or args.demo_team):
            locations = ", ".join(str(args.home.expanduser() / folder) for folder in (".claude/projects", ".codex/sessions"))
            print(f"Pelago found no supported history in: {locations}", file=sys.stderr)
            return 2
        render_html(data, args.output)
        if args.json_output:
            args.json_output.parent.mkdir(parents=True, exist_ok=True)
            args.json_output.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"Pelago could not generate the world: {error}", file=sys.stderr)
        return 1

    print_summary(data, args.output.resolve())
    if args.open:
        webbrowser.open(args.output.resolve().as_uri())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
