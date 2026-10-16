const DATA = JSON.parse(document.getElementById('pelago-data').textContent);
const PROJECTS = Array.isArray(DATA.projects) ? DATA.projects : [];
// A world is a snapshot: recency is measured from when it was generated, so a shared page never ages.
const NOW = Date.parse(DATA.generatedAt) || Date.now();
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
  hideNames: false,
};
// Hide names: for screenshots and screen shares, no project name appears anywhere on the page or on
// cards. Where words are needed, an island is called by its kind ("Meadow harbor") instead.
try { state.hideNames = localStorage.getItem('pelago-hide-names') === '1'; } catch { /* storage blocked */ }
state.showNames = !state.hideNames;
function nameOf(project) {
  return project && !state.hideNames ? project.name : '';
}
function kindOf(project) { return (CATEGORIES[project?.category] || CATEGORIES.other).label; }
// What to call an island in a sentence: its name, or its kind when names are hidden.
function calledOf(project) { return nameOf(project) || `a ${kindOf(project).toLowerCase()}`; }

const world = $('#worldCanvas');
const worldContext = world.getContext('2d');

const REPO_URL = 'github.com/Mikebouskila/pelago';
const PERSONA = DATA.persona || { title: 'The Steady Harbormaster', realm: 'harbor', line: 'You keep returning, and the islands keep growing.', realmLine: '' };
const TEAM = DATA.team?.members?.length ? DATA.team : null;
// Each builder gets a colour; roofs, flags and airships on the islands they built wear it.
const TEAM_COLORS = ['#ff7a59', '#45b4ff', '#ffd23f', '#b07bff', '#3fd08a', '#ff8fd0', '#5ee0e0', '#ff9f43'];
if (TEAM) {
  TEAM.members.forEach((member, index) => { member.color = TEAM_COLORS[index % TEAM_COLORS.length]; });
  PROJECTS.forEach((project) => {
    if (project.builders) project.builderPalette = Object.entries(project.builders).map(([name, share]) => [builderColor(name), share]);
  });
}
function builderColor(name) { return TEAM?.members.find((member) => member.name === name)?.color || '#9fb3c8'; }
function leadBuilder(project) { return Object.keys(project.builders || {})[0] || null; }
function isShared(project) { return Object.values(project.builders || {}).filter((share) => share >= .15).length > 1; }
// A Wrapped edition (--year) names the story and the card: "CLAUDE CODE WRAPPED 2026".
const EDITION = DATA.edition?.label ? DATA.edition : null;
const RHYTHM = DATA.rhythm || { hours: Array(24).fill(0), weekdays: Array(7).fill(0), activeDays: 0, longestStreak: 0 };
const TOTAL_SESSIONS = PROJECTS.reduce((sum, project) => sum + project.sessions, 0);
const TOTAL_TOKENS = PROJECTS.reduce((sum, project) => sum + (project.tokens?.total || 0), 0);
const TOTAL_PROMPTS = PROJECTS.reduce((sum, project) => sum + (project.prompts || 0), 0);
function sinceLabel() {
  return RHYTHM.firstDay ? new Date(`${RHYTHM.firstDay}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;
}
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
      overline: TEAM ? 'AN ISLAND WE BUILT WITH AI' : 'AN ISLAND I BUILT WITH AI',
      title: nameOf(selected) || kindOf(selected),
      line: islandLine(selected),
      stats: [[compact(selected.sessions), 'sessions'], [compact(selected.prompts ?? selected.messages), selected.prompts !== undefined ? 'requests' : 'messages'], totalTokens(selected) ? [compact(totalTokens(selected)), 'tokens'] : [`${activeSpan(selected)}d`, 'lifespan']],
    };
  }
  const custom = ($('#cardTitle')?.value || '').trim();
  return {
    overline: EDITION?.label || (TEAM ? 'OUR AI CODING ARCHETYPE' : 'MY AI CODING ARCHETYPE'),
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

function renderCard(canvas, format = state.format, selected = state.exportSelected, showNames = state.showNames, options = {}) {
  // The card is the same night scene as the desktop map: the whole archipelago fills the frame and the
  // words sit on dark scrims at the top and bottom. A video records the 'scene' layer every frame and
  // lays one 'overlay' render of the words on top.
  const [width, height] = FORMATS[format] || FORMATS.story;
  const layer = options.layer || 'all';
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, width, height);
  const tall = height / width > 1.4;
  const square = !tall && height / width > .9;
  const wide = !tall && !square;
  const scale = tall || square ? width / 1080 : height / 900;
  const pad = (wide ? 60 : 68) * scale;
  const copy = cardCopy(selected);
  const year = EDITION?.year || new Date(NOW).getFullYear();
  const time = options.time ?? 2400;
  const zoom = options.zoom || 1;

  // 1. The archipelago: the capital as the hero, the next biggest islands packed tight around it.
  const ranked = [...PROJECTS].sort((a, b) => b.activity - a.activity);
  const shown = selected ? [selected] : ranked;
  const hero = selected || ranked[0];
  const factors = new Map(shown.map((project, index) => [project.id, project === hero ? (selected ? 1 : 1.6) : index < 6 ? 1.05 : .92]));
  const bleed = selected ? 0 : width * (tall ? .3 : square ? .16 : .1);
  const box = tall ? { left: -bleed, right: -bleed, top: height * .2, bottom: height * .25 }
    : square ? { left: -bleed, right: -bleed, top: height * .31, bottom: height * .26 }
      : { left: width * .4, right: -bleed, top: -height * .04, bottom: 20 * scale };
  const items = makeLayout(width, height, shown, { ...box, hang: selected ? .8 : .32, maxSize: 4000, factors });
  const flat = { transform: { x: 0, y: 0, scale: 1 }, detail: true, selected: false, hovered: false };
  const pixel = items[0]?.px || 1;
  const heroItem = items.find((item) => item.project.id === hero.id);
  if (layer !== 'overlay') {
  context.save();
  if (zoom !== 1) {
    const centreX = heroItem ? heroItem.x : width / 2, centreY = heroItem ? heroItem.y : height / 2;
    context.translate(centreX, centreY); context.scale(zoom, zoom); context.translate(-centreX, -centreY);
  }
  drawOcean(context, width, height, selected ? selected.seed : 73, time);
  drawCloudSea(context, width, height, time);
  if (heroItem) {
    // A warm halo behind the capital gives the card a centre.
    const radius = heroItem.size * 2.4;
    const halo = context.createRadialGradient(heroItem.x, heroItem.y - heroItem.size * .3, 0, heroItem.x, heroItem.y - heroItem.size * .3, radius);
    halo.addColorStop(0, 'rgba(255,214,111,.28)'); halo.addColorStop(.45, 'rgba(125,190,240,.1)'); halo.addColorStop(1, 'rgba(125,190,240,0)');
    context.fillStyle = halo; context.fillRect(heroItem.x - radius, heroItem.y - radius * 1.2, radius * 2, radius * 2.2);
  }
  if (!selected) drawConnections(context, items, flat.transform, time, pixel, 'route');
  [...items].sort((a, b) => a.y - b.y).forEach((item) => drawIsland(context, item, { ...flat, label: false, time }));
  if (!selected) drawConnections(context, items, flat.transform, time, pixel, 'bridges');
  drawCloudSea(context, width, height, time, true);
  if (showNames && !selected) {
    // Label the biggest islands whose name fits fully inside the card.
    const labelScale = (item) => scale * (item === heroItem ? 1.35 : 1) * (tall ? 2.6 : wide ? 1.6 : 2.1);
    const fits = (item) => {
      const size = clamp(item.size * .085, 10 * labelScale(item), 15 * labelScale(item));
      context.font = `800 ${size}px ui-sans-serif, system-ui`;
      const half = (context.measureText(nameOf(item.project)).width + size * 2) / 2;
      return item.x - half > 12 * scale && item.x + half < width - 12 * scale;
    };
    items.filter((item) => item === heroItem || fits(item)).sort((a, b) => b.project.activity - a.project.activity).slice(0, tall ? 5 : 4)
      .forEach((item) => drawIslandLabel(context, item, { ...flat, labelScale: labelScale(item) }));
  }
  const hidden = PROJECTS.length - shown.length;
  if (hidden > 0 && !selected && !wide) {
    const bottom = Math.max(...items.map((item) => item.y + item.size * .9));
    context.textAlign = 'center'; context.fillStyle = 'rgba(220,232,248,.75)'; context.font = `800 ${(tall ? 20 : 15) * scale}px ${SANS}`;
    if ('letterSpacing' in context) context.letterSpacing = `${2 * scale}px`;
    const centreX = wide ? (box.left + width - box.right) / 2 : width / 2;
    context.fillText(`+ ${hidden} MORE ISLANDS`, centreX, Math.min(bottom + 26 * scale, height - (tall ? 410 : wide ? 70 : 250) * scale));
    if ('letterSpacing' in context) context.letterSpacing = '0px';
  }
  context.restore();
  }
  if (layer === 'scene') return canvas;

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
    scrim(0, height * (tall ? .27 : .34), 'rgba(4,9,26,.96)', 'rgba(4,9,26,0)');
    scrim(height, height * (tall ? .7 : .66), 'rgba(4,9,26,.96)', 'rgba(4,9,26,0)');
  }

  // 3. Header: brand, overline, title, line.
  drawBrandMark(context, pad, pad - 10 * scale, 4.4 * scale);
  context.textAlign = 'right'; context.fillStyle = '#9fbad4'; context.font = `800 ${15 * scale}px ${SANS}`;
  if (!wide) context.fillText(`${TEAM ? "OUR" : "MY"} PELAGO · ${year}`, width - pad, pad + 26 * scale);
  const textWidth = wide ? width * .36 - pad : width - pad * 2;
  const top = wide ? height * .2 : pad + 92 * scale;
  context.textAlign = 'left'; context.fillStyle = COLORS.coral; context.font = `900 ${(wide ? 16 : 19) * scale}px ${SANS}`;
  context.fillText(copy.overline, pad, top);
  const titleSize = (tall ? 92 : square ? 66 : 62) * scale;
  const end = drawTitle(context, copy.title, pad, top + titleSize * 1.04, textWidth, titleSize);
  context.fillStyle = '#d2e1f0'; context.font = `600 ${(tall ? 28 : 22) * scale}px ${SANS}`;
  const lines = wrapLines(context, copy.line, textWidth).slice(0, 2);
  lines.forEach((line, index) => context.fillText(line, pad, end + (tall ? 58 : 44) * scale + index * (tall ? 38 : 30) * scale));
  if (TEAM && !selected) {
    // The crew, each in their colour.
    let chipX = pad;
    const chipY = end + (tall ? 58 : 44) * scale + lines.length * (tall ? 38 : 30) * scale + (tall ? 8 : 4) * scale;
    const dot = (tall ? 9 : 7) * scale;
    context.font = `800 ${(tall ? 24 : 18) * scale}px ${SANS}`;
    TEAM.members.slice(0, 6).forEach((member) => {
      const nameWidth = context.measureText(member.name).width;
      if (chipX + dot * 2.6 + nameWidth > pad + textWidth) return;
      context.fillStyle = member.color;
      context.beginPath(); context.arc(chipX + dot, chipY - dot * .7, dot, 0, Math.PI * 2); context.fill();
      context.fillStyle = '#fff6dc'; context.fillText(member.name, chipX + dot * 2.6, chipY);
      chipX += dot * 2.6 + nameWidth + dot * 2.8;
    });
  }

  // 4. Footer: a glass panel of stat tiles, the rarest relic, rhythm and the call to action.
  const relicsFound = earnedRelics();
  const rarest = RELICS.filter((relic) => relicsFound.has(relic.id)).sort((a, b) => RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity])[0];
  const stats = selected ? copy.stats : [...copy.stats, [`${relicsFound.size}/${RELICS.length}`, 'relics']];
  const glass = (x, y, w, h, radius) => {
    context.save();
    context.beginPath(); context.roundRect(x, y, w, h, radius);
    context.fillStyle = 'rgba(8,15,34,.72)'; context.fill();
    context.strokeStyle = 'rgba(167,198,236,.22)'; context.lineWidth = 1.5 * scale; context.stroke();
    context.restore();
  };
  const tiles = (x, y, w, h, columns) => {
    const gap = 12 * scale;
    const rows = Math.ceil(stats.length / columns);
    const tw = (w - gap * (columns - 1)) / columns, th = (h - gap * (rows - 1)) / rows;
    stats.forEach(([value, label], index) => {
      const tx = x + (index % columns) * (tw + gap), ty = y + Math.floor(index / columns) * (th + gap);
      glass(tx, ty, tw, th, 18 * scale);
      const size = Math.min(th * .44, tw * .3);
      context.textAlign = 'left'; context.fillStyle = index === 3 ? '#ffd36b' : COLORS.paper; context.font = `700 ${size}px ${SERIF}`;
      context.fillText(value, tx + 18 * scale, ty + th * .56);
      context.fillStyle = '#9fbad4'; context.font = `900 ${Math.max(11 * scale, size * .26)}px ${SANS}`;
      if ('letterSpacing' in context) context.letterSpacing = `${2 * scale}px`;
      context.fillText(label.toUpperCase(), tx + 18 * scale, ty + th * .82);
      if ('letterSpacing' in context) context.letterSpacing = '0px';
    });
  };
  const badge = (x, y, h) => {
    if (!rarest || selected) return 0;
    const iconSize = h - 12 * scale;
    context.font = `800 ${(tall ? 20 : 15) * scale}px ${SANS}`;
    const text = `Rarest relic · ${rarest.name}`;
    const w = iconSize + context.measureText(text).width + 44 * scale;
    context.save();
    context.beginPath(); context.roundRect(x, y, w, h, 999);
    context.fillStyle = 'rgba(8,15,34,.8)'; context.fill();
    context.strokeStyle = RARITY[rarest.rarity].color; context.lineWidth = 2 * scale; context.stroke();
    context.restore();
    const sprite = RELIC_SPRITES[rarest.sprite];
    const cell = Math.floor(iconSize / Math.max(sprite.rows.length, sprite.rows[0].length));
    paintSprite(rarest.sprite, (px, py, colour) => { context.fillStyle = `rgb(${colour.join(',')})`; context.fillRect(x + 12 * scale + px * cell, y + 6 * scale + py * cell, cell, cell); });
    context.textAlign = 'left'; context.fillStyle = '#fff6dc';
    context.fillText(text, x + iconSize + 26 * scale, y + h * .64);
    return w;
  };
  const footerY = height - (tall ? 64 : 40) * scale;
  if (wide) {
    const panelY = height * .5, panelW = width * .36 - pad, panelH = height * .3;
    tiles(pad, panelY, panelW, panelH, 2);
    badge(pad, panelY + panelH + 18 * scale, 48 * scale);
  } else {
    const panelH = (tall ? 150 : 104) * scale;
    const panelY = height - (tall ? 380 : 238) * scale;
    tiles(pad, panelY, width - pad * 2, panelH, 4);
    if (tall && !selected) {
      badge(pad, panelY - 82 * scale, 62 * scale);
      drawRhythmBars(context, pad, height - 196 * scale, width - pad * 2, 44 * scale);
      context.textAlign = 'left'; context.fillStyle = '#9fbad4'; context.font = `800 ${15 * scale}px ${SANS}`;
      context.fillText(`BUSIEST HOUR · ${hourLabel(peakHour())}${RHYTHM.longestStreak ? `   ·   ${RHYTHM.longestStreak}-DAY STREAK` : ''}`, pad, height - 124 * scale);
    } else if (!selected) {
      badge(width - pad - 0, -1000, 0);
    }
  }
  context.font = `800 ${(tall ? 22 : 16) * scale}px ${SANS}`;
  const cta = `Map yours  →  ${REPO_URL}`;
  const ctaWidth = context.measureText(cta).width + 40 * scale;
  context.fillStyle = 'rgba(255,120,88,.9)';
  context.beginPath(); context.roundRect(pad, footerY - (tall ? 36 : 27) * scale, ctaWidth, (tall ? 52 : 38) * scale, 999); context.fill();
  context.fillStyle = '#fff'; context.textAlign = 'left'; context.fillText(cta, pad + 20 * scale, footerY - 2 * scale);
  if (!wide) {
    context.textAlign = 'right'; context.fillStyle = '#9fbad4'; context.font = `700 ${(tall ? 19 : 14) * scale}px ${SANS}`;
    context.fillText('made locally · nothing uploaded', width - pad, footerY - 2 * scale);
  }
  return canvas;
}

function shareText(selected = state.exportSelected) {
  if (selected) return `${nameOf(selected) || 'This island'} is one of ${PROJECTS.length} islands I built with AI. Map your own Claude Code + Codex history 🏝️ ${REPO_URL}`;
  if (TEAM) return `We're ${PERSONA.title} 🏝️ ${TEAM.members.length} builders, ${PROJECTS.length} islands and ${compact(TOTAL_SESSIONS)} sessions built with Claude Code + Codex. Map yours: https://${REPO_URL} #pelago`;
  return `I'm ${PERSONA.title} 🏝️ ${PROJECTS.length} islands and ${compact(TOTAL_SESSIONS)} sessions built with Claude Code + Codex. Map yours: https://${REPO_URL} #pelago`;
}
function cardBlob() {
  return new Promise((resolve) => renderCard(document.createElement('canvas')).toBlob(resolve, 'image/png'));
}
function cardFileName() {
  return `pelago-${state.exportSelected ? (nameOf(state.exportSelected) || 'island').toLowerCase().replace(/[^a-z0-9]+/g, '-') : 'world'}-${state.format}.png`;
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
const VIDEO_SECONDS = 8;
function videoType() {
  // MP4 posts everywhere; browsers that can only record WebM still get a working file.
  const types = ['video/mp4;codecs=avc1.640033', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
  return window.MediaRecorder ? types.find((type) => MediaRecorder.isTypeSupported(type)) : null;
}
async function downloadVideo() {
  const button = $('#downloadVideo');
  const type = videoType();
  const frame = document.createElement('canvas');
  if (!type || !frame.captureStream) { toast('Video needs a recent Chrome, Edge or Safari.'); return; }
  if (button.disabled) return;
  button.disabled = true;
  const label = button.querySelector('span');
  const format = state.format, selected = state.exportSelected, names = state.showNames;
  const overlay = renderCard(document.createElement('canvas'), format, selected, names, { layer: 'overlay' });
  const scene = document.createElement('canvas');
  frame.width = overlay.width; frame.height = overlay.height;
  const context = frame.getContext('2d');
  const paint = (elapsed) => {
    const progress = elapsed / (VIDEO_SECONDS * 1000);
    // A slow push in towards the capital while the world keeps moving.
    renderCard(scene, format, selected, names, { layer: 'scene', time: 2400 + elapsed, zoom: 1 + .1 * (1 - Math.cos(Math.min(1, progress) * Math.PI)) / 2 });
    context.drawImage(scene, 0, 0);
    context.drawImage(overlay, 0, 0);
  };
  paint(0);
  const recorder = new MediaRecorder(frame.captureStream(30), { mimeType: type, videoBitsPerSecond: 12_000_000 });
  const chunks = [];
  recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
  const done = new Promise((resolve) => { recorder.onstop = resolve; });
  recorder.start();
  const start = performance.now();
  // Paced by timers rather than animation frames, which some embedded browsers throttle.
  await new Promise((resolve) => {
    const step = () => {
      const elapsed = performance.now() - start;
      paint(elapsed);
      label.textContent = `Recording… ${Math.max(1, Math.ceil(VIDEO_SECONDS - elapsed / 1000))}s`;
      if (elapsed < VIDEO_SECONDS * 1000) setTimeout(step, 1000 / 30); else resolve();
    };
    step();
  });
  recorder.stop();
  await done;
  const blob = new Blob(chunks, { type: type.split(';')[0] });
  const anchor = document.createElement('a');
  anchor.download = cardFileName().replace(/\.png$/, type.includes('mp4') ? '.mp4' : '.webm');
  anchor.href = URL.createObjectURL(blob);
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(anchor.href), 4000);
  label.textContent = 'Download video';
  button.disabled = false;
  toast('Your world, in motion ✦');
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
function escapeHtml(text) { return String(text).replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`); }
function plural(value, word) { return `${value} ${word}${value === 1 ? '' : 's'}`; }
function daysSince(value) {
  const time = value ? Date.parse(value) : NaN;
  return Number.isNaN(time) ? null : Math.max(0, Math.floor((NOW - time) / 86400000));
}
function crewsOf(project) { return project.crews || { [project.agent || 'claude']: 1 }; }
function hasCrew(project, agent) { return (crewsOf(project)[agent] || 0) > 0; }
function crewLabel(project) {
  return Object.entries(crewsOf(project)).filter(([, share]) => share >= .1).map(([agent]) => (agent === 'claude' ? 'Claude Code' : 'Codex')).join(' + ');
}
function activeSpan(project) {
  const first = Date.parse(project.firstActive || project.lastActive || ''), last = Date.parse(project.lastActive || '');
  if (Number.isNaN(first) || Number.isNaN(last)) return 1;
  return Math.max(1, Math.round((last - first) / 86400000));
}
function recencyText(project) {
  const days = daysSince(project.lastActive);
  if (days === null) return 'Date unknown';
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
  if (!nameOf(project)) return;
  const transform = options.transform || { x: state.panX, y: state.panY, scale: state.scale };
  const diameter = size * 2.42;
  context.save();
  context.translate(transform.x, transform.y);
  context.scale(transform.scale, transform.scale);
  const labelScale = (options.labelScale || 1) / transform.scale;
  const fontSize = clamp(size * .085, 10 * labelScale, 15 * labelScale);
  context.textAlign = 'center';
  context.font = `800 ${fontSize}px ui-sans-serif, system-ui`;
  // Long names are cut with an ellipsis; the full name stays in the hover label and the sheet.
  let text = nameOf(project);
  const room = Math.max(size * 2.2, 120 * labelScale) - fontSize * 2;
  if (context.measureText(text).width > room) {
    let low = 0, high = text.length;
    while (low < high) { const mid = (low + high + 1) >> 1; if (context.measureText(`${text.slice(0, mid).trimEnd()}…`).width <= room) low = mid; else high = mid - 1; }
    text = `${text.slice(0, low).trimEnd()}…`;
  }
  const width = Math.min(Math.max(diameter * .9, 120 * labelScale), context.measureText(text).width + fontSize * 2);
  // Keep the pill inside the canvas while any of its island is on screen.
  const margin = 8 * (options.labelScale || 1) / transform.scale;
  const left = -transform.x / transform.scale, top = -transform.y / transform.scale;
  const right = left + context.canvas.width / transform.scale, bottom = top + context.canvas.height / transform.scale;
  const onScreen = x + size >= left && x - size <= right && y + size >= top && y - size <= bottom;
  const fit = (value, low, high) => (onScreen && low <= high ? clamp(value, low, high) : value);
  const pillHeight = fontSize * 1.8;
  const cx = fit(x, left + margin + width / 2, right - margin - width / 2);
  const labelY = fit(y + size * .62, top + margin + fontSize * 1.1, bottom - margin - pillHeight + fontSize * 1.1);
  context.fillStyle = 'rgba(7,14,34,.9)';
  context.beginPath();
  context.roundRect(cx - width / 2, labelY - fontSize * 1.1, width, pillHeight, fontSize * .5);
  context.fill();
  context.strokeStyle = project.builderPalette ? hexAlpha(project.builderPalette[0][0], .8) : project.agent === 'claude' ? 'rgba(220,129,80,.72)' : 'rgba(69,163,141,.72)';
  context.lineWidth = 1;
  context.stroke();
  if (project.builderPalette) {
    // Who built it: one coloured segment per builder, sized by their share.
    const stripWidth = width - fontSize * 1.4, stripHeight = Math.max(2, fontSize * .2);
    let stripLeft = cx - stripWidth / 2;
    const stripTop = labelY + fontSize * .48;
    project.builderPalette.forEach(([color, share]) => {
      context.fillStyle = color; context.fillRect(stripLeft, stripTop, stripWidth * share, stripHeight); stripLeft += stripWidth * share;
    });
  }
  context.fillStyle = '#f8f1df';
  context.fillText(text, cx, labelY + fontSize * .28, width - fontSize);
  context.restore();
}

const LINKS = (Array.isArray(DATA.links) ? DATA.links : []).filter((link) => link.a !== link.b);
function linksOf(project) {
  return LINKS.filter((link) => link.a === project.id || link.b === project.id)
    .map((link) => ({ ...link, other: PROJECTS.find((candidate) => candidate.id === (link.a === project.id ? link.b : link.a)) }))
    .filter((link) => link.other);
}

function teamAnchor(project, placed, aspect) {
  // Team worlds: shared islands gather at the heart, each builder's own islands in their own direction.
  if (!TEAM || isShared(project) || !leadBuilder(project)) return null;
  const lead = leadBuilder(project);
  const home = placed.filter((item) => !isShared(item.project) && leadBuilder(item.project) === lead).sort((a, b) => b.project.activity - a.project.activity)[0];
  if (home) return home;
  const index = Math.max(0, TEAM.members.findIndex((member) => member.name === lead));
  const angle = index / TEAM.members.length * Math.PI * 2 - Math.PI / 2;
  const reach = (placed[0]?.unit || .4) * 2.4;
  return { x: Math.cos(angle) * reach, y: Math.sin(angle) * reach * aspect };
}
function packIslands(projects, aspect, factors = null) {
  // Deterministic golden-spiral packing. The biggest island sits at the heart; an island with a bridge
  // to one already placed searches outward from that neighbour, so related worlds end up side by side.
  // Collisions are checked against a uniform spatial hash: a cell is as wide as the largest possible clearance,
  // so only the 3×3 cells around a candidate can hold an island it would overlap. Same test, same spiral order.
  const ordered = [...projects].sort((a, b) => (b.activity || 0) - (a.activity || 0));
  const sized = ordered.map((project) => {
    const factor = factors?.get(project.id) ?? 1;
    const base = islandMetrics(project);
    return { project, factor, metrics: { ...base, unit: base.unit * factor, left: base.left * factor, right: base.right * factor, up: base.up * factor, down: base.down * factor } };
  });
  const largest = Math.max(1e-6, ...sized.map((entry) => entry.metrics.unit));
  const cellX = 2.24 * largest, cellY = 2.24 * largest * .66;
  const cells = new Map();
  const cellKey = (i, j) => i * 1048576 + j;
  const placed = [];
  sized.forEach(({ project, factor, metrics }, index) => {
    const unit = metrics.unit;
    const twist = seeded(project.seed)() * Math.PI * 2;
    const relatives = linksOf(project).map((link) => placed.find((item) => item.project.id === link.other.id)).filter(Boolean);
    const anchor = relatives.sort((a, b) => b.project.activity - a.project.activity)[0] || teamAnchor(project, placed, aspect) || { x: 0, y: 0 };
    let spot = { x: anchor.x, y: anchor.y };
    const free = (x, y) => {
      const ci = Math.floor(x / cellX), cj = Math.floor(y / cellY);
      for (let i = ci - 1; i <= ci + 1; i += 1) {
        for (let j = cj - 1; j <= cj + 1; j += 1) {
          const bucket = cells.get(cellKey(i, j));
          if (bucket && !bucket.every((other) => Math.hypot((x - other.x) / (unit + other.unit), (y - other.y) / ((unit + other.unit) * .66)) >= 1.12)) return false;
        }
      }
      return true;
    };
    if (index) {
      // The golden spiral keeps widening until it finds open water; it never falls back onto the anchor.
      let found = false;
      for (let step = 1; step < 4e6 && !found; step += 1) {
        const angle = step * 2.39996 + twist;
        const radius = .05 * Math.sqrt(step);
        const x = anchor.x + Math.cos(angle) * radius, y = anchor.y + Math.sin(angle) * radius * aspect;
        if (free(x, y)) { spot = { x, y }; found = true; }
      }
      if (!found) spot = { x: Math.max(...placed.map((other) => other.x + other.unit)) + unit * 2.3, y: anchor.y };
    }
    const item = { project, unit, metrics, factor, ...spot };
    placed.push(item);
    const key = cellKey(Math.floor(item.x / cellX), Math.floor(item.y / cellY));
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(item);
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
  const key = `${projects.map((project) => project.id).join()}|${aspect.toFixed(2)}|${options.depth ? 1 : 0}|${options.factors ? [...options.factors.values()].join() : ''}`;
  let factors = options.factors || null, hazes = null, tierOf = null;
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
  if (animated) animateView(panX, panY, next); else { viewAnimation += 1; state.panX = panX; state.panY = panY; state.scale = next; requestDraw(); }
}
// Pointer moves and wheel ticks ask for a frame; at most one redraw happens per display frame.
let drawQueued = 0;
function requestDraw() { if (!drawQueued) drawQueued = requestAnimationFrame(() => { drawQueued = 0; drawWorld(); }); }
// Backing-store density: phones get up to 3x so the pixel art stays crisp, larger screens stay at 2x.
function worldRatio() { return Math.min(innerWidth <= 680 ? 3 : 2, window.devicePixelRatio || 1); }
function zoomStep(direction) { zoomTo(state.scale * (direction > 0 ? 1.4 : 1 / 1.4)); }

function resizeWorld() {
  const previousWidth = state.viewWidth;
  const bounds = world.getBoundingClientRect();
  const ratio = worldRatio();
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
function visibleProjects() {
  if (state.filter.startsWith('builder:')) return PROJECTS.filter((project) => (project.builders || {})[state.filter.slice(8)] > 0);
  return PROJECTS.filter((project) => state.filter === 'all' || hasCrew(project, state.filter));
}

// The map is laid out from the islands currently shown, so filtering by agent re-forms a tight archipelago.
function worldLayout() {
  const ratio = worldRatio();
  const projects = visibleProjects();
  if (world.height > world.width) {
    // Phones: lay the archipelago out as a panorama wider than the screen and start on the capital.
    const wide = Math.round(world.height * (projects.length > 8 ? 1.05 : .8));
    const items = makeLayout(wide, world.height, projects, { top: 80 * ratio, bottom: 110 * ratio, left: 12 * ratio, right: 12 * ratio, maxSize: 4000, hang: .42 });
    const capital = [...items].sort((a, b) => b.project.activity - a.project.activity)[0];
    const offset = capital ? capital.x - world.width / 2 : (wide - world.width) / 2;
    return items.map((item) => ({ ...item, x: item.x - offset }));
  }
  return makeLayout(world.width, world.height, projects, { top: 78 * ratio, bottom: 104 * ratio, left: 24 * ratio, right: 74 * ratio, maxSize: 4000, hang: .42 });
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
  const route = [...items].sort((a, b) => (Date.parse(a.project.firstActive || '') || 0) - (Date.parse(b.project.firstActive || '') || 0)).map((item) => islandScreen(item, transform));
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
  const byRecency = [...projects].sort((a, b) => (Date.parse(b.lastActive || '') || 0) - (Date.parse(a.lastActive || '') || 0));
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
  const ratio = worldRatio();
  state.items = worldLayout();
  // Phones show the reset button only once the map has been moved or zoomed.
  const moved = Math.abs(state.panX) > 1 || Math.abs(state.panY) > 1 || Math.abs(state.scale - 1) > .01;
  if (moved !== state.viewMoved) { state.viewMoved = moved; $('.map-controls').classList.toggle('moved', moved); }
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

// A relic standing on an island, under the pointer. Boxes are in art pixels; islands are tested front to back.
function hitRelic(point) {
  const x = (point.x - state.panX) / state.scale;
  const y = (point.y - state.panY) / state.scale;
  const ordered = [...state.items].sort((a, b) => b.y - a.y);
  for (const item of ordered) {
    const art = islandArt(item.project);
    const px = item.px ?? item.size / islandMetrics(item.project).half;
    const ax = (x - item.x) / px + art.anchorX, ay = (y - item.y) / px + art.anchorY;
    const pad = 4;
    const box = (art.relicBoxes || []).find((candidate) => ax >= candidate.x - pad && ax <= candidate.x + candidate.w + pad && ay >= candidate.y - pad && ay <= candidate.y + candidate.h + pad);
    if (box) {
      const entry = relicsOf(item.project).find((candidate) => candidate.relic.id === box.id);
      if (entry) return { item, ...entry };
    }
  }
  return null;
}

function showRelicCard(hit, clientX, clientY) {
  const card = $('#relicPop');
  const { relic, reason, item } = hit;
  card.style.setProperty('--rarity', RARITY[relic.rarity].color);
  const icon = $('#relicPopIcon'); icon.innerHTML = ''; icon.append(relicIcon(relic.sprite, 5));
  $('#relicPopName').textContent = relic.name;
  $('#relicPopRarity').textContent = `${RARITY[relic.rarity].label} · ${relic.group}`;
  $('#relicPopReason').textContent = reason;
  $('#relicPopHow').textContent = relic.hint;
  const owners = earnedRelics().get(relic.id) || [];
  $('#relicPopWhere').textContent = owners.length > 1 ? `On ${calledOf(item.project)} and ${plural(owners.length - 1, 'other island')}.` : `Only on ${calledOf(item.project)}.`;
  card.hidden = false;
  const bounds = $('#atlas').getBoundingClientRect();
  if (innerWidth <= 680) { card.style.left = ''; card.style.top = ''; card.classList.add('docked'); return; }
  card.classList.remove('docked');
  const width = card.offsetWidth, height = card.offsetHeight;
  card.style.left = `${clamp(clientX - bounds.left + 16, 12, bounds.width - width - 12)}px`;
  card.style.top = `${clamp(clientY - bounds.top - height / 2, 80, bounds.height - height - 110)}px`;
}
function hideRelicCard() { $('#relicPop').hidden = true; }

let viewAnimation = 0;
function animateView(targetX, targetY, targetScale) {
  const token = viewAnimation += 1;
  const start = { x: state.panX, y: state.panY, scale: state.scale };
  const startTime = performance.now();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const duration = reduced ? 1 : 420;
  function frame(now) {
    if (token !== viewAnimation) return;
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

// The locked relics you are closest to, each on the island nearest to earning it.
function nextRelics(limit = 3, only = null) {
  const found = earnedRelics();
  const pool = only ? [only] : PROJECTS;
  const owned = only ? new Set(relicsOf(only).map(({ relic }) => relic.id)) : new Set(found.keys());
  return RELICS.filter((relic) => relic.progress && !owned.has(relic.id)).map((relic) => {
    let best = null;
    pool.forEach((project) => {
      const [have, need, unit] = relic.progress(project);
      const ratio = have / need;
      if (ratio > 0 && ratio < 1 && (!best || ratio > best.ratio)) best = { relic, project, have, need, unit, ratio };
    });
    return best;
  }).filter(Boolean).sort((a, b) => b.ratio - a.ratio).slice(0, limit);
}
function progressText({ have, need, unit, project }, withIsland = true) {
  return `${compact(have)} of ${compact(need)} ${unit}${withIsland ? ` on ${calledOf(project)}` : ''}`;
}
function nextRelicRow(next, withIsland = true) {
  const row = element('div', 'next-relic');
  row.style.setProperty('--rarity', RARITY[next.relic.rarity].color);
  row.style.setProperty('--progress', `${Math.max(3, Math.round(next.ratio * 100))}%`);
  const icon = element('span', 'relic-frame'); icon.append(relicIcon(next.relic.sprite, 2));
  const text = element('div', '');
  const head = element('div', 'next-relic-head');
  head.append(element('strong', '', next.relic.name), element('small', 'relic-rarity', `${Math.floor(next.ratio * 100)}%`));
  text.append(head, element('p', '', progressText(next, withIsland)), element('span', 'next-relic-bar'));
  row.append(icon, text);
  if (withIsland) { row.tabIndex = 0; row.setAttribute('role', 'button'); row.addEventListener('click', () => focusProject(next.project)); }
  return row;
}

function buildGuide() {
  const read = $('#guideRead');
  read.innerHTML = '';
  if (TEAM) {
    const section = element('section', 'guide-section');
    section.append(element('h3', 'guide-heading', 'Your crew'));
    section.append(element('p', 'guide-copy', 'Every builder has a colour. Roofs, flags and airships wear the colour of whoever built them, and the strip under each name shows how the work was split. Islands you share sit at the heart of the map; everyone\'s own islands gather on their side of it.'));
    const chips = element('div', 'category-key');
    TEAM.members.forEach((member) => {
      const chip = element('span', 'category-chip'); chip.style.setProperty('--chip', member.color);
      chip.append(element('i', ''), document.createTextNode(`${member.name} · ${member.title.replace(/^The /, '')}`)); chips.append(chip);
    });
    section.append(chips);
    read.append(section);
  }
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
  read.append(element('p', 'key-note', `Everything here is counted from the transcripts Claude Code and Codex keep on this computer${sinceLabel() ? `, which go back to ${sinceLabel()}` : ''}. Sessions on other machines, or ones the tools have already cleaned up, are not included.`));
  read.append(element('p', 'key-note', 'Small does not mean worse. Pelago maps the shape of your attention, never the quality of your work.'));

  const found = earnedRelics();
  $('#relicCount').textContent = `${found.size}/${RELICS.length}`;
  const relics = $('#guideRelics');
  relics.innerHTML = '';
  const intro = element('div', 'relic-summary');
  const big = element('strong', '', `${found.size} of ${RELICS.length}`);
  intro.append(big, element('span', '', 'relics found. Each one is earned by what you built, how big it grew, or the tools you used. Find them standing on your islands and click one to see why it is there.'));
  relics.append(intro);
  const upcoming = nextRelics(3);
  if (upcoming.length) {
    const section = element('section', 'guide-section');
    section.append(element('h3', 'guide-heading', 'Closest to unlocking'));
    const list = element('div', 'next-relic-list');
    upcoming.forEach((next) => list.append(nextRelicRow(next)));
    section.append(list);
    relics.append(section);
  }
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
        text.append(element('strong', '', owners ? relic.name : 'Locked relic'), element('small', 'relic-rarity', RARITY[relic.rarity].label));
        const how = element('p', 'relic-how'); how.append(element('b', '', 'Earned by: '), document.createTextNode(relic.hint.replace(/\.$/, '')));
        text.append(how);
        if (owners) text.append(element('p', 'relic-where', state.hideNames ? `Found on ${plural(owners.length, 'island')}` : `Found on ${owners.slice(0, 2).map((project) => nameOf(project)).join(', ')}${owners.length > 2 ? ` and ${owners.length - 2} more` : ''}`));
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

function fillSheetBuilders(project) {
  const box = $('#sheetBuilders');
  if (!box) return;
  box.innerHTML = '';
  if (!project.builders) return;
  const names = Object.keys(project.builders);
  const title = element('div', 'why-title');
  title.append(element('span', '', names.length > 1 ? `Built together · ${names.length} builders` : `Built by ${names[0]}`), element('i', ''));
  const list = element('div', 'builder-list');
  Object.entries(project.builders).forEach(([name, share]) => {
    const work = (project.work || {})[name] || {};
    const row = element('div', 'builder-row');
    row.style.setProperty('--builder', builderColor(name));
    row.style.setProperty('--share', `${Math.max(3, Math.round(share * 100))}%`);
    const head = element('div', 'builder-head');
    head.append(element('strong', '', name), element('small', '', `${Math.round(share * 100)}%`));
    const detail = [work.sessions && plural(work.sessions, 'session'), work.prompts && `${compact(work.prompts)} requests`, work.tokens && `${compact(work.tokens)} tokens`].filter(Boolean).join(' · ');
    row.append(head, element('span', 'builder-bar'), element('p', '', detail));
    list.append(row);
  });
  box.append(title, list);
  if (names.length > 1) box.append(element('p', 'builder-note', 'Each roof wears the colour of whoever built it, in proportion to their share of the work.'));
}
function fillSheetRelics(project) {
  const box = $('#sheetRelics');
  box.innerHTML = '';
  const earned = relicsOf(project);
  if (earned.length) {
    const title = element('div', 'why-title');
    title.append(element('span', '', `Relics found here · ${earned.length}`), element('i', ''));
    const list = element('div', 'sheet-relic-list');
    earned.forEach(({ relic, reason }) => {
      const row = element('div', 'sheet-relic');
      row.style.setProperty('--rarity', RARITY[relic.rarity].color);
      const icon = element('span', 'relic-frame'); icon.append(relicIcon(relic.sprite, 2));
      const text = element('div', '');
      text.append(element('strong', '', relic.name), element('small', 'relic-rarity', RARITY[relic.rarity].label), element('p', '', reason));
      row.append(icon, text); list.append(row);
    });
    box.append(title, list);
  }
  const next = nextRelics(1, project)[0];
  if (next) {
    const title = element('div', 'why-title');
    title.append(element('span', '', 'Next relic here'), element('i', ''));
    box.append(title, nextRelicRow(next, false));
  }
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
  announce(`${nameOf(project) || kindOf(project)} selected. ${recencyText(project)}, ${plural(project.sessions, 'session')}.`);
}
function announce(text) {
  const node = $('#srAnnounce');
  node.textContent = '';
  setTimeout(() => { node.textContent = text; }, 60);
}
function closeSheet() { $('#islandSheet').classList.remove('open'); state.selected = null; updateCardSelection(); drawWorld(); }

function fillSheet(project) {
  const category = CATEGORIES[project.category] || CATEGORIES.other;
  $('#selectedAgent').textContent = crewLabel(project);
  $('#selectedAgent').style.setProperty('--agent-color', project.agent === 'claude' ? COLORS.claude : COLORS.codex);
  $('#selectedType').textContent = `${category.label} · ${recencyText(project)}`;
  $('#selectedName').textContent = nameOf(project) || kindOf(project);
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
  const mixText = Object.entries(mix).sort((a, b) => b[1] - a[1]).map(([type, count]) => `${count} ${count === 1 ? BUILDING_LABELS[type].toLowerCase() : BUILDING_LABELS[type].toLowerCase().replace(/y$/, "ie") + "s"}`).join(' · ') || 'A single keep';
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
  fillSheetBuilders(project);
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
      const name = document.createElement('strong'); name.textContent = nameOf(link.other) || kindOf(link.other);
      const why = document.createElement('small'); why.textContent = link.kind === 'nest' ? 'lives inside the same folder tree' : state.hideNames ? "shares a word in its name" : `shares “${link.word}”`;
      button.append(name, why);
      button.addEventListener('click', () => focusProject(link.other));
      list.appendChild(button);
    });
    linkBox.append(title, list);
  }
  drawDetail(project);
}
function drawDetail(project) {
  // Drawn at the preview's real device size so every art pixel stays square; skipped while the preview is hidden.
  const canvas = $('#detailCanvas'), box = canvas.getBoundingClientRect();
  if (!project || !box.width || !box.height) return;
  const ratio = Math.min(3, window.devicePixelRatio || 1);
  canvas.width = Math.round(box.width * ratio); canvas.height = Math.round(box.height * ratio);
  const width = canvas.width, height = canvas.height;
  const context = canvas.getContext('2d');
  drawOcean(context, width, height, project.seed);
  drawIslandFit(context, project, width * .047, height * .036, width * .906, height * .964, { crop: .5 });
}

function updateCardSelection() {
  $$('.island-card').forEach((card) => card.classList.toggle('selected', card.dataset.project === state.selected));
}

function renderThumbnail(canvas, project) {
  // A square backing store at the thumbnail's device size: one canvas pixel per screen pixel.
  const css = canvas.getBoundingClientRect().width;
  if (!css) return;
  const size = Math.round(css * Math.min(3, window.devicePixelRatio || 1));
  if (canvas.width === size && canvas.height === size) return;
  canvas.width = size; canvas.height = size;
  const context = canvas.getContext('2d');
  drawOcean(context, size, size, project.seed);
  drawIslandFit(context, project, size * .05, size * .05, size * .9, size * .93, { crop: .45, glow: false, animate: false });
}
function refreshThumbnails() {
  $$('.island-card:not([hidden])').forEach((card) => renderThumbnail(card.querySelector('canvas'), PROJECTS.find((project) => project.id === card.dataset.project)));
}

function updateSummary() {
  const shown = visibleProjects();
  // With one builder picked, count only their own work on the islands they touched.
  const builder = state.filter.startsWith('builder:') ? state.filter.slice(8) : null;
  const sessions = shown.reduce((sum, project) => sum + (builder ? project.work?.[builder]?.sessions || 0 : project.sessions), 0);
  const tokens = shown.reduce((sum, project) => sum + (builder ? project.work?.[builder]?.tokens || 0 : totalTokens(project)), 0);
  const who = state.filter === 'all' ? '' : `<span>${state.filter.startsWith('builder:') ? escapeHtml(state.filter.slice(8)) : state.filter === 'claude' ? 'Claude Code' : 'Codex'}</span><i></i>`;
  const crew = TEAM ? `<span class="sum-builders">${plural(TEAM.members.length, 'builder')}</span><i class="sum-builders"></i>` : '';
  $('#worldSummary').innerHTML = `${crew}${who}<span>${plural(shown.length, 'island')}</span><i class="sum-sessions"></i><span class="sum-sessions">${compact(sessions)} sessions</span><i></i><span>${compact(tokens)} tokens</span>${sinceLabel() ? `<i class="sum-since"></i><span class="sum-since">since ${sinceLabel()}</span>` : ''}`;
  fitSummary();
}
function fitSummary() {
  // The masthead never wraps: when the summary runs out of room it drops its least useful parts first.
  const summary = $('#worldSummary');
  summary.querySelectorAll('.dropped').forEach((node) => node.classList.remove('dropped'));
  for (const part of ['sum-since', 'sum-builders', 'sum-sessions']) {
    if (summary.scrollWidth <= summary.clientWidth) break;
    summary.querySelectorAll(`.${part}`).forEach((node) => node.classList.add('dropped'));
  }
}

// The one prompt; it must stay identical to the "Just me" block in the README (a test checks).
const GET_PROMPT = String.raw`Build my Pelago world from my local AI coding history.
Clone https://github.com/Mikebouskila/pelago
to ~/.claude/skills/pelago (Codex: ~/.codex/skills/pelago;
if it exists, git pull) and run:
python3 <that folder>/scripts/pelago.py \
  --output ./pelago-world.html --open
It only reads ~/.claude/projects and ~/.codex/sessions.
Then tell me my archetype and to press "Play your story".
Don't quote my prompts.`;
const DEMO_URL = 'https://mikebouskila.github.io/pelago/';
const DEMO_SHARE = 'Pelago turns your Claude Code + Codex history into a living pixel-art world. Fly over a sample:';
const ARCHETYPE_COUNT = (DATA.archetypes?.prefixes?.length || 11) * (DATA.archetypes?.titles?.length || 8);
function setText(selector, text) { const node = $(selector); if (node) node.textContent = text; }
function markDemo() {
  // The sample world doubles as the public live demo: say so, and lead to one prompt. It never offers to post someone else's card.
  document.title = 'Pelago · your AI coding history as a pixel-art world';
  setText('.brand-edition', 'SAMPLE WORLD');
  setText('#personaChip span', 'This builder is');
  const play = $('.welcome .primary-action');
  if (play) play.innerHTML = '<span aria-hidden="true">▶</span> Watch the story';
  const watch = $('.mast-actions [data-play-story]');
  if (watch) { watch.setAttribute('aria-label', 'Watch the story'); watch.title = 'Watch the story'; watch.lastElementChild.textContent = 'The story'; }
  $('#guideButton')?.classList.add('icon-only');
  ['#shareButton', '#shareSelected', '#openGuide', '#welcome .privacy'].forEach((selector) => { const node = $(selector); if (node) node.hidden = true; });
  const get = element('button', 'get-action');
  get.innerHTML = 'Get your own world in one prompt <span aria-hidden="true">→</span>';
  get.addEventListener('click', () => openGetYours('welcome'));
  $('.welcome-actions')?.after(get);
  const star = element('a', 'star-link');
  star.href = `https://${REPO_URL}`; star.target = '_blank'; star.rel = 'noopener'; star.setAttribute('aria-label', 'Star Pelago on GitHub');
  star.innerHTML = '<span aria-hidden="true">★</span><span class="star-text">Star</span>';
  const cta = element('button', 'demo-cta', 'Get yours');
  cta.addEventListener('click', () => openGetYours('header'));
  $('.mast-actions')?.append(star, cta);
  buildGetYours();
}
function buildGetYours() {
  const dialog = element('dialog', 'get-dialog'); dialog.id = 'getYours'; dialog.setAttribute('aria-labelledby', 'getYoursTitle');
  dialog.innerHTML = `<div class="get-body">
    <div class="get-head"><div><p class="overline">GET YOURS</p><h2 id="getYoursTitle">Your world, in about a minute.</h2></div><button class="icon-button" data-close-get aria-label="Close">×</button></div>
    <ol class="get-steps">
      <li><strong id="getStepOne">Copy this prompt</strong><textarea class="get-prompt" id="getPrompt" readonly spellcheck="false" aria-labelledby="getStepOne"></textarea>
        <div class="get-buttons"><button class="primary-action" id="getShare">Send to my computer</button><a class="get-mini" id="getEmail">Email it to me</a><button class="primary-action" id="getCopy">Copy prompt</button></div></li>
      <li><strong>Paste it into a new Claude Code or Codex session</strong></li>
      <li><strong>Your world opens in your browser. Nothing leaves your machine.</strong></li>
    </ol>
    <details class="get-terminal"><summary>No agent? Two lines in a terminal</summary><pre><code>git clone https://github.com/Mikebouskila/pelago &amp;&amp;
python3 pelago/scripts/pelago.py --open</code></pre></details>
  </div>`;
  document.body.append(dialog);
  $('#getPrompt').value = GET_PROMPT;
  $('#getEmail').href = `mailto:?subject=${encodeURIComponent('My Pelago prompt')}&body=${encodeURIComponent(`Paste this into Claude Code or Codex on your computer:\n\n${GET_PROMPT}\n\nSample world: ${DEMO_URL}`)}`;
  $('#getCopy').addEventListener('click', copyPrompt);
  $('#getShare').addEventListener('click', async () => {
    try { await navigator.share({ title: 'Pelago', text: GET_PROMPT, url: DEMO_URL }); } catch (error) { if (error?.name !== 'AbortError') copyPrompt(); }
  });
  dialog.querySelector('[data-close-get]').addEventListener('click', () => dialog.close());
  // A click that lands on the dialog itself is a click on the backdrop.
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
}
function openGetYours(source = 'header') {
  const dialog = $('#getYours');
  if (!dialog) return;
  if (!$('#story').hidden) closeStory();
  // Phones get a bottom sheet that sends the prompt to the computer where the agent lives.
  const phone = coarsePointer.matches || innerWidth <= 680;
  dialog.classList.toggle('sheet', phone); dialog.dataset.source = source;
  $('#getStepOne').textContent = phone ? 'Send it to your computer' : 'Copy this prompt';
  $('#getShare').hidden = !phone || !navigator.share;
  $('#getEmail').hidden = !phone;
  $('#getCopy').className = phone ? 'get-mini' : 'primary-action';
  if (!dialog.open) dialog.showModal();
  $('#getPrompt').scrollTop = 0;
  ($('#getShare').hidden ? $('#getCopy') : $('#getShare')).focus();
}
async function copyPrompt() {
  let copied = false;
  try { await navigator.clipboard.writeText(GET_PROMPT); copied = true; } catch { /* blocked: fall back to a selection */ }
  const area = $('#getPrompt');
  if (!copied && area) { area.focus(); area.select(); area.setSelectionRange(0, area.value.length); try { copied = document.execCommand('copy'); } catch { copied = false; } }
  toast(copied ? 'Copied. Paste it into Claude Code or Codex.' : 'Select the prompt and copy it.');
  const button = $('#getCopy');
  if (copied && button) { button.textContent = 'Copied ✓'; clearTimeout(button.reset); button.reset = setTimeout(() => { button.textContent = 'Copy prompt'; }, 2200); }
}
async function shareDemo() {
  if (navigator.share) {
    try { await navigator.share({ title: 'Pelago', text: DEMO_SHARE, url: DEMO_URL }); return; } catch (error) { if (error?.name === 'AbortError') return; }
  }
  window.open(`https://x.com/intent/post?text=${encodeURIComponent(`${DEMO_SHARE} ${DEMO_URL}`)}`, '_blank', 'noopener');
}
function markTeam() {
  // A team world: several people's exports merged, shared islands built together.
  document.title = `${TEAM.name} · Pelago`;
  setText('.brand-edition', DATA.demo ? 'SAMPLE TEAM' : 'TEAM ATLAS');
  setText('#welcome .overline', `${TEAM.name.toUpperCase()} · ${plural(TEAM.members.length, 'BUILDER')}`);
  const title = $('#welcomeTitle');
  if (title) title.innerHTML = 'Everything we built with AI became a <em>place.</em>';
  setText('#personaChip span', 'Together you are');
  const play = $('.welcome .primary-action');
  if (play) play.innerHTML = `<span aria-hidden="true">▶</span> ${DATA.demo ? 'Watch' : 'Play'} the team story`;
  const builders = element('div', 'sheet-builders'); builders.id = 'sheetBuilders';
  $('#selectedFacts')?.after(builders);
  const filters = $('.agent-filters');
  if (!filters) return;
  filters.innerHTML = '';
  filters.setAttribute('aria-label', 'Filter islands by builder');
  const all = element('button', 'agent-filter active', 'All'); all.dataset.filter = 'all'; filters.append(all);
  TEAM.members.forEach((member) => {
    const button = element('button', 'agent-filter'); button.dataset.filter = `builder:${member.name}`;
    const dot = element('i', 'agent-dot'); dot.style.background = member.color;
    button.append(dot, document.createTextNode(member.name)); filters.append(button);
  });
}
// The card's second line: its kind, or its crew when names are hidden (the first line already shows the kind).
function islandMeta(project) { return state.hideNames ? crewLabel(project) : kindOf(project); }
function buildInterface() {
  $('#personaTitle').textContent = PERSONA.title;
  document.title = `${PERSONA.title} · My Pelago`;
  if (DATA.demo) markDemo();
  if (TEAM) markTeam();
  $$('.legend-sprite').forEach((node) => { if (!node.firstChild) node.append(relicIcon(node.dataset.sprite, 2)); });
  const sessions = PROJECTS.reduce((sum, project) => sum + project.sessions, 0);
  updateSummary();
  $('#indexCount').textContent = String(PROJECTS.length).padStart(2, '0');
  buildGuide();
  const track = $('#indexTrack');
  PROJECTS.forEach((project) => {
    const button = document.createElement('button');
    button.className = 'island-card'; button.dataset.project = project.id; button.dataset.agents = Object.keys(crewsOf(project)).join(' ');
    const canvas = document.createElement('canvas'); canvas.className = 'card-island'; canvas.setAttribute('aria-hidden', 'true');
    const copy = document.createElement('span');
    const name = document.createElement('strong'); name.className = 'island-name'; name.textContent = nameOf(project) || kindOf(project);
    const meta = document.createElement('small'); meta.className = 'island-meta';
    const crew = element('span', 'crew-dots'); crew.setAttribute('role', 'img'); crew.setAttribute('aria-label', crewLabel(project)); crew.title = crewLabel(project);
    Object.entries(crewsOf(project)).filter(([, share]) => share >= .1).forEach(([agent]) => crew.append(element('i', `agent-dot ${agent === 'claude' ? 'claude' : 'codex'}`)));
    meta.append(crew, element('span', 'meta-text', islandMeta(project)));
    copy.append(name, meta); button.append(canvas, copy); button.addEventListener('click', () => focusProject(project));
    track.appendChild(button); renderThumbnail(canvas, project);
  });
}

// Pointers: one finger or the mouse pans, two fingers pinch-zoom around their midpoint, a tap opens what it lands on.
// On touch a single tap waits a moment so a double tap can zoom instead.
const pointers = new Map();
const coarsePointer = matchMedia('(pointer: coarse)');
const gesture = { pinch: null, multi: false, double: false, lastTap: null, tapTimer: 0 };
function startPinch() {
  const [a, b] = [...pointers.values()];
  gesture.pinch = { distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, scale: state.scale, panX: state.panX, panY: state.panY };
}
function movePinch() {
  const [a, b] = [...pointers.values()], start = gesture.pinch;
  const scale = clamp(start.scale * Math.hypot(b.x - a.x, b.y - a.y) / start.distance, .45, 12);
  state.panX = (a.x + b.x) / 2 - (start.x - start.panX) * scale / start.scale;
  state.panY = (a.y + b.y) / 2 - (start.y - start.panY) * scale / start.scale;
  state.scale = scale;
}
function tapAt(point, clientX, clientY) {
  const relicHit = hitRelic(point);
  if (relicHit) { showRelicCard(relicHit, clientX, clientY); return; }
  hideRelicCard();
  const found = hitIsland(point); if (found) focusProject(found.project);
}
world.addEventListener('pointerdown', (event) => {
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  const point = worldPoint(event);
  pointers.set(event.pointerId, point);
  try { world.setPointerCapture(event.pointerId); } catch { /* the pointer is already gone */ }
  viewAnimation += 1; world.style.cursor = '';
  if (pointers.size === 1) {
    state.dragging = true; state.moved = false; gesture.multi = false;
    state.startX = state.pointerX = point.x; state.startY = state.pointerY = point.y;
    const last = gesture.lastTap;
    gesture.double = Boolean(last && event.timeStamp - last.time < 300 && Math.hypot(event.clientX - last.x, event.clientY - last.y) < 24);
    if (gesture.double) clearTimeout(gesture.tapTimer);
    return;
  }
  // A second finger turns the drag into a pinch; a pinch never counts as a tap.
  state.moved = true; gesture.multi = true; gesture.double = false; clearTimeout(gesture.tapTimer);
  $('#hoverLabel').classList.remove('visible');
  startPinch();
});
world.addEventListener('pointermove', (event) => {
  const point = worldPoint(event);
  if (pointers.has(event.pointerId)) {
    pointers.set(event.pointerId, point);
    if (pointers.size > 1) { movePinch(); requestDraw(); return; }
    if (Math.abs(point.x - state.startX) + Math.abs(point.y - state.startY) > (event.pointerType === 'mouse' ? 5 : 10 * worldRatio())) state.moved = true;
    state.panX += point.x - state.pointerX; state.panY += point.y - state.pointerY; state.pointerX = point.x; state.pointerY = point.y;
    requestDraw(); return;
  }
  if (event.pointerType === 'touch') return;
  const relicHit = hitRelic(point);
  const label = $('#hoverLabel');
  const bounds = world.getBoundingClientRect();
  if (relicHit) {
    world.style.cursor = 'pointer';
    label.innerHTML = '';
    const small = document.createElement('small'); small.textContent = `${RARITY[relicHit.relic.rarity].label} relic · click to see why`;
    label.append(document.createTextNode(relicHit.relic.name), small); label.classList.add('visible');
    label.style.left = `${event.clientX - bounds.left}px`; label.style.top = `${event.clientY - bounds.top}px`;
    return;
  }
  const found = hitIsland(point);
  world.style.cursor = found ? 'pointer' : '';
  const next = found?.project.id || null;
  if (next !== state.hovered) { state.hovered = next; requestDraw(); }
  if (found) {
    label.innerHTML = '';
    const title = document.createTextNode(nameOf(found.project) || kindOf(found.project));
    const recipe = islandRecipe(found.project);
    const small = document.createElement('small'); small.textContent = `${plural(recipe.buildings.count, 'building')} · ${plural(recipe.trees.count, 'tree')} · ${plural(recipe.waterfalls, 'waterfall')} — ${recencyText(found.project)}`;
    label.append(title, small); label.classList.add('visible');
    label.style.left = `${event.clientX - bounds.left}px`; label.style.top = `${event.clientY - bounds.top}px`;
  } else label.classList.remove('visible');
});
world.addEventListener('pointerleave', () => { if (!state.dragging) { state.hovered = null; $('#hoverLabel').classList.remove('visible'); requestDraw(); } });
function endPointer(event) {
  if (!pointers.has(event.pointerId)) return;
  const point = worldPoint(event);
  pointers.delete(event.pointerId);
  if (pointers.size > 1) { startPinch(); return; }
  if (pointers.size === 1) { const [rest] = pointers.values(); state.pointerX = rest.x; state.pointerY = rest.y; return; }
  state.dragging = false;
  const double = gesture.double;
  gesture.double = false;
  // A cancelled pointer (the browser took the gesture) only ends the drag.
  if (event.type === 'pointercancel' || state.moved || gesture.multi) return;
  if (!(event.pointerType === 'touch' || coarsePointer.matches)) { tapAt(point, event.clientX, event.clientY); return; }
  if (double) {
    gesture.lastTap = null;
    if (state.scale >= 11.99) animateView(0, 0, 1); else zoomTo(state.scale * 2, point);
    return;
  }
  const { clientX, clientY } = event;
  gesture.lastTap = { time: event.timeStamp, x: clientX, y: clientY };
  clearTimeout(gesture.tapTimer);
  gesture.tapTimer = setTimeout(() => tapAt(point, clientX, clientY), 220);
}
world.addEventListener('pointerup', endPointer);
world.addEventListener('pointercancel', endPointer);
world.addEventListener('wheel', (event) => {
  event.preventDefault();
  const point = worldPoint(event);
  zoomTo(state.scale * Math.exp(-event.deltaY * .0016), point, false);
}, { passive: false });

function openShare(selected = null) {
  state.exportSelected = selected;
  $('#cardTitle').value = selected ? nameOf(selected) || kindOf(selected) : PERSONA.title;
  renderExport(); $('#shareDialog').showModal();
}
function renderExport() { renderCard($('#exportCanvas')); }

function toast(message) { const node = $('#toast'); const host = $('#getYours')?.open ? $('#getYours') : document.body; if (node.parentNode !== host) host.append(node); node.textContent = message; node.classList.add('show'); clearTimeout(node.timeout); node.timeout = setTimeout(() => node.classList.remove('show'), 2300); }

$('#enterWorld').addEventListener('click', enterWorld);
$('#openGuide').addEventListener('click', showGuide);
$('#guideButton').addEventListener('click', showGuide);
$('#closeGuide').addEventListener('click', hideGuide);
$('#closeSheet').addEventListener('click', closeSheet);
$('#zoomIn').addEventListener('click', () => zoomStep(1));
$('#zoomOut').addEventListener('click', () => zoomStep(-1));
$('#resetView').addEventListener('click', resetView);
function setHideNames(hide) {
  state.hideNames = hide;
  state.showNames = !hide;
  try { localStorage.setItem('pelago-hide-names', hide ? '1' : '0'); } catch { /* storage blocked */ }
  const button = $('#toggleNames');
  button.setAttribute('aria-pressed', String(hide));
  button.setAttribute('aria-label', hide ? 'Show project names' : 'Hide project names');
  button.title = hide ? 'Show project names' : 'Hide project names';
  $('#includeNames').checked = !hide;
  $$('.island-card').forEach((card) => { const project = PROJECTS.find((item) => item.id === card.dataset.project); card.querySelector('.island-name').textContent = nameOf(project) || kindOf(project); card.querySelector('.meta-text').textContent = islandMeta(project); });
  const open = PROJECTS.find((project) => project.id === state.selected);
  if (open) fillSheet(open);
  buildGuide();
  hideRelicCard();
  drawWorld();
  toast(hide ? 'Project names hidden everywhere.' : 'Project names are back.');
}
$('#toggleNames').addEventListener('click', () => setHideNames(!state.hideNames));
if (state.hideNames) {
  $('#toggleNames').setAttribute('aria-pressed', 'true');
  $('#toggleNames').setAttribute('aria-label', 'Show project names');
  $('#toggleNames').title = 'Show project names';
  $('#includeNames').checked = false;
}
$('#shareButton').addEventListener('click', () => openShare());
if (!navigator.canShare) $('#nativeShare').hidden = true;
$('#shareSelected').addEventListener('click', () => openShare(PROJECTS.find((project) => project.id === state.selected) || null));
$('.agent-filters').addEventListener('click', (event) => {
  const button = event.target.closest('.agent-filter');
  if (!button) return;
  $$('.agent-filter').forEach((item) => item.classList.remove('active')); button.classList.add('active'); state.filter = button.dataset.filter;
  const shown = new Set(visibleProjects().map((project) => project.id));
  $$('.island-card').forEach((card) => { card.hidden = !shown.has(card.dataset.project); });
  refreshThumbnails();
  $('#indexCount').textContent = String(visibleProjects().length).padStart(2, '0');
  updateSummary();
  hideRelicCard();
  // Re-form the archipelago around what is shown, then ease back to the full view.
  state.selected = null; state.hovered = null; $('#islandSheet').classList.remove('open'); updateCardSelection();
  state.panX = 0; state.panY = 0; state.scale = 1;
  drawWorld();
});
$$('.format-option').forEach((button) => button.addEventListener('click', () => {
  $$('.format-option').forEach((item) => item.classList.remove('active')); button.classList.add('active'); state.format = button.dataset.format; renderExport();
}));
$('[data-close-dialog]').addEventListener('click', () => $('#shareDialog').close());
$('#relicPopClose').addEventListener('click', hideRelicCard);
// Escape closes the topmost layer only: a relic card, then the island sheet, then the field guide. The story and the export dialog handle their own.
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || !$('#story').hidden || $('#shareDialog').open || $('#getYours')?.open) return;
  if (!$('#relicPop').hidden) hideRelicCard();
  else if ($('#islandSheet').classList.contains('open')) closeSheet();
  else if ($('#mapKey').classList.contains('open')) hideGuide();
});
$('#cardTitle').addEventListener('input', renderExport);
$('#includeNames').addEventListener('change', (event) => { state.showNames = event.target.checked; renderExport(); });
$('#downloadCard').addEventListener('click', downloadCard);
$('#downloadVideo').addEventListener('click', downloadVideo);
$('#copyCard').addEventListener('click', copyCard);
$('#postCard').addEventListener('click', postToX);
$('#nativeShare').addEventListener('click', nativeShare);
window.addEventListener('resize', () => { resizeWorld(); fitSummary(); refreshThumbnails(); drawDetail(PROJECTS.find((project) => project.id === state.selected)); if (!$('#story').hidden) { sizeStoryScene(); const build = story.slides[story.index]; if (build?.camera) setStoryCamera(build.camera); } });

/* ---------- Story: a Wrapped-style recap that ends on the share card ---------- */
const STORY_SECONDS = 5.6;
const story = { index: 0, timer: null, started: 0, paused: false, slides: [] };

function capital() { return [...PROJECTS].sort((a, b) => b.activity - a.activity)[0]; }
function capitalShare() {
  // Activity first; worlds without it fall back to sessions, then to an even split.
  for (const key of ['activity', 'sessions']) {
    const total = PROJECTS.reduce((sum, project) => sum + (project[key] || 0), 0);
    if (total > 0) return Math.max(1, Math.round((capital()?.[key] || 0) / total * 100));
  }
  return Math.round(100 / Math.max(1, PROJECTS.length));
}
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
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
  const at = (camera, build) => Object.assign(build, { camera });
  const shares = agentShares();
  const days = RHYTHM.activeDays || 0;
  const slides = [];

  slides.push(at({ mode: 'wide', zoom: 1.08, shade: .2 }, () => {
    const slide = element('div', 'slide slide-intro');
    slide.append(element('p', 'story-over', EDITION?.label || (TEAM ? `${TEAM.name.toUpperCase()}'S AI CODING HISTORY` : DATA.demo ? "A SAMPLE BUILDER'S AI CODING HISTORY" : 'YOUR AI CODING HISTORY')));
    const big = element('p', 'story-mega'); slide.append(big); countUp(big, TOTAL_SESSIONS);
    slide.append(element('h2', 'story-title', DATA.demo && !TEAM ? 'sessions with their agents.' : 'sessions with your agents.'));
    slide.append(element('p', 'story-copy', days ? `Across ${plural(days, 'day')} at sea${sinceLabel() ? ` since ${sinceLabel()}` : ''}, they quietly raised ${plural(PROJECTS.length, 'island')}.` : `Together they raised ${plural(PROJECTS.length, 'island')}.`));
    return slide;
  }));

  if (TEAM) slides.push(at({ mode: 'wide', zoom: 1.02, shade: .55 }, () => {
    const slide = element('div', 'slide slide-team');
    slide.append(element('p', 'story-over', 'THE CREW'));
    const shared = PROJECTS.filter((project) => Object.keys(project.builders || {}).length > 1).length;
    slide.append(element('h2', 'story-title', `${TEAM.members.length} builders. ${shared ? `${plural(shared, 'island')} built together.` : 'One archipelago.'}`));
    const most = Math.max(1, ...TEAM.members.map((member) => member.activity));
    const list = element('div', 'team-list');
    TEAM.members.slice(0, 8).forEach((member) => {
      const row = element('div', 'team-row');
      row.style.setProperty('--share', `${Math.max(4, Math.round(member.activity / most * 100))}%`);
      row.style.setProperty('--builder', member.color);
      const name = element('strong', '', member.name);
      row.append(name, element('em', '', member.title || ''), element('span', 'team-bar'),
        element('small', '', `${plural(member.islands, 'island')}${member.shared ? `, ${member.shared} shared` : ''} · ${compact(member.sessions)} sessions${member.tokens ? ` · ${compact(member.tokens)} tokens` : ''}`));
      list.append(row);
    });
    slide.append(list);
    return slide;
  }));

  if (top) slides.push(at({ mode: 'island', project: top, shade: .15 }, () => {
    const slide = element('div', 'slide slide-capital');
    slide.append(element('p', 'story-over', 'YOUR CAPITAL'));
    slide.append(element('h2', 'story-title', nameOf(top) || kindOf(top)));
    slide.append(element('p', 'story-copy', `${capitalShare()}% of everything you built lives here: ${islandLine(top).charAt(0).toLowerCase()}${islandLine(top).slice(1)}`));
    return slide;
  }));

  if (TOTAL_TOKENS) slides.push(at({ mode: 'island', project: [...PROJECTS].sort((a, b) => totalTokens(b) - totalTokens(a))[0], low: true, shade: .25 }, () => {
    const slide = element('div', 'slide slide-tokens');
    slide.append(element('p', 'story-over', 'WHAT FLOWED THROUGH'));
    const big = element('p', 'story-mega'); big.textContent = compact(TOTAL_TOKENS); slide.append(big);
    slide.append(element('h2', 'story-title', 'tokens.'));
    if (sinceLabel()) slide.append(element('p', 'story-note', `Counted from the transcripts on this computer since ${sinceLabel()}.`));
    const cached = PROJECTS.reduce((sum, project) => sum + (project.tokens?.cached || 0), 0);
    const fresh = TOTAL_TOKENS - cached;
    slide.append(element('p', 'story-copy', `That's ${tokenComparison(TOTAL_TOKENS)}. ${cached > TOTAL_TOKENS * .5 ? `${Math.round(cached / TOTAL_TOKENS * 100)}% were your agents re-reading context they already had; ${compact(fresh)} were brand new.` : ''}`));
    if (TOTAL_PROMPTS) slide.append(element('p', 'story-copy', `You typed ${TOTAL_PROMPTS.toLocaleString('en-US')} requests. Each one planted part of a forest.`));
    return slide;
  }));

  if ((RHYTHM.hours || []).some(Boolean)) slides.push(at({ mode: 'wide', zoom: .92, shade: .62 }, () => {
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
  }));

  if (RHYTHM.longestStreak) slides.push(at({ mode: 'wide', zoom: 1.25, shade: .55 }, () => {
    const slide = element('div', 'slide slide-streak');
    slide.append(element('p', 'story-over', 'LONGEST VOYAGE'));
    const big = element('p', 'story-mega'); slide.append(big); countUp(big, RHYTHM.longestStreak);
    slide.append(element('h2', 'story-title', 'days in a row.'));
    const busy = RHYTHM.busiestDay ? new Date(`${RHYTHM.busiestDay}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) : null;
    const calendar = streakCalendar();
    if (calendar) slide.append(calendar);
    slide.append(element('p', 'story-copy', `${plural(RHYTHM.activeDays || 0, 'day')} at sea in all.${busy ? ` Your biggest was ${busy}.` : ''}`));
    return slide;
  }));

  if (PROJECTS.some((project) => hasCrew(project, 'codex')) && PROJECTS.some((project) => hasCrew(project, 'claude'))) slides.push(at({ mode: 'wide', zoom: 1, shade: .5 }, () => {
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
  }));

  const relicsFound = earnedRelics();
  if (relicsFound.size) slides.push(at({ mode: 'island', project: relicsFound.get(RELICS.filter((relic) => relicsFound.has(relic.id)).sort((a, b) => RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity])[0].id)[0], shade: .55 }, () => {
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
    slide.append(element('p', 'story-copy', `Rarest: ${rarest.name}, ${rarest.rarity === 'epic' ? 'an' : 'a'} ${RARITY[rarest.rarity].label.toLowerCase()} relic on ${calledOf(relicsFound.get(rarest.id)[0])}.`));
    const next = nextRelics(1)[0];
    if (next) slide.append(element('p', 'story-next', `Next up: ${next.relic.name}, ${progressText(next)}.`));
    return slide;
  }));

  slides.push(at({ mode: 'wide', zoom: .95, shade: .25, reveal: true }, () => {
    const slide = element('div', 'slide slide-persona');
    slide.append(element('p', 'story-over', TEAM ? 'TOGETHER, YOU ARE' : DATA.demo ? 'THIS BUILDER IS' : 'WHICH MAKES YOU'));
    const title = element('h2', 'story-persona');
    const { lead, accent } = personaParts();
    title.append(document.createTextNode(`${lead} `));
    if (accent) title.append(element('em', '', accent));
    slide.append(title);
    slide.append(element('p', 'story-copy', `${PERSONA.line} ${PERSONA.realmLine || ''}`.trim()));
    return slide;
  }));

  slides.push(at({ mode: 'wide', zoom: .9, shade: .85 }, () => {
    const slide = element('div', `slide slide-share${DATA.demo ? ' demo' : ''}`);
    slide.append(element('p', 'story-over', DATA.demo ? 'YOUR TURN' : 'YOUR CARD IS READY'));
    const preview = element('canvas', 'story-card');
    state.format = 'story'; state.exportSelected = null;
    renderCard(preview, 'story', null, state.showNames);
    preview.setAttribute('role', 'img'); preview.setAttribute('aria-label', `${DATA.demo ? 'Sample card' : 'Share card'}: ${PERSONA.title}`);
    slide.append(preview);
    if (DATA.demo) slide.append(element('h2', 'story-title end-title', `That was a sample. Which of ${ARCHETYPE_COUNT} builders are you?`));
    storyEndActions(slide);
    return slide;
  }));
  return slides;
}
// The last slide's buttons. A real world shares its card; the sample leads to the prompt and never posts someone else's card.
function storyEndActions(slide) {
  const actions = element('div', `story-actions${DATA.demo ? ' demo' : ''}`);
  const add = (className, label, run) => {
    const button = element('button', className, label);
    button.addEventListener('click', (event) => { event.stopPropagation(); run(); });
    actions.append(button);
  };
  const explore = () => { closeStory(); enterWorld(); };
  if (DATA.demo) {
    add('primary-action', 'Get yours in one prompt', () => openGetYours('story'));
    add('story-ghost', 'Share this demo', shareDemo);
    add('story-ghost', 'Explore the map', explore);
  } else {
    add('primary-action', 'Share my card', nativeShare);
    add('story-ghost', 'Post on X', postToX);
    add('story-ghost', 'More formats', () => { closeStory(); openShare(); });
    add('story-ghost', 'Explore the map', explore);
  }
  slide.append(actions);
  return actions;
}


// ---------- Story scene: the world behind every slide, with a camera that travels between them ----------
const storyScene = { camera: null, target: null, shade: 0, targetShade: 0, frame: 0, items: null, size: '' };
function storyLayout(width, height) {
  const key = `${width}x${height}`;
  if (storyScene.size !== key) {
    storyScene.items = makeLayout(width, height, PROJECTS, { top: height * .1, bottom: height * .44, left: width * .03, right: width * .03, maxSize: 4000, hang: .4 });
    storyScene.size = key;
  }
  return storyScene.items;
}
function storyCameraFor(spec, width, height) {
  const items = storyLayout(width, height);
  if (spec.mode === 'island' && spec.project) {
    const item = items.find((candidate) => candidate.project.id === spec.project.id);
    if (item) {
      const scale = clamp(width * .82 / (item.size * 2.5), 1, 9);
      return { x: width / 2 - item.x * scale, y: height * (spec.low ? .4 : .34) - item.y * scale, scale };
    }
  }
  const zoom = spec.zoom || 1;
  return { x: width / 2 * (1 - zoom), y: height * .3 * (1 - zoom), scale: zoom };
}
function setStoryCamera(spec) {
  const canvas = $('#storyScene');
  const width = canvas.width, height = canvas.height;
  if (!width) return;
  storyScene.target = storyCameraFor(spec, width, height);
  storyScene.targetShade = spec.shade ?? .3;
  storyScene.focus = spec.mode === 'island' ? spec.project?.id : null;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!storyScene.camera || still) storyScene.camera = { ...storyScene.target };
  if (still) storyScene.shade = storyScene.targetShade;
  if (spec.reveal && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    // The archetype reveal starts deep in the capital and pulls back over the whole archipelago.
    const capitalItem = storyLayout(width, height).find((item) => item.project.id === capital()?.id);
    if (capitalItem) storyScene.camera = { x: width / 2 - capitalItem.x * 4, y: height * .34 - capitalItem.y * 4, scale: 4 };
  }
}
function sizeStoryScene() {
  const canvas = $('#storyScene');
  const bounds = canvas.getBoundingClientRect();
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.max(1, Math.round(bounds.width * ratio)), height = Math.max(1, Math.round(bounds.height * ratio));
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; storyScene.camera = null; }
}
function drawStoryScene(now) {
  const canvas = $('#storyScene');
  const context = canvas.getContext('2d');
  const width = canvas.width, height = canvas.height;
  if (!storyScene.target) return;
  const camera = storyScene.camera;
  const ease = .055;
  camera.x += (storyScene.target.x - camera.x) * ease;
  camera.y += (storyScene.target.y - camera.y) * ease;
  camera.scale += (storyScene.target.scale - camera.scale) * ease;
  storyScene.shade += (storyScene.targetShade - storyScene.shade) * .08;
  // A slow drift keeps the shot alive while text is on screen.
  const drift = { x: camera.x + Math.sin(now / 4200) * width * .012, y: camera.y + Math.cos(now / 5100) * height * .008, scale: camera.scale };
  drawOcean(context, width, height, 73, now);
  drawCloudSea(context, width, height, now);
  const items = storyLayout(width, height);
  const pixel = (items[0]?.px || 1) * drift.scale;
  drawConnections(context, items, drift, now, pixel, 'route');
  [...items].sort((a, b) => a.y - b.y).forEach((item) => drawIsland(context, item, { transform: drift, label: false, selected: false, hovered: false, time: now }));
  drawConnections(context, items, drift, now, pixel, 'bridges');
  drawCloudSea(context, width, height, now, true);
  const focus = items.find((item) => item.project.id === storyScene.focus);
  if (focus && storyScene.shade < .4) drawIslandLabel(context, focus, { transform: drift, labelScale: Math.min(2, window.devicePixelRatio || 1) * 1.2 });
  $('#storyShade').style.opacity = storyScene.shade.toFixed(3);
}
function storyLoop(now) {
  if ($('#story').hidden) return;
  requestAnimationFrame(storyLoop);
  if (document.hidden || now - storyScene.frame < 33) return;
  storyScene.frame = now;
  drawStoryScene(now);
}

function streakCalendar() {
  const daily = RHYTHM.daily || {};
  const dates = Object.keys(daily).sort();
  if (!dates.length) return null;
  const end = new Date(`${dates[dates.length - 1]}T12:00:00`);
  const weeks = 17;
  const start = new Date(end);
  start.setDate(end.getDate() - end.getDay() - (weeks - 1) * 7);
  // The longest run of consecutive active days, found from the same daily counts.
  let best = [0, -1], run = 0, runStart = 0;
  const all = [];
  for (let day = new Date(`${dates[0]}T12:00:00`); day <= end; day.setDate(day.getDate() + 1)) all.push(day.toISOString().slice(0, 10));
  all.forEach((iso, index) => {
    if (daily[iso]) { if (!run) runStart = index; run += 1; if (run > best[1] - best[0] + 1) best = [runStart, index]; } else run = 0;
  });
  const streakDays = new Set(all.slice(best[0], best[1] + 1));
  const max = Math.max(...Object.values(daily));
  const grid = element('div', 'streak-grid');
  grid.style.setProperty('--weeks', weeks);
  for (let week = 0; week < weeks; week += 1) {
    for (let weekday = 0; weekday < 7; weekday += 1) {
      const day = new Date(start); day.setDate(start.getDate() + week * 7 + weekday);
      const iso = day.toISOString().slice(0, 10);
      const count = daily[iso] || 0;
      const cell = element('i', count ? `on${streakDays.has(iso) ? ' streak' : ''}` : '');
      if (day > end) cell.className = 'future';
      cell.style.setProperty('--level', count ? (.25 + .75 * Math.log1p(count) / Math.log1p(max)).toFixed(2) : 0);
      cell.style.setProperty('--delay', `${(week * 7 + weekday) * 6}ms`);
      cell.title = count ? `${day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}: ${count} messages` : '';
      grid.append(cell);
    }
  }
  return grid;
}

function renderStorySlide() {
  const stage = $('#storyStage');
  stage.innerHTML = '';
  const build = story.slides[story.index];
  const slide = build();
  stage.appendChild(slide);
  if (build.camera) setStoryCamera(build.camera);
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
  sizeStoryScene();
  storyScene.camera = null;
  renderStorySlide();
  requestAnimationFrame(storyLoop);
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
