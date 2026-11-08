// =========================================================================
// HUMAN RENDERING (Hominiden-Figuren, Werkzeuge, Traglinge & Status-Icons)
// =========================================================================
import { TILE_H } from '../config.js';

export const humanRenderMethods = {
  drawHuman(h, selectedHumanId) {
    const ctx = this.ctx;
    const zoom = this.cam.zoom;
    const pos = this.cam.gridToScreen(h.x, h.y);
    const cx = pos.x;
    const cy = pos.y + (TILE_H / 2) * zoom;

    const isBaby = (h.ageYears < 4);
    const isChild = (h.ageYears >= 4 && h.ageYears < 12);
    const isElder = (h.ageYears >= 40);

    const shadowW = isBaby ? 2.6 : (isChild ? 3.8 : 5.8);
    const shadowH = isBaby ? 1.4 : (isChild ? 2.0 : 2.8);

    ctx.save();
    // 1. Bodenschatten
    ctx.beginPath();
    ctx.ellipse(cx, cy + 2 * zoom, shadowW * zoom, shadowH * zoom, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fill();

    // Selektions-Ring
    if (h.id === selectedHumanId) {
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.8 * zoom;
      ctx.beginPath();
      ctx.ellipse(cx, cy + 2 * zoom, (isBaby ? 5.5 : (isChild ? 7.5 : 9.5)) * zoom, (isBaby ? 2.8 : (isChild ? 3.8 : 4.8)) * zoom, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    let bobbing = 0;
    const isMoving = (h.state === 'moving');
    if (isMoving) {
      bobbing = Math.abs(Math.sin(Date.now() * 0.012)) * (isBaby ? 1.4 : 2.8) * zoom;
    } else if (h.state === 'playing') {
      bobbing = Math.abs(Math.sin(Date.now() * 0.018)) * 3.6 * zoom;
    }

    const scale = isBaby ? 0.44 : (isChild ? 0.68 : (isElder ? 0.9 : 1.0));
    const isSittingAtFire = (h.state === 'socializing' && h.actionIntent === 'sit_campfire');
    const sitOffset = isSittingAtFire ? 3.0 * zoom * scale : 0;
    const bodyY = cy - (6 * scale) * zoom - bobbing + sitOffset;

    // Grabstein / Verstorbener
    if (!h.isAlive) {
      ctx.fillStyle = '#64748b';
      ctx.fillRect(cx - 5 * zoom, cy - 2 * zoom, 10 * zoom, 4 * zoom);
      ctx.font = `${10 * zoom}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('🪦', cx, cy - 4 * zoom);
      ctx.restore();
      return;
    }

    // 2. Beine mit Geh-Animation (Schritt-Pendeln beim Laufen)
    if (!isSittingAtFire) {
      const legStride = isMoving ? Math.sin(Date.now() * 0.015) * 3.5 * scale * zoom : 0;
      ctx.fillStyle = (h.tint === '#3b82f6') ? '#b45309' : '#92400e';
      ctx.fillRect(cx - 2.5 * scale * zoom, bodyY + 5 * scale * zoom, 1.8 * scale * zoom, (4 * scale * zoom) + legStride);
      ctx.fillRect(cx + 0.8 * scale * zoom, bodyY + 5 * scale * zoom, 1.8 * scale * zoom, (4 * scale * zoom) - legStride);
    }

    // 3. Rumpf & Fellgewand (Acheuléen-Fellwicklung)
    ctx.fillStyle = '#5c2e0b';
    ctx.beginPath();
    ctx.moveTo(cx - 3.8 * scale * zoom, bodyY);
    ctx.lineTo(cx + 3.8 * scale * zoom, bodyY);
    ctx.lineTo(cx + 4.2 * scale * zoom, bodyY + 6.5 * scale * zoom);
    ctx.lineTo(cx - 4.2 * scale * zoom, bodyY + 6.5 * scale * zoom);
    ctx.closePath();
    ctx.fill();

    // Gürtel
    ctx.strokeStyle = '#1c1917';
    ctx.lineWidth = 1 * zoom * scale;
    ctx.beginPath();
    ctx.moveTo(cx - 4.2 * scale * zoom, bodyY + 4 * scale * zoom);
    ctx.lineTo(cx + 4.2 * scale * zoom, bodyY + 4 * scale * zoom);
    ctx.stroke();

    // 4. Arme & Handwerkzeuge
    ctx.fillStyle = (h.tint === '#3b82f6') ? '#b45309' : '#92400e';
    ctx.fillRect(cx - 4.8 * scale * zoom, bodyY + 1 * scale * zoom, 1.6 * scale * zoom, 4 * scale * zoom);
    ctx.fillRect(cx + 3.4 * scale * zoom, bodyY + 1 * scale * zoom, 1.6 * scale * zoom, 4 * scale * zoom);

    // Werkzeugdarstellung in der Hand
    if (h.state === 'hunting') {
      ctx.strokeStyle = '#a16207';
      ctx.lineWidth = 1.4 * zoom;
      ctx.beginPath();
      ctx.moveTo(cx + 4 * scale * zoom, bodyY - 6 * scale * zoom);
      ctx.lineTo(cx + 4 * scale * zoom, bodyY + 8 * scale * zoom);
      ctx.stroke();
    } else if (h.state === 'chopping' || h.state === 'mining') {
      ctx.fillStyle = '#475569';
      ctx.beginPath();
      ctx.arc(cx + 4.5 * scale * zoom, bodyY + 4.5 * scale * zoom, 1.8 * scale * zoom, 0, Math.PI * 2);
      ctx.fill();
    } else if (h.state === 'digging' || h.state === 'foraging') {
      ctx.strokeStyle = '#854d0e';
      ctx.lineWidth = 1.3 * zoom;
      ctx.beginPath();
      ctx.moveTo(cx + 4.5 * scale * zoom, bodyY + 1 * scale * zoom);
      ctx.lineTo(cx + 6 * scale * zoom, bodyY + 8 * scale * zoom);
      ctx.stroke();
    }

    // Mutter mit Tragling auf dem Rücken
    if (h.gender === 'f' && !isBaby && (h.state === 'resting' || h.state === 'socializing')) {
      ctx.fillStyle = '#fed7aa';
      ctx.beginPath();
      ctx.arc(cx - 3.5 * scale * zoom, bodyY - 1 * scale * zoom, 1.8 * scale * zoom, 0, Math.PI * 2);
      ctx.fill();
    }

    // 5. Kopf, Gesicht & Haartracht
    ctx.fillStyle = (h.ageYears >= 40) ? '#cbd5e1' : '#fed7aa';
    ctx.beginPath();
    ctx.arc(cx, bodyY - 6 * scale * zoom, 3.2 * scale * zoom, 0, Math.PI * 2);
    ctx.fill();

    const hairColor = (h.ageYears >= 40) ? '#94a3b8' : (h.gender === 'm' ? '#1c1917' : '#291b12');
    ctx.fillStyle = hairColor;
    ctx.beginPath();
    ctx.arc(cx, bodyY - 7.5 * scale * zoom, 2.8 * scale * zoom, Math.PI, Math.PI * 2);
    ctx.fill();

    // Zopf bei Frauen
    if (h.gender === 'f' && !isBaby) {
      ctx.fillStyle = hairColor;
      ctx.fillRect(cx - 3.2 * scale * zoom, bodyY - 7 * scale * zoom, 1.4 * scale * zoom, 4.5 * scale * zoom);
      ctx.fillRect(cx + 1.8 * scale * zoom, bodyY - 7 * scale * zoom, 1.4 * scale * zoom, 4.5 * scale * zoom);
    }

    // Bart bei Männern
    if (h.gender === 'm' && !isChild && !isBaby) {
      ctx.fillStyle = hairColor;
      ctx.beginPath();
      ctx.arc(cx, bodyY - 4.5 * scale * zoom, 1.6 * scale * zoom, 0, Math.PI);
      ctx.fill();
    }

    // Namens-Badge bei Selektion
    if (h.id === selectedHumanId) {
      ctx.font = `bold ${Math.max(9, 9 * zoom)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fbbf24';
      ctx.fillText(`${h.name} (${Math.floor(h.ageYears)}J)`, cx, bodyY - 17 * scale * zoom);
    }

    // Sprech- und Sozial-Icons über den Figuren
    if (h.state === 'socializing') {
      ctx.font = `${8 * zoom}px sans-serif`;
      ctx.textAlign = 'center';
      const icon = (h.actionIntent === 'sit_campfire') ? '🔥' : '🗣️';
      ctx.fillText(icon, cx, bodyY - 11 * scale * zoom);
    } else if (h.state === 'playing') {
      ctx.font = `${8 * zoom}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('⭐', cx, bodyY - 11 * scale * zoom);
    }

    if (h.carried) {
      ctx.font = `${10 * zoom}px sans-serif`;
      ctx.textAlign = 'center';
      let cIcon = '📦';
      if (h.carried.includes('Stein')) cIcon = '🪨';
      else if (h.carried.includes('Holz')) cIcon = '🪵';
      else if (h.carried.includes('Wasser')) cIcon = '💧';
      else if (h.carried.includes('Beeren')) cIcon = '🍇';
      else if (h.carried.includes('Wurzelknollen')) cIcon = '🥔';
      else if (h.carried.includes('Flussfisch')) cIcon = '🐟';
      else if (h.carried.includes('Wildbret')) cIcon = '🥩';
      ctx.fillText(cIcon, cx + 6 * zoom, bodyY);
    }

    let icon = '';
    if (h.state === 'relieving') icon = '💨';
    else if (h.state === 'drinking') icon = '💧';
    else if (h.state === 'foraging') icon = '🍇';
    else if (h.state === 'digging') icon = '🥔';
    else if (h.state === 'fishing') icon = '🎣';
    else if (h.state === 'mining') icon = '⛏️';
    else if (h.state === 'chopping') icon = '🪓';
    else if (h.state === 'hunting') icon = '🏹';
    else if (h.state === 'building') icon = '🔨';
    else if (h.state === 'resting') icon = '🔥';
    else if (h.state === 'mating') icon = '❤️';
    else if (h.state === 'migrating') icon = '⛺';
    else if (h.injuredTimer > 0) icon = '🩸';
    else if (h.sickTimer > 0) icon = '🤒';
    else if (h.pregnancyTimer > 0) icon = '🤰';

    if (icon) {
      ctx.font = `${Math.max(10, 11 * zoom)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(icon, cx, bodyY - 13 * zoom);
    }

    ctx.restore();
  }
};
