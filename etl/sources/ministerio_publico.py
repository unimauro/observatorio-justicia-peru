#!/usr/bin/env python3
"""
Fuente: Ministerio Publico - Fiscalia de la Nacion (MP).

Carga fiscal: casos ingresados y resueltos por Distrito Fiscal y especialidad,
e indicadores de criminalidad del Observatorio de Criminalidad del MP (denuncias,
homicidios, victimas, delitos por tipo y territorio).

Este modulo es un STUB: documenta la fuente oficial y deja los puntos de conexion
(extract / transform) listos para implementar cuando se integre el ETL real.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

SOURCE: dict[str, str] = {
    "nombre": "Carga fiscal e indicadores de criminalidad",
    "institucion": "Ministerio Publico - Observatorio de Criminalidad",
    # TODO: confirmar URL real del Observatorio de Criminalidad del MP / data abierta.
    "url": "https://www.mpfn.gob.pe/observatorio_criminalidad/",  # placeholder
    "formato": "xlsx",  # tableros y anuarios estadisticos
    "periodicidad": "anual",  # con reportes mensuales de homicidios
}


def extract(out_dir: Path) -> Path:
    """Descarga los anuarios/tableros del Observatorio de Criminalidad del MP.

    TODO:
      - Localizar anuarios estadisticos y series de denuncias/homicidios por
        Distrito Fiscal y departamento.
      - Descargar archivos crudos (xlsx/csv) a ``out_dir`` (data/raw/ministerio_publico/).
      - Registrar metadatos de descarga (fecha, hash, URL).

    Args:
        out_dir: Carpeta destino para los archivos crudos descargados.

    Returns:
        Ruta al archivo (o carpeta) crudo descargado.
    """
    raise NotImplementedError("extract() pendiente: conectar al Observatorio de Criminalidad del MP")


def transform(df: Any) -> Any:
    """Normaliza la carga fiscal y criminalidad del MP al modelo analitico.

    TODO:
      - Estandarizar Distritos Fiscales y mapearlos a departamento.
      - Tipificar delitos -> categorias tematicas (caso_seguridad).
      - Consolidar series anuales de denuncias/homicidios -> indicador_anual.

    Args:
        df: DataFrame crudo leido de los anuarios del MP.

    Returns:
        DataFrame normalizado listo para cargar a DuckDB.
    """
    raise NotImplementedError("transform() pendiente: normalizar carga fiscal/criminalidad del MP")
