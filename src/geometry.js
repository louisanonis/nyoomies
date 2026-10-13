export const TAU = Math.PI * 2;

export function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function wrapAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

export function distSq(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

export function pointSegDistSq(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const l = dx * dx + dy * dy;
  let t = l > 0 ? ((px - ax) * dx + (py - ay) * dy) / l : 0;
  t = clamp(t, 0, 1);
  const cx = ax + dx * t - px;
  const cy = ay + dy * t - py;
  return cx * cx + cy * cy;
}

export function segIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
  const rx = bx - ax;
  const ry = by - ay;
  const sx = dx - cx;
  const sy = dy - cy;
  const den = rx * sy - ry * sx;
  if (den === 0) return false;
  const qx = cx - ax;
  const qy = cy - ay;
  const t = (qx * sy - qy * sx) / den;
  const u = (qx * ry - qy * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

export function segSegDistSq(ax, ay, bx, by, cx, cy, dx, dy) {
  if (segIntersect(ax, ay, bx, by, cx, cy, dx, dy)) return 0;
  return Math.min(
    pointSegDistSq(ax, ay, cx, cy, dx, dy),
    pointSegDistSq(bx, by, cx, cy, dx, dy),
    pointSegDistSq(cx, cy, ax, ay, bx, by),
    pointSegDistSq(dx, dy, ax, ay, bx, by),
  );
}

// Distance along a unit ray (dx, dy) to segment AB, or Infinity.
export function raySeg(ox, oy, dx, dy, ax, ay, bx, by) {
  const sx = bx - ax;
  const sy = by - ay;
  const den = dx * sy - dy * sx;
  if (Math.abs(den) < 1e-9) return Infinity;
  const qx = ax - ox;
  const qy = ay - oy;
  const t = (qx * sy - qy * sx) / den;
  const u = (qx * dy - qy * dx) / den;
  return t >= 0 && u >= 0 && u <= 1 ? t : Infinity;
}

// Distance along a unit ray to an axis-aligned rect {x, y, w, h}; 0 if inside.
export function rayRect(ox, oy, dx, dy, r) {
  let tmin = -Infinity;
  let tmax = Infinity;
  if (dx !== 0) {
    const t1 = (r.x - ox) / dx;
    const t2 = (r.x + r.w - ox) / dx;
    tmin = Math.max(tmin, Math.min(t1, t2));
    tmax = Math.min(tmax, Math.max(t1, t2));
  } else if (ox < r.x || ox > r.x + r.w) {
    return Infinity;
  }
  if (dy !== 0) {
    const t1 = (r.y - oy) / dy;
    const t2 = (r.y + r.h - oy) / dy;
    tmin = Math.max(tmin, Math.min(t1, t2));
    tmax = Math.min(tmax, Math.max(t1, t2));
  } else if (oy < r.y || oy > r.y + r.h) {
    return Infinity;
  }
  if (tmax < 0 || tmin > tmax) return Infinity;
  return tmin < 0 ? 0 : tmin;
}

// Distance along a unit ray from inside the box [0,w]x[0,h] to its boundary.
export function rayBounds(ox, oy, dx, dy, w, h) {
  const tx = dx > 0 ? (w - ox) / dx : dx < 0 ? -ox / dx : Infinity;
  const ty = dy > 0 ? (h - oy) / dy : dy < 0 ? -oy / dy : Infinity;
  return Math.max(0, Math.min(tx, ty));
}

export function pointRectDist(px, py, r) {
  const nx = clamp(px, r.x, r.x + r.w);
  const ny = clamp(py, r.y, r.y + r.h);
  return Math.hypot(px - nx, py - ny);
}

export function circleRect(cx, cy, rad, r) {
  const nx = clamp(cx, r.x, r.x + r.w);
  const ny = clamp(cy, r.y, r.y + r.h);
  return (cx - nx) ** 2 + (cy - ny) ** 2 < rad * rad;
}
