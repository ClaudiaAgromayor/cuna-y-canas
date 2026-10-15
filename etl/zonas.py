"""Zonas básicas de salud de un municipio, construidas a partir de sus secciones censales.

Uso: python etl/zonas.py MUNICIPIO        (nombre o código INE de 3 dígitos)

Cada sección de la IDEM trae su código de zona básica de salud (CDTZONASAL, 6 dígitos). Ese código no coincide
con la numeración del dataset CKAN `covid19_tia_zonas_basicas_salud` (3 dígitos), así que el nombre se asigna
por geometría: la zona del SHP de CKAN con la que más se solapa.
Necesita antes `secciones.py` y `descargar_ckan.py`.
Genera data/processed/<cod>-<slug>/zonas_salud.geojson con población (INE 2023), centros de salud y habitantes por centro.
"""
import sys
import zipfile

import geopandas as gpd

from comun import RAW_CKAN, carpeta_salida, resolver_municipio, solo_poligonos

M = 25830


def shp_zonas() -> gpd.GeoDataFrame:
    dest = RAW_CKAN / "zonas_basicas_salud"
    shp = next(dest.rglob("*.shp"), None)
    if shp is None:
        import json
        import urllib.request
        with urllib.request.urlopen("https://datos.comunidad.madrid/api/3/action/package_show?id=covid19_tia_zonas_basicas_salud", timeout=60) as r:
            url = next(x["url"] for x in json.load(r)["result"]["resources"] if x["format"].upper() == "SHP")
        dest.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(url, timeout=300) as r:
            (dest / "zonas.zip").write_bytes(r.read())
        zipfile.ZipFile(dest / "zonas.zip").extractall(dest)
        shp = next(dest.rglob("*.shp"))
    g = gpd.read_file(shp).to_crs(M)
    g["geometry"] = solo_poligonos(g.geometry)
    return g.rename(columns={"zona_basic": "nombre", "codigo_geo": "codigo_ckan", "pob_pad19": "poblacion_2019"})


def procesar(muni: dict) -> dict:
    out = carpeta_salida(muni)
    ctrl: dict = {}
    sec = gpd.read_file(out / "secciones.geojson").to_crs(M)
    sec["geometry"] = solo_poligonos(sec.geometry)
    z = sec.dissolve(by="zona_salud", aggfunc={"poblacion": "sum", "pct_menores18": "mean", "pct_mayores65": "mean", "cod_seccion": "count"}).reset_index()
    z = z.rename(columns={"zona_salud": "codigo", "poblacion": "poblacion_2023", "cod_seccion": "secciones"})
    ctrl["zonas_salud"] = len(z)

    ref = shp_zonas()
    inter = gpd.overlay(z[["codigo", "geometry"]], ref[["nombre", "codigo_ckan", "geometry"]], how="intersection", keep_geom_type=False)
    inter["a"] = inter.geometry.area
    inter = inter.sort_values("a", ascending=False).drop_duplicates("codigo")
    z = z.merge(inter[["codigo", "nombre", "codigo_ckan"]], on="codigo", how="left")
    z["frac_nombre"] = (z.merge(inter[["codigo", "a"]], on="codigo")["a"] / z.geometry.area).round(2)
    ctrl["zonas_sin_nombre"] = int(z["nombre"].isna().sum())

    # centros de salud de atención primaria dentro de cada zona
    cs = gpd.read_file(out / "centros_sanitarios.geojson").to_crs(M)
    cs = cs[cs["tipo"] == "Centro de salud"]
    j = gpd.sjoin(cs[["registro", "geometry"]], z[["codigo", "geometry"]], predicate="within")
    z["centros_salud"] = z["codigo"].map(j.groupby("codigo").size()).fillna(0).astype(int)
    z["hab_por_centro"] = (z["poblacion_2023"] / z["centros_salud"].where(z["centros_salud"] > 0)).round()
    ctrl["centros_salud_ubicados"] = int(len(j))
    ctrl["centros_salud_municipio"] = int(len(cs))

    z["cod_ine"] = muni["cod"]
    z["poblacion_2023"] = z["poblacion_2023"].round()
    z["pct_menores18"] = z["pct_menores18"].round(1)
    z["pct_mayores65"] = z["pct_mayores65"].round(1)
    z["geometry"] = z.geometry.simplify(3, preserve_topology=True)
    z = z.to_crs(4326)
    z["geometry"] = solo_poligonos(z.geometry.set_precision(1e-6, mode="pointwise"))
    (out / "zonas_salud.geojson").write_text(z.to_json(drop_id=True, ensure_ascii=False), encoding="utf-8")
    ctrl["zonas"] = {r.nombre or r.codigo: {"hab": int(r.poblacion_2023), "centros": int(r.centros_salud)} for r in z.itertuples()}
    return ctrl


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    m = resolver_municipio(sys.argv[1])
    print(f"Municipio: {m['nombre']} (INE {m['cod']})")
    for k, v in procesar(m).items():
        print(f"  {k:26s} {v}")
