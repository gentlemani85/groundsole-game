import { TILE_W, TILE_H, MAP_SIZE, CAMP_CENTER } from './config.js';

export class Renderer {
  constructor(ctx, camera) {
    this.ctx = ctx;
    this.cam = camera;
    this.waterPhase = 0;
  }

  render(map, humans, animals, hoveredGrid, selectedHumanId, dtSec, fireIntensity = 100) {
    const ctx = this.ctx;
    this.waterPhase += dtSec * 1.5;

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
          depthItems.push({ type: 'rock', x, y, sortKey: x + y + 0.1 });
        } else if (tile.type === 'shelter') {
          depthItems.push({ type: 'shelter', x, y, sortKey: x + y + 0.15 });
        } else if (tile.type === 'fire') {
          depthItems.push({ type: 'fire', x, y, sortKey: x + y + 0.05 });
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
        this.drawNaturalRock(pos.x, pos.y + (TILE_H / 2) * this.cam.zoom);
      } else if (item.type === 'shelter') {
        const pos = this.cam.gridToScreen(item.x, item.y);
        this.drawPrimitiveShelter(pos.x, pos.y + (TILE_H / 2) * this.cam.zoom);
      } else if (item.type === 'fire') {
        const pos = this.cam.gridToScreen(item.x, item.y);
        this.drawCampfire(item.x, item.y, pos.x, pos.y + (TILE_H / 2) * this.cam.zoom, fireIntensity);
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

  drawGround(tile, gx, gy) {
    const ctx = this.ctx;
    const zoom = this.cam.zoom;
    const pos = this.cam.gridToScreen(gx, gy);

    const tw = TILE_W * zoom;
    const th = TILE_H * zoom;
    const cx = pos.x;
    const cy = pos.y + th / 2;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.lineTo(pos.x + tw / 2, cy);
    ctx.lineTo(pos.x, pos.y + th);
    ctx.lineTo(pos.x - tw / 2, cy);
    ctx.closePath();

    let fillColor;
    if (tile.type === 'grass') {
      const factor = Math.min(1, Math.max(0, tile.npk / 100));
      const r = Math.round(124 - factor * 86);
      const g = Math.round(142 - factor * 64);
      const b = Math.round(86 - factor * 56);
      fillColor = `rgb(${r}, ${g}, ${b})`;
    } else if (tile.type === 'water') {
      const shimmer = Math.sin(this.waterPhase + gx * 0.8 + gy * 0.5) * 8;
      fillColor = `rgb(${34 + shimmer}, ${105 + shimmer}, ${136 + shimmer})`;
    } else if (tile.type === 'path') {
      fillColor = '#8a7452';
    } else if (tile.type === 'fire') {
      fillColor = '#3c362d';
    } else if (tile.type === 'rock') {
      fillColor = '#5f6977';
    } else if (tile.type === 'shelter') {
      fillColor = '#4a3d2e';
    }

    ctx.fillStyle = fillColor;
    ctx.fill();

    // Hauchzarte, organische Kachelkante
    ctx.strokeStyle = (tile.type === 'water') ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.06)';
    ctx.lineWidth = 0.8 * zoom;
    ctx.stroke();

    // 3D-Kachelsockel nach unten
    const depth = 5 * zoom;
    ctx.beginPath();
    ctx.moveTo(pos.x - tw / 2, cy);
    ctx.lineTo(pos.x, pos.y + th);
    ctx.lineTo(pos.x, pos.y + th + depth);
    ctx.lineTo(pos.x - tw / 2, cy + depth);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y + th);
    ctx.lineTo(pos.x + tw / 2, cy);
    ctx.lineTo(pos.x + tw / 2, cy + depth);
    ctx.lineTo(pos.x, pos.y + th + depth);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fill();

    // Wasserwellen
    if (tile.type === 'water') {
      this.drawWaterWaves(cx, cy);
    }

    // Blumen
    if (tile.type === 'grass' && tile.flowerDots && tile.flowerDots.length > 0 && !tile.plant && !tile.poop) {
      this.drawNaturalFlowers(cx, cy, tile.flowerDots);
    }

    // Kot
    if (tile.poop) {
      this.drawOrganicPoop(cx, cy);
    }

    ctx.restore();
  }

  drawWaterWaves(cx, cy) {
    const ctx = this.ctx;
    const zoom = this.cam.zoom;
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = 1 * zoom;

    const waveOff = Math.sin(this.waterPhase + cx * 0.05) * 3 * zoom;
    ctx.beginPath();
    ctx.moveTo(cx - 8 * zoom, cy - 2 * zoom + waveOff);
    ctx.quadraticCurveTo(cx, cy - 4 * zoom + waveOff, cx + 8 * zoom, cy - 2 * zoom + waveOff);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx - 5 * zoom, cy + 3 * zoom - waveOff);
    ctx.quadraticCurveTo(cx, cy + 1 * zoom - waveOff, cx + 6 * zoom, cy + 3 * zoom - waveOff);
    ctx.stroke();
    ctx.restore();
  }

  drawNaturalFlowers(cx, cy, dots) {
    const ctx = this.ctx;
    const zoom = this.cam.zoom;
    for (const d of dots) {
      const fx = cx + d.dx * zoom;
      const fy = cy + d.dy * zoom;
      ctx.fillStyle = '#3f6212';
      ctx.fillRect(fx, fy, 0.8 * zoom, 1.8 * zoom);
      ctx.fillStyle = d.color;
      ctx.beginPath();
      ctx.arc(fx, fy - 1 * zoom, d.size * zoom, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawOrganicPoop(cx, cy) {
    const ctx = this.ctx;
    const zoom = this.cam.zoom;
    ctx.save();
    ctx.fillStyle = '#38220f';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 1 * zoom, 3.5 * zoom, 2 * zoom, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#633c1a';
    ctx.beginPath();
    ctx.arc(cx - 0.5 * zoom, cy - 1 * zoom, 1.8 * zoom, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawOrganicBush(cx, cy, plant) {
    const ctx = this.ctx;
    const zoom = this.cam.zoom;
    const s = plant.stage;

    ctx.save();
    const baseR = (3.2 + s * 2.8) * zoom;

    ctx.beginPath();
    ctx.ellipse(cx, cy + 2 * zoom, baseR * 1.2, baseR * 0.55, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fill();

    const foliageDark = '#1f3e17';
    const foliageMid = '#2d5521';
    const foliageLight = '#427532';

    ctx.fillStyle = foliageDark;
    ctx.beginPath();
    ctx.arc(cx - 2 * zoom, cy - baseR + 2 * zoom, baseR * 0.85, 0, Math.PI * 2);
    ctx.arc(cx + 2.5 * zoom, cy - baseR + 1 * zoom, baseR * 0.85, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = foliageMid;
    ctx.beginPath();
    ctx.arc(cx, cy - baseR - 1 * zoom, baseR * 0.75, 0, Math.PI * 2);
    ctx.arc(cx - 3 * zoom, cy - baseR - 3 * zoom, baseR * 0.55, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = foliageLight;
    ctx.beginPath();
    ctx.arc(cx - 1 * zoom, cy - baseR - 4 * zoom, baseR * 0.45, 0, Math.PI * 2);
    ctx.fill();

    if (plant.berries > 0 && s >= 2) {
      ctx.fillStyle = '#dc2626';
      const berryR = 1.6 * zoom;

      ctx.beginPath();
      if (plant.berries >= 1) ctx.arc(cx - 3 * zoom, cy - baseR + 1 * zoom, berryR, 0, Math.PI * 2);
      if (plant.berries >= 2) ctx.arc(cx + 3 * zoom, cy - baseR - 2 * zoom, berryR, 0, Math.PI * 2);
      if (plant.berries >= 3) ctx.arc(cx, cy - baseR - 6 * zoom, berryR, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#fca5a5';
      ctx.beginPath();
      if (plant.berries >= 1) ctx.arc(cx - 3.4 * zoom, cy - baseR + 0.6 * zoom, 0.5 * zoom, 0, Math.PI * 2);
      if (plant.berries >= 2) ctx.arc(cx + 2.6 * zoom, cy - baseR - 2.4 * zoom, 0.5 * zoom, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  drawOrganicTree(cx, cy, plant) {
    const ctx = this.ctx;
    const zoom = this.cam.zoom;
    const s = plant.stage;

    ctx.save();
    const trunkH = (8 + s * 9) * zoom;
    const trunkW = (2 + s * 1.5) * zoom;
    const crownR = (5.5 + s * 5.5) * zoom;

    ctx.beginPath();
    ctx.ellipse(cx + 2 * zoom, cy + 2 * zoom, crownR * 1.15, crownR * 0.5, -0.2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fill();

    ctx.fillStyle = '#422815';
    ctx.beginPath();
    ctx.moveTo(cx - trunkW, cy);
    ctx.lineTo(cx - trunkW * 0.6, cy - trunkH + 4 * zoom);
    ctx.lineTo(cx - crownR * 0.5, cy - trunkH);
    ctx.lineTo(cx - crownR * 0.3, cy - trunkH + 2 * zoom);
    ctx.lineTo(cx + trunkW * 0.5, cy - trunkH + 5 * zoom);
    ctx.lineTo(cx + crownR * 0.4, cy - trunkH + 1 * zoom);
    ctx.lineTo(cx + trunkW * 0.6, cy - trunkH + 8 * zoom);
    ctx.lineTo(cx + trunkW, cy);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#261408';
    ctx.lineWidth = 0.8 * zoom;
    ctx.stroke();

    const crownY = cy - trunkH - crownR * 0.4;

    ctx.fillStyle = '#142e0f';
    ctx.beginPath();
    ctx.arc(cx - crownR * 0.4, crownY + crownR * 0.2, crownR * 0.65, 0, Math.PI * 2);
    ctx.arc(cx + crownR * 0.4, crownY + crownR * 0.2, crownR * 0.7, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#1e4417';
    ctx.beginPath();
    ctx.arc(cx, crownY, crownR * 0.85, 0, Math.PI * 2);
    ctx.arc(cx - crownR * 0.35, crownY - crownR * 0.25, crownR * 0.6, 0, Math.PI * 2);
    ctx.arc(cx + crownR * 0.3, crownY - crownR * 0.2, crownR * 0.65, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#316725';
    ctx.beginPath();
    ctx.arc(cx - crownR * 0.3, crownY - crownR * 0.45, crownR * 0.45, 0, Math.PI * 2);
    ctx.arc(cx + crownR * 0.1, crownY - crownR * 0.4, crownR * 0.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // Stark verbesserte, plastische Naturfels-Grafik (Mehrschichtige Facetten, Moos)
  drawNaturalRock(cx, cy) {
    const ctx = this.ctx;
    const zoom = this.cam.zoom;
    ctx.save();

    // 1. Tiefenschatten
    ctx.beginPath();
    ctx.ellipse(cx, cy + 3 * zoom, 11 * zoom, 5 * zoom, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.fill();

    // 2. Dunkle Schattenkante hinten
    ctx.fillStyle = '#2d333b';
    ctx.beginPath();
    ctx.moveTo(cx - 9 * zoom, cy + 2 * zoom);
    ctx.lineTo(cx - 6 * zoom, cy - 8 * zoom);
    ctx.lineTo(cx + 2 * zoom, cy - 10 * zoom);
    ctx.lineTo(cx + 9 * zoom, cy - 4 * zoom);
    ctx.lineTo(cx + 8 * zoom, cy + 3 * zoom);
    ctx.closePath();
    ctx.fill();

    // 3. Mittlere Felsfront
    ctx.fillStyle = '#485260';
    ctx.beginPath();
    ctx.moveTo(cx - 9 * zoom, cy + 2 * zoom);
    ctx.lineTo(cx - 2 * zoom, cy - 7 * zoom);
    ctx.lineTo(cx + 4 * zoom, cy - 2 * zoom);
    ctx.lineTo(cx - 1 * zoom, cy + 3 * zoom);
    ctx.closePath();
    ctx.fill();

    // 4. Helle Lichtfläche oben
    ctx.fillStyle = '#738094';
    ctx.beginPath();
    ctx.moveTo(cx - 6 * zoom, cy - 8 * zoom);
    ctx.lineTo(cx + 2 * zoom, cy - 10 * zoom);
    ctx.lineTo(cx + 8 * zoom, cy - 5 * zoom);
    ctx.lineTo(cx + 2 * zoom, cy - 4 * zoom);
    ctx.lineTo(cx - 2 * zoom, cy - 7 * zoom);
    ctx.closePath();
    ctx.fill();

    // 5. Feiner Moosansatz am Felsfuß
    ctx.fillStyle = '#3f6212';
    ctx.beginPath();
    ctx.arc(cx - 7 * zoom, cy + 1 * zoom, 2 * zoom, 0, Math.PI * 2);
    ctx.arc(cx + 6 * zoom, cy + 2 * zoom, 2.2 * zoom, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // Stark verbesserte, plastische Urzeit-Hütte (Authentisches Ast-/Fellzelt mit Tiefe)
  drawPrimitiveShelter(cx, cy) {
    const ctx = this.ctx;
    const zoom = this.cam.zoom;
    ctx.save();

    // Weicher Schatten
    ctx.beginPath();
    ctx.ellipse(cx, cy + 3 * zoom, 16 * zoom, 8 * zoom, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.fill();

    // Steinfundament (mehrere unregelmäßige Findlinge)
    ctx.fillStyle = '#525c6a';
    const stones = [-7, -4.5, -2, 1, 3.5, 6.5];
    for (const sx of stones) {
      ctx.beginPath();
      ctx.arc(cx + sx * 2 * zoom, cy + 3 * zoom, 2.4 * zoom, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#38404a';
      ctx.lineWidth = 0.8 * zoom;
      ctx.stroke();
    }

    // Dunkler Hütteneingang / Innenraum
    ctx.fillStyle = '#18120c';
    ctx.beginPath();
    ctx.moveTo(cx - 4 * zoom, cy + 2 * zoom);
    ctx.lineTo(cx, cy - 11 * zoom);
    ctx.lineTo(cx + 4 * zoom, cy + 2 * zoom);
    ctx.closePath();
    ctx.fill();

    // Linke Zeltwand (Felle & Rinde im Schatten)
    ctx.fillStyle = '#5c3a21';
    ctx.beginPath();
    ctx.moveTo(cx - 12 * zoom, cy + 2 * zoom);
    ctx.lineTo(cx, cy - 18 * zoom);
    ctx.lineTo(cx - 3 * zoom, cy + 2 * zoom);
    ctx.closePath();
    ctx.fill();

    // Rechte Zeltwand (Sonnenseite: Hellere Rinde / Schilf)
    ctx.fillStyle = '#8a5829';
    ctx.beginPath();
    ctx.moveTo(cx + 3 * zoom, cy + 2 * zoom);
    ctx.lineTo(cx, cy - 18 * zoom);
    ctx.lineTo(cx + 12 * zoom, cy + 2 * zoom);
    ctx.closePath();
    ctx.fill();

    // Überstehende Hauptstämme (Tipi / Lean-to Spitze)
    ctx.strokeStyle = '#3b2211';
    ctx.lineWidth = 2.2 * zoom;
    ctx.beginPath();
    ctx.moveTo(cx - 13 * zoom, cy + 3 * zoom);
    ctx.lineTo(cx + 2 * zoom, cy - 21 * zoom);
    ctx.moveTo(cx + 13 * zoom, cy + 3 * zoom);
    ctx.lineTo(cx - 2 * zoom, cy - 21 * zoom);
    ctx.stroke();

    ctx.restore();
  }

  drawCampfire(gx, gy, cx, cy, fireIntensity = 100) {
    const ctx = this.ctx;
    const zoom = this.cam.zoom;
    ctx.save();

    // Glühen skaliert mit der Feuer-Intensität
    const isLit = fireIntensity > 5;
    const glowRad = (10 + (fireIntensity / 100) * 26) * zoom;
    const glowAlpha = isLit ? (0.1 + (fireIntensity / 100) * 0.4) : 0;

    if (isLit) {
      const glow = ctx.createRadialGradient(cx, cy, 2 * zoom, cx, cy, glowRad);
      glow.addColorStop(0, `rgba(251, 146, 60, ${glowAlpha})`);
      glow.addColorStop(1, 'rgba(251, 146, 60, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, glowRad, 0, Math.PI * 2);
      ctx.fill();
    }

    // Verkohlte Holzscheite / Asche
    ctx.strokeStyle = isLit ? '#381602' : '#27272a';
    ctx.lineWidth = 2.5 * zoom;
    ctx.beginPath();
    ctx.moveTo(cx - 5 * zoom, cy + 2 * zoom);
    ctx.lineTo(cx + 5 * zoom, cy - 2 * zoom);
    ctx.moveTo(cx - 4 * zoom, cy - 2 * zoom);
    ctx.lineTo(cx + 4 * zoom, cy + 2 * zoom);
    ctx.stroke();

    if (isLit) {
      // Flackernde Flamme (Größe hängt von Intensität ab)
      const flameScale = (fireIntensity / 100);
      const flicker = (Math.sin(Date.now() * 0.01 + gx * 2 + gy) * 2) * zoom;
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.arc(cx, cy - 4 * zoom - flicker, 3.8 * flameScale * zoom, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(cx, cy - 3 * zoom - flicker, 2 * flameScale * zoom, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Kalte Asche & Rauchfaden
      ctx.fillStyle = '#52525b';
      ctx.beginPath();
      ctx.arc(cx, cy - 1 * zoom, 2 * zoom, 0, Math.PI * 2);
      ctx.fill();
    }

    if (gx === CAMP_CENTER.x && gy === CAMP_CENTER.y) {
      ctx.fillStyle = '#854d0e';
      ctx.fillRect(cx + 8 * zoom, cy - 4 * zoom, 6 * zoom, 5 * zoom);
    }
    ctx.restore();
  }

  drawAnimal(a) {
    const ctx = this.ctx;
    const zoom = this.cam.zoom;
    const pos = this.cam.gridToScreen(a.x, a.y);
    const cx = pos.x;
    const cy = pos.y + (TILE_H / 2) * zoom;

    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy + 2 * zoom, 6.5 * zoom, 3 * zoom, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fill();

    let hop = (a.state === 'fleeing') ? Math.abs(Math.sin(Date.now() * 0.02)) * 4 * zoom : 0;
    const bodyY = cy - 6 * zoom - hop;

    ctx.fillStyle = '#92400e';
    ctx.beginPath();
    ctx.ellipse(cx, bodyY, 6 * zoom, 3.5 * zoom, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(cx + 3 * zoom, bodyY);
    ctx.lineTo(cx + 7 * zoom, bodyY - 6 * zoom);
    ctx.lineTo(cx + 4 * zoom, bodyY - 6 * zoom);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx + 6.5 * zoom, bodyY - 6.5 * zoom, 2.2 * zoom, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#451a03';
    ctx.lineWidth = 1.2 * zoom;
    ctx.beginPath();
    ctx.moveTo(cx + 6 * zoom, bodyY - 8 * zoom);
    ctx.lineTo(cx + 5 * zoom, bodyY - 12 * zoom);
    ctx.moveTo(cx + 7 * zoom, bodyY - 8 * zoom);
    ctx.lineTo(cx + 9 * zoom, bodyY - 12 * zoom);
    ctx.stroke();

    ctx.restore();
  }

  drawHuman(h, selectedHumanId) {
    const ctx = this.ctx;
    const zoom = this.cam.zoom;
    const pos = this.cam.gridToScreen(h.x, h.y);
    const cx = pos.x;
    const cy = pos.y + (TILE_H / 2) * zoom;

    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy + 2 * zoom, (h.ageYears < 10 ? 3.5 : 5.8) * zoom, (h.ageYears < 10 ? 2 : 2.8) * zoom, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fill();

    if (h.id === selectedHumanId) {
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.8 * zoom;
      ctx.beginPath();
      ctx.ellipse(cx, cy + 2 * zoom, 9.5 * zoom, 4.8 * zoom, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    let bobbing = 0;
    if (h.state === 'moving') {
      bobbing = Math.abs(Math.sin(Date.now() * 0.012)) * 2.8 * zoom;
    }

    const scale = (h.ageYears < 10) ? 0.65 : (h.ageYears > 50 ? 0.9 : 1.0);
    const bodyY = cy - (6 * scale) * zoom - bobbing;

    if (!h.isAlive) {
      ctx.fillStyle = '#64748b';
      ctx.fillRect(cx - 5 * zoom, cy - 2 * zoom, 10 * zoom, 4 * zoom);
      ctx.font = `${10 * zoom}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('🪦', cx, cy - 4 * zoom);
      ctx.restore();
      return;
    }

    ctx.fillStyle = h.tint;
    ctx.beginPath();
    ctx.arc(cx, bodyY, 4.5 * scale * zoom, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(cx - 3.5 * scale * zoom, bodyY, 7 * scale * zoom, 7 * scale * zoom);

    ctx.fillStyle = (h.ageYears > 50) ? '#cbd5e1' : '#fed7aa';
    ctx.beginPath();
    ctx.arc(cx, bodyY - 6 * scale * zoom, 3.2 * scale * zoom, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = (h.ageYears > 50) ? '#94a3b8' : '#3c2415';
    ctx.beginPath();
    ctx.arc(cx, bodyY - 7.5 * scale * zoom, 2.6 * scale * zoom, Math.PI, Math.PI * 2);
    ctx.fill();

    if (h.carried) {
      ctx.font = `${10 * zoom}px sans-serif`;
      ctx.textAlign = 'center';
      let cIcon = '📦';
      if (h.carried.includes('Stein')) cIcon = '🪨';
      else if (h.carried.includes('Holz')) cIcon = '🪵';
      else if (h.carried.includes('Wasser')) cIcon = '💧';
      else if (h.carried.includes('Beeren')) cIcon = '🍇';
      else if (h.carried.includes('Wildbret')) cIcon = '🥩';
      ctx.fillText(cIcon, cx + 6 * zoom, bodyY);
    }

    let icon = '';
    if (h.state === 'relieving') icon = '💨';
    else if (h.state === 'drinking') icon = '💧';
    else if (h.state === 'foraging') icon = '🍇';
    else if (h.state === 'mining') icon = '⛏️';
    else if (h.state === 'chopping') icon = '🪓';
    else if (h.state === 'hunting') icon = '🏹';
    else if (h.state === 'building') icon = '🔨';
    else if (h.state === 'resting') icon = '🔥';
    else if (h.state === 'mating') icon = '❤️';
    else if (h.pregnancyTimer > 0) icon = '🤰';

    if (icon) {
      ctx.font = `${Math.max(10, 11 * zoom)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(icon, cx, bodyY - 14 * zoom);
    }

    ctx.restore();
  }

  drawHoverCursor(gx, gy) {
    const ctx = this.ctx;
    const zoom = this.cam.zoom;
    const pos = this.cam.gridToScreen(gx, gy);
    const tw = TILE_W * zoom;
    const th = TILE_H * zoom;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.lineTo(pos.x + tw / 2, pos.y + th / 2);
    ctx.lineTo(pos.x, pos.y + th);
    ctx.lineTo(pos.x - tw / 2, pos.y + th / 2);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.6 * zoom;
    ctx.stroke();
    ctx.restore();
  }
}
