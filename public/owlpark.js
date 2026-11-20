'use strict';
/*
 * OwlPark: real-time parking prototype.
 * All data is simulated in the browser. When the app is served by server.js, it
 * also listens to /api/stream, so a real ESP32 posting to /api/sensor updates
 * the matching space live (lot ids and space ids match data/lots.json).
 */

// =====================================================================
// Campus model: CAMPUSES, LOTS and PLACES come from campus-data.js
// =====================================================================
// Permits (PERMIT_TYPES in campus-data.js). Special values: 'all' = no filter, 'students' = any student commuter lot.
const permitById = (id) => PERMIT_TYPES.find((p) => p.id === id);
const permitName = (id) => (permitById(id) || { name: id }).name;
function allows(lot, permit) {
  if (!permit || permit === 'all') return true;
  if (permit === 'students') return lot.permits.some((p) => permitById(p).group === 'student');
  return lot.permits.includes(permit);
}
const SLOT = { w: 14, h: 20, gx: 3, gy: 3, pad: 8, padL: 18, head: 26 };
// Typical weekday occupancy by hour (demo demand model)
const DEMAND = [.08, .05, .05, .05, .05, .08, .15, .4, .72, .88, .93, .95, .9, .92, .88, .8, .68, .58, .5, .42, .3, .2, .14, .1];

for (const l of LOTS) {
  l.w = SLOT.padL + l.cols * (SLOT.w + SLOT.gx) - SLOT.gx + SLOT.pad;
  l.h = SLOT.head + l.rows * (SLOT.h + SLOT.gy) - SLOT.gy + SLOT.pad;
  l.slots = []; l.countEls = [];
}

// =====================================================================
// Helpers
// =====================================================================
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const lotById = (id) => LOTS.find((l) => l.id === id);
const placeById = (id) => PLACES.find((p) => p.id === id);
const campusById = (id) => CAMPUSES.find((c) => c.id === id);
const campusOf = (x) => campusById(x.campus);
const lotsIn = (campusId) => LOTS.filter((l) => l.campus === campusId);
const placesIn = (campusId) => PLACES.filter((p) => p.campus === campusId);
const curCampus = () => campusById(S.campus);
const curLots = () => lotsIn(S.campus);
const center = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const hubPoint = (campus) => center(placeById(campus.hub));

function fmt(min) {
  min = ((Math.round(min) % 1440) + 1440) % 1440;
  let h = Math.floor(min / 60); const m = min % 60; const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')} ${ap}`;
}
function ago(t) {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 5) return 'now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m}m ago` : `${Math.round(m / 60)}h ago`;
}
function demandAt(min) {
  min = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(min / 60), f = (min % 60) / 60;
  return DEMAND[h] * (1 - f) + DEMAND[(h + 1) % 24] * f;
}
const rectClosest = (r, p) => ({ x: clamp(p.x, r.x, r.x + r.w), y: clamp(p.y, r.y, r.y + r.h) });

const ICONS = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  map: '<path d="M9 4 3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5L9 4z"/><path d="M9 4v13.5M15 6.5V20"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  pulse: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  car: '<path d="M5 17H3v-4l2-5.5A2 2 0 0 1 6.9 6h10.2a2 2 0 0 1 1.9 1.5L21 13v4h-2M3 13h18M9 17h6"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>',
  wifi: '<path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M1.5 9a15 15 0 0 1 21 0"/><circle cx="12" cy="19.5" r="1"/>',
  wifiOff: '<path d="M2 2l20 20M8.5 16a5 5 0 0 1 7 0M5 12.5a10 10 0 0 1 4.5-2.6M19 12.5a10 10 0 0 0-2-1.5M1.5 9a15 15 0 0 1 4.3-2.8M22.5 9A15 15 0 0 0 11 5"/><circle cx="12" cy="19.5" r="1"/>',
  battery: '<rect x="2" y="7" width="17" height="10" rx="2"/><path d="M22 11v2M6 10v4"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  down: '<path d="M12 5v14M5 12l7 7 7-7"/>',
  up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  walk: '<circle cx="13" cy="4" r="2"/><path d="M9 21l2.5-6.5L14 17v4M7.5 12.5 10 8.5l4 1 2.5 3M11.5 14.5 10 8.5"/>',
  bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4l2-2z"/><path d="M10 21h4"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  sliders: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>',
  signal: '<path d="M4 20v-3M9 20v-7M14 20v-11M19 20V4"/>',
  gateway: '<rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 16.5h.01M11 16.5h.01M8 13l-2-7M16 13l2-7"/>',
  sparkle: '<path d="M12 3l1.8 4.9L18.7 9.7l-4.9 1.8L12 16.4l-1.8-4.9L5.3 9.7l4.9-1.8L12 3z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  send: '<path d="M4 12 20 4l-6 16-3-7-7-1z"/>',
  bus: '<rect x="4" y="3" width="16" height="14" rx="3"/><path d="M4 10h16M7 17v3M17 17v3"/><circle cx="8" cy="13.5" r=".8"/><circle cx="16" cy="13.5" r=".8"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3z"/>',
};
const icon = (n) => `<i data-icon="${n}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[n] || ''}</svg></i>`;
const LOGO = `<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="11" fill="#fdbb30"/><path d="M10 11l5 4.5h10l5-4.5v14.5C30 31 25 34 20 34s-10-3-10-8.5V11z" fill="#0b1f3a"/><circle cx="15.5" cy="21" r="4" fill="#fff"/><circle cx="24.5" cy="21" r="4" fill="#fff"/><circle cx="15.5" cy="21" r="1.8" fill="#0b1f3a"/><circle cx="24.5" cy="21" r="1.8" fill="#0b1f3a"/><path d="M18.5 25.5h3L20 28z" fill="#fdbb30"/></svg>`;

// =====================================================================
// State
// =====================================================================
const S = {
  clock: 8 * 60 + 20, slots: new Map(), feed: [], seq: 0, feedSeen: 0,
  history: [], lotHist: {}, auto: true, speed: 1, view: 'dashboard',
  // "Your permit": one setting shared by Dashboard, Live map and Find parking, remembered per browser
  myPermit: (() => { try { const v = localStorage.getItem('owlpark.permit'); return v && permitById(v) ? v : 'all'; } catch { return 'all'; } })(),
  selectedLot: null, bridge: false, watch: null,
  opsLot: LOTS[0].id, opsFilter: 'all', opsSensor: null, rebooting: new Set(),
  find: null, prevOpen: {}, showBus: true, clockAt: Date.now(), routeZoom: true,
  mapTheme: (() => { try { return localStorage.getItem('owlpark.mapTheme') === 'night' ? 'night' : 'day'; } catch { return 'day'; } })(), maps: { main: {}, find: {} },
  campus: (() => { try { return campusById(localStorage.getItem('owlpark.campus')) ? localStorage.getItem('owlpark.campus') : 'kennesaw'; } catch { return 'kennesaw'; } })(),
  live: new Set(), // slot keys reported by server.js (real ESP32 or simulator.js); the browser sim never touches these
};
const isSim = (s) => !S.live.has(s.key);

function randomizeSlot(s, target) {
  Object.assign(s, {
    occ: Math.random() < target, online: true, battery: rand(42, 100), rssi: Math.round(rand(-80, -47)),
    latency: Math.round(rand(140, 480)), fw: Math.random() < 0.88 ? '1.4.2' : '1.3.9',
    lastSeen: Date.now() - rand(0, 50e3),
  });
}

function seedData() {
  S.feed = []; S.history = []; S.lotHist = {}; S.watch = null; S.rebooting.clear();
  for (const l of LOTS) {
    const target = clamp(demandAt(S.clock) * l.demand, 0.05, 0.96);
    if (!l.slots.length) {
      for (let r = 0; r < l.rows; r++) for (let c = 0; c < l.cols; c++) {
        const id = String.fromCharCode(65 + r) + (c + 1);
        const s = { key: `${l.id}:${id}`, id, code: `${l.code}-${id}`, lot: l, r, c, els: [] };
        l.slots.push(s); S.slots.set(s.key, s);
      }
    }
    l.slots.forEach((s) => randomizeSlot(s, target));
  }
  const all = [...S.slots.values()];
  for (let i = 0; i < 5; i++) pick(all).battery = rand(7, 18);
  for (let i = 0; i < 2; i++) { const s = pick(all); s.online = false; s.lastSeen = Date.now() - rand(4, 40) * 60e3; }
  pick(all).rssi = -91;

  // Backfill some history so charts and trends aren't empty on load
  const pct = campusStats().pct;
  for (let i = 0; i < 40; i++) S.history.push(clamp(pct - (40 - i) * 0.004 + rand(-0.012, 0.012), 0, 1));
  for (const l of LOTS) S.lotHist[l.id] = Array(12).fill(lotStats(l).open);
  for (let i = 0; i < 8; i++) {
    const s = pick(all.filter((x) => x.online));
    S.feed.push({ id: ++S.seq, t: Date.now() - (i + 1) * rand(9, 22) * 1000, kind: s.occ ? 'arrive' : 'leave', slot: s, src: 'sim', ms: s.latency });
  }
  S.feedSeen = S.seq;
  S.prevOpen = {};
}

// =====================================================================
// Stats & prediction
// =====================================================================
function lotStats(l) {
  let open = 0, occ = 0, off = 0, low = 0, bat = 0;
  for (const s of l.slots) {
    if (!s.online) off++; else if (s.occ) occ++; else open++;
    if (s.battery < 20) low++;
    bat += s.battery;
  }
  const known = open + occ;
  return { open, occ, off, low, total: l.slots.length, pct: known ? occ / known : 0, avgBat: bat / l.slots.length };
}
function campusStats(lots = LOTS) {
  const t = { open: 0, occ: 0, off: 0, low: 0, total: 0, bat: 0, rssi: 0, lat: 0 };
  for (const l of lots) for (const s of l.slots) {
    t.total++; t.bat += s.battery; t.rssi += s.rssi; t.lat += s.latency;
    if (!s.online) t.off++; else if (s.occ) t.occ++; else t.open++;
    if (s.battery < 20) t.low++;
  }
  return { ...t, pct: t.occ / Math.max(1, t.open + t.occ), avgBat: t.bat / t.total, avgRssi: t.rssi / t.total, avgLat: t.lat / t.total, online: t.total - t.off };
}
function level(st) {
  const r = st.open / st.total;
  if (st.open === 0) return { k: 'red', label: 'Full' };
  if (r < 0.08) return { k: 'red', label: 'Almost full' };
  if (r < 0.25) return { k: 'amber', label: 'Filling up' };
  return { k: 'green', label: 'Open' };
}
// Change in open spaces over the last ~minute of samples
function trend(l) {
  const a = S.lotHist[l.id] || [];
  if (a.length < 2) return { d: 0, label: 'Steady', k: '' };
  const d = a[a.length - 1] - a[0];
  if (d <= -5) return { d, label: 'Filling fast', k: 't-down' };
  if (d <= -2) return { d, label: 'Filling up', k: 't-down' };
  if (d >= 2) return { d, label: 'Opening up', k: 't-up' };
  return { d, label: 'Steady', k: '' };
}
const WALK_M_PER_MIN = 80, DETOUR = 1.3; // paths aren't straight lines
function walkInfo(lot, place) {
  const a = rectClosest(lot, center(place));
  const b = rectClosest(place, a);
  const px = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  const onSide = a.x === lot.x || a.x === lot.x + lot.w;
  const mid = onSide ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
  const meters = px * campusOf(lot).mpp * DETOUR;
  return { a, b, mid, m: Math.round(meters / 10) * 10, min: Math.max(1, Math.round(meters / WALK_M_PER_MIN)) };
}
// ----- Individual spaces -----
function slotPos(s) {
  const x = s.lot.x + SLOT.padL + s.c * (SLOT.w + SLOT.gx), y = s.lot.y + SLOT.head + s.r * (SLOT.h + SLOT.gy);
  return { x, y, cx: x + SLOT.w / 2, cy: y + SLOT.h / 2 };
}
const isOpen = (s) => s && s.online && !s.occ;
/** Open spaces in a lot, nearest to point p first (e.g. the exit toward your building). */
function spotsNear(l, p) {
  return l.slots.filter(isOpen)
    .map((s) => { const q = slotPos(s); return { s, d: Math.hypot(q.cx - p.x, q.cy - p.y) }; })
    .sort((a, b) => a.d - b.d).map((x) => x.s);
}
const byRowNum = (a, b) => a.r - b.r || a.c - b.c;
function spotChips(spots, attr, activeKey, max = 99) {
  const shown = spots.slice(0, max).map((s) =>
    `<button class="spot-chip ${s.key === activeKey ? 'active' : ''}" ${attr}="${s.key}">${s.id}</button>`).join('');
  return shown + (spots.length > max ? `<span class="muted small">+${spots.length - max} more</span>` : '');
}

/** Rank lots for a trip. needBy = minutes since midnight the student must be at the destination. */
function recommend(placeId, needBy, permit) {
  const place = placeById(placeId);
  return lotsIn(place.campus).filter((l) => allows(l, permit)).map((l) => {
    const st = lotStats(l);
    const walk = walkInfo(l, place);
    const parkBy = needBy - walk.min - 3;
    const ahead = clamp(((parkBy - S.clock) + 1440) % 1440, 0, 600);
    const forecastOpen = st.total * (1 - clamp(demandAt(parkBy) * l.demand, 0, 0.98));
    const w = clamp(ahead / 60, 0, 1);
    const tr = clamp(trend(l).d * Math.min(ahead, 20) / 15, -st.total * 0.3, st.total * 0.3);
    const pred = Math.max(0, Math.round((1 - w) * (st.open + tr) + w * forecastOpen));
    const conf = ahead <= 20 ? 'High' : ahead <= 90 ? 'Medium' : 'Low';
    const risk = pred <= 2 ? 20 : pred <= 6 ? 8 : pred <= 12 ? 2 : 0;
    const score = walk.min + risk + (l.kind === 'Parking deck' ? 1 : 0);
    return { lot: l, st, walk, parkBy, pred, conf, score, ahead };
  }).sort((a, b) => a.score - b.score);
}

// =====================================================================
// Big Owl Bus (BUS_ROUTES / BUS_STOPS in campus-data.js). Demo schedule:
// bus k leaves the route's first stop at service[0] + k * headway, while within service hours.
// =====================================================================
const stopById = (id) => BUS_STOPS.find((s) => s.id === id);
const onMap = (s) => s && s.x != null;
const BUS_M_PER_MIN = 300; // average bus speed on campus, including slowing for stops
const PLANNED_ROUTES = BUS_ROUTES.filter((r) => r.stops);

/** Map path between two consecutive on-map stops: the route's waypoints, else an L shape. */
function segPoints(route, a, b) {
  const via = route.via && route.via[`${a.id}>${b.id}`];
  return [a, ...(via ? via.map(([x, y]) => ({ x, y })) : [{ x: a.x, y: b.y }]), b];
}
const polyLen = (pts) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - pts[i].x, p.y - pts[i].y), 0);
/** Point at distance d along a polyline. */
function pointAt(pts, d) {
  for (let i = 1; i < pts.length; i++) {
    const len = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (d <= len || i === pts.length - 1) {
      const f = len ? Math.min(1, d / len) : 0;
      return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * f };
    }
    d -= len;
  }
  return pts[0];
}
/** Minutes between two consecutive stops on a route. */
function segMin(route, a, b) {
  if (a.campus !== b.campus) return route.intercampusMin;
  if (!onMap(a) || !onMap(b)) return 4;
  const px = polyLen(segPoints(route, a, b));
  return Math.max(2, Math.round((px * campusById(a.campus).mpp) / BUS_M_PER_MIN) + 1);
}
/** Offsets (minutes from the first stop) for each stop, and the full loop time. Cached. */
function timing(route) {
  if (route._t) return route._t;
  const stops = route.stops.map(stopById), off = [0];
  for (let i = 1; i <= stops.length; i++) off.push(off[i - 1] + segMin(route, stops[i - 1], stops[i % stops.length]));
  return (route._t = { stops, off, cycle: off[stops.length] });
}
const rideMin = (route, i, j) => { const t = timing(route); return (t.off[j] - t.off[i] + t.cycle) % t.cycle; };
const runStarts = (route) => { const out = []; for (let s = route.service[0]; s <= route.service[1]; s += route.headway) out.push(s); return out; };
/** Next departures from stop i at or after `from` (minutes since midnight). */
function nextDepartures(route, i, from, n = 2) {
  const off = timing(route).off[i];
  return runStarts(route).map((s) => s + off).filter((t) => t >= from).slice(0, n);
}
/** Latest departure from stop i at or before `by`, or null. */
function latestDeparture(route, i, by) {
  const off = timing(route).off[i];
  const ok = runStarts(route).map((s) => s + off).filter((t) => t <= by);
  return ok.length ? ok[ok.length - 1] : null;
}
const isRunning = (route, t = S.clock) => !route.info && t >= route.service[0] && t <= route.service[1] + timing(route).cycle;

const walkToStop = (rect, stop) => {
  const p = rectClosest(rect, stop);
  const m = (Math.abs(p.x - stop.x) + Math.abs(p.y - stop.y)) * campusById(stop.campus).mpp * DETOUR;
  return Math.max(1, Math.round(m / WALK_M_PER_MIN));
};

/**
 * Best bus trip from a parking lot to a place, arriving by `needBy`.
 * Works backwards: the latest bus that still gets you there, so you can park as late as possible.
 */
function busTrip(lot, place, needBy) {
  let best = null;
  for (const route of PLANNED_ROUTES) {
    const { stops } = timing(route);
    stops.forEach((A, i) => {
      if (!onMap(A) || A.campus !== lot.campus) return;
      const walk1 = walkToStop(lot, A);
      if (walk1 > 10) return;
      stops.forEach((B, j) => {
        if (i === j || !onMap(B) || B.campus !== place.campus) return;
        const walk2 = walkToStop(place, B);
        if (walk2 > 10) return;
        const ride = rideMin(route, i, j);
        const dep = latestDeparture(route, i, needBy - walk2 - ride);
        if (dep == null) return;
        const parkBy = dep - walk1 - 2; // 2 min to park and get out of the car
        if (!best || parkBy > best.parkBy) {
          best = { route, from: A, to: B, walk1, walk2, ride, dep, parkBy, arrive: dep + ride + walk2, est: A.campus !== B.campus };
        }
      });
    });
  }
  return best;
}

/** Permit has no lots on the destination's campus: park on another campus and ride over. */
function parkAndRide(place, needBy, permit) {
  const opts = [];
  for (const l of LOTS) {
    if (l.campus === place.campus || !allows(l, permit)) continue;
    const trip = busTrip(l, place, needBy);
    if (!trip) continue;
    const st = lotStats(l);
    opts.push({ lot: l, st, trip, score: -trip.parkBy + (st.open <= 2 ? 30 : st.open <= 6 ? 8 : 0) });
  }
  return opts.sort((a, b) => a.score - b.score)[0] || null;
}

// =====================================================================
// Walking directions: turn the drawn route (an L-shaped walk) into plain steps,
// naming the buildings you pass and the roads you cross. North is up on the maps.
// =====================================================================
const COMPASS = { E: 'east', W: 'west', N: 'north', S: 'south' };
const TURNS = { 'E>S': 'right', 'S>W': 'right', 'W>N': 'right', 'N>E': 'right', 'E>N': 'left', 'N>W': 'left', 'W>S': 'left', 'S>E': 'left' };
const headingOf = (p, q) => {
  const dx = q.x - p.x, dy = q.y - p.y;
  if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return null;
  return Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'E' : 'W') : (dy > 0 ? 'S' : 'N');
};
const sideOfRect = (r, p) => (Math.abs(p.y - r.y) < 1 ? 'north' : Math.abs(p.y - (r.y + r.h)) < 1 ? 'south' : Math.abs(p.x - r.x) < 1 ? 'west' : 'east');
/** Road polylines (control points of curves are close enough for crossing checks). */
const roadPoints = (d) => { const n = d.match(/-?\d+(\.\d+)?/g).map(Number), pts = []; for (let i = 0; i + 1 < n.length; i += 2) pts.push({ x: n[i], y: n[i + 1] }); return pts; };
function segmentsCross(p1, p2, p3, p4) {
  const d = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  return d(p3, p4, p1) * d(p3, p4, p2) < 0 && d(p1, p2, p3) * d(p1, p2, p4) < 0;
}
const joinNames = (a) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);

/** Plain-language steps for walking from a lot (or a bus stop) to a place. */
function walkDirections(from, place, { fromStop = false } = {}) {
  const rect = fromStop ? { x: from.x, y: from.y, w: 0, h: 0, campus: from.campus } : from;
  const w = walkInfo(rect, place), campus = campusOf(place), mpp = campus.mpp * DETOUR;
  const steps = [fromStop ? `Get off at the ${from.name} stop` : `Exit ${from.short || from.name} on the ${sideOfRect(rect, w.a)} side`];
  const legs = [[w.a, w.mid], [w.mid, w.b]].filter(([p, q]) => headingOf(p, q));
  let prev = null;
  const named = new Set(); // name each landmark once
  legs.forEach(([p, q], i) => {
    const h = headingOf(p, q), len = Math.abs(q.x - p.x) + Math.abs(q.y - p.y);
    const hv = { x: Math.sign(q.x - p.x), y: Math.sign(q.y - p.y) };
    const near = placesIn(place.campus).filter((b) => b.id !== place.id).map((b) => {
      const xmin = Math.min(p.x, q.x), xmax = Math.max(p.x, q.x), ymin = Math.min(p.y, q.y), ymax = Math.max(p.y, q.y);
      const dx = Math.max(b.x - xmax, 0, xmin - (b.x + b.w)), dy = Math.max(b.y - ymax, 0, ymin - (b.y + b.h));
      const c = center(b), side = hv.x * (c.y - p.y) - hv.y * (c.x - p.x) > 0 ? 'right' : 'left';
      return { b, dist: Math.hypot(dx, dy), along: hv.x * (c.x - p.x) + hv.y * (c.y - p.y), side };
    }).filter((n) => n.dist <= 26 && n.along > 0 && n.along < len && !named.has(n.b.id)).sort((a, b) => a.along - b.along).slice(0, 2);
    near.forEach((n) => named.add(n.b.id));
    const crosses = campus.roads.filter((r) => { const pts = roadPoints(r.d); return pts.slice(1).some((s, k) => segmentsCross(p, q, pts[k], s)); }).map((r) => r.label);
    const meters = Math.max(10, Math.round((len * mpp) / 10) * 10);
    let s = i === 0 ? `Head ${COMPASS[h]} for about ${meters} m` : `Turn ${TURNS[`${prev}>${h}`] || ''} and go ${COMPASS[h]} for about ${meters} m`.replace('  ', ' ');
    if (crosses.length) s += `, crossing ${joinNames(crosses)}`;
    if (near.length) s += `, passing ${joinNames(near.map((n) => `${n.b.name} on your ${n.side}`))}`;
    steps.push(s);
    prev = h;
  });
  steps.push(`${place.name} is straight ahead`);
  return { steps, minutes: w.min, meters: w.m };
}

// =====================================================================
// Day planner: several classes in one day. Per campus, pick the one lot that keeps
// the walk to the first class and back from the last class shortest (and is likely to
// have space at arrival), then plan each walk between classes. A day on both campuses
// gets a drive-or-bus step between them.
// =====================================================================
const toMin = (s) => { const m = /^(\d{1,2}):(\d{2})$/.exec(s || ''); return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : null; };

function planDay(classes, permit) {
  if (!permitById(permit)) return { error: 'Unknown permit.' };
  const items = classes.map((c) => ({ place: placeById(c.destination), at: toMin(c.arrive_by) }));
  if (!items.length || items.length > 8 || items.some((c) => !c.place || c.at == null)) return { error: 'Give 1 to 8 classes, each with a destination id and an HH:MM time.' };
  items.sort((a, b) => a.at - b.at);
  const segments = [];
  for (const c of items) {
    const last = segments[segments.length - 1];
    if (last && last.campus === c.place.campus) last.classes.push(c); else segments.push({ campus: c.place.campus, classes: [c] });
  }
  const out = { permit: permitName(permit), demo_time_now: fmt(S.clock), segments: [] };
  const DRIVE_MIN = 20; // Kennesaw <-> Marietta by car, estimate
  let prevLot = null, prevLast = null;
  segments.forEach((seg, si) => {
    const first = seg.classes[0], lastC = seg.classes[seg.classes.length - 1];
    const so = { campus: campusById(seg.campus).name };
    const ranked = recommend(first.place.id, first.at, permit);
    // Getting here from the previous campus: drive your car over, or ride the bus from your last class
    if (si > 0 && prevLast) {
      const t = busTrip(prevLast.place, first.place, first.at);
      const driveLot = ranked[0];
      so.travel_from_previous_campus = {
        drive: driveLot
          ? { leave_previous_campus_by: fmt(driveLot.parkBy - DRIVE_MIN - (prevLot ? walkInfo(prevLast.place, prevLot).min : 0)), drive_minutes_estimate: DRIVE_MIN, park_at: driveLot.lot.name }
          : null,
        bus: t ? {
          leave: prevLast.place.name, leave_by: fmt(t.dep - t.walk1), walk_to_stop_minutes: t.walk1, board_at_stop: t.from.name,
          route: t.route.name, bus_departs: fmt(t.dep), ride_minutes: t.ride, ride_time_is_estimate: t.est,
          get_off_at: t.to.name, walk_from_stop_minutes: t.walk2, arrive_about: fmt(t.arrive),
          note: prevLot ? `Your car stays at ${prevLot.name}; ride back to it later.` : undefined,
        } : null,
      };
    }
    if (!ranked.length) {
      const pr = parkAndRide(first.place, first.at, permit);
      so.no_lots_for_this_permit_on_this_campus = true;
      so.park_and_ride = pr ? tripJSON(pr.trip, pr.lot, spotsNear(pr.lot, pr.trip.from)[0]) : null;
    } else {
      // Score each allowed lot for the whole stay: walk in + walk back out + risk of no space at arrival
      const best = ranked.map((x) => {
        const back = walkInfo(x.lot, lastC.place).min;
        const risk = x.pred <= 2 ? 20 : x.pred <= 6 ? 8 : x.pred <= 12 ? 2 : 0;
        return { x, back, score: x.walk.min + back + risk };
      }).sort((a, b) => a.score - b.score)[0];
      const spot = spotsNear(best.x.lot, best.x.walk.a)[0];
      so.park = { ...lotJSON(best.x, spot || null), walk_back_to_car_after_last_class_minutes: best.back,
        walking_directions_to_first_class: walkDirections(best.x.lot, first.place).steps };
      so.lot_id = best.x.lot.id;
      prevLot = best.x.lot;
      // Is moving the car worth it before a far-away class with a long break before it?
      for (let i = 1; i < seg.classes.length; i++) {
        const c = seg.classes[i], gap = c.at - seg.classes[i - 1].at;
        const own = recommend(c.place.id, c.at, permit)[0], fromPlan = walkInfo(best.x.lot, c.place).min;
        if (own && own.lot.id !== best.x.lot.id && gap >= 90 && fromPlan - own.walk.min >= 8) {
          (so.tips = so.tips || []).push(`Before ${c.place.name} at ${fmt(c.at)}, you could move the car to ${own.lot.name} (${own.walk.min}-min walk instead of ${fromPlan}); about ${own.pred} spaces are likely open then.`);
        }
      }
    }
    prevLast = lastC;
    so.classes = seg.classes.map((c, i) => {
      const prev = seg.classes[i - 1];
      const leg = prev ? walkInfo(prev.place, c.place) : null;
      return { class_at: c.place.name, arrive_by: fmt(c.at), ...(leg ? { walk_from_previous_class_minutes: leg.min, walk_from_previous_class_meters: leg.m } : {}) };
    });
    out.segments.push(so);
  });
  return out;
}

// =====================================================================
// Events & mutations
// =====================================================================
function log(kind, slot, extra = {}) {
  S.feed.unshift({ id: ++S.seq, t: Date.now(), kind, slot, src: 'sim', ms: slot.latency, ...extra });
  if (S.feed.length > 80) S.feed.pop();
}
function paintSlot(s) {
  const cls = `slot ${!s.online ? 'off' : s.occ ? 'occ' : 'open'}`;
  for (const el of s.els) {
    el.setAttribute('class', cls + ' ping');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.setAttribute('class', cls), 900);
  }
}
function setOcc(s, occ, src = 'sim') {
  if (!s.online || s.occ === occ) return false;
  s.occ = occ; s.lastSeen = Date.now(); s.latency = Math.round(rand(140, 480));
  paintSlot(s);
  log(occ ? 'arrive' : 'leave', s, { src });
  checkWatch(s.lot);
  invalidate();
  return true;
}
function setOnline(s, online, src = 'sim') {
  if (s.online === online) return;
  s.online = online; if (online) s.lastSeen = Date.now();
  paintSlot(s);
  log(online ? 'online' : 'offline', s, { src });
  invalidate();
}
function carArrives(lot, src = 'sim') {
  const c = lot.slots.filter((s) => s.online && !s.occ && isSim(s));
  return c.length ? setOcc(pick(c), true, src) : false;
}
function carLeaves(lot, src = 'sim') {
  const c = lot.slots.filter((s) => s.online && s.occ && isSim(s));
  return c.length ? setOcc(pick(c), false, src) : false;
}
function noCandidateToast(lot, what) {
  toast(lot.slots.every((s) => !isSim(s)) ? `Every space in ${lot.short} is reported by live sensors` : `That lot is ${what}`);
}
function checkWatch(lot) {
  if (!S.watch || S.watch.lotId !== lot.id) return;
  if (lotStats(lot).open > 3) return;
  const alt = recommend(S.watch.placeId, S.watch.needBy, S.watch.permit).find((r) => r.lot.id !== lot.id && r.st.open > 5);
  toast(`${lot.name} is almost full.${alt ? ` Try ${alt.lot.name}: ${alt.st.open} open, ${alt.walk.min} min walk.` : ''}`, 'warn');
  S.watch = null;
}

// Background traffic tuned toward the demand curve for the demo clock
function step() {
  const total = S.slots.size;
  let r = Math.random() * total, lot = LOTS[0];
  for (const l of LOTS) { r -= l.slots.length; if (r <= 0) { lot = l; break; } }
  const st = lotStats(lot);
  const target = clamp(demandAt(S.clock) * lot.demand + rand(-0.04, 0.04), 0.03, 0.97);
  const pArrive = clamp(0.5 + (target - st.pct) * 3, 0.08, 0.92);
  Math.random() < pArrive ? carArrives(lot) : carLeaves(lot);

  // heartbeats
  const all = [...S.slots.values()];
  for (let i = 0; i < 10; i++) { const s = pick(all); if (s.online) s.lastSeen = Date.now(); }

  const x = Math.random();
  const offline = all.filter((s) => !s.online && !S.rebooting.has(s.key) && isSim(s));
  if (x < 0.008) { const s = pick(all.filter((s) => s.online && isSim(s))); if (s) setOnline(s, false); }
  else if (x < 0.03) {
    const s = pick(all.filter((s) => s.online && s.battery >= 20 && isSim(s)));
    if (s) { const before = s.battery; s.battery = Math.max(3, s.battery - rand(4, 14)); if (before >= 20 && s.battery < 20) { log('battery', s); invalidate(); } }
  } else if (x < 0.05 && offline.length > 2) setOnline(pick(offline), true);
}

function burst(n, occ, lots, ms = 3000) {
  let i = 0;
  const iv = setInterval(() => {
    occ ? carArrives(pick(lots)) : carLeaves(pick(lots));
    if (++i >= n) clearInterval(iv);
  }, ms / n);
}
// Scenarios run on the campus being viewed
const EVENT_LOTS = {
  kennesaw: { venue: 'Convocation Center', lots: ['east-deck', 'east-economy', 'v2-visitor'] },
  marietta: { venue: 'Event Center', lots: ['mar-lot-e', 'mar-south-lot', 'mar-visitor'] },
};
const SCENARIOS = {
  rush: () => { S.clock = 8 * 60 + 50; burst(80, true, curLots().filter((l) => allows(l, 'students')), 4000); toast(`Morning rush: ${curCampus().name} student lots are filling up`); },
  change: () => { burst(35, false, curLots(), 2000); setTimeout(() => burst(35, true, curLots(), 2500), 2300); toast('Class change: cars leaving, then a new wave arriving'); },
  event: () => { const ev = EVENT_LOTS[S.campus]; burst(50, true, ev.lots.map(lotById), 3500); toast(`Event at the ${ev.venue}: nearby lots filling`); },
  evening: () => { S.clock = 17 * 60 + 30; burst(110, false, curLots(), 4500); toast(`Evening: the ${curCampus().name} campus is clearing out`); },
};

// =====================================================================
// Map (SVG)
// =====================================================================
const NS = 'http://www.w3.org/2000/svg';
function el(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
function seeded(seed) { return () => ((seed = (seed * 16807) % 2147483647) / 2147483647); }

// Split a label into at most two lines that fit roughly `maxChars` each
function wrap2(name, maxChars) {
  if (name.length <= maxChars) return [name];
  const words = name.split(' ');
  let best = [name], bestLen = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
    const len = Math.max(a.length, b.length);
    if (len < bestLen) { best = [a, b]; bestLen = len; }
  }
  return best;
}

/** Shared SVG defs (filters, patterns, gradients) used by every campus map. Created once. */
function ensureMapDefs() {
  if ($('#map-defs')) return;
  const svg = el('svg', { id: 'map-defs', width: 0, height: 0, 'aria-hidden': 'true', style: 'position:absolute;width:0;height:0;overflow:hidden' });
  svg.innerHTML = `<defs>
    <filter id="mp-blur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3.2"/></filter>
    <radialGradient id="mp-ground-day" cx="50%" cy="42%" r="75%"><stop offset="0" stop-color="#f1f5ea"/><stop offset="1" stop-color="#dbe5d0"/></radialGradient>
    <radialGradient id="mp-ground-night" cx="50%" cy="40%" r="78%"><stop offset="0" stop-color="#1a2d4c"/><stop offset="1" stop-color="#0a1322"/></radialGradient>
    <linearGradient id="mp-sheen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <pattern id="mp-mow-day" width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(32)"><rect width="18" height="18" fill="#cfe4c1"/><rect width="9" height="18" fill="#d9ebcd"/></pattern>
    <pattern id="mp-mow-night" width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(32)"><rect width="18" height="18" fill="#163428"/><rect width="9" height="18" fill="#193a2d"/></pattern>
    <pattern id="mp-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="#6b7686"/><rect width="2" height="5" fill="#8a95a5"/></pattern>
    <pattern id="mp-windows" width="9" height="8" patternUnits="userSpaceOnUse"><rect x="2" y="2" width="4" height="3" rx=".6" fill="#ffd67a"/></pattern>
    <pattern id="mp-deck-side" width="11" height="10" patternUnits="userSpaceOnUse"><rect width="11" height="10" fill="#2a313c"/><rect x="2" y="1.5" width="7" height="3" rx=".8" fill="#59636f"/></pattern>
  </defs>`;
  document.body.prepend(svg);
}

/** Closed, wobbly ring (for topographic contour lines). */
function wobbleRing(cx, cy, r, rnd) {
  const a1 = rnd() * 6.3, a2 = rnd() * 6.3, k1 = 0.06 + rnd() * 0.06, k2 = 0.03 + rnd() * 0.05, pts = [];
  for (let i = 0; i < 72; i++) {
    const t = (i / 72) * Math.PI * 2, rr = r * (1 + k1 * Math.sin(3 * t + a1) + k2 * Math.sin(5 * t + a2));
    pts.push(`${(cx + rr * Math.cos(t)).toFixed(1)} ${(cy + rr * Math.sin(t) * 0.8).toFixed(1)}`);
  }
  return 'M' + pts.join(' L') + 'Z';
}

function buildMap(host, campus, { interactive = false } = {}) {
  ensureMapDefs();
  const { w: W, h: H } = campus;
  const lots = lotsIn(campus.id), places = placesIn(campus.id);
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: `campus-map theme-${S.mapTheme}${interactive ? ' interactive' : ''}`, 'data-campus': campus.id, role: 'img', 'aria-label': `Schematic ${campus.name} campus parking map with live space status` });
  const clipId = `clip-${campus.id}-${interactive ? 'm' : 'f'}`;
  el('rect', { x: 0, y: 0, width: W, height: H, rx: 16 }, el('clipPath', { id: clipId }, el('defs', {}, svg)));
  const world = el('g', { 'clip-path': `url(#${clipId})` }, svg);
  el('rect', { x: 0, y: 0, width: W, height: H, class: 'm-ground' }, world);

  // Topographic contours (a nod to Kennesaw Mountain), deterministic per campus
  const rnd = seeded(campus.id.length * 7 + 3);
  const contours = el('g', { class: 'm-contours' }, world);
  for (let c = 0; c < 3; c++) {
    const cx = W * (0.15 + rnd() * 0.7), cy = H * (0.15 + rnd() * 0.7);
    for (let k = 1; k <= 7; k++) el('path', { d: wobbleRing(cx, cy, 40 * k + rnd() * 10, rnd) }, contours);
  }

  // Lawns with mowing stripes
  for (const g of campus.greens) el('rect', { x: g.x, y: g.y, width: g.w, height: g.h, rx: 22, class: 'm-lawn' }, world);

  // Soft shadows for everything that stands up (one blur filter for the whole layer)
  const shadows = el('g', { class: 'm-shadows', filter: 'url(#mp-blur)' }, world);

  // Trees: shadow + canopy + highlight, kept off lots, buildings, greens and the map furniture
  const furniture = [
    { x: campus.cartouche[0], y: campus.cartouche[1], w: campus.cartouche[2], h: 62 },
    { x: campus.compass[0] - 28, y: campus.compass[1] - 28, w: 56, h: 56 },
  ];
  const blocks = [...lots, ...places, ...campus.greens, ...furniture];
  const trees = el('g', { class: 'm-trees' }, world);
  let n = 0;
  for (let i = 0; i < 900 && n < Math.round((W * H) / 6500); i++) {
    const x = 12 + rnd() * (W - 24), y = 12 + rnd() * (H - 24), r = 4.5 + rnd() * 6.5;
    if (blocks.some((b) => x > b.x - 12 && x < b.x + b.w + 12 && y > b.y - 12 && y < b.y + b.h + 16)) continue;
    n++;
    el('circle', { cx: x + 2.5, cy: y + 3.5, r }, shadows);
    el('circle', { cx: x, cy: y, r, class: `m-tree t${1 + Math.floor(rnd() * 3)}` }, trees);
    el('circle', { cx: x - r * 0.3, cy: y - r * 0.35, r: r * 0.45, class: 'm-tree-hi' }, trees);
  }

  // Roads: casing, surface, painted center line; highways get a shield
  for (const r of campus.roads) el('path', { d: r.d, class: r.hwy ? 'm-hwy-edge' : 'm-road-edge' }, world);
  for (const r of campus.roads) el('path', { d: r.d, class: r.hwy ? 'm-hwy' : 'm-road' }, world);
  for (const r of campus.roads) el('path', { d: r.d, class: r.hwy ? 'm-hwy-line' : 'm-road-line' }, world);
  for (const g of campus.greens) el('text', { x: g.x + g.w / 2, y: g.y + g.h / 2 + 4, class: 'm-green-label', 'text-anchor': 'middle' }, world).textContent = g.label;

  // Big Owl Bus route lines: consecutive stops that are both drawn on this map
  const busLines = el('g', { class: 'bus-layer' }, world);
  for (const r of PLANNED_ROUTES) {
    const st = timing(r).stops;
    st.forEach((a, i) => {
      const b = st[(i + 1) % st.length];
      if (a === b || !onMap(a) || !onMap(b) || a.campus !== campus.id || b.campus !== campus.id) return;
      el('path', { d: 'M' + segPoints(r, a, b).map((p) => `${p.x} ${p.y}`).join(' L'), class: 'bus-line', stroke: r.color }, busLines);
    });
  }

  // Road names and shields on top of bus lines so they stay readable
  for (const r of campus.roads) {
    const [x, y] = r.at;
    if (r.shield) {
      const g = el('g', { class: 'm-shield', transform: `translate(${x} ${y})` }, world);
      el('path', { d: 'M-11 -10 Q0 -14.5 11 -10 L11 2 Q11 10.5 0 14 Q-11 10.5 -11 2 Z', class: 'sh-body' }, g);
      el('path', { d: 'M-11 -10 Q0 -14.5 11 -10 L11 -4.5 L-11 -4.5 Z', class: 'sh-top' }, g);
      el('text', { x: 0, y: 7 }, g).textContent = r.shield;
      el('title', {}, g).textContent = r.label;
      continue;
    }
    el('text', { x, y: y + 3.5, class: 'm-road-label', transform: r.rot ? `rotate(${r.rot} ${x} ${y})` : '' }, world).textContent = r.label;
  }

  // Buildings: 2.5D blocks (wall band + roof + sheen; lit windows at night)
  const BLD_H = 6;
  for (const p of places) {
    el('rect', { x: p.x + 4, y: p.y + 7, width: p.w, height: p.h, rx: 6 }, shadows);
    const g = el('g', { class: 'm-bldg', 'data-place': p.id }, world);
    el('rect', { x: p.x, y: p.y + BLD_H, width: p.w, height: p.h, rx: 6, class: 'b-wall' }, g);
    el('rect', { x: p.x, y: p.y, width: p.w, height: p.h, rx: 6, class: 'b-roof' }, g);
    el('rect', { x: p.x + 4, y: p.y + 4, width: p.w - 8, height: p.h - 8, rx: 3, class: 'b-windows' }, g);
    el('rect', { x: p.x, y: p.y, width: p.w, height: p.h, rx: 6, class: 'b-sheen' }, g);
    const lines = wrap2(p.name, Math.floor(p.w / 6.2));
    lines.forEach((ln, i) => {
      el('text', { x: p.x + p.w / 2, y: p.y + p.h / 2 + 3.5 + (i - (lines.length - 1) / 2) * 12 }, g).textContent = ln;
    });
    el('title', {}, g).textContent = p.name;
  }

  // Lots: asphalt with painted stalls; decks stand taller with open-level side walls
  const lotGroups = {};
  for (const l of lots) {
    const deck = l.kind === 'Parking deck', ext = deck ? 9 : 3;
    el('rect', { x: l.x + 4, y: l.y + 8, width: l.w, height: l.h + ext, rx: 8 }, shadows);
    const g = el('g', { class: `m-lot ${deck ? 'deck' : 'surface'}`, 'data-lotg': l.id }, world);
    lotGroups[l.id] = g;
    el('rect', { x: l.x, y: l.y + ext, width: l.w, height: l.h, rx: 8, class: 'm-lot-wall' }, g);
    if (deck) el('rect', { x: l.x + 5, y: l.y + l.h, width: l.w - 10, height: ext - 2, class: 'm-deck-side' }, g);
    el('rect', { x: l.x, y: l.y, width: l.w, height: l.h, rx: 8, class: 'm-lot-frame' }, g);
    el('path', { d: `M${l.x} ${l.y + 21} V${l.y + 8} a8 8 0 0 1 8 -8 H${l.x + l.w - 8} a8 8 0 0 1 8 8 V${l.y + 21} Z`, class: 'm-lot-head' }, g);
    const badge = el('g', { class: 'm-p', transform: `translate(${l.x + 11.5} ${l.y + 10.5})` }, g);
    el('rect', { x: -6.5, y: -6.5, width: 13, height: 13, rx: 3.5 }, badge);
    el('text', { x: 0, y: 3.6 }, badge).textContent = 'P';
    el('text', { x: l.x + 22, y: l.y + 14.5, class: 'm-lot-title' }, g).textContent = l.short;
    const pill = el('g', { class: 'm-count-pill' }, g);
    const bg = el('rect', { y: l.y + 4, height: 13, rx: 6.5 }, pill);
    const t = el('text', { y: l.y + 13.8 }, pill);
    l.countEls.push({ t, bg, pill, right: l.x + l.w - 5, narrow: l.cols <= 6 });

    // painted stall lines: a head line per row and dividers between stalls (one path per lot)
    let d = '';
    for (let row = 0; row < l.rows; row++) {
      const y0 = l.y + SLOT.head + row * (SLOT.h + SLOT.gy), x0 = l.x + SLOT.padL;
      const x1 = x0 + l.cols * (SLOT.w + SLOT.gx) - SLOT.gx;
      d += `M${x0 - 1.5} ${y0 - 1.5} H${x1 + 1.5}`;
      for (let c = 0; c <= l.cols; c++) { const x = x0 + c * (SLOT.w + SLOT.gx) - 1.5; d += `M${x} ${y0 - 1.5} V${y0 + SLOT.h}`; }
      el('text', { x: l.x + 10, y: y0 + SLOT.h / 2 + 3.5, class: 'm-row' }, g).textContent = String.fromCharCode(65 + row);
    }
    el('path', { d, class: 'm-stall-lines' }, g);

    for (const s of l.slots) {
      const p = slotPos(s);
      const sg = el('g', { class: `slot ${!s.online ? 'off' : s.occ ? 'occ' : 'open'}`, 'data-k': s.key }, g);
      el('rect', { x: p.x + 0.5, y: p.y + 0.5, width: SLOT.w - 1, height: SLOT.h - 1, rx: 2.5, class: 'stall' }, sg);
      el('rect', { x: p.x + 1.5, y: p.y + 1.5, width: SLOT.w - 3, height: SLOT.h - 3, rx: 3.5, class: 'car' }, sg);
      el('rect', { x: p.x + 3, y: p.y + 4, width: SLOT.w - 6, height: 4, rx: 1.2, class: 'glass' }, sg);
      el('text', { x: p.cx, y: p.cy + 5.2, class: 'm-num' }, sg).textContent = s.c + 1;
      el('title', {}, sg).textContent = `${l.short} · Space ${s.id}`;
      s.els.push(sg);
    }
  }

  // Map furniture: title block and compass rose
  const [cx0, cy0, cw] = campus.cartouche;
  const cart = el('g', { class: 'm-cartouche', transform: `translate(${cx0} ${cy0})` }, world);
  el('rect', { width: cw, height: 62, rx: 12 }, cart);
  const logo = el('g', { transform: 'translate(11 15) scale(.8)' }, cart);
  logo.innerHTML = LOGO.replace(/^<svg[^>]*>|<\/svg>$/g, '');
  el('text', { x: 49, y: 27, class: 'ct-title' }, cart).textContent = `${campus.name.toUpperCase()} CAMPUS`;
  el('text', { x: 49, y: 41, class: 'ct-sub' }, cart).textContent = 'Kennesaw State University';
  el('text', { x: 49, y: 53, class: 'ct-note' }, cart).textContent = 'OwlPark live · not to scale';
  const [kx, ky] = campus.compass;
  const comp = el('g', { class: 'm-compass', transform: `translate(${kx} ${ky})` }, world);
  el('circle', { r: 22, class: 'cp-ring' }, comp);
  el('path', { d: 'M0 -17 L5 0 L0 -3 L-5 0 Z', class: 'cp-n' }, comp);
  el('path', { d: 'M0 17 L5 0 L0 3 L-5 0 Z', class: 'cp-s' }, comp);
  el('text', { x: 0, y: -25, class: 'cp-label' }, comp).textContent = 'N';

  // Bus stops and (moving) buses, above lots
  const busTop = el('g', { class: 'bus-layer' }, world);
  for (const s of BUS_STOPS) {
    if (s.campus !== campus.id || !onMap(s)) continue;
    const routes = PLANNED_ROUTES.filter((r) => r.stops.includes(s.id));
    const g = el('g', { class: 'bus-stop', transform: `translate(${s.x} ${s.y})` }, busTop);
    el('circle', { r: 7.5 }, g);
    el('path', { d: 'M-3.2 -3.4h6.4a1 1 0 0 1 1 1v5.2h-8.4v-5.2a1 1 0 0 1 1-1zM-4.2 0h8.4', class: 'bus-glyph' }, g);
    el('title', {}, g).textContent = `Big Owl Bus stop · ${s.name}\n${routes.map((r) => r.name).join('\n')}`;
  }
  const buses = el('g', { class: 'bus-layer bus-vehicles' }, busTop);
  const route = el('g', { class: 'route' }, world);
  const mark = el('g', { class: 'spot-mark' }, world);
  host.appendChild(svg);

  svg.addEventListener('click', (e) => {
    const sl = e.target.closest('[data-k]');
    if (interactive && sl) {
      const s = S.slots.get(sl.dataset.k);
      if (!isSim(s)) return toast(`Space ${s.code} is reported by a live sensor, so it can't be toggled here.`, 'warn');
      if (!s.online) return toast(`Sensor ${s.code} is offline. Reboot it from Sensor Ops.`, 'warn');
      setOcc(s, !s.occ, 'manual');
      S.selectedLot = s.lot.id;
      return;
    }
    const lg = e.target.closest('[data-lotg]');
    if (lg && interactive) { S.selectedLot = S.selectedLot === lg.dataset.lotg ? null : lg.dataset.lotg; invalidate(); }
  });
  return { svg, route, mark, lotGroups, buses, campus };
}

/** Place buses that are currently between two stops drawn on this map (demo schedule). */
function drawBuses(map) {
  map.buses.replaceChildren();
  if (!S.showBus) return;
  const T = demoNow();
  for (const r of PLANNED_ROUTES) {
    const { stops, off, cycle } = timing(r);
    for (const start of runStarts(r)) {
      const e = T - start;
      if (e < 0 || e >= cycle) continue;
      const i = off.findIndex((o, k) => e >= o && e < off[k + 1]);
      const a = stops[i], b = stops[(i + 1) % stops.length];
      if (!onMap(a) || !onMap(b) || a.campus !== map.campus.id || b.campus !== map.campus.id) continue;
      // dwell 1 min at the stop, then drive along the same path as the drawn line
      const seg = off[i + 1] - off[i], f = Math.max(0, (e - off[i] - 1) / Math.max(1, seg - 1));
      const pts = segPoints(r, a, b), { x, y } = pointAt(pts, f * polyLen(pts));
      const g = el('g', { class: 'bus-veh', transform: `translate(${x.toFixed(1)} ${y.toFixed(1)})` }, map.buses);
      el('rect', { x: -9, y: -7, width: 18, height: 14, rx: 4, fill: r.color }, g);
      el('path', { d: 'M-5 -3h10M-5 2h10', class: 'bus-veh-glyph' }, g);
      el('title', {}, g).textContent = `${r.name} → ${b.name}`;
    }
  }
}
/** Demo clock in fractional minutes, so buses glide between clock ticks. */
function demoNow() {
  const frac = S.auto ? Math.min(S.speed, ((Date.now() - S.clockAt) / 4000) * S.speed) : 0;
  return S.clock + frac;
}

/** Gold ring + label around one space. */
function markSpot(map, s) {
  if (map.markedKey === (s && s.key)) return;
  map.markedKey = s && s.key;
  map.mark.replaceChildren();
  if (!s) return;
  const p = slotPos(s);
  el('rect', { x: p.x - 3, y: p.y - 3, width: SLOT.w + 6, height: SLOT.h + 6, rx: 5, class: 'spot-ring' }, map.mark);
  const g = el('g', { class: 'spot-pill', transform: `translate(${p.cx} ${p.y - 14})` }, map.mark);
  el('rect', { x: -19, y: -10, width: 38, height: 19, rx: 9.5 }, g);
  el('text', { x: 0, y: 3.8 }, g).textContent = s.id;
}

function drawRoute(map, lot, place) {
  map.route.replaceChildren();
  const w = walkInfo(lot, place);
  const d = `M${w.a.x} ${w.a.y} L${w.mid.x} ${w.mid.y} L${w.b.x} ${w.b.y}`;
  el('path', { d, class: 'route-casing' }, map.route);
  el('path', { d, class: 'route-line' }, map.route);
  el('circle', { cx: w.a.x, cy: w.a.y, r: 8, class: 'route-start' }, map.route);
  el('circle', { cx: w.b.x, cy: w.b.y, r: 8, class: 'route-end' }, map.route);
  const lx = clamp(w.mid.x, 60, 940), ly = clamp(w.mid.y - 22, 20, 610);
  const pill = el('g', { class: 'route-pill', transform: `translate(${lx} ${ly})` }, map.route);
  el('rect', { x: -44, y: -14, width: 88, height: 28, rx: 14 }, pill);
  el('text', { x: 0, y: 4.5 }, pill).textContent = `${w.min} min walk`;
  map.svg.querySelectorAll('.m-bldg').forEach((b) => b.classList.toggle('dest', b.dataset.place === place.id));
  for (const id in map.lotGroups) map.lotGroups[id].classList.toggle('sel', id === lot.id);
  zoomRoute(map, lot, place);
}

// Frame the walking route (lot + destination) instead of the whole campus, so the
// route is readable on a phone. "Whole campus" in the card header switches back.
function zoomRoute(map, lot, place) {
  const campus = campusOf(lot);
  const key = `${lot.id}|${place.id}|${S.routeZoom}`;
  if (map.zoomKey === key) return;
  map.zoomKey = key;
  let target = [0, 0, campus.w, campus.h];
  if (S.routeZoom) {
    const pad = 70;
    let x0 = Math.min(lot.x, place.x) - pad, y0 = Math.min(lot.y, place.y) - pad - 20;
    let x1 = Math.max(lot.x + lot.w, place.x + place.w) + pad, y1 = Math.max(lot.y + lot.h, place.y + place.h) + pad;
    // Keep a sensible minimum size and a landscape-ish shape, then stay inside the campus
    const minW = 420, minH = 300;
    let w = Math.max(x1 - x0, minW, (y1 - y0) * 1.1), h = Math.max(y1 - y0, minH, w * 0.62);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    w = Math.min(w, campus.w); h = Math.min(h, campus.h);
    x0 = clamp(cx - w / 2, 0, campus.w - w); y0 = clamp(cy - h / 2, 0, campus.h - h);
    target = [x0, y0, w, h];
  }
  const from = (map.svg.getAttribute('viewBox') || '').split(/\s+/).map(Number);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || from.length !== 4 || map.svg.getBoundingClientRect().width === 0) {
    map.svg.setAttribute('viewBox', target.map((v) => v.toFixed(1)).join(' '));
    return;
  }
  const t0 = performance.now(), dur = 520;
  cancelAnimationFrame(map.zoomRaf);
  const tick = (now) => {
    const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
    map.svg.setAttribute('viewBox', from.map((v, i) => (v + (target[i] - v) * e).toFixed(1)).join(' '));
    if (p < 1) map.zoomRaf = requestAnimationFrame(tick);
  };
  map.zoomRaf = requestAnimationFrame(tick);
}

// =====================================================================
// Rendering
// =====================================================================
let dirty = false;
function invalidate() {
  if (dirty) return;
  dirty = true;
  requestAnimationFrame(() => { dirty = false; renderAll(); });
}

function renderAll() {
  $$('[data-clock]').forEach((e) => (e.textContent = fmt(S.clock)));
  for (const l of LOTS) {
    const st = lotStats(l);
    for (const c of l.countEls) {
      const txt = c.narrow ? `${st.open}` : `${st.open} open`;
      if (c.t.textContent !== txt) {
        const w = Math.max(18, txt.length * 5.6 + 12);
        c.t.textContent = txt;
        c.bg.setAttribute('x', c.right - w); c.bg.setAttribute('width', w);
        c.t.setAttribute('x', c.right - w / 2);
      }
      c.pill.setAttribute('data-level', level(st).k);
    }
  }
  $('#bridge-dot').classList.toggle('on', S.bridge);
  // Only claim hardware when the server has actually forwarded sensor readings
  $('#bridge-text').textContent = !S.bridge ? 'Demo simulation'
    : S.live.size ? `${S.live.size} live sensor${S.live.size === 1 ? '' : 's'} reporting` : 'Sensor server online';
  if (S.view === 'dashboard') renderDashboard();
  else if (S.view === 'map') renderMap();
  else if (S.view === 'find') renderFind();
  else if (S.view === 'ops') renderOps();
  else if (S.view === 'bus') renderBus();
}


function kpi(ic, tone, label, val, sub, extra = '') {
  return `<div class="kpi"><div class="kpi-top"><span class="kpi-icon tone-${tone}">${icon(ic)}</span>${label}</div><div class="kpi-val">${val}</div><div class="kpi-sub">${sub}</div>${extra}</div>`;
}
function sparkline(arr, w = 96, h = 34) {
  if (arr.length < 2) return '';
  const min = Math.min(...arr) - 0.02, max = Math.max(...arr) + 0.02;
  const pts = arr.map((v, i) => [(i / (arr.length - 1)) * w, h - ((v - min) / (max - min)) * h]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><path d="${d} L${w} ${h} L0 ${h}Z" fill="rgba(37,99,235,.1)"/><path d="${d}" fill="none" stroke="#2563eb" stroke-width="2" stroke-linejoin="round"/></svg>`;
}
function meter(st, extraCls = '') {
  const lv = level(st);
  return `<div class="meter ${extraCls}"><span class="fill-${lv.k}" style="width:${(st.occ / st.total) * 100}%"></span><span class="off" style="width:${(st.off / st.total) * 100}%"></span></div>`;
}

const FEED_KIND = {
  arrive:  { ic: 'down',    tone: 'red',   title: 'Car parked',         detail: () => 'status: occupied' },
  leave:   { ic: 'up',      tone: 'green', title: 'Space opened',       detail: () => 'status: open' },
  offline: { ic: 'wifiOff', tone: 'gray',  title: 'Sensor offline',     detail: () => 'missed heartbeat' },
  online:  { ic: 'wifi',    tone: 'blue',  title: 'Sensor reconnected', detail: () => 'heartbeat OK' },
  battery: { ic: 'battery', tone: 'amber', title: 'Low battery',        detail: (e) => `battery ${Math.round(e.slot.battery)}%` },
  fix:     { ic: 'check',   tone: 'blue',  title: 'Sensor serviced',    detail: () => 'battery 100%' },
};
function feedHTML(items, compact = false) {
  if (!items.length) return '<li class="all-clear">No activity yet</li>';
  return items.map((e) => {
    const k = FEED_KIND[e.kind];
    const tag = e.src === 'esp32' ? '<span class="tag">ESP32</span>' : e.src === 'simapi' ? '<span class="tag">Sensor API</span>' : e.src === 'manual' ? '<span class="tag tag-you">You</span>' : '';
    return `<li class="feed-item ${e.id > S.feedSeen ? 'new' : ''}">
      <span class="fi-icon tone-${k.tone}">${icon(k.ic)}</span>
      <div class="fi-body"><div class="fi-title">${k.title} <span class="fi-lot">· ${compact ? `Space ${e.slot.id}` : `${esc(e.slot.lot.short)} ${e.slot.id}`}</span></div>
      <div class="fi-meta">${e.slot.code} · ${k.detail(e)}${e.kind === 'arrive' || e.kind === 'leave' ? ` · ${e.ms} ms` : ''} ${tag}</div></div>
      <time>${ago(e.t)}</time></li>`;
  }).join('');
}

/** Explain that a permit has no lots on a campus, and where it does work. */
function noLotsHint(permit, campusId) {
  const elsewhere = CAMPUSES.filter((c) => c.id !== campusId && lotsIn(c.id).some((l) => allows(l, permit)));
  return `Your ${esc(permitName(permit))} permit doesn't cover any lots on the ${campusById(campusId).name} campus.`
    + (elsewhere.length ? ` It's valid on the ${elsewhere.map((c) => c.name).join(' and ')} campus.` : '');
}

// ---------- Dashboard ----------
function renderDashboard() {
  const cp = curCampus(), lots = curLots();
  const c = campusStats(lots);
  $('#hero-eyebrow').textContent = `${cp.name} campus · demo data`;
  $('#hero-open').textContent = c.open;
  $('#hero-sub').textContent = `${Math.round(c.pct * 100)}% of ${c.total} sensor-equipped spaces are occupied across ${lots.length} ${cp.name} lots. Updated the moment a car arrives or leaves.`;
  const hub = placeById(cp.hub);
  const mine = S.myPermit !== 'all';
  const best = recommend(hub.id, S.clock + 20, mine ? S.myPermit : 'students')[0];
  const heroLabel = mine ? `Best bet for your ${esc(permitName(S.myPermit))} permit` : 'Best bet for students now';
  if (!best) {
    $('#hero-best').innerHTML = `
      <div class="hb-label">${icon('star')} ${heroLabel}</div>
      <div class="hb-name">No ${esc(permitName(S.myPermit))} lots here</div>
      <div class="hb-meta">${noLotsHint(S.myPermit, cp.id)}</div>`;
  } else {
    const heroSpot = spotsNear(best.lot, best.walk.a)[0];
    $('#hero-best').innerHTML = `
      <div class="hb-label">${icon('star')} ${heroLabel}</div>
      <div class="hb-name">${esc(best.lot.name)}${heroSpot ? ` <span class="hb-spot">Space ${heroSpot.id}</span>` : ''}</div>
      <div class="hb-meta"><b>${best.st.open}</b> open · ${best.walk.min} min walk to ${esc(hub.name)}</div>
      ${meter(best.st, 'hb-bar')}
      <a class="hb-link" href="#find">Plan a different trip →</a>`;
  }

  $('#kpis').innerHTML =
    kpi('car', 'green', 'Open spaces', c.open, `of ${c.total} monitored`) +
    kpi('pulse', 'blue', 'Campus occupancy', `${Math.round(c.pct * 100)}<small>%</small>`, 'last few minutes', sparkline(S.history)) +
    kpi('wifi', c.off ? 'amber' : 'green', 'Sensors online', `${c.online}<small>/${c.total}</small>`, `${c.off} offline · ${c.low} low battery`) +
    kpi('signal', 'gold', 'Sensor → app', `${Math.round(c.avgLat)}<small> ms</small>`, 'average update latency');

  const hubPt = hubPoint(cp);
  const shown = lots.filter((l) => allows(l, S.myPermit));
  $('#lot-cards').innerHTML = !shown.length
    ? `<div class="card empty-note">${icon('alert')}<span>${noLotsHint(S.myPermit, cp.id)}</span></div>`
    : shown.map((l) => {
    const st = lotStats(l), lv = level(st), tr = trend(l), prev = S.prevOpen[l.id];
    const bump = prev == null || prev === st.open ? '' : st.open > prev ? 'bump-up' : 'bump-down';
    S.prevOpen[l.id] = st.open;
    return `<button class="lot-card" data-lot="${l.id}">
      <div class="lc-top"><div><div class="lc-name">${esc(l.name)}</div><div class="lc-kind">${l.kind} · ${esc(l.area)} permit</div></div><span class="badge badge-${lv.k}">${lv.label}</span></div>
      <div class="lc-count"><span class="lc-num c-${lv.k} ${bump}">${st.open}</span><span class="lc-of">open of ${st.total}</span></div>
      ${meter(st)}
      <div class="lc-spots">${(() => {
        const sp = spotsNear(l, rectClosest(l, hubPt));
        return sp.length ? `Open: ${sp.slice(0, 4).map((s) => `<b>${s.id}</b>`).join(', ')}${sp.length > 4 ? ` +${sp.length - 4}` : ''}` : 'No open spaces';
      })()}</div>
      <div class="lc-foot"><span>${Math.round(st.pct * 100)}% full</span><span class="trend ${tr.k}">${tr.label}</span></div>
    </button>`;
  }).join('');

  const healthy = c.off === 0 && c.low === 0;
  $('#net-badge').className = `badge badge-${healthy ? 'green' : c.off > 3 ? 'red' : 'amber'}`;
  $('#net-badge').textContent = healthy ? 'Healthy' : `${c.off + c.low} need attention`;
  $('#net-status').innerHTML = `
    <div class="net-row"><span class="muted">Sensors reporting</span><b>${c.online} / ${c.total}</b></div>
    <div class="meter"><span class="fill-green" style="width:${(c.online / c.total) * 100}%"></span></div>
    <div class="net-grid">
      <div class="net-cell"><b>2 / 2</b><span>Wi-Fi gateways online</span></div>
      <div class="net-cell"><b>${Math.round(c.avgBat)}%</b><span>Average battery</span></div>
      <div class="net-cell"><b class="${c.low ? 'c-amber' : ''}">${c.low}</b><span>Low-battery alerts</span></div>
      <div class="net-cell"><b class="${c.off ? 'c-red' : ''}">${c.off}</b><span>Offline sensors</span></div>
    </div>
    <a class="net-link" href="#ops">Open sensor operations →</a>`;

  $('#feed').innerHTML = feedHTML(S.feed.filter((e) => e.slot.lot.campus === S.campus).slice(0, 14));
  S.feedSeen = S.seq;
}

// ---------- Map ----------
function renderMap() {
  $('#map-title').textContent = `${curCampus().name} campus map`;
  showCampusMap(S.maps.main, S.campus);
  const m = S.maps.main[S.campus];
  for (const id in S.maps.main) S.maps.main[id].svg.classList.toggle('no-bus', !S.showBus);
  drawBuses(m);
  for (const l of curLots()) {
    m.lotGroups[l.id].classList.toggle('dim', !allows(l, S.myPermit));
    m.lotGroups[l.id].classList.toggle('sel', S.selectedLot === l.id);
  }
  const panel = $('#lot-panel');
  const l = S.selectedLot && lotById(S.selectedLot);
  const ms = S.mapSpot && S.slots.get(S.mapSpot);
  markSpot(m, ms && l && ms.lot === l ? ms : null);
  if (!l) {
    const c = campusStats(curLots());
    panel.innerHTML = `
      <div class="lp-kind">${curCampus().name} campus overview</div>
      <div class="lp-head"><h3>${c.open} open spaces</h3></div>
      <div class="lp-stats"><div><b class="c-green">${c.open}</b><span>Open</span></div><div><b class="c-red">${c.occ}</b><span>Occupied</span></div><div><b>${c.off}</b><span>No signal</span></div></div>
      <div class="lp-sec"><h4>Lots</h4><ul class="lot-rows">${curLots().map((x) => {
        const st = lotStats(x);
        return `<li class="lot-row" data-sel="${x.id}"><span class="lr-name">${esc(x.short)}</span><span class="lr-meter">${meter(st)}</span><b class="c-${level(st).k}">${st.open}</b></li>`;
      }).join('')}</ul></div>
      <div class="hint-box">${icon('car')}<span>Select a lot for details, or tap a space to simulate a car arriving or leaving.</span></div>`;
    return;
  }
  const st = lotStats(l), lv = level(st), tr = trend(l);
  const walks = placesIn(l.campus).map((p) => ({ p, w: walkInfo(l, p) })).sort((a, b) => a.w.m - b.w.m).slice(0, 4);
  panel.innerHTML = `
    <div class="lp-head"><div><div class="lp-kind">${l.kind} · ${esc(l.area)} permit</div><h3>${esc(l.name)}</h3></div><span class="badge badge-${lv.k}">${lv.label}</span></div>
    <div class="lp-stats"><div><b class="c-green">${st.open}</b><span>Open</span></div><div><b class="c-red">${st.occ}</b><span>Occupied</span></div><div><b>${st.off}</b><span>No signal</span></div></div>
    ${meter(st)}
    <div class="lc-foot" style="margin-top:8px"><span>${Math.round(st.pct * 100)}% full</span><span class="trend ${tr.k}">${tr.label}</span></div>
    <div class="lp-sec"><h4>Open spaces (${st.open})</h4>${st.open
      ? `<div class="spot-chips">${spotChips(l.slots.filter(isOpen).sort(byRowNum), 'data-mspot', S.mapSpot)}</div><p class="hint" style="margin-top:8px">Tap a space number to find it on the map.</p>`
      : '<p class="hint">No open spaces right now. This updates live.</p>'}</div>
    <div class="lp-sec"><h4>Permits accepted</h4><div class="chips">${l.permits.map((p) => `<span class="badge ${p === S.myPermit ? 'badge-green' : 'badge-blue'}">${esc(permitName(p))}</span>`).join('')}</div>
      ${S.myPermit !== 'all' && !allows(l, S.myPermit) ? `<p class="hint" style="margin-top:8px">Your ${esc(permitName(S.myPermit))} permit isn't valid here.</p>` : ''}</div>
    <div class="lp-sec"><h4>Closest buildings</h4><ul class="walks">${walks.map(({ p, w }) => `<li><span>${esc(p.name)}</span><b>${w.min} min walk</b></li>`).join('')}</ul></div>
    <div class="lp-sec"><h4>Recent activity</h4><ul class="feed compact">${feedHTML(S.feed.filter((e) => e.slot.lot === l).slice(0, 5), true)}</ul></div>
    <div class="lp-sec row-gap"><button class="btn btn-ghost btn-sm" data-act="arrive-sel">${icon('down')}Car arrives</button><button class="btn btn-ghost btn-sm" data-act="leave-sel">${icon('up')}Car leaves</button><button class="btn btn-ghost btn-sm" data-act="clear-sel">All lots</button></div>`;
}

/** Step-by-step park & ride directions. */
function busCardHTML(trip, lot, place, spot, { title, sub, tone = 'blue' }) {
  const r = trip.route;
  return `<div class="card bus-card">
    <div class="best-top"><span class="badge badge-${tone}">${icon('bus')} ${title}</span><span class="badge" style="background:${r.color};color:#fff">${esc(r.short || r.name)}</span></div>
    ${sub ? `<p class="muted" style="margin:10px 0 0">${sub}</p>` : ''}
    <ol class="trip-steps">
      <li><span class="ts-icon">${icon('car')}</span><div>Park at <b>${esc(lot.name)}</b>${spot ? ` · Space <b>${spot.id}</b>` : ''} by <b>${fmt(trip.parkBy)}</b><small>${esc(campusOf(lot).name)} campus · ${lotStats(lot).open} open now</small></div></li>
      <li><span class="ts-icon">${icon('walk')}</span><div>Walk ${trip.walk1} min to ${/^The /.test(trip.from.name) ? '' : 'the '}<b>${esc(trip.from.name)}</b> stop</div></li>
      <li><span class="ts-icon ts-bus" style="background:${r.color}">${icon('bus')}</span><div>Catch the <b>${fmt(trip.dep)}</b> ${esc(r.name)} bus<small>${trip.est ? 'About ' : ''}${trip.ride} min${trip.est ? ' (estimated)' : ''} to <b>${esc(trip.to.name)}</b></small></div></li>
      <li><span class="ts-icon">${icon('pin')}</span><div>Walk ${trip.walk2} min to <b>${esc(place.name)}</b><small>Arrive about ${fmt(trip.arrive)}</small></div></li>
    </ol>
    <p class="fine">Demo bus schedule: KSU doesn't publish how often buses run. Check live times in the <a href="https://kennesawstate.passiogo.com/" target="_blank" rel="noopener">Passio GO!</a> app. ${esc(r.name)}: ${r.hours.map(esc).join(' · ')}.</p>
  </div>`;
}

function showCampusMap(maps, campusId) {
  for (const id in maps) maps[id].svg.style.display = id === campusId ? '' : 'none';
}

// ---------- Find ----------
function renderFind() {
  const f = S.find;
  $('#find-empty').hidden = !!f;
  $('#find-map-card').hidden = !f;
  if (!f) { $('#find-best').innerHTML = $('#find-alts').innerHTML = $('#find-warn').innerHTML = $('#find-bus').innerHTML = $('#find-day').innerHTML = ''; return; }
  $('#find-day').innerHTML = S.dayPlan ? dayPlanHTML(S.dayPlan) : '';
  const place = placeById(f.placeId);
  const ranked = recommend(f.placeId, f.needBy, f.permit);
  if (!ranked.length) {
    // No lots for this permit here: park on the other campus and take the Big Owl Bus over
    const pr = parkAndRide(place, f.needBy, f.permit);
    $('#find-warn').innerHTML = `<div class="warn-box">${icon('alert')}<span>${noLotsHint(f.permit, place.campus)}${pr ? ' You can park there and ride the Big Owl Bus.' : ' Visitor parking is open to everyone.'}</span></div>`;
    $('#find-best').innerHTML = pr ? busCardHTML(pr.trip, pr.lot, place, spotsNear(pr.lot, pr.trip.from)[0], {
      title: 'Park & ride', tone: 'gold',
      sub: `Your permit works at ${esc(pr.lot.name)} on the ${esc(campusOf(pr.lot).name)} campus. The ${esc(pr.trip.route.name)} takes you to ${esc(place.name)}.` }) : '';
    $('#find-alts').innerHTML = $('#find-bus').innerHTML = '';
    $('#find-map-card').hidden = true;
    return;
  }
  const r = ranked.find((x) => x.lot.id === f.chosen) || ranked[0];
  const lv = level(r.st), tr = trend(r.lot);
  const isTop = r.lot.id === f.top;
  const closer = ranked.find((x) => x.walk.min < r.walk.min && x.pred <= 6);
  const confTone = r.conf === 'High' ? 'green' : r.conf === 'Medium' ? 'amber' : 'red';

  $('#find-warn').innerHTML = ranked.every((x) => x.pred <= 3)
    ? `<div class="warn-box">${icon('alert')}<span>Parking looks tight for ${esc(permitName(f.permit))} permits around ${fmt(f.needBy)}. Try arriving 15–20 minutes earlier.</span></div>` : '';

  const watching = S.watch && S.watch.lotId === r.lot.id;

  // Pick the exact space: the one you chose, else the open space closest to the exit toward your building
  const spots = spotsNear(r.lot, r.walk.a);
  const pinned = f.pinned && S.slots.get(f.pinned);
  const spot = pinned && pinned.lot === r.lot && isOpen(pinned) ? pinned : spots[0];
  const prev = f.spot && S.slots.get(f.spot);
  if (prev && prev.lot === r.lot && spot !== prev && !isOpen(prev)) {
    toast(spot ? `Space ${prev.id} was just taken. Head to ${spot.id} instead.` : `Space ${prev.id} was just taken. ${r.lot.short} is now full.`, 'warn');
    f.pinned = null;
  }
  f.spot = spot ? spot.key : null;
  const others = spots.filter((s) => s !== spot);
  const callout = spot ? `
      <div class="spot-callout">
        <div class="spot-badge">${spot.id}</div>
        <div class="spot-text">
          <div class="spot-title">Space ${spot.id} is open now</div>
          <div class="spot-sub">${esc(r.lot.short)} · Row ${spot.id[0]}, space ${spot.c + 1} · ${spot === spots[0] ? `closest open space to the exit toward ${esc(place.name)}` : 'your pick'}</div>
        </div>
      </div>
      ${others.length ? `<div class="spot-more"><span class="muted small">Also open, tap one to choose it:</span><div class="spot-chips">${spotChips(others, 'data-spot', null, 12)}</div></div>` : ''}`
    : `<div class="spot-callout none"><div class="spot-text"><div class="spot-title">No open spaces in ${esc(r.lot.short)} right now</div><div class="spot-sub">Space numbers update live as cars leave.</div></div></div>`;
  $('#find-best').innerHTML = `
    <div class="card best">
      <div class="best-top"><span class="badge ${isTop ? 'badge-gold' : 'badge-blue'}">${f.dayPick === r.lot.id ? `${icon('star')} Best for your day` : isTop ? `${icon('star')} Best match` : 'Your pick'}</span><span class="badge badge-${confTone}">${r.conf} confidence</span></div>
      <h3>${esc(r.lot.name)}</h3>
      <div class="muted">${campusOf(r.lot).name} campus · ${r.lot.kind} · ${esc(r.lot.area)} permit · <span class="c-${lv.k}">${r.st.open} open now</span></div>
      ${callout}
      <div class="best-stats">
        <div><span class="bs-val">~${r.pred}</span><span class="bs-label">spaces likely open at ${fmt(r.parkBy)}</span></div>
        <div><span class="bs-val">${r.walk.min} min</span><span class="bs-label">walk · ${r.walk.m} m</span></div>
        <div><span class="bs-val">${fmt(r.parkBy)}</span><span class="bs-label">park by, to arrive at ${fmt(f.needBy)}</span></div>
      </div>
      <ul class="reasons">
        <li>${icon('check')}<span>${r.st.open} spaces open right now, ${tr.label.toLowerCase()}</span></li>
        <li>${icon('check')}<span>${r.walk.min}-minute walk to ${esc(place.name)}</span></li>
        ${closer && closer.lot !== r.lot ? `<li>${icon('check')}<span>${esc(closer.lot.name)} is closer but likely to have only ~${closer.pred} spaces</span></li>` : ''}
        <li>${icon('check')}<span>Forecast blends live sensors with typical demand at ${fmt(r.parkBy)}</span></li>
      </ul>
      <div class="best-actions">
        <button class="btn ${watching ? 'btn-ghost on' : 'btn-primary'}" data-act="watch" data-lot="${r.lot.id}">${icon('bell')}${watching ? 'Alert on' : 'Alert me if it fills'}</button>
        <button class="btn btn-ghost" data-act="view-lot" data-lot="${r.lot.id}">${icon('map')}See spaces on map</button>
      </div>
    </div>`;

  $('#find-route-label').textContent = `${r.lot.short} → ${place.name} · ${r.walk.m} m`;
  showCampusMap(S.maps.find, place.campus);
  const fmap = S.maps.find[place.campus];
  drawRoute(fmap, r.lot, place);
  markSpot(fmap, spot);
  $('#find-directions').innerHTML = walkDirections(r.lot, place).steps.map((s) => `<li>${esc(s)}</li>`).join('');

  const alts = ranked.filter((x) => x.lot.id !== r.lot.id).slice(0, 3);
  $('#find-alts').innerHTML = alts.length ? `<div class="card alts"><h4>Other options</h4>${alts.map((x, i) => {
    const lv2 = level(x.st);
    return `<div class="alt"><span class="alt-rank">${i + 2}</span><div class="alt-main"><b>${esc(x.lot.name)}</b><span>${x.walk.min} min walk · ~${x.pred} likely open at ${fmt(x.parkBy)}</span></div>
      <span class="badge badge-${lv2.k}">${x.st.open} open</span><button class="btn btn-ghost btn-sm" data-choose="${x.lot.id}">Choose</button></div>`;
  }).join('')}</div>` : '';

  // Big Owl Bus: offer it when it gets you there faster, or replaces a long walk
  const trip = busTrip(r.lot, place, f.needBy);
  const faster = trip && trip.parkBy > r.parkBy;
  const useful = trip && trip.walk1 + trip.walk2 < r.walk.min && (faster || r.walk.min >= 8);
  $('#find-bus').innerHTML = useful ? busCardHTML(trip, r.lot, place, spotsNear(r.lot, trip.from)[0], {
    title: faster ? 'Faster by bus' : 'Skip the long walk',
    sub: faster
      ? `Walking from ${esc(r.lot.short)} means parking by ${fmt(r.parkBy)}. With the bus you can park as late as ${fmt(trip.parkBy)}.`
      : `Walking from ${esc(r.lot.short)} takes ${r.walk.min} min. By bus you walk ${trip.walk1 + trip.walk2} min in total.`,
  }) : '';
}

// ---------- Big Owl Bus ----------
function renderBus() {
  const T = S.clock;
  const km = BUS_ROUTES.find((r) => r.id === 'km');
  const deps = (stopId, n = 3) => {
    const i = km.stops.indexOf(stopId), d = nextDepartures(km, i, T, n);
    return d.length ? d.map(fmt).join(' · ') : 'No more buses today';
  };
  $('#bus-between').innerHTML = `
    <div class="bb-col"><div class="bb-dir">Kennesaw → Marietta</div>
      <div class="bb-stop"><span>The Commons</span><b>${deps('k-commons')}</b></div>
      <div class="bb-stop"><span>KSU Bookstore/Rec Center</span><b>${deps('k-rec')}</b></div></div>
    <div class="bb-col"><div class="bb-dir">Marietta → Kennesaw</div>
      <div class="bb-stop"><span>Marietta Student Center</span><b>${deps('m-student-center')}</b></div>
      <div class="bb-note">About ${km.intercampusMin} min between campuses (estimate)</div></div>`;

  $('#bus-routes').innerHTML = BUS_ROUTES.map((r) => {
    const running = isRunning(r);
    const status = r.info ? '<span class="badge">See Passio GO!</span>'
      : `<span class="badge badge-${running ? 'green' : 'gray'}">${running ? 'Running now' : 'Not running now'}</span>`;
    const stops = r.info
      ? r.stopNames.map((n) => `<li><span class="rs-name">${esc(n)}</span></li>`).join('')
      : timing(r).stops.map((s, i) => {
          const d = nextDepartures(r, i, T, 2);
          return `<li><span class="rs-name">${esc(s.name)}${onMap(s) ? '' : ' <small>(off map)</small>'}</span><span class="rs-time">${d.length ? d.map(fmt).join(', ') : '—'}</span></li>`;
        }).join('');
    return `<div class="card route-card">
      <div class="rc-head"><span class="rc-dot" style="background:${r.color}"></span><h3>${esc(r.name)}</h3>${status}</div>
      <div class="rc-hours">${r.hours.map(esc).join(' · ')}${r.headway ? ` · demo: every ${r.headway} min` : ''}</div>
      <ol class="route-stops" style="--rc:${r.color}">${stops}</ol>
    </div>`;
  }).join('');
}

// ---------- Ops ----------
function alertsList() {
  const out = [];
  for (const s of S.slots.values()) {
    if (s.lot.campus !== S.campus) continue;
    if (!s.online) out.push({ s, sev: 0, tone: 'red', ic: 'wifiOff', title: 'Sensor offline', desc: `No heartbeat since ${ago(s.lastSeen)}`, act: 'reboot', label: S.rebooting.has(s.key) ? 'Rebooting…' : 'Reboot' });
    else if (s.battery < 20) out.push({ s, sev: 1, tone: 'amber', ic: 'battery', title: `Low battery · ${Math.round(s.battery)}%`, desc: 'Replace within 7 days', act: 'battery', label: 'Mark replaced' });
    else if (s.rssi < -88) out.push({ s, sev: 2, tone: 'blue', ic: 'signal', title: 'Weak Wi-Fi signal', desc: `${s.rssi} dBm · check gateway placement`, act: 'signal', label: 'Mark fixed' });
  }
  return out.sort((a, b) => a.sev - b.sev);
}
function renderOps() {
  const c = campusStats(curLots()), al = alertsList();
  $('#ops-title').textContent = `Sensor operations · ${curCampus().name}`;
  $('#ops-kpis').innerHTML =
    kpi('wifi', c.off ? 'amber' : 'green', 'Sensors online', `${c.online}<small>/${c.total}</small>`, `${((c.online / c.total) * 100).toFixed(1)}% uptime`) +
    kpi('alert', al.length ? 'red' : 'green', 'Active alerts', al.length, `${c.off} offline · ${c.low} battery`) +
    kpi('battery', 'gold', 'Avg battery', `${Math.round(c.avgBat)}<small>%</small>`, 'est. 14 months remaining') +
    kpi('signal', 'blue', 'Avg signal', `${Math.round(c.avgRssi)}<small> dBm</small>`, 'Wi-Fi RSSI') +
    kpi('gateway', 'navy', 'Gateways', '2<small>/2</small>', 'GW-North · GW-South');

  $('#alert-count').className = `badge badge-${al.length ? 'red' : 'green'}`;
  $('#alert-count').textContent = al.length ? `${al.length} open` : 'All clear';
  $('#alerts').innerHTML = al.length ? al.map((a) => `
    <li class="alert"><span class="fi-icon tone-${a.tone}">${icon(a.ic)}</span>
      <div class="alert-body"><b>${a.title}</b><span>${a.s.code} · ${esc(a.s.lot.short)} · ${a.desc}</span></div>
      <button class="btn btn-ghost btn-sm" data-alert="${a.act}" data-key="${a.s.key}" ${S.rebooting.has(a.s.key) ? 'disabled' : ''}>${a.label}</button></li>`).join('')
    : `<li class="all-clear">${icon('check')}<div>No open alerts. Every sensor is healthy.</div></li>`;

  $('#ops-table').innerHTML = `<thead><tr><th>Lot</th><th>Open</th><th>Occupied</th><th>Offline</th><th>Occupancy</th><th>Avg battery</th><th>Health</th></tr></thead><tbody>${curLots().map((l) => {
    const st = lotStats(l);
    const h = st.off > 1 ? ['red', 'Degraded'] : st.off || st.low ? ['amber', 'Attention'] : ['green', 'Healthy'];
    return `<tr><td>${esc(l.name)}</td><td class="c-green"><b>${st.open}</b></td><td>${st.occ}</td><td>${st.off}</td><td>${meter(st)}${Math.round(st.pct * 100)}%</td><td>${Math.round(st.avgBat)}%</td><td><span class="badge badge-${h[0]}">${h[1]}</span></td></tr>`;
  }).join('')}</tbody>`;

  if (lotById(S.opsLot).campus !== S.campus) { S.opsLot = curLots()[0].id; S.opsSensor = null; }
  const opsSel = $('#ops-lot');
  if (opsSel.dataset.campus !== S.campus) {
    opsSel.innerHTML = curLots().map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('');
    opsSel.dataset.campus = S.campus;
  }
  opsSel.value = S.opsLot;
  const lot = lotById(S.opsLot);
  const grid = $('#sensor-grid');
  grid.style.gridTemplateColumns = `repeat(${lot.cols}, minmax(40px, 1fr))`;
  grid.innerHTML = lot.slots.map((s) => {
    const health = !s.online ? 'offline' : s.battery < 20 ? 'low' : '';
    const match = S.opsFilter === 'all' || (S.opsFilter === 'low' && s.battery < 20) || (S.opsFilter === 'offline' && !s.online);
    return `<button class="sensor ${health} ${match ? '' : 'faded'} ${S.opsSensor === s.key ? 'selected' : ''}" data-sensor="${s.key}" title="${s.code} · ${Math.round(s.battery)}% battery">
      <span class="s-occ ${!s.online ? 'off' : s.occ ? 'occ' : ''}"></span><span class="s-id">${s.id}</span><span class="s-bat"><i style="width:${s.battery}%"></i></span></button>`;
  }).join('');

  const s = S.opsSensor && S.slots.get(S.opsSensor);
  $('#sensor-detail').innerHTML = !s ? `<div class="all-clear">${icon('wifi')}<div>Select a sensor to see its health and actions.</div></div>` : `
    <div class="sd-head"><h4>${s.code}</h4><span class="badge badge-${!s.online ? 'red' : s.battery < 20 ? 'amber' : 'green'}">${!s.online ? 'Offline' : s.battery < 20 ? 'Low battery' : 'Healthy'}</span></div>
    <dl class="sd-list">
      <dt>Space</dt><dd>${esc(s.lot.short)} · ${s.id}</dd>
      <dt>Reading</dt><dd class="${!s.online ? '' : s.occ ? 'c-red' : 'c-green'}">${!s.online ? 'No signal' : s.occ ? 'Occupied' : 'Open'}</dd>
      <dt>Battery</dt><dd>${Math.round(s.battery)}%</dd>
      <dt>Signal</dt><dd>${s.rssi} dBm</dd>
      <dt>Last heartbeat</dt><dd>${ago(s.lastSeen)}</dd>
      <dt>Latency</dt><dd>${s.latency} ms</dd>
      <dt>Firmware</dt><dd>v${s.fw}${s.fw !== '1.4.2' ? ' <span class="badge badge-amber">update</span>' : ''}</dd>
      <dt>Hardware</dt><dd>ESP32 + HC-SR04</dd>
    </dl>
    <div class="sd-actions">
      <button class="btn btn-ghost btn-sm" data-alert="ping" data-key="${s.key}">${icon('signal')}Ping</button>
      <button class="btn btn-ghost btn-sm" data-alert="reboot" data-key="${s.key}" ${S.rebooting.has(s.key) ? 'disabled' : ''}>${icon('refresh')}${S.rebooting.has(s.key) ? 'Rebooting…' : 'Reboot'}</button>
      <button class="btn btn-ghost btn-sm" data-alert="battery" data-key="${s.key}">${icon('battery')}Replace battery</button>
    </div>`;
}

// =====================================================================
// Interactions
// =====================================================================
const TITLES = { dashboard: 'Dashboard', map: 'Live map', find: 'Find parking', bus: 'Big Owl Bus', ops: 'Sensor operations' };
function route() {
  const v = location.hash.slice(1);
  S.view = TITLES[v] ? v : 'dashboard';
  $$('.view').forEach((e) => (e.hidden = e.id !== `view-${S.view}`));
  $$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === S.view));
  $('#page-title').textContent = TITLES[S.view];
  window.scrollTo({ top: 0 });
  renderAll();
}

function toast(msg, tone = 'info') {
  const t = document.createElement('div');
  t.className = `toast toast-${tone}`;
  t.innerHTML = `${icon(tone === 'warn' ? 'alert' : 'check')}<span>${esc(msg)}</span>`;
  $('#toasts').append(t);
  setTimeout(() => t.classList.add('out'), 4200);
  setTimeout(() => t.remove(), 4700);
}

function sensorAction(act, key) {
  const s = S.slots.get(key);
  if (act === 'reboot') {
    if (S.rebooting.has(key)) return;
    if (!isSim(s)) return toast(`${s.code} is a live sensor. Power-cycle the device to reboot it.`, 'warn');
    S.rebooting.add(key);
    if (s.online) { s.online = false; paintSlot(s); }
    invalidate();
    toast(`Rebooting ${s.code}…`);
    setTimeout(() => { S.rebooting.delete(key); setOnline(s, true); toast(`${s.code} is back online`); }, 1600);
  } else if (act === 'battery') {
    s.battery = 100; log('fix', s); toast(`${s.code} battery replaced`); invalidate();
  } else if (act === 'signal') {
    s.rssi = Math.round(rand(-68, -55)); toast(`${s.code} signal marked fixed`); invalidate();
  } else if (act === 'ping') {
    if (!s.online) return toast(`${s.code} did not respond`, 'warn');
    s.latency = Math.round(rand(120, 380)); s.lastSeen = Date.now();
    toast(`${s.code} responded in ${s.latency} ms`); invalidate();
  }
}

function openSim(open) {
  $('#sim').classList.toggle('open', open);
  $('#scrim').hidden = !open;
}

document.addEventListener('click', (e) => {
  const t = e.target.closest('button, [data-sel], [data-lot]');
  if (!t) return;
  const d = t.dataset;
  if (d.campusBtn) { setCampus(d.campusBtn); return; }
  if (d.sel) { S.selectedLot = d.sel; invalidate(); return; }
  if (d.choose) { S.find.chosen = d.choose; S.find.pinned = null; invalidate(); return; }
  if (d.spot) { S.find.pinned = d.spot; invalidate(); return; }
  if (d.mspot) { S.mapSpot = S.mapSpot === d.mspot ? null : d.mspot; invalidate(); return; }
  if (d.ofilter) { S.opsFilter = d.ofilter; $$('[data-ofilter]').forEach((b) => b.classList.toggle('active', b === t)); invalidate(); return; }
  if (d.speed) { S.speed = +d.speed; $$('[data-speed]').forEach((b) => b.classList.toggle('active', b === t)); return; }
  if (d.sensor) { S.opsSensor = d.sensor; invalidate(); return; }
  if (d.alert) { sensorAction(d.alert, d.key); return; }
  if (d.scn) { SCENARIOS[d.scn](); return; }
  if (d.fault) {
    // Faults hit the campus being viewed so you can see them; "restore" fixes both campuses
    const all = [...S.slots.values()].filter((x) => isSim(x) && (d.fault === 'restore' || x.lot.campus === S.campus));
    const none = () => toast('Every sensor is live, so there is nothing to simulate', 'warn');
    if (d.fault === 'offline') { const s = pick(all.filter((x) => x.online)); if (!s) return none(); setOnline(s, false); toast(`${s.code} stopped reporting`, 'warn'); }
    if (d.fault === 'battery') { const s = pick(all.filter((x) => x.online && x.battery >= 20)); if (!s) return none(); s.battery = rand(6, 14); log('battery', s); invalidate(); toast(`${s.code} battery at ${Math.round(s.battery)}%`, 'warn'); }
    if (d.fault === 'restore') {
      for (const s of all) { if (!s.online && !S.rebooting.has(s.key)) setOnline(s, true); if (s.battery < 20) { s.battery = 100; log('fix', s); } if (s.rssi < -88) s.rssi = -66; }
      invalidate(); toast('All sensors restored');
    }
    return;
  }
  if (d.act === 'watch') {
    if (S.watch && S.watch.lotId === d.lot) { S.watch = null; toast('Alert turned off'); }
    else { S.watch = { lotId: d.lot, placeId: S.find.placeId, needBy: S.find.needBy, permit: S.find.permit }; toast(`We'll alert you if ${lotById(d.lot).name} drops to 3 open spaces`); }
    invalidate(); return;
  }
  if (d.act === 'view-lot') { setCampus(lotById(d.lot).campus, false); S.selectedLot = d.lot; location.hash = 'map'; return; }
  if (d.act === 'arrive-sel') { const l = lotById(S.selectedLot); if (!carArrives(l, 'manual')) noCandidateToast(l, 'full'); return; }
  if (d.act === 'leave-sel') { const l = lotById(S.selectedLot); if (!carLeaves(l, 'manual')) noCandidateToast(l, 'empty'); return; }
  if (d.act === 'clear-sel') { S.selectedLot = null; invalidate(); return; }
  if (d.lot && t.classList.contains('lot-card')) { S.selectedLot = d.lot; location.hash = 'map'; }
});

function runFind(scroll) {
  const [h, m] = $('#f-time').value.split(':').map(Number);
  const needBy = h * 60 + m, permit = $('#f-permit').value;
  const top = recommend($('#f-place').value, needBy, permit)[0];
  S.find = { placeId: $('#f-place').value, needBy, permit, top: top && top.lot.id, chosen: top && top.lot.id };
  renderAll();
  if (scroll && innerWidth < 960) $('#find-best').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
$('#find-form').addEventListener('submit', (e) => { e.preventDefault(); S.dayPlan = null; runFind(true); });

/** "Your day" card: the timeline from a planDay() result. */
function dayPlanHTML(plan) {
  const rows = [];
  plan.segments.forEach((seg) => {
    if (seg.travel_from_previous_campus) {
      const { drive: d, bus: b } = seg.travel_from_previous_campus;
      const opts = [
        d ? `Drive: leave by ${esc(d.leave_previous_campus_by)} (about ${d.drive_minutes_estimate} min)` : '',
        b ? `Or bus: ${esc(b.route)} from ${esc(b.board_at_stop)} at ${esc(b.bus_departs)}, arrive about ${esc(b.arrive_about)}${b.note ? `. ${esc(b.note)}` : ''}` : '',
      ].filter(Boolean);
      rows.push(`<li class="dp-travel">${icon('bus')}<div><b>Switch to the ${esc(seg.campus)} campus</b>${opts.map((o) => `<small>${o}</small>`).join('')}</div></li>`);
    }
    if (seg.park) {
      rows.push(`<li>${icon('car')}<div><b>Park at ${esc(seg.park.lot)}${seg.park.suggested_open_space ? ` · Space ${esc(seg.park.suggested_open_space)}` : ''}</b><small>${esc(seg.campus)} campus · by ${esc(seg.park.park_by)} · ${seg.park.open_now} open now</small></div></li>`);
    } else if (seg.park_and_ride) {
      const p = seg.park_and_ride;
      rows.push(`<li>${icon('bus')}<div><b>Park & ride: ${esc(p.park_at)}</b><small>Park by ${esc(p.park_by)}, ${esc(p.route)} at ${esc(p.bus_departs)}</small></div></li>`);
    }
    seg.classes.forEach((c, i) => {
      const walk = i === 0 ? (seg.park ? `${seg.park.walk_minutes}-min walk from the car` : '') : `${c.walk_from_previous_class_minutes}-min walk from your last class`;
      rows.push(`<li class="dp-class">${icon('pin')}<div><b>${esc(c.class_at)} · ${esc(c.arrive_by)}</b><small>${walk}</small></div></li>`);
    });
    if (seg.park) rows.push(`<li>${icon('walk')}<div><b>Back to the car</b><small>${seg.park.walk_back_to_car_after_last_class_minutes}-min walk to ${esc(seg.park.lot)}</small></div></li>`);
    (seg.tips || []).forEach((t) => rows.push(`<li class="dp-tip">${icon('star')}<div><small>${esc(t)}</small></div></li>`));
  });
  return `<div class="card day-card"><div class="card-head"><h3>${icon('clock')} Your day</h3><span class="badge badge-blue">${esc(plan.permit)} permit</span></div><ol class="day-plan">${rows.join('')}</ol></div>`;
}

// "Your permit" pickers (dashboard, map, find form) all edit the same setting
function setPermit(v) {
  S.myPermit = v === 'all' || permitById(v) ? v : 'all';
  try { localStorage.setItem('owlpark.permit', S.myPermit); } catch { /* storage blocked: fine */ }
  syncPermitPickers();
  if (S.find && S.myPermit !== 'all') runFind(false); // re-rank current results for the new permit
  else invalidate();
}
function syncPermitPickers() {
  for (const sel of $$('[data-permit-select]')) {
    if (S.myPermit === 'all' && !sel.querySelector('option[value="all"]')) continue; // find form keeps its own pick
    sel.value = S.myPermit;
  }
}
document.addEventListener('change', (e) => { if (e.target.matches('[data-permit-select]')) setPermit(e.target.value); });

$('#sim-open').onclick = () => openSim(true);
$('#sim-close').onclick = () => openSim(false);
$('#scrim').onclick = () => openSim(false);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') openSim(false); });
$('#sim-arrive').onclick = () => { const l = lotById($('#sim-lot').value); if (!carArrives(l, 'manual')) noCandidateToast(l, 'full'); };
$('#sim-leave').onclick = () => { const l = lotById($('#sim-lot').value); if (!carLeaves(l, 'manual')) noCandidateToast(l, 'empty'); };
$('#sim-auto').onchange = (e) => { S.auto = e.target.checked; toast(S.auto ? 'Auto traffic on' : 'Auto traffic paused. Use the buttons or tap spaces.'); };
$('#sim-reset').onclick = () => {
  S.clock = 8 * 60 + 20; seedData(); for (const s of S.slots.values()) paintSlot(s);
  if (S.bridge) syncFromServer(); // put live sensors back to what the server says
  invalidate(); toast('Demo data reset');
};
$('#ops-lot').onchange = (e) => { S.opsLot = e.target.value; S.opsSensor = null; invalidate(); };
$('#bus-toggle').onchange = (e) => { S.showBus = e.target.checked; invalidate(); };

/** Day / Night map style (all campus maps, remembered per browser). */
function setMapTheme(theme) {
  S.mapTheme = theme === 'night' ? 'night' : 'day';
  try { localStorage.setItem('owlpark.mapTheme', S.mapTheme); } catch { /* storage blocked: fine */ }
  $$('.campus-map').forEach((m) => { m.classList.toggle('theme-night', S.mapTheme === 'night'); m.classList.toggle('theme-day', S.mapTheme === 'day'); });
  $$('[data-map-theme]').forEach((b) => b.classList.toggle('active', b.dataset.mapTheme === S.mapTheme));
}
document.addEventListener('click', (e) => { const b = e.target.closest('[data-map-theme]'); if (b) setMapTheme(b.dataset.mapTheme); });

/** Switch the campus shown on Dashboard, Live map and Sensor ops. */
function setCampus(id, render = true) {
  if (!campusById(id)) return;
  if (id !== S.campus) { S.selectedLot = null; S.mapSpot = null; S.opsSensor = null; }
  S.campus = id;
  try { localStorage.setItem('owlpark.campus', id); } catch { /* storage blocked: fine */ }
  $$('[data-campus-btn]').forEach((b) => b.classList.toggle('active', b.dataset.campusBtn === id));
  if (render) invalidate();
}

// =====================================================================
// Optional hardware bridge: server.js forwards real ESP32 readings
// =====================================================================
// Apply one server slot ({ lotId, id, status, battery, lastSeen, source }) to the browser model.
// quiet = initial sync: update state without flooding the activity feed.
function applyServerSlot(r, quiet = false) {
  const s = S.slots.get(`${r.lotId}:${r.id}`);
  if (!s || r.status === 'unknown') return; // server has never heard from this sensor; leave it simulated
  S.live.add(s.key);
  if (typeof r.battery === 'number') s.battery = r.battery;
  const src = r.source === 'simulator' ? 'simapi' : 'esp32';
  if (quiet) {
    s.online = r.status !== 'offline';
    if (s.online) s.occ = r.status === 'occupied';
    if (r.lastSeen) s.lastSeen = r.lastSeen;
    paintSlot(s);
    return;
  }
  if (r.status === 'offline') return setOnline(s, false, src);
  if (!s.online) setOnline(s, true, src);
  setOcc(s, r.status === 'occupied', src);
}

// Load the server's current state for every lot, so the browser matches it from the start.
async function syncFromServer() {
  try {
    const lots = await Promise.all(LOTS.map((l) => fetch(`/api/lots/${l.id}`).then((r) => r.json())));
    for (const lot of lots) for (const r of lot.slots || []) applyServerSlot(r, true);
    // Restart trend history so the jump from simulated to real counts isn't read as "filling fast"
    for (const l of LOTS) S.lotHist[l.id] = Array(12).fill(lotStats(l).open);
    invalidate();
  } catch { /* server went away; the stream's onerror handles the status */ }
}

function connectBridge() {
  if (!location.protocol.startsWith('http')) return;
  fetch('/api/health').then((r) => {
    if (!r.ok) throw new Error();
    const es = new EventSource('/api/stream');
    // onopen also fires after a reconnect (e.g. server restarted), so resync every time
    es.onopen = () => { S.bridge = true; syncFromServer(); };
    es.onerror = () => { S.bridge = false; invalidate(); };
    es.addEventListener('slot', (ev) => applyServerSlot(JSON.parse(ev.data).slot));
  }).catch(() => {});
}

// =====================================================================
// Ask OwlPark: AI assistant (Claude via server.js /api/ask)
// Claude decides which tool to call; the tools run here, on the same live model the
// app shows, so answers always match the screen. find_parking also fills in the
// Find parking form and results, so the map and route update as the AI answers.
// =====================================================================
const lotJSON = (x, spot) => ({
  lot: x.lot.name, campus: campusOf(x.lot).name, kind: x.lot.kind, permit_area: x.lot.area,
  open_now: x.st.open, total_spaces: x.st.total, predicted_open_when_you_park: x.pred, forecast_confidence: x.conf,
  park_by: fmt(x.parkBy), walk_minutes: x.walk.min, walk_meters: x.walk.m, trend: trend(x.lot).label,
  ...(spot !== undefined ? { suggested_open_space: spot ? spot.id : null } : {}),
});
const tripJSON = (t, lot, spot, place) => ({
  park_at: lot.name, campus: campusOf(lot).name, suggested_open_space: spot ? spot.id : null, park_by: fmt(t.parkBy),
  walk_to_stop_minutes: t.walk1, board_at_stop: t.from.name, route: t.route.name, bus_departs: fmt(t.dep),
  ride_minutes: t.ride, ride_time_is_estimate: t.est, get_off_at: t.to.name, walk_from_stop_minutes: t.walk2,
  ...(place ? { walking_directions_from_stop: walkDirections(t.to, place, { fromStop: true }).steps } : {}),
  arrive_about: fmt(t.arrive), schedule_note: 'Demo bus schedule; live times are in the Passio GO! app.',
});

const AI_TOOLS = {
  find_parking({ destination, arrive_by, permit }) {
    const place = placeById(destination), m = /^(\d{1,2}):(\d{2})$/.exec(arrive_by || '');
    if (!place || !permitById(permit) || !m || +m[1] > 23 || +m[2] > 59) return { error: 'Unknown destination, permit or time (use HH:MM).' };
    // Show the same trip in the Find parking screen (form, best lot, route on the map)
    $('#f-place').value = place.id;
    $('#f-time').value = `${m[1].padStart(2, '0')}:${m[2]}`;
    $('#f-permit').value = permit;
    S.myPermit = permit;
    try { localStorage.setItem('owlpark.permit', permit); } catch { /* fine */ }
    syncPermitPickers();
    S.dayPlan = null;
    runFind(false);
    const needBy = +m[1] * 60 + +m[2];
    const ranked = recommend(place.id, needBy, permit);
    const base = { destination: place.name, campus: campusOf(place).name, arrive_by: fmt(needBy), permit: permitName(permit), demo_time_now: fmt(S.clock) };
    if (!ranked.length) {
      const pr = parkAndRide(place, needBy, permit);
      return { ...base, no_lots_for_this_permit_on_this_campus: true, park_and_ride: pr ? tripJSON(pr.trip, pr.lot, spotsNear(pr.lot, pr.trip.from)[0], place) : null };
    }
    const r = ranked[0], trip = busTrip(r.lot, place, needBy);
    const busUseful = trip && trip.walk1 + trip.walk2 < r.walk.min && (trip.parkBy > r.parkBy || r.walk.min >= 8);
    return {
      ...base,
      recommended: { ...lotJSON(r, spotsNear(r.lot, r.walk.a)[0] || null), walking_directions: walkDirections(r.lot, place).steps },
      alternatives: ranked.slice(1, 3).map((x) => lotJSON(x)),
      bus_option: busUseful ? tripJSON(trip, r.lot, spotsNear(r.lot, trip.from)[0], place) : null,
    };
  },
  plan_day({ classes, permit }) {
    const plan = planDay(Array.isArray(classes) ? classes : [], permit);
    if (plan.error) return plan;
    // Show it: the "Your day" card, plus the first class's lot, space and route on the Find parking screen
    const firstSeg = plan.segments.find((s) => s.lot_id);
    const first = [...classes].sort((a, b) => toMin(a.arrive_by) - toMin(b.arrive_by))[0];
    $('#f-place').value = first.destination;
    $('#f-time').value = first.arrive_by.padStart(5, '0');
    $('#f-permit').value = permit;
    S.myPermit = permit;
    try { localStorage.setItem('owlpark.permit', permit); } catch { /* fine */ }
    syncPermitPickers();
    S.dayPlan = plan;
    runFind(false);
    if (firstSeg && S.find) { S.find.chosen = S.find.dayPick = firstSeg.lot_id; renderAll(); }
    return plan;
  },
  get_lot_status({ campus }) {
    const lots = campus === 'both' ? LOTS : lotsIn(campus);
    if (!lots.length) return { error: 'Unknown campus.' };
    return {
      demo_time_now: fmt(S.clock),
      lots: lots.map((l) => {
        const st = lotStats(l);
        return { lot: l.name, campus: campusOf(l).name, kind: l.kind, permits: l.permits.map(permitName), open: st.open, total: st.total,
          percent_full: Math.round(st.pct * 100), status: level(st).label, trend: trend(l).label };
      }),
    };
  },
  get_bus_departures({ route }) {
    const routes = route === 'all' ? PLANNED_ROUTES : PLANNED_ROUTES.filter((r) => r.id === route);
    if (!routes.length) return { error: 'Unknown route.' };
    return {
      demo_time_now: fmt(S.clock), schedule_note: 'Demo schedule: KSU does not publish bus frequencies. Live times are in the Passio GO! app.',
      routes: routes.map((r) => ({
        route: r.name, running_now: isRunning(r), hours: r.hours,
        stops: timing(r).stops.map((s, i) => ({ stop: s.name, campus: campusById(s.campus).name, next_departures: nextDepartures(r, i, S.clock, 3).map(fmt) })),
      })),
    };
  },
};
const TOOL_STATUS = { plan_day: 'Planning your whole day…', find_parking: 'Planning your trip with live sensor data…', get_lot_status: 'Checking live lot counts…', get_bus_departures: 'Checking Big Owl Bus times…' };

const ASK = { api: [], log: [], busy: false };

/** Tiny formatter for the assistant's replies: escape, then **bold** and line breaks. */
const aiText = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');

function renderAsk() {
  $('#ask-log').innerHTML = ASK.log.map((e) => {
    if (e.who === 'you') return `<div class="ask-msg you">${esc(e.text)}</div>`;
    if (e.who === 'tool') return `<div class="ask-tool">${icon(e.done ? 'check' : 'sparkle')}<span>${esc(e.text)}</span></div>`;
    if (e.who === 'error') return `<div class="ask-msg error">${icon('alert')}<span>${esc(e.text)}</span></div>`;
    return `<div class="ask-msg ai"><span class="ask-ai-badge">${icon('sparkle')}</span><div>${aiText(e.text)}</div></div>`;
  }).join('') + (ASK.busy ? '<div class="ask-typing"><i></i><i></i><i></i></div>' : '');
  $('#ask-log').hidden = !ASK.log.length && !ASK.busy;
  $('#ask-reset').hidden = !ASK.log.length;
  $('#ask-suggest').hidden = ASK.log.length > 0;
  $('#ask-form button[type=submit]').disabled = ASK.busy;
  const log = $('#ask-log'); log.scrollTop = log.scrollHeight;
}

async function askOwlPark(question) {
  question = question.trim();
  if (!question || ASK.busy) return;
  if (ASK.api.length > 30) ASK.api = []; // keep the conversation short; start fresh
  const saved = S.myPermit === 'all' ? 'none saved' : `${permitName(S.myPermit)} (${S.myPermit})`;
  ASK.api.push({ role: 'user', content: `[Context: demo time ${fmt(S.clock)}; saved permit: ${saved}; campus on screen: ${curCampus().name}]\n${question}` });
  ASK.log.push({ who: 'you', text: question });
  ASK.busy = true; renderAsk();
  try {
    for (let turn = 0; turn < 6; turn++) {
      const res = await fetch('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: ASK.api }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `The assistant is unavailable (${res.status}).`);
      ASK.api.push({ role: 'assistant', content: data.content }); // keep every block (thinking, tool calls) unchanged
      if (data.stop_reason === 'refusal') { ASK.log.push({ who: 'ai', text: "Sorry, I can't help with that one. Ask me about parking or the Big Owl Bus." }); break; }
      const uses = data.content.filter((b) => b.type === 'tool_use');
      if (data.stop_reason !== 'tool_use' || !uses.length) {
        const text = data.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
        ASK.log.push({ who: 'ai', text: text || 'Done. Check the results below.' });
        break;
      }
      // Run every requested tool locally; return all results in one user message
      const results = uses.map((u) => {
        const fn = AI_TOOLS[u.name];
        const entry = { who: 'tool', text: TOOL_STATUS[u.name] || `Running ${u.name}…` };
        ASK.log.push(entry);
        let out;
        try { out = fn ? fn(u.input || {}) : { error: `Unknown tool ${u.name}` }; } catch (err) { out = { error: String(err.message || err) }; }
        entry.done = true;
        return { type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(out), ...(out && out.error ? { is_error: true } : {}) };
      });
      renderAsk();
      ASK.api.push({ role: 'user', content: results });
    }
  } catch (err) {
    ASK.api = []; // a failed turn leaves the history unusable; start fresh next time
    ASK.log.push({ who: 'error', text: `${err.message} The Find parking form below still works without AI.` });
  }
  ASK.busy = false;
  renderAsk();
}

function initAsk() {
  $('#ask-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = $('#ask-input').value; $('#ask-input').value = '';
    askOwlPark(q);
  });
  $('#ask-reset').onclick = () => { ASK.api = []; ASK.log = []; renderAsk(); $('#ask-input').focus(); };
  document.addEventListener('click', (e) => {
    const s = e.target.closest('[data-ask]');
    if (s) { askOwlPark(s.dataset.ask); return; }
    if (e.target.closest('[data-ask-focus]')) setTimeout(() => $('#ask-input').focus(), 60);
  });
  // Voice input where the browser supports it (Chrome, Edge, Safari)
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SR) {
    const mic = $('#ask-mic');
    mic.hidden = false;
    mic.onclick = () => {
      const rec = new SR();
      rec.lang = 'en-US'; rec.interimResults = true;
      mic.classList.add('listening');
      rec.onresult = (ev) => { $('#ask-input').value = [...ev.results].map((r) => r[0].transcript).join(''); };
      rec.onerror = () => mic.classList.remove('listening');
      rec.onend = () => { mic.classList.remove('listening'); if ($('#ask-input').value.trim()) $('#ask-form').requestSubmit(); };
      rec.start();
    };
  }
  // Tell the user up front if the AI is off (no server, or no API key)
  const status = $('#ask-status');
  if (!location.protocol.startsWith('http')) { status.textContent = 'Offline'; status.className = 'badge badge-gray'; return; }
  fetch('/api/health').then((r) => r.json()).then((h) => {
    status.textContent = h.ai ? 'AI on' : 'AI off';
    status.className = `badge ${h.ai ? 'badge-green' : 'badge-gray'}`;
    if (!h.ai) status.title = 'Start the server with ANTHROPIC_API_KEY set to turn on the assistant.';
  }).catch(() => { status.textContent = 'Offline'; status.className = 'badge badge-gray'; });
  renderAsk();
}

// =====================================================================
// Boot
// =====================================================================
function init() {
  $$('[data-logo]').forEach((e) => (e.innerHTML = LOGO));
  $$('i[data-icon]').forEach((e) => { e.outerHTML = icon(e.dataset.icon); });
  $('#ops-kpis').classList.add('ops-kpis');

  // Dropdowns grouped by campus (destinations sorted A–Z within each campus)
  const grouped = (itemsOf) => CAMPUSES.map((c) => `<optgroup label="${esc(c.name)} campus">${itemsOf(c.id)
    .map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</optgroup>`).join('');
  $('#f-place').innerHTML = grouped((id) => placesIn(id).slice().sort((a, b) => a.name.localeCompare(b.name)));
  $('#f-place').value = curCampus().hub;
  $('#sim-lot').innerHTML = grouped(lotsIn);
  // Permit pickers: grouped by audience; dashboard/map ones also offer "All permits"
  const GROUPS = [['student', 'Student commuter'], ['faculty', 'Faculty & staff'], ['visitor', 'Visitors']];
  const permitOpts = GROUPS.map(([g, label]) => `<optgroup label="${label}">${PERMIT_TYPES.filter((p) => p.group === g)
    .map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</optgroup>`).join('');
  for (const sel of $$('[data-permit-select]')) {
    sel.innerHTML = (sel.id === 'f-permit' ? '' : '<option value="all">All permits</option>') + permitOpts;
  }
  $('#f-permit').value = S.myPermit === 'all' ? 'central' : S.myPermit;
  syncPermitPickers();
  $('#campus-seg').innerHTML = CAMPUSES.map((c) => `<button type="button" data-campus-btn="${c.id}">${esc(c.name)}</button>`).join('');
  setCampus(S.campus, false);
  const t = Math.ceil((S.clock + 30) / 5) * 5;
  $('#f-time').value = `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;

  seedData();
  for (const c of CAMPUSES) {
    S.maps.main[c.id] = buildMap($('#map-main'), c, { interactive: true });
    S.maps.find[c.id] = buildMap($('#find-map'), c);
  }
  setMapTheme(S.mapTheme);
  // Open Find parking with a worked example (the form's default trip) instead of an empty page
  runFind(false);
  $('#route-zoom').onclick = () => {
    S.routeZoom = !S.routeZoom;
    $('#route-zoom').innerHTML = S.routeZoom ? `${icon('map')}Whole campus` : `${icon('pin')}Zoom to route`;
    invalidate();
  };

  setInterval(() => { if (S.auto) for (let i = 0; i < S.speed; i++) step(); }, 1200);
  setInterval(() => { if (S.auto) { S.clock = (S.clock + S.speed) % 1440; S.clockAt = Date.now(); invalidate(); } }, 4000);
  // Move buses smoothly between clock ticks (cheap: only the visible map's bus layer)
  setInterval(() => { if (S.view === 'map' && S.showBus && S.auto) drawBuses(S.maps.main[S.campus]); }, 1000);
  setInterval(() => {
    S.history.push(campusStats().pct); if (S.history.length > 60) S.history.shift();
    for (const l of LOTS) { const a = S.lotHist[l.id]; a.push(lotStats(l).open); if (a.length > 12) a.shift(); }
    invalidate();
  }, 5000);

  window.addEventListener('hashchange', route);
  route();
  connectBridge();
  initAsk();
}
init();
