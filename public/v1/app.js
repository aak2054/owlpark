const state = { lots: new Map(), permit: "all", openLot: null, slots: new Map() };

const $ = (id) => document.getElementById(id);

function level(free, total) {
  const pct = total ? free / total : 0;
  return pct > 0.25 ? "free" : pct > 0.05 ? "busy" : "full";
}

// ---------- Lot list ----------

function renderTotal() {
  let free = 0, total = 0;
  for (const l of state.lots.values()) { free += l.free; total += l.total; }
  $("total").textContent = `${free} of ${total} spaces open across campus`;
}

function lotCard(l) {
  const lvl = level(l.free, l.total);
  const el = document.createElement("button");
  el.className = "lot";
  el.id = `lot-${l.id}`;
  el.onclick = () => openLot(l.id);
  el.innerHTML = `
    <h3>${l.name}</h3>
    <div class="permits">${l.permits.join(" · ")}</div>
    <div class="count lvl-${lvl}">${l.free} <small>of ${l.total} open</small></div>
    <div class="bar"><div class="bg-${lvl}" style="width:${(l.occupied / l.total) * 100}%"></div></div>`;
  return el;
}

function renderLots() {
  const box = $("lots");
  box.replaceChildren(
    ...[...state.lots.values()]
      .filter((l) => state.permit === "all" || l.permits.includes(state.permit))
      .sort((a, b) => b.free - a.free)
      .map(lotCard)
  );
  renderTotal();
}

function updateLot(summary) {
  const prev = state.lots.get(summary.id);
  state.lots.set(summary.id, summary);
  const old = $(`lot-${summary.id}`);
  if (old) {
    const fresh = lotCard(summary);
    if (prev && summary.free > prev.free) fresh.classList.add("flash");
    old.replaceWith(fresh);
  }
  renderTotal();
  if (state.openLot === summary.id) renderDetailStats(summary);
}

// ---------- Lot detail ----------

function renderDetailStats(l) {
  $("detail-stats").textContent =
    `${l.free} free · ${l.occupied} occupied` + (l.offline ? ` · ${l.offline} no signal` : "");
}

async function openLot(id) {
  const lot = await (await fetch(`/api/lots/${id}`)).json();
  state.openLot = id;
  state.slots = new Map(lot.slots.map((s) => [s.id, s]));
  $("detail-name").textContent = lot.name;
  renderDetailStats(lot);

  const rows = new Map();
  for (const s of lot.slots) {
    const r = s.id[0];
    if (!rows.has(r)) rows.set(r, []);
    rows.get(r).push(s);
  }
  $("grid").replaceChildren(
    ...[...rows].map(([r, slots]) => {
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML = `<span class="row-label">${r}</span>`;
      for (const s of slots) {
        const d = document.createElement("div");
        d.className = `slot ${s.status}`;
        d.id = `slot-${s.id}`;
        d.title = `${s.id}: ${s.status}${s.battery != null ? ` · battery ${Math.round(s.battery)}%` : ""}`;
        d.textContent = s.id.slice(1);
        row.append(d);
      }
      return row;
    })
  );
  $("lots").hidden = true;
  $("filters").hidden = true;
  $("detail").hidden = false;
}

function closeLot() {
  state.openLot = null;
  $("detail").hidden = true;
  $("lots").hidden = false;
  $("filters").hidden = false;
}

// ---------- Live connection ----------

function connect() {
  const es = new EventSource("/api/stream");
  es.addEventListener("init", (e) => {
    state.lots = new Map(JSON.parse(e.data).map((l) => [l.id, l]));
    renderLots();
    if (state.openLot) openLot(state.openLot);
  });
  es.addEventListener("slot", (e) => {
    const { slot, summary } = JSON.parse(e.data);
    updateLot(summary);
    if (state.openLot === slot.lotId) {
      const el = $(`slot-${slot.id}`);
      if (el) el.className = `slot ${slot.status}`;
    }
  });
  es.onopen = () => { $("conn").textContent = "Live"; $("conn").classList.add("live"); };
  es.onerror = () => { $("conn").textContent = "Reconnecting…"; $("conn").classList.remove("live"); };
}

$("filters").addEventListener("click", (e) => {
  const permit = e.target.dataset?.permit;
  if (!permit) return;
  state.permit = permit;
  for (const b of $("filters").children) b.classList.toggle("active", b === e.target);
  renderLots();
});
$("back").onclick = closeLot;

connect();
