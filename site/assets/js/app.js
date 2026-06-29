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
  "pj_carga_nacional", "demora_piura", "tc", "mpfn_seguridad"];

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
  window.addEventListener("resize", () => Object.values(charts).forEach((c) => c && c.resize()));
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
    setTimeout(() => Object.values(charts).forEach((c) => c && c.resize()), 60);
  }));
}
function renderPanel(id) {
  if (rendered[id]) { if (id === "mapa" && charts.map) charts.map.invalidateSize(); return; }
  rendered[id] = true;
  ({ resumen: renderResumen, reales: renderReales, mapa: renderMapa, cortes: renderCortes,
     procesos: renderProcesos, embudo: renderEmbudo, magistrados: renderMagistrados,
     seguridad: renderSeguridad, series: renderSeries, indicadores: renderIndicadores,
     faq: renderFaq }[id] || (() => {}))();
}
function mkChart(elId) {
  const c = echarts.init($("#" + elId), null, { renderer: "canvas" });
  charts[elId] = c;
  return c;
}

/* ============================================================ RESUMEN */
function renderResumen() {
  const n = DATA.nacional;
  const cards = [
    ["Expedientes ingresados", fmt(n.expedientes_ingresados), "este año", ""],
    ["Resueltos", fmt(n.expedientes_resueltos), "este año", "ok"],
    ["Pendientes (backlog)", fmt(n.expedientes_pendientes), "acumulados", "alert"],
    ["Tiempo promedio", fmt(n.tiempo_promedio_dias) + " días", "hasta resolución", n.tiempo_promedio_dias > 600 ? "warn" : ""],
    ["Tasa de resolución", pct(n.clearance_rate), n.clearance_rate < 1 ? "acumula carga" : "reduce carga", n.clearance_rate < 1 ? "warn" : "ok"],
    ["Congestión procesal", fmt1(n.congestion), "(pend+ing)/resueltos", n.congestion > 2.5 ? "alert" : "warn"],
    ["Jueces", fmt(n.jueces), `${fmt1(n.carga_por_juez)} expedientes/juez`, ""],
    ["Índice de mora", pct(n.indice_mora), "carga sin resolver", n.indice_mora > 0.5 ? "alert" : "warn"],
  ];
  $("#kpis").innerHTML = cards.map(([l, v, h, cls]) =>
    `<div class="kpi ${cls}"><div class="label">${l}</div><div class="value">${v}</div><div class="hint">${h}</div></div>`).join("");

  const s = DATA.series, yrs = s.map((x) => x.anio);
  mkChart("chart-evol").setOption({
    ...echartsTheme(), color: PALETTE,
    tooltip: { trigger: "axis" }, legend: { top: 0, textStyle: echartsTheme().textStyle },
    grid: { left: 60, right: 20, top: 40, bottom: 30 },
    xAxis: { type: "category", data: yrs },
    yAxis: { type: "value", axisLabel: { formatter: (v) => (v / 1e6).toFixed(1) + "M" } },
    series: [
      { name: "Ingresados", type: "line", smooth: true, data: s.map((x) => x.ingresados), areaStyle: { opacity: .08 } },
      { name: "Resueltos", type: "line", smooth: true, data: s.map((x) => x.resueltos) },
      { name: "Pendientes", type: "line", smooth: true, data: s.map((x) => x.pendientes), areaStyle: { opacity: .08 } },
    ],
  });
  mkChart("chart-clearance").setOption({
    ...echartsTheme(),
    tooltip: { trigger: "axis", valueFormatter: (v) => (v * 100).toFixed(1) + "%" },
    grid: { left: 55, right: 20, top: 30, bottom: 30 },
    xAxis: { type: "category", data: yrs },
    yAxis: { type: "value", axisLabel: { formatter: (v) => (v * 100).toFixed(0) + "%" }, min: 0.5, max: 1.1 },
    series: [{
      type: "line", smooth: true, data: s.map((x) => x.clearance_rate),
      lineStyle: { color: "#2ecc71", width: 3 }, itemStyle: { color: "#2ecc71" },
      markLine: { silent: true, symbol: "none", data: [{ yAxis: 1, lineStyle: { color: "#e74c3c", type: "dashed" }, label: { formatter: "Equilibrio 100%" } }] },
      areaStyle: { color: "rgba(46,204,113,.10)" },
    }],
  });
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
  const map = L.map("map", { scrollWheelZoom: true }).setView([-9.4, -74.5], 5);
  charts.map = map;
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
    } else {
      // fallback: circulos en centroides
      markerLayer.clearLayers().addTo(map);
      const max = Math.max(...deps.map((d) => d[metric]));
      deps.forEach((d) => L.circleMarker([d.lat, d.lng], {
        radius: 8 + (d[metric] / max) * 24, fillColor: color(d[metric]), color: "#fff", weight: 1, fillOpacity: .8,
      }).bindPopup(popupHtml(d, m)).addTo(markerLayer));
    }
  }
  const initMetric = hasRealDelitos ? "delitos_reales" : "congestion";
  if (hasRealDelitos) $("#map-metric").value = "delitos_reales";
  draw(initMetric);
  $("#map-metric").addEventListener("change", (e) => draw(e.target.value));

  const lg = L.control({ position: "bottomright" });
  lg.onAdd = function () {
    const div = L.DomUtil.create("div", "legend");
    div.innerHTML = `<b>Escala</b><br/><i style="background:#1a5c3a"></i> Bajo<br/><i style="background:#f1c40f"></i> Medio<br/><i style="background:#e74c3c"></i> Alto`;
    return div;
  };
  lg.addTo(map);
  setTimeout(() => map.invalidateSize(), 120);
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
function renderEmbudo() {
  const e = DATA.embudo;
  mkChart("chart-funnel").setOption({
    ...echartsTheme(), color: PALETTE,
    tooltip: { trigger: "item", formatter: (p) => `${p.name}<br/>${fmt(p.value)}` },
    series: [{
      type: "funnel", left: 10, right: 10, top: 10, bottom: 10, minSize: "26%",
      label: { color: echartsTheme().textStyle.color, formatter: (p) => `${p.name}: ${fmt(p.value)}` },
      data: e.map((x) => ({ name: x.etapa, value: x.expedientes })),
    }],
  });
  const top = DATA.backlog.slice(0, 15).reverse();
  mkChart("chart-backlog").setOption({
    ...echartsTheme(), color: ["#e74c3c"],
    tooltip: { trigger: "axis", formatter: (p) => `${p[0].name}<br/>Pendientes: ${fmt(p[0].value)}` },
    grid: { left: 220, right: 30, top: 10, bottom: 24 },
    xAxis: { type: "value" },
    yAxis: { type: "category", data: top.map((j) => `${j.juzgado} (${j.departamento})`), axisLabel: { fontSize: 10, width: 200, overflow: "truncate" } },
    series: [{ type: "bar", data: top.map((j) => j.pendientes) }],
  });
  const cols = [["juzgado", "Juzgado"], ["corte", "Corte"], ["departamento", "Depto."], ["especialidad", "Especialidad"], ["pendientes", "Pendientes"], ["demora_dias", "Demora (d)"], ["carga", "Carga"]];
  $("#tbl-backlog").innerHTML =
    `<thead><tr>${cols.map(([k, l]) => `<th class="${["pendientes", "demora_dias", "carga"].includes(k) ? "num" : ""}">${l}</th>`).join("")}</tr></thead>
     <tbody>${DATA.backlog.map((j) => `<tr>${cols.map(([k]) => `<td class="${typeof j[k] === "number" ? "num" : ""}">${typeof j[k] === "number" ? fmt(j[k]) : j[k]}</td>`).join("")}</tr>`).join("")}</tbody>`;
}

/* ============================================================ MAGISTRADOS */
let magState = { rol: "Juez", q: "", esp: "", seg: false };
function renderMagistrados() {
  const esps = [...new Set([...DATA.jueces, ...DATA.fiscales].map((m) => m.especialidad))].sort();
  $("#mag-esp").innerHTML = `<option value="">Todas las especialidades</option>` + esps.map((e) => `<option>${e}</option>`).join("");
  $$("#magistrados .chip[data-rol]").forEach((c) => c.addEventListener("click", () => {
    $$("#magistrados .chip[data-rol]").forEach((x) => x.classList.remove("active"));
    c.classList.add("active"); magState.rol = c.dataset.rol; drawMag();
  }));
  $("#mag-search").addEventListener("input", (e) => { magState.q = e.target.value; drawMag(); });
  $("#mag-esp").addEventListener("change", (e) => { magState.esp = e.target.value; drawMag(); });
  $("#mag-seg").addEventListener("change", (e) => { magState.seg = e.target.checked; drawMag(); });
  drawMag();
}
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
function renderSeguridad() {
  const c = DATA.casos_seguridad;
  const crit = c.filter((x) => x.nivel_alerta === "Critico").length;
  const kpis = [
    ["Casos de alto perfil", fmt(c.length), "monitoreados", ""],
    ["Nivel crítico", fmt(crit), ">1000 días sin resolver", "alert"],
    ["Imputados (total)", fmt(c.reduce((a, x) => a + x.imputados, 0)), "en estos casos", ""],
    ["Días prom. transcurridos", fmt(Math.round(c.reduce((a, x) => a + x.dias_transcurridos, 0) / c.length)), "desde el ingreso", "warn"],
  ];
  $("#seg-kpis").innerHTML = kpis.map(([l, v, h, cls]) => `<div class="kpi ${cls}"><div class="label">${l}</div><div class="value">${v}</div><div class="hint">${h}</div></div>`).join("");

  const byTema = groupCount(c, "tema");
  mkChart("chart-seg-tema").setOption({
    ...echartsTheme(), color: PALETTE,
    tooltip: { trigger: "item" }, grid: { left: 150, right: 24, top: 10, bottom: 20 },
    xAxis: { type: "value" }, yAxis: { type: "category", data: byTema.map((x) => x[0]) },
    series: [{ type: "bar", data: byTema.map((x) => x[1]), itemStyle: { color: "#e74c3c" } }],
  });
  const byEstado = groupCount(c, "estado");
  mkChart("chart-seg-estado").setOption({
    ...echartsTheme(), color: PALETTE,
    tooltip: { trigger: "item", formatter: (p) => `${p.name}: ${p.value} (${p.percent}%)` },
    legend: { type: "scroll", bottom: 0, textStyle: echartsTheme().textStyle },
    series: [{ type: "pie", radius: "62%", center: ["50%", "44%"], data: byEstado.map((x) => ({ name: x[0], value: x[1] })) }],
  });

  const temas = byTema.map((x) => x[0]);
  $("#seg-chips").innerHTML = `<b style="color:var(--muted);font-size:12px;align-self:center">Filtrar tema:</b>` +
    `<span class="chip ${segFilter === "" ? "active" : ""}" data-t="">Todos</span>` +
    temas.map((t) => `<span class="chip ${segFilter === t ? "active" : ""}" data-t="${t}">${t}</span>`).join("");
  $$("#seg-chips .chip").forEach((ch) => ch.addEventListener("click", () => { segFilter = ch.dataset.t; renderSegTable(); $$("#seg-chips .chip").forEach((x) => x.classList.toggle("active", x.dataset.t === segFilter)); }));
  renderSegTable();
}
function renderSegTable() {
  const c = DATA.casos_seguridad.filter((x) => !segFilter || x.tema === segFilter);
  const cols = [["caso", "Caso"], ["tema", "Tema"], ["departamento", "Depto."], ["estado", "Estado"],
    ["juez", "Juez"], ["fiscal", "Fiscal"], ["imputados", "Imput."], ["dias_transcurridos", "Días"], ["nivel_alerta", "Alerta"]];
  $("#tbl-seg").innerHTML =
    `<thead><tr>${cols.map(([k, l]) => `<th class="${["imputados", "dias_transcurridos"].includes(k) ? "num" : ""}">${l}</th>`).join("")}</tr></thead>
     <tbody>${c.map((x) => `<tr>
       <td><b>${x.caso}</b></td><td>${x.tema}</td><td>${x.departamento}</td><td>${x.estado}</td>
       <td>${x.juez}</td><td>${x.fiscal}</td><td class="num">${x.imputados}</td>
       <td class="num">${fmt(x.dias_transcurridos)}</td>
       <td><span class="pill ${x.nivel_alerta === "Critico" ? "red" : x.nivel_alerta === "Riesgo" ? "amber" : "green"}"><span class="dot" style="background:currentColor"></span>${x.nivel_alerta}</span></td></tr>`).join("")}</tbody>`;
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
  const box = $("#reales-content");
  const manifest = REAL.manifest;
  const fis = REAL.mpfn_fiscales, casos = REAL.mpfn_casos, delitos = REAL.mpfn_delitos,
    pj = REAL.pj_carga_nacional, demora = REAL.demora_piura, tc = REAL.tc, seg = REAL.mpfn_seguridad;

  if (!manifest && !fis && !casos && !delitos && !pj && !demora && !tc && !seg) {
    box.innerHTML = `<div class="card" style="text-align:center">
      <h3>🛠️ Datos reales en preparación</h3>
      <p class="card-sub" style="max-width:640px;margin:8px auto">El pipeline ETL (Track A) está descargando y normalizando las fuentes oficiales
      inventariadas en la <a href="https://github.com/unimauro/observatorio-justicia-peru/blob/main/data/INVENTARIO.md" target="_blank" rel="noopener">Fase 0</a>
      (Poder Judicial, Ministerio Público, INEI). Cuando termine, esta pestaña mostrará indicadores
      construidos con datos reales, cada uno con su fuente y fecha de corte. El resto del tablero es un
      prototipo con datos sintéticos, claramente señalizado.</p></div>`;
    return;
  }

  let html = "";
  // --- Fuentes (manifest) ---
  if (manifest && manifest.datasets) {
    html += `<div class="card"><h3>📚 Fuentes integradas</h3><div class="table-wrap"><table>
      <thead><tr><th>Dataset</th><th>Institución</th><th>Cobertura</th><th>Granularidad</th><th>Fecha corte</th><th class="num">Registros</th></tr></thead>
      <tbody>${manifest.datasets.map((d) => `<tr>
        <td><b>${d.titulo || d.id}</b></td><td>${d.institucion || d.fuente || "—"}</td><td>${d.cobertura || "—"}</td>
        <td><span class="pill ${d.granularidad === "expediente" ? "blue" : "amber"}">${d.granularidad || "—"}</span></td>
        <td>${d.fecha_corte || "—"}</td><td class="num">${d.n_registros == null ? (d.error ? "❌" : "—") : fmt(d.n_registros)}</td></tr>`).join("")}</tbody></table></div></div>`;
  }

  // --- KPIs reales ---
  const kpis = [];
  if (pj && pj.nacional) kpis.push(["Tasa de resolución (PJ nacional)", pj.nacional.clearance != null ? pj.nacional.clearance + "% ⚠️" : "—", "provisional · ver nota metodológica", "warn"]);
  if (pj && pj.nacional) kpis.push(["Ingresos PJ (2024)", fmt(pj.nacional.ingresos), "expedientes · dato real", ""]);
  if (pj && pj.nacional) kpis.push(["Resueltos PJ (2024)", fmt(pj.nacional.resueltos), "expedientes · dato real", "ok"]);
  if (fis) kpis.push(["Fiscales (MPFN)", fmt(fis.total_fiscales), "dotación · dato real", ""]);
  if (delitos) kpis.push(["Delitos denunciados (MPFN)", fmt(delitos.total_denuncias), "acumulado · dato real", "alert"]);
  if (demora && demora.por_proceso && demora.por_proceso.length) {
    const nlpt = demora.por_proceso.find((p) => /nlpt|laboral/i.test(p.proceso)) || demora.por_proceso[0];
    kpis.push([`Demora mediana (${nlpt.proceso})`, fmt(nlpt.mediana_dias) + " días", "microdata real (Piura)", nlpt.mediana_dias > 365 ? "warn" : "ok"]);
  }
  if (tc && tc.demora && tc.demora.global) kpis.push(["Demora TC (mediana)", fmt(tc.demora.global.mediana_dias) + " días", "Tribunal Constitucional · microdata", tc.demora.global.mediana_dias > 365 ? "warn" : "ok"]);
  if (seg && seg.violencia_mujer && seg.violencia_mujer.total != null) kpis.push(["Casos violencia contra la mujer", fmt(seg.violencia_mujer.total), "MPFN · ingresados", "alert"]);
  if (seg && seg.ciberdelitos && seg.ciberdelitos.total != null) kpis.push(["Ciberdelitos denunciados", fmt(seg.ciberdelitos.total), "MPFN", "alert"]);
  if (kpis.length) html += `<div class="kpi-grid">${kpis.map(([l, v, h, c]) => `<div class="kpi ${c}"><div class="label">🟢 ${l}</div><div class="value">${v}</div><div class="hint">${h}</div></div>`).join("")}</div>`;

  // --- aviso de cobertura temporal (honestidad: distintos años por fuente) ---
  html += `<div class="disclaimer">📅 <b>Cobertura temporal por fuente:</b> MPFN —delitos, casos fiscales y fiscales— cubre <b>2019–2026</b> (2026 parcial). La <b>carga del Poder Judicial solo está disponible para 2024</b> en datos abiertos (es el único año publicado); los años <b>2021–2023 y 2025–2026 no existen en el portal abierto</b> y requieren el <a href="https://portalestadistico.pj.gob.pe/" target="_blank" rel="noopener">Portal Estadístico del PJ</a> (descarga manual, sin API). La demora real (microdata Piura) varía por proceso (NLPT desde ~2021). No completamos años faltantes con estimaciones: si no hay dato, se indica.</div>`;

  // contenedores de charts
  const charts2 = [];
  if (pj && pj.por_especialidad) { html += card("Carga procesal por especialidad (PJ nacional)", "rc-pj", pj._meta); charts2.push(["rc-pj", () => barIngRes("rc-pj", pj.por_especialidad, "especialidad")]); }
  if (delitos && delitos.por_departamento) { html += card("Delitos denunciados por departamento (MPFN)", "rc-del", delitos._meta); charts2.push(["rc-del", () => barSimple("rc-del", delitos.por_departamento.slice(0, 15), "departamento", "cantidad", "#e74c3c")]); }
  if (delitos && delitos.top_delitos) { html += card("Top delitos denunciados (MPFN)", "rc-deltop", delitos._meta); charts2.push(["rc-deltop", () => barSimple("rc-deltop", delitos.top_delitos.slice(0, 12), "generico", "cantidad", "#9b59b6")]); }
  if (fis && fis.por_cargo) { html += card("Fiscales por cargo (MPFN)", "rc-fis", fis._meta); charts2.push(["rc-fis", () => barSimple("rc-fis", fis.por_cargo, "cargo", "total", "#4f8cff")]); }
  if (demora && demora.por_proceso) { html += card("Demora real por proceso — mediana vs P90 (microdata Piura)", "rc-dem", demora._meta); charts2.push(["rc-dem", () => demoraChart("rc-dem", demora.por_proceso)]); }
  if (casos && casos.por_materia) { html += card("Casos fiscales por materia — ingresado vs atendido (MPFN)", "rc-cas", casos._meta); charts2.push(["rc-cas", () => barIngRes2("rc-cas", casos.por_materia, "materia", "ingresado", "atendido")]); }
  // --- tendencias por año + demografía + histograma ---
  if (delitos && delitos.por_anio) { html += card("Delitos denunciados por año (MPFN) — 2026 parcial", "rc-delanio", delitos._meta); charts2.push(["rc-delanio", () => lineSimple("rc-delanio", delitos.por_anio, "anio", "cantidad", "#e74c3c")]); }
  if (casos && casos.por_anio) { html += card("Casos fiscales por año — ingresado vs atendido (MPFN)", "rc-casanio", casos._meta); charts2.push(["rc-casanio", () => lineIngAt("rc-casanio", casos.por_anio)]); }
  if (fis && fis.por_condicion) { html += card("Fiscales por condición (MPFN)", "rc-fiscond", fis._meta); charts2.push(["rc-fiscond", () => donut("rc-fiscond", fis.por_condicion, "condicion", "total")]); }
  if (fis && fis.por_sexo) { html += card("Fiscales por sexo (MPFN)", "rc-fissexo", fis._meta); charts2.push(["rc-fissexo", () => donut("rc-fissexo", fis.por_sexo, "sexo", "total")]); }
  if (demora && demora.histograma) { html += card("Distribución de demora (días) por proceso — microdata Piura", "rc-demhist", demora._meta); charts2.push(["rc-demhist", () => histChart("rc-demhist", demora.histograma)]); }

  // --- Tribunal Constitucional (serie larga real + demora) ---
  if (tc && tc.por_anio) { html += card("Tribunal Constitucional — expedientes ingresados por año (1992–2026)", "rc-tcanio", tc._meta); charts2.push(["rc-tcanio", () => lineSimple("rc-tcanio", tc.por_anio, "anio", "ingresados", "#9b59b6")]); }
  if (tc && tc.demora && tc.demora.por_tipo) { html += card("TC — demora real por tipo de proceso (mediana vs P90)", "rc-tcdem", tc._meta); charts2.push(["rc-tcdem", () => demoraChart("rc-tcdem", tc.demora.por_tipo.map((r) => ({ proceso: r.tipo, mediana_dias: r.mediana_dias, p90_dias: r.p90_dias })))]); }

  // --- Seguridad (datos reales MPFN) ---
  if (seg && seg.violencia_mujer && seg.violencia_mujer.por_anio) { html += card("🚨 Violencia contra la mujer — casos fiscales por año (MPFN)", "rc-vcm", seg.violencia_mujer._meta); charts2.push(["rc-vcm", () => lineIngAt("rc-vcm", seg.violencia_mujer.por_anio)]); }
  if (seg && seg.ciberdelitos && seg.ciberdelitos.top_tipos) { html += card("🚨 Top tipos de ciberdelito denunciados (MPFN)", "rc-cibertipo", seg.ciberdelitos._meta); charts2.push(["rc-cibertipo", () => barSimple("rc-cibertipo", seg.ciberdelitos.top_tipos.slice(0, 12), "tipo", "cantidad", "#00cec9")]); }
  if (seg && seg.flagrancia && seg.flagrancia.por_distrito_fiscal) { html += card("🚨 Flagrancia delictiva por distrito fiscal (MPFN, 2025–2026)", "rc-flag", seg.flagrancia._meta); charts2.push(["rc-flag", () => barSimple("rc-flag", seg.flagrancia.por_distrito_fiscal.slice(0, 15), "distrito_fiscal", "total", "#f39c12")]); }
  if (seg && seg.trata && seg.trata.por_distrito_fiscal) { html += card("🚨 Trata de personas por distrito fiscal (MPFN)", "rc-trata", seg.trata._meta); charts2.push(["rc-trata", () => barSimple("rc-trata", seg.trata.por_distrito_fiscal.slice(0, 15), "distrito_fiscal", "total", "#e84393")]); }

  // --- tablas reales ---
  if (pj && pj.por_distrito_judicial) {
    const rows = [...pj.por_distrito_judicial].sort((a, b) => b.congestion - a.congestion);
    html += `<div class="card"><h3>🟢 PJ — carga por distrito judicial (2024)</h3>
      <div class="table-wrap" style="max-height:420px"><table><thead><tr><th>Distrito judicial</th><th class="num">Ingresos</th><th class="num">Resueltos</th><th class="num">Pendientes</th><th class="num">Congestión</th></tr></thead>
      <tbody>${rows.map((r) => `<tr><td>${r.distrito_judicial}</td><td class="num">${fmt(r.ingresos)}</td><td class="num">${fmt(r.resueltos)}</td><td class="num">${fmt(r.pendientes)}</td><td class="num">${fmt1(r.congestion)}</td></tr>`).join("")}</tbody></table></div>
      ${metaFoot(pj._meta)}</div>`;
  }
  if (casos && casos.por_distrito_fiscal) {
    const rows = [...casos.por_distrito_fiscal].sort((a, b) => a.clearance - b.clearance);
    html += `<div class="card"><h3>🟢 MPFN — casos fiscales por distrito (menor clearance primero)</h3>
      <div class="table-wrap" style="max-height:420px"><table><thead><tr><th>Distrito fiscal</th><th class="num">Ingresado</th><th class="num">Atendido</th><th class="num">Clearance %</th></tr></thead>
      <tbody>${rows.map((r) => `<tr><td>${r.distrito_fiscal}</td><td class="num">${fmt(r.ingresado)}</td><td class="num">${fmt(r.atendido)}</td><td class="num">${fmt1(r.clearance)}</td></tr>`).join("")}</tbody></table></div>
      ${metaFoot(casos._meta)}</div>`;
  }

  box.innerHTML = html;
  charts2.forEach(([id, fn]) => { try { fn(); } catch (e) { console.warn("chart", id, e); } });

  function card(title, id, meta) {
    return `<div class="card"><h3>🟢 ${title}</h3><div class="chart" id="${id}"></div>${metaFoot(meta)}</div>`;
  }
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

/* ============================================================ FAQ */
const FAQ = [
  ["¿Los datos de este tablero son reales?",
   "Depende de la pestaña. La pestaña <b>🟢 Datos Reales</b> usa datos abiertos oficiales (Poder Judicial, Ministerio Público, INEI) con su fuente y fecha de corte. El resto del tablero (Resumen, Mapa, Cortes, Jueces & Fiscales, etc.) es un <b>prototipo con datos SINTÉTICOS</b> —simulados pero calibrados con órdenes de magnitud reales— para validar la interfaz mientras se integran todas las fuentes. Siempre verás la insignia 🧪 cuando el dato es sintético."],
  ["¿Por qué usan datos sintéticos al inicio?",
   "Porque no existe una API nacional única con 'expedientes estancados por juzgado y días de demora'. Las fuentes reales son heterogéneas (CSV, PDF, tableros que bloquean scraping). El prototipo sintético permitió diseñar y probar el tablero; ahora el ETL va reemplazando esos datos por oficiales, pestaña por pestaña."],
  ["¿Por qué no muestran la 'demora en días' en todo el país?",
   "Porque la demora literal (fecha de ingreso → fecha de resolución) solo es calculable donde hay <b>microdata por expediente</b>: hoy, ciertos procesos de la Corte Superior de Piura (NLPT laboral, alimentos, penal) y el Tribunal Constitucional. Para el resto, derivar 'días' desde cifras agregadas sería inventar; ahí mostramos índices de <b>congestión</b> y <b>tasa de resolución</b>."],
  ["¿Qué indicadores usan y cómo se calculan?",
   "Tasa de resolución (clearance) = resueltos/ingresos·100; Congestión = (pendientes+ingresos)/resueltos; Tasa de pendencia = pendientes_fin/carga·100; Demora real = fecha_resolución − fecha_ingreso (mediana y P90). Ver la pestaña 📐 <b>Indicadores</b> para el glosario completo, basado en metodología CEPEJ y Banco Mundial."],
  ["¿De dónde salen los datos reales?",
   "De <a href='https://www.datosabiertos.gob.pe' target='_blank' rel='noopener'>datosabiertos.gob.pe</a> (API CKAN del Estado), más descargas oficiales del Portal Estadístico del PJ, INEI y CNPJ. El inventario completo y verificado está en <a href='https://github.com/unimauro/observatorio-justicia-peru/blob/main/data/INVENTARIO.md' target='_blank' rel='noopener'>data/INVENTARIO.md</a>."],
  ["¿Rastrean jueces y fiscales con nombre propio? ¿Y su privacidad?",
   "Mostramos <b>dotación y carga agregada</b> de fiscales (por cargo, condición, distrito) con datos oficiales del MPFN. Las 'rotaciones' individuales del prototipo son <b>ilustrativas</b>: no existe un dataset abierto oficial de rotaciones. Además, los microdata por expediente se <b>anonimizan</b> (se eliminan DNI y fecha de nacimiento) antes de procesar; nunca exponemos datos personales."],
  ["¿El asistente IA es real?",
   "El copiloto responde localmente sobre los datos cargados. Para respuestas con IA generativa se conecta a un endpoint configurable del ecosistema <b>tunky.net</b>; como el sitio es estático (GitHub Pages), la clave de IA nunca vive en el navegador, sino en ese servicio."],
  ["¿Puedo usar o auditar estos datos?",
   "Sí. El proyecto es de código abierto (licencia MIT) y los datasets sintéticos y reales están versionados en el <a href='https://github.com/unimauro/observatorio-justicia-peru' target='_blank' rel='noopener'>repositorio</a>. Es un proyecto de transparencia para ciudadanía, periodismo de datos, investigación y políticas públicas."],
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
function aiBot(t) { $("#ai-msgs").insertAdjacentHTML("beforeend", `<div class="msg bot">${t}</div>`); $("#ai-msgs").scrollTop = 1e9; }
function aiUser(t) { $("#ai-msgs").insertAdjacentHTML("beforeend", `<div class="msg user">${t}</div>`); $("#ai-msgs").scrollTop = 1e9; }

/* Endpoint del copiloto (ecosistema tunky.net). Debe ser un proxy serverless que reciba
   {question, context} y use la Claude API server-side (la API key NUNCA va en el cliente).
   Si el endpoint no responde, se usa el motor local de respuestas. Configurable por ?ai= o window.AI_ENDPOINT. */
const AI_ENDPOINT = new URLSearchParams(location.search).get("ai") || window.AI_ENDPOINT || "https://ai.tunky.net/v1/justicia/chat";
function aiContext() {
  const n = DATA.nacional;
  return {
    nacional: n,
    top_cortes_congestion: DATA.cortes.slice(0, 5).map((c) => ({ corte: c.corte, congestion: c.congestion, pendientes: c.pendientes })),
    casos_seguridad_criticos: DATA.casos_seguridad.filter((x) => x.nivel_alerta === "Critico").length,
    nota: "Datos sintéticos del prototipo salvo la pestaña Datos Reales.",
  };
}
async function aiAsk(q) {
  q = (q || "").trim(); if (!q) return;
  aiUser(q); $("#ai-input").value = "";
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
  aiBot(answer || aiAnswer(q));
}
/* Motor local de respuestas (sin backend). En producción: conectar a un endpoint
   tipo ai.tunky.net que reciba la pregunta + el contexto JSON y use Claude API. */
function aiAnswer(q) {
  const s = q.toLowerCase(), n = DATA.nacional;
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
