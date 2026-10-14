const DATA = JSON.parse(document.getElementById('pelago-data').textContent);
const PROJECTS = Array.isArray(DATA.projects) ? DATA.projects : [];
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const COLORS = {
  sea: '#08142f', deepSea: '#102b52', foam: '#5dcbd1', ink: '#101a33', muted: '#8fa6c4',
  paper: '#fffaf0', sand: '#f2dfae', wetSand: '#d3ba7d', grass: '#7fbd67', grassDark: '#4e8d4b',
  cliff: '#ba9363', cliffDark: '#8c684b', coral: '#eb6f5c', coralDark: '#bd4b42', sun: '#ffe68c',
  claude: '#dc8150', codex: '#45a38d', roof: '#cf5c4c', wood: '#755642', window: '#7cd0d1',
};


const CATEGORIES = {
  web: { label: 'Meadow harbor', color: '#e86f59', story: 'A connected harbor built for people to arrive, explore, and move through.' },
  ai: { label: 'Crystal observatory', color: '#8b78b9', story: 'A signal island where observatories search the horizon and beacons stay awake.' },
  data: { label: 'Autumn terraces', color: '#d39a45', story: 'A measured landscape of terraces, archives, and carefully ordered fields.' },
  cli: { label: 'Tundra workshops', color: '#4e8295', story: 'A practical outpost of workshops, radio masts, and tools close at hand.' },
  mobile: { label: 'Blossom village', color: '#e47779', story: 'A compact vertical village designed to carry a lot in a small footprint.' },
  game: { label: 'Candy citadel', color: '#a76972', story: 'A playful stronghold with banners, towers, and a few secrets off the path.' },
  other: { label: 'Lighthouse meadow', color: '#6c9a76', story: 'A characterful settlement that grew its own language as the work took shape.' },
};

const state = {
  scale: 1, panX: 0, panY: 0, dragging: false, moved: false, pointerX: 0, pointerY: 0,
  startX: 0, startY: 0, filter: 'all', selected: null, hovered: null, format: 'story',
  exportSelected: null, showNames: true, entered: false, items: [], viewWidth: 0, viewHeight: 0,
};

const world = $('#worldCanvas');
const worldContext = world.getContext('2d');

const REPO_URL = 'github.com/Mikebouskila/pelago';
const PERSONA = DATA.persona || { title: 'The Steady Harbormaster', realm: 'harbor', line: 'You keep returning, and the islands keep growing.', realmLine: '' };
const RHYTHM = DATA.rhythm || { hours: Array(24).fill(0), weekdays: Array(7).fill(0), activeDays: 0, longestStreak: 0 };
const TOTAL_SESSIONS = PROJECTS.reduce((sum, project) => sum + project.sessions, 0);
const TOTAL_TOKENS = PROJECTS.reduce((sum, project) => sum + (project.tokens?.total || 0), 0);
const TOTAL_PROMPTS = PROJECTS.reduce((sum, project) => sum + (project.prompts || 0), 0);
function tokenComparison(tokens) {
  if (tokens >= 3e9) return `about ${(tokens / 6e9).toFixed(tokens >= 6e10 ? 0 : 1)}× the whole of English Wikipedia`;
  if (tokens >= 2e6) return `about ${Math.round(tokens / 780000).toLocaleString('en-US')} copies of War and Peace`;
  return `about ${Math.max(1, Math.round(tokens / 120000))} novels' worth of text`;
}
const SERIF = 'Georgia, "Times New Roman", serif';
const SANS = 'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const CARD_ISLANDS = 7;
const FORMATS = { story: [1080, 1920], square: [1080, 1080], social: [1600, 900], github: [1280, 640] };

function hourLabel(hour) {
  if (hour === null || hour === undefined) return '—';
  const suffix = hour < 12 ? 'AM' : 'PM';
  return `${hour % 12 || 12} ${suffix}`;
}
function peakHour() {
  const hours = RHYTHM.hours || [];
  return hours.some(Boolean) ? hours.indexOf(Math.max(...hours)) : null;
}
function nightShare() {
  const hours = RHYTHM.hours || [];
  const total = hours.reduce((sum, value) => sum + value, 0);
  return total ? Math.round([22, 23, 0, 1, 2, 3, 4].reduce((sum, hour) => sum + hours[hour], 0) / total * 100) : 0;
}
function agentShares() {
  const total = PROJECTS.reduce((sum, project) => sum + project.activity, 0) || 1;
  const claude = PROJECTS.reduce((sum, project) => sum + project.activity * (crewsOf(project).claude || 0), 0);
  return { claude: Math.round(claude / total * 100), codex: 100 - Math.round(claude / total * 100) };
}
function personaParts(title = PERSONA.title) {
  const words = title.split(' ');
  return { lead: words.slice(0, -1).join(' ') || title, accent: words.length > 1 ? words[words.length - 1] : '' };
}
function wrapLines(context, text, maxWidth) {
  const lines = [];
  let line = '';
  text.split(/\s+/).forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (context.measureText(next).width > maxWidth && line) { lines.push(line); line = word; } else line = next;
  });
  if (line) lines.push(line);
  return lines;
}

function drawBrandMark(context, x, y, unit) {
  rect(context, x, y + 4 * unit, 7 * unit, 4 * unit, COLORS.coral);
  rect(context, x + unit, y + 2 * unit, 7 * unit, 6 * unit, COLORS.coral);
  rect(context, x + 2 * unit, y + 4 * unit, 1.5 * unit, 1.5 * unit, COLORS.paper);
  rect(context, x + 5.5 * unit, y + 4 * unit, 1.5 * unit, 1.5 * unit, COLORS.paper);
  context.fillStyle = COLORS.paper; context.textAlign = 'left'; context.textBaseline = 'alphabetic';
  context.font = `900 ${6.4 * unit}px ${SANS}`;
  context.fillText('PELAGO', x + 12 * unit, y + 8.4 * unit);
}

function drawRhythmBars(context, x, y, width, height, color = COLORS.sun) {
  const hours = RHYTHM.hours || [];
  const max = Math.max(1, ...hours);
  const gap = width / 24;
  const peak = peakHour();
  hours.forEach((value, hour) => {
    const barHeight = Math.max(height * .06, value / max * height);
    context.globalAlpha = hour === peak ? 1 : .34 + value / max * .4;
    rect(context, x + hour * gap + gap * .16, y + height - barHeight, gap * .68, barHeight, hour === peak ? color : '#7de7ef');
  });
  context.globalAlpha = 1;
}

function drawStat(context, x, y, value, label, scale, align = 'left') {
  context.textAlign = align;
  context.fillStyle = COLORS.paper; context.font = `700 ${58 * scale}px ${SERIF}`;
  context.fillText(value, x, y);
  context.fillStyle = '#8fb3c9'; context.font = `800 ${15 * scale}px ${SANS}`;
  if ('letterSpacing' in context) context.letterSpacing = `${2 * scale}px`;
  context.fillText(label.toUpperCase(), x, y + 32 * scale);
  if ('letterSpacing' in context) context.letterSpacing = '0px';
}

function islandLine(project) {
  const recipe = islandRecipe(project);
  return `${plural(recipe.buildings.count, 'building')}, ${plural(recipe.trees.count, 'tree')} and ${plural(recipe.waterfalls, 'waterfall')}, all built from ${compact(project.sessions)} sessions${totalTokens(project) ? ` and ${compact(totalTokens(project))} tokens` : ''}.`;
}

function cardCopy(selected) {
  if (selected) {
    return {
      overline: 'AN ISLAND I BUILT WITH AI',
      title: selected.name,
      line: islandLine(selected),
      stats: [[compact(selected.sessions), 'sessions'], [compact(selected.prompts ?? selected.messages), selected.prompts !== undefined ? 'requests' : 'messages'], totalTokens(selected) ? [compact(totalTokens(selected)), 'tokens'] : [`${activeSpan(selected)}d`, 'lifespan']],
    };
  }
  const custom = ($('#cardTitle')?.value || '').trim();
  return {
    overline: 'MY AI CODING ARCHETYPE',
    title: custom || PERSONA.title,
    line: PERSONA.line,
    stats: [
      [String(PROJECTS.length), PROJECTS.length === 1 ? 'island' : 'islands'],
      [compact(TOTAL_SESSIONS), 'sessions'],
      TOTAL_TOKENS ? [compact(TOTAL_TOKENS), 'tokens'] : [String(RHYTHM.longestStreak || RHYTHM.activeDays || 1), RHYTHM.longestStreak ? 'day streak' : 'days'],
    ],
  };
}

function drawTitle(context, title, x, y, maxWidth, size, align = 'left') {
  context.textAlign = align;
  context.font = `700 ${size}px ${SERIF}`;
  const { lead, accent } = personaParts(title);
  const isPersona = title === PERSONA.title && accent;
  const lines = isPersona ? [...wrapLines(context, lead, maxWidth), accent] : wrapLines(context, title, maxWidth);
  const shown = lines.slice(0, 3);
  shown.forEach((line, index) => {
    const last = isPersona && index === shown.length - 1;
    context.font = `${last ? 'italic 400' : '700'} ${size}px ${SERIF}`;
    context.fillStyle = last ? COLORS.sun : COLORS.paper;
    context.fillText(line, x, y + index * size * .98, maxWidth);
  });
  return y + (shown.length - 1) * size * .98;
}

function renderCard(canvas, format = state.format, selected = state.exportSelected, showNames = state.showNames) {
  // The card is the same night scene as the desktop map: the whole archipelago fills the frame and the
  // words sit on dark scrims at the top and bottom.
  const [width, height] = FORMATS[format] || FORMATS.story;
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d');
  const tall = height / width > 1.4;
  const square = !tall && height / width > .9;
  const wide = !tall && !square;
  const scale = tall || square ? width / 1080 : height / 900;
  const pad = (wide ? 60 : 68) * scale;
  const copy = cardCopy(selected);
  const year = new Date(DATA.generatedAt).getFullYear();
  const time = 2400;

  drawOcean(context, width, height, selected ? selected.seed : 73, time);
  drawCloudSea(context, width, height, time);

  // 1. The archipelago.
  const projects = selected ? [selected] : PROJECTS;
  const box = tall ? { left: 8 * scale, right: 8 * scale, top: height * .2, bottom: height * .2 }
    : square ? { left: 10 * scale, right: 10 * scale, top: height * .27, bottom: height * .16 }
      : { left: width * .38, right: 16 * scale, top: 24 * scale, bottom: 56 * scale };
  const items = makeLayout(width, height, projects, { ...box, hang: selected ? .8 : .42, maxSize: 4000 });
  const flat = { transform: { x: 0, y: 0, scale: 1 }, detail: true, selected: false, hovered: false };
  const pixel = items[0]?.px || 1;
  if (!selected) drawConnections(context, items, flat.transform, time, pixel, 'route');
  [...items].sort((a, b) => a.y - b.y).forEach((item) => drawIsland(context, item, { ...flat, label: false, time }));
  if (!selected) drawConnections(context, items, flat.transform, time, pixel, 'bridges');
  drawCloudSea(context, width, height, time, true);
  if (showNames && !selected) {
    const named = new Set([...projects].sort((a, b) => b.activity - a.activity).slice(0, tall ? 7 : 6).map((project) => project.id));
    items.filter((item) => named.has(item.project.id)).forEach((item) => drawIslandLabel(context, item, { ...flat, labelScale: scale * (tall ? 2.7 : wide ? 1.6 : 2.1) }));
  }

  // 2. Scrims so the words always read.
  const scrim = (y0, y1, from, to) => {
    const gradient = context.createLinearGradient(0, y0, 0, y1);
    gradient.addColorStop(0, from); gradient.addColorStop(1, to);
    context.fillStyle = gradient; context.fillRect(0, Math.min(y0, y1), width, Math.abs(y1 - y0));
  };
  if (wide) {
    const side = context.createLinearGradient(0, 0, width * .5, 0);
    side.addColorStop(0, 'rgba(4,9,26,.92)'); side.addColorStop(.62, 'rgba(4,9,26,.7)'); side.addColorStop(1, 'rgba(4,9,26,0)');
    context.fillStyle = side; context.fillRect(0, 0, width * .5, height);
  } else {
    scrim(0, height * (tall ? .25 : .3), 'rgba(4,9,26,.94)', 'rgba(4,9,26,0)');
    scrim(height, height * (tall ? .74 : .76), 'rgba(4,9,26,.96)', 'rgba(4,9,26,0)');
  }

  // 3. Header: brand, overline, title, line.
  drawBrandMark(context, pad, pad - 10 * scale, 4.4 * scale);
  context.textAlign = 'right'; context.fillStyle = '#9fbad4'; context.font = `800 ${15 * scale}px ${SANS}`;
  if (!wide) context.fillText(`MY PELAGO · ${year}`, width - pad, pad + 26 * scale);
  const textWidth = wide ? width * .36 - pad : width - pad * 2;
  const top = wide ? height * .2 : pad + 92 * scale;
  context.textAlign = 'left'; context.fillStyle = COLORS.coral; context.font = `900 ${(wide ? 16 : 19) * scale}px ${SANS}`;
  context.fillText(copy.overline, pad, top);
  const titleSize = (tall ? 92 : square ? 66 : 62) * scale;
  const end = drawTitle(context, copy.title, pad, top + titleSize * 1.04, textWidth, titleSize);
  context.fillStyle = '#d2e1f0'; context.font = `600 ${(tall ? 28 : 22) * scale}px ${SANS}`;
  wrapLines(context, copy.line, textWidth).slice(0, 2).forEach((line, index) => context.fillText(line, pad, end + (tall ? 58 : 44) * scale + index * (tall ? 38 : 30) * scale));

  // 4. Footer: stats, rhythm, call to action.
  const relicCount = earnedRelics().size;
  const stats = selected ? copy.stats : [...copy.stats, [`${relicCount}/${RELICS.length}`, 'relics']];
  const statScale = scale * (tall ? 1.05 : wide ? .78 : .9);
  const footerY = height - (tall ? 64 : 40) * scale;
  const statsY = wide ? height * .56 : height - (tall ? 250 : 150) * scale;
  const statsWidth = wide ? width * .36 - pad : width - pad * 2;
  if (wide) {
    stats.forEach(([value, label], index) => drawStat(context, pad + (index % 2) * statsWidth / 2, statsY + Math.floor(index / 2) * 92 * scale, value, label, scale * .9));
  } else {
    stats.forEach(([value, label], index) => drawStat(context, pad + index * statsWidth / stats.length, statsY, value, label, statScale));
  }
  if (tall && !selected) {
    drawRhythmBars(context, pad, height - 182 * scale, width - pad * 2, 44 * scale);
    context.textAlign = 'left'; context.fillStyle = '#9fbad4'; context.font = `800 ${15 * scale}px ${SANS}`;
    context.fillText(`BUSIEST HOUR · ${hourLabel(peakHour())}${RHYTHM.longestStreak ? `   ·   ${RHYTHM.longestStreak}-DAY STREAK` : ''}`, pad, height - 112 * scale);
  }
  context.font = `800 ${(tall ? 22 : 16) * scale}px ${SANS}`;
  const cta = `Map yours  →  ${REPO_URL}`;
  const ctaWidth = context.measureText(cta).width + 40 * scale;
  context.fillStyle = 'rgba(255,120,88,.2)'; context.strokeStyle = 'rgba(255,120,88,.75)'; context.lineWidth = 1.5 * scale;
  context.beginPath(); context.roundRect(pad, footerY - (tall ? 36 : 27) * scale, ctaWidth, (tall ? 52 : 38) * scale, 999); context.fill(); context.stroke();
  context.fillStyle = COLORS.paper; context.textAlign = 'left'; context.fillText(cta, pad + 20 * scale, footerY - 2 * scale);
  if (!wide) {
    context.textAlign = 'right'; context.fillStyle = '#9fbad4'; context.font = `700 ${(tall ? 19 : 14) * scale}px ${SANS}`;
    context.fillText('made locally · nothing uploaded', width - pad, footerY - 2 * scale);
  }
  return canvas;
}

function shareText(selected = state.exportSelected) {
  if (selected) return `${selected.name} is one of ${PROJECTS.length} islands I built with AI. Map your own Claude Code + Codex history 🏝️ ${REPO_URL}`;
  return `I'm ${PERSONA.title} 🏝️ ${PROJECTS.length} islands and ${compact(TOTAL_SESSIONS)} sessions built with Claude Code + Codex. Map yours: https://${REPO_URL} #pelago`;
}
function cardBlob() {
  return new Promise((resolve) => renderCard(document.createElement('canvas')).toBlob(resolve, 'image/png'));
}
function cardFileName() {
  return `pelago-${state.exportSelected ? state.exportSelected.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') : 'world'}-${state.format}.png`;
}
async function downloadCard() {
  const blob = await cardBlob();
  const anchor = document.createElement('a');
  anchor.download = cardFileName();
  anchor.href = URL.createObjectURL(blob);
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(anchor.href), 4000);
  toast('Your world is ready to travel ✦');
}
async function copyCard() {
  try {
    const blob = await cardBlob();
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    toast('Card copied. Paste it anywhere ✦');
  } catch {
    toast('Copy is blocked here. Use Download instead.');
  }
}
async function nativeShare() {
  const blob = await cardBlob();
  const file = new File([blob], cardFileName(), { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], text: shareText() }); } catch { /* user closed the sheet */ }
  } else {
    await downloadCard();
  }
}
function postToX() {
  window.open(`https://x.com/intent/post?text=${encodeURIComponent(shareText())}`, '_blank', 'noopener');
}


function seeded(seed) {
  let value = seed >>> 0;
  return () => ((value = (Math.imul(1664525, value) + 1013904223) >>> 0) / 4294967296);
}

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function compact(value) {
  const units = [[1e9, 'B'], [1e6, 'M'], [1e3, 'k']];
  const [size, suffix] = units.find(([limit]) => value >= limit) || [1, ''];
  if (!suffix) return String(Math.round(value));
  const scaled = value / size;
  return `${scaled >= 10 ? Math.round(scaled) : scaled.toFixed(1).replace(/\.0$/, '')}${suffix}`;
}
function plural(value, word) { return `${value} ${word}${value === 1 ? '' : 's'}`; }
function daysSince(value) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? 9999 : Math.max(0, Math.floor((Date.now() - date.valueOf()) / 86400000));
}
function crewsOf(project) { return project.crews || { [project.agent || 'claude']: 1 }; }
function hasCrew(project, agent) { return (crewsOf(project)[agent] || 0) > 0; }
function crewLabel(project) {
  return Object.entries(crewsOf(project)).filter(([, share]) => share >= .1).map(([agent]) => (agent === 'claude' ? 'Claude Code' : 'Codex')).join(' + ');
}
function activeSpan(project) {
  const first = new Date(project.firstActive || project.lastActive);
  const last = new Date(project.lastActive);
  if (Number.isNaN(first.valueOf()) || Number.isNaN(last.valueOf())) return 1;
  return Math.max(1, Math.round((last - first) / 86400000));
}
function recencyText(project) {
  const days = daysSince(project.lastActive);
  if (days === 0) return 'Active today';
  if (days === 1) return 'Active yesterday';
  if (days < 30) return `Active ${days} days ago`;
  if (days < 365) return `Resting for ${Math.round(days / 30)} months`;
  return `Resting for ${Math.round(days / 365)} years`;
}
function rank(project, key) {
  const values = PROJECTS.map((item) => item[key] || 0).sort((a, b) => a - b);
  const index = values.indexOf(project[key] || 0);
  return values.length < 2 ? 1 : index / (values.length - 1);
}
function activityBand(project) {
  const score = rank(project, 'activity');
  return score > .72 ? 'expansive' : score > .38 ? 'established' : 'intimate';
}
function settlementBand(project) {
  const score = rank(project, 'sessions');
  return score > .72 ? 'a bustling settlement' : score > .38 ? 'a growing village' : 'a small outpost';
}

function rect(context, x, y, width, height, color) {
  context.fillStyle = color;
  context.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(width)), Math.max(1, Math.round(height)));
}
function poly(context, points, color) {
  context.fillStyle = color;
  context.beginPath();
  context.moveTo(Math.round(points[0][0]), Math.round(points[0][1]));
  points.slice(1).forEach(([x, y]) => context.lineTo(Math.round(x), Math.round(y)));
  context.closePath();
  context.fill();
}
function ellipse(context, x, y, radiusX, radiusY, color) {
  context.fillStyle = color;
  context.beginPath();
  context.ellipse(Math.round(x), Math.round(y), Math.round(radiusX), Math.round(radiusY), 0, 0, Math.PI * 2);
  context.fill();
}

const cloudSprites = new Map();
function cloudSprite(variant, unit) {
  const key = `${variant}|${unit}`;
  if (cloudSprites.has(key)) return cloudSprites.get(key);
  const random = seeded(9000 + variant);
  const cells = 26 + Math.floor(random() * 18);
  const rows = 9 + Math.floor(random() * 4);
  const puffCount = 4 + Math.floor(random() * 3);
  const puffs = Array.from({ length: puffCount }, (_, index) => ({
    x: cells * (.16 + index / puffCount * .68) + (random() - .5) * 3,
    y: rows * (.55 + (random() - .5) * .25),
    r: rows * (.28 + random() * .24) * (index === 1 || index === 2 ? 1.25 : 1),
  }));
  const canvas = document.createElement('canvas');
  canvas.width = cells * unit; canvas.height = rows * unit;
  const context = canvas.getContext('2d');
  for (let gy = 0; gy < rows; gy += 1) for (let gx = 0; gx < cells; gx += 1) {
    const inside = puffs.some((puff) => Math.hypot(gx + .5 - puff.x, (gy + .5 - puff.y) * 1.35) < puff.r) && gy < rows - 1;
    if (!inside) continue;
    const above = puffs.some((puff) => Math.hypot(gx + .5 - puff.x, (gy - .5 - puff.y) * 1.35) < puff.r);
    context.fillStyle = !above ? '#dfe8fb' : gy > rows * .62 ? '#6f86ba' : gy > rows * .45 ? '#93a9d6' : '#b9c9ec';
    context.fillRect(gx * unit, gy * unit, unit, unit);
  }
  cloudSprites.set(key, canvas);
  return canvas;
}

// A sea of cloud tops along the bottom of the scene. The back band sits behind the islands; a thin,
// faster front band passes in front of their undersides for depth.
function drawCloudSea(context, width, height, time, front = false) {
  const unit = Math.max(2, Math.round(Math.min(width, height) / 300));
  const random = seeded(front ? 707 : 505);
  const base = height * (front ? .97 : .86);
  const count = Math.ceil(width / (unit * 30)) + 3;
  context.save();
  context.globalAlpha = front ? .55 : .9;
  for (let row = 0; row < (front ? 1 : 3); row += 1) {
    const speed = (front ? .02 : .006 + row * .004) * unit;
    for (let index = 0; index < count; index += 1) {
      const sprite = cloudSprite((index + row * 3) % 6, unit * (front ? 3 : 2 + (row > 1)));
      const span = width + sprite.width * 2;
      const x = ((index / count) * span + random() * sprite.width * .4 + time * speed) % span - sprite.width;
      const y = base + row * unit * 9 - sprite.height * .55 + (random() - .5) * unit * 6;
      context.drawImage(sprite, Math.round(x), Math.round(y));
    }
    context.globalAlpha *= .85;
  }
  if (!front) {
    const fill = context.createLinearGradient(0, base, 0, height);
    fill.addColorStop(0, 'rgba(111,134,186,0)'); fill.addColorStop(.35, 'rgba(98,120,176,.85)'); fill.addColorStop(1, 'rgba(70,92,150,1)');
    context.globalAlpha = 1;
    context.fillStyle = fill;
    context.fillRect(0, base, width, height - base);
  }
  context.restore();
}

function drawOcean(context, width, height, seed = 41, time = performance.now()) {
  // Night sky: deep zenith, a luminous band at the horizon, stars, a pixel moon and a sea of cloud below.
  const random = seeded(seed);
  const horizon = height * .62;
  const sky = context.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, '#050a1c');
  sky.addColorStop(.38, '#0b1736');
  sky.addColorStop(.62, '#1a3466');
  sky.addColorStop(.7, '#16305c');
  sky.addColorStop(1, '#0a1530');
  context.fillStyle = sky;
  context.fillRect(0, 0, width, height);

  const glow = context.createRadialGradient(width * .5, horizon, 0, width * .5, horizon, Math.max(width, height) * .6);
  glow.addColorStop(0, 'rgba(90,170,200,.22)');
  glow.addColorStop(.5, 'rgba(60,110,180,.08)');
  glow.addColorStop(1, 'rgba(20,40,90,0)');
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);

  const unit = Math.max(1, Math.round(Math.min(width, height) / 420));
  const stars = Math.floor(width * horizon / (5200 / unit));
  for (let index = 0; index < stars; index += 1) {
    const x = Math.floor(random() * width), y = Math.floor(Math.pow(random(), 1.6) * horizon * .95);
    const bright = random() > .92;
    context.globalAlpha = (bright ? .9 : .25 + random() * .4) * (1 - y / horizon * .6);
    context.fillStyle = bright ? '#fff1c4' : '#b9d4ff';
    context.fillRect(x, y, unit, unit);
    if (bright && unit > 1) { context.fillRect(x - unit, y, unit * 3, Math.max(1, unit / 2)); context.fillRect(x, y - unit, Math.max(1, unit / 2), unit * 3); }
  }
  context.globalAlpha = 1;

  // A faint band of the Milky Way.
  if (width > 480) {
    const band = seeded(seed + 3);
    for (let index = 0; index < stars * .9; index += 1) {
      const t = band();
      const x = t * width, y = height * (.05 + t * .38) + (band() - .5) * height * .12 * (1 + Math.sin(t * 9));
      context.globalAlpha = .12 + band() * .25;
      context.fillStyle = band() > .7 ? '#ffe9c4' : '#a9c8ff';
      context.fillRect(Math.round(x), Math.round(y), unit, unit);
    }
    context.globalAlpha = 1;
  }

  if (width > 480) {
    // A pixel moon with craters and a halo.
    const portrait = height > width;
    const radius = Math.round(Math.min(width, height) * (portrait ? .045 : .055) / unit) * unit;
    const mx = Math.round(width * (portrait ? .8 : .86)), my = Math.round(height * (portrait ? .1 : .17));
    const halo = context.createRadialGradient(mx, my, radius * .8, mx, my, radius * 4);
    halo.addColorStop(0, 'rgba(255,236,180,.16)'); halo.addColorStop(1, 'rgba(255,236,180,0)');
    context.fillStyle = halo;
    context.fillRect(mx - radius * 4, my - radius * 4, radius * 8, radius * 8);
    const cells = Math.round(radius / unit);
    for (let gy = -cells; gy <= cells; gy += 1) for (let gx = -cells; gx <= cells; gx += 1) {
      const d = Math.hypot(gx, gy) / cells;
      if (d > 1) continue;
      const lit = (gx + gy * .3) / cells;
      let colour = lit < -.45 ? '#c9b98e' : lit < .1 ? '#efe2b8' : '#fff6d6';
      if (d > .9) colour = '#d8c79a';
      const crater = [[-.3, -.25, .22], [.25, .2, .16], [-.05, .45, .12], [.4, -.35, .1]].some(([cx, cy, r]) => Math.hypot(gx / cells - cx, gy / cells - cy) < r);
      if (crater) colour = '#cdbb8e';
      context.fillStyle = colour;
      context.fillRect(mx + gx * unit, my + gy * unit, unit, unit);
    }
  }

  // Pixel clouds drifting slowly across the night, nearer ones faster and brighter.
  if (width > 480) {
    const drift = seeded(seed + 11);
    for (let index = 0; index < 9; index += 1) {
      const depth = drift();
      const cloudUnit = unit * (depth > .6 ? 3 : 2);
      const sprite = cloudSprite(index % 6, cloudUnit);
      const speed = (.004 + depth * .01) * unit;
      const span = width + sprite.width * 2;
      const x = ((drift() * span + time * speed) % span) - sprite.width;
      const y = height * (.12 + drift() * .62);
      context.globalAlpha = .1 + depth * .2;
      context.drawImage(sprite, Math.round(x), Math.round(y));
    }
    context.globalAlpha = 1;
    // Now and then a shooting star.
    const cycle = 7000, phase = (time % cycle) / cycle;
    if (phase < .12) {
      const run = seeded(Math.floor(time / cycle) + seed);
      const startX = width * (.2 + run() * .6), startY = height * (.05 + run() * .2);
      const progress = phase / .12;
      for (let tail = 0; tail < 14; tail += 1) {
        const k = progress - tail * .012;
        if (k < 0) continue;
        context.globalAlpha = (1 - tail / 14) * (1 - progress * .6);
        context.fillStyle = tail < 2 ? '#fff6dc' : '#bcd6ff';
        context.fillRect(Math.round(startX + k * width * .18), Math.round(startY + k * height * .09), unit * (tail < 2 ? 2 : 1), unit);
      }
      context.globalAlpha = 1;
    }
  }

  // Low mist banks along the horizon and the cloud sea beneath.
  const unitWidth = Math.max(width, height);
  for (let layer = 0; layer < 3; layer += 1) {
    for (let index = 0; index < 6 + layer * 3; index += 1) {
      const cx = random() * width * 1.2 - width * .1;
      const cy = horizon + height * (.05 + layer * .12 + random() * .06);
      const radius = unitWidth * (.07 + random() * .08) * (1 + layer * .25);
      const cloud = context.createRadialGradient(cx, cy, 0, cx, cy, radius);
      cloud.addColorStop(0, `rgba(${layer === 2 ? '120,150,210' : '96,128,196'},${.08 + layer * .03})`);
      cloud.addColorStop(1, 'rgba(60,90,160,0)');
      context.fillStyle = cloud;
      context.beginPath();
      context.ellipse(cx, cy, radius * 2, radius * .5, 0, 0, Math.PI * 2);
      context.fill();
    }
  }
}

const ART_UNIT = 420;

function islandMetrics(project) {
  const art = islandArt(project);
  const half = art.art.width * .44;
  return {
    art, half,
    unit: half / ART_UNIT,
    left: art.anchorX / ART_UNIT, right: (art.art.width - art.anchorX) / ART_UNIT,
    up: art.anchorY / ART_UNIT, down: (art.art.height - art.anchorY) / ART_UNIT,
  };
}

function drawIsland(context, item, options = {}) {
  const { project, x, y, size } = item;
  const { art, half } = islandMetrics(project);
  const px = item.px ?? size / half;
  const transform = options.transform || { x: state.panX, y: state.panY, scale: state.scale };
  const selected = options.selected ?? state.selected === project.id;
  const hovered = options.hovered ?? state.hovered === project.id;
  context.save();
  context.translate(transform.x, transform.y);
  context.scale(transform.scale, transform.scale);
  if (selected || hovered) {
    const halo = context.createRadialGradient(x, y - size * .2, size * .2, x, y - size * .2, size * 1.5);
    halo.addColorStop(0, selected ? 'rgba(255,211,106,.22)' : 'rgba(170,220,255,.12)');
    halo.addColorStop(1, 'rgba(255,211,106,0)');
    context.fillStyle = halo;
    context.fillRect(x - size * 1.6, y - size * 1.8, size * 3.2, size * 3.2);
  }
  // Art and animation are painted in raw canvas pixels so every art pixel lands on the pixel grid.
  const scale = px * transform.scale;
  const screenLeft = transform.x + (x - art.anchorX * px) * transform.scale;
  const screenTop = transform.y + (y - art.anchorY * px) * transform.scale;
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  const origin = drawIslandArtCrisp(context, art, screenLeft, screenTop, scale, { ...options, haze: options.haze ?? item.haze ?? 0 });
  if (options.animate !== false) drawIslandAnimations(context, art, origin.x, origin.y, scale, options.time ?? performance.now(), project.seed);
  context.restore();
  if (selected || hovered) {
    context.strokeStyle = selected ? '#ffe293' : 'rgba(221,242,255,.8)';
    context.lineWidth = (selected ? 2.4 : 1.5) / transform.scale;
    context.setLineDash(selected ? [7, 7] : [3, 6]);
    context.beginPath();
    context.ellipse(x, y - size * .02, size * 1.12, size * .62, 0, 0, Math.PI * 2);
    context.stroke();
    context.setLineDash([]);
  }
  context.restore();
}

function drawIslandFit(context, project, x, y, width, height, options = {}) {
  // Draws one island scaled to fit a box, centred, pixel-crisp.
  const { art } = islandMetrics(project);
  const visible = art.anchorY + (art.art.height - art.anchorY) * (options.crop ?? 1);
  const px = Math.min(width / art.art.width, height / visible);
  const left = x + (width - art.art.width * px) / 2, top = y + (height - visible * px) / 2;
  context.save();
  const origin = drawIslandArtCrisp(context, art, left, top, px, options);
  if (options.animate !== false) drawIslandAnimations(context, art, origin.x, origin.y, px, options.time ?? performance.now(), project.seed);
  context.restore();
}

function drawIslandLabel(context, item, options = {}) {
  const { project, x, y, size } = item;
  const transform = options.transform || { x: state.panX, y: state.panY, scale: state.scale };
  const diameter = size * 2.42;
  context.save();
  context.translate(transform.x, transform.y);
  context.scale(transform.scale, transform.scale);
  const labelY = y + size * .62;
  const labelScale = (options.labelScale || 1) / transform.scale;
  const fontSize = clamp(size * .085, 10 * labelScale, 15 * labelScale);
  context.textAlign = 'center';
  context.font = `800 ${fontSize}px ui-sans-serif, system-ui`;
  const width = Math.min(Math.max(diameter * .9, 120 * labelScale), context.measureText(project.name).width + fontSize * 2);
  context.fillStyle = 'rgba(7,14,34,.9)';
  context.beginPath();
  context.roundRect(x - width / 2, labelY - fontSize * 1.1, width, fontSize * 1.8, fontSize * .5);
  context.fill();
  context.strokeStyle = project.agent === 'claude' ? 'rgba(220,129,80,.72)' : 'rgba(69,163,141,.72)';
  context.lineWidth = 1;
  context.stroke();
  context.fillStyle = '#f8f1df';
  context.fillText(project.name, x, labelY + fontSize * .28, width - fontSize);
  context.restore();
}

const LINKS = (Array.isArray(DATA.links) ? DATA.links : []).filter((link) => link.a !== link.b);
function linksOf(project) {
  return LINKS.filter((link) => link.a === project.id || link.b === project.id)
    .map((link) => ({ ...link, other: PROJECTS.find((candidate) => candidate.id === (link.a === project.id ? link.b : link.a)) }))
    .filter((link) => link.other);
}

function packIslands(projects, aspect, factors = null) {
  // Deterministic golden-spiral packing. The biggest island sits at the heart; an island with a bridge
  // to one already placed searches outward from that neighbour, so related worlds end up side by side.
  const ordered = [...projects].sort((a, b) => (b.activity || 0) - (a.activity || 0));
  const placed = [];
  ordered.forEach((project, index) => {
    const factor = factors?.get(project.id) ?? 1;
    const base = islandMetrics(project);
    const metrics = { ...base, unit: base.unit * factor, left: base.left * factor, right: base.right * factor, up: base.up * factor, down: base.down * factor };
    const unit = metrics.unit;
    const twist = seeded(project.seed)() * Math.PI * 2;
    const relatives = linksOf(project).map((link) => placed.find((item) => item.project.id === link.other.id)).filter(Boolean);
    const anchor = relatives.sort((a, b) => b.project.activity - a.project.activity)[0] || { x: 0, y: 0 };
    let spot = { x: anchor.x, y: anchor.y };
    if (index) {
      for (let step = 1; step < 9000; step += 1) {
        const angle = step * 2.39996 + twist;
        const radius = .05 * Math.sqrt(step);
        const x = anchor.x + Math.cos(angle) * radius, y = anchor.y + Math.sin(angle) * radius * aspect;
        const free = placed.every((other) => Math.hypot((x - other.x) / (unit + other.unit), (y - other.y) / ((unit + other.unit) * .66)) >= 1.12);
        if (free) { spot = { x, y }; break; }
      }
    }
    placed.push({ project, unit, metrics, factor, ...spot });
  });
  return placed;
}

function makeLayout(width, height, projects = PROJECTS, options = {}) {
  const box = {
    left: options.left ?? 24, right: options.right ?? 24,
    top: options.top ?? 30, bottom: options.bottom ?? 128,
  };
  const availableWidth = Math.max(120, width - box.left - box.right);
  const availableHeight = Math.max(120, height - box.top - box.bottom);
  const aspect = clamp(availableHeight / availableWidth, .45, 2);
  const key = `${projects.map((project) => project.id).join()}|${aspect.toFixed(2)}|${options.depth ? 1 : 0}`;
  let factors = null, hazes = null, tierOf = null;
  if (options.depth) {
    factors = new Map(); hazes = new Map(); tierOf = new Map();
    sceneTiers(projects).forEach((tier, index) => tier.forEach((project) => {
      factors.set(project.id, [1, .84, .7][index]); hazes.set(project.id, [0, .1, .22][index]); tierOf.set(project.id, index);
    }));
  }
  const placed = layoutCache.get(key) || packIslands(projects, aspect, factors);
  layoutCache.set(key, placed);
  // Bounds come from each island's real artwork; hanging rock and waterfalls may trail off a little.
  const minX = Math.min(...placed.map((item) => item.x - item.metrics.left));
  const maxX = Math.max(...placed.map((item) => item.x + item.metrics.right));
  const minY = Math.min(...placed.map((item) => item.y - item.metrics.up));
  const maxY = Math.max(...placed.map((item) => item.y + item.metrics.down * (options.hang ?? .72)));
  let fit = Math.min(availableWidth / (maxX - minX), availableHeight / (maxY - minY), (options.maxSize ?? 190) * 1.1);
  if (options.crisp) fit = crispNear(fit / ART_UNIT, options.crispLow ?? .55, 1.02) * ART_UNIT;
  const offsetX = box.left + (availableWidth - (maxX - minX) * fit) / 2;
  const offsetY = box.top + (availableHeight - (maxY - minY) * fit) / 2;
  return placed.map((item) => ({
    project: item.project,
    x: offsetX + (item.x - minX) * fit,
    y: offsetY + (item.y - minY) * fit,
    size: item.unit * fit,
    px: fit / ART_UNIT * (item.factor || 1),
    haze: hazes?.get(item.project.id) || 0,
    tier: tierOf?.get(item.project.id) ?? 0,
  }));
}
const layoutCache = new Map();

// Pixel-perfect zoom levels: canvas pixels per art pixel that land exactly on the pixel grid.
const CRISP_STEPS = [.25, .5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8];
function crispNear(value, low = .72, high = 1.12) {
  let best = null;
  CRISP_STEPS.forEach((step) => { if (step >= value * low && step <= value * high) best = step; });
  return best ?? value;
}
function nearestCrisp(value) {
  return CRISP_STEPS.reduce((best, step) => (Math.abs(Math.log(step / value)) < Math.abs(Math.log(best / value)) ? step : best));
}
function basePx() { return worldLayout()[0]?.px || 1; }
function zoomTo(scale, point = { x: world.width / 2, y: world.height / 2 }, animated = true) {
  const next = clamp(scale, .45, 12);
  const panX = point.x - (point.x - state.panX) * next / state.scale;
  const panY = point.y - (point.y - state.panY) * next / state.scale;
  if (animated) animateView(panX, panY, next); else { state.panX = panX; state.panY = panY; state.scale = next; drawWorld(); }
}
function zoomStep(direction) { zoomTo(state.scale * (direction > 0 ? 1.4 : 1 / 1.4)); }

function resizeWorld() {
  const previousWidth = state.viewWidth;
  const bounds = world.getBoundingClientRect();
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  world.width = Math.max(1, Math.floor(bounds.width * ratio));
  world.height = Math.max(1, Math.floor(bounds.height * ratio));
  if (previousWidth && Math.abs(previousWidth - world.width) > 20) {
    state.panX = 0; state.panY = 0; state.scale = 1;
  }
  state.viewWidth = world.width;
  state.viewHeight = world.height;
  drawWorld();
}

let SCENE_MODE = 'packed';
function worldLayout() {
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  if (SCENE_MODE !== 'diorama' && world.height > world.width) {
    // Phones: lay the archipelago out as a panorama wider than the screen and start on the capital.
    const wide = Math.round(world.height * 1.05);
    const items = makeLayout(wide, world.height, PROJECTS, { top: 80 * ratio, bottom: 110 * ratio, left: 12 * ratio, right: 12 * ratio, maxSize: 4000, hang: .42 });
    const capital = [...items].sort((a, b) => b.project.activity - a.project.activity)[0];
    const offset = capital ? capital.x - world.width / 2 : (wide - world.width) / 2;
    return items.map((item) => ({ ...item, x: item.x - offset }));
  }
  if (SCENE_MODE !== 'diorama') {
    return makeLayout(world.width, world.height, PROJECTS, { top: 78 * ratio, bottom: 104 * ratio, left: 24 * ratio, right: 74 * ratio, maxSize: 4000, hang: .42, depth: SCENE_MODE === 'packed-depth' });
  }
  if (world.height > world.width) {
    // Phones get a panorama wider than the screen, centred on the middle; swipe to explore the edges.
    const wide = Math.round(world.height * 1.15);
    const offset = (wide - world.width) / 2;
    return composeScene(wide, world.height, PROJECTS, { top: 70 * ratio, bottom: 130 * ratio, left: 16 * ratio, right: 16 * ratio }, { hang: .38 })
      .map((item) => ({ ...item, x: item.x - offset }));
  }
  return composeScene(world.width, world.height, PROJECTS, { top: 26 * ratio, bottom: 120 * ratio, left: 30 * ratio, right: 80 * ratio }, { hang: .38 });
}


// Bridges between related islands and the golden route of when each one was founded.
function islandScreen(item, transform) {
  return { x: transform.x + item.x * transform.scale, y: transform.y + (item.y - item.size * .1) * transform.scale, r: item.size * transform.scale };
}
function curvePoints(a, b, sag, steps) {
  const points = [];
  for (let k = 0; k <= steps; k += 1) {
    const t = k / steps;
    points.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t + sag * 4 * t * (1 - t), t });
  }
  return points;
}
function drawConnections(context, items, transform, time, pixel, layer = 'all') {
  const byId = new Map(items.map((item) => [item.project.id, item]));
  const unit = Math.max(2, Math.round(pixel * 3));
  const block = (x, y, w, h, color, alpha = 1) => { context.globalAlpha = alpha; context.fillStyle = color; context.fillRect(Math.round(x), Math.round(y), w, h); };

  // The route: islands in the order you founded them.
  const route = [...items].sort((a, b) => new Date(a.project.firstActive) - new Date(b.project.firstActive)).map((item) => islandScreen(item, transform));
  if (route.length > 1 && layer !== 'bridges') {
    const samples = [];
    route.slice(1).forEach((point, index) => {
      const from = route[index];
      const lift = -Math.min(160 * unit, Math.hypot(point.x - from.x, point.y - from.y) * .22);
      curvePoints(from, point, lift, 24).forEach((sample, k) => { if (k || !index) samples.push(sample); });
    });
    context.save();
    context.lineCap = 'round';
    const trace = () => { context.beginPath(); samples.forEach((sample, index) => (index ? context.lineTo(sample.x, sample.y) : context.moveTo(sample.x, sample.y))); };
    trace(); context.strokeStyle = 'rgba(255,214,111,.06)'; context.lineWidth = unit * 5; context.stroke();
    trace(); context.strokeStyle = 'rgba(255,214,111,.38)'; context.lineWidth = unit; context.setLineDash([unit * 2, unit * 4]); context.lineDashOffset = -time * .02 * unit; context.stroke();
    context.restore();
    const lengths = [0];
    for (let k = 1; k < samples.length; k += 1) lengths.push(lengths[k - 1] + Math.hypot(samples[k].x - samples[k - 1].x, samples[k].y - samples[k - 1].y));
    const total = lengths[lengths.length - 1] || 1;
    const distance = (time * .05 * unit) % total;
    let at = lengths.findIndex((length) => length >= distance);
    if (at < 1) at = 1;
    const head = samples[at];
    const glow = context.createRadialGradient(head.x, head.y, 0, head.x, head.y, 10 * unit);
    glow.addColorStop(0, 'rgba(255,220,130,.55)'); glow.addColorStop(1, 'rgba(255,220,130,0)');
    context.globalAlpha = 1; context.fillStyle = glow;
    context.fillRect(head.x - 10 * unit, head.y - 10 * unit, 20 * unit, 20 * unit);
    block(head.x - unit * 1.5, head.y - unit * 1.5, unit * 3, unit * 3, '#fff1c4');
  }

  // Bridges: wooden rope bridges for nested projects, lantern-lit sky paths for shared names.
  LINKS.forEach((link) => {
    // Sky paths for shared names fly behind the islands; rope bridges rest on top of them.
    const wanted = link.kind === 'nest' ? 'bridges' : 'route';
    if (layer !== 'all' && layer !== wanted) return;
    const first = byId.get(link.a), second = byId.get(link.b);
    if (!first || !second) return;
    if (link.kind === 'nest' && first.tier !== undefined && first.tier !== second.tier) return;
    const a = islandScreen(first, transform), b = islandScreen(second, transform);
    const distance = Math.hypot(b.x - a.x, b.y - a.y);
    const dx = (b.x - a.x) / distance, dy = (b.y - a.y) / distance;
    const start = { x: a.x + dx * a.r * .62, y: a.y + dy * a.r * .3 };
    const end = { x: b.x - dx * b.r * .62, y: b.y - dy * b.r * .3 };
    const span = Math.hypot(end.x - start.x, end.y - start.y);
    if (span < 8 * unit) return;
    // Ropes only hang between near neighbours; far relatives are already grouped by the layout.
    if (link.kind === 'nest' && span > (a.r + b.r) * 1.1) return;
    const stroke = (points, width, color, offsetY = 0) => {
      context.beginPath();
      points.forEach((point, index) => (index ? context.lineTo(point.x, point.y + offsetY) : context.moveTo(point.x, point.y + offsetY)));
      context.lineWidth = width; context.strokeStyle = color; context.stroke();
    };
    context.save();
    context.lineCap = 'round'; context.lineJoin = 'round';
    if (link.kind === 'nest') {
      // A rope bridge: two sagging ropes, a plank deck and lantern posts at both ends.
      const points = curvePoints(start, end, span * .16, 40);
      stroke(points, unit * 4, 'rgba(10,8,20,.35)', unit * 3);
      const angle = Math.atan2(end.y - start.y, end.x - start.x);
      const plankEvery = Math.max(2, Math.round(40 / (span / (unit * 3))));
      points.forEach((point, index) => {
        if (index % plankEvery) return;
        context.save();
        context.translate(point.x, point.y);
        context.rotate(angle);
        context.fillStyle = '#9a6a44'; context.fillRect(-unit, -unit * 2.2, unit * 2, unit * 4.4);
        context.fillStyle = '#c8955e'; context.fillRect(-unit, -unit * 2.2, unit * 2, unit);
        context.restore();
      });
      stroke(points, unit * .8, '#4a3222', -unit * 3);
      stroke(points, unit * .8, '#4a3222', unit * 2.4);
      [start, end].forEach((post) => {
        context.fillStyle = '#4a3222'; context.fillRect(Math.round(post.x - unit), Math.round(post.y - unit * 8), unit * 2, unit * 10);
        context.fillStyle = '#ffd56a'; context.fillRect(Math.round(post.x - unit * 1.5), Math.round(post.y - unit * 10), unit * 3, unit * 2.5);
        const glow = context.createRadialGradient(post.x, post.y - unit * 9, 0, post.x, post.y - unit * 9, unit * 9);
        glow.addColorStop(0, 'rgba(255,207,106,.45)'); glow.addColorStop(1, 'rgba(255,207,106,0)');
        context.fillStyle = glow; context.fillRect(post.x - unit * 9, post.y - unit * 18, unit * 18, unit * 18);
      });
    } else {
      // A light bridge: an arc of starlight between islands that share a name.
      const points = curvePoints(start, end, -span * .22, 48);
      stroke(points, unit * 6, 'rgba(125,231,239,.08)');
      stroke(points, unit * 2.2, 'rgba(125,231,239,.28)');
      stroke(points, unit * .8, 'rgba(232,251,255,.75)');
      const travel = ((time * .00035) % 1 + 1) % 1;
      const spark = points[Math.floor(travel * (points.length - 1))];
      const glow = context.createRadialGradient(spark.x, spark.y, 0, spark.x, spark.y, unit * 7);
      glow.addColorStop(0, 'rgba(232,251,255,.9)'); glow.addColorStop(1, 'rgba(125,231,239,0)');
      context.fillStyle = glow; context.fillRect(spark.x - unit * 7, spark.y - unit * 7, unit * 14, unit * 14);
      [start, end].forEach((post) => {
        context.fillStyle = '#b48cff'; context.fillRect(Math.round(post.x - unit), Math.round(post.y - unit * 6), unit * 2, unit * 6);
        context.fillStyle = '#efe4ff'; context.fillRect(Math.round(post.x - unit * .5), Math.round(post.y - unit * 7), unit, unit * 2);
      });
    }
    context.restore();
  });
  context.globalAlpha = 1;
}


// ---------- Scene composition: a diorama with depth ----------
// Recent work stands in the foreground, older work recedes into the night air. The capital takes the
// front and centre; bigger islands sit near the middle of their row and related islands sit side by side.
const TIERS = [
  { scale: 1, haze: 0, band: .74 },
  { scale: .66, haze: .24, band: .46 },
  { scale: .44, haze: .46, band: .24 },
];
function sceneTiers(projects) {
  const n = projects.length;
  const tiers = [[], [], []];
  const byRecency = [...projects].sort((a, b) => new Date(b.lastActive) - new Date(a.lastActive));
  const near = n <= 3 ? n : Math.ceil(n * (n > 12 ? .3 : .42));
  const mid = n <= 3 ? 0 : Math.ceil((n - near) * .5);
  byRecency.forEach((project, index) => tiers[index < near ? 0 : index < near + mid ? 1 : 2].push(project));
  const capital = [...projects].sort((a, b) => b.activity - a.activity)[0];
  const home = tiers.findIndex((tier) => tier.includes(capital));
  if (home > 0 && tiers[0].length) {
    const swap = [...tiers[0]].sort((a, b) => a.activity - b.activity)[0];
    tiers[0] = tiers[0].map((project) => (project === swap ? capital : project));
    tiers[home] = tiers[home].map((project) => (project === capital ? swap : project));
  }
  return tiers;
}
function centreOut(list) {
  // Families first (each island followed by the relatives in the same tier), then spread from the middle.
  const sorted = [...list].sort((a, b) => b.activity - a.activity);
  const sequence = [];
  const used = new Set();
  sorted.forEach((project) => {
    const queue = [project];
    while (queue.length) {
      const next = queue.shift();
      if (used.has(next.id)) continue;
      used.add(next.id);
      sequence.push(next);
      linksOf(next).map((link) => link.other).filter((other) => list.includes(other) && !used.has(other.id)).forEach((other) => queue.push(other));
    }
  });
  const row = [];
  sequence.forEach((project, index) => (index % 2 ? row.unshift(project) : row.push(project)));
  return row;
}
function composeAt(projects, tiers, box, scale) {
  const items = [];
  const width = box.right - box.left, height = box.bottom - box.top;
  tiers.forEach((tierProjects, tierIndex) => {
    if (!tierProjects.length) return;
    const tier = TIERS[tierIndex];
    const px = scale * tier.scale;
    const span = (project) => islandArt(project).art.width * px * (.68 + seeded(project.seed ^ 77)() * .22);
    const ordered = centreOut(tierProjects);
    const total = ordered.reduce((sum, project) => sum + span(project), 0);
    const perRowMax = height > width * 1.1 ? [3, 3, 4][tierIndex] : [8, 6, 6][tierIndex];
    const wanted = Math.max(1, Math.ceil(ordered.length / perRowMax));
    void total;
    const perRow = Math.ceil(ordered.length / wanted);
    const rows = Math.ceil(ordered.length / perRow);
    for (let row = 0; row < rows; row += 1) {
      const members = centreOut(ordered.slice(row * perRow, (row + 1) * perRow));
      if (!members.length) continue;
      const rowWidth = members.reduce((sum, project) => sum + span(project), 0);
      // Each row spans the frame: its islands are spread evenly, and second rows sit half a step over.
      const step = width / members.length;
      const shift = rows > 1 ? (row % 2 ? .25 : -.25) * step : 0;
      void rowWidth;
      const rowLift = (rows - 1 - row) * height * .11 * tier.scale;
      members.forEach((project, slot) => {
        const art = islandArt(project);
        const random = seeded(project.seed ^ 0x2545f491);
        const w = span(project);
        const x = box.left + step * (slot + .5) + shift + (random() - .5) * step * .18;
        // Rows bow toward the viewer in the middle and drift back at the edges; each island floats at its own height.
        const across = (x - (box.left + width / 2)) / (width / 2);
        const bow = (1 - across * across) * height * .06 * tier.scale;
        const altitude = (random() - .5) * art.art.height * px * .22;
        const y = box.top + height * tier.band - rowLift + bow + altitude;
        items.push({ project, x, y, px, size: art.art.width * .44 * px, tier: tierIndex, haze: tier.haze });
        void w;
      });
    }
  });
  return items;
}
function sceneBounds(items, hang) {
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  items.forEach((item) => {
    const art = islandArt(item.project);
    left = Math.min(left, item.x - art.anchorX * item.px);
    right = Math.max(right, item.x + (art.art.width - art.anchorX) * item.px);
    top = Math.min(top, item.y - art.anchorY * item.px);
    bottom = Math.max(bottom, item.y + (art.art.height - art.anchorY) * item.px * hang);
  });
  return { left, right, top, bottom };
}
const sceneCache = new Map();
function composeScene(width, height, projects, box = {}, options = {}) {
  const frame = { left: box.left ?? 0, right: width - (box.right ?? 0), top: box.top ?? 0, bottom: height - (box.bottom ?? 0) };
  const key = `${width}x${height}|${JSON.stringify(frame)}|${projects.map((project) => project.id).join()}|${options.hang ?? .4}`;
  if (sceneCache.has(key)) return sceneCache.get(key).map((item) => ({ ...item }));
  const tiers = sceneTiers(projects);
  const hang = options.hang ?? .4;
  let low = .02, high = 6, best = composeAt(projects, tiers, frame, low);
  for (let step = 0; step < 22; step += 1) {
    const mid = (low + high) / 2;
    const items = composeAt(projects, tiers, frame, mid);
    const bounds = sceneBounds(items, hang);
    const fits = bounds.left >= frame.left - 1 && bounds.right <= frame.right + 1 && bounds.top >= frame.top - 1 && bounds.bottom <= frame.bottom + 1;
    if (fits) { low = mid; best = items; } else high = mid;
  }
  // Centre the finished scene vertically within the frame.
  const bounds = sceneBounds(best, hang);
  const shift = (frame.top + frame.bottom) / 2 - (bounds.top + bounds.bottom) / 2;
  best.forEach((item) => { item.y += shift; });
  best.sort((a, b) => b.tier - a.tier || a.y - b.y);
  sceneCache.set(key, best);
  return best.map((item) => ({ ...item }));
}

// Cloud banks drifting between the depth layers.
function drawCloudBank(context, y, width, seed, alpha, transform, thickness) {
  const random = seeded(seed);
  for (let index = 0; index < 9; index += 1) {
    const cx = transform.x + (random() * 1.3 - .15) * width * transform.scale;
    const cy = transform.y + (y + (random() - .5) * thickness * .5) * transform.scale;
    const radius = (thickness * (.7 + random() * .8)) * transform.scale;
    const cloud = context.createRadialGradient(cx, cy, 0, cx, cy, radius);
    cloud.addColorStop(0, `rgba(118,150,210,${alpha})`);
    cloud.addColorStop(.6, `rgba(84,116,180,${alpha * .45})`);
    cloud.addColorStop(1, 'rgba(60,90,160,0)');
    context.fillStyle = cloud;
    context.beginPath();
    context.ellipse(cx, cy, radius * 2.6, radius * .55, 0, 0, Math.PI * 2);
    context.fill();
  }
}

function drawWorld() {
  drawOcean(worldContext, world.width, world.height);
  drawCloudSea(worldContext, world.width, world.height, performance.now());
  const visible = PROJECTS.filter((project) => state.filter === 'all' || hasCrew(project, state.filter));
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  state.items = worldLayout().filter((item) => visible.includes(item.project));
  const view = { x: state.panX, y: state.panY, scale: state.scale };
  const now = performance.now();
  const capital = [...PROJECTS].sort((a, b) => b.activity - a.activity)[0];
  const topNamed = new Set([...PROJECTS].sort((a, b) => b.activity - a.activity).slice(0, 10).map((project) => project.id));
  if (SCENE_MODE === 'diorama') {
    // Far to near, with cloud banks between the layers so each one floats in its own air.
    [2, 1, 0].forEach((tier) => {
      const layer = state.items.filter((item) => item.tier === tier);
      if (!layer.length) return;
      const depth = layer.reduce((sum, item) => sum + item.y, 0) / layer.length;
      const thickness = layer[0].size * 1.1;
      layer.forEach((item) => drawIsland(worldContext, item, { label: false, haze: item.haze, time: now }));
      drawCloudBank(worldContext, depth + thickness * 1.25, world.width, 31 + tier * 7, tier === 0 ? .1 : .16, view, thickness);
    });
  } else {
    if (SCENE_MODE === 'packed' && world.width > world.height) drawConnections(worldContext, state.items, view, now, (state.items[0]?.px || .5) * state.scale, 'route');
    [...state.items].sort((a, b) => a.y - b.y).forEach((item) => drawIsland(worldContext, item, { label: false, haze: item.haze, time: now }));
  }
  drawCloudSea(worldContext, world.width, world.height, now, true);
  drawConnections(worldContext, state.items, view, now, (state.items[0]?.px || .5) * state.scale, 'bridges');
  state.items.forEach((item) => {
    const phone = world.height > world.width;
    const show = SCENE_MODE !== 'diorama' ? ((phone ? topNamed.has(item.project.id) && [...topNamed].indexOf(item.project.id) < 6 : topNamed.has(item.project.id)) || item.size * state.scale > (phone ? 220 : 140) * ratio) || state.hovered === item.project.id || state.selected === item.project.id
      : item.tier === 0 || (item.tier === 1 && world.width > world.height) || item.project === capital || state.hovered === item.project.id || state.selected === item.project.id;
    if (show) drawIslandLabel(worldContext, item, { labelScale: ratio * (item.tier === 0 ? 1 : .85) * (world.height > world.width ? 1.25 : 1) });
  });
}

function worldPoint(event) {
  const bounds = world.getBoundingClientRect();
  return { x: (event.clientX - bounds.left) * world.width / bounds.width, y: (event.clientY - bounds.top) * world.height / bounds.height };
}
function hitIsland(point) {
  const x = (point.x - state.panX) / state.scale;
  const y = (point.y - state.panY) / state.scale;
  return [...state.items].reverse().find((item) => {
    const dx = (x - item.x) / (item.size * 1.05);
    const dy = (y - item.y + item.size * .15) / (item.size * .8);
    return dx * dx + dy * dy < 1;
  });
}

function animateView(targetX, targetY, targetScale) {
  const start = { x: state.panX, y: state.panY, scale: state.scale };
  const startTime = performance.now();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const duration = reduced ? 1 : 420;
  function frame(now) {
    const progress = clamp((now - startTime) / duration, 0, 1);
    const eased = 1 - Math.pow(1 - progress, 4);
    state.panX = start.x + (targetX - start.x) * eased;
    state.panY = start.y + (targetY - start.y) * eased;
    state.scale = start.scale + (targetScale - start.scale) * eased;
    drawWorld();
    if (progress < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function resetView() { state.selected = null; state.hovered = null; animateView(0, 0, 1); $('#islandSheet').classList.remove('open'); updateCardSelection(); }
function enterWorld() { state.entered = true; $('#welcome').classList.add('dismissed'); }


// ---------- Field guide ----------
const GUIDE = [
  ['Land and water', [
    ['lg-land', 'Tokens become land', 'Every 10× more tokens makes the island bigger. Hills rise with the number of requests.'],
    ['lg-falls', 'Waterfalls', 'One more waterfall for each order of magnitude past a million tokens, up to four.'],
  ]],
  ['The settlement', [
    ['lg-cottage', 'A building for every session', 'Longer sessions build taller. Past 48 buildings, each one stands for several sessions.'],
    ['lg-forge', 'Forge', 'Shell commands. Chimneys smoke while the project is active.'],
    ['lg-workshop', 'Workshop', 'File edits and writes, with planks stacked outside.'],
    ['lg-library', 'Library', 'Reading and searching code.'],
    ['lg-tower', 'Signal tower', 'Browsing and searching the web.'],
    ['lg-windmill', 'Windmill', 'Subagents and teams. The sails turn.'],
  ]],
  ['Nature', [
    ['lg-tree', 'Trees', 'Grown from the requests you typed, clustered into groves.'],
    ['lg-field', 'Fields', 'Message volume ploughs fields on the outskirts.'],
  ]],
  ['Time and life', [
    ['lg-beacon', 'Beacon and fireflies', 'Lit when you worked here in the last three weeks.'],
    ['lg-snow', 'Snow', 'Falls on islands that rested for two months. The windows go dark.'],
    ['lg-airship', 'Airships', 'Circle islands where your agent delegated to subagents.'],
  ]],
  ['Between islands', [
    ['lg-rope', 'Rope bridge', 'One project lives inside the other’s folder.'],
    ['lg-light', 'Light bridge', 'Two projects share a distinctive name.'],
    ['lg-route', 'Golden route', 'Threads the islands in the order you founded them.'],
  ]],
];

function earnedRelics() {
  const found = new Map();
  PROJECTS.forEach((project) => relicsOf(project).forEach(({ relic }) => {
    if (!found.has(relic.id)) found.set(relic.id, []);
    found.get(relic.id).push(project);
  }));
  return found;
}

function buildGuide() {
  const read = $('#guideRead');
  read.innerHTML = '';
  GUIDE.forEach(([title, rows]) => {
    const section = element('section', 'guide-section');
    section.append(element('h3', 'guide-heading', title));
    rows.forEach(([sprite, name, copy]) => {
      const row = element('div', 'guide-row');
      const icon = element('span', 'guide-icon'); icon.append(relicIcon(sprite, 4));
      const text = element('div', ''); text.append(element('strong', '', name), element('p', '', copy));
      row.append(icon, text); section.append(row);
    });
    read.append(section);
  });
  const landmarks = element('section', 'guide-section');
  landmarks.append(element('h3', 'guide-heading', 'Landmarks and biomes'));
  landmarks.append(element('p', 'guide-copy', 'The kind of project sets the biome and the landmark at its heart: a lighthouse for web, an observatory for AI, a clock tower for data, a radio mast for CLIs, a pagoda for mobile, a castle with balloons for games, and an ancient lantern tree for everything else. The flags show which agents built it.'));
  const chips = element('div', 'category-key');
  Object.entries(CATEGORIES).forEach(([key, value]) => {
    if (!PROJECTS.some((project) => project.category === key)) return;
    const chip = element('span', 'category-chip'); chip.style.setProperty('--chip', value.color);
    chip.append(element('i', ''), document.createTextNode(value.label)); chips.append(chip);
  });
  landmarks.append(chips);
  read.append(landmarks);
  read.append(element('p', 'key-note', 'Small does not mean worse. Pelago maps the shape of your attention, never the quality of your work.'));

  const found = earnedRelics();
  $('#relicCount').textContent = `${found.size}/${RELICS.length}`;
  const relics = $('#guideRelics');
  relics.innerHTML = '';
  const intro = element('div', 'relic-summary');
  const big = element('strong', '', `${found.size} of ${RELICS.length}`);
  intro.append(big, element('span', '', 'relics found. Each one is earned by what you built, how big it grew, or the tools you used. Find them standing on your islands.'));
  relics.append(intro);
  ['Craft', 'Scale', 'Tools', 'Crew', 'Time'].forEach((group) => {
    const section = element('section', 'guide-section');
    section.append(element('h3', 'guide-heading', group));
    const grid = element('div', 'relic-grid');
    RELICS.filter((relic) => relic.group === group)
      .sort((a, b) => Number(found.has(b.id)) - Number(found.has(a.id)) || RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity])
      .forEach((relic) => {
        const owners = found.get(relic.id);
        const card = element(owners ? 'button' : 'div', `relic-card${owners ? ' earned' : ''}`);
        card.style.setProperty('--rarity', RARITY[relic.rarity].color);
        const icon = element('span', 'relic-frame'); icon.append(relicIcon(relic.sprite, 3, !owners));
        const text = element('div', '');
        text.append(element('strong', '', owners ? relic.name : '???'), element('small', 'relic-rarity', RARITY[relic.rarity].label));
        text.append(element('p', '', owners ? `On ${owners.slice(0, 2).map((project) => project.name).join(', ')}${owners.length > 2 ? ` +${owners.length - 2}` : ''}` : relic.hint));
        card.append(icon, text);
        if (owners) card.addEventListener('click', () => focusProject(owners[0]));
        grid.append(card);
      });
    section.append(grid);
    relics.append(section);
  });
}
function selectGuideTab(name) {
  $$('.guide-tab').forEach((tab) => { const on = tab.dataset.guide === name; tab.classList.toggle('active', on); tab.setAttribute('aria-selected', String(on)); });
  $('#guideRead').hidden = name !== 'read';
  $('#guideRelics').hidden = name !== 'relics';
}
$$('.guide-tab').forEach((tab) => tab.addEventListener('click', () => selectGuideTab(tab.dataset.guide)));

function fillSheetRelics(project) {
  const box = $('#sheetRelics');
  box.innerHTML = '';
  const earned = relicsOf(project);
  if (!earned.length) return;
  const title = element('div', 'why-title');
  title.append(element('span', '', `Relics found here · ${earned.length}`), element('i', ''));
  const list = element('div', 'sheet-relic-list');
  earned.forEach(({ relic, reason }) => {
    const row = element('div', 'sheet-relic');
    row.style.setProperty('--rarity', RARITY[relic.rarity].color);
    const icon = element('span', 'relic-frame'); icon.append(relicIcon(relic.sprite, 2));
    const text = element('div', '');
    const name = element('strong', '', relic.name);
    text.append(name, element('small', 'relic-rarity', RARITY[relic.rarity].label), element('p', '', reason));
    row.append(icon, text); list.append(row);
  });
  box.append(title, list);
}

function showGuide(tab = 'read') {
  enterWorld();
  selectGuideTab(typeof tab === 'string' ? tab : 'read');
  $('#mapKey').classList.add('open');
  $('#islandSheet').classList.remove('open');
}
function hideGuide() { $('#mapKey').classList.remove('open'); }

function focusProject(project, openSheet = true) {
  enterWorld();
  hideGuide();
  state.selected = project.id;
  state.hovered = null;
  const item = worldLayout().find((candidate) => candidate.project.id === project.id);
  if (item) {
    const wanted = clamp(Math.min(world.width * .5 / (item.size * 2.2), world.height * .62 / (item.size * 1.9)), 1.25, 8);
    const zoom = wanted;
    const sheetOffset = openSheet && innerWidth > 680 ? -world.width * .14 : 0;
    const phone = innerWidth <= 680;
    animateView(world.width * .5 - item.x * zoom + sheetOffset, world.height * (phone && openSheet ? .26 : .44) - item.y * zoom, zoom);
  }
  fillSheet(project);
  if (openSheet) $('#islandSheet').classList.add('open');
  updateCardSelection();
}

function fillSheet(project) {
  const category = CATEGORIES[project.category] || CATEGORIES.other;
  $('#selectedAgent').textContent = crewLabel(project);
  $('#selectedAgent').style.setProperty('--agent-color', project.agent === 'claude' ? COLORS.claude : COLORS.codex);
  $('#selectedType').textContent = `${category.label} · ${recencyText(project)}`;
  $('#selectedName').textContent = project.name;
  $('#selectedStory').textContent = `${category.story} This ${activityBand(project)} island holds ${settlementBand(project)} shaped across ${plural(project.sessions, 'session')}.`;
  $('#selectedFacts').innerHTML = '';
  const tokens = totalTokens(project);
  [[compact(project.sessions), 'sessions'], [compact(project.prompts ?? project.messages), project.prompts !== undefined ? 'requests' : 'messages'], [tokens ? compact(tokens) : `${activeSpan(project)}d`, tokens ? 'tokens' : 'lifespan']].forEach(([value, label]) => {
    const element = document.createElement('div');
    element.className = 'fact';
    element.innerHTML = `<strong>${value}</strong><small>${label}</small>`;
    $('#selectedFacts').appendChild(element);
  });
  const recipe = islandRecipe(project);
  const mix = {};
  recipe.buildings.types.slice(1).forEach((type) => { mix[type] = (mix[type] || 0) + 1; });
  const mixText = Object.entries(mix).sort((a, b) => b[1] - a[1]).map(([type, count]) => `${count} ${BUILDING_LABELS[type].toLowerCase()}${count === 1 ? '' : 's'}`).join(' · ') || 'A single keep';
  const per = recipe.buildings.perBuilding;
  const rows = [
    ['⌂', plural(recipe.buildings.count, 'building'), per > 1 ? `Each building stands for ${per} of ${compact(project.sessions)} sessions. Taller means longer sessions. The keep holds your biggest one.` : `One per session. Taller means a longer session. The keep is your biggest one.`],
    ['⚒', mixText, 'Built from the tools your agent used: forges for shell commands, workshops for edits, libraries for reading, signal towers for the web, windmills for subagents.'],
    ['♣', plural(recipe.trees.count, 'tree'), `Grown from ${compact(recipe.trees.prompts)} requests you typed${recipe.trees.perTree > 1 ? `, one tree for every ${recipe.trees.perTree}` : ''}.`],
    ['≈', recipe.waterfalls ? plural(recipe.waterfalls, 'waterfall') : 'No waterfall yet', tokens ? `${compact(tokens)} tokens flowed through here. The island's size and its waterfalls grow with every 10× more tokens.` : 'Island size follows how much work happened here.'],
    ['✦', recencyText(project), recipe.beacon ? 'The keep\'s beacon is lit and the forges are smoking because you worked here recently.' : recipe.snow ? 'Snow has settled and most windows went dark while this island rested.' : 'The lights are dimming slowly until you return.'],
  ];
  $('#whyList').innerHTML = '';
  rows.forEach(([icon, title, copy]) => {
    const row = document.createElement('div');
    row.className = 'why-row';
    const iconNode = document.createElement('span'); iconNode.className = 'why-icon'; iconNode.textContent = icon;
    const copyNode = document.createElement('div');
    const strong = document.createElement('strong'); strong.textContent = title;
    const paragraph = document.createElement('p'); paragraph.textContent = copy;
    copyNode.append(strong, paragraph); row.append(iconNode, copyNode); $('#whyList').appendChild(row);
  });
  fillSheetRelics(project);
  const links = linksOf(project);
  const linkBox = $('#sheetLinks');
  linkBox.innerHTML = '';
  if (links.length) {
    const title = document.createElement('div'); title.className = 'why-title';
    const label = document.createElement('span'); label.textContent = 'Bridges to'; title.append(label, document.createElement('i'));
    const list = document.createElement('div'); list.className = 'link-list';
    links.forEach((link) => {
      const button = document.createElement('button'); button.className = 'link-chip';
      const name = document.createElement('strong'); name.textContent = link.other.name;
      const why = document.createElement('small'); why.textContent = link.kind === 'nest' ? 'lives inside the same folder tree' : `shares “${link.word}”`;
      button.append(name, why);
      button.addEventListener('click', () => focusProject(link.other));
      list.appendChild(button);
    });
    linkBox.append(title, list);
  }
  const canvas = $('#detailCanvas');
  canvas.width = 430; canvas.height = 220;
  const context = canvas.getContext('2d');
  drawOcean(context, canvas.width, canvas.height, project.seed);
  drawIslandFit(context, project, 20, 8, canvas.width - 40, canvas.height - 8, { crop: .5 });
}

function updateCardSelection() {
  $$('.island-card').forEach((card) => card.classList.toggle('selected', card.dataset.project === state.selected));
}

function renderThumbnail(canvas, project) {
  canvas.width = 88; canvas.height = 82;
  const context = canvas.getContext('2d');
  drawOcean(context, canvas.width, canvas.height, project.seed);
  drawIslandFit(context, project, 4, 4, canvas.width - 8, canvas.height - 6, { crop: .45, glow: false, animate: false });
}

function buildInterface() {
  $('#personaTitle').textContent = PERSONA.title;
  document.title = `${PERSONA.title} · My Pelago`;
  const sessions = PROJECTS.reduce((sum, project) => sum + project.sessions, 0);
  $('#worldSummary').innerHTML = `<span>${plural(PROJECTS.length, 'island')}</span><i></i><span>${plural(sessions, 'journey')}</span><i></i><span>Generated ${new Date(DATA.generatedAt).getFullYear()}</span>`;
  $('#indexCount').textContent = String(PROJECTS.length).padStart(2, '0');
  buildGuide();
  const track = $('#indexTrack');
  PROJECTS.forEach((project) => {
    const button = document.createElement('button');
    button.className = 'island-card'; button.dataset.project = project.id; button.dataset.agents = Object.keys(crewsOf(project)).join(' ');
    const canvas = document.createElement('canvas'); canvas.className = 'card-island'; canvas.setAttribute('aria-hidden', 'true');
    const copy = document.createElement('span');
    const name = document.createElement('strong'); name.textContent = project.name;
    const meta = document.createElement('small'); meta.textContent = `${crewLabel(project)} · ${(CATEGORIES[project.category] || CATEGORIES.other).label}`;
    copy.append(name, meta); button.append(canvas, copy); button.addEventListener('click', () => focusProject(project));
    track.appendChild(button); renderThumbnail(canvas, project);
  });
}

world.addEventListener('pointerdown', (event) => {
  const point = worldPoint(event);
  state.dragging = true; state.moved = false; state.startX = state.pointerX = point.x; state.startY = state.pointerY = point.y;
  world.setPointerCapture(event.pointerId);
});
world.addEventListener('pointermove', (event) => {
  const point = worldPoint(event);
  if (state.dragging) {
    const dx = point.x - state.pointerX, dy = point.y - state.pointerY;
    if (Math.abs(point.x - state.startX) + Math.abs(point.y - state.startY) > 5) state.moved = true;
    state.panX += dx; state.panY += dy; state.pointerX = point.x; state.pointerY = point.y; drawWorld(); return;
  }
  const found = hitIsland(point);
  const next = found?.project.id || null;
  if (next !== state.hovered) { state.hovered = next; drawWorld(); }
  const label = $('#hoverLabel');
  if (found) {
    label.innerHTML = '';
    const title = document.createTextNode(found.project.name);
    const recipe = islandRecipe(found.project);
    const small = document.createElement('small'); small.textContent = `${plural(recipe.buildings.count, 'building')} · ${plural(recipe.trees.count, 'tree')} · ${plural(recipe.waterfalls, 'waterfall')} — ${recencyText(found.project)}`;
    label.append(title, small); label.classList.add('visible');
    const bounds = world.getBoundingClientRect(); label.style.left = `${event.clientX - bounds.left}px`; label.style.top = `${event.clientY - bounds.top}px`;
  } else label.classList.remove('visible');
});
world.addEventListener('pointerleave', () => { if (!state.dragging) { state.hovered = null; $('#hoverLabel').classList.remove('visible'); drawWorld(); } });
world.addEventListener('pointerup', (event) => {
  const point = worldPoint(event); state.dragging = false;
  if (!state.moved) { const found = hitIsland(point); if (found) focusProject(found.project); }
});
world.addEventListener('wheel', (event) => {
  event.preventDefault();
  const point = worldPoint(event);
  zoomTo(state.scale * Math.exp(-event.deltaY * .0016), point, false);
}, { passive: false });

function openShare(selected = null) {
  state.exportSelected = selected;
  $('#cardTitle').value = selected ? selected.name : PERSONA.title;
  renderExport(); $('#shareDialog').showModal();
}
function renderExport() { renderCard($('#exportCanvas')); }

function toast(message) { const node = $('#toast'); node.textContent = message; node.classList.add('show'); clearTimeout(node.timeout); node.timeout = setTimeout(() => node.classList.remove('show'), 2300); }

$('#enterWorld').addEventListener('click', enterWorld);
$('#openGuide').addEventListener('click', showGuide);
$('#guideButton').addEventListener('click', showGuide);
$('#closeGuide').addEventListener('click', hideGuide);
$('#closeSheet').addEventListener('click', () => { $('#islandSheet').classList.remove('open'); state.selected = null; updateCardSelection(); drawWorld(); });
$('#zoomIn').addEventListener('click', () => zoomStep(1));
$('#zoomOut').addEventListener('click', () => zoomStep(-1));
$('#resetView').addEventListener('click', resetView);
$('#shareButton').addEventListener('click', () => openShare());
if (!navigator.canShare) $('#nativeShare').hidden = true;
$('#shareSelected').addEventListener('click', () => openShare(PROJECTS.find((project) => project.id === state.selected) || null));
$$('.agent-filter').forEach((button) => button.addEventListener('click', () => {
  $$('.agent-filter').forEach((item) => item.classList.remove('active')); button.classList.add('active'); state.filter = button.dataset.filter;
  $$('.island-card').forEach((card) => { card.hidden = state.filter !== 'all' && !card.dataset.agents.split(' ').includes(state.filter); });
  if (state.selected && !PROJECTS.some((project) => project.id === state.selected && (state.filter === 'all' || hasCrew(project, state.filter)))) resetView();
  drawWorld();
}));
$$('.format-option').forEach((button) => button.addEventListener('click', () => {
  $$('.format-option').forEach((item) => item.classList.remove('active')); button.classList.add('active'); state.format = button.dataset.format; renderExport();
}));
$('[data-close-dialog]').addEventListener('click', () => $('#shareDialog').close());
$('#cardTitle').addEventListener('input', renderExport);
$('#includeNames').addEventListener('change', (event) => { state.showNames = event.target.checked; renderExport(); });
$('#downloadCard').addEventListener('click', downloadCard);
$('#copyCard').addEventListener('click', copyCard);
$('#postCard').addEventListener('click', postToX);
$('#nativeShare').addEventListener('click', nativeShare);
window.addEventListener('resize', resizeWorld);

/* ---------- Story: a Wrapped-style recap that ends on the share card ---------- */
const STORY_SECONDS = 5.6;
const story = { index: 0, timer: null, started: 0, paused: false, slides: [] };

function capital() { return [...PROJECTS].sort((a, b) => b.activity - a.activity)[0]; }
function capitalShare() {
  const total = PROJECTS.reduce((sum, project) => sum + project.activity, 0) || 1;
  return Math.max(1, Math.round((capital()?.activity || 0) / total * 100));
}
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function islandCanvas(project, width, height, size) {
  const canvas = element('canvas', 'story-island');
  canvas.width = width; canvas.height = height;
  canvas.setAttribute('aria-hidden', 'true');
  const draw = () => {
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, width, height);
    drawIslandFit(context, project, 0, 0, width, height, { crop: .62 });
  };
  draw();
  canvas.redraw = draw;
  return canvas;
}
function archipelagoCanvas(width, height, count = 7) {
  const canvas = element('canvas', 'story-island');
  canvas.width = width; canvas.height = height;
  canvas.setAttribute('aria-hidden', 'true');
  const projects = [...PROJECTS].sort((a, b) => b.activity - a.activity).slice(0, count);
  const context = canvas.getContext('2d');
  const items = makeLayout(width, height, projects, { left: 8, right: 8, top: 8, bottom: 8, maxSize: 4000, hang: .45 }).sort((a, b) => a.y - b.y);
  const flat = { x: 0, y: 0, scale: 1 };
  const draw = () => {
    context.clearRect(0, 0, width, height);
    const now = performance.now();
    drawConnections(context, items, flat, now, items[0]?.px || 1, 'route');
    items.forEach((item) => drawIsland(context, item, { transform: flat, selected: false, hovered: false }));
    drawConnections(context, items, flat, now, items[0]?.px || 1, 'bridges');
  };
  draw();
  canvas.redraw = draw;
  return canvas;
}
function clockSvg() {
  const hours = RHYTHM.hours || [];
  const max = Math.max(1, ...hours);
  const peak = peakHour();
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '-120 -120 240 240');
  svg.setAttribute('class', 'story-clock');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Activity by hour of day. Busiest hour: ${hourLabel(peak)}.`);
  const ring = document.createElementNS(ns, 'circle');
  ring.setAttribute('r', '46'); ring.setAttribute('class', 'clock-ring');
  svg.appendChild(ring);
  hours.forEach((value, hour) => {
    const angle = (hour / 24) * Math.PI * 2 - Math.PI / 2;
    const length = 8 + (value / max) * 58;
    const bar = document.createElementNS(ns, 'line');
    bar.setAttribute('x1', String(Math.cos(angle) * 52)); bar.setAttribute('y1', String(Math.sin(angle) * 52));
    bar.setAttribute('x2', String(Math.cos(angle) * (52 + length))); bar.setAttribute('y2', String(Math.sin(angle) * (52 + length)));
    bar.setAttribute('class', hour === peak ? 'clock-bar peak' : 'clock-bar');
    bar.style.setProperty('--delay', `${hour * 28}ms`);
    svg.appendChild(bar);
  });
  [['12a', 0], ['6a', 6], ['12p', 12], ['6p', 18]].forEach(([text, hour]) => {
    const angle = (hour / 24) * Math.PI * 2 - Math.PI / 2;
    const label = document.createElementNS(ns, 'text');
    label.setAttribute('x', String(Math.cos(angle) * 32)); label.setAttribute('y', String(Math.sin(angle) * 32 + 4));
    label.setAttribute('class', 'clock-label'); label.textContent = text;
    svg.appendChild(label);
  });
  return svg;
}
function countUp(node, target, format = (value) => value.toLocaleString('en-US')) {
  node.textContent = format(target);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { node.textContent = format(target); return; }
  const start = performance.now();
  const step = (now) => {
    const progress = clamp((now - start) / 1300, 0, 1);
    node.textContent = format(Math.round(target * (1 - Math.pow(1 - progress, 3))));
    if (progress < 1 && node.isConnected) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function buildSlides() {
  const top = capital();
  const shares = agentShares();
  const days = RHYTHM.activeDays || 0;
  const slides = [];

  slides.push(() => {
    const slide = element('div', 'slide slide-intro');
    slide.append(element('p', 'story-over', 'YOUR AI CODING HISTORY'));
    const big = element('p', 'story-mega'); slide.append(big); countUp(big, TOTAL_SESSIONS);
    slide.append(element('h2', 'story-title', 'sessions with your agents.'));
    slide.append(element('p', 'story-copy', days ? `Across ${plural(days, 'day')} at sea, they quietly raised ${plural(PROJECTS.length, 'island')}.` : `Together they raised ${plural(PROJECTS.length, 'island')}.`));
    return slide;
  });

  if (top) slides.push(() => {
    const slide = element('div', 'slide slide-capital');
    slide.append(element('p', 'story-over', 'YOUR CAPITAL'));
    slide.append(islandCanvas(top, 600, 560));
    slide.append(element('h2', 'story-title', top.name));
    slide.append(element('p', 'story-copy', `${capitalShare()}% of everything you built lives here: ${islandLine(top).charAt(0).toLowerCase()}${islandLine(top).slice(1)}`));
    return slide;
  });

  if (TOTAL_TOKENS) slides.push(() => {
    const slide = element('div', 'slide slide-tokens');
    slide.append(element('p', 'story-over', 'WHAT FLOWED THROUGH'));
    const big = element('p', 'story-mega'); big.textContent = compact(TOTAL_TOKENS); slide.append(big);
    slide.append(element('h2', 'story-title', 'tokens.'));
    slide.append(element('p', 'story-copy', `That's ${tokenComparison(TOTAL_TOKENS)}. On your map they became land and ${plural(PROJECTS.reduce((sum, project) => sum + waterfallCount(project), 0), 'waterfall')}.`));
    if (TOTAL_PROMPTS) slide.append(element('p', 'story-copy', `You typed ${TOTAL_PROMPTS.toLocaleString('en-US')} requests. Each one planted part of a forest.`));
    return slide;
  });

  if ((RHYTHM.hours || []).some(Boolean)) slides.push(() => {
    const slide = element('div', 'slide slide-clock');
    slide.append(element('p', 'story-over', 'WHEN YOUR LAMPS ARE LIT'));
    slide.append(clockSvg());
    const night = nightShare();
    slide.append(element('h2', 'story-title', `Busiest at ${hourLabel(peakHour())}.`));
    const peak = peakHour();
    const copy = night >= 25 ? `${night}% of your building happened after 10 PM. The harbor never really sleeps.`
      : peak >= 18 || peak < 5 ? 'Evenings are when your islands rise. The lamps come on, and so do you.'
        : peak < 10 ? 'You raise the sails early, while the water is still.'
          : 'You build in daylight and let the islands rest at night.';
    slide.append(element('p', 'story-copy', copy));
    return slide;
  });

  if (RHYTHM.longestStreak) slides.push(() => {
    const slide = element('div', 'slide slide-streak');
    slide.append(element('p', 'story-over', 'LONGEST VOYAGE'));
    const big = element('p', 'story-mega'); slide.append(big); countUp(big, RHYTHM.longestStreak);
    slide.append(element('h2', 'story-title', 'days in a row.'));
    const busy = RHYTHM.busiestDay ? new Date(`${RHYTHM.busiestDay}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) : null;
    slide.append(element('p', 'story-copy', busy ? `Your biggest day at sea was ${busy}.` : 'You kept coming back.'));
    return slide;
  });

  if (PROJECTS.some((project) => hasCrew(project, 'codex')) && PROJECTS.some((project) => hasCrew(project, 'claude'))) slides.push(() => {
    const slide = element('div', 'slide slide-crew');
    slide.append(element('p', 'story-over', 'YOUR CREW'));
    slide.append(element('h2', 'story-title', 'Two agents. One archipelago.'));
    const bar = element('div', 'crew-bar');
    const claude = element('span', 'crew claude'); claude.style.setProperty('--share', `${shares.claude}%`);
    claude.append(element('strong', '', `${shares.claude}%`), element('small', '', 'Claude Code'));
    const codex = element('span', 'crew codex'); codex.style.setProperty('--share', `${shares.codex}%`);
    codex.append(element('strong', '', `${shares.codex}%`), element('small', '', 'Codex'));
    bar.append(claude, codex); slide.append(bar);
    slide.append(element('p', 'story-copy', 'Coral flags fly over Claude Code islands, sea-green over Codex.'));
    return slide;
  });

  const relicsFound = earnedRelics();
  if (relicsFound.size) slides.push(() => {
    const slide = element('div', 'slide slide-relics');
    slide.append(element('p', 'story-over', 'RELICS FOUND'));
    const big = element('p', 'story-mega'); big.textContent = `${relicsFound.size}`; slide.append(big);
    slide.append(element('h2', 'story-title', `of ${RELICS.length} relics.`));
    const grid = element('div', 'story-relics');
    RELICS.filter((relic) => relicsFound.has(relic.id)).sort((a, b) => RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity]).slice(0, 8).forEach((relic) => {
      const tile = element('span', 'story-relic'); tile.style.setProperty('--rarity', RARITY[relic.rarity].color);
      tile.append(relicIcon(relic.sprite, 4)); tile.title = relic.name; grid.append(tile);
    });
    slide.append(grid);
    const rarest = RELICS.filter((relic) => relicsFound.has(relic.id)).sort((a, b) => RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity])[0];
    slide.append(element('p', 'story-copy', `Rarest: ${rarest.name}, ${rarest.rarity === 'epic' ? 'an' : 'a'} ${RARITY[rarest.rarity].label.toLowerCase()} relic on ${relicsFound.get(rarest.id)[0].name}.`));
    return slide;
  });

  slides.push(() => {
    const slide = element('div', 'slide slide-persona');
    slide.append(element('p', 'story-over', 'WHICH MAKES YOU'));
    slide.append(archipelagoCanvas(600, 560));
    const title = element('h2', 'story-persona');
    const { lead, accent } = personaParts();
    title.append(document.createTextNode(`${lead} `));
    if (accent) title.append(element('em', '', accent));
    slide.append(title);
    slide.append(element('p', 'story-copy', `${PERSONA.line} ${PERSONA.realmLine || ''}`.trim()));
    return slide;
  });

  slides.push(() => {
    const slide = element('div', 'slide slide-share');
    slide.append(element('p', 'story-over', 'YOUR CARD IS READY'));
    const preview = element('canvas', 'story-card');
    state.format = 'story'; state.exportSelected = null;
    renderCard(preview, 'story', null, true);
    preview.setAttribute('role', 'img'); preview.setAttribute('aria-label', `Share card: ${PERSONA.title}`);
    slide.append(preview);
    const actions = element('div', 'story-actions');
    const share = element('button', 'primary-action', 'Share my card');
    share.addEventListener('click', (event) => { event.stopPropagation(); nativeShare(); });
    const x = element('button', 'story-ghost', 'Post on X');
    x.addEventListener('click', (event) => { event.stopPropagation(); postToX(); });
    const more = element('button', 'story-ghost', 'More formats');
    more.addEventListener('click', (event) => { event.stopPropagation(); closeStory(); openShare(); });
    const explore = element('button', 'story-ghost', 'Explore the map');
    explore.addEventListener('click', (event) => { event.stopPropagation(); closeStory(); enterWorld(); });
    actions.append(share, x, more, explore);
    slide.append(actions);
    return slide;
  });
  return slides;
}

function renderStorySlide() {
  const stage = $('#storyStage');
  stage.innerHTML = '';
  const slide = story.slides[story.index]();
  stage.appendChild(slide);
  $$('#storyProgress i').forEach((bar, index) => {
    bar.classList.toggle('done', index < story.index);
    bar.classList.toggle('active', index === story.index);
    bar.style.setProperty('--duration', `${STORY_SECONDS}s`);
  });
  $('#storyCount').textContent = `${story.index + 1} / ${story.slides.length}`;
  $('#story').classList.toggle('last', story.index === story.slides.length - 1);
  scheduleStory();
}
function scheduleStory() {
  clearTimeout(story.timer);
  const last = story.index === story.slides.length - 1;
  if (last || story.paused || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  story.timer = setTimeout(() => stepStory(1), STORY_SECONDS * 1000);
}
function stepStory(direction) {
  const next = story.index + direction;
  if (next < 0 || next >= story.slides.length) return;
  story.index = next;
  renderStorySlide();
}
function openStory() {
  story.slides = buildSlides();
  story.index = 0;
  story.paused = false;
  const progress = $('#storyProgress');
  progress.innerHTML = '';
  story.slides.forEach(() => progress.appendChild(document.createElement('i')));
  $('#story').hidden = false;
  requestAnimationFrame(() => $('#story').classList.add('open'));
  renderStorySlide();
  $('#storyClose').focus();
}
function closeStory() {
  clearTimeout(story.timer);
  $('#story').classList.remove('open', 'paused');
  setTimeout(() => { $('#story').hidden = true; $('#storyStage').innerHTML = ''; }, 260);
}
function toggleStoryPause(force) {
  story.paused = force ?? !story.paused;
  $('#story').classList.toggle('paused', story.paused);
  $('#storyPause').setAttribute('aria-label', story.paused ? 'Resume story' : 'Pause story');
  $('#storyPause').textContent = story.paused ? '▶' : '❚❚';
  scheduleStory();
}

$('#storyStage').addEventListener('click', (event) => {
  if (event.target.closest('button')) return;
  const bounds = $('#storyStage').getBoundingClientRect();
  stepStory(event.clientX - bounds.left < bounds.width * .3 ? -1 : 1);
});
$('#storyPrev').addEventListener('click', () => stepStory(-1));
$('#storyNext').addEventListener('click', () => stepStory(1));
$('#storyClose').addEventListener('click', closeStory);
$('#storyPause').addEventListener('click', () => toggleStoryPause());
document.addEventListener('keydown', (event) => {
  if ($('#story').hidden) return;
  if (event.key === 'Escape') closeStory();
  else if (event.key === 'ArrowRight') stepStory(1);
  else if (event.key === 'ArrowLeft') stepStory(-1);
  else if (event.key === ' ' && !event.target.closest('button')) { event.preventDefault(); toggleStoryPause(); }
});
$$('[data-play-story]').forEach((button) => button.addEventListener('click', openStory));

buildInterface();
resizeWorld();

// Keep the world alive: water falls, smoke drifts, sails turn. Paused when hidden or when motion is reduced.
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let lastFrame = 0;
function animateWorld(now) {
  requestAnimationFrame(animateWorld);
  if (document.hidden || reducedMotion.matches || now - lastFrame < 40) return;
  lastFrame = now;
  if (!$('#story').hidden) { $$('.story-island').forEach((canvas) => canvas.redraw?.()); return; }
  if ($('#shareDialog').open) return;
  drawWorld();
}
requestAnimationFrame(animateWorld);
