#!/usr/bin/env python3
"""
Fuente: Poder Judicial del Peru (PJ).

Carga procesal: expedientes ingresados, resueltos y pendientes por Corte Superior
de Justicia (Distrito Judicial), instancia y especialidad. Produccion estadistica
de la Subgerencia de Estadistica de la Gerencia General del Poder Judicial.

Este modulo es un STUB: documenta la fuente oficial y deja los puntos de conexion
(extract / transform) listos para implementar cuando se integre el ETL real.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

SOURCE: dict[str, str] = {
    "nombre": "Carga procesal por corte y especialidad",
    "institucion": "Poder Judicial del Peru - Subgerencia de Estadistica",
    # TODO: confirmar URL/endpoint real del Boletin Estadistico / portal de datos del PJ.
    "url": "https://www.pj.gob.pe/wps/wcm/connect/Estadisticas/",  # placeholder
    "formato": "xlsx",  # boletines estadisticos publicados en Excel/PDF
    "periodicidad": "anual",  # con avances trimestrales
}


def extract(out_dir: Path) -> Path:
    """Descarga los boletines/estadisticas de carga procesal del Poder Judicial.

    TODO:
      - Recorrer el portal de estadistica del PJ y localizar los boletines anuales
        (xlsx/pdf) de carga procesal por Corte Superior, instancia y especialidad.
      - Descargar los archivos crudos a ``out_dir`` (data/raw/poder_judicial/).
      - Versionar metadatos de descarga (fecha, hash, URL de origen).

    Args:
        out_dir: Carpeta destino para los archivos crudos descargados.

    Returns:
        Ruta al archivo (o carpeta) crudo descargado.
    """
    raise NotImplementedError("extract() pendiente: conectar al portal de estadistica del PJ")


def transform(df: Any) -> Any:
    """Normaliza la carga procesal del PJ al modelo analitico del observatorio.

    TODO:
      - Estandarizar nombres de Cortes Superiores (distritos judiciales) -> dimension corte_superior.
      - Mapear especialidad/materia -> dimension tipo_proceso.
      - Calcular metricas derivadas: clearance_rate, congestion, indice_mora, carga_por_juez.
      - Emitir la tabla de hechos a nivel (corte, anio, especialidad) compatible con expediente.

    Args:
        df: DataFrame crudo leido de los boletines del PJ.

    Returns:
        DataFrame normalizado listo para cargar a DuckDB.
    """
    raise NotImplementedError("transform() pendiente: normalizar carga procesal del PJ")
