"""Comprueba que las carpetas de data/processed son coherentes y no mezclan municipios.

Uso: python etl/verificar.py            (todas las carpetas)
     python etl/verificar.py Getafe     (solo una)

Comprobaciones por carpeta <cod>-<slug>:
  1. Todo elemento de todo fichero lleva cod_ine igual al de la carpeta.
  2. Todos los puntos y geometrías caen a menos de 25 km del centro de los ámbitos/parcelas del municipio.
  3. Ningún fichero tiene geometrías vacías o inválidas.
  4. Peso total de lo que descarga la web por debajo de 5 MB.
Termina con código distinto de 0 si algo falla.
"""
import json
import sys
from pathlib import Path

import geopandas as gpd
import numpy as np

from comun import PROCESSED, resolver_municipio

RADIO_KM = 25
PESO_MAX_KB = 5000


def verificar(carpeta: Path) -> list[str]:
    cod = carpeta.name.split("-")[0]
    fallos: list[str] = []
    capas = {f.name: gpd.read_file(f) for f in sorted(carpeta.glob("*.geojson"))}
    if not capas:
        return [f"{carpeta.name}: sin ficheros .geojson"]
    for nombre, g in capas.items():
        otros = set(g["cod_ine"].unique()) - {cod} if "cod_ine" in g else {"(sin cod_ine)"}
        if otros:
            fallos.append(f"{carpeta.name}/{nombre}: códigos de municipio ajenos {otros}")
        if g.geometry.is_empty.any() or g.geometry.isna().any():
            fallos.append(f"{carpeta.name}/{nombre}: geometrías vacías")
        mixtas = set(g.geom_type.unique()) - {"Point", "Polygon", "MultiPolygon"}
        if mixtas:
            fallos.append(f"{carpeta.name}/{nombre}: tipos de geometría no admitidos por la web {mixtas}")
        if not g.geometry.is_valid.all():
            fallos.append(f"{carpeta.name}/{nombre}: {(~g.geometry.is_valid).sum()} geometrías inválidas")
    for nombre in ("natalidad.json", "poblacion.json", "resumen_ambitos.json"):
        f = carpeta / nombre
        if f.exists() and json.loads(f.read_text(encoding="utf-8")).get("cod_ine") != cod:
            fallos.append(f"{carpeta.name}/{nombre}: cod_ine distinto de {cod}")
    # distancia al centro: las parcelas vacantes definen dónde está el municipio
    ref = capas.get("parcelas_vacantes.geojson")
    if ref is not None and len(ref):
        c = ref.to_crs(25830).geometry.centroid
        cx, cy = c.x.median(), c.y.median()
        for nombre, g in capas.items():
            cg = g.to_crs(25830).geometry.centroid
            d = np.hypot(cg.x - cx, cg.y - cy) / 1000  # km
            lejos = int((d > RADIO_KM).sum())
            if lejos:
                fallos.append(f"{carpeta.name}/{nombre}: {lejos} elementos a más de {RADIO_KM} km del centro del municipio")
    kb = sum(f.stat().st_size for f in carpeta.glob("*") if f.suffix in (".geojson", ".json") and not f.name.startswith("_")) / 1000
    if kb > PESO_MAX_KB:
        fallos.append(f"{carpeta.name}: la web descargaría {kb:.0f} KB (máximo {PESO_MAX_KB})")
    print(f"{carpeta.name}: {len(capas)} capas, {kb:.0f} KB -> {'OK' if not fallos else 'FALLOS'}")
    return fallos


if __name__ == "__main__":
    if len(sys.argv) > 1:
        m = resolver_municipio(sys.argv[1])
        carpetas = [PROCESSED / f"{m['cod']}-{m['slug']}"]
    else:
        carpetas = sorted(p for p in PROCESSED.iterdir() if p.is_dir())
    todos = [f for c in carpetas for f in verificar(c)]
    for f in todos:
        print("  FALLO:", f)
    sys.exit(1 if todos else 0)
