"""Secciones censales de un municipio con su población y estructura por edad (2015-2023).

Uso: python etl/secciones.py MUNICIPIO        (nombre o código INE de 3 dígitos)

Fuentes:
  - Geometría: IDEM, capa UnidadesAdministrativas:IDEM_GDIE_G_SECCION (WFS). Trae además el código de
    zona básica de salud (CDTZONASAL) y de zona de servicios sociales (CDTZONASS) de cada sección.
  - Indicadores: INE, Atlas de Distribución de Renta de los Hogares, tabla 31105 (provincia de Madrid):
    población, % menores de 18, % 65 y más, tamaño medio del hogar, % hogares unipersonales, edad media.

Necesita antes `procesar_idem.py` (usa ambitos.geojson para asignar cada sección a un ámbito).
Genera en data/processed/<cod>-<slug>/:
  secciones.geojson         una sección por elemento, con los indicadores del último año y su ámbito
  secciones_series.json     serie anual por sección y por ámbito (base de la prueba con el pasado)
"""
import json
import sys
import urllib.parse
import urllib.request

import geopandas as gpd
import pandas as pd

from comun import RAW, carpeta_salida, resolver_municipio, solo_poligonos

WFS = "https://idem.comunidad.madrid/geoidem/UnidadesAdministrativas/wfs"
INE_31105 = "https://www.ine.es/jaxiT3/files/t/es/csv_bdsc/31105.csv?nocab=1"
RAW_INE = RAW / "ine" / "adrh_demograficos_madrid_31105.csv"
M = 25830
FRAC_MIN = 0.05  # solapes menores (bordes mal casados entre capas) no cuentan

INDICADORES = {
    "Población": "poblacion",
    "Porcentaje de población menor de 18 años": "pct_menores18",
    "Porcentaje de población de 65 y más años": "pct_mayores65",
    "Tamaño medio del hogar": "tam_hogar",
    "Porcentaje de hogares unipersonales": "pct_unipersonales",
    "Edad media de la población": "edad_media",
}


def descargar_secciones(muni: dict) -> gpd.GeoDataFrame:
    destino = RAW / "idem" / f"{muni['cod']}-{muni['slug']}" / "IDEM_GDIE_G_SECCION.geojson"
    if not destino.exists():
        destino.parent.mkdir(parents=True, exist_ok=True)
        params = {"service": "WFS", "version": "2.0.0", "request": "GetFeature",
                  "typeNames": "UnidadesAdministrativas:IDEM_GDIE_G_SECCION", "outputFormat": "application/json",
                  "srsName": "EPSG:4326", "CQL_FILTER": f"CDMUNI='{muni['cod']}'"}
        with urllib.request.urlopen(f"{WFS}?{urllib.parse.urlencode(params)}", timeout=300) as r:
            destino.write_bytes(r.read())
    g = gpd.read_file(destino)
    if set(g["CDMUNI"].unique()) != {muni["cod"]}:
        raise SystemExit(f"La capa de secciones trae otros municipios: {set(g['CDMUNI'].unique())}")
    return g


def leer_ine(muni: dict) -> pd.DataFrame:
    if not RAW_INE.exists():
        RAW_INE.parent.mkdir(parents=True, exist_ok=True)
        req = urllib.request.Request(INE_31105, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=600) as r:
            RAW_INE.write_bytes(r.read())
    d = pd.read_csv(RAW_INE, sep=";", dtype=str, encoding="utf-8-sig")
    d.columns = ["municipio", "distrito", "seccion", "indicador", "anio", "valor"]
    d = d[d["municipio"].str.startswith(f"28{muni['cod']} ")]
    d = d[d["seccion"].notna() & d["indicador"].isin(INDICADORES)]
    # formato español: 174.480 -> 174480 ; 41,2 -> 41.2
    d["valor"] = pd.to_numeric(d["valor"].str.replace(".", "", regex=False).str.replace(",", ".", regex=False), errors="coerce")
    d["cod_seccion"] = d["seccion"].str[:10]  # 2806501002 = provincia(2) municipio(3) distrito(2) sección(3)
    d["indicador"] = d["indicador"].map(INDICADORES)
    d["anio"] = d["anio"].astype(int)
    return d.pivot_table(index=["cod_seccion", "anio"], columns="indicador", values="valor").reset_index()


def procesar(muni: dict) -> dict:
    out = carpeta_salida(muni)
    ctrl: dict = {}
    g = descargar_secciones(muni).to_crs(M)
    g["cod_seccion"] = "28" + g["CDTSECCION"]
    ctrl["secciones_idem"] = len(g)
    ine = leer_ine(muni)
    ultimo = int(ine["anio"].max())
    ctrl["ine_ultimo_anio"] = ultimo
    ctrl["secciones_ine_ultimo_anio"] = int((ine["anio"] == ultimo).sum())
    ult = ine[ine["anio"] == ultimo].drop(columns="anio")
    g = g.merge(ult, on="cod_seccion", how="left")
    ctrl["secciones_idem_sin_dato_ine"] = int(g["poblacion"].isna().sum())  # el seccionado cambia de un año a otro

    # reparto por áreas: cada sección aporta a un ámbito la fracción de su superficie que cae dentro
    g["geometry"] = solo_poligonos(g.geometry)
    amb = gpd.read_file(out / "ambitos.geojson").to_crs(M)[["nombre", "geometry"]]
    amb["geometry"] = solo_poligonos(amb.geometry)
    g["area"] = g.geometry.area
    inter = gpd.overlay(g[["cod_seccion", "area", "geometry"]], amb, how="intersection", keep_geom_type=False)
    inter["frac"] = inter.geometry.area / inter["area"]
    inter = inter[inter["frac"] >= FRAC_MIN][["cod_seccion", "nombre", "frac"]]
    mejor = inter.sort_values("frac", ascending=False).drop_duplicates("cod_seccion")
    g = g.merge(mejor.rename(columns={"nombre": "ambito", "frac": "frac_en_ambito"}), on="cod_seccion", how="left")
    g["frac_en_ambito"] = g["frac_en_ambito"].round(2)
    ctrl["secciones_que_tocan_algun_ambito"] = int(g["ambito"].notna().sum())

    g = g.rename(columns={"CDTZONASAL": "zona_salud", "CDTZONASS": "zona_servicios_sociales", "CDDISTRITO": "distrito"})
    cols = ["cod_seccion", "distrito", "zona_salud", "zona_servicios_sociales", "ambito", "frac_en_ambito", *INDICADORES.values()]
    s = g[cols + ["geometry"]].copy()
    s["sup_ha"] = (g["area"] / 1e4).round(1)
    s["densidad_hab_ha"] = (s["poblacion"] / s["sup_ha"]).round(1)
    s["cod_ine"] = muni["cod"]
    s["geometry"] = s.geometry.simplify(2, preserve_topology=True)
    s = s.to_crs(4326)
    s["geometry"] = solo_poligonos(s.geometry.set_precision(1e-6, mode="pointwise"))
    (out / "secciones.geojson").write_text(s.to_json(drop_id=True, ensure_ascii=False), encoding="utf-8")

    # series por ámbito: población repartida por áreas (supone densidad uniforme dentro de cada sección)
    por_ambito = {}
    x = ine.merge(inter, on="cod_seccion")
    for (amb_n, anio), d in x.dropna(subset=["poblacion"]).groupby(["nombre", "anio"]):
        p = d["poblacion"] * d["frac"]
        por_ambito.setdefault(amb_n, {})[int(anio)] = {
            "poblacion": int(round(p.sum())), "secciones": len(d),
            "secciones_enteras": int((d["frac"] >= 0.95).sum()),
            "menores18": int(round((p * d["pct_menores18"] / 100).sum())),
            "mayores65": int(round((p * d["pct_mayores65"] / 100).sum())),
            "tam_hogar": round(float((p * d["tam_hogar"]).sum() / p.sum()), 2) if p.sum() else None,
        }
    series = {"cod_ine": muni["cod"], "fuente": "INE, Atlas de Distribución de Renta de los Hogares (tabla 31105)",
              "nota": "Población de cada ámbito repartida por áreas: cada sección aporta la fracción de su superficie que cae "
                      "dentro (supone densidad uniforme en la sección). El seccionado cambia entre años: una sección puede no "
                      "existir todos los años.",
              "por_ambito": por_ambito,
              "por_seccion": {cs: {int(r.anio): {k: (None if pd.isna(getattr(r, k)) else float(getattr(r, k))) for k in INDICADORES.values()}
                                   for r in d.itertuples()} for cs, d in ine.groupby("cod_seccion")}}
    (out / "secciones_series.json").write_text(json.dumps(series, ensure_ascii=False), encoding="utf-8")
    ctrl["ambitos_con_serie"] = len(por_ambito)
    return ctrl


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    m = resolver_municipio(sys.argv[1])
    print(f"Municipio: {m['nombre']} (INE {m['cod']})")
    for k, v in procesar(m).items():
        print(f"  {k:40s} {v}")
