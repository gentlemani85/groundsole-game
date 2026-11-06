import { TILE_W, TILE_H } from './config.js';

export class Camera {
  constructor(canvas) {
    this.canvas = canvas;
    this.x = canvas.width / 2;
    this.y = 120;
    this.zoom = 1.0;
  }

  gridToScreen(gx, gy) {
    const halfW = (TILE_W / 2) * this.zoom;
    const halfH = (TILE_H / 2) * this.zoom;
    return {
      x: (gx - gy) * halfW + this.x,
      y: (gx + gy) * halfH + this.y
    };
  }

  screenToGrid(sx, sy) {
    const halfW = (TILE_W / 2) * this.zoom;
    const halfH = (TILE_H / 2) * this.zoom;
    const dx = sx - this.x;
    const dy = sy - this.y - halfH;

    const gx = (dy / halfH + dx / halfW) / 2;
    const gy = (dy / halfH - dx / halfW) / 2;

    return {
      x: Math.floor(gx + 0.5),
      y: Math.floor(gy + 0.5)
    };
  }
}
