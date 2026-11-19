// Simulates the physical sensor network so you can develop without hardware.
// Each sensor sends its state the same way a real ESP32/LoRa gateway would:
//   POST /api/sensor  { readings: [{ sensorId, occupied, battery }] }

const BASE = process.env.SERVER_URL || "http://localhost:3000";
const KEY = process.env.SENSOR_API_KEY || "dev-sensor-key";
const TICK_MS = 1500;

async function post(readings) {
  const res = await fetch(`${BASE}/api/sensor`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": KEY },
    body: JSON.stringify({ readings }),
  });
  if (!res.ok) throw new Error(`server said ${res.status}`);
}

async function main() {
  const lots = await (await fetch(`${BASE}/api/lots`)).json();
  const sensors = [];
  for (const { id } of lots) {
    const detail = await (await fetch(`${BASE}/api/lots/${id}`)).json();
    const fill = 0.4 + Math.random() * 0.5; // each lot starts 40–90% full
    for (const s of detail.slots) {
      sensors.push({ sensorId: s.sensorId, occupied: Math.random() < fill, battery: 80 + Math.random() * 20, source: "simulator" });
    }
  }

  // Initial report from every sensor (sent in batches, like a gateway would).
  for (let i = 0; i < sensors.length; i += 100) await post(sensors.slice(i, i + 100));
  console.log(`Simulating ${sensors.length} sensors against ${BASE}`);

  // Cars arrive and leave.
  setInterval(async () => {
    const changed = [];
    const n = 1 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const s = sensors[Math.floor(Math.random() * sensors.length)];
      s.occupied = !s.occupied;
      s.battery = Math.max(0, s.battery - 0.01);
      changed.push(s);
    }
    try { await post(changed); } catch (e) { console.error(e.message); }
  }, TICK_MS);

  // Heartbeat: every sensor re-reports each minute so the server knows it's alive.
  setInterval(async () => {
    for (let i = 0; i < sensors.length; i += 100) {
      try { await post(sensors.slice(i, i + 100)); } catch (e) { console.error(e.message); }
    }
  }, 60_000);
}

main().catch((e) => {
  console.error("Simulator failed — is the server running? (npm start)\n", e.message);
  process.exit(1);
});
