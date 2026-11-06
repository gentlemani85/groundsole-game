import { TILE_W, TILE_H, MAP_SIZE, CAMP_CENTER } from './config.js?v=7';

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
        this.drawNaturalRock(pos.x, pos.y + (TILE_H / 2) * this.cam.zoom);
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

  // Stark verbesserte, plastische Urzeit-Hütte mit Zustand & Verfall
  drawPrimitiveShelter(cx, cy, shelterData = null) {
    const ctx = this.ctx;
    const zoom = this.cam.zoom;
    const condition = shelterData ? Math.max(0, Math.min(100, shelterData.condition)) : 100;
    const isWeathered = condition < 65;
    const isCritical = condition < 30;

    ctx.save();

    // Weicher Schatten
    ctx.beginPath();
    ctx.ellipse(cx, cy + 3 * zoom, 16 * zoom, 8 * zoom, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.fill();

    // Steinfundament (mehrere unregelmäßige Findlinge)
    ctx.fillStyle = isWeathered ? '#444d59' : '#525c6a';
    const stones = [-7, -4.5, -2, 1, 3.5, 6.5];
    for (const sx of stones) {
      ctx.beginPath();
      ctx.arc(cx + sx * 2 * zoom, cy + 3 * zoom, 2.4 * zoom, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#38404a';
      ctx.lineWidth = 0.8 * zoom;
      ctx.stroke();
    }

    // Dunkler Hütteneingang / Innenraum (mit Betten für max 2)
    ctx.fillStyle = '#18120c';
    ctx.beginPath();
    ctx.moveTo(cx - 4 * zoom, cy + 2 * zoom);
    ctx.lineTo(cx, cy - 11 * zoom);
    ctx.lineTo(cx + 4 * zoom, cy + 2 * zoom);
    ctx.closePath();
    ctx.fill();

    // Linke Zeltwand (Felle & Rinde im Schatten)
    // Bei Verfall wird die Plane fleckig / löchrig
    ctx.fillStyle = isCritical ? '#3b2414' : (isWeathered ? '#482e1a' : '#5c3a21');
    ctx.beginPath();
    ctx.moveTo(cx - 12 * zoom, cy + 2 * zoom);
    ctx.lineTo(cx, cy - 18 * zoom);
    ctx.lineTo(cx - 3 * zoom, cy + 2 * zoom);
    ctx.closePath();
    ctx.fill();

    // Rechte Zeltwand (Sonnenseite: Hellere Rinde / Schilf)
    ctx.fillStyle = isCritical ? '#5a391a' : (isWeathered ? '#714620' : '#8a5829');
    ctx.beginPath();
    ctx.moveTo(cx + 3 * zoom, cy + 2 * zoom);
    ctx.lineTo(cx, cy - 18 * zoom);
    ctx.lineTo(cx + 12 * zoom, cy + 2 * zoom);
    ctx.closePath();
    ctx.fill();

    // Bei starkem Verfall: Freiliegende Gerüststangen sichtbar
    if (isWeathered) {
      ctx.strokeStyle = '#29170a';
      ctx.lineWidth = 1.2 * zoom;
      ctx.beginPath();
      ctx.moveTo(cx - 8 * zoom, cy);
      ctx.lineTo(cx - 2 * zoom, cy - 12 * zoom);
      ctx.moveTo(cx + 7 * zoom, cy);
      ctx.lineTo(cx + 1 * zoom, cy - 13 * zoom);
      ctx.stroke();
    }

    // Überstehende Hauptstämme (Tipi / Lean-to Spitze)
    ctx.strokeStyle = '#3b2211';
    ctx.lineWidth = 2.2 * zoom;
    ctx.beginPath();
    ctx.moveTo(cx - 13 * zoom, cy + 3 * zoom);
    ctx.lineTo(cx + 2 * zoom, cy - 21 * zoom);
    ctx.moveTo(cx + 13 * zoom, cy + 3 * zoom);
    ctx.lineTo(cx - 2 * zoom, cy - 21 * zoom);
    ctx.stroke();

    // Dezente Haltbarkeitsanzeige bei Verfall (< 80%)
    if (condition < 80) {
      const barW = 14 * zoom;
      const barH = 2.2 * zoom;
      const bx = cx - barW / 2;
      const by = cy - 25 * zoom;

      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(bx - 1, by - 1, barW + 2, barH + 2);

      const barFillW = barW * (condition / 100);
      const barCol = condition > 50 ? '#eab308' : (condition > 25 ? '#f97316' : '#ef4444');
      ctx.fillStyle = barCol;
      ctx.fillRect(bx, by, barFillW, barH);
    }

    ctx.restore();
  }

  // Echtes, organisches Acheuléen-Lagerfeuer (Züngelnde Flammen, Glutbett, Funkenflug)
  drawCampfire(gx, gy, cx, cy, fireIntensity = 100) {
    const ctx = this.ctx;
    const zoom = this.cam.zoom;
    const isLit = fireIntensity > 5;
    const flameScale = Math.min(1.2, fireIntensity / 100);
    const now = Date.now() * 0.001;
    const seed = (gx * 3.7 + gy * 1.9);

    ctx.save();

    // 1. Organischer warmer Boden-Lichthof (flickerndes Radial-Glühen)
    if (isLit) {
      const flickerPulse = Math.sin(now * 5.0 + seed) * 0.12 + Math.cos(now * 8.2 + seed) * 0.08;
      const glowRad = (14 + flameScale * 26 + flickerPulse * 6) * zoom;
      const glowAlpha = Math.max(0.1, Math.min(0.65, (0.25 + flameScale * 0.35 + flickerPulse * 0.1)));

      const glow = ctx.createRadialGradient(cx, cy, 2 * zoom, cx, cy, glowRad);
      glow.addColorStop(0, `rgba(251, 146, 60, ${glowAlpha})`);
      glow.addColorStop(0.5, `rgba(234, 88, 12, ${glowAlpha * 0.4})`);
      glow.addColorStop(1, 'rgba(234, 88, 12, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, glowRad, 0, Math.PI * 2);
      ctx.fill();
    }

    // 2. Glutbett & Flussstein-Feuerstelle
    // Aschebett
    ctx.fillStyle = isLit ? '#1c1917' : '#27272a';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 1 * zoom, 9 * zoom, 5 * zoom, 0, 0, Math.PI * 2);
    ctx.fill();

    // Rotglühende Risse im Glutbett
    if (isLit) {
      ctx.fillStyle = '#dc2626';
      ctx.beginPath();
      ctx.arc(cx - 2 * zoom, cy + 1 * zoom, 2.5 * zoom, 0, Math.PI * 2);
      ctx.arc(cx + 2.5 * zoom, cy + 0.5 * zoom, 2 * zoom, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.arc(cx, cy + 1 * zoom, 1.8 * zoom, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. Verkohlte Holzscheite (gekreuzt)
    ctx.strokeStyle = isLit ? '#271b12' : '#3f3f46';
    ctx.lineWidth = 2.4 * zoom;
    ctx.beginPath();
    ctx.moveTo(cx - 6 * zoom, cy + 2 * zoom);
    ctx.lineTo(cx + 6 * zoom, cy - 2 * zoom);
    ctx.moveTo(cx - 5 * zoom, cy - 2 * zoom);
    ctx.lineTo(cx + 5 * zoom, cy + 2 * zoom);
    ctx.moveTo(cx, cy - 3 * zoom);
    ctx.lineTo(cx, cy + 3 * zoom);
    ctx.stroke();

    // 4. Authentische züngelnde Flammenzungen (Bézier-Kurven statt Kreisen!)
    if (isLit) {
      // Wind & Flackern
      const fl1 = Math.sin(now * 7.0 + seed) * 2.5 * zoom;
      const fl2 = Math.cos(now * 9.5 + seed * 1.5) * 2.0 * zoom;
      const fl3 = Math.sin(now * 11.2 + seed * 2.0) * 1.8 * zoom;

      const flameH = (16 * flameScale) * zoom;
      const baseY = cy;

      // Äußere lodernde Flammenhülle (Tiefes Glut-Orange/Rot)
      ctx.fillStyle = '#ea580c';
      ctx.beginPath();
      ctx.moveTo(cx - 6 * zoom, baseY);
      // Linke Zunge
      ctx.quadraticCurveTo(cx - 5 * zoom + fl2, baseY - flameH * 0.6, cx - 2 * zoom + fl1, baseY - flameH * 0.95);
      // Kerbe
      ctx.quadraticCurveTo(cx - 1 * zoom, baseY - flameH * 0.5, cx + fl3, baseY - flameH * 1.15);
      // Rechte Zunge
      ctx.quadraticCurveTo(cx + 3 * zoom, baseY - flameH * 0.6, cx + 4 * zoom + fl2, baseY - flameH * 0.85);
      ctx.quadraticCurveTo(cx + 6 * zoom, baseY - flameH * 0.3, cx + 6 * zoom, baseY);
      ctx.closePath();
      ctx.fill();

      // Mittlerer heißer Flammenkörper (Goldgelb)
      const midH = flameH * 0.75;
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.moveTo(cx - 4 * zoom, baseY);
      ctx.quadraticCurveTo(cx - 3 * zoom + fl3, baseY - midH * 0.6, cx + fl1 * 0.7, baseY - midH);
      ctx.quadraticCurveTo(cx + 3 * zoom + fl2, baseY - midH * 0.6, cx + 4 * zoom, baseY);
      ctx.closePath();
      ctx.fill();

      // Innerer weißglühender Kern (Höchste Hitze)
      const coreH = flameH * 0.42;
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.moveTo(cx - 2.5 * zoom, baseY);
      ctx.quadraticCurveTo(cx - 1 * zoom + fl2 * 0.4, baseY - coreH * 0.5, cx + fl1 * 0.4, baseY - coreH);
      ctx.quadraticCurveTo(cx + 1 * zoom, baseY - coreH * 0.5, cx + 2.5 * zoom, baseY);
      ctx.closePath();
      ctx.fill();

      // 5. Aufsteigender Funkenflug (Glutpartikel driften nach oben)
      for (let i = 0; i < 4; i++) {
        const pCycle = 1.4;
        const pTime = (now * 1.6 + i * 0.35 + seed) % pCycle;
        const pProg = pTime / pCycle; // 0 bis 1

        const sparkX = cx + (Math.sin(now * 3.0 + i * 2) * 4 + (i - 1.5) * 3) * zoom;
        const sparkY = baseY - (coreH + pProg * 22 * zoom);
        const sparkAlpha = Math.max(0, 1 - pProg);
        const sparkSize = (1.4 - pProg * 0.8) * zoom;

        ctx.fillStyle = i % 2 === 0 ? `rgba(254, 240, 138, ${sparkAlpha})` : `rgba(251, 146, 60, ${sparkAlpha})`;
        ctx.beginPath();
        ctx.arc(sparkX, sparkY, Math.max(0.6, sparkSize), 0, Math.PI * 2);
        ctx.fill();
      }

      // 6. Feiner Rauchfaden in die Höhe
      const smokeTime = (now * 0.8 + seed) % 2.0;
      const smokeProg = smokeTime / 2.0;
      const smokeY = baseY - (flameH + smokeProg * 20 * zoom);
      const smokeX = cx + Math.sin(now * 1.5 + seed) * 6 * zoom;
      const smokeAlpha = Math.max(0, 0.28 * (1 - smokeProg));
      ctx.fillStyle = `rgba(161, 161, 170, ${smokeAlpha})`;
      ctx.beginPath();
      ctx.arc(smokeX, smokeY, (2.5 + smokeProg * 4) * zoom, 0, Math.PI * 2);
      ctx.fill();

    } else {
      // Kalte erloschene Asche & dünner Restrauch
      ctx.fillStyle = '#52525b';
      ctx.beginPath();
      ctx.arc(cx, cy - 1 * zoom, 2 * zoom, 0, Math.PI * 2);
      ctx.fill();

      // Kleiner kalter Rauchhauch
      const smokeY = cy - ((now * 8) % 14) * zoom;
      const smokeAlpha = Math.max(0, 0.2 - ((now * 8) % 14) / 14);
      ctx.fillStyle = `rgba(113, 113, 122, ${smokeAlpha})`;
      ctx.beginPath();
      ctx.arc(cx + Math.sin(now * 2) * 2 * zoom, smokeY, 1.8 * zoom, 0, Math.PI * 2);
      ctx.fill();
    }

    // Stammeslager-Kiste / Vorrats-Markierung nur am Hauptlager (12, 12)
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
