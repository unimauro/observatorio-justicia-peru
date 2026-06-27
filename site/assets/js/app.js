/* ============================================================================
   Observatorio Nacional de Justicia del Peru — app.js
   Dashboard estatico: carga JSON de ./data/ y renderiza modulos con ECharts + Leaflet
   ============================================================================ */
"use strict";

const DATA = {};
const FILES = ["nacional", "departamentos", "cortes", "series", "tipos_proceso",
  "embudo", "backlog", "jueces", "fiscales", "casos_seguridad", "indicadores", "manifest"];

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
  ({ resumen: renderResumen, mapa: renderMapa, cortes: renderCortes, procesos: renderProcesos,
     embudo: renderEmbudo, magistrados: renderMagistrados, seguridad: renderSeguridad,
     series: renderSeries, indicadores: renderIndicadores }[id] || (() => {}))();
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
  function popupHtml(d, m) {
    return `<div class="map-pop"><b>${d.departamento}</b><br/>
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
  draw("congestion");
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

/* ============================================================ PROCESOS */
function renderProcesos() {
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

/* ============================================================ SERIES */
function renderSeries() {
  const s = DATA.series, yrs = s.map((x) => x.anio);
  mkChart("chart-demora-serie").setOption({
    ...echartsTheme(), color: ["#d4a437"],
    tooltip: { trigger: "axis" }, grid: { left: 55, right: 20, top: 20, bottom: 30 },
    xAxis: { type: "category", data: yrs }, yAxis: { type: "value", name: "días" },
    series: [{ type: "line", smooth: true, data: s.map((x) => x.demora_dias), areaStyle: { color: "rgba(212,164,55,.12)" }, lineStyle: { width: 3 } }],
  });
  mkChart("chart-pend-serie").setOption({
    ...echartsTheme(), color: ["#e74c3c"],
    tooltip: { trigger: "axis" }, grid: { left: 60, right: 20, top: 20, bottom: 30 },
    xAxis: { type: "category", data: yrs }, yAxis: { type: "value", axisLabel: { formatter: (v) => (v / 1e6).toFixed(1) + "M" } },
    series: [{ type: "bar", data: s.map((x) => x.pendientes) }],
  });
}

/* ============================================================ INDICADORES */
function renderIndicadores() {
  $("#tbl-ind").innerHTML =
    `<thead><tr><th>Indicador</th><th>Fórmula</th><th>Interpretación</th></tr></thead>
     <tbody>${DATA.indicadores.map((i) => `<tr><td><b>${i.indicador}</b></td><td><code>${i.formula}</code></td><td>${i.interpretacion}</td></tr>`).join("")}</tbody>`;
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
function aiAsk(q) {
  q = (q || "").trim(); if (!q) return;
  aiUser(q); $("#ai-input").value = "";
  setTimeout(() => aiBot(aiAnswer(q)), 250);
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
