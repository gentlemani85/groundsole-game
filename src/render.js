import { TILE_W, TILE_H, MAP_SIZE, CAMP_CENTER } from './config.js';
import { environmentRenderMethods } from './render/environment.js';
import { animalRenderMethods } from './render/animals.js';
import { humanRenderMethods } from './render/humans.js';

export class Renderer {
  constructor(ctx, camera) {
    this.ctx = ctx;
    this.cam = camera;
    this.waterPhase = 0;
  }

  render(map, humans, animals, hoveredGrid, selectedHumanId, dtSec, fireIntensity = 100) {
    const ctx = this.ctx;
    this.waterPhase += dtSec * 1.5;
    this.biomeId = map.biomeId || 'river_valley';

    ctx.clearRect(0, 0, this.cam.canvas.width, this.cam.canvas.height);

    // ========================================================
    // ECHTE ISOMETRISCHE TIEFEN-SORTIERUNG (OCCLUSION / VERDECKUNG):
    // Kachelböden werden zuerst flach gezeichnet.
    // Aber stehende Objekte (Bäume, Sträucher, Felsen, Hütten, Feuer,
    // Menschen und Tiere) werden GEMEINSAM nach ihrer y+x Tiefe
    // von HINTEN nach VORNE gerendert!
    // Dadurch verdeckt ein Baum oder Strauch davorstehende Figuren!
    // ========================================================

    // 1. Alle Kachelböden (Bodenflächen)
    for (let y = 0; y < MAP_SIZE; y++) {
      for (let x = 0; x < MAP_SIZE; x++) {
        this.drawGround(map[y][x], x, y);
      }
    }

    // 2. Hover-Cursor
    if (hoveredGrid.x >= 0 && hoveredGrid.x < MAP_SIZE && hoveredGrid.y >= 0 && hoveredGrid.y < MAP_SIZE) {
      this.drawHoverCursor(hoveredGrid.x, hoveredGrid.y);
    }

    // 3. Tiefen-Objektliste zusammenstellen
    const depthItems = [];

    // Feste Objekte auf Kacheln
    for (let y = 0; y < MAP_SIZE; y++) {
      for (let x = 0; x < MAP_SIZE; x++) {
        const tile = map[y][x];
        if (tile.type === 'rock') {
          depthItems.push({
            type: 'rock',
            x,
            y,
            stoneStock: tile.stoneStock,
            maxStoneStock: tile.maxStoneStock,
            sortKey: x + y + 0.1
          });
        } else if (tile.type === 'shelter') {
          depthItems.push({ type: 'shelter', x, y, shelter: tile.shelter, sortKey: x + y + 0.15 });
        } else if (tile.type === 'fire') {
          depthItems.push({ type: 'fire', x, y, fire: tile.fire, sortKey: x + y + 0.05 });
        }
        if (tile.plant) {
          depthItems.push({ type: 'plant', x, y, plant: tile.plant, sortKey: x + y + 0.2 });
        }
      }
    }

    // Lebewesen (Menschen & Tiere)
    for (const h of humans) {
      depthItems.push({ type: 'human', entity: h, sortKey: h.x + h.y });
    }
    for (const a of animals) {
      if (a.isAlive) {
        depthItems.push({ type: 'animal', entity: a, sortKey: a.x + a.y });
      }
    }

    // Sortieren von hinten nach vorne
    depthItems.sort((a, b) => a.sortKey - b.sortKey);

    // 4. Zeichnen in exakter Tiefenreihenfolge
    for (const item of depthItems) {
      if (item.type === 'rock') {
        const pos = this.cam.gridToScreen(item.x, item.y);
        this.drawNaturalRock(pos.x, pos.y + (TILE_H / 2) * this.cam.zoom, item.x, item.y, item.stoneStock, item.maxStoneStock);
      } else if (item.type === 'shelter') {
        const pos = this.cam.gridToScreen(item.x, item.y);
        this.drawPrimitiveShelter(pos.x, pos.y + (TILE_H / 2) * this.cam.zoom, item.shelter);
      } else if (item.type === 'fire') {
        const pos = this.cam.gridToScreen(item.x, item.y);
        // Dezentrale Feuer: Jede Kachel nutzt ihre individuelle Intensität!
        const localIntensity = (item.fire && typeof item.fire.intensity === 'number')
          ? item.fire.intensity
          : (item.x === CAMP_CENTER.x && item.y === CAMP_CENTER.y ? fireIntensity : 100);
        this.drawCampfire(item.x, item.y, pos.x, pos.y + (TILE_H / 2) * this.cam.zoom, localIntensity);
      } else if (item.type === 'plant') {
        const pos = this.cam.gridToScreen(item.x, item.y);
        const cy = pos.y + (TILE_H / 2) * this.cam.zoom;
        if (item.plant.type === 'bush') {
          this.drawOrganicBush(pos.x, cy, item.plant);
        } else if (item.plant.type === 'tree') {
          this.drawOrganicTree(pos.x, cy, item.plant);
        }
      } else if (item.type === 'human') {
        this.drawHuman(item.entity, selectedHumanId);
      } else if (item.type === 'animal') {
        this.drawAnimal(item.entity);
      }
    }
  }
}

Object.assign(
  Renderer.prototype,
  environmentRenderMethods,
  animalRenderMethods,
  humanRenderMethods
);
