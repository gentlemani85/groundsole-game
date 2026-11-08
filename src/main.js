import { MAP_SIZE, campfireStock, CAMP_CENTER, fireState, START_YEAR, SECONDS_PER_YEAR, seasonState, advanceSeasonClock } from './config.js';
import { Camera } from './isometric.js';
import { createMap, updateEcology } from './map.js';
import { Renderer } from './render.js';
import { createInitialHumans, maybeSpawnForeignWanderer } from './human.js';
import { maybeSpawnWildAnimal, updateSpookTimer } from './wildlife.js';
import { migrationState, computeEcologicalPressure, startMigration, updateMigration } from './migration.js';

// Setup DOM
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const container = document.getElementById('viewport-container');
const eventTicker = document.getElementById('event-ticker');
const inspectorBox = document.getElementById('inspector-box');
const biomeBadgeEl = document.getElementById('biome-badge');

// Migration & Ökologie DOM-Elemente
const pressureValEl = document.getElementById('pressure-val');
const pressureFillEl = document.getElementById('pressure-fill');
const pressureDescEl = document.getElementById('pressure-desc');
const btnMigrateEl = document.getElementById('btn-migrate');
const migrationBannerEl = document.getElementById('migration-banner');

// Weltzeit & Demographie DOM-Elemente
const worldYearEl = document.getElementById('world-year');
const elapsedYearsEl = document.getElementById('elapsed-years');
const simSeasonEl = document.getElementById('sim-season');
const demoCountEl = document.getElementById('demo-count');
const demoCountSubEl = document.getElementById('demo-count-sub');
const demoGenderEl = document.getElementById('demo-gender');
const demoGenderSubEl = document.getElementById('demo-gender-sub');
const demoAgeEl = document.getElementById('demo-age');
const demoAgeSubEl = document.getElementById('demo-age-sub');

const stockStoneEl = document.getElementById('stock-stone');
const stockWoodEl = document.getElementById('stock-wood');
const stockFoodEl = document.getElementById('stock-food');
const stockWaterEl = document.getElementById('stock-water');
const stockFireEl = document.getElementById('stock-fire');

function logEvent(msg) {
  eventTicker.innerText = msg;
}

// State
const camera = new Camera(canvas);
const renderer = new Renderer(ctx, camera);
let map = createMap();
const humans = createInitialHumans();
const animals = [];

let elapsedYears = 0;
let historicalDeathsCount = 0;
let simSpeed = 1;
let activeTool = 'inspect';
let selectedHumanId = null;
let hoveredGrid = { x: -1, y: -1 };

function resizeCanvas() {
  canvas.width = container.clientWidth;
  canvas.height = container.clientHeight;
  ctx.imageSmoothingEnabled = true;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Kamera zentriert auf das neue Stammeszentrum (12, 12)
const centerPos = camera.gridToScreen(CAMP_CENTER.x, CAMP_CENTER.y);
camera.x = canvas.width / 2 - (centerPos.x - camera.x);
camera.y = canvas.height / 2 - (centerPos.y - camera.y);

function getStatusLabel(h) {
  if (!h.isAlive) return 'verstorben';
  if (h.ageYears < 4) return 'bei Mutter (Tragling)';
  const healthSuffix = h.injuredTimer > 0 ? ' (verletzt 🩸)' : (h.sickTimer > 0 ? ' (krank 🤒)' : '');
  if (h.state === 'socializing') {
    return (h.actionIntent === 'sit_campfire' ? 'am Feuer 🔥' : 'plaudert 🗣️') + healthSuffix;
  }
  if (h.state === 'playing') return 'spielt ⭐' + healthSuffix;
  if (h.state === 'resting') return (h.actionIntent === 'rest_shelter' ? 'in Hütte ⛺' : 'ruht') + healthSuffix;
  if (h.state === 'moving') {
    if (h.actionIntent === 'hunt_animal') return 'auf Hetzjagd 🏹' + healthSuffix;
    if (h.actionIntent === 'sit_campfire') return 'geht zum Feuer' + healthSuffix;
    if (h.actionIntent === 'play') return 'tollt umher' + healthSuffix;
    return 'unterwegs' + healthSuffix;
  }
  return h.state + healthSuffix;
}

// UI
function renderOrUpdateCards(humanList) {
  const existingCards = inspectorBox.querySelectorAll('.human-card');
  const existingIds = Array.from(existingCards).map(c => parseInt(c.dataset.humanId, 10));
  const currentIds = humanList.map(h => h.id);

  // Struktureller Neuaufbau nur, wenn Personen hinzukommen oder wegfallen
  const needsRebuild = existingIds.length !== currentIds.length ||
    !currentIds.every((id, idx) => existingIds[idx] === id);

  if (needsRebuild) {
    let html = '';
    for (const h of humanList) {
      const isSel = (h.id === selectedHumanId);
      const ageInt = Math.floor(h.ageYears);
      const statusLabel = getStatusLabel(h);

      html += `
        <div id="human-card-${h.id}" data-human-id="${h.id}" class="human-card ${isSel ? 'selected' : ''} ${!h.isAlive ? 'dead' : ''}" onclick="selectHuman(${h.id}, true)">
          <div class="human-header">
            <span class="card-name-title">${h.name} (${ageInt} J., ${h.gender === 'm' ? '♂' : '♀'})</span>
            <span class="human-role">${h.role}</span>
          </div>
          <div class="card-status-line" style="font-size:0.66rem; color:#9ca3af; margin-bottom:4px;">
            Aktion: <b class="card-action">${statusLabel}</b> | Nutzen: <b class="card-utility">+${h.utilityContributed}</b>
            <div class="card-death-cause" style="color:#f87171; font-size:0.64rem; margin-top:2px; display:${!h.isAlive && h.deathCause ? 'block' : 'none'};">Ursache: ${h.deathCause || ''}</div>
          </div>

          <div class="card-bars-container" style="display: ${h.isAlive ? 'block' : 'none'};">
            <div class="bar-row">
              <div class="bar-label"><span>Wasser</span><span class="val-water">${Math.round(h.needs.water)}%</span></div>
              <div class="bar-bg"><div class="bar-fill fill-water" style="width: ${h.needs.water}%"></div></div>
            </div>

            <div class="bar-row">
              <div class="bar-label"><span>Nahrung</span><span class="val-food">${Math.round(h.needs.food)}%</span></div>
              <div class="bar-bg"><div class="bar-fill fill-hunger" style="width: ${h.needs.food}%"></div></div>
            </div>

            <div class="bar-row">
              <div class="bar-label"><span>Entleerungsdruck</span><span class="val-bladder">${Math.round(h.needs.bladder)}%</span></div>
              <div class="bar-bg"><div class="bar-fill fill-bladder" style="width: ${h.needs.bladder}%"></div></div>
            </div>

            <div class="bar-row">
              <div class="bar-label"><span>Energie</span><span class="val-energy">${Math.round(h.needs.energy)}%</span></div>
              <div class="bar-bg"><div class="bar-fill fill-energy" style="width: ${h.needs.energy}%"></div></div>
            </div>

            <div class="bar-row">
              <div class="bar-label"><span>Paarungstrieb</span><span class="val-libido">${Math.round(h.needs.libido)}%</span></div>
              <div class="bar-bg"><div class="bar-fill fill-libido" style="width: ${h.needs.libido}%"></div></div>
            </div>

            <div class="bar-row">
              <div class="bar-label"><span>Alterung</span><span class="val-age">${ageInt} / ${Math.floor(h.maxAgeYears)} J.</span></div>
              <div class="bar-bg"><div class="bar-fill fill-age" style="width: ${(h.ageYears / h.maxAgeYears) * 100}%"></div></div>
            </div>
          </div>
          <div class="card-dead-msg" style="color:#ef4444; font-size:0.68rem; margin-top:3px; display: ${h.isAlive ? 'none' : 'block'};">Biophysikalisch erloschen.</div>
        </div>
      `;
    }
    inspectorBox.innerHTML = html;
    return;
  }

  // Chirurgische Aktualisierung im existierenden DOM (verhindert Scroll-Abbruch)
  for (const h of humanList) {
    const card = document.getElementById(`human-card-${h.id}`);
    if (!card) continue;

    const isSel = (h.id === selectedHumanId);
    card.classList.toggle('selected', isSel);
    card.classList.toggle('dead', !h.isAlive);

    const ageInt = Math.floor(h.ageYears);
    const titleEl = card.querySelector('.card-name-title');
    if (titleEl) titleEl.innerText = `${h.name} (${ageInt} J., ${h.gender === 'm' ? '♂' : '♀'})`;

    const actionEl = card.querySelector('.card-action');
    if (actionEl) actionEl.innerText = getStatusLabel(h);

    const utilityEl = card.querySelector('.card-utility');
    if (utilityEl) utilityEl.innerText = `+${h.utilityContributed}`;

    const deathEl = card.querySelector('.card-death-cause');
    if (deathEl) {
      if (!h.isAlive && h.deathCause) {
        deathEl.style.display = 'block';
        deathEl.innerText = `Ursache: ${h.deathCause}`;
      } else {
        deathEl.style.display = 'none';
      }
    }

    const barsContainer = card.querySelector('.card-bars-container');
    const deadMsg = card.querySelector('.card-dead-msg');
    if (barsContainer) barsContainer.style.display = h.isAlive ? 'block' : 'none';
    if (deadMsg) deadMsg.style.display = h.isAlive ? 'none' : 'block';

    if (h.isAlive) {
      const wEl = card.querySelector('.val-water');
      if (wEl) wEl.innerText = `${Math.round(h.needs.water)}%`;
      const wBar = card.querySelector('.bar-fill.fill-water');
      if (wBar) wBar.style.width = `${Math.min(100, Math.max(0, h.needs.water))}%`;

      const fEl = card.querySelector('.val-food');
      if (fEl) fEl.innerText = `${Math.round(h.needs.food)}%`;
      const fBar = card.querySelector('.bar-fill.fill-hunger');
      if (fBar) fBar.style.width = `${Math.min(100, Math.max(0, h.needs.food))}%`;

      const bEl = card.querySelector('.val-bladder');
      if (bEl) bEl.innerText = `${Math.round(h.needs.bladder)}%`;
      const bBar = card.querySelector('.bar-fill.fill-bladder');
      if (bBar) bBar.style.width = `${Math.min(100, Math.max(0, h.needs.bladder))}%`;

      const eEl = card.querySelector('.val-energy');
      if (eEl) eEl.innerText = `${Math.round(h.needs.energy)}%`;
      const eBar = card.querySelector('.bar-fill.fill-energy');
      if (eBar) eBar.style.width = `${Math.min(100, Math.max(0, h.needs.energy))}%`;

      const lEl = card.querySelector('.val-libido');
      if (lEl) lEl.innerText = `${Math.round(h.needs.libido)}%`;
      const lBar = card.querySelector('.bar-fill.fill-libido');
      if (lBar) lBar.style.width = `${Math.min(100, Math.max(0, h.needs.libido))}%`;

      const aEl = card.querySelector('.val-age');
      if (aEl) aEl.innerText = `${ageInt} / ${Math.floor(h.maxAgeYears)} J.`;
      const aBar = card.querySelector('.bar-fill.fill-age');
      if (aBar) aBar.style.width = `${Math.min(100, (h.ageYears / h.maxAgeYears) * 100)}%`;
    }
  }
}

function updateUI() {
  stockFireEl.innerText = `${Math.round(fireState.intensity)}%`;
  stockStoneEl.innerText = campfireStock.stone;
  stockWoodEl.innerText = campfireStock.wood;
  stockFoodEl.innerText = campfireStock.food;
  stockWaterEl.innerText = campfireStock.water;

  // 0. Landschaft & Biom
  if (biomeBadgeEl && map && map.biome) {
    biomeBadgeEl.innerText = `${map.biome.icon} ${map.biome.name}`;
  }

  // 1. Weltzeit & Jahreslauf (synchron mit biologischem Alterungstakt)
  const currentYear = Math.floor(START_YEAR + elapsedYears);
  if (worldYearEl) {
    worldYearEl.innerText = `${currentYear.toLocaleString('de-DE')} v. Chr.`;
  }
  if (elapsedYearsEl) {
    elapsedYearsEl.innerText = `Klan-Jahr ${Math.floor(elapsedYears)}`;
  }
  if (simSeasonEl) {
    simSeasonEl.innerText = seasonState.label;
  }

  // 2. Klan-Demographie & Populationsstatistik
  const living = humans.filter(h => h.isAlive);
  const totalLiving = living.length;
  const recentDead = humans.filter(h => !h.isAlive).length;
  const totalDead = historicalDeathsCount + recentDead;

  const males = living.filter(h => h.gender === 'm').length;
  const females = living.filter(h => h.gender === 'f').length;

  let avgAgeStr = '0.0 J.';
  let spanStr = 'Keine';
  if (totalLiving > 0) {
    const ages = living.map(h => h.ageYears);
    const avg = (ages.reduce((a, b) => a + b, 0) / totalLiving).toFixed(1);
    avgAgeStr = `${avg} J.`;
    const minA = Math.floor(Math.min(...ages));
    const maxA = Math.floor(Math.max(...ages));
    spanStr = `Spanne: ${minA}–${maxA} J.`;
  }

  if (demoCountEl) demoCountEl.innerText = totalLiving;
  if (demoCountSubEl) demoCountSubEl.innerText = totalDead > 0 ? `${totalDead} verstorben` : 'Vollzählig';

  if (demoGenderEl) demoGenderEl.innerText = `${males}♂ · ${females}♀`;
  const mPct = totalLiving > 0 ? Math.round((males / totalLiving) * 100) : 0;
  const fPct = totalLiving > 0 ? Math.round((females / totalLiving) * 100) : 0;
  if (demoGenderSubEl) demoGenderSubEl.innerText = `${mPct}% ♂ · ${fPct}% ♀`;

  if (demoAgeEl) demoAgeEl.innerText = avgAgeStr;
  if (demoAgeSubEl) demoAgeSubEl.innerText = spanStr;

  // 3. Hominiden-Karten im Inspektor
  renderOrUpdateCards(humans);

  // 4. Ökologischer Druck & Nomadische Migration
  computeEcologicalPressure(map, humans, animals, campfireStock, fireState);
  const pressure = migrationState.pressure;
  if (pressureValEl) pressureValEl.innerText = `${pressure}%`;
  if (pressureFillEl) pressureFillEl.style.width = `${pressure}%`;
  if (pressureDescEl) {
    if (pressure < 35) pressureDescEl.innerText = 'Zustand: Reichhaltig & fruchtbar 🌱';
    else if (pressure < 65) pressureDescEl.innerText = 'Zustand: Ressourcen schwinden 🍂';
    else if (pressure < 85) pressureDescEl.innerText = 'Zustand: Nahrungsknappheit droht ⚠️';
    else pressureDescEl.innerText = 'Zustand: Überweidet! Not treibt zur Wanderung 🚨';
  }
  if (btnMigrateEl) {
    if (migrationState.isMigrating) {
      btnMigrateEl.innerText = '🚶 Horde auf Wanderschaft...';
      btnMigrateEl.classList.remove('urgent');
      btnMigrateEl.disabled = true;
    } else {
      btnMigrateEl.disabled = false;
      if (pressure >= 75) {
        btnMigrateEl.innerText = '⛺ In neues Land aufbrechen! (Not)';
        btnMigrateEl.classList.add('urgent');
      } else {
        btnMigrateEl.innerText = '⛺ In neues Tal weiterziehen';
        btnMigrateEl.classList.remove('urgent');
      }
    }
  }

  // 5. Großes Ankündigungs-Banner
  if (migrationBannerEl) {
    if (migrationState.announcement) {
      migrationBannerEl.innerText = migrationState.announcement;
      migrationBannerEl.classList.remove('hidden');
    } else {
      migrationBannerEl.classList.add('hidden');
    }
  }
}

// Direkte Hominiden-Selektion mit weichem Scrollsprung in die Sidebar
function selectHuman(id, fromCardClick = false) {
  selectedHumanId = id;
  const h = humans.find(item => item.id === id);
  if (!h) return;

  if (!fromCardClick) {
    logEvent(`👤 ${h.name} (${Math.floor(h.ageYears)} J., ${h.role}) fokussiert.`);
  }

  // Sanftes Scrollen zur Personenkarte & optisches Pulsieren
  const card = document.getElementById(`human-card-${id}`);
  if (card && inspectorBox) {
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    card.classList.remove('flash-highlight');
    void card.offsetWidth; // Force Reflow für restartable CSS Keyframe-Animation
    card.classList.add('flash-highlight');
  }
}
window.selectHuman = selectHuman;

// Präzise Treffererkennung für Hominiden auf dem Canvas (Körper, Kopf, Füße)
function findHumanAtScreen(sx, sy) {
  const sorted = [...humans].sort((a, b) => (b.x + b.y) - (a.x + a.y));
  for (const h of sorted) {
    if (!h.isAlive) continue;
    const pos = camera.gridToScreen(h.x, h.y);
    const cx = pos.x;
    const cy = pos.y + (32 / 2) * camera.zoom;
    const scale = (h.ageYears < 10) ? 0.65 : (h.ageYears > 50 ? 0.9 : 1.0);
    const bodyCenterY = cy - 8 * scale * camera.zoom;

    // Bildschirmabstand zu Torso/Kopf
    const distScreen = Math.hypot(sx - cx, sy - bodyCenterY);
    const hitRadius = Math.max(16, 22 * camera.zoom * scale);
    if (distScreen <= hitRadius) {
      return h;
    }

    // Bodenkachel-Abstand um die Füße
    const grid = camera.screenToGrid(sx, sy);
    if (Math.hypot(h.x - grid.x, h.y - grid.y) < 1.0) {
      return h;
    }
  }
  return null;
}

document.querySelectorAll('.tool-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeTool = btn.dataset.tool;
  });
});

document.querySelectorAll('.speed-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    simSpeed = parseFloat(btn.dataset.speed);
  });
});

if (btnMigrateEl) {
  btnMigrateEl.addEventListener('click', () => {
    startMigration(humans, logEvent);
  });
}

// Kamera-Handling
let isDragging = false;
let downClientX = 0;
let downClientY = 0;
let dragStartX = 0;
let dragStartY = 0;

container.addEventListener('mousedown', (e) => {
  if (e.button === 0) {
    isDragging = true;
    downClientX = e.clientX;
    downClientY = e.clientY;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
  }
});

window.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  if (isDragging) {
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    camera.x += dx;
    camera.y += dy;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
  } else {
    hoveredGrid = camera.screenToGrid(mouseX, mouseY);
    const hHover = findHumanAtScreen(mouseX, mouseY);
    if (hHover) {
      container.style.cursor = 'pointer';
    } else {
      container.style.cursor = 'grab';
    }
  }
});

window.addEventListener('mouseup', (e) => {
  if (isDragging) {
    isDragging = false;
    container.style.cursor = 'grab';
    const movedDist = Math.hypot(e.clientX - downClientX, e.clientY - downClientY);
    if (movedDist < 6) {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      // 1. Priorität: Klick direkt auf einen Humanoiden fokussiert ihn & springt in Sidebar
      const clickedH = findHumanAtScreen(sx, sy);
      if (clickedH) {
        selectHuman(clickedH.id);
        return;
      }

      // 2. Priorität: Kachel-Aktion mit ausgewähltem Werkzeug
      applyToolAtScreen(sx, sy);
    }
  }
});

container.addEventListener('wheel', (e) => {
  e.preventDefault();
  const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
  camera.zoom = Math.min(2.4, Math.max(0.45, camera.zoom * zoomFactor));
}, { passive: false });

function applyToolAtScreen(sx, sy) {
  const grid = camera.screenToGrid(sx, sy);
  if (grid.x >= 0 && grid.x < MAP_SIZE && grid.y >= 0 && grid.y < MAP_SIZE) {
    const tile = map[grid.y][grid.x];

    if (activeTool === 'rock') {
      tile.type = 'rock';
      tile.plant = null;
      tile.trample = 0;
      tile.isDesirePath = false;
      logEvent(`🪨 Felsen platziert.`);
    } else if (activeTool === 'tree') {
      tile.type = 'grass';
      tile.plant = { type: 'tree', stage: 1, growthTimer: 0, woodStock: 3, seedVariance: Math.random(), maxAge: 3600 + Math.random() * 2400, ageTimer: 0 };
      tile.npk = Math.max(tile.npk, 40);
      tile.trample = 0;
      tile.isDesirePath = false;
      tile.flowerDots = [];
      logEvent(`🌳 Baum gepflanzt.`);
    } else if (activeTool === 'bush') {
      tile.type = 'grass';
      tile.plant = { type: 'bush', stage: 1, growthTimer: 0, berries: 0, berryTimer: 0, seedVariance: Math.random(), maxAge: 450, ageTimer: 0 };
      tile.npk = Math.max(tile.npk, 35);
      tile.trample = 0;
      tile.isDesirePath = false;
      tile.flowerDots = [];
      logEvent(`🍇 Beerenstrauch gepflanzt.`);
    } else if (activeTool === 'fire') {
      tile.type = 'fire';
      tile.plant = null;
      tile.trample = 0;
      tile.isDesirePath = false;
      const isCamp = (grid.x === CAMP_CENTER.x && grid.y === CAMP_CENTER.y);
      tile.fire = {
        intensity: 100,
        woodBurnTimer: 0,
        wood: isCamp ? 0 : 4,
        isCampCenter: isCamp
      };
      if (isCamp) fireState.intensity = 100;
      logEvent(`🔥 Autarke Feuerstelle platziert bei [${grid.x}, ${grid.y}].`);
    } else if (activeTool === 'water') {
      tile.type = 'water';
      tile.isFord = false;
      tile.plant = null;
      tile.trample = 0;
      tile.isDesirePath = false;
    } else if (activeTool === 'path') {
      tile.type = 'grass';
      tile.isFord = true;
      tile.plant = null;
      tile.trample = 85;
      tile.isDesirePath = false;
      if (!tile.footprints) tile.footprints = [];
      for (let i = 0; i < 8; i++) {
        tile.footprints.push({
          lx: (Math.random() - 0.5) * 26,
          ly: (Math.random() - 0.5) * 13,
          angle: (Math.random() - 0.5) * Math.PI,
          isLeft: (i % 2 === 0),
          scale: 0.95,
          age: 0,
          maxAge: 90
        });
      }
      if (tile.footprints.length > 20) tile.footprints.splice(0, tile.footprints.length - 20);
    } else if (activeTool === 'grass') {
      tile.type = 'grass';
      tile.npk = 18;
      tile.plant = null;
      tile.trample = 0;
      tile.footprints = [];
      tile.isDesirePath = false;
      tile.flowerDots = [];
      for (let i = 0; i < 2; i++) {
        tile.flowerDots.push({
          dx: (Math.random() - 0.5) * 18,
          dy: (Math.random() - 0.5) * 9,
          color: Math.random() < 0.65 ? '#f5f3e6' : '#dfc15b',
          size: 0.65 + Math.random() * 0.35
        });
      }
    } else if (activeTool === 'shelter') {
      tile.type = 'shelter';
      tile.plant = null;
      tile.trample = 0;
      tile.isDesirePath = false;
      tile.shelter = { condition: 100, capacity: 2 };
      logEvent(`⛺ Schutzhütte platziert bei [${grid.x}, ${grid.y}] (Kapazität: 2).`);
    } else if (activeTool === 'inspect') {
      const hNear = humans.find(h => h.isAlive && Math.hypot(h.x - grid.x, h.y - grid.y) < 1.3);
      if (hNear) {
        selectHuman(hNear.id);
      }
    }
  }
}

// Game Loop
let lastTime = performance.now();

function loop(now) {
  const dtSec = Math.min(0.1, (now - lastTime) / 1000) * simSpeed;
  lastTime = now;

  // 0. Weltzeit-Fortschritt (exakt synchronisiert mit Alterung: SECONDS_PER_YEAR = 1 Jahr)
  if (dtSec > 0) {
    elapsedYears += (dtSec / SECONDS_PER_YEAR);
  }

  // 1. Ökologie & dezentrale Feuer-/Hütten-Thermodynamik
  updateEcology(map, dtSec, logEvent);

  // 1.5 Nomadische Migration & Verlassen des übernutzten Tals
  map = updateMigration(dtSec, map, humans, animals, campfireStock, fireState, (addY) => {
    elapsedYears += addY;
    advanceSeasonClock(addY * SECONDS_PER_YEAR);
  }, logEvent);

  // 2. Wildtier-Spawn & Update (mit Vergrämungs-Abklingzeit & Biom-Fauna)
  updateSpookTimer(dtSec);
  maybeSpawnWildAnimal(animals, humans, logEvent, map);
  for (let i = animals.length - 1; i >= 0; i--) {
    const a = animals[i];
    if (!a.isAlive) {
      animals.splice(i, 1);
    } else {
      a.update(dtSec, map, humans, logEvent);
    }
  }

  // 3. Fremde Wanderer (Genpool / Female Dispersal)
  maybeSpawnForeignWanderer(humans, logEvent, map);

  // 4. Hominiden
  for (let i = humans.length - 1; i >= 0; i--) {
    const h = humans[i];
    h.update(dtSec, map, humans, animals, logEvent);
    // Verstorbene werden 1 Jahr nach ihrem Tod (50s) aus der Liste & Welt entfernt
    if (!h.isAlive && (h.timeSinceDeathYears || 0) >= 1.0) {
      historicalDeathsCount++;
      if (selectedHumanId === h.id) selectedHumanId = null;
      humans.splice(i, 1);
      logEvent(`🌿 Die sterblichen Überreste von ${h.name} sind nach 1 Jahr vergangen und eins mit der Natur geworden.`);
    }
  }

  // 5. Rendern mit Feuer-Intensität
  renderer.render(map, humans, animals, hoveredGrid, selectedHumanId, dtSec, fireState.intensity);

  // 6. UI
  updateUI();

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
