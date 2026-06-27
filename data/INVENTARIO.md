# INVENTARIO DE DATOS — FASE 0

> Resultado de la **FASE 0** del [`SPEC.md`](../SPEC.md). Inventario de fuentes reales de datos
> abiertos del sistema de justicia peruano. **No se ha inventado ningún dato**: lo aquí listado fue
> verificado consultando la API y leyendo encabezados reales de los recursos.
>
> **Fecha del inventario:** 2026-06-27 · **Método:** API CKAN-compat de datosabiertos.gob.pe.

## 0. ¿Qué API responde? (verificación técnica)

`datosabiertos.gob.pe` es un portal **DKAN 1.x (Drupal 7)** con API compatible CKAN.

| Endpoint | Estado | Uso |
|---|---|---|
| `…/api/3/action/package_list` | ✅ 200 (JSON) | Lista de los **4,665** datasets (slugs) |
| `…/api/3/action/package_show?id=<slug>` | ✅ 200 (JSON) | Metadatos + recursos de un dataset |
| `…/api/3/action/current_package_list_with_resources?limit=N` | ✅ 200 (JSON) | Listado paginado con recursos |
| `…/api/3/action/package_search?q=…` | ❌ 301 → HTML | **NO usar** (redirige a página de búsqueda) |

- Requiere subdominio `www.` y un `User-Agent` de navegador (sin él: 301/418).
- De 4,665 datasets, **155** coinciden con términos judiciales/fiscales. Filtrando ruido
  (Indecopi consumidor, OEFA ambiental, seguridad ciudadana municipal, contrataciones) quedan
  los siguientes núcleos relevantes.

---

## 1. AUTOMATIZABLES (API datosabiertos.gob.pe)

### 1.A — Carga procesal nacional (AGREGADO) ⭐ núcleo del dashboard

**`procesos-judiciales-principales-nivel-nacional-partir-del-2023-poder-judicial`**
- **Institución:** Poder Judicial. **Cobertura:** 2024+ (mensual). **Granularidad:** AGREGADO.
- **Recurso:** CSV (etiquetado como `.docx` en el portal, pero es CSV):
  `…/sites/default/files/dataset_jurisdiccional_a-partir-del-2024.csv`
- **Columnas reales (60):** `ANIO, MES, DISTRITO_JUDICIAL, PROVINCIA, DISTRITO, CODIGODEP,
  DEPENDENCIA, ESTADO, TIPO_ORGANO, ESPEC_EXP, ESPEC_DEP, CONDICION, PENDIENTET, PENDIENTE,
  INGRESO_SIN, INGRESO_CON, INGRESOT_*, SENTENCIA, AUTODEFINITIVO, CONCILIADO, RESUELTOT,
  RESUELTO, …` (contadores de pendientes/ingresos/resueltos por etapa).
- **Mapea al esquema mínimo del spec** (pendientes_inicio≈PENDIENTE, ingresos≈INGRESOT,
  resueltos≈RESUELTOT) por dependencia/especialidad/instancia/mes/año. **Sin fechas por
  expediente → solo índices de congestión/resolución, NO días.**
- **Cobertura geográfica:** NACIONAL (todos los distritos judiciales).

### 1.B — Microdata por expediente (DEMORA REAL en días) ⭐ habilita tiempos reales

> ⚠️ **PRIVACIDAD:** estos CSV contienen `DNI` y `FECHA_NACIMIENTO`. Anonimizar/eliminar esas
> columnas en el ETL **antes** de procesar (regla §7 del spec). Solo cobertura **Piura** (CSJ Piura).

| Dataset (slug) | Proceso | Columnas clave | Demora |
|---|---|---|---|
| `demandas-con-sentencias-de-la-nueva-ley-procesal-de-trabajo-nlpt-…` | Laboral NLPT | `FECHA_INGRESO, FECHA_SENTENCIA, DIAS, EXPEDIENTE, INSTANCIA, MATERIA, ACTO_PROCESAL` | ✅ `DIAS` ya viene calculado |
| `demandas-por-proceso-de-alimentos-con-sentencia-…-piura` | Familia/Alimentos | `FECHA_INGRESO, FECHA_SENTENCIA, DIAS, EDAD, ADULTO_MAYOR` | ✅ `DIAS` |
| `situación-jurídica-de-procesos-penales-con-penas-privativas-…-efectivas` | Penal | `sentencia_pena.csv` | ✅ (con fechas) |
| `demandas-con-sentencias-del-módulo-corporativo-civil-de-litigación-oral-…` | Civil | sentencias con fechas | ✅ |
- Cada uno trae **diccionario de datos** (`.xlsx`) y **metadatos** (`.docx`) oficiales.
- Ejemplo NLPT real: ingreso 2021-01-04 → sentencia 2021-09-23 = **262 días**.

### 1.C — Ministerio Público / Fiscalía (AGREGADO) ⭐ foco fiscales/seguridad

| Dataset (slug) | Qué tiene | Columnas | Granularidad |
|---|---|---|---|
| `mpfn-casos-fiscales` | Casos por distrito fiscal/materia/año (10 CSV, 2019→) | `periodo, anio, distrito_fiscal, tipo_fiscalia, materia, especialidad, tipo_caso, ingresado, atendido, ubigeo_pjfs, dpto/prov/dist_pjfs, fecha_corte` | agregado |
| `mpfn-fiscales` | Nº fiscales por distrito/cargo/condición/sexo (mensual) | `anio, mes, distrito_fiscal, ubicacion_especialidad, cargo, condicion, sexo, total, ubigeo…` | agregado |
| `mpfn-fiscalías` | Fiscalías por distrito (hasta 2025-12) | dotación/ubicación | agregado |
| `mpfn-delitos-denunciados` | Delitos denunciados (distrital + tipo) | `…, generico, subgenerico, articulo, des_articulo, cantidad, ubigeo_pjfs, dpto/prov/dist_pjfs` | agregado |
| `mpfn-casos-fiscales-de-flagrancia-delictiva` | Flagrancia (2025) | — | agregado |
| `mpfn-casos-fiscales-en-violencia-contra-la-mujer` | VCM (2019→) | — | agregado |
| `mpfn-delitos-de-ciberdelincuencia-denunciados` | Ciberdelitos | — | agregado |
| `casos-intervenidos-por-el-delito-de-trata-de-personas-según-distrito-fiscal` | Trata | por distrito fiscal | agregado |

> Nota: el archivo `delitos denunciados 2019/2020.csv` que ya está en `~/Downloads` corresponde a
> **`mpfn-delitos-denunciados`** (mismas columnas). Es real y reutilizable.

### 1.D — Módulos especializados / penal (AGREGADO)

| Dataset | Columnas | Cobertura |
|---|---|---|
| `procesos-ingresados-y-resueltos-de-los-modulos-penales-de-violencia-contra-las-mujeres` | `PERIODO, MES, CORTE, DEPARTAMENTO, …, ETAPA, INSTANCIAS_PROCESALES, NORMATIVIDAD_APLICABLE, INGRESOS, RESUELTOS` | nacional, 2019→ |
| `ingreso-por-delitos-en-flagrancia-y-conducción-en-estado-de-ebriedad-…-piura` | ingresos por delito | Piura |
| `inscripción-de-requisitorias-por-ubigeo-género-edad-y-delito-…` | requisitorias | corte superior |

### 1.E — Tribunal Constitucional (microdata, formato XLSX)

| Dataset | Recurso | Cobertura |
|---|---|---|
| `expedientes-ingresados-al-tribunal-constitucional-desde-1992-2026-…` | `dataset_ing_04-05-2026.xlsx` | 1992–2026 |
| `expedientes-publicados-por-el-tribunal-constitucional-desde-1992-2026` | `dataset_pub_04-05-2026.xlsx` | 1992–2026 |
- XLSX (requiere `openpyxl`). Útil para tiempos a nivel TC.

### 1.F — MINJUSDH / defensa pública / abogados

| Dataset | Qué tiene | Formato |
|---|---|---|
| `patrocinios-asumidos-por-la-defensa-penal-de-la-dirección-general-de-defensa-pública` | Defensa pública penal | CSV (`DEFENSA_PENAL_DATASET01_3.csv`) |
| `registro-nacional-de-abogados-sancionados-desde-el-2022-…` | Abogados sancionados | CSV (`RNAS_DATASET01_1.csv`) |
| `servicio-civil-de-graduandos-secigra-derecho-…` | SECIGRA Derecho | CSV |

### 1.G — INEI (denuncias / seguridad, vía datosabiertos pero recursos en inei.gob.pe)

| Dataset | Recurso | Nota |
|---|---|---|
| `registro-nacional-de-denuncias-de-delitos-y-faltas-2016/2017-inei` | CSV + PDF (diccionario) + ZIP | recursos alojados en `inei.gob.pe/media/DATOS_ABIERTOS/DELITOS/…` |
| `encuesta-nacional-…-enapres-capitulo-600-seguridad-ciudadana-año-*` | microdatos ENAPRES cap. 600 | varios años |
| `indicadores-y-tendencias-para-planes-de-acción-de-seguridad-ciudadana` | indicadores | — |

---

## 2. DESCARGA MANUAL (no automatizable)

Ver detalle con enlaces en [`raw/MANUAL_DOWNLOADS.md`](raw/MANUAL_DOWNLOADS.md). Resumen:
- **Portal Estadístico del PJ** (portalestadistico.pj.gob.pe): carga procesal por corte/especialidad/
  instancia/año en tableros/PDF. Bloquea scraping → export manual.
- **INEI** Anuario de Criminalidad y Seguridad Ciudadana / Compendio Estadístico (PDF, algunos XLS).
- **CNPJ** (Comisión Nacional de Productividad Judicial): estándares de expedientes resueltos por
  tipo de órgano (resoluciones/PDF) → necesario para la "Brecha vs estándar CNPJ".
- **MPFN** boletines estadísticos (PDF) — complementan los CSV de datosabiertos.

---

## 3. Prioridad recomendada para FASE 1 (ETL)

| # | Fuente | Por qué primero | Esfuerzo |
|---|---|---|---|
| 1 | PJ `dataset_jurisdiccional` (1.A) | Carga procesal NACIONAL agregada → llena el esquema mínimo y todos los índices | Bajo (1 CSV, API) |
| 2 | MPFN casos fiscales + fiscales + delitos (1.C) | Foco fiscales/seguridad pedido; ya hay CSV reales | Bajo-medio |
| 3 | Microdata Piura NLPT/Alimentos/Penal (1.B) | Única vía a **demora real en días** (con anonimización) | Medio (privacidad) |
| 4 | TC 1992-2026 (1.E) | Serie histórica larga | Medio (XLSX) |
| 5 | Manual: PJ Portal + CNPJ (§2) | Estándares y cobertura agregada adicional | Manual |

## 4. Huecos / límites conocidos (honestidad del dato)

- **No hay** dataset abierto de **rotaciones de jueces/fiscales** (el prototipo lo modeló de forma
  ilustrativa; en producción se construiría del Boletín de la Magistratura de la JNJ por scraping).
- **Demora en días solo en Piura** (microdata) + TC. El resto del país: solo índices agregados.
- El PJ Portal Estadístico bloquea scraping → cobertura agregada nacional depende de descarga manual
  o del `dataset_jurisdiccional` (que arranca en 2024).
- Recursos del portal a veces con extensión engañosa (CSV etiquetado `.docx`): validar por contenido.
