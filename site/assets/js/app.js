/* ============================================================================
   Observatorio Nacional de Justicia del Peru — app.js
   Dashboard estatico: carga JSON de ./data/ y renderiza modulos con ECharts + Leaflet
   ============================================================================ */
"use strict";

const DATA = {};
const FILES = ["nacional", "departamentos", "cortes", "series", "tipos_proceso",
  "embudo", "backlog", "jueces", "fiscales", "casos_seguridad", "indicadores", "manifest"];
const REAL = {};
const REAL_FILES = ["manifest", "mpfn_fiscales", "mpfn_casos", "mpfn_delitos",
  "pj_carga_nacional", "demora_piura", "tc", "mpfn_seguridad", "ml_demora", "inei_denuncias", "mimp_violencia"];

const fmt = (n) => (n == null ? "—" : Number(n).toLocaleString("es-PE"));
const fmt1 = (n) => (n == null ? "—" : Number(n).toLocaleString("es-PE", { maximumFractionDigits: 1 }));
const pct = (n) => (n == null ? "—" : (Number(n) * 100).toFixed(1) + "%");
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const charts = {};       // echarts instances
const rendered = {};     // panels already rendered

/* ---------- Theme ---------- */
function isLight() { return document.documentElement.getAttribute("data-theme") === "light"; }
function echartsTheme() {
  return {
    textStyle: { color: getComputedStyle(document.documentElement).getPropertyValue("--text").trim() },
    backgroundColor: "transparent",
  };
}
const PALETTE = ["#d4a437", "#4f8cff", "#2ecc71", "#e74c3c", "#9b59b6", "#1abc9c", "#f39c12", "#e84393", "#00cec9", "#636e72"];

/* ---------- Boot ---------- */
async function boot() {
  try {
    await Promise.all(FILES.map(async (f) => {
      const r = await fetch(`data/${f}.json`);
      DATA[f] = await r.json();
    }));
  } catch (e) {
    document.querySelector("main").innerHTML = `<div class="loading">No se pudieron cargar los datos. Ejecuta <code>python3 etl/generate_synthetic.py</code> y sirve la carpeta <code>site/</code>.</div>`;
    return;
  }
  // datos reales (no fatal si faltan)
  await Promise.all(REAL_FILES.map(async (f) => {
    try { const r = await fetch(`data/real/${f}.json`); if (r.ok) REAL[f] = await r.json(); } catch (e) {}
  }));
  $("#anio-label").textContent = DATA.nacional.anio;
  setupTabs();
  setupTheme();
  setupAI();
  setupModal();
  renderPanel("resumen");
  window.addEventListener("resize", () => {
    Object.values(charts).forEach((c) => { if (c && typeof c.resize === "function") c.resize(); });
    if (charts.map && charts.map._fitPeru) charts.map._fitPeru();
  });
}

/* ---------- Tabs ---------- */
function setupTabs() {
  $$("#tabs .tab").forEach((t) => t.addEventListener("click", () => {
    $$("#tabs .tab").forEach((x) => x.classList.remove("active"));
    $$("main .panel").forEach((x) => x.classList.remove("active"));
    t.classList.add("active");
    const id = t.dataset.panel;
    $("#" + id).classList.add("active");
    renderPanel(id);
    setTimeout(() => Object.values(charts).forEach((c) => { if (c && typeof c.resize === "function") c.resize(); }), 60);
  }));
}
function renderPanel(id) {
  if (rendered[id]) { if (id === "mapa" && charts.map) { charts.map._fitPeru ? charts.map._fitPeru() : charts.map.invalidateSize(); } return; }
  rendered[id] = true;
  ({ resumen: renderResumen, reales: renderReales, mapa: renderMapa, cortes: renderCortes,
     procesos: renderProcesos, embudo: renderEmbudo, magistrados: renderMagistrados,
     seguridad: renderSeguridad, series: renderSeries, indicadores: renderIndicadores,
     prediccion: renderPrediccion, faq: renderFaq }[id] || (() => {}))();
}
function mkChart(elId) {
  const c = echarts.init($("#" + elId), null, { renderer: "canvas" });
  charts[elId] = c;
  return c;
}

/* ============================================================ RESUMEN */
function renderResumenReal() {
  const box = $("#resumen-real"); if (!box) return;
  const delitos = REAL.mpfn_delitos, fis = REAL.mpfn_fiscales, pj = REAL.pj_carga_nacional,
    casos = REAL.mpfn_casos, tc = REAL.tc, seg = REAL.mpfn_seguridad;
  const k = [];
  if (delitos) k.push(["Delitos denunciados", fmt(delitos.total_denuncias), "MPFN · 2019–2026", "alert"]);
  if (casos && casos.por_anio) { const a = casos.por_anio.filter((x) => x.anio < 2026).slice(-1)[0]; if (a) k.push(["Casos fiscales (" + a.anio + ")", fmt(a.ingresado), `clearance ${fmt1(a.clearance)}%`, "warn"]); }
  if (fis) k.push(["Fiscales", fmt(fis.total_fiscales), "dotación 2026", ""]);
  if (pj && pj.nacional) k.push(["Carga PJ resuelta (2024)", fmt(pj.nacional.resueltos), "de " + fmt(pj.nacional.ingresos) + " ingresos", "ok"]);
  if (tc && tc.demora && tc.demora.global) k.push(["Demora TC (mediana)", fmt(tc.demora.global.mediana_dias) + " d", "microdata real", "warn"]);
  if (seg && seg.violencia_mujer) k.push(["Violencia contra la mujer", fmt(seg.violencia_mujer.total), "casos fiscales MPFN", "alert"]);
  if (REAL.inei_denuncias) k.push(["Denuncias policiales (INEI/PNP)", fmt(REAL.inei_denuncias.total_denuncias), "2016–2017", ""]);
  if (!k.length) { box.innerHTML = ""; return; }
  box.innerHTML = `<div class="kpi-grid">${k.map(([l, v, h, c]) => `<div class="kpi ${c}"><div class="label">🟢 ${l}</div><div class="value">${v}</div><div class="hint">${h}</div></div>`).join("")}</div>`;
}
function renderResumen() {
  renderResumenReal();
  // dos gráficos reales (no sintéticos): criminalidad y serie larga del TC
  const box = $("#resumen-charts"); if (!box) return;
  const delitos = REAL.mpfn_delitos, tc = REAL.tc;
  let html = "", reg = [];
  if (delitos && delitos.por_anio) { html += `<div class="card"><h3>🟢 Delitos denunciados por año (MPFN)</h3><div class="chart" id="rs-del"></div>${metaFoot(delitos._meta)}</div>`; reg.push(["rs-del", () => lineSimple("rs-del", delitos.por_anio, "anio", "cantidad", "#e74c3c")]); }
  if (tc && tc.por_anio) { html += `<div class="card"><h3>🟢 Expedientes del Tribunal Constitucional por año (1992–2026)</h3><div class="chart" id="rs-tc"></div>${metaFoot(tc._meta)}</div>`; reg.push(["rs-tc", () => lineSimple("rs-tc", tc.por_anio, "anio", "ingresados", "#9b59b6")]); }
  box.innerHTML = html;
  reg.forEach(([id, fn]) => { try { fn(); } catch (e) {} });
}

/* ============================================================ MAPA */
const MAP_META = {
  congestion: { label: "Congestión", colors: ["#1a5c3a", "#f1c40f", "#e74c3c"], fmt: fmt1 },
  demora_dias: { label: "Demora (días)", colors: ["#1a5c3a", "#f1c40f", "#e74c3c"], fmt: fmt },
  carga_por_juez: { label: "Carga/juez", colors: ["#1a5c3a", "#f1c40f", "#e74c3c"], fmt: fmt1 },
  pendientes: { label: "Pendientes", colors: ["#16324f", "#4f8cff", "#9b59b6"], fmt: fmt },
  procesos_por_1000hab: { label: "Procesos/1000 hab", colors: ["#16324f", "#4f8cff", "#9b59b6"], fmt: fmt1 },
  riesgo_seguridad: { label: "Riesgo seguridad", colors: ["#1a5c3a", "#f1c40f", "#e74c3c"], fmt: (v) => (v * 100).toFixed(0) + "%" },
  delitos_reales: { label: "Delitos denunciados (MPFN)", colors: ["#16324f", "#f39c12", "#e74c3c"], fmt: fmt },
};
const normName = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
async function renderMapa() {
  // Mapa FIJO: sin zoom de scroll, sin arrastre ni doble-clic; se ajusta al Perú y se queda quieto.
  const map = L.map("map", {
    scrollWheelZoom: false, dragging: false, doubleClickZoom: false,
    boxZoom: false, touchZoom: false, keyboard: false, zoomControl: false,
    attributionControl: true,
  });
  charts.map = map;
  // límites aprox. del Perú; se afina con fitBounds al geojson
  const PERU_BOUNDS = L.latLngBounds([[-18.6, -81.6], [-0.0, -68.6]]);
  map.fitBounds(PERU_BOUNDS);
  function fitPeru() {
    const b = (charts.mapLayer && charts.mapLayer.getBounds && charts.mapLayer.getBounds().isValid())
      ? charts.mapLayer.getBounds() : PERU_BOUNDS;
    map.invalidateSize();
    map.fitBounds(b, { padding: [8, 8] });
  }
  map._fitPeru = fitPeru;
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    attribution: '© OpenStreetMap, © CARTO', subdomains: "abcd", maxZoom: 12,
  }).addTo(map);

  const deps = DATA.departamentos;
  const byName = {}; deps.forEach((d) => (byName[normName(d.departamento)] = d));

  function colorScale(metric) {
    const vals = deps.map((d) => d[metric]);
    const min = Math.min(...vals), max = Math.max(...vals), cols = MAP_META[metric].colors;
    return (v) => {
      const t = (v - min) / (max - min || 1);
      return t < .33 ? cols[0] : t < .66 ? cols[1] : cols[2];
    };
  }
  // enriquecer con dato REAL: delitos denunciados por departamento (MPFN)
  let hasRealDelitos = false;
  if (REAL.mpfn_delitos && REAL.mpfn_delitos.por_departamento) {
    const dl = {}; REAL.mpfn_delitos.por_departamento.forEach((r) => (dl[normName(r.departamento)] = r.cantidad));
    deps.forEach((d) => (d.delitos_reales = dl[normName(d.departamento)] || 0));
    hasRealDelitos = deps.some((d) => d.delitos_reales > 0);
  }
  function popupHtml(d, m) {
    if (m.key === "delitos_reales") {
      return `<div class="map-pop"><b>${d.departamento}</b><br/>🟢 ${m.label}: <b>${m.fmt(d.delitos_reales)}</b><br/><span style="color:var(--muted);font-size:11px">Dato real · MPFN (2019–2026)</span></div>`;
    }
    return `<div class="map-pop"><b>${d.departamento}</b> <span style="color:var(--amber);font-size:11px">🧪 sintético</span><br/>
      ${m.label}: <b>${m.fmt(d[m.key])}</b><br/>
      Ingresados: ${fmt(d.ingresados)}<br/>Pendientes: ${fmt(d.pendientes)}<br/>
      Jueces: ${fmt(d.jueces)} · Demora: ${fmt(d.demora_dias)} d<br/>
      Congestión: ${fmt1(d.congestion)}</div>`;
  }

  let geoLayer = null, markerLayer = L.layerGroup();
  let geojson = null;
  try { geojson = await (await fetch("data/peru_departamentos.geojson")).json(); } catch (e) { geojson = null; }

  function draw(metric) {
    const m = { ...MAP_META[metric], key: metric }, color = colorScale(metric);
    if (geojson) {
      if (geoLayer) map.removeLayer(geoLayer);
      geoLayer = L.geoJSON(geojson, {
        style: (f) => {
          const d = byName[normName(f.properties.NOMBDEP)];
          return { fillColor: d ? color(d[metric]) : "#444", weight: 1, color: "#0a1228", fillOpacity: .82 };
        },
        onEachFeature: (f, lyr) => {
          const d = byName[normName(f.properties.NOMBDEP)];
          if (d) {
            lyr.bindPopup(popupHtml(d, m));
            lyr.bindTooltip(`${d.departamento}: ${m.fmt(d[metric])}`, { sticky: true });
            lyr.on("mouseover", () => lyr.setStyle({ weight: 2.5, color: "#fff" }));
            lyr.on("mouseout", () => lyr.setStyle({ weight: 1, color: "#0a1228" }));
          }
        },
      }).addTo(map);
      charts.mapLayer = geoLayer;
    } else {
      // fallback: circulos en centroides
      markerLayer.clearLayers().addTo(map);
      const max = Math.max(...deps.map((d) => d[metric]));
      deps.forEach((d) => L.circleMarker([d.lat, d.lng], {
        radius: 8 + (d[metric] / max) * 24, fillColor: color(d[metric]), color: "#fff", weight: 1, fillOpacity: .8,
      }).bindPopup(popupHtml(d, m)).addTo(markerLayer));
      charts.mapLayer = markerLayer;
    }
  }
  const initMetric = hasRealDelitos ? "delitos_reales" : "congestion";
  if (hasRealDelitos) $("#map-metric").value = "delitos_reales";
  draw(initMetric);
  fitPeru();
  $("#map-metric").addEventListener("change", (e) => draw(e.target.value));

  const lg = L.control({ position: "bottomright" });
  lg.onAdd = function () {
    const div = L.DomUtil.create("div", "legend");
    div.innerHTML = `<b>Escala</b><br/><i style="background:#1a5c3a"></i> Bajo<br/><i style="background:#f1c40f"></i> Medio<br/><i style="background:#e74c3c"></i> Alto`;
    return div;
  };
  lg.addTo(map);
  setTimeout(fitPeru, 120);
}

/* ============================================================ CORTES */
function renderCortes() {
  const pj = REAL.pj_carga_nacional;
  if (pj && pj.por_distrito_judicial) { renderCortesReal(pj); return; }
  const cols = [
    ["ranking_congestion", "#", fmt], ["corte", "Corte", (v) => v], ["departamento", "Depto.", (v) => v],
    ["ingresados", "Ingresados", fmt], ["resueltos", "Resueltos", fmt], ["pendientes", "Pendientes", fmt],
    ["jueces", "Jueces", fmt], ["carga_por_juez", "Carga/juez", fmt1], ["clearance_rate", "Resolución", pct],
    ["congestion", "Congestión", fmt1], ["demora_dias", "Demora (d)", fmt],
  ];
  let sortKey = "ranking_congestion", asc = true, q = "";
  const maxCong = Math.max(...DATA.cortes.map((c) => c.congestion));
  function render() {
    let rows = DATA.cortes.filter((c) => (c.corte + c.departamento).toLowerCase().includes(q.toLowerCase()));
    rows.sort((a, b) => (a[sortKey] > b[sortKey] ? 1 : -1) * (asc ? 1 : -1));
    $("#tbl-cortes").innerHTML =
      `<thead><tr>${cols.map(([k, l]) => `<th data-k="${k}" class="${typeof DATA.cortes[0][k] === "number" ? "num" : ""}">${l}${sortKey === k ? (asc ? " ▲" : " ▼") : ""}</th>`).join("")}</tr></thead>
       <tbody>${rows.map((c) => `<tr>${cols.map(([k, l, f]) => {
        if (k === "congestion") return `<td class="num bar-cell"><div class="bar" style="width:${(c[k] / maxCong) * 100}%;background:${c[k] > 2.5 ? "var(--red)" : "var(--amber)"}"></div><span>${f(c[k])}</span></td>`;
        return `<td class="${typeof c[k] === "number" ? "num" : ""}">${f(c[k])}</td>`;
      }).join("")}</tr>`).join("")}</tbody>`;
    $$("#tbl-cortes th").forEach((th) => th.addEventListener("click", () => {
      const k = th.dataset.k; if (k === sortKey) asc = !asc; else { sortKey = k; asc = true; } render();
    }));
  }
  render();
  $("#cortes-search").addEventListener("input", (e) => { q = e.target.value; render(); });
}
function renderCortesReal(pj) {
  $("#cortes .section-title").innerHTML = "🟢 Carga procesal por Distrito Judicial (Poder Judicial, 2024)";
  $("#cortes .section-sub").innerHTML = "Datos reales del PJ (dataset jurisdiccional 2024). Ordena por columnas. ⚠️ La <b>congestión</b> es provisional (semántica de columnas del PJ sin diccionario oficial; ver Datos Reales).";
  const data = pj.por_distrito_judicial;
  const cols = [["distrito_judicial", "Distrito Judicial", (v) => v], ["ingresos", "Ingresos", fmt], ["resueltos", "Resueltos", fmt],
    ["pendientes", "Pendientes", fmt], ["clearance", "Clearance %", fmt1], ["congestion", "Congestión", fmt1]];
  let sortKey = "congestion", asc = false, q = "";
  const maxCong = Math.max(...data.map((c) => c.congestion));
  function render() {
    let rows = data.filter((c) => c.distrito_judicial.toLowerCase().includes(q.toLowerCase()));
    rows.sort((a, b) => (a[sortKey] > b[sortKey] ? 1 : -1) * (asc ? 1 : -1));
    $("#tbl-cortes").innerHTML =
      `<thead><tr>${cols.map(([k, l]) => `<th data-k="${k}" class="${k !== "distrito_judicial" ? "num" : ""}">${l}${sortKey === k ? (asc ? " ▲" : " ▼") : ""}</th>`).join("")}</tr></thead>
       <tbody>${rows.map((c) => `<tr>${cols.map(([k, l, f]) => {
        if (k === "congestion") return `<td class="num bar-cell"><div class="bar" style="width:${(c[k] / maxCong) * 100}%;background:${c[k] > 3 ? "var(--red)" : "var(--amber)"}"></div><span>${f(c[k])}</span></td>`;
        return `<td class="${k !== "distrito_judicial" ? "num" : ""}">${f(c[k])}</td>`;
      }).join("")}</tr>`).join("")}</tbody>`;
    $$("#tbl-cortes th").forEach((th) => th.addEventListener("click", () => {
      const k = th.dataset.k; if (k === sortKey) asc = !asc; else { sortKey = k; asc = k === "distrito_judicial"; } render();
    }));
  }
  render();
  const inp = $("#cortes-search"); inp.placeholder = "🔎 Buscar distrito judicial...";
  inp.addEventListener("input", (e) => { q = e.target.value; render(); });
}

/* ============================================================ PROCESOS */
function renderProcesos() {
  const pj = REAL.pj_carga_nacional, demora = REAL.demora_piura, tc = REAL.tc;
  if (pj && pj.por_especialidad) {
    $("#procesos .section-sub").innerHTML = "🟢 <b>Datos reales</b>: distribución de la carga por especialidad (PJ 2024) y demora real en días (microdata Piura + Tribunal Constitucional).";
    mkChart("chart-pie").setOption({ ...echartsTheme(), color: PALETTE,
      tooltip: { trigger: "item", formatter: (p) => `${p.name}<br/>${fmt(p.value)} ingresos (${p.percent}%)` },
      legend: { type: "scroll", bottom: 0, textStyle: echartsTheme().textStyle },
      series: [{ type: "pie", radius: ["42%", "70%"], center: ["50%", "44%"], data: pj.por_especialidad.map((x) => ({ name: x.especialidad, value: x.ingresos })),
        label: { color: echartsTheme().textStyle.color }, itemStyle: { borderColor: "var(--surface)", borderWidth: 2 } }] });
    // demora combinada real
    const rows = [];
    if (demora && demora.por_proceso) demora.por_proceso.forEach((p) => rows.push({ proceso: `Piura: ${p.proceso}`, mediana_dias: p.mediana_dias, p90_dias: p.p90_dias }));
    if (tc && tc.demora && tc.demora.por_tipo) tc.demora.por_tipo.forEach((p) => rows.push({ proceso: `TC: ${p.tipo}`, mediana_dias: p.mediana_dias, p90_dias: p.p90_dias }));
    demoraChart("chart-demora", rows);
    return;
  }
  const t = DATA.tipos_proceso;
  mkChart("chart-pie").setOption({
    ...echartsTheme(), color: PALETTE,
    tooltip: { trigger: "item", formatter: (p) => `${p.name}<br/>${fmt(p.value)} (${p.percent}%)` },
    legend: { type: "scroll", bottom: 0, textStyle: echartsTheme().textStyle },
    series: [{
      type: "pie", radius: ["42%", "70%"], center: ["50%", "44%"],
      data: t.map((x) => ({ name: x.tipo, value: x.casos })),
      label: { color: echartsTheme().textStyle.color }, itemStyle: { borderColor: "var(--surface)", borderWidth: 2 },
    }],
  });
  const sorted = [...t].sort((a, b) => b.demora_p90_dias - a.demora_p90_dias);
  mkChart("chart-demora").setOption({
    ...echartsTheme(), color: ["#d4a437", "#e74c3c"],
    tooltip: { trigger: "axis" }, legend: { top: 0, textStyle: echartsTheme().textStyle },
    grid: { left: 130, right: 24, top: 40, bottom: 24 },
    xAxis: { type: "value", name: "días" },
    yAxis: { type: "category", data: sorted.map((x) => x.tipo) },
    series: [
      { name: "Mediana", type: "bar", data: sorted.map((x) => x.demora_mediana_dias) },
      { name: "P90", type: "bar", data: sorted.map((x) => x.demora_p90_dias) },
    ],
  });
}

/* ============================================================ EMBUDO + BACKLOG */
function renderEmbudoReal() {
  const box = $("#embudo-real"); if (!box) return;
  const pj = REAL.pj_carga_nacional, casos = REAL.mpfn_casos;
  if (!pj && !casos) { box.innerHTML = ""; return; }
  let html = `<div class="disclaimer" style="border-color:rgba(46,204,113,.3);background:rgba(46,204,113,.06);color:var(--green)">🟢 <b>Flujo real.</b> Poder Judicial 2024 (ingresos→resueltos→pendientes) y Ministerio Público (ingresado→atendido).</div>`;
  const reg = [];
  if (pj && pj.nacional) {
    const n = pj.nacional;
    html += `<div class="kpi-grid">
      <div class="kpi"><div class="label">🟢 Ingresos PJ 2024</div><div class="value">${fmt(n.ingresos)}</div><div class="hint">expedientes</div></div>
      <div class="kpi ok"><div class="label">🟢 Resueltos</div><div class="value">${fmt(n.resueltos)}</div><div class="hint">expedientes</div></div>
      <div class="kpi alert"><div class="label">🟢 Pendientes</div><div class="value">${fmt(n.pendientes)}</div><div class="hint">backlog</div></div></div>`;
    html += `<div class="card"><h3>🟢 Flujo procesal nacional (PJ 2024)</h3><div class="chart" id="er-pjflow"></div>${metaFoot(pj._meta)}</div>`;
    reg.push(["er-pjflow", () => mkChart("er-pjflow").setOption({ ...echartsTheme(), color: ["#d4a437", "#2ecc71", "#e74c3c"],
      tooltip: { trigger: "axis" }, grid: { left: 70, right: 24, top: 16, bottom: 24 },
      xAxis: { type: "category", data: ["Ingresos", "Resueltos", "Pendientes"] },
      yAxis: { type: "value", axisLabel: { formatter: (v) => (v / 1e6).toFixed(1) + "M" } },
      series: [{ type: "bar", data: [{ value: n.ingresos, itemStyle: { color: "#d4a437" } }, { value: n.resueltos, itemStyle: { color: "#2ecc71" } }, { value: n.pendientes, itemStyle: { color: "#e74c3c" } }] }] })]);
  }
  if (casos && casos.por_materia) {
    html += `<div class="card"><h3>🟢 Casos fiscales: ingresado vs atendido por materia (MPFN)</h3><div class="chart" id="er-casflow"></div>${metaFoot(casos._meta)}</div>`;
    reg.push(["er-casflow", () => barIngRes2("er-casflow", casos.por_materia, "materia", "ingresado", "atendido")]);
  }
  // Backlog REAL: pendientes por distrito judicial (PJ 2024) — reemplaza el "top juzgados" sintético
  if (pj && pj.por_distrito_judicial) {
    const rows = [...pj.por_distrito_judicial].sort((a, b) => b.pendientes - a.pendientes);
    html += `<div class="card"><h3>🟢 Backlog real — expedientes pendientes por distrito judicial (PJ 2024)</h3>
      <div class="chart tall" id="er-backlog"></div>${metaFoot(pj._meta)}</div>`;
    reg.push(["er-backlog", () => barSimple("er-backlog", rows.slice(0, 20), "distrito_judicial", "pendientes", "#e74c3c")]);
    html += `<div class="card"><h3>🟢 Carga por distrito judicial (PJ 2024)</h3>
      <div class="table-wrap" style="max-height:420px"><table><thead><tr><th>Distrito judicial</th><th class="num">Ingresos</th><th class="num">Resueltos</th><th class="num">Pendientes</th><th class="num">Congestión</th></tr></thead>
      <tbody>${[...pj.por_distrito_judicial].sort((a, b) => b.congestion - a.congestion).map((r) => `<tr><td>${r.distrito_judicial}</td><td class="num">${fmt(r.ingresos)}</td><td class="num">${fmt(r.resueltos)}</td><td class="num">${fmt(r.pendientes)}</td><td class="num">${fmt1(r.congestion)}</td></tr>`).join("")}</tbody></table></div>${metaFoot(pj._meta)}</div>`;
  }
  box.innerHTML = html;
  reg.forEach(([id, fn]) => { try { fn(); } catch (e) {} });
}
function renderEmbudo() { renderEmbudoReal(); }

/* ============================================================ MAGISTRADOS */
let magState = { rol: "Juez", q: "", esp: "", seg: false };
function renderMagistradosReal() {
  const box = $("#mag-real"); if (!box) return;
  const fis = REAL.mpfn_fiscales;
  if (!fis) { box.innerHTML = ""; return; }
  let html = `<div class="disclaimer" style="border-color:rgba(46,204,113,.3);background:rgba(46,204,113,.06);color:var(--green)">🟢 <b>Datos reales (Ministerio Público).</b> Dotación de fiscales por año, cargo, condición, sexo y distrito fiscal.</div>`;
  html += `<div class="kpi-grid">
    <div class="kpi"><div class="label">🟢 Fiscales (2026)</div><div class="value">${fmt(fis.total_fiscales)}</div><div class="hint">dotación MPFN</div></div>
    ${fis.por_condicion ? `<div class="kpi ${(fis.por_condicion.find((c) => /PROVISIONAL/i.test(c.condicion)) || {}).total > fis.total_fiscales * 0.4 ? "warn" : ""}"><div class="label">🟢 Provisionales</div><div class="value">${fmt((fis.por_condicion.find((c) => /PROVISIONAL/i.test(c.condicion)) || {}).total || 0)}</div><div class="hint">no titulares</div></div>` : ""}
  </div>`;
  const reg = [];
  if (fis.por_anio) { html += rc("🟢 Evolución de la dotación de fiscales (2019–2026)", "mr-anio", fis._meta); reg.push(["mr-anio", () => lineSimple("mr-anio", fis.por_anio, "anio", "total", "#2ecc71")]); }
  if (fis.por_cargo) { html += rc("🟢 Fiscales por cargo", "mr-cargo", fis._meta); reg.push(["mr-cargo", () => barSimple("mr-cargo", fis.por_cargo, "cargo", "total", "#4f8cff")]); }
  if (fis.por_distrito_fiscal) { html += rc("🟢 Fiscales por distrito fiscal (top 15)", "mr-dist", fis._meta); reg.push(["mr-dist", () => barSimple("mr-dist", fis.por_distrito_fiscal.slice(0, 15), "distrito_fiscal", "total", "#9b59b6")]); }
  if (fis.por_condicion && fis.por_sexo) {
    html += `<div class="grid-2"><div class="card"><h3>🟢 Por condición</h3><div class="chart" id="mr-cond"></div>${metaFoot(fis._meta)}</div><div class="card"><h3>🟢 Por sexo</h3><div class="chart" id="mr-sexo"></div>${metaFoot(fis._meta)}</div></div>`;
    reg.push(["mr-cond", () => donut("mr-cond", fis.por_condicion, "condicion", "total")]);
    reg.push(["mr-sexo", () => donut("mr-sexo", fis.por_sexo, "sexo", "total")]);
  }
  // tabla real: fiscales por distrito fiscal
  if (fis.por_distrito_fiscal) {
    const rows = [...fis.por_distrito_fiscal].sort((a, b) => b.total - a.total);
    html += `<div class="card"><h3>🟢 Fiscales por distrito fiscal (Ministerio Público)</h3>
      <div class="table-wrap" style="max-height:440px"><table><thead><tr><th>Distrito fiscal</th><th class="num">Fiscales</th></tr></thead>
      <tbody>${rows.map((r) => `<tr><td>${r.distrito_fiscal}</td><td class="num">${fmt(r.total)}</td></tr>`).join("")}</tbody></table></div>${metaFoot(fis._meta)}</div>`;
  }
  box.innerHTML = html;
  reg.forEach(([id, fn]) => { try { fn(); } catch (e) {} });
  function rc(t, id, m) { return `<div class="card"><h3>${t}</h3><div class="chart" id="${id}"></div>${metaFoot(m)}</div>`; }
}
function renderMagistrados() { renderMagistradosReal(); }
function drawMag() {
  const src = magState.rol === "Juez" ? DATA.jueces : DATA.fiscales;
  let rows = src.filter((m) =>
    (m.nombre + m.corte_actual).toLowerCase().includes(magState.q.toLowerCase()) &&
    (!magState.esp || m.especialidad === magState.esp) &&
    (!magState.seg || m.casos_seguridad > 0));
  rows.sort((a, b) => b.casos_seguridad - a.casos_seguridad || b.anios_servicio - a.anios_servicio);
  const cols = [["id", "ID"], ["nombre", "Nombre"], ["corte_actual", "Corte actual"], ["especialidad", "Especialidad"],
    ["condicion", "Condición"], ["anios_servicio", "Años serv."], ["n_rotaciones", "Rotaciones"],
    ["casos_seguridad", "Casos seg."], ["tasa_resolucion", "T. resol."]];
  $("#tbl-mag").innerHTML =
    `<thead><tr>${cols.map(([k, l]) => `<th>${l}</th>`).join("")}<th>Trayectoria</th></tr></thead>
     <tbody>${rows.slice(0, 250).map((m, i) => `<tr data-idx="${i}">
       <td>${m.id}</td><td><b>${m.nombre}</b></td><td>${m.corte_actual}</td>
       <td>${segPill(m.especialidad)}</td><td>${m.condicion}</td><td class="num">${m.anios_servicio}</td>
       <td class="num">${m.n_rotaciones}</td><td class="num">${m.casos_seguridad > 0 ? `<span class="pill red">${m.casos_seguridad}</span>` : "0"}</td>
       <td class="num">${pct(m.tasa_resolucion)}</td><td><a href="#" class="ver-rot">ver →</a></td></tr>`).join("")}</tbody>`;
  $$("#tbl-mag tbody tr").forEach((tr) => tr.querySelector(".ver-rot").addEventListener("click", (ev) => {
    ev.preventDefault(); openRotacion(rows[+tr.dataset.idx]);
  }));
  if (rows.length > 250) $("#tbl-mag").insertAdjacentHTML("beforeend", `<tfoot><tr><td colspan="10" style="text-align:center;color:var(--muted)">Mostrando 250 de ${fmt(rows.length)}. Usa la búsqueda para filtrar.</td></tr></tfoot>`);
}
function segPill(esp) {
  if (/Crimen|Anticorrup/.test(esp)) return `<span class="pill red">${esp}</span>`;
  if (esp === "Penal") return `<span class="pill amber">${esp}</span>`;
  return esp;
}

/* ---------- Modal rotaciones ---------- */
function setupModal() {
  $("#modal-x").addEventListener("click", closeModal);
  $("#modal-bg").addEventListener("click", (e) => { if (e.target.id === "modal-bg") closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
}
function closeModal() { $("#modal-bg").classList.remove("open"); }
function openRotacion(m) {
  $("#modal-title").textContent = `${m.rol} · ${m.nombre}`;
  $("#modal-meta").innerHTML = `${m.id} · ${m.especialidad} · ${m.condicion} · ${m.anios_servicio} años de servicio · ${m.casos_seguridad} casos de seguridad`;
  const steps = [...m.rotaciones].reverse().map((r) => `
    <div class="step">
      <div class="yr">${r.desde} — ${r.hasta || "actual"}</div>
      <div class="ct">${r.corte}</div>
      <div class="mt">${r.especialidad} · ${r.condicion} · <i>${r.motivo}</i></div>
    </div>`).join("");
  $("#modal-body").innerHTML =
    `<p style="color:var(--muted);font-size:12.5px;margin-top:0">⚠️ Trayectoria <b>ilustrativa</b>. No existe un dataset abierto oficial de rotaciones de magistrados; en producción se construiría desde el Boletín de la Magistratura (JNJ) y resoluciones administrativas del PJ.</p>
     <div class="timeline">${steps}</div>`;
  $("#modal-bg").classList.add("open");
}

/* ============================================================ SEGURIDAD */
let segFilter = "";
function renderSeguridad() { renderSeguridadReal(); }

function renderSeguridadReal() {
  const box = $("#seg-real"); if (!box) return;
  const delitos = REAL.mpfn_delitos, seg = REAL.mpfn_seguridad;
  if (!delitos && !seg) { box.innerHTML = ""; return; }
  const kpis = [];
  const mimp = REAL.mimp_violencia;
  if (delitos) kpis.push(["Delitos denunciados (MPFN)", fmt(delitos.total_denuncias), "2019–2026", "alert"]);
  if (mimp && mimp.feminicidios) kpis.push(["Feminicidios (MIMP/CEM)", fmt(mimp.feminicidios.total), "2012–2025", "alert"]);
  if (mimp && mimp.casos_violencia) kpis.push(["Violencia contra la mujer (CEM)", fmt(mimp.casos_violencia.total), "casos atendidos 2012–2025", "alert"]);
  if (seg && seg.ciberdelitos) kpis.push(["Ciberdelitos", fmt(seg.ciberdelitos.total), "denunciados", "alert"]);
  if (seg && seg.flagrancia) kpis.push(["Flagrancia delictiva", fmt(seg.flagrancia.total), "casos 2025–26", "warn"]);
  if (seg && seg.trata) kpis.push(["Trata de personas", fmt(seg.trata.total), "casos intervenidos", "warn"]);
  let html = `<div class="disclaimer" style="border-color:rgba(46,204,113,.3);background:rgba(46,204,113,.06);color:var(--green)">🟢 <b>Datos reales (Ministerio Público).</b> Cada gráfico cita su fuente y fecha de corte.</div>`;
  html += `<div class="kpi-grid">${kpis.map(([l, v, h, c]) => `<div class="kpi ${c}"><div class="label">🟢 ${l}</div><div class="value">${v}</div><div class="hint">${h}</div></div>`).join("")}</div>`;
  const reg = [];
  if (delitos && delitos.top_delitos) { html += rcard("🟢 Top delitos denunciados (MPFN)", "sr-topdel", delitos._meta); reg.push(["sr-topdel", () => barSimple("sr-topdel", delitos.top_delitos.slice(0, 12), "generico", "cantidad", "#e74c3c")]); }
  if (delitos && delitos.por_departamento) { html += rcard("🟢 Delitos por departamento (MPFN)", "sr-deptodel", delitos._meta); reg.push(["sr-deptodel", () => barSimple("sr-deptodel", delitos.por_departamento.slice(0, 15), "departamento", "cantidad", "#c0392b")]); }
  if (seg && seg.violencia_mujer && seg.violencia_mujer.por_anio) { html += rcard("🟢 Violencia contra la mujer por año (MPFN)", "sr-vcm", seg.violencia_mujer._meta); reg.push(["sr-vcm", () => lineIngAt("sr-vcm", seg.violencia_mujer.por_anio)]); }
  if (seg && seg.ciberdelitos && seg.ciberdelitos.top_tipos) { html += rcard("🟢 Top tipos de ciberdelito (MPFN)", "sr-ciber", seg.ciberdelitos._meta); reg.push(["sr-ciber", () => barSimple("sr-ciber", seg.ciberdelitos.top_tipos.slice(0, 10), "tipo", "cantidad", "#00cec9")]); }
  // MIMP / Programa AURORA (CEM) — feminicidios y violencia contra la mujer (serie larga 2012-2025)
  if (mimp) {
    if (mimp.feminicidios && mimp.feminicidios.por_anio) { html += rcard("🟢 Feminicidios por año (MIMP/CEM, 2012–2025)", "sr-femi", mimp._meta); reg.push(["sr-femi", () => lineSimple("sr-femi", mimp.feminicidios.por_anio, "anio", "cantidad", "#c0392b")]); }
    if (mimp.feminicidios && mimp.feminicidios.por_vinculo) { html += rcard("🟢 Feminicidios por vínculo con el agresor (MIMP)", "sr-vinc", mimp._meta); reg.push(["sr-vinc", () => barSimple("sr-vinc", mimp.feminicidios.por_vinculo, "vinculo", "cantidad", "#e74c3c")]); }
    if (mimp.casos_violencia && mimp.casos_violencia.por_anio) { html += rcard("🟢 Violencia contra la mujer — casos atendidos por año (CEM)", "sr-vcmanio", mimp._meta); reg.push(["sr-vcmanio", () => lineSimple("sr-vcmanio", mimp.casos_violencia.por_anio, "anio", "cantidad", "#e84393")]); }
    if (mimp.casos_violencia && mimp.casos_violencia.por_departamento) { html += rcard("🟢 Violencia contra la mujer por departamento (CEM)", "sr-vcmdep", mimp._meta); reg.push(["sr-vcmdep", () => barSimple("sr-vcmdep", mimp.casos_violencia.por_departamento.slice(0, 15), "departamento", "cantidad", "#9b59b6")]); }
  }
  // INEI / PNP — denuncias policiales (complemento a la mirada fiscal del MPFN)
  const inei = REAL.inei_denuncias;
  if (inei && inei.top_delitos) {
    html += `<div class="card"><h3>🟢 Denuncias policiales por tipo de delito (INEI / PNP, 2016–2017)</h3>
      <p class="card-sub">Mirada <b>policial</b> de la criminalidad (${fmt(inei.total_denuncias)} denuncias), complementa la mirada fiscal del MPFN.</p>
      <div class="chart" id="sr-inei"></div>${metaFoot(inei._meta)}</div>`;
    reg.push(["sr-inei", () => barSimple("sr-inei", inei.top_delitos.slice(0, 12), "tipo", "cantidad", "#e67e22")]);
  }
  box.innerHTML = html;
  reg.forEach(([id, fn]) => { try { fn(); } catch (e) {} });
  function rcard(t, id, m) { return `<div class="card"><h3>${t}</h3><div class="chart" id="${id}"></div>${metaFoot(m)}</div>`; }
}

/* ============================================================ SERIES (real) */
function renderSeries() {
  const tc = REAL.tc, delitos = REAL.mpfn_delitos, casos = REAL.mpfn_casos;
  const box = $("#series-content");
  const hasReal = tc || delitos || casos;
  if (hasReal) {
    $("#series-sub").innerHTML = "🟢 <b>Series reales</b>. El Tribunal Constitucional ofrece la serie más larga (1992–2026); el MPFN, 2019–2026 (2026 parcial). Cada gráfico cita su fuente.";
    let html = "", reg = [];
    if (tc && tc.por_anio) { html += `<div class="card"><h3>🟢 Tribunal Constitucional — expedientes ingresados por año (1992–2026)</h3><div class="chart" id="s-tc"></div>${metaFoot(tc._meta)}</div>`; reg.push(["s-tc", () => lineSimple("s-tc", tc.por_anio, "anio", "ingresados", "#9b59b6")]); }
    if (delitos && delitos.por_anio) { html += `<div class="card"><h3>🟢 Delitos denunciados por año (MPFN) — 2026 parcial</h3><div class="chart" id="s-del"></div>${metaFoot(delitos._meta)}</div>`; reg.push(["s-del", () => lineSimple("s-del", delitos.por_anio, "anio", "cantidad", "#e74c3c")]); }
    if (casos && casos.por_anio) { html += `<div class="card"><h3>🟢 Casos fiscales por año — ingresado vs atendido (MPFN)</h3><div class="chart" id="s-cas"></div>${metaFoot(casos._meta)}</div>`; reg.push(["s-cas", () => lineIngAt("s-cas", casos.por_anio)]); }
    box.innerHTML = html;
    reg.forEach(([id, fn]) => { try { fn(); } catch (e) {} });
    return;
  }
  // fallback sintético
  const s = DATA.series, yrs = s.map((x) => x.anio);
  $("#series-sub").innerHTML = "🧪 Datos sintéticos. Evolución 2010–2026.";
  box.innerHTML = `<div class="card"><h3>Demora promedio nacional (días)</h3><div class="chart" id="chart-demora-serie"></div></div>
    <div class="card"><h3>Pendientes acumulados (backlog nacional)</h3><div class="chart" id="chart-pend-serie"></div></div>`;
  mkChart("chart-demora-serie").setOption({ ...echartsTheme(), color: ["#d4a437"], tooltip: { trigger: "axis" }, grid: { left: 55, right: 20, top: 20, bottom: 30 },
    xAxis: { type: "category", data: yrs }, yAxis: { type: "value", name: "días" },
    series: [{ type: "line", smooth: true, data: s.map((x) => x.demora_dias), areaStyle: { color: "rgba(212,164,55,.12)" }, lineStyle: { width: 3 } }] });
  mkChart("chart-pend-serie").setOption({ ...echartsTheme(), color: ["#e74c3c"], tooltip: { trigger: "axis" }, grid: { left: 60, right: 20, top: 20, bottom: 30 },
    xAxis: { type: "category", data: yrs }, yAxis: { type: "value", axisLabel: { formatter: (v) => (v / 1e6).toFixed(1) + "M" } },
    series: [{ type: "bar", data: s.map((x) => x.pendientes) }] });
}

/* ============================================================ INDICADORES */
function renderIndicadores() {
  $("#tbl-ind").innerHTML =
    `<thead><tr><th>Indicador</th><th>Fórmula</th><th>Interpretación</th></tr></thead>
     <tbody>${DATA.indicadores.map((i) => `<tr><td><b>${i.indicador}</b></td><td><code>${i.formula}</code></td><td>${i.interpretacion}</td></tr>`).join("")}</tbody>`;
}

/* ============================================================ DATOS REALES */
async function fetchReal(name) {
  try { const r = await fetch(`data/real/${name}.json`); if (!r.ok) return null; return await r.json(); }
  catch (e) { return null; }
}
function metaFoot(m) {
  if (!m) return "";
  const parts = [];
  if (m.fuente) parts.push(`Fuente: ${m.fuente}`);
  if (m.fecha_corte) parts.push(`Corte: ${m.fecha_corte}`);
  if (m.cobertura) parts.push(`Cobertura: ${m.cobertura}`);
  if (m.granularidad) parts.push(`Granularidad: ${m.granularidad}`);
  const nota = m.nota ? `<p class="card-sub" style="color:var(--amber);margin-top:6px">⚠️ ${m.nota}</p>` : "";
  return `<p class="card-sub" style="margin-top:10px;border-top:1px solid var(--border);padding-top:8px">📑 ${parts.join(" · ")}${m.url ? ` · <a href="${m.url}" target="_blank" rel="noopener">recurso</a>` : ""}</p>${nota}`;
}
function renderReales() {
  // Pestaña "Fuentes & Calidad del dato": trazabilidad de fuentes + advertencias metodológicas.
  // (Los gráficos viven en sus pestañas temáticas; aquí NO se duplican.)
  const box = $("#reales-content");
  const manifest = REAL.manifest;
  const fis = REAL.mpfn_fiscales, casos = REAL.mpfn_casos, delitos = REAL.mpfn_delitos,
    pj = REAL.pj_carga_nacional, demora = REAL.demora_piura, tc = REAL.tc, seg = REAL.mpfn_seguridad;
  if (!manifest) {
    box.innerHTML = `<div class="card" style="text-align:center"><h3>🛠️ Fuentes en preparación</h3>
      <p class="card-sub">El pipeline ETL está integrando las fuentes oficiales. Vuelve en un momento.</p></div>`;
    return;
  }
  const sum = (arr, k) => (arr || []).reduce((a, x) => a + (x[k] || 0), 0);
  const MAG = {
    pj_carga_nacional: () => pj && pj.nacional ? [pj.nacional.ingresos, "ingresos"] : null,
    mpfn_fiscales: () => fis ? [fis.total_fiscales, "fiscales"] : null,
    mpfn_casos: () => casos ? [sum(casos.por_anio, "ingresado"), "casos"] : null,
    mpfn_delitos: () => delitos ? [delitos.total_denuncias, "denuncias"] : null,
    demora_piura: () => demora ? [sum(demora.por_proceso, "n"), "expedientes"] : null,
    tc: () => tc ? [sum(tc.por_anio, "ingresados"), "expedientes"] : null,
    flagrancia: () => seg && seg.flagrancia ? [seg.flagrancia.total, "casos"] : null,
    violencia_mujer: () => seg && seg.violencia_mujer ? [seg.violencia_mujer.total, "casos"] : null,
    ciberdelitos: () => seg && seg.ciberdelitos ? [seg.ciberdelitos.total, "denuncias"] : null,
    trata: () => seg && seg.trata ? [seg.trata.total, "casos"] : null,
    inei_denuncias: () => REAL.inei_denuncias ? [REAL.inei_denuncias.total_denuncias, "denuncias"] : null,
    mimp_violencia: () => REAL.mimp_violencia && REAL.mimp_violencia.casos_violencia ? [REAL.mimp_violencia.casos_violencia.total, "casos"] : null,
  };
  let html = `<div class="card"><h3>📚 Fuentes integradas</h3>
    <p class="card-sub">La columna <b>magnitud</b> es el volumen real (casos, denuncias o expedientes); los datos agregados resumen ese volumen en pocas filas. <span class="pill blue">expediente</span> = microdata por caso (permite demora real); <span class="pill amber">agregado</span> = totales por periodo/territorio.</p>
    <div class="table-wrap"><table>
    <thead><tr><th>Dataset</th><th>Institución</th><th>Cobertura</th><th>Granularidad</th><th>Fecha corte</th><th class="num">Magnitud</th></tr></thead>
    <tbody>${manifest.datasets.map((d) => {
      const mg = (MAG[d.id] && MAG[d.id]()) || null;
      const magCell = mg ? `${fmt(mg[0])} <span style="color:var(--muted);font-size:11px">${mg[1]}</span>` : (d.n_registros == null ? (d.error ? "❌" : "—") : `${fmt(d.n_registros)} <span style="color:var(--muted);font-size:11px">filas</span>`);
      return `<tr>
      <td><b>${d.titulo || d.id}</b></td><td>${d.institucion || d.fuente || "—"}</td><td>${d.cobertura || "—"}</td>
      <td><span class="pill ${d.granularidad === "expediente" ? "blue" : "amber"}">${d.granularidad || "—"}</span></td>
      <td>${d.fecha_corte || "—"}</td><td class="num">${magCell}</td></tr>`;
    }).join("")}</tbody></table></div></div>`;

  // --- Calidad / advertencias metodológicas ---
  html += `<div class="card"><h3>🔎 Calidad del dato y advertencias</h3>
    <ul style="margin:0;padding-left:20px;line-height:1.9;font-size:13.5px">
      <li>📅 <b>Cobertura temporal por fuente:</b> MPFN (delitos, casos, fiscales) cubre <b>2019–2026</b> (2026 parcial). La <b>carga del Poder Judicial solo está en 2024</b> en datos abiertos; 2021–2023 y 2025–2026 requieren el <a href="https://portalestadistico.pj.gob.pe/" target="_blank" rel="noopener">Portal Estadístico del PJ</a> (descarga manual). El Tribunal Constitucional cubre <b>1992–2026</b>.</li>
      <li>⚠️ <b>Clearance/congestión del PJ = provisionales:</b> el dataset del PJ no publica diccionario y la semántica de columnas es ambigua; la tasa derivada está en validación (los conteos de ingresos/resueltos/pendientes sí son sumas reales).</li>
      <li>🔒 <b>Privacidad:</b> la microdata por expediente (CSJ Piura) se <b>anonimiza</b> —se eliminan DNI y fecha de nacimiento— antes de procesar. No se exponen datos personales.</li>
      <li>📐 <b>Demora real en días</b> solo se calcula donde hay microdata por expediente (TC y CSJ Piura). En el resto se usan índices agregados; <b>no se derivan días desde agregados</b>.</li>
      <li>🚫 <b>Nunca se inventan datos:</b> donde no hay fuente abierta (rotaciones nominales de magistrados, casos por juzgado individual) la vista se omite o se sustituye por el agregado real disponible.</li>
    </ul>
    <p class="card-sub" style="margin-top:12px">Más detalle en el <a href="https://github.com/unimauro/observatorio-justicia-peru/blob/main/data/INVENTARIO.md" target="_blank" rel="noopener">inventario de datos</a>, el <a href="https://github.com/unimauro/observatorio-justicia-peru/blob/main/docs/DATA_CATALOG.md" target="_blank" rel="noopener">catálogo de fuentes</a> y el <a href="https://github.com/unimauro/observatorio-justicia-peru/blob/main/SPEC.md" target="_blank" rel="noopener">SPEC</a>.</p></div>`;
  box.innerHTML = html;
}
function barSimple(id, rows, kx, ky, color) {
  rows = [...rows].sort((a, b) => b[ky] - a[ky]);
  mkChart(id).setOption({ ...echartsTheme(), color: [color], tooltip: { trigger: "axis" },
    grid: { left: 150, right: 30, top: 10, bottom: 24 }, xAxis: { type: "value" },
    yAxis: { type: "category", data: rows.map((r) => r[kx]).reverse(), axisLabel: { fontSize: 10 } },
    series: [{ type: "bar", data: rows.map((r) => r[ky]).reverse() }] });
}
function barIngRes(id, rows, kx) {
  rows = [...rows].sort((a, b) => (b.ingresos || 0) - (a.ingresos || 0));
  mkChart(id).setOption({ ...echartsTheme(), color: ["#d4a437", "#2ecc71"], tooltip: { trigger: "axis" },
    legend: { top: 0, textStyle: echartsTheme().textStyle }, grid: { left: 140, right: 30, top: 36, bottom: 24 },
    xAxis: { type: "value" }, yAxis: { type: "category", data: rows.map((r) => r[kx]).reverse(), axisLabel: { fontSize: 10 } },
    series: [{ name: "Ingresos", type: "bar", data: rows.map((r) => r.ingresos).reverse() },
             { name: "Resueltos", type: "bar", data: rows.map((r) => r.resueltos).reverse() }] });
}
function barIngRes2(id, rows, kx, k1, k2) {
  rows = [...rows].sort((a, b) => (b[k1] || 0) - (a[k1] || 0));
  mkChart(id).setOption({ ...echartsTheme(), color: ["#d4a437", "#4f8cff"], tooltip: { trigger: "axis" },
    legend: { top: 0, textStyle: echartsTheme().textStyle }, grid: { left: 140, right: 30, top: 36, bottom: 24 },
    xAxis: { type: "value" }, yAxis: { type: "category", data: rows.map((r) => r[kx]).reverse(), axisLabel: { fontSize: 10 } },
    series: [{ name: k1, type: "bar", data: rows.map((r) => r[k1]).reverse() },
             { name: k2, type: "bar", data: rows.map((r) => r[k2]).reverse() }] });
}
function demoraChart(id, rows) {
  rows = [...rows].sort((a, b) => b.p90_dias - a.p90_dias);
  mkChart(id).setOption({ ...echartsTheme(), color: ["#d4a437", "#e74c3c"], tooltip: { trigger: "axis" },
    legend: { top: 0, textStyle: echartsTheme().textStyle }, grid: { left: 160, right: 30, top: 36, bottom: 24 },
    xAxis: { type: "value", name: "días" }, yAxis: { type: "category", data: rows.map((r) => r.proceso) },
    series: [{ name: "Mediana", type: "bar", data: rows.map((r) => r.mediana_dias) },
             { name: "P90", type: "bar", data: rows.map((r) => r.p90_dias) }] });
}
function lineSimple(id, rows, kx, ky, color) {
  rows = [...rows].sort((a, b) => a[kx] - b[kx]);
  mkChart(id).setOption({ ...echartsTheme(), color: [color], tooltip: { trigger: "axis" },
    grid: { left: 60, right: 24, top: 20, bottom: 30 }, xAxis: { type: "category", data: rows.map((r) => r[kx]) },
    yAxis: { type: "value", axisLabel: { formatter: (v) => v >= 1e6 ? (v / 1e6).toFixed(1) + "M" : v >= 1e3 ? (v / 1e3).toFixed(0) + "k" : v } },
    series: [{ type: "line", smooth: true, data: rows.map((r) => r[ky]), areaStyle: { opacity: .12 }, lineStyle: { width: 3 } }] });
}
function lineIngAt(id, rows) {
  rows = [...rows].sort((a, b) => a.anio - b.anio);
  mkChart(id).setOption({ ...echartsTheme(), color: ["#d4a437", "#4f8cff"], tooltip: { trigger: "axis" },
    legend: { top: 0, textStyle: echartsTheme().textStyle }, grid: { left: 60, right: 24, top: 36, bottom: 30 },
    xAxis: { type: "category", data: rows.map((r) => r.anio) },
    yAxis: { type: "value", axisLabel: { formatter: (v) => v >= 1e6 ? (v / 1e6).toFixed(1) + "M" : (v / 1e3).toFixed(0) + "k" } },
    series: [{ name: "Ingresado", type: "line", smooth: true, data: rows.map((r) => r.ingresado) },
             { name: "Atendido", type: "line", smooth: true, data: rows.map((r) => r.atendido) }] });
}
function donut(id, rows, kx, ky) {
  mkChart(id).setOption({ ...echartsTheme(), color: PALETTE,
    tooltip: { trigger: "item", formatter: (p) => `${p.name}: ${fmt(p.value)} (${p.percent}%)` },
    legend: { bottom: 0, textStyle: echartsTheme().textStyle },
    series: [{ type: "pie", radius: ["45%", "70%"], center: ["50%", "44%"], data: rows.map((r) => ({ name: r[kx], value: r[ky] })),
      label: { color: echartsTheme().textStyle.color }, itemStyle: { borderColor: "var(--surface)", borderWidth: 2 } }] });
}
function histChart(id, hist) {
  const procesos = Object.keys(hist);
  // union de buckets ordenada por 'desde'
  const seen = {}; const buckets = [];
  procesos.forEach((p) => hist[p].forEach((b) => { if (!(b.bucket in seen)) { seen[b.bucket] = b.desde; buckets.push(b.bucket); } }));
  buckets.sort((a, b) => seen[a] - seen[b]);
  const series = procesos.map((p) => {
    const m = {}; hist[p].forEach((b) => (m[b.bucket] = b.n));
    return { name: p, type: "bar", data: buckets.map((bk) => m[bk] || 0) };
  });
  mkChart(id).setOption({ ...echartsTheme(), color: PALETTE, tooltip: { trigger: "axis" },
    legend: { top: 0, type: "scroll", textStyle: echartsTheme().textStyle }, grid: { left: 55, right: 24, top: 36, bottom: 40 },
    xAxis: { type: "category", data: buckets, axisLabel: { rotate: 30, fontSize: 10 }, name: "días" },
    yAxis: { type: "value", name: "expedientes" }, series });
}

/* ============================================================ PREDICCIÓN (ML) */
function renderPrediccion() {
  const box = $("#ml-content"); const ml = REAL.ml_demora;
  if (!ml) {
    box.innerHTML = `<div class="card" style="text-align:center"><h3>🔮 Modelo en preparación</h3>
      <p class="card-sub" style="max-width:620px;margin:8px auto">El modelo de predicción de demora se entrena con la microdata real por expediente (CSJ Piura).
      Ejecuta <code>python ml/train_demora.py</code> para generarlo. En producción se sirve desde la API del VPS (FastAPI).</p></div>`;
    return;
  }
  const m = ml.metricas;
  const mejora = Math.round((1 - m.mae_dias / m.baseline_mae_dias) * 100);
  let html = `<div class="disclaimer" style="border-color:rgba(155,89,182,.35);background:rgba(155,89,182,.08);color:#c39bd3">🔮 <b>Modelo:</b> ${ml._meta.modelo} · entrenado con microdata real por expediente (${ml._meta.cobertura}). Predice <b>días hasta sentencia</b>. ${ml.nota}</div>`;
  html += `<div class="kpi-grid">
    <div class="kpi ok"><div class="label">Error medio (MAE)</div><div class="value">${m.mae_dias} d</div><div class="hint">en ${fmt(m.n_test)} casos de prueba</div></div>
    <div class="kpi ok"><div class="label">Error mediano</div><div class="value">${m.error_mediano_dias} d</div><div class="hint">la mitad de los casos, menos de esto</div></div>
    <div class="kpi"><div class="label">Mejora vs. baseline</div><div class="value">${mejora}%</div><div class="hint">vs. predecir siempre la mediana (${m.baseline_mae_dias} d)</div></div>
    <div class="kpi ${m.r2 < 0.4 ? "warn" : ""}"><div class="label">R²</div><div class="value">${m.r2}</div><div class="hint">poder explicativo (honesto: modesto)</div></div>
  </div>`;
  // --- Calculadora interactiva (llama al endpoint ML en vivo) ---
  const PROCS = ["Alimentos", "NLPT Laboral", "Penal (pena efectiva)", "Civil"];
  const INST = ["JUZGADO DE PAZ LETRADO", "JUZGADO LABORAL", "JUZGADO CIVIL", "JUZGADO DE FAMILIA",
    "JUZ. INVESTIGACION PREPARATORIA", "JUZ. PENAL UNIPERSONAL", "JUZ. PENAL COLEGIADO", "SALA SUPERIOR", "OTRO"];
  const PROV = ["PIURA", "SULLANA", "MORROPON", "AYABACA", "HUANCABAMBA", "PAITA", "TALARA", "SECHURA"];
  const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  const opt = (arr, f) => arr.map((v, i) => `<option value="${f ? i + 1 : v}">${v}</option>`).join("");
  html += `<div class="card"><h3>🔮 Calculadora de demora — estima tu caso</h3>
    <p class="card-sub">Elige las características y el modelo (en vivo, desde el VPS) estima los días hasta sentencia. Cobertura: CSJ Piura.</p>
    <div class="controls">
      <label>Proceso <select id="pf-proceso">${opt(PROCS)}</select></label>
      <label>Instancia <select id="pf-inst">${opt(INST)}</select></label>
      <label>Provincia <select id="pf-prov">${opt(PROV)}</select></label>
      <label>Ingreso <select id="pf-ing"><option>ELECTRONICO</option><option>FISICO</option></select></label>
      <label>Mes <select id="pf-mes">${opt(MESES, true)}</select></label>
      <button class="chip active" id="pf-go" style="border:none">Estimar demora →</button>
    </div>
    <div id="pf-result"></div></div>`;
  html += `<div class="card"><h3>🔮 Demora real vs. predicha por proceso (mediana, días)</h3><div class="chart" id="ml-chart"></div>${metaFoot(ml._meta)}</div>`;
  html += `<div class="card"><h3>¿Cómo se usa?</h3><p class="card-sub" style="font-size:13.5px">El modelo estima cuánto tardará un expediente según su <b>proceso, instancia, provincia y mes de ingreso</b>.
    Sirve para <b>anticipar carga</b>, <b>priorizar</b> expedientes en riesgo de estancarse y <b>simular</b> escenarios. La predicción se sirve en vivo desde el VPS
    (<code>POST ${ML_PREDICT_ENDPOINT.replace("https://", "")}</code>). Ver <a href="https://github.com/unimauro/observatorio-justicia-peru/blob/main/docs/ML_PLAN.md" target="_blank" rel="noopener">plan ML</a>.</p></div>`;
  box.innerHTML = html;
  attachPredictForm(ml);
  try {
    const rows = ml.por_proceso;
    mkChart("ml-chart").setOption({ ...echartsTheme(), color: ["#4f8cff", "#9b59b6"], tooltip: { trigger: "axis" },
      legend: { top: 0, textStyle: echartsTheme().textStyle }, grid: { left: 150, right: 30, top: 36, bottom: 24 },
      xAxis: { type: "value", name: "días" }, yAxis: { type: "category", data: rows.map((r) => r.proceso) },
      series: [{ name: "Demora real (mediana)", type: "bar", data: rows.map((r) => r.demora_real_mediana) },
               { name: "Demora predicha (mediana)", type: "bar", data: rows.map((r) => r.demora_predicha_mediana) }] });
  } catch (e) {}
}

function attachPredictForm(ml) {
  const go = $("#pf-go"); if (!go) return;
  go.addEventListener("click", async () => {
    const proceso = $("#pf-proceso").value;
    const body = {
      proceso,
      materia_f: "NA",
      provincia_f: $("#pf-prov").value,
      tipo_ingreso_f: $("#pf-ing").value,
      instancia_tipo: $("#pf-inst").value,
      mes_anio: parseInt($("#pf-mes").value, 10),
    };
    const res = $("#pf-result");
    res.innerHTML = `<p class="card-sub"><span class="spin"></span> Consultando el modelo…</p>`;
    let dias = null, live = false;
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 8000);
      const r = await fetch(ML_PREDICT_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctl.signal });
      clearTimeout(t);
      if (r.ok) { const j = await r.json(); if (j.dias_estimados != null) { dias = j.dias_estimados; live = true; } }
    } catch (e) {}
    if (dias == null) {  // fallback: mediana real precomputada del proceso
      const p = (ml.por_proceso || []).find((x) => x.proceso === proceso);
      dias = p ? p.demora_predicha_mediana : null;
    }
    if (dias == null) { res.innerHTML = `<p class="card-sub" style="color:var(--amber)">No se pudo estimar (modelo no disponible).</p>`; return; }
    const meses = (dias / 30).toFixed(1);
    res.innerHTML = `<div class="kpi ${dias > 365 ? "warn" : "ok"}" style="margin-top:12px;max-width:360px">
      <div class="label">🔮 Demora estimada ${live ? "· modelo en vivo" : "· valor de referencia"}</div>
      <div class="value">${fmt(dias)} días</div>
      <div class="hint">≈ ${meses} meses · proceso ${proceso} · CSJ Piura</div></div>
      <p class="card-sub" style="margin-top:8px">⚠️ Estimación basada en microdata real de Piura; no aplicable a otras cortes. Error medio del modelo ≈ ${ml.metricas.mae_dias} días.</p>`;
  });
}

/* ============================================================ FAQ */
const REPO = "https://github.com/unimauro/observatorio-justicia-peru";
// Apoyo al proyecto — rellenar con los enlaces/numeros EXACTOS (vacío = botón oculto).
const SUPPORT = {
  autor: "Carlos Mauro Cárdenas",
  github: "https://github.com/unimauro",
  email: "carlos@cardenas.pe",
  coffee: "https://buymeacoffee.com/unimauro",
  paypal: "https://paypal.me/unimauro",
  yape: "940584307",
  yapeNombre: "Carlos Mauro Cárdenas",
};
const FAQ = [
  ["¿Qué es el Observatorio Nacional de Justicia del Perú?",
   "Es una plataforma de <b>datos abiertos e inteligencia territorial</b> sobre el sistema de justicia peruano. Reúne, en un solo lugar y de forma comparable, la <b>carga procesal</b>, la <b>demora</b>, la <b>congestión</b>, la <b>dotación de fiscales</b> y la <b>criminalidad/seguridad</b> (incluida violencia contra la mujer y feminicidios), con cada cifra citando su fuente oficial y fecha de corte. Es un proyecto de transparencia para ciudadanía, periodismo de datos, investigación y políticas públicas."],
  ["¿Cómo se construyó? (el proceso, paso a paso)",
   "Se siguió un método ordenado, documentado en el <a href='" + REPO + "/blob/main/SPEC.md' target='_blank' rel='noopener'>SPEC</a>:<br/>" +
   "<b>Fase 0 — Inventario:</b> antes de programar nada, se rastrearon las fuentes reales (no se asumió que existían). Se descubrió que el portal del Estado responde por API y se catalogaron los datasets útiles.<br/>" +
   "<b>Fase 1 — ETL:</b> scripts en Python descargan, limpian, <b>anonimizan</b> y normalizan cada fuente a un esquema único.<br/>" +
   "<b>Fase 2 — Indicadores:</b> se calculan tasas estándar (clearance, congestión, demora real) con fórmulas reconocidas.<br/>" +
   "<b>Fase 3 — Tablero:</b> visualización con mapas y gráficos (este sitio).<br/>" +
   "<b>Fase 4 — Machine Learning:</b> un modelo que predice la demora de un expediente.<br/>" +
   "<b>Fase 5 — Asistente IA:</b> un copiloto que responde preguntas sobre los datos."],
  ["¿De dónde salen los datos? ¿Qué instituciones?",
   "De fuentes <b>oficiales del Estado peruano</b>, principalmente vía <a href='https://www.datosabiertos.gob.pe' target='_blank' rel='noopener'>datosabiertos.gob.pe</a> (la plataforma nacional de datos abiertos):<br/>" +
   "• <b>Poder Judicial (PJ):</b> carga procesal nacional (ingresos, resueltos, pendientes) y microdata por expediente de la Corte Superior de Piura (con fechas reales).<br/>" +
   "• <b>Ministerio Público (MPFN):</b> casos fiscales, dotación de fiscales, delitos denunciados, flagrancia, ciberdelitos, trata de personas.<br/>" +
   "• <b>Tribunal Constitucional (TC):</b> expedientes 1992–2026 con demora real.<br/>" +
   "• <b>INEI / PNP:</b> denuncias policiales de delitos y faltas.<br/>" +
   "• <b>MIMP / Programa AURORA (Centros Emergencia Mujer):</b> violencia contra la mujer y feminicidios (2012–2025).<br/>" +
   "La lista completa, con cobertura y fecha de corte, está en la pestaña <b>📋 Fuentes & Calidad</b> y en el <a href='" + REPO + "/blob/main/data/INVENTARIO.md' target='_blank' rel='noopener'>inventario de datos</a>."],
  ["¿Cómo verificaron que las fuentes son reales y no inventadas?",
   "Se consultó directamente la <b>API</b> del portal de datos abiertos (compatible con CKAN) y se leyeron los <b>encabezados y diccionarios reales</b> de cada archivo antes de usarlo. De ~4,665 datasets del portal se filtraron los relevantes al sistema de justicia. Nada se transcribe a mano: todo pasa por scripts reproducibles que cualquiera puede correr desde el <a href='" + REPO + "' target='_blank' rel='noopener'>repositorio</a>."],
  ["¿Hay datos simulados todavía?",
   "No en lo que se presenta como dato. El tablero arrancó con un prototipo sintético para diseñar la interfaz, pero <b>ya se reemplazó por datos oficiales en todas las pestañas</b> (marcadas 🟢). Donde <b>no existe fuente abierta</b> —por ejemplo, rotaciones nominales de jueces o casos por juzgado individual— simplemente <b>no se muestra</b> y se explica por qué; no se inventa para llenar el hueco."],
  ["¿Por qué la 'demora en días' solo aparece en algunos lugares?",
   "Porque calcular la demora literal (fecha de ingreso → fecha de sentencia) requiere <b>microdata por expediente</b>, y eso solo está abierto para el <b>Tribunal Constitucional</b> (1992–2026) y la <b>Corte Superior de Piura</b> (laboral, alimentos, penal, civil). Para el resto del país, los datos son agregados; derivar 'días' de ahí sería inventar. En esos casos se usan índices de <b>congestión</b> y <b>tasa de resolución</b>, que sí son calculables."],
  ["¿Qué indicadores usan y con qué fórmulas?",
   "<b>Tasa de resolución (clearance)</b> = resueltos / ingresos × 100. <b>Congestión</b> = (pendientes + ingresos) / resueltos. <b>Tasa de pendencia</b> = pendientes / carga × 100. <b>Demora real</b> = fecha de resolución − fecha de ingreso (se reporta mediana y P90, no solo promedio). Se basan en metodologías de la <b>CEPEJ</b> (Comisión Europea para la Eficiencia de la Justicia) y el <b>Banco Mundial</b>. Glosario completo en la pestaña 📐 <b>Indicadores</b>."],
  ["¿Cómo cuidan la privacidad de las personas?",
   "Algunos archivos de microdata por expediente traían DNI y fecha de nacimiento; esas columnas se <b>eliminan automáticamente</b> en el ETL <b>antes</b> de procesar. El tablero <b>nunca</b> muestra datos personales de partes, jueces o fiscales nominales. De los fiscales solo se muestra la <b>dotación agregada</b> (por cargo, condición, sexo, distrito), tal como la publica el Ministerio Público."],
  ["¿Qué es la 'Predicción (ML)' y qué tan confiable es?",
   "Es un modelo de <b>machine learning</b> entrenado con la microdata real de Piura (11,723 expedientes) que estima cuántos <b>días</b> tardará un expediente según su proceso, instancia, provincia y mes. Su error medio es de ~76 días (mejor que el método base). <b>Honestidad:</b> solo es válido para Piura, la única corte con microdata real; no se extrapola al resto del país. Cuando haya microdata de más cortes, el modelo se amplía."],
  ["¿Cómo funciona el asistente IA (chatbot)?",
   "El copiloto responde preguntas sobre los datos del observatorio. Funciona con un <b>modelo de lenguaje</b> alojado en un servidor del ecosistema <b>tunky.net</b> (vía OpenRouter); como el sitio es estático y público, la clave de IA <b>nunca</b> está en el navegador. Tiene reglas estrictas: solo responde sobre el sistema de justicia, se basa en los datos cargados y no da asesoría legal personalizada."],
  ["¿Cada cuánto se actualiza y qué cobertura tiene?",
   "Depende de cada fuente: el MPFN cubre 2019–2026, el Tribunal Constitucional 1992–2026, el MIMP 2012–2025, y la carga del Poder Judicial actualmente solo 2024 en datos abiertos (los demás años requieren descarga manual del Portal Estadístico). Cada gráfico muestra su <b>fecha de corte</b>; el detalle de coberturas y huecos está en la pestaña <b>📋 Fuentes & Calidad</b>."],
  ["¿Puedo usar, auditar o reproducir esto?",
   "Sí. Es <b>código abierto</b> (licencia MIT). Todo el código (ETL, indicadores, tablero, modelo) y los datos procesados están en el <a href='" + REPO + "' target='_blank' rel='noopener'>repositorio de GitHub</a>. Puedes verificar cada cifra contra su fuente, correr los scripts o construir sobre el proyecto."],
  ["¿Quién hizo este dashboard y cómo lo apoyo?",
   "Lo desarrolló <b>" + SUPPORT.autor + "</b> (<a href='" + SUPPORT.github + "' target='_blank' rel='noopener'>@unimauro</a>), de forma independiente y abierta. Contacto: <a href='mailto:" + SUPPORT.email + "'>" + SUPPORT.email + "</a>. " +
   "Es un proyecto sin fines de lucro para fortalecer la transparencia del sistema de justicia; si te resulta útil, puedes <b>apoyarlo</b> con una estrella ⭐ al repositorio o una donación (ver opciones abajo). Cada aporte ayuda a mantener el servidor y a integrar más fuentes de datos."],
];
function renderFaq() {
  $("#faq-content").innerHTML = FAQ.map(([q, a], i) => `
    <div class="card" style="cursor:pointer" data-faq="${i}">
      <h3 style="display:flex;justify-content:space-between;gap:10px">${q}<span class="faq-arrow" style="color:var(--gold)">＋</span></h3>
      <div class="faq-a" style="display:none;color:var(--text)"><p class="card-sub" style="font-size:13.5px;color:var(--muted)">${a}</p></div>
    </div>`).join("");
  $$("#faq-content [data-faq]").forEach((c) => c.addEventListener("click", () => {
    const a = c.querySelector(".faq-a"), arr = c.querySelector(".faq-arrow");
    const open = a.style.display !== "none";
    a.style.display = open ? "none" : "block"; arr.textContent = open ? "＋" : "−";
  }));
  // --- Sección "Apoya el proyecto" ---
  const btn = (href, bg, label) => `<a href="${href}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:7px;background:${bg};color:#1a1300;padding:10px 16px;border-radius:10px;font-weight:800;font-size:13.5px;text-decoration:none">${label}</a>`;
  const btns = [btn(REPO, "var(--gold)", "⭐ Estrella en GitHub")];
  if (SUPPORT.coffee) btns.push(btn(SUPPORT.coffee, "#ffdd00", "☕ Cómprame un café"));
  if (SUPPORT.paypal) btns.push(btn(SUPPORT.paypal, "#00a2ff", "💳 PayPal"));
  let yapeHtml = "";
  if (SUPPORT.yape) yapeHtml = `<div style="margin-top:10px;color:var(--muted);font-size:13px">📱 <b>Yape:</b> ${SUPPORT.yape}${SUPPORT.yapeNombre ? " · " + SUPPORT.yapeNombre : ""}</div>`;
  $("#faq-content").insertAdjacentHTML("beforeend", `
    <div class="card" style="border-color:rgba(46,204,113,.3);background:rgba(46,204,113,.05)">
      <h3>💚 Apoya el proyecto</h3>
      <p class="card-sub" style="font-size:13.5px">Hecho por <b>${SUPPORT.autor}</b> (<a href="${SUPPORT.github}" target="_blank" rel="noopener">@unimauro</a>) · <a href="mailto:${SUPPORT.email}">${SUPPORT.email}</a><br/>
      Proyecto abierto y sin fines de lucro. Tu apoyo ayuda a mantener el servidor de IA y a integrar más fuentes de datos.</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px">${btns.join("")}</div>
      ${yapeHtml}
    </div>`);
}

/* ---------- helpers ---------- */
function groupCount(arr, key) {
  const m = {}; arr.forEach((x) => { m[x[key]] = (m[x[key]] || 0) + 1; });
  return Object.entries(m).sort((a, b) => b[1] - a[1]);
}

/* ---------- Theme toggle ---------- */
function setupTheme() {
  $("#theme-toggle").addEventListener("click", () => {
    const light = isLight();
    document.documentElement.setAttribute("data-theme", light ? "dark" : "light");
    $("#theme-toggle").textContent = light ? "🌙" : "☀️";
    rendered.__none = false;
    Object.keys(charts).forEach((k) => { if (k !== "map" && charts[k]) { charts[k].dispose(); delete charts[k]; } });
    Object.keys(rendered).forEach((k) => { if (k !== "mapa") rendered[k] = false; });
    const active = $("main .panel.active").id;
    renderPanel(active);
  });
}

/* ============================================================ AI ASSISTANT */
const AI_SUGGEST = [
  "¿Qué corte tiene más congestión?",
  "¿Qué departamento tiene mayor demora?",
  "¿Cuántos casos críticos de seguridad hay?",
  "Resumen ejecutivo nacional",
];
function setupAI() {
  $("#ai-fab").addEventListener("click", () => $("#ai-panel").classList.toggle("open"));
  $("#ai-x").addEventListener("click", () => $("#ai-panel").classList.remove("open"));
  $("#ai-suggest").innerHTML = AI_SUGGEST.map((s) => `<span class="chip">${s}</span>`).join("");
  $$("#ai-suggest .chip").forEach((c) => c.addEventListener("click", () => aiAsk(c.textContent)));
  $("#ai-send").addEventListener("click", () => aiAsk($("#ai-input").value));
  $("#ai-input").addEventListener("keydown", (e) => { if (e.key === "Enter") aiAsk($("#ai-input").value); });
  aiBot("¡Hola! Soy el copiloto de justicia. Puedo responder sobre los datos del observatorio. Prueba una sugerencia 👇");
}
/* Markdown mínimo y seguro: escapa HTML y luego aplica formato (negrita, itálica, código,
   listas, encabezados, enlaces). Usado para las respuestas del modelo (texto markdown). */
function escapeHtml(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function mdToHtml(src) {
  let s = escapeHtml(String(src || ""));
  const lines = s.split(/\r?\n/), out = []; let inList = false, inOl = false;
  const inline = (t) => t
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  for (let ln of lines) {
    if (/^\s*[-*]\s+/.test(ln)) { if (!inList) { out.push("<ul>"); inList = true; } out.push("<li>" + inline(ln.replace(/^\s*[-*]\s+/, "")) + "</li>"); continue; }
    if (/^\s*\d+\.\s+/.test(ln)) { if (!inOl) { out.push("<ol>"); inOl = true; } out.push("<li>" + inline(ln.replace(/^\s*\d+\.\s+/, "")) + "</li>"); continue; }
    if (inList) { out.push("</ul>"); inList = false; }
    if (inOl) { out.push("</ol>"); inOl = false; }
    const h = ln.match(/^(#{1,4})\s+(.*)$/);
    if (h) { out.push(`<b>${inline(h[2])}</b>`); continue; }
    if (ln.trim() === "") { out.push("<br/>"); continue; }
    out.push(inline(ln) + "<br/>");
  }
  if (inList) out.push("</ul>"); if (inOl) out.push("</ol>");
  return out.join("");
}
function aiBot(html) { $("#ai-msgs").insertAdjacentHTML("beforeend", `<div class="msg bot">${html}</div>`); $("#ai-msgs").scrollTop = 1e9; }
function aiBotMd(md) { aiBot(mdToHtml(md)); }
function aiUser(t) { $("#ai-msgs").insertAdjacentHTML("beforeend", `<div class="msg user">${escapeHtml(t)}</div>`); $("#ai-msgs").scrollTop = 1e9; }

/* Endpoint del copiloto (ecosistema tunky.net). Debe ser un proxy serverless que reciba
   {question, context} y use la Claude API server-side (la API key NUNCA va en el cliente).
   Si el endpoint no responde, se usa el motor local de respuestas. Configurable por ?ai= o window.AI_ENDPOINT. */
const AI_ENDPOINT = new URLSearchParams(location.search).get("ai") || window.AI_ENDPOINT || "https://ai.tunky.net/justicia-api/v1/justicia/chat";
const ML_PREDICT_ENDPOINT = AI_ENDPOINT.replace(/\/chat$/, "/predict-demora");
function aiContext() {
  const n = DATA.nacional;
  const real = {};
  if (REAL.mpfn_delitos) real.delitos_denunciados_total = REAL.mpfn_delitos.total_denuncias;
  if (REAL.mpfn_fiscales) real.fiscales_total = REAL.mpfn_fiscales.total_fiscales;
  if (REAL.pj_carga_nacional) real.pj_2024 = REAL.pj_carga_nacional.nacional;
  if (REAL.tc && REAL.tc.demora) real.tc_demora_mediana_dias = REAL.tc.demora.global.mediana_dias;
  if (REAL.mpfn_seguridad) real.seguridad = {
    violencia_mujer: REAL.mpfn_seguridad.violencia_mujer?.total,
    ciberdelitos: REAL.mpfn_seguridad.ciberdelitos?.total,
    trata: REAL.mpfn_seguridad.trata?.total,
  };
  if (REAL.ml_demora) real.modelo_demora = REAL.ml_demora.metricas;
  return {
    DATOS_REALES_oficiales: real,
    PROTOTIPO_sintetico: {
      nacional: n,
      top_cortes_congestion: DATA.cortes.slice(0, 5).map((c) => ({ corte: c.corte, congestion: c.congestion })),
    },
    aviso: "Usa DATOS_REALES_oficiales para cifras citables (con fuente). PROTOTIPO_sintetico es ilustrativo: acláralo si lo usas.",
  };
}
async function aiAsk(q) {
  q = (q || "").trim(); if (!q) return;
  aiUser(q); $("#ai-input").value = "";
  if (aiOffTopic(q)) { aiBot(aiAnswer(q)); return; }  // guardrail: no sale del tema, no llama al modelo
  const thinking = `<div class="msg bot" id="ai-think"><span class="spin"></span> pensando…</div>`;
  $("#ai-msgs").insertAdjacentHTML("beforeend", thinking); $("#ai-msgs").scrollTop = 1e9;
  let answer = null;
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 6000);
    const r = await fetch(AI_ENDPOINT, {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: ctl.signal,
      body: JSON.stringify({ question: q, context: aiContext() }),
    });
    clearTimeout(t);
    if (r.ok) { const j = await r.json(); answer = j.answer || j.text || j.message || null; }
  } catch (e) { /* sin conexión al endpoint: fallback local */ }
  $("#ai-think") && $("#ai-think").remove();
  if (answer) aiBotMd(answer);   // respuesta del modelo: render markdown
  else aiBot(aiAnswer(q));        // fallback local: HTML estático de confianza
}

/* Guardrail de tema: el copiloto SOLO trata sobre el observatorio / sistema de justicia.
   Si la pregunta es claramente de otro tema, no responde fuera de alcance. */
const AI_TOPICS = /justic|corte|juzgad|juez|jueces|fiscal|expedient|proces|demora|congesti|carga|delito|denuncia|segurid|crimen|penal|civil|laboral|familia|alimento|tribunal|tc|mpfn|backlog|resoluci|sentenc|observatori|dato|departament|distrito|magistrad|peru|perú|inei|poder judicial|rotaci|indicador|predicc|modelo|ml/i;
function aiOffTopic(q) {
  const s = (q || "").toLowerCase();
  if (AI_TOPICS.test(s)) return false;
  // saludos y meta-preguntas se permiten
  if (/hola|gracias|ayuda|qué puedes|que puedes|quien eres|quién eres|cómo funciona|como funciona/.test(s)) return false;
  return s.length > 0;
}
/* Motor local de respuestas (sin backend). En producción: conectar a un endpoint
   tipo ai.tunky.net que reciba la pregunta + el contexto JSON y use Claude API. */
function aiAnswer(q) {
  const s = q.toLowerCase(), n = DATA.nacional;
  if (aiOffTopic(q)) {
    return `Soy el copiloto del <b>Observatorio Nacional de Justicia del Perú</b>. Solo puedo ayudarte con temas de este tablero: carga procesal, demora, congestión, cortes y distritos judiciales, jueces y fiscales, delitos y seguridad, o las predicciones del modelo. ¿Qué te gustaría saber sobre el sistema de justicia? 🤔`;
  }
  if (/congesti|saturad/.test(s)) {
    const top = DATA.cortes[0];
    return `La corte con mayor congestión es <b>${top.corte}</b> (${fmt1(top.congestion)}), con ${fmt(top.pendientes)} expedientes pendientes y ${fmt(top.jueces)} jueces. Le siguen ${DATA.cortes[1].corte} y ${DATA.cortes[2].corte}.`;
  }
  if (/demora|tarda|lent|tiempo/.test(s)) {
    const d = [...DATA.departamentos].sort((a, b) => b.demora_dias - a.demora_dias)[0];
    const t = [...DATA.tipos_proceso].sort((a, b) => b.demora_p90_dias - a.demora_p90_dias)[0];
    return `El departamento con mayor demora promedio es <b>${d.departamento}</b> (${fmt(d.demora_dias)} días). A nivel nacional el promedio es ${fmt(n.tiempo_promedio_dias)} días. El proceso más lento es <b>${t.tipo}</b> (P90 ≈ ${fmt(t.demora_p90_dias)} días).`;
  }
  if (/segurid|crimen|critic|extorsi|narco/.test(s)) {
    const crit = DATA.casos_seguridad.filter((x) => x.nivel_alerta === "Critico");
    const byTema = groupCount(DATA.casos_seguridad, "tema")[0];
    return `Hay <b>${fmt(crit.length)} casos críticos</b> (más de 1000 días sin resolver) de ${fmt(DATA.casos_seguridad.length)} monitoreados. El tema más frecuente es <b>${byTema[0]}</b> (${byTema[1]} casos). Revisa la pestaña 🚨 Seguridad para el detalle.`;
  }
  if (/juez|fiscal|magistrad|rotaci/.test(s)) {
    return `El observatorio sigue ${fmt(DATA.jueces.length)} jueces y ${fmt(DATA.fiscales.length)} fiscales (muestra), con su corte actual, especialidad y trayectoria de rotaciones. Filtra por "casos de seguridad" en la pestaña 👩‍⚖️ Jueces & Fiscales.`;
  }
  if (/resumen|ejecutiv|general|nacional/.test(s)) {
    return `<b>Resumen nacional ${n.anio}:</b> ${fmt(n.expedientes_ingresados)} ingresados, ${fmt(n.expedientes_resueltos)} resueltos (tasa ${pct(n.clearance_rate)}) y ${fmt(n.expedientes_pendientes)} pendientes. Congestión ${fmt1(n.congestion)}, demora promedio ${fmt(n.tiempo_promedio_dias)} días, ${fmt(n.jueces)} jueces (${fmt1(n.carga_por_juez)} exp./juez).`;
  }
  return `Puedo responder sobre congestión, demora, seguridad, jueces/fiscales o el resumen nacional. (Versión local sin IA generativa; en producción se conecta a la Claude API vía ai.tunky.net.) Pregunta, por ejemplo: "¿qué corte tiene más congestión?"`;
}

boot();
