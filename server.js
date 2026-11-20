// KSU Parking — real-time availability server (zero dependencies).
//
// Sensors POST their state to /api/sensor; browsers receive live updates
// over Server-Sent Events at /api/stream.

const http = require("http");
const fs = require("fs");
const path = require("path");
const ai = require("./ai"); // "Ask OwlPark" assistant (POST /api/ask)

const PORT = Number(process.env.PORT) || 3000;
const SENSOR_API_KEY = process.env.SENSOR_API_KEY || "dev-sensor-key";
// A sensor that hasn't reported in this long is marked "offline".
const OFFLINE_AFTER_MS = Number(process.env.OFFLINE_AFTER_MS) || 120_000;

// ---------- State ----------

const config = JSON.parse(fs.readFileSync(path.join(__dirname, "data/lots.json"), "utf8"));
const lots = new Map();     // lotId -> { ...lotInfo, slots: Map(slotId -> slot) }
const sensors = new Map();  // sensorId -> slot (same object as in lot.slots)

for (const lot of config.lots) {
  const slots = new Map();
  for (let r = 0; r < lot.rows; r++) {
    for (let n = 1; n <= lot.slotsPerRow; n++) {
      const id = `${String.fromCharCode(65 + r)}${n}`; // A1, A2, … B1 …
      const slot = {
        id,
        lotId: lot.id,
        sensorId: `${lot.id}-${id}`,
        status: "unknown", // free | occupied | offline | unknown
        battery: null,
        lastSeen: null,
      };
      slots.set(id, slot);
      sensors.set(slot.sensorId, slot);
    }
  }
  lots.set(lot.id, { ...lot, slots });
}

function lotSummary(lot) {
  let free = 0, occupied = 0, offline = 0;
  for (const s of lot.slots.values()) {
    if (s.status === "free") free++;
    else if (s.status === "occupied") occupied++;
    else offline++;
  }
  return {
    id: lot.id, name: lot.name, permits: lot.permits,
    lat: lot.lat, lng: lot.lng,
    total: lot.slots.size, free, occupied, offline,
  };
}

function lotDetail(lot) {
  return { ...lotSummary(lot), rows: lot.rows, slotsPerRow: lot.slotsPerRow, slots: [...lot.slots.values()] };
}

// ---------- Live updates (SSE) ----------

const clients = new Set();

function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(msg);
}

function setSlotStatus(slot, status) {
  if (slot.status === status) return;
  slot.status = status;
  const lot = lots.get(slot.lotId);
  broadcast("slot", { slot, summary: lotSummary(lot) });
}

// Mark silent sensors offline.
setInterval(() => {
  const now = Date.now();
  for (const slot of sensors.values()) {
    if (slot.lastSeen && slot.status !== "offline" && now - slot.lastSeen > OFFLINE_AFTER_MS) {
      setSlotStatus(slot, "offline");
    }
  }
}, 10_000);

// Keep SSE connections alive through proxies.
setInterval(() => { for (const res of clients) res.write(": ping\n\n"); }, 25_000);

// ---------- HTTP ----------

function json(res, code, body) {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 1e6) { reject(new Error("too large")); req.destroy(); }
    });
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); }
    });
  });
}

// Accepts one reading or a batch: { sensorId, occupied, battery? } or { readings: [...] }
function applyReading(r) {
  const slot = sensors.get(r.sensorId);
  if (!slot) return { sensorId: r.sensorId, ok: false, error: "unknown sensor" };
  if (typeof r.occupied !== "boolean") return { sensorId: r.sensorId, ok: false, error: "occupied must be boolean" };
  slot.lastSeen = Date.now();
  slot.source = r.source === "simulator" ? "simulator" : "sensor"; // lets the app tag real hardware
  if (typeof r.battery === "number") slot.battery = r.battery;
  setSlotStatus(slot, r.occupied ? "occupied" : "free");
  return { sensorId: r.sensorId, ok: true };
}

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json" };

const PUBLIC_DIR = path.join(__dirname, "public");

function serveStatic(req, res) {
  const urlPath = req.url.split("?")[0];
  let rel = urlPath.slice(1);
  if (rel === "" || rel.endsWith("/")) rel += "index.html"; // folder URL -> its index.html
  const file = path.join(PUBLIC_DIR, path.normalize(rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return json(res, 403, { error: "forbidden" });
  fs.stat(file, (err, st) => {
    if (err) return json(res, 404, { error: "not found" });
    // "/v1" -> "/v1/" so the page's relative links (style.css, app.js) resolve.
    if (st.isDirectory()) { res.writeHead(301, { Location: urlPath + "/" }); return res.end(); }
    fs.readFile(file, (err2, buf) => {
      if (err2) return json(res, 404, { error: "not found" });
      // no-cache: browsers revalidate, so an updated app never shows stale files mid-demo
      res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
      res.end(buf);
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;

  try {
    if (req.method === "GET" && p === "/api/lots") {
      return json(res, 200, [...lots.values()].map(lotSummary));
    }

    const m = p.match(/^\/api\/lots\/([\w-]+)$/);
    if (req.method === "GET" && m) {
      const lot = lots.get(m[1]);
      return lot ? json(res, 200, lotDetail(lot)) : json(res, 404, { error: "lot not found" });
    }

    if (req.method === "GET" && p === "/api/stream") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write(`event: init\ndata: ${JSON.stringify([...lots.values()].map(lotSummary))}\n\n`);
      clients.add(res);
      req.on("close", () => clients.delete(res));
      return;
    }

    if (req.method === "POST" && p === "/api/sensor") {
      if (req.headers["x-api-key"] !== SENSOR_API_KEY) return json(res, 401, { error: "bad api key" });
      const body = await readBody(req);
      const readings = Array.isArray(body.readings) ? body.readings : [body];
      return json(res, 200, { results: readings.map(applyReading) });
    }

    if (req.method === "GET" && p === "/api/health") {
      return json(res, 200, { ok: true, clients: clients.size, sensors: sensors.size, ai: ai.enabled() });
    }

    if (req.method === "POST" && p === "/api/ask") {
      const [code, body] = await ai.ask(await readBody(req));
      return json(res, code, body);
    }

    if (req.method === "GET") return serveStatic(req, res);
    json(res, 404, { error: "not found" });
  } catch (e) {
    json(res, 400, { error: e.message });
  }
});

server.listen(PORT, () => {
  console.log(`KSU Parking running at http://localhost:${PORT}`);
  console.log(`${lots.size} lots, ${sensors.size} sensors registered`);
  console.log(ai.enabled() ? `Ask OwlPark: on (${ai.MODEL})` : "Ask OwlPark: off (set ANTHROPIC_API_KEY to turn on the AI assistant)");
});
