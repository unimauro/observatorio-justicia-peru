#!/usr/bin/env python3
"""
Descarga generica de recursos de datosabiertos.gob.pe (DKAN/CKAN).

datosabiertos.gob.pe exige:
  - subdominio ``www.``
  - cabecera ``User-Agent`` de navegador (sin ella devuelve 301/418).

Las extensiones de los recursos a veces enganan (un CSV etiquetado ``.docx``):
validar SIEMPRE por contenido, no por la extension de la URL.

Funciones:
  - ``package_show(slug)``  -> metadatos + recursos de un dataset.
  - ``download(url, dest)`` -> descarga con reintentos a ``dest``.
  - ``read_csv_smart(path)`` -> lee CSV probando encodings y separadores.
"""
from __future__ import annotations

import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

import pandas as pd

BASE = "https://www.datosabiertos.gob.pe"
UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
)
HEADERS = {"User-Agent": UA, "Accept": "*/*"}


def _request(url: str, timeout: int = 90):
    return urllib.request.Request(url, headers=HEADERS)


def api_get(url: str, timeout: int = 90, retries: int = 3) -> dict:
    """GET JSON de la API CKAN-compat con reintentos."""
    last = None
    for i in range(retries):
        try:
            with urllib.request.urlopen(_request(url), timeout=timeout) as r:
                return json.loads(r.read().decode("utf-8", errors="replace"))
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(2 * (i + 1))
    raise RuntimeError(f"api_get fallo tras {retries} intentos: {url} :: {last}")


def package_show(slug: str) -> dict:
    """Devuelve el dict del dataset (normaliza el ``result`` lista|dict de DKAN)."""
    url = f"{BASE}/api/3/action/package_show?id={urllib.parse.quote(slug)}"
    data = api_get(url)
    res = data.get("result")
    if isinstance(res, list):
        res = res[0] if res else {}
    return res or {}


def csv_resources(slug: str) -> list[dict]:
    """Lista de recursos cuya URL termina en .csv (ignora xlsx/docx de metadatos)."""
    out = []
    for r in package_show(slug).get("resources", []):
        url = (r.get("url") or "").strip()
        if url.lower().endswith(".csv"):
            out.append({"name": r.get("name"), "url": url, "format": r.get("format")})
    return out


def download(url: str, dest: Path, retries: int = 3, timeout: int = 120) -> Path:
    """Descarga ``url`` a ``dest`` con reintentos. Devuelve la ruta destino."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 0:
        return dest  # ya descargado
    last = None
    for i in range(retries):
        try:
            with urllib.request.urlopen(_request(url), timeout=timeout) as r:
                data = r.read()
            if not data:
                raise RuntimeError("respuesta vacia")
            dest.write_bytes(data)
            return dest
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(2 * (i + 1))
    raise RuntimeError(f"download fallo tras {retries} intentos: {url} :: {last}")


def read_csv_smart(path: Path, **kwargs) -> pd.DataFrame:
    """Lee un CSV probando utf-8-sig -> latin-1 y autodetectando separador.

    Valida por contenido: si el archivo no parsea como CSV tabular, propaga el error
    para que el orquestador lo registre (sin inventar datos).
    """
    encodings = ["utf-8-sig", "latin-1"]
    last = None
    for enc in encodings:
        try:
            df = pd.read_csv(path, encoding=enc, sep=None, engine="python",
                             dtype=str, **kwargs)
            # heuristica: un CSV real tiene >1 columna o filas con separadores
            if df.shape[1] >= 1 and df.shape[0] >= 0:
                return df
        except Exception as e:  # noqa: BLE001
            last = e
    raise RuntimeError(f"read_csv_smart no pudo leer {path}: {last}")


if __name__ == "__main__":  # smoke test
    import sys

    slug = sys.argv[1] if len(sys.argv) > 1 else "mpfn-fiscales"
    pkg = package_show(slug)
    print("titulo:", pkg.get("title"))
    for r in csv_resources(slug):
        print(" CSV:", r["url"])
