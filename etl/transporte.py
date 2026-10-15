"""Paradas y estaciones de transporte público de un municipio (Consorcio Regional de Transportes de Madrid).

Uso: python etl/transporte.py MUNICIPIO        (nombre o código INE de 3 dígitos)

Fuente: servicios de datos abiertos del CRTM en ArcGIS (capa "Estaciones" de cada red), filtrados por
provincia (28) y CODIGOMUNICIPIO: el número de municipio se repite entre provincias (28096 Navalcarnero y
13096 Villarrubia de los Ojos comparten "096", y hay líneas del Consorcio que llegan a Ciudad Real).
Redes: autobuses interurbanos (M8), autobuses urbanos de los municipios (M9),
Cercanías (M5), Metro (M4) y Metro Ligero (M10).
Genera data/processed/<cod>-<slug>/paradas.geojson
"""
import json
import sys
import urllib.parse
import urllib.request

import geopandas as gpd
import pandas as pd

from comun import RAW, carpeta_salida, resolver_municipio

BASE = "https://services5.arcgis.com/UxADft6QPcvFyDU1/arcgis/rest/services"
REDES = {"M8_Red": "interurbano", "M9_Red": "urbano", "M5_Red": "cercanias", "M4_Red": "metro", "M10_Red": "metro_ligero"}
CAMPOS = "IDESTACION,MODO,CODIGOESTACION,DENOMINACION,SITUACION,CODIGOPROVINCIA,CODIGOMUNICIPIO,GRADOACCESIBILIDAD,LINEAS,FECHAACTUAL"


def consultar(servicio: str, cod: str) -> list[dict]:
    feats, offset = [], 0
    while True:
        # el número de municipio se repite entre provincias: hay que filtrar también por provincia
        params = {"where": f"CODIGOPROVINCIA='28' AND CODIGOMUNICIPIO='{cod}'", "outFields": CAMPOS, "outSR": 4326,
                  "f": "geojson", "resultOffset": offset, "resultRecordCount": 1000}
        req = urllib.request.Request(f"{BASE}/{servicio}/FeatureServer/0/query?{urllib.parse.urlencode(params)}",
                                     headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=120) as r:
            lote = json.load(r).get("features", [])
        feats += lote
        if len(lote) < 1000:
            return feats
        offset += 1000


def procesar(muni: dict) -> dict:
    out = carpeta_salida(muni)
    raw_dir = RAW / "crtm" / f"{muni['cod']}-{muni['slug']}"
    raw_dir.mkdir(parents=True, exist_ok=True)
    ctrl: dict = {}
    partes = []
    for servicio, modo in REDES.items():
        feats = consultar(servicio, muni["cod"])
        (raw_dir / f"{servicio}_estaciones.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": feats}, ensure_ascii=False), encoding="utf-8")
        ctrl[f"paradas_{modo}"] = len(feats)
        if feats:
            g = gpd.GeoDataFrame.from_features(feats, crs=4326)
            g["modo"] = modo
            partes.append(g)
    if not partes:
        ctrl["paradas_guardadas"] = 0
        return ctrl
    g = pd.concat(partes, ignore_index=True)
    otros = set(g["CODIGOMUNICIPIO"].unique()) - {muni["cod"]}
    if otros:
        raise SystemExit(f"Paradas de otros municipios: {otros}")
    g = g.rename(columns={"IDESTACION": "id", "DENOMINACION": "nombre", "SITUACION": "situacion",
                          "GRADOACCESIBILIDAD": "accesibilidad", "LINEAS": "lineas", "FECHAACTUAL": "fecha_dato"})
    g["n_lineas"] = g["lineas"].fillna("").map(lambda s: len([x for x in str(s).replace(";", ",").split(",") if x.strip()]))
    # una misma parada física puede servir a varias redes (interurbanos y urbanos) con el mismo identificador:
    # se fusiona en un solo elemento con todas sus líneas, y como modo principal el de mayor capacidad
    ctrl["paradas_compartidas_entre_redes"] = int(g["id"].duplicated().sum())
    prioridad = {m: i for i, m in enumerate(["metro", "cercanias", "metro_ligero", "interurbano", "urbano"])}
    g["_p"] = g["modo"].map(prioridad)
    g = g.sort_values(["id", "_p"])
    g["lineas"] = g["modo"] + ": " + g["lineas"].fillna("—").astype(str)
    g = g.groupby("id", sort=False).agg(modo=("modo", "first"), modos=("modo", lambda m: ", ".join(dict.fromkeys(m))), nombre=("nombre", "first"),
                                         situacion=("situacion", "first"), accesibilidad=("accesibilidad", "first"),
                                         lineas=("lineas", "; ".join), n_lineas=("n_lineas", "sum"), fecha_dato=("fecha_dato", "first"),
                                         geometry=("geometry", "first")).reset_index()
    g["cod_ine"] = muni["cod"]
    g = gpd.GeoDataFrame(g[["id", "modo", "modos", "nombre", "situacion", "accesibilidad", "lineas", "n_lineas", "fecha_dato", "cod_ine", "geometry"]], crs=4326)
    g["geometry"] = g.geometry.set_precision(1e-6)
    (out / "paradas.geojson").write_text(g.to_json(drop_id=True, ensure_ascii=False), encoding="utf-8")
    ctrl["paradas_guardadas"] = len(g)
    ctrl["paradas_situacion"] = g["situacion"].value_counts(dropna=False).to_dict()
    return ctrl


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    m = resolver_municipio(sys.argv[1])
    print(f"Municipio: {m['nombre']} (INE {m['cod']})")
    for k, v in procesar(m).items():
        print(f"  {k:30s} {v}")
