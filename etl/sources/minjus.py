#!/usr/bin/env python3
"""
Fuente: Ministerio de Justicia y Derechos Humanos (MINJUSDH).

Acceso a la justicia: estadisticas de la Direccion General de Defensa Publica y
Acceso a la Justicia (patrocinio penal, de familia, victimas), conciliacion
extrajudicial y otros servicios de justicia. Insumo para indicadores de cobertura
y acceso del observatorio.

Este modulo es un STUB: documenta la fuente oficial y deja los puntos de conexion
(extract / transform) listos para implementar cuando se integre el ETL real.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

SOURCE: dict[str, str] = {
    "nombre": "Defensa publica y acceso a la justicia",
    "institucion": "MINJUSDH - Direccion General de Defensa Publica y Acceso a la Justicia",
    # TODO: confirmar URL real (portal de datos / anuarios del MINJUSDH).
    "url": "https://www.gob.pe/minjus",  # placeholder
    "formato": "xlsx",  # anuarios y reportes estadisticos
    "periodicidad": "anual",
}


def extract(out_dir: Path) -> Path:
    """Descarga estadisticas de defensa publica y acceso a la justicia del MINJUSDH.

    TODO:
      - Localizar anuarios/reportes de la Direccion General de Defensa Publica.
      - Descargar archivos crudos (xlsx/csv) a ``out_dir`` (data/raw/minjus/).
      - Registrar metadatos de descarga (fecha, hash, URL).

    Args:
        out_dir: Carpeta destino para los archivos crudos descargados.

    Returns:
        Ruta al archivo (o carpeta) crudo descargado.
    """
    raise NotImplementedError("extract() pendiente: conectar al portal de datos del MINJUSDH")


def transform(df: Any) -> Any:
    """Normaliza estadisticas de defensa publica al modelo analitico.

    TODO:
      - Estandarizar sede/territorio -> dimension departamento.
      - Tipificar servicio (penal, familia, victimas, conciliacion).
      - Consolidar series anuales de patrocinios/atenciones -> indicador_anual.

    Args:
        df: DataFrame crudo leido de los reportes del MINJUSDH.

    Returns:
        DataFrame normalizado listo para cargar a DuckDB.
    """
    raise NotImplementedError("transform() pendiente: normalizar estadisticas del MINJUSDH")
