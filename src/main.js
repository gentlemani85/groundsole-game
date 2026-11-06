import { MAP_SIZE, campfireStock, CAMP_CENTER, fireState } from './config.js?v=8';
import { Camera } from './isometric.js?v=8';
import { createMap, updateEcology } from './map.js?v=8';
import { Renderer } from './render.js?v=8';
import { createInitialHumans, maybeSpawnForeignWanderer } from './human.js?v=8';
import { maybeSpawnWildAnimal } from './wildlife.js?v=8';

// Setup DOM
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const container = document.getElementById('viewport-container');
const eventTicker = document.getElementById('event-ticker');
const inspectorBox = document.getElementById('inspector-box');

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
const map = createMap();
const humans = createInitialHumans();
const animals = [];

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

// UI
function updateUI() {
  stockFireEl.innerText = `${Math.round(fireState.intensity)}%`;
  stockStoneEl.innerText = campfireStock.stone;
  stockWoodEl.innerText = campfireStock.wood;
  stockFoodEl.innerText = campfireStock.food;
  stockWaterEl.innerText = campfireStock.water;

  let html = '';
  for (const h of humans) {
    const isSel = (h.id === selectedHumanId);
    const ageInt = Math.floor(h.ageYears);
    const statusLabel = h.isAlive ? h.state : 'verstorben';

    html += `
      <div class="human-card ${isSel ? 'selected' : ''} ${!h.isAlive ? 'dead' : ''}" onclick="selectHuman(${h.id})">
        <div class="human-header">
          <span>${h.name} (${ageInt} J., ${h.gender === 'm' ? '♂' : '♀'})</span>
          <span class="human-role">${h.role}</span>
        </div>
        <div style="font-size:0.66rem; color:#9ca3af; margin-bottom:4px;">
          Aktion: <b>${statusLabel}</b> | Nutzen: <b>+${h.utilityContributed}</b>
          ${!h.isAlive && h.deathCause ? `<div style="color:#f87171; font-size:0.64rem; margin-top:2px;">Ursache: ${h.deathCause}</div>` : ''}
        </div>

        ${h.isAlive ? `
          <div class="bar-row">
            <div class="bar-label"><span>Wasser</span><span>${Math.round(h.needs.water)}%</span></div>
            <div class="bar-bg"><div class="bar-fill fill-water" style="width: ${h.needs.water}%"></div></div>
          </div>

          <div class="bar-row">
            <div class="bar-label"><span>Nahrung</span><span>${Math.round(h.needs.food)}%</span></div>
            <div class="bar-bg"><div class="bar-fill fill-hunger" style="width: ${h.needs.food}%"></div></div>
          </div>

          <div class="bar-row">
            <div class="bar-label"><span>Entleerungsdruck</span><span>${Math.round(h.needs.bladder)}%</span></div>
            <div class="bar-bg"><div class="bar-fill fill-bladder" style="width: ${h.needs.bladder}%"></div></div>
          </div>

          <div class="bar-row">
            <div class="bar-label"><span>Energie</span><span>${Math.round(h.needs.energy)}%</span></div>
            <div class="bar-bg"><div class="bar-fill fill-energy" style="width: ${h.needs.energy}%"></div></div>
          </div>

          <div class="bar-row">
            <div class="bar-label"><span>Paarungstrieb</span><span>${Math.round(h.needs.libido)}%</span></div>
            <div class="bar-bg"><div class="bar-fill fill-libido" style="width: ${h.needs.libido}%"></div></div>
          </div>

          <div class="bar-row">
            <div class="bar-label"><span>Alterung</span><span>${ageInt} / ${Math.floor(h.maxAgeYears)} J.</span></div>
            <div class="bar-bg"><div class="bar-fill fill-age" style="width: ${(h.ageYears / h.maxAgeYears) * 100}%"></div></div>
          </div>
        ` : '<div style="color:#ef4444; font-size:0.68rem; margin-top:3px;">Biophysikalisch erloschen.</div>'}
      </div>
    `;
  }
  inspectorBox.innerHTML = html;
}

window.selectHuman = function(id) {
  selectedHumanId = id;
};

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
  }
});

window.addEventListener('mouseup', (e) => {
  if (isDragging) {
    isDragging = false;
    const movedDist = Math.hypot(e.clientX - downClientX, e.clientY - downClientY);
    if (movedDist < 6) {
      const rect = canvas.getBoundingClientRect();
      applyToolAtScreen(e.clientX - rect.left, e.clientY - rect.top);
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
      logEvent(`🪨 Felsen platziert.`);
    } else if (activeTool === 'tree') {
      tile.type = 'grass';
      tile.plant = { type: 'tree', stage: 1, growthTimer: 0, woodStock: 3, seedVariance: Math.random() };
      tile.npk = Math.max(tile.npk, 40);
    } else if (activeTool === 'bush') {
      tile.type = 'grass';
      tile.plant = { type: 'bush', stage: 1, growthTimer: 0, berries: 0, berryTimer: 0, seedVariance: Math.random() };
      tile.npk = Math.max(tile.npk, 35);
    } else if (activeTool === 'fire') {
      tile.type = 'fire';
      tile.plant = null;
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
    } else if (activeTool === 'path') {
      tile.type = 'path';
      tile.isFord = false;
      tile.plant = null;
    } else if (activeTool === 'grass') {
      tile.type = 'grass';
      tile.npk = 18;
      tile.plant = null;
      tile.flowerDots = [];
      for (let i = 0; i < 4; i++) {
        tile.flowerDots.push({
          dx: (Math.random() - 0.5) * 22,
          dy: (Math.random() - 0.5) * 11,
          color: Math.random() < 0.5 ? '#f43f5e' : '#fbbf24',
          size: 0.9 + Math.random() * 0.8
        });
      }
    } else if (activeTool === 'shelter') {
      tile.type = 'shelter';
      tile.plant = null;
      tile.shelter = { condition: 100, capacity: 2 };
      logEvent(`⛺ Schutzhütte platziert bei [${grid.x}, ${grid.y}] (Kapazität: 2).`);
    } else if (activeTool === 'inspect') {
      for (const h of humans) {
        if (h.isAlive && Math.hypot(h.x - grid.x, h.y - grid.y) < 1.2) {
          selectedHumanId = h.id;
          break;
        }
      }
    }
  }
}

// Game Loop
let lastTime = performance.now();

function loop(now) {
  const dtSec = Math.min(0.1, (now - lastTime) / 1000) * simSpeed;
  lastTime = now;

  // 1. Ökologie & dezentrale Feuer-/Hütten-Thermodynamik
  updateEcology(map, dtSec, logEvent);

  // 2. Wildtier-Spawn & Update
  maybeSpawnWildAnimal(animals, humans, logEvent);
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
  for (const h of humans) {
    h.update(dtSec, map, humans, animals, logEvent);
  }

  // 5. Rendern mit Feuer-Intensität
  renderer.render(map, humans, animals, hoveredGrid, selectedHumanId, dtSec, fireState.intensity);

  // 6. UI
  updateUI();

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
