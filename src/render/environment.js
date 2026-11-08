// =========================================================================
// ENVIRONMENT RENDERING (Landschaft, Wasser, Pflanzen, Felsen, Hütten, Feuer)
// =========================================================================
import { TILE_W, TILE_H, CAMP_CENTER, fireState, seasonState } from '../config.js';

// Stufenlose 4-Jahreszeiten-Farbmischung (verhindert jegliche harte Farbsprünge)
function blend4RGB(cSpring, cSummer, cAutumn, cWinter, w) {
  const r = Math.round(cSpring[0] * w.spring + cSummer[0] * w.summer + cAutumn[0] * w.autumn + cWinter[0] * w.winter);
  const g = Math.round(cSpring[1] * w.spring + cSummer[1] * w.summer + cAutumn[1] * w.autumn + cWinter[1] * w.winter);
  const b = Math.round(cSpring[2] * w.spring + cSummer[2] * w.summer + cAutumn[2] * w.autumn + cWinter[2] * w.winter);
  return `rgb(${r}, ${g}, ${b})`;
}

// Lokale Gewichte unter Berücksichtigung der Schneeschmelze rund ums brennende Lagerfeuer
function getLocalSeasonWeights(gx, gy) {
  const base = seasonState.weights || { spring: 1, summer: 0, autumn: 0, winter: 0 };
  if (base.winter <= 0.001) return base;

  const distToCamp = Math.hypot(gx - CAMP_CENTER.x, gy - CAMP_CENTER.y);
  // Weicher Wärmeverlauf von 1.8 bis 4.2 Kacheln ums Feuer
  const fireFactor = Math.max(0, Math.min(1, (fireState.intensity - 15) / 85));
  const radialMelt = Math.max(0, Math.min(1, (4.2 - distToCamp) / 2.4));
  const meltAmount = fireFactor * radialMelt;

  if (meltAmount <= 0.001) return base;

  // Geschmolzener Schnee legt den herbstlich/vorfrühlingshaften Boden frei
  const meltedWinter = base.winter * (1 - meltAmount);
  const freedWeight = base.winter - meltedWinter;
  return {
    spring: base.spring + freedWeight * 0.35,
    summer: base.summer,
    autumn: base.autumn + freedWeight * 0.65,
    winter: meltedWinter
  };
}

export const environmentRenderMethods = {
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

    const w = getLocalSeasonWeights(gx, gy);
    let fillColor;

    if (tile.type === 'grass') {
      const factor = Math.min(1, Math.max(0, tile.npk / 100));
      let cSpring, cSummer;

      if (this.biomeId === 'steppe') {
        // Mammut-Steppe: Frühling = frisches Steppengrün, Sommer = trockenes Strohgold
        cSpring = [122 - factor * 38, 152 - factor * 36, 72 - factor * 28];
        cSummer = [164 - factor * 42, 142 - factor * 38, 62 - factor * 26];
      } else if (this.biomeId === 'forest') {
        // Urwald: Frühling = leuchtendes Maigrün, Sommer = tiefer dunkler Waldschatten
        cSpring = [48 - factor * 20, 118 + factor * 18, 46 + factor * 6];
        cSummer = [28 - factor * 14, 78 + factor * 20, 26 + factor * 8];
      } else if (this.biomeId === 'karst_canyon') {
        // Karst-Schlucht: Frühling = frische Almwiese, Sommer = sonnenwarmer Kalkrasen
        cSpring = [82 - factor * 26, 134 - factor * 24, 88 - factor * 18];
        cSummer = [114 - factor * 28, 116 - factor * 24, 86 - factor * 18];
      } else {
        // Fluss-Aue (Standard):
        // Frühling = leuchtend frisches, saftiges Maigrün
        cSpring = [70 - factor * 44, 174 - factor * 58, 68 - factor * 40];
        // Sommer = sonnenwarmes, reifes Gold-Oliv-Sommergras
        cSummer = [148 - factor * 72, 148 - factor * 58, 52 - factor * 34];
      }

      const cAutumn = [148 - factor * 58, 116 - factor * 48, 56 - factor * 32];
      const cWinter = [224 - factor * 28, 232 - factor * 24, 242 - factor * 18];
      fillColor = blend4RGB(cSpring, cSummer, cAutumn, cWinter, w);
    } else if (tile.type === 'water') {
      const shimmer = Math.sin(this.waterPhase + gx * 0.8 + gy * 0.5) * 8;
      const baseW = seasonState.weights || { spring: 1, summer: 0, autumn: 0, winter: 0 };
      let cBase;
      if (this.biomeId === 'karst_canyon') {
        cBase = [22 + shimmer, 120 + shimmer, 136 + shimmer];
      } else if (this.biomeId === 'forest') {
        cBase = [24 + shimmer, 88 + shimmer, 98 + shimmer];
      } else {
        cBase = [34 + shimmer, 105 + shimmer, 136 + shimmer];
      }
      const cWinterWater = [64 + shimmer, 122 + shimmer, 156 + shimmer];
      fillColor = blend4RGB(cBase, cBase, cBase, cWinterWater, baseW);
    } else if (tile.type === 'path') {
      const cNormal = (this.biomeId === 'karst_canyon')
        ? [118, 116, 114]
        : (this.biomeId === 'steppe' ? [162, 136, 98] : [138, 116, 82]);
      const cWinterPath = [164, 172, 182];
      fillColor = blend4RGB(cNormal, cNormal, cNormal, cWinterPath, w);
    } else if (tile.type === 'fire') {
      fillColor = '#3c362d';
    } else if (tile.type === 'rock') {
      fillColor = (this.biomeId === 'karst_canyon') ? '#848f9d' : (this.biomeId === 'steppe' ? '#8e806d' : '#5f6977');
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

    // Fußabdrücke auf dem Boden (saisonal gefärbt, verblassen über Zeit)
    if (tile.footprints && tile.footprints.length > 0 && tile.type !== 'water') {
      this.drawFootprints(cx, cy, tile.footprints, w);
    }

    // Blumen (im Frühling in voller Blüte, im Sommer deutlich dezenter, zum Winter hin sanft ausblendend)
    const flowerScale = w.spring * 1.45 + w.summer * 0.42 + w.autumn * 0.18;
    if (flowerScale > 0.1 && tile.type === 'grass' && tile.flowerDots && tile.flowerDots.length > 0 && !tile.plant && !tile.poop) {
      this.drawNaturalFlowers(cx, cy, tile.flowerDots, flowerScale);
    }

    // Kot
    if (tile.poop) {
      this.drawOrganicPoop(cx, cy);
    }

    ctx.restore();
  },

  drawFootprints(cx, cy, footprints, w) {
    const ctx = this.ctx;
    const zoom = this.cam.zoom;
    // Saisonale Spurfarbe:
    // Frühling = feuchte dunkle Erde, Sommer = trockener Ockerstaub, Herbst = dunkler Torf, Winter = blaugrauer Schneedruck
    const trackColor = blend4RGB(
      [64, 48, 32],
      [112, 86, 54],
      [68, 48, 30],
      [134, 156, 186],
      w
    );

    for (const fp of footprints) {
      const lifeRatio = Math.max(0, 1 - (fp.age / (fp.maxAge || 65)));
      if (lifeRatio <= 0.02) continue;
      const alpha = Math.min(1, lifeRatio * 1.35) * 0.78;
      const s = (fp.scale || 1.0) * zoom;

      ctx.save();
      ctx.translate(cx + fp.lx * zoom, cy + fp.ly * zoom);
      ctx.rotate(fp.angle || 0);
      ctx.globalAlpha = alpha;

      // Im Winter zarter weißer Schneerand um den Fußabdruck
      if (w.winter > 0.25) {
        ctx.fillStyle = `rgba(255, 255, 255, ${(w.winter * 0.55).toFixed(2)})`;
        ctx.beginPath();
        ctx.ellipse(0.9 * s, 0, 2.2 * s, 1.35 * s, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = trackColor;
      // 1. Vorderfuß / Ballen (in Laufrichtung +X)
      ctx.beginPath();
      ctx.ellipse(1.0 * s, 0, 1.75 * s, 1.05 * s, 0, 0, Math.PI * 2);
      ctx.fill();

      // 2. Ferse (dahinter -X, leicht schmaler)
      ctx.beginPath();
      ctx.ellipse(-1.25 * s, 0, 1.15 * s, 0.82 * s, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  },

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
  },

  drawNaturalFlowers(cx, cy, dots, flowerScale = 1.0) {
    const ctx = this.ctx;
    const zoom = this.cam.zoom;
    for (const d of dots) {
      const fx = cx + d.dx * zoom;
      const fy = cy + d.dy * zoom;
      ctx.fillStyle = '#3f6212';
      ctx.fillRect(fx, fy, 0.8 * zoom, 1.8 * zoom * Math.min(1.1, flowerScale));
      ctx.fillStyle = d.color;
      ctx.beginPath();
      ctx.arc(fx, fy - 1 * zoom, d.size * zoom * flowerScale, 0, Math.PI * 2);
      ctx.fill();
    }
  },

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
  },

  drawOrganicBush(cx, cy, plant) {
    const ctx = this.ctx;
    const zoom = this.cam.zoom;
    const s = plant.stage;
    const seed = plant.seedVariance || 0.5;

    ctx.save();

    // Ruhender Wurzelstock (nach Verblühen/Alterung)
    if (plant.isRootstock) {
      ctx.strokeStyle = '#5c3a21';
      ctx.lineWidth = 1.5 * zoom;
      ctx.beginPath();
      ctx.moveTo(cx, cy + 1 * zoom);
      ctx.lineTo(cx - 3 * zoom, cy - 4 * zoom);
      ctx.moveTo(cx, cy + 1 * zoom);
      ctx.lineTo(cx + 3 * zoom, cy - 5 * zoom);
      ctx.moveTo(cx, cy + 1 * zoom);
      ctx.lineTo(cx - 0.5 * zoom, cy - 6 * zoom);
      ctx.stroke();

      ctx.fillStyle = '#78350f';
      ctx.beginPath();
      ctx.arc(cx, cy + 1 * zoom, 2 * zoom, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    // Variierende Busch-Ausdehnung & Schattierung je nach Seed
    const varFactor = 0.85 + seed * 0.3;
    const baseR = (3.2 + s * 2.8) * varFactor * zoom;

    ctx.beginPath();
    ctx.ellipse(cx, cy + 2 * zoom, baseR * 1.2, baseR * 0.55, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fill();

    // Stufenlose Jahreszeiten- & Biom-Farbmischung für das Buschlaub
    const w = seasonState.weights || { spring: 1, summer: 0, autumn: 0, winter: 0 };
    const isSteppe = (this.biomeId === 'steppe');

    // Frühling: helles, frisches Austriebs-Grün | Sommer: tiefes, sattes Dunkelgrün
    const foliageDark = blend4RGB(
      isSteppe ? [48, 66, 28] : [34, 78, 26],
      isSteppe ? [42, 52, 24] : [20, 48, 16],
      [92, 45, 22],
      [51, 65, 85],
      w
    );
    const foliageMid = blend4RGB(
      isSteppe ? [76, 98, 42] : [54, 114, 38],
      isSteppe ? [66, 80, 36] : [34, 72, 26],
      [154, 68, 25],
      [100, 116, 139],
      w
    );
    const foliageLight = blend4RGB(
      isSteppe ? [112, 138, 62] : [88, 162, 58],
      isSteppe ? [96, 114, 52] : [52, 102, 40],
      [217, 119, 6],
      [226, 232, 240],
      w
    );

    ctx.fillStyle = foliageDark;
    ctx.beginPath();
    ctx.arc(cx - (2 + seed) * zoom, cy - baseR + 2 * zoom, baseR * 0.85, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + (2.5 - seed) * zoom, cy - baseR + 1 * zoom, baseR * 0.85, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = foliageMid;
    ctx.beginPath();
    ctx.arc(cx, cy - baseR - 1 * zoom, baseR * 0.75, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx - 3 * zoom, cy - baseR - (2 + seed * 2) * zoom, baseR * 0.55, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = foliageLight;
    ctx.beginPath();
    ctx.arc(cx - (0.5 + seed) * zoom, cy - baseR - 4 * zoom, baseR * 0.45, 0, Math.PI * 2);
    ctx.fill();

    // Zarte rosa-weiße Frühlingsblüten am Strauch (blenden im Frühling sanft ein und zum Sommer hin aus)
    if (w.spring > 0.12 && s >= 2) {
      ctx.fillStyle = `rgba(253, 224, 235, ${Math.min(0.95, w.spring * 1.1)})`;
      const blossomR = 1.45 * w.spring * zoom;
      const bCoords = [
        [cx - 2.5 * zoom, cy - baseR - 1 * zoom],
        [cx + 2.2 * zoom, cy - baseR - 3 * zoom],
        [cx - 0.5 * zoom, cy - baseR - 5.2 * zoom]
      ];
      for (const [bx, by] of bCoords) {
        ctx.beginPath();
        ctx.arc(bx, by, blossomR, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (plant.berries > 0 && s >= 2) {
      ctx.fillStyle = (this.biomeId === 'steppe') ? '#f97316' : '#dc2626';
      const berryR = 1.6 * zoom;
      const berryCoords = [
        [cx - 3 * zoom, cy - baseR + 1 * zoom],
        [cx + 3 * zoom, cy - baseR - 2 * zoom],
        [cx, cy - baseR - 6 * zoom],
        [cx - 2 * zoom, cy - baseR - 4 * zoom],
        [cx + 2 * zoom, cy - baseR - 5 * zoom]
      ];
      const count = Math.min(berryCoords.length, plant.berries);
      for (let i = 0; i < count; i++) {
        ctx.beginPath();
        ctx.arc(berryCoords[i][0], berryCoords[i][1], berryR, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  },

  drawOrganicTree(cx, cy, plant) {
    const ctx = this.ctx;
    const zoom = this.cam.zoom;
    const s = plant.stage;
    const seed = plant.seedVariance || 0.5;

    ctx.save();
    // 3 Wuchsformen nach Seed:
    // Typ 1: Ausladende Fluss-Eiche (breiter, niedriger)
    // Typ 2: Schlanke Steppen-Kiefer (hoher Stamm, konische Krone)
    // Typ 3: Runder Urwald-Laubbaum
    const isPine = (seed >= 0.35 && seed < 0.70);
    const isOak = (seed < 0.35);

    const trunkH = ((isPine ? 11 : (isOak ? 7 : 8)) + s * 9) * zoom;
    const trunkW = (2 + s * 1.5) * zoom;
    const crownR = ((isOak ? 6.5 : (isPine ? 4.8 : 5.5)) + s * 5.5) * zoom;
    const lean = (seed - 0.5) * 5 * zoom; // Natürliche Stammneigung

    ctx.beginPath();
    ctx.ellipse(cx + 2 * zoom, cy + 2 * zoom, crownR * 1.15, crownR * 0.5, -0.2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fill();

    // Stamm mit Neigung
    ctx.fillStyle = '#422815';
    ctx.beginPath();
    ctx.moveTo(cx - trunkW, cy);
    ctx.lineTo(cx + lean - trunkW * 0.6, cy - trunkH + 4 * zoom);
    ctx.lineTo(cx + lean - crownR * 0.4, cy - trunkH);
    ctx.lineTo(cx + lean + crownR * 0.3, cy - trunkH + 2 * zoom);
    ctx.lineTo(cx + lean + trunkW * 0.6, cy - trunkH + 8 * zoom);
    ctx.lineTo(cx + trunkW, cy);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#261408';
    ctx.lineWidth = 0.8 * zoom;
    ctx.stroke();

    const crownX = cx + lean;
    const crownY = cy - trunkH - crownR * 0.35;

    const w = seasonState.weights || { spring: 1, summer: 0, autumn: 0, winter: 0 };

    if (isPine) {
      // Schlanke Kiefern-/Nadelbaum-Form (etagenförmig)
      ctx.fillStyle = '#102a16';
      ctx.beginPath();
      ctx.moveTo(crownX, crownY - crownR * 1.1);
      ctx.lineTo(crownX + crownR * 0.8, crownY + crownR * 0.5);
      ctx.lineTo(crownX - crownR * 0.8, crownY + crownR * 0.5);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#183c20';
      ctx.beginPath();
      ctx.moveTo(crownX, crownY - crownR * 0.9);
      ctx.lineTo(crownX + crownR * 0.65, crownY + crownR * 0.1);
      ctx.lineTo(crownX - crownR * 0.65, crownY + crownR * 0.1);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#265830';
      ctx.beginPath();
      ctx.moveTo(crownX, crownY - crownR * 0.7);
      ctx.lineTo(crownX + crownR * 0.45, crownY - crownR * 0.2);
      ctx.lineTo(crownX - crownR * 0.45, crownY - crownR * 0.2);
      ctx.closePath();
      ctx.fill();

      if (w.winter > 0.05) {
        // Stufenlos ein- und ausblendende Schneehaube auf der Nadelbaum-Spitze
        ctx.fillStyle = `rgba(241, 245, 249, ${Math.min(0.95, w.winter)})`;
        ctx.beginPath();
        ctx.moveTo(crownX, crownY - crownR * 1.12);
        ctx.lineTo(crownX + crownR * 0.42, crownY - crownR * 0.25);
        ctx.lineTo(crownX - crownR * 0.42, crownY - crownR * 0.25);
        ctx.closePath();
        ctx.fill();
      }
    } else {
      // Laubbaum: Kontinuierliche 4-Phasen-Farbmischung
      // Frühling: frisches, helles Maigrün | Sommer: tiefes, sattes Dunkelgrün | Herbst: Gold/Rostrot | Winter: Schnee/Raureif
      const isSteppe = (this.biomeId === 'steppe');
      const isRedAutumn = (seed < 0.18);

      const cDark = blend4RGB(
        isSteppe ? [48, 66, 28] : [28, 68, 22],
        isSteppe ? [38, 48, 22] : [16, 40, 14],
        isRedAutumn ? [124, 45, 18] : [113, 63, 18],
        [51, 65, 85],
        w
      );
      const cMid = blend4RGB(
        isSteppe ? [76, 102, 42] : [48, 108, 34],
        isSteppe ? [60, 74, 34] : [26, 60, 20],
        isRedAutumn ? [194, 65, 12] : [180, 83, 9],
        [71, 85, 105],
        w
      );
      const cLight = blend4RGB(
        isSteppe ? [116, 146, 58] : [86, 162, 52],
        isSteppe ? [88, 106, 48] : [40, 88, 32],
        isRedAutumn ? [249, 115, 22] : [245, 158, 11],
        [241, 245, 249],
        w
      );

      ctx.fillStyle = cDark;
      ctx.beginPath();
      ctx.arc(crownX - crownR * 0.45, crownY + crownR * 0.2, crownR * 0.65, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(crownX + crownR * 0.45, crownY + crownR * 0.2, crownR * 0.7, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = cMid;
      ctx.beginPath();
      ctx.arc(crownX, crownY, crownR * 0.85, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(crownX - crownR * 0.35, crownY - crownR * 0.25, crownR * 0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(crownX + crownR * 0.3, crownY - crownR * 0.2, crownR * 0.65, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = cLight;
      ctx.beginPath();
      ctx.arc(crownX - crownR * 0.2, crownY - crownR * 0.45, crownR * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(crownX + crownR * 0.2, crownY - crownR * 0.4, crownR * 0.45, 0, Math.PI * 2);
      ctx.fill();

      // Frühlingsblüten in der Laubkrone (nur im Frühling sichtbar, blenden sanft zum Sommer hin aus)
      if (w.spring > 0.15 && s >= 2) {
        ctx.fillStyle = (seed < 0.2)
          ? `rgba(251, 207, 232, ${Math.min(0.92, w.spring)})`
          : `rgba(254, 249, 195, ${Math.min(0.88, w.spring)})`;
        const bRad = 1.6 * w.spring * zoom;
        const treeBlossoms = [
          [crownX - crownR * 0.35, crownY - crownR * 0.15],
          [crownX + crownR * 0.28, crownY - crownR * 0.32],
          [crownX - crownR * 0.05, crownY - crownR * 0.55],
          [crownX + crownR * 0.42, crownY + crownR * 0.1]
        ];
        for (const [bx, by] of treeBlossoms) {
          ctx.beginPath();
          ctx.arc(bx, by, bRad, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    ctx.restore();
  },

  // Stark verbesserte, plastische Naturfels-Grafik mit Koordinaten-Variation & Schrumpfung beim Abbau
  drawNaturalRock(cx, cy, gx = 0, gy = 0, stoneStock = 8, maxStoneStock = 8) {
    const ctx = this.ctx;
    const zoom = this.cam.zoom;
    ctx.save();

    // Determinismus aus Kachelposition
    const r = Math.abs(Math.sin(gx * 12.9898 + gy * 78.233));
    // Sichtbare Schrumpfung: Fels wird beim Abbau kontinuierlich kleiner & flacher
    const stockRatio = (typeof stoneStock === 'number' && maxStoneStock > 0)
      ? Math.max(0.35, stoneStock / maxStoneStock)
      : 1.0;
    const rScale = (0.85 + r * 0.3) * (0.45 + stockRatio * 0.55);
    const w = 9 * rScale * zoom;
    const h = 8 * rScale * zoom;

    // 1. Tiefenschatten
    ctx.beginPath();
    ctx.ellipse(cx, cy + 3 * zoom, (w + 2 * zoom), 5 * zoom, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.fill();

    // Farbpalette je nach Biom (Karst = Kalkstein, Steppe = Sandstein, Wald = Granit)
    let cDark = '#2d333b', cMid = '#485260', cLight = '#738094';
    if (this.biomeId === 'karst_canyon') {
      cDark = '#333b47'; cMid = '#586578'; cLight = '#8e9eaf';
    } else if (this.biomeId === 'steppe') {
      cDark = '#362e24'; cMid = '#5c4e3e'; cLight = '#8c7b66';
    }

    // 2. Schattenfläche hinten
    ctx.fillStyle = cDark;
    ctx.beginPath();
    ctx.moveTo(cx - w, cy + 2 * zoom);
    ctx.lineTo(cx - w * 0.6, cy - h);
    ctx.lineTo(cx + w * 0.2, cy - h * 1.2);
    ctx.lineTo(cx + w, cy - h * 0.4);
    ctx.lineTo(cx + w * 0.9, cy + 3 * zoom);
    ctx.closePath();
    ctx.fill();

    // 3. Mittlere Felsfront
    ctx.fillStyle = cMid;
    ctx.beginPath();
    ctx.moveTo(cx - w, cy + 2 * zoom);
    ctx.lineTo(cx - w * 0.2, cy - h * 0.8);
    ctx.lineTo(cx + w * 0.4, cy - 2 * zoom);
    ctx.lineTo(cx - 1 * zoom, cy + 3 * zoom);
    ctx.closePath();
    ctx.fill();

    // 4. Helle Lichtfacette oben (im Winter graduell mit Schneekappe überblendend)
    const sw = getLocalSeasonWeights(gx, gy);
    let cLightRGB = [115, 128, 148];
    if (this.biomeId === 'karst_canyon') cLightRGB = [142, 158, 175];
    else if (this.biomeId === 'steppe') cLightRGB = [140, 123, 102];
    ctx.fillStyle = blend4RGB(cLightRGB, cLightRGB, cLightRGB, [232, 238, 246], sw);
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.6, cy - h);
    ctx.lineTo(cx + w * 0.2, cy - h * 1.2);
    ctx.lineTo(cx + w * 0.9, cy - h * 0.5);
    ctx.lineTo(cx + w * 0.2, cy - h * 0.4);
    ctx.lineTo(cx - w * 0.2, cy - h * 0.8);
    ctx.closePath();
    ctx.fill();

    // 5. Moosansatz am Felsfuß
    if (this.biomeId !== 'steppe') {
      ctx.fillStyle = '#3f6212';
      ctx.beginPath();
      ctx.arc(cx - w * 0.7, cy + 1 * zoom, 2 * zoom, 0, Math.PI * 2);
      ctx.arc(cx + w * 0.6, cy + 2 * zoom, 2.2 * zoom, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  },

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

    // Rechte Zeltwand (Sonnenseite: Hellere Rinde / Schilf, im Winter graduell mit Raureif überzogen)
    const w = seasonState.weights || { spring: 1, summer: 0, autumn: 0, winter: 0 };
    const baseRoofRGB = isCritical ? [90, 57, 26] : (isWeathered ? [113, 70, 32] : [138, 88, 41]);
    ctx.fillStyle = blend4RGB(baseRoofRGB, baseRoofRGB, baseRoofRGB, [203, 213, 225], w);
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
  },

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
  },

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
};
