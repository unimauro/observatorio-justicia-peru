#!/usr/bin/env python3
"""
Fuente: Instituto Nacional de Estadistica e Informatica (INEI).

Contexto socioterritorial: seguridad ciudadana (ENAPRES - victimizacion y
percepcion de inseguridad), estadisticas de criminalidad y poblacion penitenciaria
del INPE, ademas de poblacion proyectada por departamento (denominador de tasas).
Microdatos descargables desde el portal de microdatos del INEI.

Este modulo es un STUB: documenta la fuente oficial y deja los puntos de conexion
(extract / transform) listos para implementar cuando se integre el ETL real.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

SOURCE: dict[str, str] = {
    "nombre": "Seguridad ciudadana, criminalidad y poblacion (ENAPRES / INPE / proyecciones)",
    "institucion": "INEI (con INPE para poblacion penitenciaria)",
    # TODO: confirmar codigos de encuesta/series en el portal de microdatos del INEI.
    "url": "https://proyectos.inei.gob.pe/microdatos/",  # placeholder
    "formato": "csv",  # microdatos (sav/dbf/csv) y cuadros estadisticos
    "periodicidad": "anual",  # ENAPRES anual; INPE mensual
}


def extract(out_dir: Path) -> Path:
    """Descarga microdatos y cuadros del INEI/INPE.

    TODO:
      - ENAPRES: descargar microdatos de victimizacion y percepcion de inseguridad.
      - INPE: descargar series de poblacion penitenciaria por establecimiento/region.
      - Poblacion: descargar proyecciones departamentales (denominador de tasas).
      - Guardar crudos en ``out_dir`` (data/raw/inei/) y registrar metadatos.

    Args:
        out_dir: Carpeta destino para los archivos crudos descargados.

    Returns:
        Ruta al archivo (o carpeta) crudo descargado.
    """
    raise NotImplementedError("extract() pendiente: conectar al portal de microdatos del INEI")


def transform(df: Any) -> Any:
    """Normaliza indicadores de contexto al modelo analitico.

    TODO:
      - Expandir factores de muestreo de ENAPRES para estimar tasas departamentales.
      - Estandarizar departamento (ubigeo) -> dimension departamento.
      - Consolidar series anuales (victimizacion, poblacion penitenciaria, poblacion)
        -> indicador_anual.

    Args:
        df: DataFrame crudo leido de los microdatos/cuadros del INEI.

    Returns:
        DataFrame normalizado listo para cargar a DuckDB.
    """
    raise NotImplementedError("transform() pendiente: normalizar indicadores del INEI/INPE")
