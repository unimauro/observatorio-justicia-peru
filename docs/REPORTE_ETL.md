# REPORTE ETL REAL - Observatorio Justicia Peru
Ejecutado (UTC): 2026-06-27T04:37:28.724827+00:00

## PJ carga procesal nacional (agregado)
  filas leidas=58568 | descartadas(negativos/anio fuera rango)=0 | validas=58568
  -> escrito site/data/real/pj_carga_nacional.json
  nacional: ingresos=4,807,977 resueltos=2,142,286 pendientes=3,570,862 clearance=44.6% congestion=3.91

## MPFN fiscales (agregado, headcount snapshot)
  filas=17147 descartadas=0 validas=17147 anios=[np.int64(2019), np.int64(2020), np.int64(2021), np.int64(2022), np.int64(2023), np.int64(2024), np.int64(2025), np.int64(2026)]
  -> escrito site/data/real/mpfn_fiscales.json
  total_fiscales (anio 2026) = 8,531

## MPFN casos fiscales (agregado, flujo)
  filas=9593 descartadas=0 validas=9593
  -> escrito site/data/real/mpfn_casos.json
  casos 2026: ingresado=622,744 atendido=530,831

## MPFN delitos denunciados (agregado)
  filas=73448 descartadas=0 validas=73448 anios=[np.int64(2019), np.int64(2020), np.int64(2021), np.int64(2022), np.int64(2023), np.int64(2024), np.int64(2025), np.int64(2026)]
  -> escrito site/data/real/mpfn_delitos.json
  total_denuncias = 8,156,028

## Microdata Piura - demora real en dias (anonimizado)
  NLPT Laboral: filas_brutas=15309 eventos_sentencia=6314 validos(DIAS>=0)=6302 (descartados 12)
  Alimentos: filas_brutas=6329 eventos_sentencia=2908 validos(DIAS>=0)=2908 (descartados 0)
  Penal (pena efectiva): filas_brutas=2450 eventos_sentencia=1689 validos(DIAS>=0)=1667 (descartados 22)
  Civil: filas_brutas=2738 eventos_sentencia=860 validos(DIAS>=0)=860 (descartados 0)
  -> escrito site/data/real/demora_piura.json
  NLPT Laboral: n=6302 mediana=112.0d p90=302.0d
  Alimentos: n=2908 mediana=134.0d p90=338.0d
  Penal (pena efectiva): n=1667 mediana=112.0d p90=383.0d
  Civil: n=860 mediana=74.5d p90=391.1d
  -> escrito site/data/real/manifest.json

## Supuestos, columnas y huecos (honestidad del dato)
- PJ: ingresos=INGRESO_SIN+INGRESO_CON (nuevos + con tramite/reingreso previo); resueltos=RESUELTO; pendientes=PENDIENTE. Verificado que sin-sufijo = T(tramite)+E(ejecucion). ingresos/resueltos son flujo anual; PENDIENTE es stock reportado solo en Enero (=pendientes_inicio). clearance=resueltos/ingresos*100; congestion=(pendientes+ingresos)/resueltos.
- PJ: el archivo solo cubre 2024 (mensual). No hay diccionario de datos publicado; la semantica de SIN/CON se infiere de la identidad aritmetica, no de un diccionario oficial.
- MPFN fiscales: es headcount (stock). Se toma el snapshot del ultimo mes de cada anio; NO se suman meses (evita doble conteo). Desgloses sobre el anio mas reciente.
- MPFN casos/delitos: flujos acumulados por periodo anual; se suman entre distritos. 2026 es parcial (corte a mitad de anio): cifras menores, no comparables a anios completos.
- Demora Piura: SOLO microdata por expediente (unica via a dias reales). Cobertura = CSJ Piura. Anonimizado (DNI y FECHA_NACIMIENTO eliminados al cargar). Una fila por evento de sentencia (dedup por EXPEDIENTE+instancia+fechas+DIAS para colapsar duplicacion por parte). DIAS<0 o nulo descartado. Aparecen valores tope (max=999 en NLPT/Penal) que parecen sentinela en origen.
- NO se derivan dias de demora desde agregados (regla no negociable del spec).
- Pendiente/no incluido en esta corrida: TC 1992-2026 (XLSX), modulos VCM, INEI, y descargas manuales (PJ Portal Estadistico, CNPJ). Quedan como siguiente iteracion.


## Iteracion 2 (TC + MPFN seguridad)

# REPORTE ETL REAL - Iteracion 2 - Observatorio Justicia Peru
Ejecutado (UTC): 2026-06-29T15:51:52.298670+00:00

## Tribunal Constitucional - ingresos, publicados y demora real
  ingresados: 159,262 filas | publicados: 149,951 filas
  demora: 149,939 expedientes con dias>=0 (descartados 12 con dias<0)
  -> escrito site/data/real/tc.json
  demora global: n=149,939 mediana=291.0d p90=798.0d
    ACCION DE AMPARO: n=101,610 mediana=304.0d p90=810.0d
    HÁBEAS CORPUS: n=26,714 mediana=300.0d p90=793.0d
    ACCION DE CUMPLIMIENTO: n=12,337 mediana=217.0d p90=639.4d
    QUEJA: n=5,319 mediana=181.0d p90=535.0d
    HÁBEAS DATA: n=2,887 mediana=466.0d p90=1125.8d

## MPFN seguridad adicional (flagrancia, VCM, ciberdelitos, trata)
  flagrancia: filas=66 validas=66 anios=[np.int64(2025), np.int64(2026)]
  violencia_mujer: filas=139 validas=139 anios=[np.int64(2019), np.int64(2020), np.int64(2021), np.int64(2022)]
  ciberdelitos: filas=9515 validas=9515 anios=[np.int64(2019), np.int64(2020), np.int64(2021), np.int64(2022)]
  trata: total=7,517 distritos=34 anios=[2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018]
  -> escrito site/data/real/mpfn_seguridad.json
  flagrancia: total=30,154
  violencia_mujer: total=807,962
  ciberdelitos: total=738,860
  trata: total=7,517
  -> escrito site/data/real/manifest.json
