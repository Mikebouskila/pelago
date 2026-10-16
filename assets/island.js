/* ---------- Procedural islands: every island is built from its own work ---------- */
// Isometric pixel art, painted pixel by pixel into a buffer with one light source (upper left),
// warm highlights, cool shadows, dithered materials and a dark silhouette outline.
const TILE_W = 16, TILE_H = 8, LEVEL = 9;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((value) => (value + .5) / 16);
const hexRgb = (hex) => { const value = parseInt(hex.slice(1), 16); return [(value >> 16) & 255, (value >> 8) & 255, value & 255]; };
const WARM = [255, 244, 214], COOL = [26, 20, 52], OUTLINE = [16, 12, 30];
function mixRgb(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function tone(color, amount) { return amount >= 0 ? mixRgb(color, WARM, amount) : mixRgb(color, COOL, -amount); }
const palette = (list) => list.map(hexRgb);

// Bedrock, seven tones from the lit strata down to the dark tip of the root, one stone per biome.
const ROCKS = {
  web: palette(['#b6a69b', '#9a8b83', '#7f716d', '#675b5a', '#514749', '#3d353a', '#2a242b']),
  other: palette(['#a3929f', '#8a7a8e', '#71637c', '#5b4f69', '#473e57', '#352e45', '#272136']),
  ai: palette(['#ab9ecb', '#9082b3', '#766999', '#5f5383', '#4a406b', '#372f54', '#27213b']),
  cli: palette(['#b7c5d2', '#9aa9b9', '#7e8ea0', '#657588', '#4e5c70', '#3a4658', '#283140']),
  data: palette(['#e6c592', '#d2a774', '#b8895c', '#996c4a', '#79523b', '#593b2c', '#3b271f']),
  mobile: palette(['#cba5ae', '#af8894', '#936e7c', '#795866', '#604551', '#47333e', '#30232c']),
  game: palette(['#908596', '#74697a', '#5c5262', '#473f4e', '#362f3c', '#27222c', '#1a161e']),
};
const MOONLIT = [150, 192, 255], GLOW_BAND = .09;
const BIOMES = {
  web: { name: 'Meadow harbor', grass: palette(['#5fae4e', '#76c25c', '#8fd46c']), dirt: palette(['#a87b51', '#8a6142']), sand: hexRgb('#ecd8a0'), roofs: palette(['#e0604c', '#d47a43', '#c24f45', '#3f86c4']), wall: hexRgb('#f2e4c4'), trees: 'oak', leaves: palette(['#2f7a3e', '#3f9447', '#5aae52', '#86cc6a']), flowers: palette(['#ffd36b', '#ff8fa3', '#ffffff', '#9fd0ff']), accent: hexRgb('#4fc4d6'), crystal: null },
  other: { name: 'Lighthouse meadow', grass: palette(['#5aa856', '#6fbd63', '#8bd27a']), dirt: palette(['#a5805a', '#876546']), sand: hexRgb('#e9d7a6'), roofs: palette(['#3a988b', '#e0784f', '#5684c6', '#c95c4c']), wall: hexRgb('#f0e5cd'), trees: 'oak', leaves: palette(['#2d6f45', '#3d8a50', '#57a75c', '#82c677']), flowers: palette(['#ffe27a', '#b9a3ff', '#ffffff', '#ff9a8a']), accent: hexRgb('#57c8c0'), crystal: null },
  ai: { name: 'Crystal observatory', grass: palette(['#3fa58f', '#52bba1', '#74d2b6']), dirt: palette(['#6f6aa0', '#565185']), sand: hexRgb('#cfe7dc'), roofs: palette(['#5654cc', '#7651c4', '#4468c4', '#8a5fd8']), wall: hexRgb('#e9e6f7'), trees: 'crystal', leaves: palette(['#6c5ad8', '#8f7cf0', '#b9a8ff', '#e6dcff']), flowers: palette(['#b48cff', '#7de7ef', '#ffffff', '#ff9ee8']), accent: hexRgb('#a586ff'), crystal: palette(['#7a5cf0', '#b08cff', '#efe4ff']) },
  cli: { name: 'Tundra workshops', grass: palette(['#86a890', '#9dbda5', '#bcd6c2']), dirt: palette(['#76808e', '#5b6472']), sand: hexRgb('#e0e8e5'), roofs: palette(['#2a8580', '#357894', '#4e5f74', '#b0533f']), wall: hexRgb('#e4eae7'), trees: 'pine', leaves: palette(['#1f4f44', '#2c6655', '#3d7f69', '#5c9c84']), flowers: palette(['#ffffff', '#cfe8ff', '#ffe08a', '#ffffff']), accent: hexRgb('#6fd0c3'), crystal: palette(['#4fb6d6', '#8fe2f2', '#e8fbff']) },
  data: { name: 'Autumn terraces', grass: palette(['#b39a3c', '#c9b04a', '#dcc560']), dirt: palette(['#9c6a43', '#7c5034']), sand: hexRgb('#efd9a0'), roofs: palette(['#4775ba', '#3a63a0', '#bf6337', '#2f8a7e']), wall: hexRgb('#f2e0bf'), trees: 'autumn', leaves: palette(['#a8441c', '#cf5f22', '#e88a2c', '#f6b94a']), flowers: palette(['#ff6b4a', '#ffd36b', '#ffffff', '#ffb46b']), accent: hexRgb('#f2c14e'), crystal: palette(['#e0a52a', '#ffd76a', '#fff4c4']) },
  mobile: { name: 'Blossom village', grass: palette(['#6cba57', '#82cc69', '#9fdf82']), dirt: palette(['#ac8061', '#8a634a']), sand: hexRgb('#f2deb0'), roofs: palette(['#ea6f8e', '#9466d2', '#e05a7f', '#4f8fd6']), wall: hexRgb('#fbeee6'), trees: 'blossom', leaves: palette(['#c9578a', '#e57fab', '#f6a9c8', '#ffd6e6']), flowers: palette(['#ffffff', '#ff8fb8', '#ffe27a', '#c9a8ff']), accent: hexRgb('#ff8fb8'), crystal: null },
  game: { name: 'Candy citadel', grass: palette(['#42b456', '#5bc96a', '#80dd80']), dirt: palette(['#b78150', '#93623c']), sand: hexRgb('#f3dda6'), roofs: palette(['#e03e48', '#3a74da', '#f0a92f', '#8f4fd0']), wall: hexRgb('#f5e8cf'), trees: 'oak', leaves: palette(['#237f43', '#30994f', '#4fb662', '#7ed37f']), flowers: palette(['#ff5d6c', '#5d9dff', '#ffd23a', '#ffffff']), accent: hexRgb('#ffd23a'), crystal: palette(['#ff5d8a', '#5dc6ff', '#ffe36b']) },
};
const BUILDING_FOR_TOOL = { build: 'workshop', shell: 'forge', read: 'library', web: 'tower', crew: 'windmill', other: 'house' };
const BUILDING_LABELS = {
  keep: 'Keep', workshop: 'Workshop', forge: 'Forge', library: 'Library', tower: 'Signal tower', windmill: 'Windmill', house: 'Cottage',
};
const islandCache = new Map();

function hash2(seed, x, y) {
  let value = (seed ^ Math.imul(x + 374761393, 668265263) ^ Math.imul(y + 1442695041, 2246822519)) >>> 0;
  value = Math.imul(value ^ (value >>> 15), 2246822519) >>> 0;
  value = Math.imul(value ^ (value >>> 13), 3266489917) >>> 0;
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}
function valueNoise(seed, x, y) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash2(seed, x0, y0), b = hash2(seed, x0 + 1, y0), c = hash2(seed, x0, y0 + 1), d = hash2(seed, x0 + 1, y0 + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
function totalTokens(project) { return project.tokens?.total || 0; }
function workScale(project) {
  // Tokens are the island's mass. Older exports without tokens fall back to message volume.
  const tokens = totalTokens(project);
  return tokens > 0 ? Math.log10(tokens) : Math.log10(Math.max(10, (project.messages || 1) * 4000));
}
function gridSize(project) { return Math.round(clamp(6 + (workScale(project) - 4) * 2.7, 7, 26)); }
function waterfallCount(project) { return clamp(Math.floor(workScale(project)) - 5, 0, 4); }
function sessionSizesOf(project) {
  const sizes = project.sessionSizes?.length ? project.sessionSizes : Array.from({ length: Math.min(64, project.sessions || 1) }, (_, index) => Math.max(1, Math.round((project.messages || 10) / (project.sessions || 1) * (1.6 - index * .02))));
  return sizes.slice(0, 64);
}
function buildingPlan(project) {
  const sizes = sessionSizesOf(project);
  const perBuilding = Math.max(1, Math.ceil((project.sessions || sizes.length) / 48));
  const count = Math.max(1, Math.min(48, Math.ceil((project.sessions || sizes.length) / perBuilding)));
  const tools = project.tools || {};
  const total = Object.values(tools).reduce((sum, value) => sum + value, 0);
  const bag = [];
  if (total) {
    const quotas = Object.entries(tools).map(([group, value]) => ({ group, exact: value / total * (count - 1) }));
    quotas.forEach((quota) => { quota.whole = Math.floor(quota.exact); });
    let left = count - 1 - quotas.reduce((sum, quota) => sum + quota.whole, 0);
    [...quotas].sort((a, b) => (b.exact - b.whole) - (a.exact - a.whole)).forEach((quota) => { if (left > 0) { quota.whole += 1; left -= 1; } });
    quotas.forEach((quota) => { for (let index = 0; index < quota.whole; index += 1) bag.push(BUILDING_FOR_TOOL[quota.group] || 'house'); });
  }
  while (bag.length < count - 1) bag.push('house');
  const random = seeded(project.seed ^ 0x9e3779b9);
  for (let index = bag.length - 1; index > 0; index -= 1) { const swap = Math.floor(random() * (index + 1)); [bag[index], bag[swap]] = [bag[swap], bag[index]]; }
  const levels = Array.from({ length: count }, (_, index) => {
    const size = sizes[Math.min(sizes.length - 1, Math.floor(index * sizes.length / count))] || 1;
    return clamp(Math.round(Math.log10(size + 1) * 1.5), 1, 6);
  });
  return { count, perBuilding, types: ['keep', ...bag], levels };
}
function treePlan(project) {
  const prompts = project.prompts ?? Math.round((project.messages || 0) / 6);
  const perTree = Math.max(1, Math.ceil(prompts / 90));
  return { count: clamp(Math.ceil(prompts / perTree), 2, 90), perTree, prompts };
}
function islandRecipe(project) {
  const biome = BIOMES[project.category] || BIOMES.other;
  const buildings = buildingPlan(project);
  const trees = treePlan(project);
  const days = daysSince(project.lastActive), known = days !== null;
  return {
    biome, buildings, trees, days,
    grid: gridSize(project),
    waterfalls: waterfallCount(project),
    decor: clamp(Math.round((project.messages || 0) / 60), 4, 70),
    lanterns: clamp(Math.round(Math.log2(Math.max(1, (project.tokens?.output || project.messages * 120) / 4000))), 0, 24),
    lit: clamp(.3 + Math.log10(Math.max(1, project.tokens?.output || project.messages * 120)) / 9, .3, .95) * (!known ? .6 : days < 30 ? 1 : days < 120 ? .6 : .25),
    snow: known && days > 60,
    smoke: known && days < 14,
    beacon: known && days < 21,
  };
}

function createSurface(width, height) {
  const data = new Uint8ClampedArray(width * height * 4);
  // Depth of whatever last painted each pixel (painter order), so animations can hide behind it.
  const depth = new Uint16Array(width * height);
  const surface = { z: 0 };
  const put = (x, y, color, alpha = 1) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const index = (y * width + x) * 4;
    if (alpha >= .6) depth[y * width + x] = surface.z;
    if (alpha >= 1) {
      data[index] = color[0]; data[index + 1] = color[1]; data[index + 2] = color[2]; data[index + 3] = 255;
      return;
    }
    const existing = data[index + 3] / 255;
    const out = alpha + existing * (1 - alpha);
    if (out <= 0) return;
    for (let channel = 0; channel < 3; channel += 1) data[index + channel] = (color[channel] * alpha + data[index + channel] * existing * (1 - alpha)) / out;
    data[index + 3] = out * 255;
  };
  const shadow = (x, y, strength) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const index = (y * width + x) * 4;
    if (!data[index + 3]) return;
    for (let channel = 0; channel < 3; channel += 1) data[index + channel] += (COOL[channel] - data[index + channel]) * strength;
  };
  const alphaAt = (x, y) => (x < 0 || y < 0 || x >= width || y >= height ? 0 : data[(y * width + x) * 4 + 3]);
  return Object.assign(surface, { width, height, data, depth, put, shadow, alphaAt });
}

function renderIslandArt(project) {
  const recipe = islandRecipe(project);
  const { biome, grid: size } = recipe;
  const seed = project.seed >>> 0;
  const agentColor = hexRgb(project.agent === 'claude' ? '#e0784a' : '#3fae94');

  // 1. Shape: a lobed, noisy coastline and terraced hills, all seeded from the project.
  const lobes = 2 + Math.floor(hash2(seed, 7, 7) * 4);
  const twist = hash2(seed, 3, 9) * Math.PI * 2;
  const maxHeight = clamp(2 + Math.round(Math.log10((project.prompts || 10) + 1) * 1.3), 2, 6);
  const height = [], land = [];
  for (let i = 0; i < size; i += 1) {
    height.push([]); land.push([]);
    for (let j = 0; j < size; j += 1) {
      const dx = (i + .5) / size * 2 - 1, dy = (j + .5) / size * 2 - 1;
      const angle = Math.atan2(dy, dx);
      const radius = .8 + Math.sin(angle * lobes + twist) * .11 + (valueNoise(seed, i / 3.2, j / 3.2) - .5) * .32;
      const distance = Math.hypot(dx, dy) / radius;
      const hill = (1 - distance) * 1.25 + (valueNoise(seed + 11, i / 4.5, j / 4.5) - .5) * .7;
      land[i].push(distance < 1);
      height[i].push(distance < 1 ? clamp(1 + Math.floor(Math.max(0, hill) * maxHeight * .95), 1, maxHeight) : 0);
    }
  }
  const isLand = (i, j) => i >= 0 && j >= 0 && i < size && j < size && land[i][j];
  const levelAt = (i, j) => (isLand(i, j) ? height[i][j] : -99);
  const coastDistance = height.map((row, i) => row.map((_, j) => {
    let distance = 0;
    if (land[i][j]) while (distance < 9 && [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([a, b]) => isLand(i + a * (distance + 1), j + b * (distance + 1)))) distance += 1;
    return distance;
  }));
  // Under the earth every column keeps a short slab of rock; the root below it is painted as one mass.
  const undersideDepth = coastDistance.map((row, i) => row.map((_, j) => Math.round((1.3 + hash2(seed, i, j * 3) * .8) * LEVEL)));
  let landLeft = 0, landRight = 0;
  for (let i = 0; i < size; i += 1) for (let j = 0; j < size; j += 1) if (land[i][j]) { landLeft = Math.min(landLeft, (i - j) * TILE_W); landRight = Math.max(landRight, (i - j) * TILE_W); }
  // The root: an inverted mountain 0.6-1x the island's width, a main peak and a few lesser crags, all tapering to tips.
  const rocks = ROCKS[project.category] || ROCKS.other;
  const span = landRight - landLeft + TILE_W * 2, rootHalf = span / 2, rootMid = (landLeft + landRight) / 2;
  const rootDepth = Math.round(span * (.98 - .38 * clamp((size - 7) / 19, 0, 1)) * (.9 + hash2(seed, 2, 71) * .2));
  // A long spike first (it holds the tip), a broad belly under the whole island, then a few lesser crags.
  const cones = [
    { x: rootMid + (hash2(seed, 1, 72) - .5) * span * .16, w: rootHalf * (.5 + hash2(seed, 2, 72) * .14), h: rootDepth, p: 1.45 },
    { x: rootMid, w: rootHalf * 1.02, h: rootDepth * .4, p: .8 },
  ];
  for (let k = 0; k < 2 + Math.floor(hash2(seed, 3, 73) * 2); k += 1) {
    cones.push({ x: rootMid + (k % 2 ? 1 : -1) * rootHalf * (.3 + hash2(seed, k, 74) * .38), w: rootHalf * (.16 + hash2(seed, k, 75) * .16), h: rootDepth * (.4 + hash2(seed, k, 76) * .24), p: 1.25 });
  }
  // Per pixel column (offset k from the left edge): the bottom of the frontmost earth, its slab, the root's drop and which crag owns it.
  const frontGround = new Array(span).fill(-1e9), frontSlab = new Array(span).fill(0), drops = new Array(span), owner = new Array(span);
  for (let i = 0; i < size; i += 1) for (let j = 0; j < size; j += 1) {
    if (!land[i][j]) continue;
    for (let x = 0; x < TILE_W * 2; x += 1) {
      const k = (i - j) * TILE_W - landLeft + x;
      const ground = (i + j) * TILE_H + (x < TILE_W ? TILE_H + Math.floor(x / 2) : TILE_H * 2 - 1 - Math.floor((x - TILE_W) / 2));
      if (ground > frontGround[k]) { frontGround[k] = ground; frontSlab[k] = undersideDepth[i][j]; }
    }
  }
  for (let k = 0; k < span; k += 1) {
    if (frontGround[k] < -1e8) { frontGround[k] = frontGround[k - 1] ?? 0; frontSlab[k] = frontSlab[k - 1] ?? LEVEL; }
    const x = landLeft - TILE_W + k;
    let drop = 0, best = cones[0];
    cones.forEach((cone) => { const t = Math.abs(x - cone.x) / cone.w; const d = t < 1 ? cone.h * Math.pow(1 - t, cone.p) : 0; if (d > drop) { drop = d; best = cone; } });
    const crag = (valueNoise(seed + 31, x / 7, 0) - .5) * 8 + (hash2(seed, Math.floor(x / 3), 77) > .72 ? hash2(seed, Math.floor(x / 3), 78) * 10 : 0);
    drops[k] = Math.round(Math.max(frontSlab[k] + 3, drop * (.88 + valueNoise(seed + 33, x / 15, 0) * .24) + crag * Math.min(1, drop / 30)));
    owner[k] = best;
  }
  let rootReach = 0;
  for (let k = 0; k < span; k += 1) rootReach = Math.max(rootReach, frontGround[k] + drops[k]);

  // 2. Rivers: tokens flow downhill and leave the island as waterfalls on the visible side.
  const water = height.map((row) => row.map(() => false));
  const falls = [];
  const peaks = [];
  for (let i = 0; i < size; i += 1) for (let j = 0; j < size; j += 1) if (land[i][j] && coastDistance[i][j] >= 2) peaks.push([i, j]);
  peaks.sort((a, b) => height[b[0]][b[1]] - height[a[0]][a[1]] || hash2(seed, a[0], a[1]) - hash2(seed, b[0], b[1]));
  for (let river = 0; river < recipe.waterfalls && peaks.length; river += 1) {
    let [i, j] = peaks[Math.floor(hash2(seed, river, 41) * Math.min(peaks.length, 6 + river * 4))];
    for (let step = 0; step < size * 2; step += 1) {
      water[i][j] = true;
      const front = [[1, 0], [0, 1]].filter(([a, b]) => !isLand(i + a, j + b));
      if (front.length) { falls.push({ i, j, side: front[0][0] ? 'right' : 'left' }); break; }
      const options = [[1, 0], [0, 1], [1, 0], [0, 1], [-1, 0], [0, -1]]
        .map(([a, b]) => [i + a, j + b])
        .filter(([a, b]) => isLand(a, b) && !water[a][b] && height[a][b] <= height[i][j]);
      if (!options.length) break;
      options.sort((a, b) => height[a[0]][a[1]] - height[b[0]][b[1]] || (b[0] + b[1]) - (a[0] + a[1]) || hash2(seed, a[0] * 31, a[1]) - .5);
      [i, j] = hash2(seed, i * 7 + step, j) < .78 ? options[0] : options[Math.min(1, options.length - 1)];
    }
  }

  // 3. Settlement: one building per session, the keep on central ground, streets to the nearest neighbour.
  const objects = height.map((row) => row.map(() => []));
  const free = [];
  for (let i = 0; i < size; i += 1) for (let j = 0; j < size; j += 1) if (land[i][j] && !water[i][j] && coastDistance[i][j] >= 1) free.push([i, j]);
  const centre = (size - 1) / 2;
  free.sort((a, b) => Math.hypot(a[0] - centre, a[1] - centre) - Math.hypot(b[0] - centre, b[1] - centre));
  const keepSpot = free[0] || [Math.floor(centre), Math.floor(centre)];
  const spread = free.slice(1).sort((a, b) => {
    const score = ([i, j]) => Math.hypot(i - centre, j - centre) / size * 1.4 + hash2(seed, i, j) * 1.6;
    return score(a) - score(b);
  });
  const taken = new Set();
  const placed = [];
  const key = (i, j) => `${i},${j}`;
  const blocked = (i, j) => [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => taken.has(key(i + a, j + b)));
  recipe.buildings.types.forEach((type, index) => {
    const spot = index === 0 ? keepSpot : spread.find(([i, j]) => !blocked(i, j)) || spread.find(([i, j]) => !taken.has(key(i, j)));
    if (!spot || !isLand(spot[0], spot[1])) return;
    taken.add(key(spot[0], spot[1]));
    if (index === 0) [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].forEach(([a, b]) => taken.add(key(spot[0] + a, spot[1] + b)));
    objects[spot[0]][spot[1]].push({ kind: 'building', type, level: index === 0 ? Math.max(4, recipe.buildings.levels[0] + 1) : recipe.buildings.levels[index] || 1, index });
    placed.push(spot);
  });
  const street = height.map((row) => row.map(() => false));
  const bridge = height.map((row) => row.map(() => false));
  placed.slice(1).forEach(([i, j], index) => {
    let [x, y] = [i, j];
    const [tx, ty] = placed.slice(0, index + 1).reduce((best, spot) => (Math.hypot(spot[0] - i, spot[1] - j) < Math.hypot(best[0] - i, best[1] - j) ? spot : best), keepSpot);
    for (let step = 0; step < size * 2 && (x !== tx || y !== ty); step += 1) {
      const horizontal = x !== tx && (y === ty || hash2(seed, x + index, y) < .5);
      if (horizontal) x += Math.sign(tx - x); else y += Math.sign(ty - y);
      if (!isLand(x, y) || taken.has(key(x, y))) continue;
      if (water[x][y]) bridge[x][y] = true; else street[x][y] = true;
    }
  });
  // A town square with a fountain in front of the landmark.
  const plaza = height.map((row) => row.map(() => false));
  const [plazaI, plazaJ] = [keepSpot[0] + 1, keepSpot[1] + 1];
  if (isLand(plazaI, plazaJ) && !water[plazaI][plazaJ]) {
    plaza[plazaI][plazaJ] = true;
    objects[plazaI][plazaJ].push({ kind: 'fountain' });
  }
  const greenery = [];
  for (let i = 0; i < size; i += 1) for (let j = 0; j < size; j += 1) if (land[i][j] && !water[i][j] && !taken.has(key(i, j)) && !street[i][j] && !plaza[i][j]) greenery.push([i, j]);
  greenery.sort((a, b) => hash2(seed, a[0] * 13, a[1] * 7) - hash2(seed, b[0] * 13, b[1] * 7));
  // Farm fields on the outskirts of settled, earthly biomes.
  const field = height.map((row) => row.map(() => false));
  if (['web', 'other', 'data', 'mobile', 'game'].includes(project.category)) {
    const fields = clamp(Math.round((project.messages || 0) / 250), 0, 7);
    const outskirts = greenery.filter(([i, j]) => coastDistance[i][j] >= 1 && Math.hypot(i - keepSpot[0], j - keepSpot[1]) > size * .22)
      .sort((a, b) => Math.hypot(b[0] - keepSpot[0], b[1] - keepSpot[1]) - Math.hypot(a[0] - keepSpot[0], a[1] - keepSpot[1]));
    const seedField = outskirts[Math.floor(hash2(seed, 5, 5) * Math.min(outskirts.length, 6))];
    if (seedField) {
      outskirts.sort((a, b) => Math.hypot(a[0] - seedField[0], a[1] - seedField[1]) - Math.hypot(b[0] - seedField[0], b[1] - seedField[1]));
      outskirts.slice(0, fields).forEach(([i, j]) => { field[i][j] = true; });
    }
  }
  const open = greenery.filter(([i, j]) => !field[i][j]);
  const scatter = (count, make) => {
    for (let index = 0; index < count && open.length; index += 1) {
      const [i, j] = open[(index * 7 + make.salt) % open.length];
      objects[i][j].push(make(index));
    }
  };
  // Relics claim the most visible free ground: the front edge of the island, spread apart.
  const earned = typeof relicsOf === 'function' ? relicsOf(project) : [];
  const floating = earned.filter((entry) => entry.relic.sprite === 'whale');
  const grounded = earned.filter((entry) => entry.relic.sprite !== 'whale').slice(0, 4);
  const relicSpots = [];
  const frontier = open.filter(([i, j]) => coastDistance[i][j] >= 1 && !taken.has(key(i + 1, j)) && !taken.has(key(i, j + 1))).sort((a, b) => (b[0] + b[1]) - (a[0] + a[1]) + (hash2(seed, a[0], b[1]) - .5) * 4);
  grounded.forEach((entry) => {
    const spot = frontier.find(([i, j]) => relicSpots.every(([a, b]) => Math.hypot(a - i, b - j) >= 2.5));
    if (!spot) return;
    relicSpots.push(spot);
    objects[spot[0]][spot[1]].push({ kind: 'relic', sprite: entry.relic.sprite, rarity: entry.relic.rarity, id: entry.relic.id });
  });
  const relicKeys = new Set(relicSpots.map(([i, j]) => key(i, j)));
  for (let index = open.length - 1; index >= 0; index -= 1) if (relicKeys.has(key(open[index][0], open[index][1]))) open.splice(index, 1);

  // Trees grow in groves: most cluster around a few seeded centres, the rest are strays.
  const groveCount = clamp(Math.round(recipe.trees.count / 14), 1, 6);
  const groves = open.slice(0, groveCount).map(([ci, cj]) => open.filter(([i, j]) => Math.hypot(i - ci, j - cj) <= 2.6));
  for (let index = 0; index < recipe.trees.count && open.length; index += 1) {
    const grove = groves[index % groveCount];
    const pool = hash2(seed, index, 31) < .78 && grove?.length ? grove : open;
    const [i, j] = pool[Math.floor(hash2(seed, index, 33) * pool.length)];
    objects[i][j].push({ kind: 'tree', dx: Math.round((hash2(seed, index, 5) - .5) * 16), dy: Math.round((hash2(seed, index, 6) - .5) * 6), scale: hash2(seed, index, 8) });
  }
  const decorMaker = (index) => ({ kind: hash2(seed, index, 21) < .55 ? 'bush' : 'rock', dx: Math.round((hash2(seed, index, 22) - .5) * 16), dy: Math.round((hash2(seed, index, 23) - .5) * 6) });
  decorMaker.salt = 3;
  scatter(recipe.decor, decorMaker);
  const lanternMaker = (index) => ({ kind: 'lantern', dx: Math.round((hash2(seed, index, 15) - .5) * 10) });
  lanternMaker.salt = 5;
  scatter(recipe.lanterns, lanternMaker);
  for (let i = 0; i < size; i += 1) for (let j = 0; j < size; j += 1) objects[i][j].sort((a, b) => (a.dy || 0) - (b.dy || 0));

  // 4. Paint back to front into a pixel buffer.
  let peakLevel = 0; height.forEach((row) => row.forEach((value) => { peakLevel = Math.max(peakLevel, value); }));
  const width = size * TILE_W * 2 + 120;
  const originX = width / 2, originY = (peakLevel + 1) * LEVEL + 170;
  const canvasHeight = originY + Math.max(rootReach, size * TILE_H * 2 + 3 * LEVEL) + 160;
  const surface = createSurface(width, canvasHeight);
  const { put, shadow } = surface;
  const lights = [];
  const light = (x, y, color, radius, strength = .34) => lights.push({ x, y, color, radius, strength });
  const anims = [];
  const relicBoxes = [];
  const anim = (entry) => anims.push(entry);
  // In a team world, flags, airships and roofs wear the colours of the people who built the island.
  const builders = (project.builderPalette || []).filter(([, share]) => share > 0);
  const crewColors = builders.length
    ? builders.filter(([, share], index) => index === 0 || share >= .1).slice(0, 3).map(([color]) => hexRgb(color))
    : Object.entries(project.crews || { [project.agent]: 1 })
      .filter(([, share]) => share >= .15)
      .map(([agent]) => hexRgb(agent === 'claude' ? '#e0784a' : '#3fae94'));
  // Each building belongs to one builder, in proportion to their share of the work, spread evenly.
  const builderAt = (index) => {
    let pick = (index * .6180339887 + .31) % 1;
    for (const [color, share] of builders) { if (pick < share) return hexRgb(color); pick -= share; }
    return hexRgb(builders[builders.length - 1][0]);
  };
  const rect = (x, y, w, h, color, alpha = 1) => { for (let yy = 0; yy < h; yy += 1) for (let xx = 0; xx < w; xx += 1) put(x + xx, y + yy, color, alpha); };
  const dither = (x, y, t) => t > BAYER[((y & 3) << 2) | (x & 3)];
  const pickFrom = (list, value) => list[Math.min(list.length - 1, Math.floor(value * list.length))];
  const SAND_DARK = tone(biome.sand, -.18);
  const WATER = [hexRgb('#2f8fc4'), hexRgb('#45addb'), hexRgb('#6fcbea'), hexRgb('#c9f3ff')];

  function grassColor(gx, gy, lift) {
    const n = valueNoise(seed + 5, gx / 9, gy / 6) * .75 + hash2(seed, gx, gy) * .25 + lift;
    const shades = biome.grass;
    const position = clamp(n * (shades.length - 1), 0, shades.length - 1.001);
    const base = Math.floor(position);
    const color = dither(gx, gy, position - base) ? shades[base + 1] : shades[base];
    return recipe.snow && valueNoise(seed + 9, gx / 7, gy / 5) > .48 ? mixRgb(color, [238, 244, 255], .85) : color;
  }

  // Bedrock: bands darken with depth. Data islands are layered sandstone; tundra strata carry frost.
  const motif = BIOMES[project.category] ? project.category : 'other';
  const bandH = Math.max(LEVEL * 1.35, rootDepth / 7);
  function bedrock(gx, y, d) {
    const wobble = valueNoise(seed + 13, gx / 7, 0) * 6;
    // Bands step one tone darker every bandH, Bayer-dithered across the last quarter of each band.
    const position = (d + wobble) / bandH, within = position - Math.floor(position);
    const band = 1 + Math.floor(position) + (within > .75 && dither(gx, y, (within - .75) * 4) ? 1 : 0);
    let rock;
    if (motif === 'data') {
      const s = d + wobble * .6 + Math.sin(gx / 11 + (seed % 7)) * 2, layer = Math.floor(s / 4);
      rock = rocks[clamp(band + (layer % 3 === 1 ? 1 : 0), 0, 6)];
      if (s % 4 < 1 && layer % 3 === 0) rock = tone(rock, .2);
    } else {
      rock = rocks[clamp(band, 0, 6)];
      if (within < 1 / bandH) rock = motif === 'cli' ? mixRgb(rock, [226, 238, 248], .45) : tone(rock, .16);
    }
    return hash2(seed, gx, y) > .93 ? tone(rock, -.12) : rock;
  }
  const rootX = (k) => originX + landLeft - TILE_W + k;
  const faceBottom = (k) => originY + frontGround[k] + frontSlab[k];
  const rootBottom = (k) => originY + frontGround[k] + drops[k];
  const inRoot = (k, y, margin = 1) => k >= 0 && k < span && y >= faceBottom(k) && y < rootBottom(k) - margin;

  // The root goes down first, behind everything: a lit and a shadowed face per crag, darkening toward the tip,
  // with a cool moonlit rim along the lit side.
  function paintRoot() {
    surface.z = 1;
    for (let k = 0; k < span; k += 1) {
      const gx = rootX(k), top = originY + frontGround[k], bottom = rootBottom(k);
      const lit = gx < originX + owner[k].x;
      for (let y = top; y < bottom; y += 1) {
        const color = tone(bedrock(gx, y, y - top), (lit ? -.04 : -.26) - clamp((y - top) / rootDepth, 0, 1) * .3);
        put(gx, y, lit && bottom - y <= 2 ? mixRgb(color, MOONLIT, .5) : color);
      }
    }
  }

  // One motif per biome on the underside, painted over the root once the columns are down.
  function bedrockMotif() {
    surface.z = 1;
    const pick = (salt) => Math.floor(span * (.14 + hash2(seed, salt, 81) * .72));
    const tipX = originX + cones[0].x;
    const walk = (salt, steps, paint) => {
      let k = pick(salt), y = faceBottom(k) + 2;
      for (let step = 0; step < steps && inRoot(k, y, 3); step += 1) {
        paint(rootX(k), y, step);
        const toward = Math.sign(tipX - rootX(k)) || 1;
        k += hash2(seed, step, salt + 90) < .66 ? toward : -toward;
        y += 1 + (step % 3 === 0 ? 1 : 0);
      }
    };
    if (motif === 'ai') {
      // Geodes broken open in the rock, and crystal seams running down toward the tip.
      const glowColour = `rgb(${biome.crystal[1].join(',')})`;
      for (let n = 0; n < 3; n += 1) walk(n * 5 + 2, 70, (gx, y, step) => {
        put(gx, y, step % 4 === 0 ? biome.crystal[2] : biome.crystal[1]); put(gx + 1, y, biome.crystal[0]);
        if (step % 10 === 5) light(gx, y, glowColour, 6, .24);
      });
      for (let n = 0; n < 2 + Math.floor(hash2(seed, 4, 82) * 2); n += 1) {
        const k = pick(n * 3 + 1), rx = 4 + Math.round(hash2(seed, n, 84) * 3), ry = 3 + Math.round(hash2(seed, n, 85) * 2);
        const cy = faceBottom(k) + ry + 4 + Math.round((drops[k] - frontSlab[k]) * (.1 + hash2(seed, n, 83) * .28));
        if (!inRoot(k - rx, cy + ry + 1, 3) || !inRoot(k + rx, cy + ry + 1, 3)) continue;
        for (let dy = -ry - 1; dy <= ry + 1; dy += 1) for (let dx = -rx - 1; dx <= rx + 1; dx += 1) {
          const e = Math.hypot(dx / (rx + .5), dy / (ry + .5));
          if (e <= 1.18) put(rootX(k) + dx, cy + dy, e > .95 ? rocks[6] : e > .68 ? biome.crystal[0] : (dx - dy + 9) % 3 === 0 ? biome.crystal[2] : biome.crystal[1]);
        }
        light(rootX(k), cy, glowColour, 16, .36);
      }
    } else if (motif === 'game') {
      // Lava seams glowing through dark basalt, converging on a drip at the tip.
      for (let n = 0; n < 3; n += 1) walk(n * 5 + 3, 110, (gx, y, step) => {
        put(gx - 1, y, rocks[6]); put(gx + 1, y, rocks[6]);
        put(gx, y, step % 5 === 0 ? [255, 236, 140] : [255, 146, 44]);
        if (step % 7 === 3) light(gx, y, '#ff7a2a', 10, .32);
      });
      let deepest = 0;
      for (let k = 1; k < span; k += 1) if (rootBottom(k) > rootBottom(deepest)) deepest = k;
      const dripY = rootBottom(deepest);
      for (let y = -2; y < 4; y += 1) put(rootX(deepest), dripY + y, y < 1 ? [255, 146, 44] : [255, 210, 90]);
      put(rootX(deepest) - 1, dripY + 2, [255, 146, 44]); put(rootX(deepest) + 1, dripY + 2, [214, 84, 30]);
      light(rootX(deepest), dripY + 1, '#ff7a2a', 14, .42);
    } else if (motif === 'cli') {
      // Icicles hang wherever the underside runs level enough to hold them.
      for (let k = 2; k < span - 2; k += 2 + Math.floor(hash2(seed, k, 88) * 4)) {
        if (Math.abs(rootBottom(k + 1) - rootBottom(k - 1)) > 4) continue;
        const length = 3 + Math.round(hash2(seed, k, 89) * (4 + drops[k] / 40)), y0 = rootBottom(k) - 1;
        for (let y = 0; y < length; y += 1) {
          put(rootX(k), y0 + y, y >= length - 2 ? [255, 255, 255] : [226, 246, 255]);
          if (y < length - 3) put(rootX(k) + 1, y0 + y, [150, 206, 232]);
        }
      }
    } else if (motif === 'mobile') {
      // Blossom vines trail down the rock.
      const stem = tone(biome.grass[0], -.3);
      for (let n = 0; n < 6 + Math.floor(hash2(seed, 5, 91) * 4); n += 1) {
        const k0 = pick(n * 7 + 4), side = n % 2 ? 1 : -1;
        const length = Math.round((drops[k0] - frontSlab[k0]) * (.22 + hash2(seed, n, 92) * .34));
        for (let y = 0; y < length; y += 1) {
          const k = k0 + Math.round(Math.sin(y / 6 + n) * 1.4), gy = faceBottom(k0) - 2 + y;
          if (y > 3 && !inRoot(k, gy, 3)) break;
          put(rootX(k), gy, stem);
          if (y % 5 === 3) {
            const petal = biome.leaves[1 + (y + n) % 3];
            [[0, -1], [-1, 0], [1, 0], [0, 1]].forEach(([a, b]) => put(rootX(k) + side + a, gy + b, petal));
            put(rootX(k) + side, gy, [255, 226, 122]);
          }
        }
      }
    } else if (motif === 'web') {
      // Ivy curtains creep down from the lip.
      for (let n = 0; n < 5 + Math.floor(hash2(seed, 6, 93) * 4); n += 1) {
        const k0 = pick(n * 11 + 5), length = Math.round((drops[k0] - frontSlab[k0]) * (.18 + hash2(seed, n, 94) * .3));
        for (let y = -2; y < length; y += 1) {
          const w = Math.round(4 * (1 - y / length)) + 1;
          for (let dx = -w; dx <= w; dx += 1) {
            const k = k0 + dx + Math.round(Math.sin((y + n * 5) / 5) * 1.5), gy = faceBottom(k0) + y;
            const h = hash2(seed, rootX(k), gy);
            if (k < 0 || k >= span || gy >= rootBottom(k) - 1 || h < .42) continue;
            put(rootX(k), gy, h > .88 ? biome.leaves[3] : h > .7 ? biome.leaves[2] : h > .55 ? biome.leaves[1] : biome.leaves[0]);
          }
        }
      }
    } else if (motif === 'other') {
      // A lip of moss where the slab meets the root, dripping here and there.
      for (let k = 0; k < span; k += 1) {
        const length = 2 + Math.round(valueNoise(seed + 41, k / 4, 0) * 3) + (hash2(seed, k, 95) > .86 ? 3 + Math.round(hash2(seed, k, 96) * 6) : 0);
        for (let y = 0; y < length && faceBottom(k) - 1 + y < rootBottom(k) - 1; y += 1) put(rootX(k), faceBottom(k) - 1 + y, y === 0 ? biome.leaves[3] : y < 3 ? biome.leaves[2] : biome.leaves[1]);
      }
    }
  }

  function column(i, j) {
    const level = height[i][j];
    const cx = originX + (i - j) * TILE_W, cy = originY + (i + j) * TILE_H;
    const top = cy - level * LEVEL;
    const coast = level === 1 && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => !isLand(i + a, j + b));
    const depth = undersideDepth[i][j];
    const lift = (level - 1) / Math.max(1, peakLevel) * .12;

    // Side faces: grass lip, earth, then the first strata of the rock root.
    for (let x = 0; x < TILE_W * 2; x += 1) {
      const left = x < TILE_W;
      const gx = cx - TILE_W + x;
      const edgeY = left ? top + TILE_H + Math.floor(x / 2) : top + TILE_H * 2 - 1 - Math.floor((x - TILE_W) / 2);
      const groundY = edgeY + level * LEVEL;
      const bottomY = groundY + depth;
      const faceShade = left ? -.04 : -.26;
      const lip = 2 + (hash2(seed, gx, j) > .55 ? 1 : 0) + (hash2(seed, gx, i) > .86 ? 3 : 0);
      for (let y = edgeY; y < bottomY; y += 1) {
        let color;
        if (water[i][j] && y < edgeY + 3) color = WATER[1];
        else if (y < edgeY + lip) color = coast ? SAND_DARK : grassColor(gx, y, -.25);
        else if (y < groundY) {
          const earth = biome.dirt[(hash2(seed, gx, y) > .82) ? 1 : 0];
          color = (y - edgeY) % LEVEL === LEVEL - 1 ? tone(earth, -.2) : earth;
        } else color = bedrock(gx, y, y - groundY);
        put(gx, y, tone(color, faceShade));
      }
      // Hanging vines and roots from the grass lip.
      if (!water[i][j] && !coast && hash2(seed, gx, j * 7 + i) > (recipe.days !== null && recipe.days < 60 ? .8 : .93)) {
        const length = 4 + Math.floor(hash2(seed, gx, i * 5) * 16);
        for (let y = 0; y < length && edgeY + lip + y < bottomY; y += 1) {
          const leaf = biome.leaves[(y + gx) % 3 === 0 ? 2 : 1];
          put(gx, edgeY + lip + y, tone(recipe.snow ? [200, 210, 220] : leaf, faceShade - .1));
        }
      }
    }

    // Top face, shaded per pixel.
    const neighbours = { ul: levelAt(i - 1, j), ur: levelAt(i, j - 1), ll: levelAt(i, j + 1), lr: levelAt(i + 1, j) };
    const joins = (a, b) => isLand(a, b) && (street[a][b] || taken.has(key(a, b)) || plaza[a][b] || bridge[a][b]);
    const paths = street[i][j] ? { ip: joins(i + 1, j), im: joins(i - 1, j), jp: joins(i, j + 1), jm: joins(i, j - 1) } : null;
    for (let row = 0; row < TILE_H * 2; row += 1) {
      const half = row < TILE_H ? (row + 1) * 2 : (TILE_H * 2 - row) * 2;
      const gy = top + row;
      for (let x = -half; x < half; x += 1) {
        const gx = cx + x;
        const dx = (x + .5) / TILE_W, dy = (row + .5 - TILE_H) / TILE_H;
        const edge = 1 - (Math.abs(dx) + Math.abs(dy));
        const quadrant = dy < 0 ? (dx < 0 ? 'ul' : 'ur') : (dx < 0 ? 'll' : 'lr');
        const neighbour = neighbours[quadrant];
        let color;
        if (water[i][j]) {
          const ripple = valueNoise(seed + 17, gx / 7, gy / 3.5);
          color = dither(gx, gy, ripple) ? WATER[1] : WATER[2];
          if (ripple > .78 && ((gx + gy * 2) % 6 === 0)) color = WATER[3];
          const [ni, nj] = { ul: [i - 1, j], ur: [i, j - 1], ll: [i, j + 1], lr: [i + 1, j] }[quadrant];
          if (edge < .09 && isLand(ni, nj) && !water[ni][nj]) color = mixRgb(color, [235, 252, 255], .75);
          if (bridge[i][j] && Math.abs(dx - dy) < .42) {
            color = ((gx + gy * 2) % 5 === 0) ? hexRgb('#5c3f2c') : hexRgb('#9a6a44');
            if (Math.abs(dx - dy) > .36) color = hexRgb('#4a3222');
          }
        } else if (plaza[i][j]) {
          const ring = Math.floor(Math.hypot(dx * 1.6, dy * 2.4) * 4);
          color = ring % 2 ? hexRgb('#cdbb92') : hexRgb('#e3d4ad');
          if ((gx + gy) % 5 === 0) color = tone(color, -.12);
        } else if (field[i][j]) {
          const row = ((gx - gy * 2) % 6 + 6) % 6;
          const crop = project.category === 'data' ? [226, 182, 74] : project.category === 'mobile' ? [244, 168, 196] : biome.leaves[2];
          color = row < 3 ? (row === 0 ? tone(crop, .2) : crop) : hexRgb(row === 3 ? '#8a5e3c' : '#a5744c');
          if (recipe.snow) color = mixRgb(color, [240, 245, 255], .55);
        } else if (street[i][j]) {
          // Tile-local axes: u runs toward i+1, v toward j+1. The path is a band along whichever sides connect.
          const u = (dx + dy) / 2, v = (dy - dx) / 2;
          const wobble = (valueNoise(seed + 21, gx / 5, gy / 3) - .5) * .08;
          const width = .15 + wobble;
          const onPath = (Math.abs(u) < width && Math.abs(v) < width)
            || (Math.abs(v) < width && ((u > 0 && paths.ip) || (u < 0 && paths.im)))
            || (Math.abs(u) < width && ((v > 0 && paths.jp) || (v < 0 && paths.jm)));
          const nearPath = (Math.abs(u) < width + .07 && Math.abs(v) < width + .07)
            || (Math.abs(v) < width + .07 && ((u > 0 && paths.ip) || (u < 0 && paths.im)))
            || (Math.abs(u) < width + .07 && ((v > 0 && paths.jp) || (v < 0 && paths.jm)));
          if (onPath) {
            const pebble = hash2(seed, gx, gy);
            color = pebble > .86 ? hexRgb('#b9a77e') : pebble < .12 ? hexRgb('#e8dab4') : hexRgb('#d6c49a');
            if (recipe.snow && pebble > .4) color = mixRgb(color, [240, 245, 255], .7);
          } else {
            color = grassColor(gx, gy, lift);
            if (nearPath) color = tone(color, -.1);
          }
        } else if (coast && edge < .32) {
          color = dither(gx, gy, edge / .32) ? grassColor(gx, gy, lift) : biome.sand;
          if (hash2(seed, gx, gy) > .97) color = [255, 250, 236];
        } else {
          color = grassColor(gx, gy, lift);
          if (hash2(seed + 1, gx, gy) > .955) color = tone(color, -.16);
          else if (hash2(seed + 2, gx, gy) > .965) color = tone(color, .22);
        }
        // Rim light on edges that drop away, contact shadow under taller neighbours.
        if (edge < .08) {
          if ((quadrant === 'ul' || quadrant === 'ur') && neighbour < level) color = tone(color, .3);
          if ((quadrant === 'll' || quadrant === 'lr') && neighbour < level) color = tone(color, -.22);
        }
        if ((quadrant === 'ul' || quadrant === 'ur') && neighbour > level && edge < .3) color = tone(color, -(.3 - edge) * 1.3);
        put(gx, gy, color);
      }
    }
    if (!water[i][j] && !street[i][j] && !coast) {
      const flowers = Math.floor(hash2(seed, i, j + 99) * 4);
      for (let index = 0; index < flowers; index += 1) {
        const fx = cx - 7 + Math.floor(hash2(seed, i + index, j * 2) * 14), fy = top + 4 + Math.floor(hash2(seed, i * 2, j + index) * 8);
        const petal = recipe.snow ? [255, 255, 255] : pickFrom(biome.flowers, hash2(seed, i + index, j + 3));
        put(fx, fy, petal); put(fx, fy + 1, tone(biome.grass[0], -.2));
      }
    }
    return { cx, base: top + TILE_H };
  }

  // A wall box on an isometric footprint. Returns the y of the wall top at the box centre line.
  function walls(cx, baseY, half, wallHeight, material, options = {}) {
    const { windows = true, door = false, wall = biome.wall } = options;
    for (let x = -half; x < half; x += 1) {
      const left = x < 0;
      const bottomY = left ? baseY + Math.floor((x + half) / 2) : baseY + Math.floor(half / 2) - Math.floor(x / 2);
      const faceShade = left ? 0 : -.24;
      for (let y = bottomY - wallHeight; y < bottomY; y += 1) {
        const fromTop = y - (bottomY - wallHeight), fromBottom = bottomY - 1 - y;
        let color = wall;
        if (material === 'stone') {
          const course = Math.floor(fromBottom / 3);
          const joint = fromBottom % 3 === 2 || (x + half + (course % 2) * 2) % 5 === 0;
          color = joint ? tone(wall, -.22) : tone(wall, (hash2(seed, cx + x, course) - .5) * .14);
        } else if (material === 'wood') {
          color = fromBottom % 3 === 2 ? tone(wall, -.25) : tone(wall, (hash2(seed, cx + x, Math.floor(fromBottom / 3)) - .5) * .1);
        } else if (material === 'timber') {
          const beam = (x + half) % 7 === 0 || fromTop === 2 || (fromTop === Math.floor(wallHeight / 2) && wallHeight > 12);
          color = beam ? hexRgb('#5e4030') : tone(wall, (hash2(seed, cx + x, y) - .5) * .06);
        } else if (material === 'stripes') {
          color = Math.floor(fromBottom / 7) % 2 ? hexRgb('#d9483f') : hexRgb('#f6f0e6');
        } else if (material === 'glass') {
          color = (x + half) % 3 === 0 ? hexRgb('#3a2c2a') : fromTop < 2 ? [255, 246, 200] : [255, 214, 120];
        } else if (material === 'columns') {
          color = (x + half) % 4 === 1 ? tone(wall, .16) : (x + half) % 4 === 3 ? tone(wall, -.12) : wall;
        } else {
          color = tone(wall, (hash2(seed, cx + x, y) - .5) * .05);
        }
        if (fromBottom < 2) color = tone(hexRgb('#8a8079'), -.1);
        if (fromTop < 2) color = tone(color, -.35);
        if (x === -1) color = tone(color, .12);
        put(cx + x, y, tone(color, faceShade));
      }
      // Windows sit in pairs of pixel columns that follow the wall's slope.
      const slot = (x + half) % 6;
      if (windows && wallHeight >= 10 && (slot === 2 || slot === 3) && x !== -1 && x !== 0 && Math.abs(x) < half - 1) {
        for (let y = bottomY - wallHeight + 5; y < bottomY - 5; y += 8) {
          const lit = hash2(seed, cx + x - (slot === 3), y) < recipe.lit;
          put(cx + x, y - 1, tone(wall, -.4));
          for (let k = 0; k < 3; k += 1) put(cx + x, y + k, lit ? (k === 0 ? [255, 238, 176] : [255, 196, 92]) : (k === 0 ? [92, 112, 150] : [36, 46, 76]));
          put(cx + x, y + 3, tone(wall, .25));
          if (lit && slot === 2 && hash2(seed, x, y) < .35) light(cx + x, y + 1, '#ffc35a', 6, .24);
        }
      }
      if (door && left && x >= -Math.floor(half / 2) - 1 && x <= -Math.floor(half / 2) + 1) {
        for (let y = bottomY - 7; y < bottomY - 1; y += 1) put(cx + x, y, x === -Math.floor(half / 2) ? hexRgb('#4a3222') : hexRgb('#6e4a32'));
        put(cx + x, bottomY - 8, hexRgb('#3a281c'));
      }
    }
    return baseY - wallHeight;
  }

  function roof(cx, topY, half, kind, color = [150, 140, 135], options = {}) {
    const light1 = tone(color, .14), dark = tone(color, -.3);
    if (kind === 'cone') {
      const rise = half * 2.6;
      for (let x = -half - 1; x <= half; x += 1) {
        const t = Math.abs(x + .5) / (half + 1);
        const eave = (x < 0 ? topY + Math.floor((x + half) / 2) : topY + Math.floor(half / 2) - Math.floor(x / 2)) + 1;
        const tip = topY - Math.floor(half / 2) - Math.round(rise * (1 - t));
        for (let y = tip; y <= eave; y += 1) {
          let c = x < -half / 3 ? light1 : x < 1 ? color : dark;
          if ((eave - y) % 4 === 0) c = tone(c, -.12);
          if (y === eave) c = tone(c, -.3);
          put(cx + x, y, c);
        }
      }
      if (recipe.snow) for (let y = 0; y < 3; y += 1) put(cx - 1 + (y > 0), topY - Math.floor(half / 2) - Math.round(rise) + y + 1, [244, 248, 255]);
      return topY - Math.floor(half / 2) - Math.round(rise);
    }
    if (kind === 'dome') {
      const radius = half;
      const centreY = topY - Math.floor(half / 2) + 1;
      for (let x = -radius; x <= radius; x += 1) {
        const h = Math.round(Math.sqrt(Math.max(0, radius * radius - x * x)) * .95);
        for (let y = 0; y <= h; y += 1) {
          const nx = x / radius, ny = -y / radius;
          const lightness = -nx * .5 - ny * .45 + Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny)) * .35 - .2;
          let c = tone(color, clamp(lightness, -.4, .4));
          if (x % 4 === 0) c = tone(c, -.15);
          put(cx + x, centreY - y, c);
        }
      }
      for (let y = 0; y < 4; y += 1) put(cx, centreY - radius - 1 - y, y === 3 ? [255, 236, 150] : [210, 170, 70]);
      put(cx - Math.round(radius * .45), centreY - Math.round(radius * .55), [255, 255, 255]);
      return centreY - radius - 5;
    }
    if (kind === 'crenel') {
      for (let row = 0; row < half; row += 1) {
        const w = row < half / 2 ? (row + 1) * 2 : (half - row) * 2;
        for (let x = -w; x < w; x += 1) put(cx + x, topY - Math.floor(half / 2) + row, tone(hexRgb('#9d9590'), -.05));
      }
      for (let x = -half; x < half; x += 1) {
        const left = x < 0;
        const edge = left ? topY + Math.floor((x + half) / 2) : topY + Math.floor(half / 2) - Math.floor(x / 2);
        if (Math.floor((x + half) / 3) % 2 === 0) for (let y = 1; y <= 3; y += 1) put(cx + x, edge - y, tone(hexRgb('#cfc6bc'), left ? 0 : -.24));
      }
      return topY - Math.floor(half / 2);
    }
    // Hipped roof with shingle rows, a lit ridge and a shadowed eave. Pagodas flare their corners.
    const rise = Math.round(half * (options.rise ?? .95));
    for (let x = -half - 1; x <= half; x += 1) {
      const t = Math.abs(x + .5) / (half + 1);
      const flare = options.flare ? Math.round(Math.pow(t, 4) * options.flare) : 0;
      const eave = (x < 0 ? topY + Math.floor((x + half) / 2) : topY + Math.floor(half / 2) - Math.floor(x / 2)) + 1 - flare;
      const ridge = topY - Math.floor(half / 2) + Math.floor(Math.abs(x + .5) / 2) - Math.round(rise * (1 - t));
      for (let y = ridge; y <= eave; y += 1) {
        let c = x < 0 ? light1 : dark;
        if ((eave - y) % 3 === 0) c = tone(c, -.14);
        if (y === ridge) c = tone(c, .28);
        if (y === eave) c = tone(c, -.3);
        if (recipe.snow && y - ridge < 2) c = [240, 246, 255];
        put(cx + x, y, c);
      }
    }
    if (options.chimney) {
      const chimneyX = cx + Math.round(half * .45);
      const chimneyTop = topY - Math.floor(half / 2) - rise + 2;
      for (let y = chimneyTop; y < chimneyTop + 7; y += 1) for (let x = 0; x < 3; x += 1) put(chimneyX + x, y, x === 2 ? hexRgb('#6a4a3e') : hexRgb('#8f5f4c'));
      for (let x = -1; x < 4; x += 1) put(chimneyX + x, chimneyTop, hexRgb('#4a3530'));
      if (recipe.smoke) smoke(chimneyX + 1, chimneyTop - 2, 4);
      return chimneyTop;
    }
    return topY - Math.floor(half / 2) - rise;
  }

  function smoke(x, y, puffs) {
    anim({ type: 'smoke', x, y, puffs, phase: hash2(seed, x, y) });
  }

  function groundShadow(cx, baseY, half, length) {
    for (let y = -Math.floor(half / 2); y <= Math.floor(half / 2) + 2; y += 1) {
      for (let x = -half; x <= half + length; x += 1) {
        if (Math.abs(x - length / 2) / (half + length / 2) + Math.abs(y) / (half / 2 + 2) < 1) shadow(cx + x + 2, baseY + y + 2, .28);
      }
    }
  }


  function flagPole(x, topY, length = 14) {
    // In a team world the keep flies one pennant per top builder (up to three), longest for the biggest share.
    const pennants = [...builders].sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (pennants.length) length = Math.max(length, pennants.length * 8 + 3);
    for (let y = 0; y < length; y += 1) put(x, topY - y, hexRgb('#3a2c22'));
    put(x, topY - length, [230, 200, 120]);
    if (pennants.length) pennants.forEach(([color, share], index) => anim({ type: 'pennant', x: x + 1, y: topY - length + 1 + index * 8, color: hexRgb(color), length: Math.round(10 + share * 12) }));
    else crewColors.forEach((color, index) => anim({ type: 'flag', x: x + 1, y: topY - length + 1 + index * 6, color, length: 10 - index * 2 }));
    if (recipe.beacon) { anim({ type: 'beacon', x, y: topY - length - 3 }); light(x, topY - length - 2, '#ffd36b', 22, .4); }
  }

  // The landmark holds the project's biggest session and shows what kind of place this is.
  function landmark(level, cx, baseY) {
    const kind = project.category;
    groundShadow(cx, baseY, 18, 12);
    if (kind === 'web') {
      const houseTop = walls(cx + 13, baseY + 3, 8, 12, 'timber', { door: true });
      roof(cx + 13, houseTop, 8, 'hip', biome.roofs[0], { chimney: true });
      const towerTop = walls(cx - 2, baseY, 7, 46 + level * 5, 'stripes', { windows: false });
      const gallery = walls(cx - 2, towerTop + 3, 9, 3, 'stone', { wall: hexRgb('#3a3640'), windows: false });
      const lantern = walls(cx - 2, gallery, 5, 9, 'glass', { windows: false });
      const tip = roof(cx - 2, lantern, 5, 'cone', hexRgb('#b8342e'));
      light(cx - 2, lantern + 4, '#ffe08a', 26, .5);
      anim({ type: 'beam', x: cx - 2, y: lantern + 5 });
      flagPole(cx - 2, tip - 1, 8);
    } else if (kind === 'ai') {
      const top = walls(cx, baseY, 14, 16 + level * 2, 'columns', { wall: hexRgb('#ece8f6'), door: true });
      const domeTop = roof(cx, top, 14, 'dome', biome.accent);
      for (let y = domeTop + 6; y < top - 2; y += 1) put(cx + 2, y, hexRgb('#241a3a'));
      for (let r = 0; r < 20; r += .5) for (let w = -2; w <= 2; w += 1) {
        put(cx + 2 + r * .82 + w * .4, top - 9 - r * .55 + w * .8, w < 0 ? hexRgb('#e8c26a') : w > 0 ? hexRgb('#8a6a2a') : hexRgb('#c9a24a'));
      }
      rect(cx + 18, top - 21, 4, 4, hexRgb('#3a2c22'));
      light(cx + 20, top - 19, '#b48cff', 16, .45);
      flagPole(cx - 8, domeTop + 6, 12);
    } else if (kind === 'cli') {
      const cabinTop = walls(cx + 12, baseY + 3, 8, 12, 'wood', { wall: hexRgb('#9fb0b8'), door: true });
      roof(cx + 12, cabinTop, 8, 'hip', biome.roofs[0], { chimney: true });
      const mastHeight = 62 + level * 5;
      for (let y = 0; y < mastHeight; y += 1) {
        const spread = Math.round(7 * (1 - y / mastHeight));
        put(cx - 4 - spread, baseY - y, hexRgb('#8a929e')); put(cx - 4 + spread, baseY - y, hexRgb('#5c6470'));
        if (y % 7 === 0) for (let x = -spread; x <= spread; x += 1) put(cx - 4 + x, baseY - y, hexRgb('#727a86'));
        if (y % 7 === 3) for (let x = -spread; x <= spread; x += 1) put(cx - 4 + x, baseY - y + Math.round(x * .6), hexRgb('#666e7a'));
      }
      for (let x = -6; x <= 6; x += 1) for (let y = 0; y < 6 - Math.abs(x) / 2; y += 1) put(cx - 4 + x, baseY - mastHeight * .55 - y, x < 0 ? [236, 240, 244] : [196, 204, 212]);
      flagPole(cx - 4, baseY - mastHeight, 4);
      rect(cx - 5, baseY - mastHeight - 7, 3, 2, [255, 77, 94]);
      anim({ type: 'beacon', x: cx - 4, y: baseY - mastHeight - 6, color: [255, 77, 94] });
    } else if (kind === 'data') {
      const annexTop = walls(cx + 12, baseY + 3, 9, 14, 'stone', { wall: hexRgb('#efe2c8'), door: true });
      roof(cx + 12, annexTop, 9, 'hip', biome.roofs[0]);
      const towerTop = walls(cx - 4, baseY, 8, 52 + level * 5, 'stone', { wall: hexRgb('#e8dcc4') });
      const faceY = towerTop + 9, faceX = cx - 8;
      for (let y = -5; y <= 5; y += 1) for (let x = -4; x <= 4; x += 1) if (x * x / 16 + y * y / 25 <= 1) put(faceX + x, faceY + y + Math.round(x / 2), x * x / 16 + y * y / 25 > .7 ? hexRgb('#8a6a2a') : [252, 244, 220]);
      for (let k = 0; k < 4; k += 1) { put(faceX, faceY - k, hexRgb('#2a1f1c')); put(faceX + k * .7, faceY + k * .2, hexRgb('#2a1f1c')); }
      light(faceX, faceY, '#fff1c4', 10, .3);
      const tip = roof(cx - 4, towerTop, 8, 'cone', biome.roofs[1]);
      flagPole(cx - 4, tip - 1, 10);
    } else if (kind === 'mobile') {
      let tierBase = baseY;
      for (let tier = 0; tier < 4; tier += 1) {
        const half = 13 - tier * 2;
        const top = walls(cx, tierBase, half, 10, 'plaster', { wall: hexRgb(tier % 2 ? '#fbe9e2' : '#f6d8d2'), windows: tier > 0 });
        roof(cx, top, half + 3, 'hip', biome.roofs[tier % 2], { rise: .45, flare: 5 });
        tierBase = top - Math.round((half + 3) * .45) + Math.floor(half / 2);
      }
      for (let y = 0; y < 12; y += 1) put(cx, tierBase - y, y % 3 ? [230, 190, 90] : [170, 130, 60]);
      flagPole(cx, tierBase - 12, 6);
    } else if (kind === 'game') {
      const backTop = walls(cx, baseY - 9, 6, 34 + level * 6, 'stone', { wall: hexRgb('#d8cfc4') });
      const backTip = roof(cx, backTop, 6, 'cone', biome.roofs[1]);
      flagPole(cx, backTip - 2, 14);
      const hallTop = walls(cx, baseY, 15, 20 + level * 4, 'stone', { wall: hexRgb('#e3dacd') });
      roof(cx, hallTop, 15, 'crenel');
      for (let x = -9; x <= -4; x += 1) {
        const bottom = baseY + Math.floor((x + 15) / 2);
        for (let y = bottom - (x === -9 || x === -4 ? 8 : 10); y < bottom; y += 1) put(cx + x, y, recipe.lit > .4 && (y - bottom) % 3 !== 0 ? [255, 190, 90] : hexRgb('#2a1f1c'));
      }
      [-14, 14].forEach((offset) => {
        const towerTop = walls(cx + offset, baseY + 4, 5, 30 + level * 5, 'stone', { wall: hexRgb('#ddd3c6') });
        roof(cx + offset, towerTop, 5, 'cone', biome.roofs[0]);
      });
      anim({ type: 'balloon', x: cx - 30, y: baseY - 70, color: hexRgb('#e8484f') });
      anim({ type: 'balloon', x: cx + 32, y: baseY - 86, color: hexRgb('#3f7fe0') });
    } else {
      // An ancient tree with lanterns: the heart of an uncategorised island.
      for (let y = 0; y < 26; y += 1) for (let x = -4; x <= 4; x += 1) {
        const w = 4 - Math.floor(y / 10);
        if (Math.abs(x) <= w) put(cx + x, baseY - y, x < -1 ? hexRgb('#8a6448') : x > 1 ? hexRgb('#4e3424') : hexRgb('#6b4a32'));
      }
      const blobs = [[0, -40, 16], [-14, -32, 11], [14, -33, 11], [-7, -50, 11], [8, -49, 10]];
      for (let dy = -64; dy <= -18; dy += 1) for (let dx = -28; dx <= 28; dx += 1) {
        let best = -1;
        blobs.forEach(([bx, by, r]) => { const d = Math.hypot(dx - bx, dy - by) / r; if (d <= 1) best = Math.max(best, 1 - d); });
        if (best < 0) continue;
        const side = -(dx + dy * 1.1 + 40) / 50;
        let c = side > .45 ? biome.leaves[3] : side > .1 ? biome.leaves[2] : side > -.3 ? biome.leaves[1] : biome.leaves[0];
        if (best < .08) c = tone(biome.leaves[0], -.3);
        if (hash2(seed, dx, dy) > .93) c = tone(c, .18);
        put(cx + dx, baseY + dy, c);
      }
      [[-12, -26], [10, -24], [-3, -30], [18, -30], [-20, -30]].forEach(([dx, dy]) => {
        put(cx + dx, baseY + dy - 2, hexRgb('#3a2c22'));
        rect(cx + dx - 1, baseY + dy, 3, 3, [255, 214, 110]);
        light(cx + dx, baseY + dy + 1, '#ffcf6a', 10, .4);
      });
      flagPole(cx + 2, baseY - 60, 6);
    }
  }

  function roofHue(index, salt) {
    if (builders.length) return tone(builderAt(index), (salt - 1) * .1);
    const base = biome.roofs[(index + salt) % biome.roofs.length];
    return tone(base, (hash2(seed, index, 40 + salt) - .5) * .26);
  }

  function building(object, cx, baseY, i, j) {
    const roofColor = tone(builders.length ? builderAt(object.index) : biome.roofs[object.index % biome.roofs.length], (hash2(seed, i * 3, j * 5) - .5) * .22);
    const level = object.level;
    if (object.type === 'keep') {
      landmark(level, cx, baseY);
    } else if (object.type === 'forge') {
      groundShadow(cx, baseY, 11, 8);
      const top = walls(cx, baseY, 11, 11 + level * 3, 'stone', { wall: hexRgb('#b5aba1'), door: false });
      roof(cx, top, 11, 'hip', tone(roofHue(object.index, 2), -.25));
      // Big chimney with embers and a furnace mouth.
      const chimneyTop = top - 9 - level;
      for (let y = chimneyTop; y < top + 2; y += 1) for (let x = 0; x < 5; x += 1) put(cx + 4 + x, y, x < 2 ? hexRgb('#7f716a') : hexRgb('#5c514c'));
      for (let x = -1; x < 6; x += 1) put(cx + 4 + x, chimneyTop, hexRgb('#3c3436'));
      put(cx + 6, chimneyTop + 1, [255, 150, 60]); light(cx + 6, chimneyTop, '#ff8a3a', 8, .35);
      for (let x = -7; x <= -3; x += 1) {
        const bottom = baseY + Math.floor((x + 11) / 2);
        for (let y = bottom - 6; y < bottom - 1; y += 1) put(cx + x, y, y > bottom - 4 ? [255, 140, 50] : [255, 196, 90]);
      }
      light(cx - 5, baseY - 2, '#ff7a2a', 14, .5);
      rect(cx - 13, baseY + 1, 3, 2, hexRgb('#3a3640'));
      if (recipe.smoke) smoke(cx + 6, chimneyTop - 3, 6);
    } else if (object.type === 'workshop') {
      groundShadow(cx, baseY, 11, 6);
      const top = walls(cx, baseY, 11, 10 + level * 3, 'wood', { wall: hexRgb('#c08f5e'), door: true });
      roof(cx, top, 11, 'hip', roofHue(object.index, 0));
      // Awning over the door, a stack of planks and a sawhorse.
      for (let x = -10; x <= -3; x += 1) {
        const ay = baseY + Math.floor((x + 11) / 2) - 10;
        put(cx + x, ay, (x & 1) ? [236, 226, 206] : roofHue(object.index, 1)); put(cx + x, ay + 1, tone(roofHue(object.index, 1), -.25));
      }
      for (let k = 0; k < 3; k += 1) { rect(cx + 12, baseY + 1 - k * 2, 7, 2, k % 2 ? hexRgb('#c8955e') : hexRgb('#a8743f')); put(cx + 12, baseY + 1 - k * 2, hexRgb('#e3b580')); }
      rect(cx - 17, baseY + 1, 5, 1, hexRgb('#8f5f34')); put(cx - 17, baseY + 2, hexRgb('#5e3f2a')); put(cx - 13, baseY + 2, hexRgb('#5e3f2a'));
    } else if (object.type === 'library') {
      groundShadow(cx, baseY, 10, 6);
      const top = walls(cx, baseY, 10, 12 + level * 3, 'columns', { wall: hexRgb('#efe9dd'), door: true });
      roof(cx, top, 10, 'dome', biome.accent);
    } else if (object.type === 'tower') {
      groundShadow(cx, baseY, 6, 12);
      const top = walls(cx, baseY, 6, 26 + level * 6, 'stone', { wall: hexRgb('#e8e2d8') });
      for (let x = -6; x < 6; x += 1) {
        const bottom = x < 0 ? top + Math.floor((x + 6) / 2) : top + 3 - Math.floor(x / 2);
        for (let y = bottom - 5; y < bottom - 1; y += 1) put(cx + x, y, (x + 6) % 3 === 0 ? hexRgb('#3a3a4a') : [255, 230, 150]);
      }
      light(cx, top - 3, '#ffe08a', 12, .4);
      const tip = roof(cx, top - 5, 6, 'cone', roofColor);
      for (let y = 0; y < 14; y += 1) put(cx, tip - y, hexRgb('#c8ccd8'));
      for (let x = -2; x <= 2; x += 1) put(cx + x, tip - 6, hexRgb('#9aa0b0'));
      rect(cx - 1, tip - 16, 3, 2, [255, 77, 94]);
      light(cx, tip - 15, '#ff4d5e', 10, .5);
    } else if (object.type === 'windmill') {
      groundShadow(cx, baseY, 8, 10);
      const top = walls(cx, baseY, 8, 22 + level * 4, 'plaster', { wall: hexRgb('#efe6d4'), door: true });
      const tip = roof(cx, top, 8, 'cone', hexRgb('#8a5a3c'));
      const hubX = cx - 2, hubY = top - 4;
      anim({ type: 'windmill', z: i + j + 1, x: hubX, y: hubY, phase: hash2(seed, i, j) * Math.PI, speed: .5 + hash2(seed, j, i) * .4 });
      rect(hubX - 1, hubY - 1, 3, 3, hexRgb('#3a2c22'));
      void tip;
    } else {
      groundShadow(cx, baseY, 10, 6);
      const material = hash2(seed, i, j) < .5 ? 'timber' : 'plaster';
      const top = walls(cx, baseY, 10, 12 + level * 3, material, { door: true });
      roof(cx, top, 10, 'hip', roofColor, { chimney: hash2(seed, j, i) < .6 });
    }
  }

  function tree(object, cx, baseY) {
    const x = cx + (object.dx || 0), y = baseY + (object.dy || 0);
    const big = object.scale;
    const leaves = biome.leaves;
    for (let dx = -4; dx <= 6; dx += 1) for (let dy = -1; dy <= 2; dy += 1) if (Math.abs(dx - 1) / 5.5 + Math.abs(dy) / 2.2 < 1) shadow(x + dx, y + dy, .25);
    if (biome.trees === 'pine') {
      const tiers = 3 + (big > .6 ? 1 : 0);
      for (let t = 0; t < 2; t += 1) put(x, y - t, hexRgb('#5a3f2c'));
      for (let tier = 0; tier < tiers; tier += 1) {
        const tierBottom = y - 2 - tier * 4;
        const halfWidth = 5 - tier;
        for (let row = 0; row < 6; row += 1) {
          const w = Math.round(halfWidth * (row + 1) / 6);
          for (let dx = -w; dx <= w; dx += 1) {
            let c = dx < 0 ? leaves[2] : dx === 0 ? leaves[1] : leaves[0];
            if (row === 5) c = tone(c, -.25);
            if (recipe.snow && row < 2) c = [240, 246, 255];
            put(x + dx, tierBottom - 5 + row, c);
          }
        }
      }
      return;
    }
    if (biome.trees === 'crystal') {
      const shards = [[0, 12 + Math.round(big * 6), 2], [-3, 7 + Math.round(big * 3), 1], [3, 8, 1]];
      shards.forEach(([offset, tall, w]) => {
        for (let k = 0; k < tall; k += 1) {
          const narrow = k > tall - 3 ? 0 : w;
          for (let dx = -narrow; dx <= narrow; dx += 1) put(x + offset + dx, y - k, dx < 0 ? leaves[3] : dx === 0 ? leaves[2] : leaves[1]);
        }
        put(x + offset, y - tall, [255, 255, 255]);
      });
      if (big > .5) light(x, y - 8, `rgb(${leaves[2].join(',')})`, 9, .22);
      return;
    }
    // Round canopy trees: oak, autumn, blossom.
    for (let t = 0; t < 5; t += 1) { put(x, y - t, hexRgb('#6b4a32')); put(x + 1, y - t, hexRgb('#4e3424')); }
    const radius = 4 + Math.round(big * 2);
    const blobs = [[0, -radius - 4, radius], [-3, -radius - 1, radius - 1], [3, -radius - 2, radius - 1]];
    for (let dy = -radius * 2 - 6; dy <= 0; dy += 1) for (let dx = -radius - 4; dx <= radius + 4; dx += 1) {
      let inside = false, best = 0;
      blobs.forEach(([bx, by, r]) => {
        const d = Math.hypot(dx - bx, dy - by) / r;
        if (d <= 1) { inside = true; best = Math.max(best, 1 - d); }
      });
      if (!inside) continue;
      const lightSide = -(dx + dy * 1.2) / (radius * 2) + .1;
      let c = lightSide > .55 ? leaves[3] : lightSide > .15 ? leaves[2] : lightSide > -.25 ? leaves[1] : leaves[0];
      if (best < .12) c = tone(leaves[0], -.25);
      if (hash2(seed, x + dx, y + dy) > .9) c = tone(c, .15);
      if (recipe.snow && dy < -radius * 1.4 && lightSide > 0) c = [240, 246, 255];
      put(x + dx, y + dy - 3, c);
    }
    if (biome.trees === 'blossom' || biome.trees === 'autumn') {
      for (let k = 0; k < 4; k += 1) put(x - 4 + Math.floor(hash2(seed, x, k) * 10), y + Math.floor(hash2(seed, k, y) * 3) - 1, leaves[2]);
    }
  }

  function drawRelic(name, x, y, rarity, scale = 3, id = null) {
    const sprite = RELIC_SPRITES[name];
    const w = sprite.rows[0].length * scale, h = sprite.rows.length * scale;
    const left = Math.round(x - w / 2), top = Math.round(y - h + scale);
    if (id) relicBoxes.push({ id, x: left, y: top, w, h });
    for (let dy = -2; dy <= 3; dy += 1) for (let dx = -w / 2 - 2; dx <= w / 2 + 2; dx += 1) if (Math.abs(dx) / (w / 2 + 2) + Math.abs(dy) / 3.5 < 1) shadow(x + dx + 2, y + dy, .3);
    paintSprite(name, (px, py, colour) => { for (let a = 0; a < scale; a += 1) for (let b = 0; b < scale; b += 1) put(left + px * scale + a, top + py * scale + b, colour); });
    light(x, y - h / 2, RARITY[rarity].color, 18, rarity === 'legendary' ? .5 : rarity === 'epic' ? .4 : .28);
    anim({ type: 'sparkle', x, y: y - h / 2, w, h, colour: hexRgb(RARITY[rarity].color), count: RARITY_ORDER[rarity] <= 1 ? 4 : 2 });
  }

  function decor(object, cx, baseY) {
    const x = cx + (object.dx || 0), y = baseY + (object.dy || 0);
    if (object.kind === 'relic') { drawRelic(object.sprite, x, y + 2, object.rarity, 3, object.id); return; }
    if (object.kind === 'fountain') {
      for (let dy = -3; dy <= 3; dy += 1) for (let dx = -8; dx <= 8; dx += 1) {
        const d = Math.abs(dx) / 8.5 + Math.abs(dy) / 3.6;
        if (d < 1) put(x + dx, y + dy, d > .72 ? (dy > 0 ? hexRgb('#8f8790') : hexRgb('#c9c1c8')) : d > .55 ? hexRgb('#45addb') : [111, 203, 234]);
      }
      for (let k = 0; k < 7; k += 1) { put(x, y - k, k < 4 ? hexRgb('#b7aeb6') : [190, 240, 255]); put(x - 1, y - k, k < 4 ? hexRgb('#d6cfd5') : [230, 250, 255]); }
      put(x - 2, y - 6, [200, 244, 255]); put(x + 1, y - 6, [200, 244, 255]); put(x - 3, y - 4, [170, 230, 250]); put(x + 2, y - 4, [170, 230, 250]);
      light(x, y - 3, '#7de7ef', 10, .3);
      return;
    }
    if (object.kind === 'rock') {
      for (let dx = -3; dx <= 3; dx += 1) for (let dy = -3; dy <= 0; dy += 1) {
        if (Math.abs(dx) / 3.5 + Math.abs(dy + 1) / 2.6 < 1) put(x + dx, y + dy, dx + dy < -1 ? hexRgb('#c9c1c8') : dx > 1 || dy === 0 ? hexRgb('#7d7480') : hexRgb('#a49ba6'));
      }
    } else if (object.kind === 'bush') {
      for (let dx = -3; dx <= 3; dx += 1) for (let dy = -4; dy <= 0; dy += 1) {
        if (Math.hypot(dx, (dy + 2) * 1.3) < 3.4) put(x + dx, y + dy, dx + dy < -2 ? biome.leaves[3] : dx + dy > 1 ? biome.leaves[0] : biome.leaves[1]);
      }
      if (biome.flowers && hash2(seed, x, y) > .5) put(x, y - 3, pickFrom(biome.flowers, hash2(seed, y, x)));
    } else if (object.kind === 'lantern') {
      for (let k = 0; k < 4; k += 1) put(x, y - k, hexRgb('#4a3a30'));
      rect(x - 1, y - 6, 3, 2, [255, 214, 110]);
      put(x, y - 7, hexRgb('#4a3a30'));
      light(x, y - 5, '#ffcf6a', 8, .32);
    }
  }

  paintRoot();
  for (let sum = 0; sum <= (size - 1) * 2; sum += 1) {
    for (let i = Math.max(0, sum - size + 1); i <= Math.min(size - 1, sum); i += 1) {
      const j = sum - i;
      if (!land[i][j]) continue;
      surface.z = sum + 1;
      const { cx, base } = column(i, j);
      objects[i][j].forEach((object) => {
        if (object.kind === 'building') building(object, cx, base, i, j);
        else if (object.kind === 'tree') tree(object, cx, base);
        else decor(object, cx, base);
      });
    }
  }
  bedrockMotif();

  surface.z = 4000;
  // 5. Waterfalls spill past the floating rock and dissolve into mist.
  falls.forEach(({ i, j, side }, index) => {
    const cx = originX + (i - j) * TILE_W + (side === 'right' ? TILE_W / 2 : -TILE_W / 2);
    const lipY = originY + (i + j) * TILE_H - height[i][j] * LEVEL + TILE_H * 2 - 2;
    const fallK = clamp(Math.round(cx - originX - landLeft + TILE_W), 0, span - 1);
    const endY = lipY + height[i][j] * LEVEL + undersideDepth[i][j] + Math.min(drops[fallK] * .6, 150) + 30 + hash2(seed, index, 77) * 40;
    // A sheet of water: lit on the left, shaded on the right, with long vertical streaks that fray into spray.
    for (let y = lipY; y < endY; y += 1) {
      const fade = (y - lipY) / (endY - lipY);
      const spread = 3 + fade * 4.5;
      const sway = Math.sin(y / 11 + index) * fade * 1.5;
      for (let x = -Math.ceil(spread); x <= Math.ceil(spread); x += 1) {
        const across = (x - sway) / spread;
        if (Math.abs(across) > 1) continue;
        const streak = valueNoise(seed + index * 7, x * 1.9, y / 7);
        let c = across < -.35 ? WATER[3] : across < .2 ? WATER[2] : across < .7 ? WATER[1] : WATER[0];
        if (streak > .68) c = [244, 253, 255];
        else if (streak < .22) c = tone(c, -.12);
        const edge = Math.abs(across) > .8 ? .55 : 1;
        const alpha = (fade > .62 ? Math.max(0, (1 - fade) / .38) : 1) * edge * (fade > .62 && hash2(seed, x + y, index) > (1 - fade) * 1.6 ? .35 : 1);
        put(cx + x + sway, y, c, alpha);
      }
    }
    for (let x = -5; x <= 5; x += 1) { put(cx + x, lipY, [240, 253, 255]); put(cx + x, lipY + 1, [200, 242, 255]); }
    for (let puff = 0; puff < 16; puff += 1) {
      const radius = 2 + hash2(seed, puff, index) * 4;
      const px = cx + (hash2(seed, puff, 3) - .5) * 26, py = endY - 10 - hash2(seed, puff, 4) * 26;
      for (let dy = -radius; dy <= radius; dy += 1) for (let dx = -radius; dx <= radius; dx += 1) if (dx * dx + dy * dy <= radius * radius) put(px + dx, py + dy, [222, 246, 255], .12);
    }
    light(cx, lipY + 6, '#7de7ef', 14, .4);
    anim({ type: 'falls', x: cx, y0: lipY, y1: endY, phase: index * 1.7 });
  });

  // Airships circle islands where the agent sent out subagents; fireflies drift over recent ones.
  const centreX = originX, centreTop = originY + (size - 1) * TILE_H - peakLevel * LEVEL;
  const crewCalls = project.tools?.crew || 0;
  const ships = crewCalls ? clamp(Math.round(Math.log10(crewCalls + 1)), 1, 3) : 0;
  for (let ship = 0; ship < ships; ship += 1) {
    anim({ type: 'airship', x: centreX, y: centreTop - 40 - ship * 18, rx: size * TILE_W * (.75 + ship * .12), ry: size * TILE_H * .55, phase: hash2(seed, ship, 61) * Math.PI * 2, speed: .07 + ship * .02, color: crewColors[ship % crewColors.length] || hexRgb('#e0784a') });
  }
  if (recipe.days !== null && recipe.days < 30) anim({ type: 'fireflies', x: centreX, y: centreTop + size * TILE_H * .6, rx: size * TILE_W * .7, ry: size * TILE_H * .6, count: clamp(Math.round(size * 1.2), 6, 30) });

  function floatingRelics() { floating.forEach((entry) => {
    const wx = originX + landLeft - 46, wy = originY + size * TILE_H * .2;
    paintSprite('whale', (px, py, colour) => { for (let a = 0; a < 3; a += 1) for (let b = 0; b < 3; b += 1) put(wx + px * 3 + a, wy + py * 3 + b, colour); });
    relicBoxes.push({ id: entry.relic.id, x: wx, y: wy, w: 14 * 3, h: 9 * 3 });
    light(wx + 14, wy + 8, RARITY[entry.relic.rarity].color, 18, .3);
  }); }

  // Loose chunks of rock drift beside the island, and a few small stones orbit its root.
  const debris = clamp(2 + Math.round(workScale(project) - 5), 2, 6);
  const orbitY = frontGround[Math.round(span / 2)] + Math.round(rootDepth * .3);
  let orbitReach = 0;
  for (let k = 0; k < span; k += 1) if (frontGround[k] + drops[k] > orbitY) orbitReach = Math.max(orbitReach, Math.abs(landLeft - TILE_W + k - rootMid));
  anim({ type: 'orbit', x: originX + rootMid, y: originY + orbitY, rx: orbitReach + 10, ry: Math.max(6, orbitReach * .18), stones: 3 + Math.floor(hash2(seed, 8, 97) * 3), phase: hash2(seed, 9, 98) * Math.PI * 2, colours: [rocks[0], rocks[2], rocks[4]] });
  for (let chunk = 0; chunk < debris; chunk += 1) {
    const side = chunk % 2 ? 1 : -1;
    const half = 4 + Math.round(hash2(seed, chunk, 91) * 6);
    const cx = Math.round(originX + (side > 0 ? landRight : landLeft) + side * (8 + hash2(seed, chunk, 92) * 22));
    const top = Math.round(originY + size * TILE_H * (.75 + hash2(seed, chunk, 93) * .6) + 10);
    const depthPx = half * 2 + Math.round(hash2(seed, chunk, 94) * 10);
    for (let x = -half; x < half; x += 1) {
      const left = x < 0;
      const edge = left ? top + Math.floor((x + half) / 2) + Math.floor(half / 2) : top + half - 1 - Math.floor(x / 2);
      const taper = Math.round(depthPx * (1 - Math.abs(x + .5) / half) + 2);
      for (let y = edge; y < edge + taper; y += 1) {
        const rock = y - edge < 2 ? biome.grass[left ? 1 : 0] : y - edge < 4 ? biome.dirt[left ? 0 : 1] : rocks[clamp(Math.floor((y - edge) / 5) + (left ? 0 : 1), 0, 5)];
        put(cx + x, y, rock);
      }
    }
    for (let row = 0; row < half; row += 1) {
      const w = row < half / 2 ? (row + 1) * 2 : (half - row) * 2;
      for (let x = -w; x < w; x += 1) put(cx + x, top + row, grassColor(cx + x, top + row, .05));
    }
    if (hash2(seed, chunk, 95) > .5) tree({ dx: 0, dy: 0, scale: .2 }, cx, top + Math.floor(half / 2));
  }
  floatingRelics();

  // 6. Outline the silhouette, crop, and build a soft half-resolution light layer.
  const { data } = surface;
  const opaque = new Uint8Array(width * canvasHeight);
  for (let index = 0; index < opaque.length; index += 1) opaque[index] = data[index * 4 + 3] > 200 ? 1 : 0;
  for (let y = 1; y < canvasHeight - 1; y += 1) for (let x = 1; x < width - 1; x += 1) {
    const index = y * width + x;
    if (opaque[index]) continue;
    if (opaque[index - 1] || opaque[index + 1] || opaque[index - width] || opaque[index + width]) put(x, y, OUTLINE, .92);
  }
  let minX = width, minY = canvasHeight, maxX = 0, maxY = 0;
  for (let y = 0; y < canvasHeight; y += 1) for (let x = 0; x < width; x += 1) {
    if (data[(y * width + x) * 4 + 3] > 8) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  const pad = 20;
  minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad); maxX = Math.min(width - 1, maxX + pad); maxY = Math.min(canvasHeight - 1, maxY + pad);
  const full = document.createElement('canvas');
  full.width = width; full.height = canvasHeight;
  full.getContext('2d').putImageData(new ImageData(data, width, canvasHeight), 0, 0);
  const art = document.createElement('canvas');
  art.width = maxX - minX + 1; art.height = maxY - minY + 1;
  art.getContext('2d').drawImage(full, -minX, -minY);
  const depthMap = new Uint16Array(art.width * art.height);
  for (let y = 0; y < art.height; y += 1) depthMap.set(surface.depth.subarray((y + minY) * width + minX, (y + minY) * width + minX + art.width), y * art.width);
  // Light is summed at half resolution, then posterized into a few hard alpha bands, so every glow is a
  // stack of pixel rings rather than a blur.
  const glow = document.createElement('canvas');
  const glowWidth = Math.ceil(art.width / 2), glowHeight = Math.ceil(art.height / 2);
  glow.width = glowWidth; glow.height = glowHeight;
  const sum = new Float32Array(glowWidth * glowHeight * 3);
  lights.forEach(({ x, y, color, radius, strength }) => {
    const rgb = color.startsWith('#') ? hexRgb(color) : color.match(/\d+/g).slice(0, 3).map(Number);
    const gx = (x - minX) / 2, gy = (y - minY) / 2, r = radius / 2 + 1;
    for (let py = Math.max(0, Math.floor(gy - r)); py <= Math.min(glowHeight - 1, Math.ceil(gy + r)); py += 1) {
      for (let px = Math.max(0, Math.floor(gx - r)); px <= Math.min(glowWidth - 1, Math.ceil(gx + r)); px += 1) {
        const falloff = 1 - Math.hypot(px + .5 - gx, py + .5 - gy) / r;
        if (falloff <= 0) continue;
        const index = (py * glowWidth + px) * 3, amount = strength * falloff;
        sum[index] += rgb[0] * amount; sum[index + 1] += rgb[1] * amount; sum[index + 2] += rgb[2] * amount;
      }
    }
  });
  const glowImage = new ImageData(glowWidth, glowHeight);
  for (let index = 0, out = 0; index < sum.length; index += 3, out += 4) {
    const peak = Math.max(sum[index], sum[index + 1], sum[index + 2]);
    const band = Math.min(1, Math.round(peak / 255 / GLOW_BAND) * GLOW_BAND);
    if (band <= 0) continue;
    glowImage.data[out] = sum[index] / peak * 255; glowImage.data[out + 1] = sum[index + 1] / peak * 255; glowImage.data[out + 2] = sum[index + 2] / peak * 255;
    glowImage.data[out + 3] = band * 255;
  }
  glow.getContext('2d').putImageData(glowImage, 0, 0);
  const centreY = originY + (size - 1) * TILE_H + TILE_H - minY;
  relicBoxes.forEach((box) => { box.x -= minX; box.y -= minY; });
  anims.forEach((entry) => { entry.x -= minX; if (entry.y !== undefined) entry.y -= minY; if (entry.y0 !== undefined) { entry.y0 -= minY; entry.y1 -= minY; } });
  const half = pixelDownsample(art);
  return { art, glow, anims, relicBoxes, depth: depthMap, mips: [art, half, pixelDownsample(half)], anchorX: originX - minX, anchorY: centreY, root: rootDepth, recipe, gridWidth: size * TILE_W * 2, falls: falls.length, buildings: placed.length, heights: height };
}

// Halve a pixel-art canvas without inventing colours: each 2x2 block keeps its most common opaque
// colour (ties go to the darker one, so outlines survive). Soft effects such as mist are averaged.
function pixelDownsample(source) {
  const width = source.width, height = source.height;
  const input = source.getContext('2d').getImageData(0, 0, width, height).data;
  const outWidth = Math.ceil(width / 2), outHeight = Math.ceil(height / 2);
  const output = new ImageData(outWidth, outHeight);
  const out = output.data;
  const colours = [0, 0, 0, 0], counts = [0, 0, 0, 0], lumas = [0, 0, 0, 0];
  for (let y = 0; y < outHeight; y += 1) for (let x = 0; x < outWidth; x += 1) {
    let distinct = 0, opaque = 0, soft = 0, sr = 0, sg = 0, sb = 0, sa = 0;
    for (let dy = 0; dy < 2; dy += 1) for (let dx = 0; dx < 2; dx += 1) {
      const sx = x * 2 + dx, sy = y * 2 + dy;
      if (sx >= width || sy >= height) continue;
      const index = (sy * width + sx) * 4;
      const alpha = input[index + 3];
      if (alpha > 200) {
        opaque += 1;
        const packed = (input[index] << 16) | (input[index + 1] << 8) | input[index + 2];
        let slot = 0;
        while (slot < distinct && colours[slot] !== packed) slot += 1;
        if (slot === distinct) { colours[slot] = packed; counts[slot] = 0; lumas[slot] = input[index] * .3 + input[index + 1] * .59 + input[index + 2] * .11; distinct += 1; }
        counts[slot] += 1;
      } else if (alpha > 0) {
        soft += 1; sr += input[index] * alpha; sg += input[index + 1] * alpha; sb += input[index + 2] * alpha; sa += alpha;
      }
    }
    const target = (y * outWidth + x) * 4;
    if (opaque >= 2 || (opaque === 1 && soft === 0 && distinct && lumas[0] < 60)) {
      let best = 0;
      for (let slot = 1; slot < distinct; slot += 1) if (counts[slot] > counts[best] || (counts[slot] === counts[best] && lumas[slot] < lumas[best])) best = slot;
      out[target] = colours[best] >> 16; out[target + 1] = (colours[best] >> 8) & 255; out[target + 2] = colours[best] & 255; out[target + 3] = 255;
    } else if (soft) {
      out[target] = sr / sa; out[target + 1] = sg / sa; out[target + 2] = sb / sa; out[target + 3] = sa / 4;
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = outWidth; canvas.height = outHeight;
  canvas.getContext('2d').putImageData(output, 0, 0);
  return canvas;
}

// Draws the island art at `scale` canvas pixels per art pixel. It always starts from the mip level that
// needs enlarging (never shrinking) and enlarges it nearest-neighbour, so pixels stay hard-edged at any size.
function drawIslandArtCrisp(context, art, left, top, scale, options = {}) {
  const level = scale >= 1 ? 0 : scale >= .5 ? 1 : 2;
  const haze = options.haze || 0;
  const source = haze ? hazedMip(art, haze, level) : art.mips[level];
  const step = scale * (1 << level);
  const x = Math.round(left), y = Math.round(top);
  context.imageSmoothingEnabled = step < .98;
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, x, y, Math.round(source.width * step), Math.round(source.height * step));
  if (options.glow !== false) {
    // Lights glow less under a day sky; the glow's pixels stay snapped to the art's grid.
    context.globalCompositeOperation = 'lighter';
    context.globalAlpha = (1 - haze * 1.4) * skyNow().glow;
    context.imageSmoothingEnabled = scale * 2 < 1;
    if (context.globalAlpha > 0) context.drawImage(art.glow, x, y, Math.round(art.glow.width * 2 * scale), Math.round(art.glow.height * 2 * scale));
    context.globalAlpha = 1;
    context.globalCompositeOperation = 'source-over';
  }
  return { x, y };
}

// Distant islands sink into the air: their colours drift toward the sky's haze and lose contrast.
function hazedMip(art, haze, level) {
  // Only the mip level actually on screen is hazed, and haze comes in a few fixed steps, so this stays small.
  art.hazed = art.hazed || new Map();
  const HAZE_COLOUR = skyNow().haze;
  const key = `${skyNow().name}|${haze.toFixed(2)}|${level}`;
  if (!art.hazed.has(key)) {
    const mip = art.mips[level];
    const canvas = document.createElement('canvas');
    canvas.width = mip.width; canvas.height = mip.height;
    const context = canvas.getContext('2d');
    context.drawImage(mip, 0, 0);
    const image = context.getImageData(0, 0, mip.width, mip.height);
    const data = image.data;
    for (let index = 0; index < data.length; index += 4) {
      if (!data[index + 3]) continue;
      for (let channel = 0; channel < 3; channel += 1) data[index + channel] += (HAZE_COLOUR[channel] - data[index + channel]) * haze;
    }
    context.putImageData(image, 0, 0);
    art.hazed.set(key, canvas);
  }
  return art.hazed.get(key);
}

// Living details drawn on top of the static art every frame: water, smoke, sails, flags, ships.
function drawIslandAnimations(context, art, left, top, px, time = 0, seedValue = 1) {
  const t = time / 1000, lit = skyNow().glow;
  const cell = (x, y, w, h, color, alpha = 1) => {
    context.globalAlpha = alpha;
    context.fillStyle = Array.isArray(color) ? `rgb(${color[0] | 0},${color[1] | 0},${color[2] | 0})` : color;
    const x0 = Math.round(left + Math.round(x) * px), y0 = Math.round(top + Math.round(y) * px);
    context.fillRect(x0, y0, Math.max(1, Math.round(Math.max(1, w) * px)), Math.max(1, Math.round(Math.max(1, h) * px)));
  };
  art.anims.forEach((entry) => {
    if (entry.type === 'falls') {
      // Bright streaks sliding down the sheet.
      for (let lane = -2; lane <= 2; lane += 1) {
        for (let y = entry.y0 + 3; y < entry.y1 - 8; y += 1) {
          const fade = (y - entry.y0) / (entry.y1 - entry.y0);
          const run = ((y - t * 46 - lane * 17 + entry.phase * 30) % 34 + 34) % 34;
          if (run < 6) cell(entry.x + lane * 1.6 * (1 + fade), y, 1, 1, [248, 254, 255], (.7 - run * .1) * (1 - fade));
        }
      }
      for (let k = 0; k < 4; k += 1) {
        const angle = t * 1.8 + k * 1.6 + entry.phase;
        cell(entry.x + Math.cos(angle) * 9, entry.y1 - 12 + Math.sin(angle * 1.3) * 5, 2, 2, [222, 246, 255], .35);
      }
    } else if (entry.type === 'sparkle') {
      for (let k = 0; k < entry.count; k += 1) {
        const phase = (t * .7 + k / entry.count + (entry.x % 7) / 7) % 1;
        const sx = entry.x + Math.sin(k * 2.4 + entry.x) * entry.w * .55, sy = entry.y - phase * entry.h * .9 + entry.h * .3;
        const a = Math.sin(phase * Math.PI);
        cell(sx, sy, 1, 1, [255, 255, 255], a);
        cell(sx - 1, sy, 1, 1, entry.colour, a * .6); cell(sx + 1, sy, 1, 1, entry.colour, a * .6);
        cell(sx, sy - 1, 1, 1, entry.colour, a * .6); cell(sx, sy + 1, 1, 1, entry.colour, a * .6);
      }
    } else if (entry.type === 'smoke') {
      // Opaque two-tone puffs that swell as they rise and shrink away, never fading through alpha.
      for (let puff = 0; puff < entry.puffs; puff += 1) {
        const life = ((t * .35 + entry.phase + puff / entry.puffs) % 1);
        const radius = Math.round(.6 + Math.sin(life * Math.PI) * (1.6 + life * 2.2));
        if (radius < 1) continue;
        const x = Math.round(entry.x + Math.sin(life * 5 + entry.phase * 6) * 2.5 + life * 5), y = Math.round(entry.y - life * 26);
        for (let dy = -radius; dy <= radius; dy += 1) {
          const w = Math.round(Math.sqrt(Math.max(0, radius * radius - dy * dy + radius * .5)));
          const split = clamp(-dy, -w, w + 1);
          if (split > -w) cell(x - w, y + dy, split + w, 1, [236, 240, 250]);
          if (split <= w) cell(x + split, y + dy, w - split + 1, 1, [170, 178, 204]);
        }
      }
    } else if (entry.type === 'orbit') {
      // Loose stones circling the root; on the far side they pass behind the rock.
      const covered = (x, y) => x >= 0 && y >= 0 && x < art.art.width && y < art.art.height && art.depth[y * art.art.width + x] > 0;
      for (let k = 0; k < entry.stones; k += 1) {
        const angle = entry.phase + k / entry.stones * Math.PI * 2 + t * (.14 + k * .02);
        const x = Math.round(entry.x + Math.cos(angle) * entry.rx * (1 - k * .07)), y = Math.round(entry.y + Math.sin(angle) * entry.ry + (k - 1) * 7 + Math.sin(t * .8 + k) * 1.5);
        const behind = Math.sin(angle) < 0, r = 2 + (k * 7 % 3);
        for (let dy = -r - 1; dy <= r + 1; dy += 1) for (let dx = -r - 2; dx <= r + 2; dx += 1) {
          const v = Math.abs(dx) / (r + 1.5) + Math.abs(dy) / (r + .7);
          if (v > 1 || (behind && covered(x + dx, y + dy))) continue;
          cell(x + dx, y + dy, 1, 1, v > .74 ? OUTLINE : dx + dy < -1 ? entry.colours[0] : dx + dy > 0 ? entry.colours[2] : entry.colours[1]);
        }
      }
    } else if (entry.type === 'windmill') {
      const angle0 = entry.phase + t * entry.speed * Math.PI;
      const hidden = (x, y) => {
        const ax = Math.round(x), ay = Math.round(y);
        if (ax < 0 || ay < 0 || ax >= art.art.width || ay >= art.art.height) return false;
        return art.depth[ay * art.art.width + ax] > entry.z;
      };
      for (let blade = 0; blade < 4; blade += 1) {
        const angle = angle0 + blade * Math.PI / 2;
        const along = [Math.cos(angle), Math.sin(angle) * .8], across = [-Math.sin(angle), Math.cos(angle) * .8];
        for (let r = 1; r < 22; r += 1) {
          const x = entry.x + along[0] * r, y = entry.y + along[1] * r;
          if (!hidden(x, y)) cell(x, y, 1, 1, '#5e3f2a');
        }
        for (let r = 6; r < 22; r += 1) for (let w = 1; w < 6; w += 1) {
          const lattice = r % 4 === 0 || w === 5;
          const x = entry.x + along[0] * r + across[0] * w, y = entry.y + along[1] * r + across[1] * w;
          if (!hidden(x, y)) cell(x, y, 1, 1, lattice ? '#7a5a44' : blade % 2 ? '#ece4d4' : '#faf5e8');
        }
      }
      cell(entry.x - 1, entry.y - 1, 3, 3, '#3a2c22');
    } else if (entry.type === 'flag') {
      for (let x = 0; x < entry.length; x += 1) {
        const wave = Math.round(Math.sin(x * .7 - t * 5 + entry.x) * 1.2 * (x / entry.length + .3));
        for (let y = 0; y < 5; y += 1) cell(entry.x + x, entry.y + y + wave, 1, 1, tone(entry.color, y < 2 ? .2 : y > 3 ? -.25 : 0));
      }
    } else if (entry.type === 'pennant') {
      for (let x = 0; x < entry.length; x += 1) {
        const wave = Math.round(Math.sin(x * .6 - t * 4 + entry.x) * 1.3 * (x / entry.length + .2));
        const half = Math.max(0, Math.round(3.4 * (1 - x / entry.length)));
        cell(entry.x + x, entry.y + 3 - half + wave, 1, half + 1, tone(entry.color, .22));
        cell(entry.x + x, entry.y + 4 + wave, 1, half + 1, tone(entry.color, x < 2 ? -.1 : -.28));
      }
    } else if (entry.type === 'beacon') {
      const pulse = (.55 + Math.sin(t * 3 + entry.x) * .35) * (.5 + lit * .5);
      cell(entry.x - 1, entry.y - 1, 3, 3, entry.color || [255, 236, 160], pulse);
    } else if (entry.type === 'beam') {
      const angle = t * 1.2;
      const reach = 70;
      const dx = Math.cos(angle), dy = Math.sin(angle) * .45;
      if (dx !== 0) {
        context.globalAlpha = (.16 + Math.abs(Math.cos(angle)) * .14) * lit;
        const gradient = context.createLinearGradient(left + entry.x * px, top + entry.y * px, left + (entry.x + dx * reach) * px, top + (entry.y + dy * reach) * px);
        gradient.addColorStop(0, 'rgba(255,240,180,.9)'); gradient.addColorStop(1, 'rgba(255,240,180,0)');
        context.fillStyle = gradient;
        context.beginPath();
        context.moveTo(left + entry.x * px, top + entry.y * px);
        context.lineTo(left + (entry.x + dx * reach - dy * 10) * px, top + (entry.y + dy * reach + dx * 6) * px);
        context.lineTo(left + (entry.x + dx * reach + dy * 10) * px, top + (entry.y + dy * reach - dx * 6) * px);
        context.closePath();
        context.fill();
      }
    } else if (entry.type === 'balloon') {
      const y = entry.y + Math.sin(t * .9 + entry.x) * 4;
      for (let dy = -7; dy <= 7; dy += 1) {
        const w = Math.round(Math.sqrt(Math.max(0, 49 - dy * dy)) * .8);
        for (let dx = -w; dx <= w; dx += 1) cell(entry.x + dx, y + dy, 1, 1, tone(entry.color, (Math.floor((dx + 8) / 3) % 2 ? .25 : 0) - (dx + dy) / 30));
      }
      cell(entry.x - 3, y + 8, 1, 3, '#5e3f2a'); cell(entry.x + 3, y + 8, 1, 3, '#5e3f2a');
      cell(entry.x - 3, y + 11, 7, 3, '#8a5a3c');
    } else if (entry.type === 'airship') {
      const angle = entry.phase + t * entry.speed * Math.PI * 2;
      const x = entry.x + Math.cos(angle) * entry.rx, y = entry.y + Math.sin(angle) * entry.ry;
      const facing = Math.sin(angle) > 0 ? -1 : 1;
      const behind = Math.sin(angle) < 0;
      const shade = behind ? -.2 : 0;
      for (let dy = -4; dy <= 4; dy += 1) {
        const w = Math.round(Math.sqrt(Math.max(0, 16 - dy * dy)) * 2.4);
        for (let dx = -w; dx <= w; dx += 1) cell(x + dx, y + dy, 1, 1, tone(dy < -1 ? [236, 228, 210] : dy > 2 ? [170, 150, 130] : [214, 202, 182], shade));
      }
      for (let dx = -6; dx <= 6; dx += 1) cell(x + dx, y - 1, 1, 1, tone(entry.color, shade));
      cell(x - 4, y + 5, 8, 3, tone([110, 76, 52], shade));
      cell(x + facing * 11, y - 2 + (Math.floor(t * 12) % 2) * 2, 1, 3, '#d9d1c4');
      cell(x - facing * 10, y - 3, 2, 6, tone(entry.color, shade - .1));
    } else if (entry.type === 'fireflies') {
      for (let k = 0; k < entry.count; k += 1) {
        const a = hash2(seedValue, k, 1) * Math.PI * 2 + t * (.2 + hash2(seedValue, k, 2) * .3);
        const r = hash2(seedValue, k, 3);
        const x = entry.x + Math.cos(a) * entry.rx * r, y = entry.y + Math.sin(a * 1.3) * entry.ry * r - 6;
        const blink = Math.sin(t * 2.5 + k) * .5 + .5;
        if (blink > .3 && lit > .5) cell(x, y, 1, 1, [255, 246, 160], blink);
      }
    }
  });
  context.globalAlpha = 1;
}

function islandArt(project) {
  if (!islandCache.has(project.id)) islandCache.set(project.id, renderIslandArt(project));
  return islandCache.get(project.id);
}
function shadeColor(hex, amount) {
  const value = parseInt(hex.slice(1), 16);
  const channel = (shift) => clamp(Math.round(((value >> shift) & 255) * (1 + amount)), 0, 255);
  return `rgb(${channel(16)},${channel(8)},${channel(0)})`;
}
function hexAlpha(color, alpha) {
  if (color.startsWith('rgb')) return color.replace('rgb(', 'rgba(').replace(')', `,${alpha})`);
  const value = parseInt(color.slice(1), 16);
  return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`;
}
