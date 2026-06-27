"""Conectores de fuentes oficiales del Observatorio Nacional de Justicia del Peru.

Cada modulo expone un dict ``SOURCE`` con metadatos de la fuente y funciones
``extract(out_dir)`` / ``transform(df)`` (stubs por implementar). Importar este
paquete NO ejecuta descargas ni dependencias pesadas.
"""
from __future__ import annotations

from . import inei, jnj, ministerio_publico, minjus, poder_judicial

SOURCES = {
    "poder_judicial": poder_judicial,
    "ministerio_publico": ministerio_publico,
    "jnj": jnj,
    "inei": inei,
    "minjus": minjus,
}

__all__ = [
    "SOURCES",
    "poder_judicial",
    "ministerio_publico",
    "jnj",
    "inei",
    "minjus",
]
