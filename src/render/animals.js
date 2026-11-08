// =========================================================================
// ANIMAL RENDERING (Prozedurale Vektor-Fauna: Bison, Keiler, Feldhase, Ur-Hirsch)
// =========================================================================
import { TILE_H } from '../config.js';

export const animalRenderMethods = {
  drawAnimal(a) {
    const ctx = this.ctx;
    const zoom = this.cam.zoom;
    const pos = this.cam.gridToScreen(a.x, a.y);
    const screenCx = pos.x;
    const screenCy = pos.y + (TILE_H / 2) * zoom;

    ctx.save();
    ctx.translate(screenCx, screenCy);

    // Laufrichtung erkennen (kein Rückwärtslaufen / Moonwalk):
    // In Isometrie berechnet sich die horizontale Bildschirmbewegung aus: (targetX - targetY) - (x - y)
    const screenMoveDx = (a.targetX - a.x) - (a.targetY - a.y);
    if (screenMoveDx < -0.05) {
      a.facingLeft = true;
    } else if (screenMoveDx > 0.05) {
      a.facingLeft = false;
    }

    // Wenn nach links gewandt, gesamten Tierkörper horizontal spiegeln
    if (a.facingLeft) {
      ctx.scale(-1, 1);
    }

    const cx = 0;
    const cy = 0;

    const species = a.species || 'deer';
    const isFleeing = (a.state === 'fleeing');
    const isMoving = (a.state === 'moving');

    if (species === 'bison') {
      // ==========================================
      // 🦬 MÄCHTIGER UR-BISON (Bison priscus) - VOLLKÖRPER
      // Gewaltiger Rumpf, behaarter Buckel, Beine mit Hufen,
      // gesenkter Kopf mit Bart und zwei geschwungenen Hörnern
      // ==========================================
      const shadowW = 12.5 * zoom;
      const shadowH = 5.4 * zoom;
      ctx.beginPath();
      ctx.ellipse(cx, cy + 2 * zoom, shadowW, shadowH, 0, 0, Math.PI * 2);
      ctx.fillStyle = isFleeing ? 'rgba(0,0,0,0.22)' : 'rgba(0,0,0,0.35)';
      ctx.fill();

      const hop = isFleeing ? Math.abs(Math.sin(Date.now() * 0.022)) * 2.8 * zoom : (isMoving ? Math.abs(Math.sin(Date.now() * 0.008)) * 1.2 * zoom : 0);
      const legStride = (isFleeing || isMoving) ? Math.sin(Date.now() * 0.016) * 2.2 * zoom : 0;
      const bodyY = cy - 8 * zoom - hop;

      // 4 Beine mit Hufen
      ctx.fillStyle = '#17120e'; // Hintere Beine (Schatten)
      ctx.fillRect(cx - 6 * zoom, bodyY + 3 * zoom, 2 * zoom, (4.5 * zoom) - legStride);
      ctx.fillRect(cx + 4.5 * zoom, bodyY + 3 * zoom, 2 * zoom, (4.5 * zoom) + legStride);

      ctx.fillStyle = '#261912'; // Vordere Beine
      ctx.fillRect(cx - 3.5 * zoom, bodyY + 3.5 * zoom, 2.3 * zoom, (4.5 * zoom) + legStride);
      ctx.fillRect(cx + 2 * zoom, bodyY + 3.5 * zoom, 2.3 * zoom, (4.5 * zoom) - legStride);

      // Hinterer Körper (Hüfte & Flanke)
      ctx.fillStyle = '#3a2215';
      ctx.beginPath();
      ctx.ellipse(cx - 3 * zoom, bodyY + 1 * zoom, 7.5 * zoom, 5.2 * zoom, 0, 0, Math.PI * 2);
      ctx.fill();

      // Gewaltiger behaarter Schulterbuckel & Mähne
      ctx.fillStyle = '#22120a';
      ctx.beginPath();
      ctx.ellipse(cx + 2.2 * zoom, bodyY - 3.2 * zoom, 7.0 * zoom, 6.2 * zoom, 0, 0, Math.PI * 2);
      ctx.fill();

      // Tief gesenkter Kopf
      ctx.fillStyle = '#1a0e08';
      ctx.beginPath();
      ctx.ellipse(cx + 7.5 * zoom, bodyY + 0.5 * zoom, 3.8 * zoom, 4.2 * zoom, 0, 0, Math.PI * 2);
      ctx.fill();

      // Kinnbart
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.moveTo(cx + 6 * zoom, bodyY + 3 * zoom);
      ctx.lineTo(cx + 8.5 * zoom, bodyY + 3 * zoom);
      ctx.lineTo(cx + 7.5 * zoom, bodyY + 7 * zoom);
      ctx.closePath();
      ctx.fill();

      // Zwei große sichelförmig geschwungene Elfenbeinhörner
      ctx.strokeStyle = '#e2d5bd';
      ctx.lineWidth = 2.2 * zoom;
      ctx.beginPath();
      ctx.moveTo(cx + 6.5 * zoom, bodyY - 2 * zoom);
      ctx.quadraticCurveTo(cx + 8.5 * zoom, bodyY - 8.5 * zoom, cx + 5.5 * zoom, bodyY - 9.5 * zoom);
      ctx.moveTo(cx + 8.5 * zoom, bodyY - 2 * zoom);
      ctx.quadraticCurveTo(cx + 10.5 * zoom, bodyY - 8.5 * zoom, cx + 8.0 * zoom, bodyY - 10 * zoom);
      ctx.stroke();

      // Schwarze Hornspitzen
      ctx.strokeStyle = '#18181b';
      ctx.lineWidth = 2.4 * zoom;
      ctx.beginPath();
      ctx.moveTo(cx + 6.2 * zoom, bodyY - 8.6 * zoom);
      ctx.lineTo(cx + 5.5 * zoom, bodyY - 9.5 * zoom);
      ctx.moveTo(cx + 8.6 * zoom, bodyY - 9.2 * zoom);
      ctx.lineTo(cx + 8.0 * zoom, bodyY - 10 * zoom);
      ctx.stroke();

      // Bernsteinfarbenes Auge
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(cx + 8.8 * zoom, bodyY - 0.5 * zoom, 0.9 * zoom, 0, Math.PI * 2);
      ctx.fill();

    } else if (species === 'boar') {
      // ==========================================
      // 🐗 WILDSCHWEIN (Sus scrofa) - VOLLKÖRPER-KEILER!
      // Stämmiger Keilkörper, 4 Beine, dunkler Borstenkamm,
      // rosa Rüsselscheibe und ZWEI WEISSE HAUER (Stoßzähne)!
      // ==========================================
      const shadowW = 8.5 * zoom;
      const shadowH = 3.8 * zoom;
      ctx.beginPath();
      ctx.ellipse(cx, cy + 2 * zoom, shadowW, shadowH, 0, 0, Math.PI * 2);
      ctx.fillStyle = isFleeing ? 'rgba(0,0,0,0.22)' : 'rgba(0,0,0,0.32)';
      ctx.fill();

      const hop = isFleeing ? Math.abs(Math.sin(Date.now() * 0.026)) * 2.4 * zoom : (isMoving ? Math.abs(Math.sin(Date.now() * 0.010)) * 1.0 * zoom : 0);
      const legStride = (isFleeing || isMoving) ? Math.sin(Date.now() * 0.018) * 1.8 * zoom : 0;
      const bodyY = cy - 5.5 * zoom - hop;

      // 4 Beine
      ctx.fillStyle = '#1c1917'; // Hintere Beine
      ctx.fillRect(cx - 4.5 * zoom, bodyY + 2.5 * zoom, 1.8 * zoom, (4 * zoom) - legStride);
      ctx.fillRect(cx + 2.5 * zoom, bodyY + 2.5 * zoom, 1.8 * zoom, (4 * zoom) + legStride);

      ctx.fillStyle = '#291c14'; // Vordere Beine
      ctx.fillRect(cx - 1.5 * zoom, bodyY + 2.5 * zoom, 1.8 * zoom, (4 * zoom) + legStride);
      ctx.fillRect(cx + 5.0 * zoom, bodyY + 2.5 * zoom, 1.8 * zoom, (4 * zoom) - legStride);

      // Keilförmiger Rumpf
      ctx.fillStyle = '#3a2216';
      ctx.beginPath();
      ctx.ellipse(cx, bodyY + 0.5 * zoom, 6.8 * zoom, 4.4 * zoom, 0, 0, Math.PI * 2);
      ctx.fill();

      // Dunkler Borstenkamm auf dem Rücken
      ctx.fillStyle = '#170e08';
      ctx.beginPath();
      ctx.ellipse(cx - 1 * zoom, bodyY - 2.8 * zoom, 5.5 * zoom, 1.8 * zoom, 0, 0, Math.PI * 2);
      ctx.fill();

      // Keilerkopf mit markantem Rüsselkeil
      ctx.fillStyle = '#2a170e';
      ctx.beginPath();
      ctx.moveTo(cx + 2 * zoom, bodyY + 1.5 * zoom);
      ctx.lineTo(cx + 8.5 * zoom, bodyY + 1.8 * zoom);
      ctx.lineTo(cx + 4 * zoom, bodyY - 3.5 * zoom);
      ctx.closePath();
      ctx.fill();

      // Rosafarbener Rüsselteller
      ctx.fillStyle = '#fb923c';
      ctx.beginPath();
      ctx.arc(cx + 8.5 * zoom, bodyY + 1.8 * zoom, 1.2 * zoom, 0, Math.PI * 2);
      ctx.fill();

      // ZWEI WEISSE HAUER (aufgebogene Stoßzähne)
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.6 * zoom;
      ctx.beginPath();
      ctx.moveTo(cx + 7.5 * zoom, bodyY + 2.2 * zoom);
      ctx.quadraticCurveTo(cx + 9.5 * zoom, bodyY + 1.2 * zoom, cx + 8.8 * zoom, bodyY - 1.5 * zoom);
      ctx.moveTo(cx + 6.8 * zoom, bodyY + 1.0 * zoom);
      ctx.quadraticCurveTo(cx + 8.0 * zoom, bodyY + 0.2 * zoom, cx + 7.5 * zoom, bodyY - 1.0 * zoom);
      ctx.stroke();

      // Kleine spitze Ohren
      ctx.fillStyle = '#170e08';
      ctx.beginPath();
      ctx.moveTo(cx + 3.5 * zoom, bodyY - 3.5 * zoom);
      ctx.lineTo(cx + 4.8 * zoom, bodyY - 6.5 * zoom);
      ctx.lineTo(cx + 5.5 * zoom, bodyY - 3.5 * zoom);
      ctx.closePath();
      ctx.fill();

      // Auge
      ctx.fillStyle = '#f87171';
      ctx.beginPath();
      ctx.arc(cx + 5.5 * zoom, bodyY - 0.5 * zoom, 0.7 * zoom, 0, Math.PI * 2);
      ctx.fill();

      // Ringelschwänzchen
      ctx.strokeStyle = '#3a2216';
      ctx.lineWidth = 1.2 * zoom;
      ctx.beginPath();
      ctx.moveTo(cx - 6.5 * zoom, bodyY);
      ctx.quadraticCurveTo(cx - 8.5 * zoom, bodyY - 2 * zoom, cx - 7.5 * zoom, bodyY - 3.5 * zoom);
      ctx.stroke();

    } else if (species === 'hare') {
      // ==========================================
      // 🐇 FELDHASE - VOLLKÖRPER
      // Hocker-Silhouette, weiße Blume, lange Löffel mit schwarzen Spitzen
      // ==========================================
      const shadowW = 4.5 * zoom;
      const shadowH = 2.2 * zoom;
      ctx.beginPath();
      ctx.ellipse(cx, cy + 2 * zoom, shadowW, shadowH, 0, 0, Math.PI * 2);
      ctx.fillStyle = isFleeing ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.25)';
      ctx.fill();

      const hop = isFleeing ? Math.abs(Math.sin(Date.now() * 0.035)) * 4.2 * zoom : (isMoving ? Math.abs(Math.sin(Date.now() * 0.015)) * 2.0 * zoom : 0);
      const bodyY = cy - 3.8 * zoom - hop;

      // Hinterschenkel (Hockerstellung)
      ctx.fillStyle = '#8a6440';
      ctx.beginPath();
      ctx.ellipse(cx - 2.2 * zoom, bodyY + 1.2 * zoom, 3.2 * zoom, 2.2 * zoom, 0.3, 0, Math.PI * 2);
      ctx.fill();

      // Vorderkörper
      ctx.fillStyle = '#a67c52';
      ctx.beginPath();
      ctx.ellipse(cx + 0.8 * zoom, bodyY, 2.8 * zoom, 1.8 * zoom, -0.2, 0, Math.PI * 2);
      ctx.fill();

      // Weiße Blume (Schwänzchen)
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.arc(cx - 4.5 * zoom, bodyY + 0.5 * zoom, 1.3 * zoom, 0, Math.PI * 2);
      ctx.fill();

      // Kopf
      ctx.fillStyle = '#966c42';
      ctx.beginPath();
      ctx.ellipse(cx + 3.2 * zoom, bodyY - 1.8 * zoom, 1.8 * zoom, 1.4 * zoom, -0.3, 0, Math.PI * 2);
      ctx.fill();

      // Zwei lange Löffel (Hasenohren)
      ctx.fillStyle = '#a67c52';
      ctx.beginPath();
      ctx.ellipse(cx + 2.2 * zoom, bodyY - 5.5 * zoom, 0.9 * zoom, 3.0 * zoom, -0.25, 0, Math.PI * 2);
      ctx.ellipse(cx + 3.8 * zoom, bodyY - 5.8 * zoom, 0.9 * zoom, 3.2 * zoom, 0.15, 0, Math.PI * 2);
      ctx.fill();

      // Schwarze Löffelspitzen
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(cx + 1.5 * zoom, bodyY - 7.8 * zoom, 0.9 * zoom, 0, Math.PI * 2);
      ctx.arc(cx + 4.2 * zoom, bodyY - 8.2 * zoom, 0.9 * zoom, 0, Math.PI * 2);
      ctx.fill();

      // Knopfauge
      ctx.fillStyle = '#09090b';
      ctx.beginPath();
      ctx.arc(cx + 3.8 * zoom, bodyY - 2.2 * zoom, 0.6 * zoom, 0, Math.PI * 2);
      ctx.fill();

    } else {
      // ==========================================
      // 🦌 UR-HIRSCH (Megaloceros) - VOLLKÖRPER
      // Schlanke lange Läufe, rotbraunes Fell, heller Kehlfleck,
      // viel-endiges Prachtgeweih
      // ==========================================
      const shadowW = 8.5 * zoom;
      const shadowH = 3.6 * zoom;
      ctx.beginPath();
      ctx.ellipse(cx, cy + 2 * zoom, shadowW, shadowH, 0, 0, Math.PI * 2);
      ctx.fillStyle = isFleeing ? 'rgba(0,0,0,0.20)' : 'rgba(0,0,0,0.30)';
      ctx.fill();

      const hop = isFleeing ? Math.abs(Math.sin(Date.now() * 0.020)) * 3 * zoom : (isMoving ? Math.abs(Math.sin(Date.now() * 0.008)) * 1.2 * zoom : 0);
      const legStride = (isFleeing || isMoving) ? Math.sin(Date.now() * 0.015) * 2.5 * zoom : 0;
      const bodyY = cy - 6.5 * zoom - hop;

      // 4 lange schlanke Läufe
      ctx.fillStyle = '#451a03'; // Hintere Läufe
      ctx.fillRect(cx - 5 * zoom, bodyY + 3.5 * zoom, 1.4 * zoom, (5.5 * zoom) - legStride);
      ctx.fillRect(cx + 2.5 * zoom, bodyY + 3.5 * zoom, 1.4 * zoom, (5.5 * zoom) + legStride);

      ctx.fillStyle = '#78350f'; // Vordere Läufe
      ctx.fillRect(cx - 2.5 * zoom, bodyY + 3.5 * zoom, 1.4 * zoom, (5.5 * zoom) + legStride);
      ctx.fillRect(cx + 5 * zoom, bodyY + 3.5 * zoom, 1.4 * zoom, (5.5 * zoom) - legStride);

      // Schlanker Rumpf
      ctx.fillStyle = '#92400e';
      ctx.beginPath();
      ctx.ellipse(cx, bodyY + 1 * zoom, 6.2 * zoom, 3.8 * zoom, 0, 0, Math.PI * 2);
      ctx.fill();

      // Aufgerichteter Hals
      ctx.fillStyle = '#78350f';
      ctx.beginPath();
      ctx.moveTo(cx + 3 * zoom, bodyY + 1 * zoom);
      ctx.lineTo(cx + 6 * zoom, bodyY - 5 * zoom);
      ctx.lineTo(cx + 8 * zoom, bodyY - 5 * zoom);
      ctx.lineTo(cx + 5 * zoom, bodyY + 2 * zoom);
      ctx.closePath();
      ctx.fill();

      // Heller Kehlfleck
      ctx.fillStyle = '#fef3c7';
      ctx.beginPath();
      ctx.ellipse(cx + 5.5 * zoom, bodyY - 2 * zoom, 1.2 * zoom, 2.5 * zoom, 0.3, 0, Math.PI * 2);
      ctx.fill();

      // Kopf
      ctx.fillStyle = '#92400e';
      ctx.beginPath();
      ctx.ellipse(cx + 7 * zoom, bodyY - 5.5 * zoom, 2.8 * zoom, 1.8 * zoom, -0.2, 0, Math.PI * 2);
      ctx.fill();

      // Weit verzweigtes 6-Enden-Kronengeweih
      ctx.strokeStyle = '#fef08a';
      ctx.lineWidth = 1.4 * zoom;
      ctx.beginPath();
      ctx.moveTo(cx + 6.2 * zoom, bodyY - 7 * zoom);
      ctx.lineTo(cx + 4.5 * zoom, bodyY - 13.5 * zoom);
      ctx.moveTo(cx + 7.8 * zoom, bodyY - 7 * zoom);
      ctx.lineTo(cx + 9.5 * zoom, bodyY - 13.5 * zoom);

      ctx.moveTo(cx + 5.5 * zoom, bodyY - 10 * zoom);
      ctx.lineTo(cx + 3.2 * zoom, bodyY - 12.5 * zoom);
      ctx.moveTo(cx + 4.8 * zoom, bodyY - 13 * zoom);
      ctx.lineTo(cx + 3.0 * zoom, bodyY - 15 * zoom);

      ctx.moveTo(cx + 8.0 * zoom, bodyY - 11 * zoom);
      ctx.lineTo(cx + 10.5 * zoom, bodyY - 12.5 * zoom);
      ctx.moveTo(cx + 9.0 * zoom, bodyY - 13 * zoom);
      ctx.lineTo(cx + 11.2 * zoom, bodyY - 15 * zoom);
      ctx.stroke();
    }

    ctx.restore();
  }
};
