-- =====================================================================================
-- Observatorio Nacional de Justicia del Peru
-- Esquema analitico (DuckDB / SQL estandar)
--
-- Modelo estrella: una tabla de hechos central (expediente) con metricas de carga
-- procesal, rodeada de dimensiones (departamento, corte_superior, juzgado, juez,
-- fiscal, tipo_proceso). Se agregan caso_seguridad (casos algidos de alto perfil),
-- rotacion (historial de movimientos de magistrados) e indicador_anual (series).
--
-- NOTA: pensado para analitica OLAP. Las claves usan tipos simples; DuckDB no impone
-- foreign keys de forma estricta pero se declaran para documentar el modelo.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- DIMENSION: departamento (25 departamentos del Peru + contexto socioterritorial)
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS departamento (
    departamento_id   INTEGER PRIMARY KEY,
    nombre            VARCHAR NOT NULL UNIQUE,   -- p.ej. "Lima", "Cusco"
    lat               DOUBLE,                    -- centroide aprox.
    lng               DOUBLE,
    poblacion_miles   INTEGER,                   -- poblacion estimada (miles de hab.)
    pobreza           DOUBLE,                    -- indice 0-1
    riesgo_seguridad  DOUBLE                     -- indice 0-1
);

-- -------------------------------------------------------------------------------------
-- DIMENSION: corte_superior (Distrito Judicial) -> departamento sede
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS corte_superior (
    corte_id          INTEGER PRIMARY KEY,
    nombre            VARCHAR NOT NULL UNIQUE,   -- p.ej. "CSJ Lima"
    departamento_id   INTEGER,                   -- FK -> departamento
    FOREIGN KEY (departamento_id) REFERENCES departamento(departamento_id)
);

-- -------------------------------------------------------------------------------------
-- DIMENSION: juzgado (organo jurisdiccional dentro de una corte)
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS juzgado (
    juzgado_id        INTEGER PRIMARY KEY,
    nombre            VARCHAR NOT NULL,          -- p.ej. "3er Juzgado Penal"
    corte_id          INTEGER,                   -- FK -> corte_superior
    especialidad      VARCHAR,                   -- materia del juzgado
    FOREIGN KEY (corte_id) REFERENCES corte_superior(corte_id)
);

-- -------------------------------------------------------------------------------------
-- DIMENSION: juez (magistrado del Poder Judicial)
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS juez (
    juez_id           VARCHAR PRIMARY KEY,       -- p.ej. "J0001"
    nombre            VARCHAR NOT NULL,
    especialidad      VARCHAR,
    condicion         VARCHAR,                   -- Titular / Provisional / Supernumerario
    corte_actual      VARCHAR,                   -- corte de asignacion vigente
    anios_servicio    INTEGER,
    n_rotaciones      INTEGER,
    casos_seguridad   INTEGER,                   -- N de casos algidos a cargo
    carga_actual      INTEGER,
    tasa_resolucion   DOUBLE
);

-- -------------------------------------------------------------------------------------
-- DIMENSION: fiscal (magistrado del Ministerio Publico)
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fiscal (
    fiscal_id         VARCHAR PRIMARY KEY,       -- p.ej. "F0001"
    nombre            VARCHAR NOT NULL,
    especialidad      VARCHAR,
    condicion         VARCHAR,                   -- Titular / Provisional / Supernumerario
    corte_actual      VARCHAR,                   -- distrito fiscal de asignacion vigente
    anios_servicio    INTEGER,
    n_rotaciones      INTEGER,
    casos_seguridad   INTEGER,
    carga_actual      INTEGER,
    tasa_resolucion   DOUBLE
);

-- -------------------------------------------------------------------------------------
-- HECHO/PUENTE: rotacion (historial de asignaciones de un magistrado)
-- Una fila por tramo (juez_id O fiscal_id, corte, especialidad, desde, hasta).
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rotacion (
    rotacion_id       INTEGER PRIMARY KEY,
    rol               VARCHAR NOT NULL,          -- 'Juez' | 'Fiscal'
    juez_id           VARCHAR,                   -- FK -> juez   (NULL si es fiscal)
    fiscal_id         VARCHAR,                   -- FK -> fiscal (NULL si es juez)
    corte             VARCHAR,                   -- corte/distrito del tramo
    especialidad      VARCHAR,
    condicion         VARCHAR,
    anio_desde        INTEGER,
    anio_hasta        INTEGER,                   -- NULL = tramo vigente
    motivo            VARCHAR,                   -- Nombramiento / Traslado / Ascenso / ...
    FOREIGN KEY (juez_id)   REFERENCES juez(juez_id),
    FOREIGN KEY (fiscal_id) REFERENCES fiscal(fiscal_id)
);

-- -------------------------------------------------------------------------------------
-- DIMENSION: tipo_proceso (materia / especialidad procesal)
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tipo_proceso (
    tipo_id              INTEGER PRIMARY KEY,
    tipo                 VARCHAR NOT NULL UNIQUE, -- p.ej. "Penal", "Familia - Alimentos"
    materia              VARCHAR,                 -- agrupador (Penal, Civil, Familia, ...)
    demora_mediana_dias  INTEGER,
    demora_p90_dias      INTEGER,
    tasa_apelacion       DOUBLE
);

-- -------------------------------------------------------------------------------------
-- HECHO: expediente (carga procesal agregada por corte/tipo/anio)
-- Tabla de hechos central del modelo estrella.
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS expediente (
    expediente_id     BIGINT PRIMARY KEY,
    corte_id          INTEGER,                   -- FK -> corte_superior
    departamento_id   INTEGER,                   -- FK -> departamento
    tipo_id           INTEGER,                   -- FK -> tipo_proceso
    anio              INTEGER,
    ingresados        INTEGER,
    resueltos         INTEGER,
    pendientes        INTEGER,
    jueces            INTEGER,
    carga_por_juez    DOUBLE,
    clearance_rate    DOUBLE,                    -- resueltos / ingresados
    congestion        DOUBLE,                    -- (pendientes + ingresados) / resueltos
    demora_dias       INTEGER,
    FOREIGN KEY (corte_id)        REFERENCES corte_superior(corte_id),
    FOREIGN KEY (departamento_id) REFERENCES departamento(departamento_id),
    FOREIGN KEY (tipo_id)         REFERENCES tipo_proceso(tipo_id)
);

-- -------------------------------------------------------------------------------------
-- HECHO: caso_seguridad (casos algidos de alto perfil: crimen organizado, etc.)
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS caso_seguridad (
    caso_id            VARCHAR PRIMARY KEY,      -- p.ej. "SEG-001"
    tema               VARCHAR,                  -- categoria tematica
    caso               VARCHAR,                  -- descripcion del caso
    corte              VARCHAR,
    departamento_id    INTEGER,                  -- FK -> departamento
    juez_id            VARCHAR,                  -- FK -> juez
    fiscal_id          VARCHAR,                  -- FK -> fiscal
    anio_ingreso       INTEGER,
    dias_transcurridos INTEGER,
    estado             VARCHAR,                  -- etapa procesal
    imputados          INTEGER,
    nivel_alerta       VARCHAR,                  -- Normal / Riesgo / Critico
    FOREIGN KEY (departamento_id) REFERENCES departamento(departamento_id),
    FOREIGN KEY (juez_id)         REFERENCES juez(juez_id),
    FOREIGN KEY (fiscal_id)       REFERENCES fiscal(fiscal_id)
);

-- -------------------------------------------------------------------------------------
-- HECHO: indicador_anual (series de tiempo nacionales y por territorio)
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS indicador_anual (
    indicador_id      BIGINT PRIMARY KEY,
    ambito            VARCHAR,                   -- 'nacional' | 'departamento' | 'corte'
    departamento_id   INTEGER,                   -- FK -> departamento (NULL si nacional)
    anio              INTEGER,
    ingresados        INTEGER,
    resueltos         INTEGER,
    pendientes        INTEGER,
    demora_dias       INTEGER,
    clearance_rate    DOUBLE,
    FOREIGN KEY (departamento_id) REFERENCES departamento(departamento_id)
);
