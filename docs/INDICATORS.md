# 📐 Glosario de Indicadores Judiciales

Este documento define los **indicadores** que usa el Observatorio: su fórmula, su interpretación
y su sustento metodológico. Son la base de los tableros y, en fases futuras, de los benchmarks
y modelos predictivos.

## Metodología de referencia

Los indicadores se apoyan en marcos internacionales ampliamente usados para medir la eficiencia
de los sistemas de justicia:

- **CEPEJ** — *Comisión Europea para la Eficiencia de la Justicia* (Consejo de Europa): define el
  **Clearance Rate** y el **Disposition Time**, hoy estándar internacional para comparar la
  productividad y la demora de los tribunales.
- **Banco Mundial** — indicadores de gobernanza y *Doing Business / B-READY* (cumplimiento de
  contratos): tiempo y costo de resolución como proxy de la eficiencia judicial.

> Los valores actuales son **sintéticos** (Fase 1), pero las fórmulas y su interpretación son las
> reales y se mantendrán al integrar datos oficiales.

---

## Tabla de indicadores

| # | Indicador | Fórmula | Unidad | Interpretación | Referencia |
|---|-----------|---------|--------|----------------|------------|
| 1 | **Tasa de resolución (Clearance Rate)** | `Resueltos / Ingresados` | ratio (o %) | `> 1` el sistema reduce backlog; `< 1` lo acumula; `= 1` se mantiene. | CEPEJ |
| 2 | **Congestión procesal** | `(Pendientes + Ingresados) / Resueltos` | ratio | Cuánta carga total enfrenta el sistema por cada caso que resuelve. Mayor valor = mayor saturación. | CEPEJ / B. Mundial |
| 3 | **Índice de mora** | `Pendientes / (Pendientes + Resueltos)` | ratio (0–1) | Proporción de la carga que queda sin resolver. Más alto = más rezago. | CEPEJ |
| 4 | **Carga por juez** | `Ingresados / N.º de jueces` | casos/juez | Volumen de trabajo entrante por magistrado. Mide presión sobre el recurso humano. | CEPEJ |
| 5 | **Tiempo promedio de resolución (Disposition Time)** | `365 × (Pendientes / Resueltos)` *(aprox.)* o promedio real de días | días | Duración estimada para liquidar la carga pendiente al ritmo actual de resolución. | CEPEJ |
| 6 | **Backlog** | `Pendientes acumulados al cierre` | nº casos | Stock de expedientes sin resolver. El "atasco" estructural del sistema. | CEPEJ / B. Mundial |
| 7 | **Pending rate (tasa de pendientes)** | `Pendientes / (Ingresados + Pendientes_inicial)` | ratio (0–1) | Qué fracción de toda la carga disponible quedó pendiente. | CEPEJ |
| 8 | **Índice de productividad** | `Resueltos / N.º de jueces` | casos/juez | Producción efectiva por magistrado. Complementa la carga con el rendimiento. | CEPEJ |
| 9 | **Índice de saturación** | `Carga total / Capacidad teórica` | ratio | Qué tan por encima de su capacidad opera una corte/juzgado. `> 1` = sobresaturado. | Banco Mundial |
| 10 | **Procesos por 1000 habitantes** | `Ingresados / Población × 1000` | casos/1000 hab. | Litigiosidad relativa del territorio; permite comparar áreas de distinto tamaño. | CEPEJ |
| 11 | **Tasa de apelación** | `Apelados / Sentenciados (o Resueltos)` | ratio (0–1) | Proporción de decisiones impugnadas; proxy de conflictividad y de calidad/aceptación de fallos. | CEPEJ |

---

## Detalle por indicador

### 1. Tasa de resolución (Clearance Rate) — CEPEJ
**Fórmula:** `Resueltos / Ingresados`
Es el indicador estrella de la CEPEJ. Compara lo que el sistema **resuelve** contra lo que
**ingresa** en un periodo. Por encima de 1, el tribunal despacha más de lo que recibe y reduce su
rezago; por debajo, lo agrava. En el dataset nacional sintético ronda **0.875** (el sistema
acumula carga).

### 2. Congestión procesal
**Fórmula:** `(Pendientes + Ingresados) / Resueltos`
Mide la carga total (lo heredado más lo nuevo) frente a la capacidad de resolución. Un valor de
**2.5** significa que por cada caso resuelto hay 2.5 esperando o entrando. Es el indicador clásico
de "atasco" del sistema peruano.

### 3. Índice de mora
**Fórmula:** `Pendientes / (Pendientes + Resueltos)`
Fracción de la carga gestionable que no llegó a resolverse. Entre 0 y 1; cuanto más cerca de 1,
mayor rezago estructural.

### 4. Carga por juez
**Fórmula:** `Ingresados / N.º de jueces`
Expone la presión de demanda sobre el recurso humano. Útil para detectar cortes con dotación
insuficiente. En el nacional sintético ronda **1,100 expedientes por juez al año**.

### 5. Tiempo promedio de resolución (Disposition Time) — CEPEJ
**Fórmula:** `365 × (Pendientes / Resueltos)` (estimación CEPEJ) o el **promedio real de días**
hasta la resolución cuando se dispone de fechas. Indica cuánto tardaría, al ritmo actual, en
liquidarse el stock pendiente. En el nacional sintético ronda **636 días**.

### 6. Backlog
**Fórmula:** stock de `Pendientes` acumulados al cierre.
No es una tasa sino un volumen: el "embalse" de expedientes sin resolver. Se monitorea por
juzgado (ver `backlog.json`) para ubicar los cuellos de botella.

### 7. Pending rate (tasa de pendientes)
**Fórmula:** `Pendientes / (Ingresados + Pendientes_inicial)`
Qué proporción de toda la carga disponible quedó pendiente al final del periodo. Complementa al
índice de mora incorporando el ingreso del periodo.

### 8. Índice de productividad
**Fórmula:** `Resueltos / N.º de jueces`
La contraparte de la carga por juez: mide cuánto **produce** efectivamente cada magistrado.
Carga alta + productividad baja señala saturación o ineficiencia; carga alta + productividad alta
señala sobreexigencia.

### 9. Índice de saturación
**Fórmula:** `Carga total / Capacidad teórica`
Relaciona la carga real con la capacidad esperada de un juzgado/corte. Por encima de 1, opera
sobresaturado. Requiere una estimación de capacidad (estándar de casos/juez), que se afinará con
datos oficiales en la Fase 2.

### 10. Procesos por 1000 habitantes
**Fórmula:** `Ingresados / Población × 1000`
Normaliza la litigiosidad por población para comparar territorios de distinto tamaño (Lima vs.
Tumbes). Es un indicador de **demanda** de justicia, no de desempeño.

### 11. Tasa de apelación
**Fórmula:** `Apelados / Sentenciados` (o `Resueltos`)
Proporción de decisiones que son impugnadas. Una tasa alta puede reflejar mayor conflictividad,
materias complejas o menor aceptación de los fallos. En `tipos_proceso.json` varía por materia
(p. ej. mayor en Laboral y Penal).

---

## Cómo se relacionan con los datasets

| Indicador | Dónde se ve |
|-----------|-------------|
| Clearance, congestión, mora, carga/juez, demora | `nacional.json`, `series.json`, `departamentos.json`, `cortes.json` |
| Backlog | `backlog.json` |
| Procesos por 1000 hab. | `departamentos.json` |
| Tasa de apelación, demora mediana/p90 | `tipos_proceso.json` |
| Flujo del proceso (insumo de varios) | `embudo.json` |
| Definiciones base | `indicadores.json` |

---

## Advertencia metodológica

- Donde no hay fechas reales de resolución, el **tiempo de resolución** se estima con la fórmula
  CEPEJ (`365 × Pendientes / Resueltos`); al integrar datos oficiales se usará la demora observada.
- Los indicadores de **capacidad** (saturación) dependen de un estándar de casos/juez que aún no
  está calibrado con cifras oficiales.
- Comparar territorios exige **normalizar** (por población, por materia): un valor alto no implica
  peor desempeño sin controlar por demanda y composición de la carga.
