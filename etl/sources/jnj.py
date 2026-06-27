#!/usr/bin/env python3
"""
Fuente: Junta Nacional de Justicia (JNJ).

Gestion de magistrados: nombramientos, ratificaciones, evaluaciones, destituciones
y sanciones, y ROTACIONES (traslados / reasignaciones / encargaturas) de jueces y
fiscales a nivel nacional. Insumo clave para el modulo de trayectorias y rotaciones
de magistrados del observatorio.

Este modulo es un STUB: documenta la fuente oficial y deja los puntos de conexion
(extract / transform) listos para implementar cuando se integre el ETL real.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

SOURCE: dict[str, str] = {
    "nombre": "Nombramientos, ratificaciones, sanciones y rotaciones de magistrados",
    "institucion": "Junta Nacional de Justicia (JNJ)",
    # TODO: confirmar URL real (resoluciones/boletines de la JNJ y portal de transparencia).
    "url": "https://www.gob.pe/jnj",  # placeholder
    "formato": "pdf",  # resoluciones publicadas; tambien convocatorias en xlsx
    "periodicidad": "continua",  # publicacion por resolucion/proceso
}


def extract(out_dir: Path) -> Path:
    """Descarga resoluciones y registros de movimientos de magistrados de la JNJ.

    TODO:
      - Recorrer el repositorio de resoluciones de la JNJ (nombramientos, ratificaciones,
        destituciones, sanciones) y los resultados de concursos.
      - Descargar PDFs/planillas a ``out_dir`` (data/raw/jnj/).
      - Para rotaciones: cruzar con publicaciones de traslados/reasignaciones del PJ/MP.
      - Registrar metadatos (numero de resolucion, fecha, magistrado, URL).

    Args:
        out_dir: Carpeta destino para los archivos crudos descargados.

    Returns:
        Ruta al archivo (o carpeta) crudo descargado.
    """
    raise NotImplementedError("extract() pendiente: conectar al repositorio de resoluciones de la JNJ")


def transform(df: Any) -> Any:
    """Normaliza movimientos de magistrados al modelo analitico (juez/fiscal + rotacion).

    TODO:
      - Resolver identidad del magistrado (deduplicacion por nombre/DNI) -> dimension juez/fiscal.
      - Construir el historial de rotaciones como (magistrado, corte, especialidad,
        condicion, desde, hasta, motivo) -> tabla rotacion.
      - Clasificar el motivo: Nombramiento / Traslado / Ascenso / Reasignacion /
        Encargatura / Ratificacion / Sancion.

    Args:
        df: DataFrame crudo extraido de las resoluciones de la JNJ.

    Returns:
        DataFrame normalizado listo para cargar a DuckDB.
    """
    raise NotImplementedError("transform() pendiente: normalizar movimientos/rotaciones de la JNJ")
