// Safety logic that runs on the phone: the emergency check, danger zones, and rerouting around them.
// Routes are private (AGENTS.md rule 4), so each phone checks and reroutes its OWN route; the server
// never has to look at anyone's path to warn them.

import { distanceBetween, getWalkingRoute, type LatLng, type WalkingRoute } from '@/lib/directions';
import type { EaiserResult } from '@/lib/eaiser';

// ---------------------------------------------------------------- emergency check
// EAiSER is for things that need fixing. Anything that sounds like someone in danger goes to
// UPD / 911 first. We ask one question instead of guessing, and never auto-dispatch anyone.
const EMERGENCY_WORDS =
  /\b(fight|fighting|assault|attack(ed|ing)?|harass(ed|ing|ment)?|follow(ed|ing) me|weapon|gun|knife|stab|bleed(ing)?|blood|unconscious|passed out|not breathing|can'?t breathe|overdose|seizure|hurt|injured|help me|scream(ing)?|robbed|robbery|fire|smoke)\b/i;

export function emergencyCheck(text: string, result?: EaiserResult | null) {
  const matched = text.match(EMERGENCY_WORDS)?.[0] ?? null;
  const fromEaiser = !!result && (result.category === 'fire_hazard' || (result.severity === 'high' && result.category === 'other'));
  return { askIfDanger: !!matched || fromEaiser, matched };
}

// ---------------------------------------------------------------- zones
export type Zone = {
  id: string;
  lat: number;
  lng: number;
  radius_m: number;
  title: string;
  category: string;
  severity: string;
};

const toXY = (p: LatLng, origin: LatLng) => ({
  x: (p.longitude - origin.longitude) * 111320 * Math.cos((origin.latitude * Math.PI) / 180),
  y: (p.latitude - origin.latitude) * 111320,
});
const fromXY = (x: number, y: number, origin: LatLng): LatLng => ({
  latitude: origin.latitude + y / 111320,
  longitude: origin.longitude + x / (111320 * Math.cos((origin.latitude * Math.PI) / 180)),
});

/** Closest approach of a route to a point: distance (m), segment index, and the closest point. */
export function closestApproach(route: LatLng[], p: LatLng) {
  let best = { d: Infinity, seg: 0, point: route[0] };
  for (let i = 1; i < route.length; i++) {
    const a = toXY(route[i - 1], p), b = toXY(route[i], p);
    const dx = b.x - a.x, dy = b.y - a.y;
    const L2 = dx * dx + dy * dy || 1e-9;
    const t = Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / L2));
    const cx = a.x + t * dx, cy = a.y + t * dy;
    const d = Math.hypot(cx, cy);
    if (d < best.d) best = { d, seg: i - 1, point: fromXY(cx, cy, p) };
  }
  if (route.length === 1) best = { d: distanceBetween(route[0], p), seg: 0, point: route[0] };
  return best;
}

export function routeHitsZone(route: LatLng[], z: Zone, bufferM = 10) {
  if (route.length < 1) return false;
  return closestApproach(route, { latitude: z.lat, longitude: z.lng }).d < z.radius_m + bufferM;
}

export function blockingZones(route: LatLng[], zones: Zone[]) {
  return zones.filter((z) => routeHitsZone(route, z));
}

export function routeLength(route: LatLng[]) {
  let s = 0;
  for (let i = 1; i < route.length; i++) s += distanceBetween(route[i - 1], route[i]);
  return s;
}

/** Two candidate waypoints just outside the zone, on either side of where the route crosses it. */
function sideWaypoints(route: LatLng[], z: Zone): LatLng[] {
  const c = { latitude: z.lat, longitude: z.lng };
  const { seg, point } = closestApproach(route, c);
  const a = toXY(route[seg], c), b = toXY(route[Math.min(seg + 1, route.length - 1)], c);
  let nx = -(b.y - a.y), ny = b.x - a.x;
  const n = Math.hypot(nx, ny) || 1;
  nx /= n; ny /= n;
  const off = z.radius_m + 35;
  const p = toXY(point, c);
  // If the route passes right through the centre, offset from the centre; otherwise push outwards.
  const base = Math.hypot(p.x, p.y) < 1 ? { x: 0, y: 0 } : p;
  return [fromXY(base.x + nx * off, base.y + ny * off, c), fromXY(base.x - nx * off, base.y - ny * off, c)];
}

export type Avoidance = {
  route: WalkingRoute;
  avoided: Zone[];
  /** Zones we couldn't route around (e.g. the destination is inside one). */
  unavoidable: Zone[];
  addedM: number;
};

/**
 * Walking route from `from` to `to` that stays out of every zone it can.
 * Tries going around each blocking zone on both sides and keeps the shortest route that clears it.
 */
export async function routeAvoidingZones(from: LatLng, to: LatLng, zones: Zone[], maxTries = 3): Promise<Avoidance> {
  const direct = await getWalkingRoute(from, to);
  // Zones containing your start or destination can't be avoided; don't try.
  const avoidable = zones.filter(
    (z) => distanceBetween(from, { latitude: z.lat, longitude: z.lng }) > z.radius_m &&
           distanceBetween(to, { latitude: z.lat, longitude: z.lng }) > z.radius_m
  );
  const unavoidable = zones.filter((z) => !avoidable.includes(z) && routeHitsZone(direct.points, z));
  let best = direct;
  let via: LatLng[] = [];
  const avoided: Zone[] = [];
  for (let i = 0; i < maxTries; i++) {
    const hit = blockingZones(best.points, avoidable).filter((z) => !avoided.includes(z))[0];
    if (!hit) break;
    let winner: { route: WalkingRoute; via: LatLng[] } | null = null;
    for (const w of sideWaypoints(best.points, hit)) {
      const candidateVia = insertInOrder(via, w, from);
      const r = await getWalkingRoute(from, to, candidateVia);
      if (routeHitsZone(r.points, hit)) continue;
      if (!winner || r.distanceM < winner.route.distanceM) winner = { route: r, via: candidateVia };
    }
    if (!winner) { unavoidable.push(hit); break; }
    best = winner.route;
    via = winner.via;
    avoided.push(hit);
  }
  return { route: best, avoided, unavoidable, addedM: Math.max(0, best.distanceM - direct.distanceM) };
}

/** Keep detour waypoints ordered by distance from the start so the route doesn't zig-zag. */
function insertInOrder(via: LatLng[], w: LatLng, from: LatLng) {
  return [...via, w].sort((a, b) => distanceBetween(from, a) - distanceBetween(from, b));
}

export const CATEGORY_LABEL: Record<string, string> = {
  broken_lighting: 'broken lighting',
  blocked_path: 'a blocked walkway',
  flooding: 'flooding',
  construction: 'construction',
  fallen_tree: 'a fallen tree',
  fire_hazard: 'a fire hazard',
  unsafe_conditions: 'unsafe conditions',
  safety_concern: 'a safety concern (UPD notified)',
  other: 'a reported problem',
};
