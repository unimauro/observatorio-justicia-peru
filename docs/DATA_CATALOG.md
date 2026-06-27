# DATA_CATALOG.md — Fuentes de datos abiertos del Sistema de Justicia del Perú

> Catálogo de fuentes **reales y verificadas** (no inventadas) de datos públicos sobre el sistema de
> justicia peruano: Poder Judicial, Ministerio Público, JNJ, INPE, INEI, MINJUSDH, criminalidad y
> geometrías para mapas coropléticos.
>
> **Última verificación:** 2026-06-26 (cada URL marcada ✅ fue resuelta con fetch HTTP 200).
> Estado: leyenda al pie. Las fuentes con caveat de verificación están señaladas explícitamente.

---

## 0. Resumen ejecutivo — qué usar para empezar un ETL

| Prioridad | Fuente | Institución | Acceso | Por qué |
|----------|--------|-------------|--------|---------|
| ⭐ 1 | **Portal Nacional de Datos Abiertos (CKAN)** | PCM (datasets de MPFN, MINJUSDH, PJ, TC) | CSV/XLSX directo + API CKAN | Único origen con descarga directa y URLs de archivo estables |
| ⭐ 2 | **INEI Microdatos — ENAPRES** | INEI | Descarga directa SPSS/CSV/DTA/DBF | Microdato crudo de victimización, reproducible |
| ⭐ 3 | **DATACRIM** | INEI / CEIC | Portal consulta + export Excel | La vista más completa e integrada (4 subsistemas) |
| 4 | **INPE / SIEP** | INPE | PDF con URL predecible (mensual) | Única serie penitenciaria oficial actualizada |
| 5 | **GeoJSON `juaneladio/peru-geojson`** | GitHub | raw URL directa | Mapa coroplético listo para Leaflet/D3 |
| 6 | **Portal Estadístico PJ** | Poder Judicial | Descarga con CAPTCHA + dashboards | Carga procesal nacional agregada |

**Caveats transversales importantes:**
- El portal de datos abiertos **requiere `www.`**: usar siempre `https://www.datosabiertos.gob.pe` (sin `www` falla en DNS).
- Muchas páginas `*.gob.pe` devuelven **HTTP 418** (anti-bot) a fetchers automatizados: existen y abren en navegador, pero el ETL necesitará navegador headless o headers de browser.
- `microdatos.inei.gob.pe` **NO existe**; la URL real es `proyectos.inei.gob.pe/microdatos`.
- No existe dataset abierto de **"rotaciones de jueces"** ni de **JNJ**; lo más cercano son resoluciones administrativas en PDF.

---

## 1. PODER JUDICIAL DEL PERÚ

### 1.1 Portal Estadístico del Poder Judicial ✅ (sustituye al Boletín Estadístico)
- **Institución:** Poder Judicial — Subgerencia de Estadística (Gerencia General).
- **URL:** https://portalestadistico.pj.gob.pe/
- **Sub-recursos verificados:**
  - Carga Procesal (dashboard): https://portalestadistico.pj.gob.pe/publicacion/carga-procesal/
  - Boletín Estadístico Institucional: https://portalestadistico.pj.gob.pe/publicaciones/boletin-estadistico-institucional/
  - Publicaciones permanentes: https://portalestadistico.pj.gob.pe/publicaciones-permanentes/
- **Datos:** carga procesal, expedientes ingresados/resueltos/pendientes por etapa (trámite/ejecución), tipo de órgano, especialidad/materia y Distrito Judicial. Fuente: SIJ. Serie **2012–2025**.
- **Formato:** dashboards interactivos + archivos descargables (Excel/PDF) + boletines PDF.
- **Periodicidad:** carga procesal **mensual**; Boletín Institucional **trimestral**.
- **Acceso:** 🟡 medio. Hay descarga **pero protegida por CAPTCHA**; sin API documentada. Útil para ETL semi-manual, no para automatización limpia.

### 1.2 Datasets del Poder Judicial en el Portal Nacional de Datos Abiertos ✅ (MEJOR para ETL del PJ)
- **Institución:** Poder Judicial (publican Cortes Superiores y oficinas nacionales) vía CKAN nacional.
- **Datasets reales verificados:**
  - Procesos Judiciales Principales a Nivel Nacional (desde 2023): `/dataset/procesos-judiciales-principales-nivel-nacional-partir-del-2023-poder-judicial`
  - Procesos Ingresados/Resueltos — Módulos Penales de Violencia contra las Mujeres: `/dataset/procesos-ingresados-y-resueltos-de-los-modulos-penales-de-violencia-contra-las-mujeres-e-0`
  - Corte Superior de Piura — Penas Privativas **Efectivas**: `/dataset/situación-jurídica-de-procesos-penales-con-penas-privativas-de-libertad-efectivas`
  - Corte Superior de Piura — Penas Privativas **Suspendidas**: `/dataset/situación-jurídica-de-procesos-penales-con-penas-privativas-de-libertad-suspendidas`
  - Grupo Corte Superior de Justicia de Piura: https://www.datosabiertos.gob.pe/group/corte-superior-de-justicia-piura
- **Formato:** CSV, XLSX, DOCX + diccionario de datos. Descarga directa (`/sites/default/files/...`) + **API CKAN** (`/api/3/action/package_show?id=<uuid>`).
- **Periodicidad:** variable por dataset (varios mensuales).
- **Acceso:** ✅ ALTA. Descarga directa + API CKAN. **La opción más práctica del PJ.**
- **Caveat:** datos **fragmentados por Corte Superior** (Piura es el más completo); no hay dataset nacional unificado de carga procesal aquí. Cobertura desigual entre cortes.

### 1.3 CEJ — Consulta de Expedientes Judiciales ✅
- **URL:** https://cej.pj.gob.pe/cej/forms/busquedaform.html (raíz: https://cej.pj.gob.pe/cej/)
- **Datos:** estado de expedientes (órgano, juez, especialista, movimientos, texto de resoluciones). 28 distritos judiciales, años 1980–2026.
- **Formato:** portal web de **consulta individual** (HTML).
- **Acceso:** 🔴 BAJA para ETL. Solo caso por caso, con **CAPTCHA**, sin API ni descarga masiva; especialidad **Penal restringida**. Solo viable vía scraping frágil.
- **Relacionado:** "El Juez te Escucha" (no "El Juez te Atiende") — citas con magistrados: https://cej.pj.gob.pe/citas/ · ficha gob.pe https://www.gob.pe/13609 · SERJUS https://serjus.pj.gob.pe/

### 1.4 Registro Nacional de Condenas ✅ (NO es dato abierto)
- **URL:** https://www.pj.gob.pe/wps/wcm/connect/cortesuprema/s_cortes_suprema_home/as_servicios/as_enlaces_de_interes/as_registro_nacional_condenas
- **Datos:** sentencias condenatorias firmes; base del Certificado de Antecedentes Penales (trámite pagado).
- **Acceso:** 🔴 trámite individual por persona. Sin descargas ni API. No utilizable para pipeline.

### 1.5 Tribunal Constitucional (vía Datos Abiertos) ✅ — bonus útil
- Expedientes **ingresados** al TC (1992–2026): `/dataset/expedientes-ingresados-al-tribunal-constitucional-desde-1992-2026-tribunal-constitucional-tc` — CSV/XLSX.
- Expedientes **publicados** por el TC (1992–2026): `/dataset/expedientes-publicados-por-el-tribunal-constitucional-desde-1992-2026-tribunal` — XLSX.
- **Acceso:** ✅ ALTA. Serie histórica larga, descarga directa.

---

## 2. MINISTERIO PÚBLICO / FISCALÍA DE LA NACIÓN

### 2.1 Datasets MPFN en Datos Abiertos ✅ (MEJOR para ETL del MP)
- **[MPFN] Fiscales** — `/dataset/mpfn-fiscales` — CSV/XLSX/DOCX. **N.º de fiscales por distrito fiscal, ubicación, cargo, condición, género.** CSV anuales **2019–2026**, periodicidad mensual (últ. act. 2026-02-20). Contacto: estadistica@mpfn.gob.pe. **El más útil para un "observatorio de magistrados" con descarga directa.**
- **[MPFN] Casos Fiscales en Violencia Contra la Mujer** — `/dataset/mpfn-casos-fiscales-en-violencia-contra-la-mujer` — CSV/XLSX/DOCX.
- **[MPFN] Delitos de Ciberdelincuencia Denunciados** — `/dataset/mpfn-delitos-de-ciberdelincuencia-denunciados-en-el-ministerio-público` — CSV/XLSX/DOCX.
- **[MPFN] Casos Fiscales de Flagrancia Delictiva** — `/dataset/mpfn-casos-fiscales-de-flagrancia-delictiva` — CSV/XLSX/DOCX.
- **Acceso:** ✅ ALTA. Descarga directa CSV + API CKAN.

### 2.2 Observatorio de Criminalidad del Ministerio Público ⚠️ (existe, contenido no verificable por fetch)
- **URL portal:** https://www.mpfn.gob.pe/observatorio/ (también https://www.fiscalia.gob.pe/observatorio/)
- **Ficha gob.pe:** https://www.gob.pe/es/11416-ministerio-publico-fiscalia-de-la-nacion-observatorio-de-criminalidad
- **Colección de publicaciones:** https://www.gob.pe/institucion/mpfn/colecciones/34370-publicaciones-observatorio-criminalidad-del-ministerio-publico
- **Datos:** delitos, violencia familiar, feminicidio/tentativa, muertes violentas dolosas, trata. Integra RENADESPPLE, Instituto de Medicina Legal y SIATF.
- **Formato:** PDF (boletines, compendios) + dashboards/mapas. Sin API ni CSV estructurado verificable.
- **Acceso:** 🔴 BAJA. Probable scraping de PDFs. ⚠️ `mpfn.gob.pe` dio error de certificado SSL y la ficha gob.pe HTTP 418: la URL es correcta, pero **no se pudo renderizar el contenido vía fetch** — validar en navegador.
- **Nota:** para carga fiscal consolidada conviene usar **DATACRIM** (§4.1), que ya integra el subsistema fiscal.

---

## 3. JUNTA NACIONAL DE JUSTICIA (JNJ)

> La JNJ **no publica datasets descargables** (no aparece en datosabiertos.gob.pe). Sus datos viven en aplicativos web de su extranet. Solo scraping.

### 3.1 Boletín Oficial de la Magistratura (BOM) ✅
- **URL:** https://extranet.jnj.gob.pe/public/boletinV2/index
- **Datos:** resoluciones en 6 secciones (Reglamentos, Resoluciones, Comunicados, Edictos, Convocatorias, Otras). Aquí salen **nombramientos, ratificaciones, no ratificaciones, destituciones y sanciones**.
- **Formato:** portal web con filtros (Sección/Fecha); documentos = resoluciones PDF. Sin export CSV.
- **Periodicidad:** continua. **Acceso:** 🔴 scraping de listado + descarga de PDFs.

### 3.2 Consulta pública de la carrera de jueces/fiscales ✅ (con caveat de ruta)
- **Ficha gob.pe:** https://www.gob.pe/14814-conocer-la-carrera-de-los-jueces-juezas-o-fiscales
- **Aplicativo:** https://extranet.jnj.gob.pe/public/150/rjf/consulta/magistrado/
- **Datos:** por magistrado — trayectoria de nombramientos, ratificaciones, no ratificaciones, destituciones, por instancia y especialidad.
- **Formato:** consulta web individual (DNI/nombre). Sin descarga masiva ni API.
- **Acceso:** 🔴 solo scraping registro por registro. ⚠️ la ruta exacta del RJF puede variar (referencias a `/108/` y `/150/`); confirmar la vigente.

### 3.3 Rotaciones de jueces/fiscales — ❌ NO existe como dataset abierto
- Las rotaciones son función del **Poder Judicial (Consejo Ejecutivo)** y del **Ministerio Público**, no de la JNJ, y se publican como resoluciones administrativas en PDF. **No afirmar que existe un dataset.**

---

## 4. INEI (Instituto Nacional de Estadística e Informática)

### 4.1 DATACRIM — Sistema Integrado de Estadísticas de la Criminalidad y Seguridad Ciudadana ⭐ ✅
- **Institución:** INEI / Comité Estadístico Interinstitucional de la Criminalidad (CEIC).
- **URL:** https://datacrim.inei.gob.pe/ · mapa: https://datacrim.inei.gob.pe/panel/mapa
- **Datos:** integra los **4 subsistemas (policial, fiscal, judicial, penitenciario)**; homicidios, victimización (hogares y empresas), penales y centros juveniles, accidentes de tránsito, violencia contra mujer/niños. Enriquecido con censos, ENAPRES y ENARES.
- **Formato:** mapas/dashboards + **"Exportar a Excel"** + manual PDF. Sin API REST confirmada.
- **Nivel:** departamental, provincial y **distrital** (ideal para coroplético).
- **Periodicidad:** continua/anual.
- **Acceso:** ⭐ media-alta. **La fuente oficial más rica y georreferenciada.** Consulta interactiva con registro para vistas avanzadas; export a Excel.

### 4.2 INEI Microdatos — ENAPRES (victimización) ⭐ ✅
- **URL real:** https://proyectos.inei.gob.pe/microdatos/ (también `https://iinei.inei.gob.pe/microdatos/`; servicio gob.pe: https://www.gob.pe/14307-consultar-bases-de-datos-del-inei)
- ⚠️ **`microdatos.inei.gob.pe` NO resuelve** — no es la URL real.
- **Datos:** microdatos completos de **ENAPRES** (módulo seguridad ciudadana / victimización, cap. 600), 2010–2019+; también ENAHO, ENARES, censos.
- **Formato:** descarga de bases en **SPSS (.sav), CSV, STATA (.dta), DBF** + ficha técnica PDF.
- **Periodicidad:** anual. **Acceso:** ✅ ALTA — descarga directa sin login. Existe wrapper Python no oficial `inei-microdatos` (PyPI).

### 4.3 Censo Nacional Penitenciario 2016 ✅
- **Publicación:** https://www.inei.gob.pe/media/MenuRecursivo/publicaciones_digitales/Est/Lib1364/index.html · PDF: `.../Lib1364/libro.pdf`
- **Ficha técnica microdato (proyecto 512):** https://proyectos.inei.gob.pe/iinei/srienaho/Descarga/FichaTecnica/512-Ficha.pdf
- **Datos:** 76,180 internos, 66 establecimientos; perfil sociodemográfico, delito, drogas, antecedentes.
- **Formato:** PDF + microdato (SPSS/CSV/DBF) en portal de microdatos (proyecto 512).
- **Periodicidad:** censo único 2016. **Acceso:** ✅ descarga directa, pero dato puntual/antiguo.

### 4.4 INEI — Boletines/Anuarios de Seguridad Ciudadana y Criminalidad ✅
- Boletín técnico: https://m.inei.gob.pe/biblioteca-virtual/boletines/estadisticas-de-seguridad-ciudadana/1/
- Anuario Estadístico de la Criminalidad (PDF): https://www.inei.gob.pe/media/MenuRecursivo/publicaciones_digitales/Est/Lib1534/libro.pdf
- Informe "Evolución de la tasa de homicidios e indicadores 2022–2025" (CEIC): https://www.gob.pe/institucion/inei/informes-publicaciones/7648859-evolucion-de-la-tasa-de-homicidios-e-indicadores-de-seguridad-ciudadana-2022-2025
- **Formato:** PDF (semestral/anual). **Acceso:** 🟡 solo PDF.

### 4.5 ENAPRES en Datos Abiertos ✅
- **URL:** https://www.datosabiertos.gob.pe/dataset/encuesta-nacional-de-programas-estrat%C3%A9gicos
- **Datos:** victimización, percepción de inseguridad, confianza en instituciones; 2010–2017, 24 deptos + Callao.
- **Formato:** Excel (.xlsx) descargable + API CKAN del catálogo. **Acceso:** 🟡 media-alta.

---

## 5. INPE (Instituto Nacional Penitenciario)

### 5.1 SIEP — Informe Estadístico Penitenciario ⭐ ✅
- **Listado:** https://siep.inpe.gob.pe/form/informeestadistico · módulo institucional: https://www.inpe.gob.pe/estad%C3%ADstica1.html
- **PDFs con URL predecible (verificados):**
  - `https://siep.inpe.gob.pe/Archivos/2026/Informes estadisticos/informe_estadistico_enero_2026.pdf`
  - `https://siep.inpe.gob.pe/Archivos/2025/Informes estadisticos/informe_estadistico_setiembre_2025.pdf`
- **Datos:** población intramuros/extramuros, hacinamiento, capacidad, por establecimiento, sexo, situación jurídica, delito. (ene-2026 ≈ 212,089 personas.)
- **Formato:** **solo PDF** (requiere parsing de tablas).
- **Periodicidad:** **mensual**, 2010–2026.
- **Acceso:** 🟡 media. URL **predecible** (`/Archivos/{año}/Informes estadisticos/informe_estadistico_{mes}_{año}.pdf`) → descarga masiva automatizable; parsing necesario. **Fuente penitenciaria oficial más actualizada.**
- **Nota:** búsquedas `INPE`/`penitenciario` en datosabiertos.gob.pe dan **0 resultados** — INPE no publica en el portal nacional.

---

## 6. MINJUSDH (Ministerio de Justicia y Derechos Humanos)

> Sí publica datasets abiertos reales con descarga directa CSV/XLSX en datosabiertos.gob.pe.

| Dataset | Slug (`/dataset/...`) | Formatos |
|---------|-----------------------|----------|
| **Patrocinios — Defensa Penal (DGDPAJ)** | `patrocinios-asumidos-por-la-defensa-penal-de-la-dirección-general-de-defensa-pública-y` | CSV, XLSX, DOCX |
| Patrocinios — Defensa de Víctimas | `patrocinios-asumidos-por-el-servicio-de-defensa-de-víctimas-de-la-dirección-general-de` | CSV, XLSX, DOCX |
| Patrocinios — Asistencia Legal | `patrocinios-asumidos-por-el-servicio-de-asistencia-legal-de-la-dirección-general-de-defensa` | CSV, XLSX, DOCX |
| **Registro Nacional de Abogados Sancionados (RNAS, desde 2022)** | `registro-nacional-de-abogados-sancionados-desde-2022-ministerio-de-justicia-y-derechos` | CSV, XLSX, DOCX |
| SECIGRA Derecho (desde 2023) | `servicio-civil-de-graduandos-secigra-derecho-desde-el-2023-ministerio-de-justicia-y-derechos` | CSV, XLSX, DOCX |
| Normas legales sistematizadas SPIJ | `sistematización-de-normas-legales-en-el-sistema-peruano-de-información-jurídica-spij-desde` | CSV, XLSX, DOCX |
| Jurisprudencia sistematizada SPIJ | `sistematización-de-jurisprudencia-en-el-sistema-peruano-de-información-jurídica-spij-desde` | CSV, XLSX, DOCX |

**Dataset insignia (Defensa Penal) — detalle verificado:**
- DGDPAJ, casos de defensa penal pública por género, edad, distrito, fecha (mes/año), discapacidad, delito imputado.
- CSV directo: https://www.datosabiertos.gob.pe/sites/default/files/DEFENSA_PENAL_DATASET01_3.csv
- Diccionario: https://www.datosabiertos.gob.pe/sites/default/files/Formato_DiccionarioDatos_DefensaPenal.xlsx
- Periodicidad trimestral; licencia Open Data Commons Attribution.
- **Caveat:** etiquetados "desde/período 2023"; verificar cobertura hasta 2026 en cada ficha.

---

## 7. PLATAFORMA NACIONAL DE DATOS ABIERTOS (datosabiertos.gob.pe)

- **Portal:** https://www.datosabiertos.gob.pe/ (siempre con `www.`)
- **Buscador:** `https://www.datosabiertos.gob.pe/search/type/dataset?query=<término>`
- **Plataforma:** CKAN → **API REST** `https://www.datosabiertos.gob.pe/api/3/action/...`
  - `package_search?q=justicia` — buscar datasets
  - `package_show?id=<uuid|slug>` — metadatos + recursos de un dataset
  - `datastore_search?resource_id=<id>` — filas (solo si el recurso está en datastore; muchos son archivos subidos)
  - Descargas de archivo: `https://www.datosabiertos.gob.pe/sites/default/files/<archivo>`
- **Acceso:** ⭐ ALTA — **el pipeline más barato.** Prioriza `[MPFN] Fiscales` (2019–2026, mensual), Defensa Penal MINJUSDH, Expedientes TC (1992–2026), Procesos PJ.
- **Búsquedas con resultado VACÍO (honestidad):** `penitenciario` → 0, `INPE` → 0, JNJ → 0.

---

## 8. CRIMEN ORGANIZADO / SEGURIDAD CIUDADANA

### 8.1 DATACRIM (INEI/CEIC) — ver §4.1 ⭐
La fuente georreferenciada más completa para homicidios, victimización y delitos a nivel distrital.

### 8.2 SINADEF — Defunciones (MINSA) ✅ (con caveat de disponibilidad)
- **Dataset:** https://www.datosabiertos.gob.pe/dataset/informaci%C3%B3n-de-fallecidos-del-sistema-inform%C3%A1tico-nacional-de-defunciones-sinadef-ministerio
- **Datos:** registro nominal de defunciones con **causas de muerte (CIE-10)** → homicidios filtrando causa externa por agresión (**X85–Y09**).
- **Formato:** CSV/Excel + diccionario + API CKAN (JSON).
- **Cobertura:** desde ~2017. **Acceso:** ✅ ALTA si activo. ⚠️ dataset general pudo ser **deshabilitado temporalmente** tras cambios en SINADEF — verificar disponibilidad antes de depender de él. Requiere procesar CIE-10 para aislar homicidios.

### 8.3 Observatorio Nacional de Seguridad Ciudadana — MININTER ✅ (existe; fetch bloqueado por SSL)
- **Indicador nacional:** https://observatorio.mininter.gob.pe/content/indicador-nacional
- **Reportes (gob.pe):** https://www.gob.pe/institucion/mininter/colecciones/13872-reportes-del-observatorio-nacional-de-seguridad-ciudadana
- **Datos:** indicadores de seguridad ciudadana, homicidios, extorsión; guías regionales.
- **Formato:** dashboards + reportes PDF; datos crudos limitados. **Acceso:** 🟡 media (mejor para contexto/indicadores oficiales).

### 8.4 CEPLAN — Observatorio Nacional de Prospectiva ✅ (contexto, no fuente primaria)
- Inseguridad ciudadana: https://observatorio.ceplan.gob.pe/ficha/t26 · Crimen organizado: https://observatorio.ceplan.gob.pe/ficha/o4_lali
- **Datos:** fichas de tendencias/riesgos (cita Índice Global de Crimen Organizado, victimización). Usa datos de terceros (INEI). **Acceso:** 🟡 análisis/narrativa, no datos crudos descargables.

### 8.5 Recurso bibliográfico
- Guía temática PUCP — Estadísticas de seguridad: https://guiastematicas.biblioteca.pucp.edu.pe/estadisticas-peruanas/seguridad

---

## 9. GEOJSON / DIVISIÓN POLÍTICA DEL PERÚ (mapas coropléticos)

### 9.1 `juaneladio/peru-geojson` ⭐ ✅ (RECOMENDADO para empezar)
- **Repo:** https://github.com/juaneladio/peru-geojson
- **Raw departamental (descarga directa):** https://raw.githubusercontent.com/juaneladio/peru-geojson/master/peru_departamental_simple.geojson
- **Archivos:** `peru_departamental_simple.geojson` (24 features; props `NOMBDEP`, `FIRST_IDDP`=UBIGEO), `peru_provincial_simple.geojson` (`NOMPROV`, `FIRST_IDPR`), `peru_distrital_simple.geojson` (`NOMBDIST`, `IDDIST`), `peru_capital_provincia.geojson` (puntos).
- **Formato:** GeoJSON WGS84, ya simplificado para web. Origen: INEI-2007 + IDEP-2016.
- **Acceso:** ✅ MUY ALTA. Listo para Leaflet/Mapbox/D3.
- **⚠️ Ojo:** son **24 features**, no 25 — la "división en 25 regiones" cuenta Callao/Lima aparte. Cuadrar con tu dataset.

### 9.2 `joseluisq/peru-geojson-datasets` (respaldo, no verificado con fetch)
- https://github.com/joseluisq/peru-geojson-datasets — mismas estructuras; verificar el raw antes de usar.

### 9.3 GEO GPS PERÚ — Shapefiles oficiales INEI/IGN ✅
- Límite departamental: https://www.geogpsperu.com/2019/08/limite-departamental-politico-shapefile.html
- Límite distrital: https://www.geogpsperu.com/2019/05/limite-distrital-actualizado-inei.html
- **Datos:** límites dep/prov/dist y centros poblados (Censo 2017; versiones 2007/2017/2023/2025).
- **Formato:** Shapefile (.shp) / GeoPackage (.gpkg) — **requiere conversión a GeoJSON** (ogr2ogr/QGIS).
- **Acceso:** 🟡 media (descarga gratis vía Drive). Mejor para **límites oficiales actualizados y mayor precisión**.

### 9.4 INEI / oficiales (técnico, no verificados individualmente)
- IDE INEI: https://ide.inei.gob.pe/ (WMS/WFS) · Demarca Perú/SDOT: https://geosdot.servicios.gob.pe/visor/ · SIGMED MINEDU: https://sigmed.minedu.gob.pe/descargas/

### 9.5 UBIGEO — datasets de referencia de códigos ✅
> Clave para unir tus datos al GeoJSON por código UBIGEO. ⚠️ existen **dos sistemas no equivalentes (INEI vs RENIEC)** — cuadra que ambos lados usen el mismo.
- **jmcastagnetto/ubigeo-peru-aumentado** (recomendado): https://github.com/jmcastagnetto/ubigeo-peru-aumentado — equivalencias RENIEC↔INEI + macro-región, lat/long, superficie, altitud. CSV/JSON/RDS.
- CONCYTEC/ubigeo-peru: https://github.com/CONCYTEC/ubigeo-peru (concordancia INEI/RENIEC/SUNAT).
- ernestorivero/Ubigeo-Peru: https://github.com/ernestorivero/Ubigeo-Peru (SQL/JSON/XML/CSV).
- yull23/ubigeos_peru · MichaelSuarez0/ubigeos_peru (API/BD 2025).

---

## Leyenda

- ✅ URL verificada (HTTP 200 con contenido) · ⚠️ existe pero no se pudo renderizar el contenido vía fetch (SSL/418/anti-bot) o tiene caveat · ❌ no existe / no es dato abierto
- Practicidad ETL: ⭐/✅ ALTA · 🟡 media (semi-manual o parsing) · 🔴 baja (scraping frágil / trámite individual)

## Notas de honestidad sobre la verificación
- Las páginas `*.gob.pe` responden **HTTP 418** a fetchers; existen y abren en navegador. El ETL sobre gob.pe necesita navegador headless o headers de browser.
- No se verificó exhaustivamente cuántas Cortes Superiores publican en datosabiertos.gob.pe (solo Piura como muestra), ni la cobertura temporal de cada dataset.
- El contenido del **Observatorio de Criminalidad del MP** y de **DATACRIM** no se pudo extraer programáticamente (SSL/registro); las URLs son correctas pero validar la estructura de descarga en navegador.
- **SINADEF** pudo ser deshabilitado temporalmente — confirmar antes de integrarlo.
- Repos/URLs no verificados con fetch (solo aparecen en búsqueda): `joseluisq/peru-geojson-datasets`, `ide.inei.gob.pe`, `geosdot`, `sigmed.minedu`, los repos UBIGEO de CONCYTEC/ernestorivero/yull23/MichaelSuarez0.
