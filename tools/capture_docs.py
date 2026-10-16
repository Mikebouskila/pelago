#!/usr/bin/env python3
"""Regenerate the README media from the sample worlds. A development tool: nothing imports it.

Builds --demo and --demo-team, drives headless Chrome over its debugging pipe, and writes the
pictures into docs/ (or --out). ffmpeg is optional: without it the GIFs are skipped.

    python3 tools/capture_docs.py --out /tmp/pelago-media
    python3 tools/capture_docs.py --only og.jpg hero.gif
"""

from __future__ import annotations

import argparse
import base64
import fcntl
import json
import os
import select
import shutil
import struct
import subprocess
import sys
import tempfile
import time
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GENERATOR = ROOT / "scripts" / "pelago.py"
OUTPUTS = ("hero.gif", "hero.jpg", "og.jpg", "social-preview.png", "card-story.jpg", "card-square.jpg", "card-social.jpg", "card-receipts.jpg",
           "card-team.jpg", "story.gif", "archetypes.png", "gallery.jpg", "mobile.jpg", "island.gif", "relic.jpg", "guide.jpg",
           "button-demo.svg", "button-get.svg")
CHROMES = ("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium",
           "google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "chrome")
GIF_LIMIT = 3 * 1024 * 1024
PREVIEW_LIMIT = 1_000_000
PHONE = (390, 844)

# performance.now can be held still, so a GIF frame is drawn at an exact moment and the camera never moves.
CLOCK_JS = "(() => { const real = performance.now.bind(performance); let held = null; performance.now = () => held ?? real(); window.__hold = (t) => { held = t; }; })();"

# Helpers evaluated inside a world page. They only call the page's own drawing code.
PAGE_JS = r"""
window.__docs = (() => {
  const jpeg = (canvas, quality = .9) => canvas.toDataURL('image/jpeg', quality);
  const realms = { harbor: 'web apps', garden: 'mobile apps', wilds: 'off the map', observatory: 'AI and agents', forge: 'CLIs and tools', archive: 'data', citadel: 'games', atlas: 'a bit of everything' };
  function card(format) {
    state.exportSelected = null;
    return jpeg(renderCard(document.createElement('canvas'), format, null, true), .86);
  }
  function moment(kind, format) {
    state.exportSelected = null;
    return jpeg(renderMomentCard(document.createElement('canvas'), kind, format, { kind }), .86);
  }
  function gallery() {
    // The eight biggest islands, each captioned with the numbers it was built from, big enough to read in the README.
    const width = 1600, height = 1000, columns = 4, cellW = width / columns, cellH = height / 2, foot = 196, canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const c = canvas.getContext('2d'), count = (value) => Number(value || 0).toLocaleString('en-US');
    drawOcean(c, width, height, 73, 2400);
    [...PROJECTS].sort((a, b) => b.activity - a.activity).slice(0, 8).forEach((project, index) => {
      const x = (index % columns) * cellW, y = Math.floor(index / columns) * cellH, mid = x + cellW / 2, recipe = islandRecipe(project), band = y + cellH - foot;
      // Each island kept to its own tile, its rock fading into the caption.
      c.save(); c.beginPath(); c.rect(x, y, cellW, cellH); c.clip();
      drawIslandFit(c, project, x + 20, y + 12, cellW - 40, cellH - foot - 6, { crop: .66, time: 2400 });
      const fade = c.createLinearGradient(0, band - 60, 0, band + 8);
      fade.addColorStop(0, 'rgba(6,12,30,0)'); fade.addColorStop(1, 'rgba(6,12,30,.94)');
      c.fillStyle = fade; c.fillRect(x, band - 60, cellW, 68); c.fillStyle = 'rgba(6,12,30,.94)'; c.fillRect(x, band + 8, cellW, foot - 8);
      c.restore();
      c.textAlign = 'center'; c.fillStyle = COLORS.paper; c.font = `700 42px ${SERIF}`; c.fillText(nameOf(project), mid, band + 34, cellW - 24);
      c.font = `900 16px ${SANS}`;
      if ('letterSpacing' in c) c.letterSpacing = '3px';
      const kind = kindOf(project).toUpperCase(), kindW = c.measureText(kind).width;
      c.fillStyle = (CATEGORIES[project.category] || CATEGORIES.other).color; c.fillRect(Math.round(mid - kindW / 2 - 10), band + 52, 10, 10);
      c.fillStyle = '#9fbad4'; c.fillText(kind, mid + 10, band + 63);
      if ('letterSpacing' in c) c.letterSpacing = '0px';
      c.fillStyle = '#d6e2f0'; c.font = `600 22px ${SANS}`;
      [`${count(project.sessions)} sessions → ${count(recipe.buildings.count)} buildings`, `${count(recipe.trees.prompts)} requests → ${count(recipe.trees.count)} trees`,
        `${compact(totalTokens(project))} tokens → ${plural(recipe.waterfalls, 'waterfall')}`].forEach((line, row) => c.fillText(line, mid, band + 104 + row * 30, cellW - 24));
    });
    return jpeg(canvas, .86);
  }
  function promo(width, height, type) {
    // The link preview: the archipelago from the cards, with one big line that reads at thumbnail size.
    FORMATS.promo = [width, height];
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const c = canvas.getContext('2d');
    drawCardScene(c, cardScene('promo'), { time: 2400 });
    const unit = height / 630, pad = 60 * unit, maxWidth = width * .5 - pad;
    const side = c.createLinearGradient(0, 0, width * .66, 0);
    side.addColorStop(0, 'rgba(4,9,26,.95)'); side.addColorStop(.62, 'rgba(4,9,26,.78)'); side.addColorStop(1, 'rgba(4,9,26,0)');
    c.fillStyle = side; c.fillRect(0, 0, width * .66, height);
    drawBrandMark(c, pad, pad - 8 * unit, 5.2 * unit);
    const lead = 'Your Claude Code + Codex history', accent = 'as a pixel-art world';
    let size = 84 * unit, lines;
    for (; size > 30; size -= 2) {
      c.font = `700 ${size}px ${SERIF}`; lines = wrapLines(c, lead, maxWidth);
      const leadFits = lines.length <= 2 && lines.every((line) => c.measureText(line).width <= maxWidth);
      c.font = `italic 400 ${size}px ${SERIF}`;
      if (leadFits && c.measureText(accent).width <= maxWidth) break;
    }
    const lineHeight = size * 1.02, block = lineHeight * (lines.length + 1);
    let y = height * .5 - block / 2 + size * .82;
    c.textAlign = 'left'; c.fillStyle = COLORS.coral; c.font = `900 ${17 * unit}px ${SANS}`;
    if ('letterSpacing' in c) c.letterSpacing = `${3 * unit}px`;
    c.fillText('AI CODING WRAPPED · OPEN SOURCE', pad, y - size * 1.12);
    if ('letterSpacing' in c) c.letterSpacing = '0px';
    lines.forEach((line) => { c.font = `700 ${size}px ${SERIF}`; c.fillStyle = COLORS.paper; c.fillText(line, pad, y); y += lineHeight; });
    c.font = `italic 400 ${size}px ${SERIF}`; c.fillStyle = COLORS.sun; c.fillText(accent, pad, y);
    c.font = `600 ${23 * unit}px ${SANS}`; c.fillStyle = '#d2e1f0';
    c.fillText('Every project becomes an island. Runs on your machine.', pad, y + 52 * unit, maxWidth + pad);
    c.font = `800 ${21 * unit}px ${SANS}`;
    const cta = `${REPO_URL}`, ctaWidth = c.measureText(cta).width + 44 * unit, ctaY = height - pad - 6 * unit;
    c.fillStyle = 'rgba(255,120,88,.92)'; c.beginPath(); c.roundRect(pad, ctaY - 34 * unit, ctaWidth, 48 * unit, 999); c.fill();
    c.fillStyle = '#fff'; c.fillText(cta, pad + 22 * unit, ctaY - 2 * unit);
    return type === 'png' ? canvas.toDataURL('image/png') : jpeg(canvas, .9);
  }
  function archetypes() {
    if (typeof keeperFor !== 'function' || typeof KEEPERS === 'undefined') return null;
    const width = 1600, height = 900, canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const c = canvas.getContext('2d');
    drawOcean(c, width, height, 73, 2400); drawCloudSea(c, width, height, 2400, true);
    c.fillStyle = 'rgba(4,9,26,.45)'; c.fillRect(0, 0, width, height);
    drawBrandMark(c, 64, 52, 5);
    const rhythms = DATA.archetypes?.prefixes?.length || 11, keys = Object.keys(KEEPERS);
    c.textAlign = 'center'; c.fillStyle = COLORS.coral; c.font = `900 18px ${SANS}`;
    if ('letterSpacing' in c) c.letterSpacing = '4px';
    c.fillText(`${keys.length} KEEPERS × ${rhythms} RHYTHMS = ${keys.length * rhythms} ARCHETYPES`, width / 2, 92);
    if ('letterSpacing' in c) c.letterSpacing = '0px';
    c.fillStyle = COLORS.paper; c.font = `700 54px ${SERIF}`; c.fillText('Which builder are you?', width / 2, 156);
    const columns = 4, gap = 22, left = 64, top = 222, tileW = (width - left * 2 - gap * (columns - 1)) / columns, tileH = (height - top - 56 - gap) / 2;
    keys.forEach((realm, index) => {
      const keeper = keeperFor(realm), x = left + (index % columns) * (tileW + gap), y = top + Math.floor(index / columns) * (tileH + gap);
      c.save(); c.beginPath(); c.roundRect(x, y, tileW, tileH, 22); c.fillStyle = 'rgba(8,15,34,.78)'; c.fill();
      c.strokeStyle = keeper.accent; c.globalAlpha = .55; c.lineWidth = 2; c.stroke(); c.restore();
      const sprite = RELIC_SPRITES[keeper.sprite], cell = Math.floor(Math.min(tileW * .5 / sprite.rows[0].length, tileH * .56 / sprite.rows.length));
      const sx = Math.round(x + (tileW - sprite.rows[0].length * cell) / 2), sy = Math.round(y + 22);
      paintSprite(keeper.sprite, (px, py, colour) => { c.fillStyle = `rgb(${colour.join(',')})`; c.fillRect(sx + px * cell, sy + py * cell, cell, cell); });
      c.textAlign = 'center'; c.fillStyle = COLORS.paper;
      let size = 38;
      do { c.font = `700 ${size}px ${SERIF}`; size -= 1; } while (c.measureText(keeper.title).width > tileW - 40 && size > 20);
      c.fillText(keeper.title, x + tileW / 2, y + tileH - 50);
      c.fillStyle = keeper.accent; c.font = `900 14px ${SANS}`;
      if ('letterSpacing' in c) c.letterSpacing = '3px';
      c.fillText((realms[realm] || realm).toUpperCase(), x + tileW / 2, y + tileH - 22);
      if ('letterSpacing' in c) c.letterSpacing = '0px';
    });
    return canvas.toDataURL('image/png');
  }
  function islandFrame(width, height, time) {
    const project = capital(), canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const c = canvas.getContext('2d');
    drawOcean(c, width, height, project.seed, time);
    drawIslandFit(c, project, width * .06, height * .09, width * .88, height * .88, { crop: .62, time });
    return canvas.toDataURL('image/png');
  }
  function focusCapital() { focusProject(capital(), false); return true; }
  function openRelic() {
    // Finds where the capital's rarest relic stands on screen and opens its card, as a click there would.
    const project = capital(), item = state.items.find((candidate) => candidate.project.id === project.id);
    if (!item) return null;
    const cx = item.x * state.scale + state.panX, cy = item.y * state.scale + state.panY, r = item.size * state.scale * 1.25;
    const found = new Map();
    for (let y = cy - r; y < cy + r * .7; y += 3) for (let x = cx - r; x < cx + r; x += 3) {
      const hit = hitRelic({ x, y });
      if (!hit || hit.item.project.id !== project.id) continue;
      const entry = found.get(hit.relic.id) || { hit, x: 0, y: 0, n: 0 };
      entry.x = Math.max(entry.x, x); entry.y += y; entry.n += 1; found.set(hit.relic.id, entry);
    }
    const best = [...found.values()].sort((a, b) => RARITY_ORDER[a.hit.relic.rarity] - RARITY_ORDER[b.hit.relic.rarity] || b.n - a.n)[0];
    if (!best) return null;
    const bounds = world.getBoundingClientRect(), ratio = world.width / bounds.width;
    // A click on the relic's right edge, so its card opens beside it rather than over it.
    showRelicCard(best.hit, best.x / ratio + bounds.left, best.y / best.n / ratio + bounds.top);
    return best.hit.relic.name;
  }
  function storyTo(kind) {
    if ($('#story').hidden) { enterWorld(); openStory(); document.activeElement?.blur(); }
    story.paused = true; clearTimeout(story.timer);
    const index = kind === 'reveal' ? story.slides.findIndex((slide) => slide.camera?.reveal) : kind === 'capital' ? story.slides.findIndex((slide) => slide.camera?.mode === 'island')
      : kind === 'receipts' ? story.slides.findIndex((slide) => slide.camera?.mode === 'island' && slide().classList.contains('slide-receipts')) : 0;
    story.index = Math.max(0, index); renderStorySlide();
    return index;
  }
  async function compose(urls, width, height, gap, background) {
    const images = await Promise.all(urls.map((url) => { const image = new Image(); image.src = url; return image.decode().then(() => image); }));
    const canvas = document.createElement('canvas');
    const panel = (width - gap * (images.length + 1)) / images.length;
    canvas.width = width; canvas.height = height;
    const c = canvas.getContext('2d');
    c.fillStyle = background; c.fillRect(0, 0, width, height);
    c.imageSmoothingQuality = 'high';
    images.forEach((image, index) => {
      const h = Math.min(height - gap * 2, panel * image.height / image.width), w = h * image.width / image.height;
      const x = gap + index * (panel + gap) + (panel - w) / 2, y = (height - h) / 2;
      c.save(); c.beginPath(); c.roundRect(x, y, w, h, 26); c.clip(); c.drawImage(image, x, y, w, h); c.restore();
    });
    return jpeg(canvas, .84);
  }
  return { card, moment, gallery, promo, archetypes, islandFrame, focusCapital, openRelic, storyTo, compose };
})();
true;
"""


class Browser:
    """Headless Chrome, spoken to over --remote-debugging-pipe (fd 3 in, fd 4 out): no port, no websocket."""

    def __init__(self, chrome: str, profile: str):
        child_in, self.out = os.pipe()
        self.inp, child_out = os.pipe()
        high = [fcntl.fcntl(fd, fcntl.F_DUPFD, 10) for fd in (child_in, child_out)]
        os.close(child_in); os.close(child_out)
        flags = ["--headless=new", "--remote-debugging-pipe", f"--user-data-dir={profile}", "--no-first-run", "--no-default-browser-check",
                 "--hide-scrollbars", "--mute-audio", "--disable-gpu", "--force-color-profile=srgb", "--disable-extensions",
                 "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows", "about:blank"]
        shell = f'exec "$@" 3<&{high[0]} 4>&{high[1]} {high[0]}<&- {high[1]}>&-'
        self.process = subprocess.Popen(["/bin/sh", "-c", shell, "sh", chrome, *flags], pass_fds=high, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for fd in high:
            os.close(fd)
        self.buffer = bytearray()
        self.counter = 0

    def send(self, method: str, session: str | None = None, timeout: float = 90, **params) -> dict:
        self.counter += 1
        message = {"id": self.counter, "method": method, "params": params}
        if session:
            message["sessionId"] = session
        data = memoryview(json.dumps(message).encode() + b"\0")
        while data:
            data = data[os.write(self.out, data):]
        deadline = time.time() + timeout
        while True:
            reply = self._read(deadline)
            if reply.get("id") == self.counter:
                if "error" in reply:
                    raise RuntimeError(f"{method}: {reply['error'].get('message')}")
                return reply.get("result", {})

    def _read(self, deadline: float) -> dict:
        start = 0
        while (end := self.buffer.find(b"\0", start)) < 0:
            start = len(self.buffer)
            left = deadline - time.time()
            if left <= 0 or not select.select([self.inp], [], [], left)[0]:
                raise TimeoutError("Chrome stopped answering")
            chunk = os.read(self.inp, 1 << 20)
            if not chunk:
                raise RuntimeError("Chrome closed the connection")
            self.buffer += chunk
        message = bytes(self.buffer[:end])
        del self.buffer[:end + 1]
        return json.loads(message)

    def page(self, url: str, width: int, height: int, scale: float = 1, phone: bool = False, clock: bool = False) -> "Page":
        target = self.send("Target.createTarget", url="about:blank")["targetId"]
        page = Page(self, target, self.send("Target.attachToTarget", targetId=target, flatten=True)["sessionId"])
        page.call("Page.enable")
        page.call("Emulation.setDeviceMetricsOverride", width=width, height=height, deviceScaleFactor=scale, mobile=phone)
        page.call("Emulation.setEmulatedMedia", features=[{"name": "prefers-reduced-motion", "value": "no-preference"}])
        if phone:
            page.call("Emulation.setTouchEmulationEnabled", enabled=True, maxTouchPoints=5)
            page.call("Emulation.setUserAgentOverride", userAgent="Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1")
        if clock:
            page.call("Page.addScriptToEvaluateOnNewDocument", source=CLOCK_JS)
        page.call("Page.navigate", url=url)
        for _ in range(200):
            if page.eval("document.readyState") == "complete":
                break
            time.sleep(.05)
        page.eval("document.fonts.ready.then(() => true)")
        page.eval(PAGE_JS)
        time.sleep(.9)
        return page

    def close(self) -> None:
        try:
            self.send("Browser.close", timeout=5)
        except (OSError, RuntimeError, TimeoutError):
            pass
        try:
            self.process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self.process.kill()
        for fd in (self.out, self.inp):
            os.close(fd)


class Page:
    def __init__(self, browser: Browser, target: str, session: str):
        self.browser, self.target, self.session = browser, target, session

    def call(self, method: str, **params) -> dict:
        return self.browser.send(method, self.session, **params)

    def eval(self, expression: str):
        result = self.call("Runtime.evaluate", expression=expression, returnByValue=True, awaitPromise=True)
        if "exceptionDetails" in result:
            details = result["exceptionDetails"]
            raise RuntimeError(f"page error: {(details.get('exception') or {}).get('description') or details.get('text')}")
        return result["result"].get("value")

    def shot(self, kind: str = "png", quality: int = 88) -> bytes:
        params = {"format": kind, "captureBeyondViewport": False}
        if kind == "jpeg":
            params["quality"] = quality
        return base64.b64decode(self.call("Page.captureScreenshot", **params)["data"])

    def data_url(self, expression: str) -> bytes | None:
        value = self.eval(expression)
        return base64.b64decode(value.split(",", 1)[1]) if value else None

    def close(self) -> None:
        self.browser.send("Target.closeTarget", targetId=self.target)


def record(page: Page, seconds: float, fps: float) -> list[bytes]:
    """Screenshots in real time, resampled to an even frame rate."""
    taken, start = [], time.time()
    while (elapsed := time.time() - start) < seconds:
        taken.append((elapsed, page.shot()))
        pause = len(taken) / fps - (time.time() - start)
        if pause > 0:
            time.sleep(pause)
    frames, index = [], 0
    for tick in range(int(seconds * fps)):
        while index + 1 < len(taken) and taken[index + 1][0] <= tick / fps:
            index += 1
        frames.append(taken[index][1])
    return frames


def encode_gif(frames: list[bytes], fps: float, path: Path, ffmpeg: str, width: int | None = None, colors: int = 256) -> int:
    with tempfile.TemporaryDirectory() as folder:
        for index, frame in enumerate(frames):
            (Path(folder) / f"f{index:04d}.png").write_bytes(frame)
        scale = f"scale={width}:-1:flags=area," if width else ""
        graph = f"{scale}split[a][b];[a]palettegen=max_colors={colors}:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle"
        subprocess.run([ffmpeg, "-v", "error", "-y", "-framerate", f"{fps:g}", "-i", f"{folder}/f%04d.png", "-vf", graph, "-loop", "0", str(path)], check=True)
    return path.stat().st_size


def palette_png(data: bytes, ffmpeg: str) -> bytes:
    """A 256-colour PNG: GitHub refuses a social preview over 1 MB."""
    with tempfile.TemporaryDirectory() as folder:
        source, target = Path(folder) / "in.png", Path(folder) / "out.png"
        source.write_bytes(data)
        graph = "split[a][b];[a]palettegen=max_colors=256[p];[b][p]paletteuse=dither=sierra2_4a"
        subprocess.run([ffmpeg, "-v", "error", "-y", "-i", str(source), "-vf", graph, "-pix_fmt", "pal8", str(target)], check=True)
        return target.read_bytes()


# The README's two buttons, as SVG in whole pixels: a 5×7 font, stepped corners and a pressed-in bottom edge.
GLYPHS = {
    "L": "#....|#....|#....|#....|#....|#....|#####", "I": "###|.#.|.#.|.#.|.#.|.#.|###", "V": "#...#|#...#|#...#|#...#|.#.#.|.#.#.|..#..",
    "E": "#####|#....|#....|####.|#....|#....|#####", "D": "####.|#...#|#...#|#...#|#...#|#...#|####.", "M": "#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#",
    "O": ".###.|#...#|#...#|#...#|#...#|#...#|.###.", "G": ".###.|#...#|#....|#.###|#...#|#...#|.###.", "T": "#####|..#..|..#..|..#..|..#..|..#..|..#..",
    "Y": "#...#|#...#|.#.#.|..#..|..#..|..#..|..#..", "U": "#...#|#...#|#...#|#...#|#...#|#...#|.###.", "R": "####.|#...#|#...#|####.|#.#..|#..#.|#...#",
    "S": ".####|#....|#....|.###.|....#|....#|####.", " ": "..|..|..|..|..|..|..",
    "play": "#....|##...|###..|####.|###..|##...|#....", "bolt": "..###|.###.|.##..|#####|..##.|.##..|.#...",
}
BUTTONS = {"button-demo.svg": ("play", "LIVE DEMO", "#eb6f5c", "#7a2a26", "#bd4b42", "#fffaf0"),
           "button-get.svg": ("bolt", "GET YOURS", "#13213f", "#ffe68c", "#0a1328", "#ffe68c")}


def pixel_button(icon: str, label: str, body: str, edge: str, shade: str, ink: str, cell: int = 3) -> bytes:
    rows = [""] * 7
    for index, name in enumerate([icon, *label]):
        rows = [row + ("..." if index == 1 else "." if index else "") + line for row, line in zip(rows, GLYPHS[name].split("|"))]
    width, height = len(rows[0]) + 12, 18
    grid = {(x, y): edge if x in (0, width - 1) or y in (0, height - 1) else shade if y >= height - 3 else body
            for y in range(height) for x in range(width) if not (x in (0, width - 1) and y in (0, height - 1))}
    letters = [(x + 6, y + 4) for y, row in enumerate(rows) for x, on in enumerate(row) if on == "#"]
    grid.update({(x, y + 1): shade for x, y in letters})
    grid.update({point: ink for point in letters})
    # One path per colour, each row of same-coloured cells merged into a single run.
    runs: dict[str, list[list[int]]] = {}
    for (x, y), colour in sorted(grid.items(), key=lambda item: item[0][::-1]):
        spans = runs.setdefault(colour, [])
        if spans and spans[-1][1] == y and spans[-1][0] + spans[-1][2] == x:
            spans[-1][2] += 1
        else:
            spans.append([x, y, 1])
    paths = "".join(f'<path fill="{colour}" d="{"".join(f"M{x * cell} {y * cell}h{w * cell}v{cell}h-{w * cell}z" for x, y, w in spans)}"/>' for colour, spans in runs.items())
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{width * cell}" height="{height * cell}" viewBox="0 0 {width * cell} {height * cell}" '
            f'shape-rendering="crispEdges" role="img" aria-label="{label.title()}">{paths}</svg>\n').encode()


def dimensions(data: bytes) -> tuple[int, int]:
    if data[:4] == b"<svg":
        width, height = (int(data.split(f' {key}="'.encode(), 1)[1].split(b'"', 1)[0]) for key in ("width", "height"))
        return width, height
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return struct.unpack(">II", data[16:24])
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return struct.unpack("<HH", data[6:10])
    index = 2
    while index < len(data) - 9:
        marker, length = data[index + 1], struct.unpack(">H", data[index + 2:index + 4])[0]
        if marker in (0xC0, 0xC1, 0xC2):
            height, width = struct.unpack(">HH", data[index + 5:index + 9])
            return width, height
        index += 2 + length
    return 0, 0


def build_worlds(folder: Path, year: int | None) -> dict[str, Path]:
    """The README shows what a builder sees in their own world, so the samples are rebuilt without the demo banner."""
    worlds = {}
    for name, flag in (("solo", "--demo"), ("team", "--demo-team")):
        export = folder / f"{name}.json"
        extra = ["--year", str(year)] if year else []
        subprocess.run([sys.executable, str(GENERATOR), flag, *extra, "--output", str(folder / f"{name}-demo.html"), "--json-output", str(export)], check=True, stdout=subprocess.DEVNULL)
        data = json.loads(export.read_text(encoding="utf-8"))
        data.pop("demo", None)
        export.write_text(json.dumps(data), encoding="utf-8")
        worlds[name] = folder / f"{name}.html"
        subprocess.run([sys.executable, str(GENERATOR), "--input", str(export), "--output", str(worlds[name])], check=True, stdout=subprocess.DEVNULL)
    return worlds


def capture(browser: Browser, worlds: dict[str, Path], wanted: set[str], out: Path, ffmpeg: str | None) -> tuple[list[str], list[str]]:
    solo, team = worlds["solo"].as_uri(), worlds["team"].as_uri()
    notes, failed = [], []
    hero = [1280, 720]

    def save(name: str, data: bytes | None) -> None:
        if not data:
            raise RuntimeError("the page returned nothing")
        (out / name).write_bytes(data)
        width, height = dimensions(data)
        print(f"  {name:<20} {width}x{height:<6} {len(data) / 1024:8.0f} KB")

    def gif(name: str) -> bool:
        if name in wanted and not ffmpeg:
            notes.append(f"{name}: skipped, GIFs need ffmpeg (on PATH, or pass --ffmpeg PATH)")
        return name in wanted and bool(ffmpeg)

    def hero_gif() -> None:
        # A fixed camera over the whole map: only water, smoke, sails, stars and clouds move.
        for width, height, count in ((1280, 720, 40), (1120, 630, 36), (960, 540, 32)):
            hero[:] = width, height
            page = browser.page(solo, width, height, clock=True)
            page.eval("enterWorld(); true")
            time.sleep(1.2)
            frames = []
            for index in range(count):
                page.eval(f"__hold({40000 + index * 80}); drawWorld(); true")
                frames.append(page.shot())
            page.close()
            size = encode_gif(frames, 12.5, out / "hero.gif", ffmpeg)
            if size <= GIF_LIMIT:
                break
            notes.append(f"hero.gif: {size / 1048576:.1f} MB at {width}x{height}, trying smaller")
        save("hero.gif", (out / "hero.gif").read_bytes())

    def hero_jpg() -> None:
        # The poster for reduced motion: the GIF's first frame, at one and a half times the pixels.
        page = browser.page(solo, *hero, scale=1.5, clock=True)
        page.eval("enterWorld(); __hold(40000); true")
        time.sleep(1.2)
        page.eval("__hold(40000); drawWorld(); true")
        save("hero.jpg", page.shot("jpeg", 84))
        page.close()

    def canvases() -> None:
        page = browser.page(solo, 1280, 800)
        for name, expression in (("og.jpg", "__docs.promo(1200, 630, 'jpeg')"), ("card-story.jpg", "__docs.card('story')"),
                                 ("card-square.jpg", "__docs.card('square')"), ("card-social.jpg", "__docs.card('social')"),
                                 ("card-receipts.jpg", "__docs.moment('receipts', 'square')"), ("gallery.jpg", "__docs.gallery()")):
            if name in wanted:
                save(name, page.data_url(expression))
        if "social-preview.png" in wanted:
            data = page.data_url("__docs.promo(1280, 640, 'png')")
            if len(data) > PREVIEW_LIMIT and ffmpeg:
                data = palette_png(data, ffmpeg)
            if len(data) > PREVIEW_LIMIT:
                notes.append(f"social-preview.png: {len(data) / 1048576:.1f} MB is over GitHub's 1 MB limit; run again with ffmpeg to shrink it")
            save("social-preview.png", data)
        if "archetypes.png" in wanted:
            data = page.data_url("__docs.archetypes()")
            if data:
                save("archetypes.png", palette_png(data, ffmpeg) if ffmpeg else data)
            else:
                notes.append("archetypes.png: skipped, this build has no keeper sprites (keeperFor)")
        if gif("island.gif"):
            frames = [page.data_url(f"__docs.islandFrame(640, 420, {40000 + index * 80})") for index in range(36)]
            encode_gif(frames, 12.5, out / "island.gif", ffmpeg)
            save("island.gif", (out / "island.gif").read_bytes())
        page.close()

    def buttons() -> None:
        for name, spec in BUTTONS.items():
            if name in wanted:
                save(name, pixel_button(*spec))

    def team_card() -> None:
        page = browser.page(team, 1280, 800)
        save("card-team.jpg", page.data_url("__docs.card('social')"))
        page.close()

    def story_gif() -> None:
        # The phone story in real time: the opening count once it has faded in, the receipts (or the capital), then the reveal.
        page = browser.page(solo, 360, 640, scale=1.5, phone=True)
        frames = []
        for kind, lead, seconds in (("intro", .5, 2.0), ("receipts", .4, 2.4), ("reveal", 0, 4.2)):
            if page.eval(f"__docs.storyTo('{kind}')") < 0:
                page.eval("__docs.storyTo('capital')")
            time.sleep(lead)
            frames += record(page, seconds, 10)
        page.close()
        # Shown about 300 pixels wide in the README: 360 and 128 colours look the same there at two thirds the bytes.
        size = encode_gif(frames, 10, out / "story.gif", ffmpeg, 360, 128)
        if size > GIF_LIMIT:
            notes.append(f"story.gif: {size / 1048576:.1f} MB is over {GIF_LIMIT // 1048576} MB")
        save("story.gif", (out / "story.gif").read_bytes())

    def mobile() -> None:
        page = browser.page(solo, *PHONE, scale=2, phone=True)
        shots = [page.shot()]
        page.eval("enterWorld(); true")
        time.sleep(1)
        shots.append(page.shot())
        page.eval("__docs.focusCapital()")
        time.sleep(1)
        if not page.eval("__docs.openRelic()"):
            notes.append("mobile.jpg: no relic found on the capital")
        time.sleep(.6)
        shots.append(page.shot())
        urls = json.dumps(["data:image/png;base64," + base64.b64encode(shot).decode() for shot in shots])
        save("mobile.jpg", page.data_url(f"__docs.compose({urls}, 1800, 1290, 48, '#0b1226')"))
        page.close()

    def relic() -> None:
        page = browser.page(solo, 1600, 1000)
        page.eval("__docs.focusCapital()")
        time.sleep(1)
        if not page.eval("__docs.openRelic()"):
            notes.append("relic.jpg: no relic found on the capital")
        time.sleep(.5)
        save("relic.jpg", page.shot("jpeg", 84))
        page.close()

    def guide() -> None:
        page = browser.page(solo, 1600, 1000)
        page.eval("showGuide('relics'); true")
        time.sleep(.9)
        save("guide.jpg", page.shot("jpeg", 84))
        page.close()

    steps = ((hero_gif, gif("hero.gif")), (hero_jpg, "hero.jpg" in wanted),
             (canvases, bool(wanted & {"og.jpg", "social-preview.png", "card-story.jpg", "card-square.jpg", "card-social.jpg", "card-receipts.jpg", "gallery.jpg", "archetypes.png", "island.gif"})),
             (buttons, bool(wanted & set(BUTTONS))),
             (team_card, "card-team.jpg" in wanted), (story_gif, gif("story.gif")), (mobile, "mobile.jpg" in wanted),
             (relic, "relic.jpg" in wanted), (guide, "guide.jpg" in wanted))
    for step, needed in steps:
        if not needed:
            continue
        # One broken capture (say, after a change to the page) should not cost the others.
        try:
            step()
        except (RuntimeError, TimeoutError, OSError, subprocess.CalledProcessError) as error:
            failed.append(f"{step.__name__.replace('_', ' ')}: {error}")
    return notes, failed


def find_chrome(given: str | None) -> str | None:
    for candidate in ([given] if given else [os.environ.get("PELAGO_CHROME") or "", *CHROMES]):
        if candidate and (Path(candidate).is_file() or shutil.which(candidate)):
            return candidate if Path(candidate).is_file() else shutil.which(candidate)
    return None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Regenerate the README media from the sample worlds (needs Chrome; ffmpeg for GIFs)")
    parser.add_argument("--out", type=Path, default=ROOT / "docs", help="where to write the media (default: docs/)")
    parser.add_argument("--only", nargs="+", choices=OUTPUTS, metavar="NAME", help=f"make only these: {', '.join(OUTPUTS)}")
    parser.add_argument("--chrome", help="path to Chrome or Chromium")
    parser.add_argument("--ffmpeg", help="path to ffmpeg (default: found on PATH)")
    parser.add_argument("--no-ffmpeg", action="store_true", help="skip the GIFs even if ffmpeg is installed")
    parser.add_argument("--wrapped", action="store_true", help="title the samples as this year's Wrapped edition (pelago.py --year)")
    args = parser.parse_args(argv)

    chrome = find_chrome(args.chrome)
    if not chrome:
        print("capture_docs needs Google Chrome or Chromium (pass --chrome PATH).", file=sys.stderr)
        return 1
    ffmpeg = None if args.no_ffmpeg else args.ffmpeg or shutil.which("ffmpeg")
    wanted = set(args.only or OUTPUTS)
    args.out.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="pelago-docs-") as folder:
        worlds = build_worlds(Path(folder), datetime.now().year if args.wrapped else None)
        browser = Browser(chrome, str(Path(folder) / "profile"))
        try:
            print(f"Writing to {args.out.resolve()}")
            notes, failed = capture(browser, worlds, wanted, args.out, ffmpeg)
        finally:
            browser.close()
    for note in notes:
        print(f"  note: {note}")
    for failure in failed:
        print(f"  FAILED {failure}", file=sys.stderr)
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
