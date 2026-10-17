"""¿Está hecha o no? Completa el estado de las zonas verdes y equipamientos del planeamiento que no lo traen.

El planeamiento (redes públicas de la IDEM) solo dice "existente" o "prevista" en el nombre de algunas redes; el resto
queda "sin_dato" y en la web salía como "En el planeamiento", que no aclara nada. Se cruza cada una con el suelo
vacante y ocupado de la IDEM (catastro, parcela a parcela): si la mayor parte de su superficie cae en parcelas
ocupadas, está hecha ("existente"); si cae en parcelas vacantes, es suelo reservado aún sin hacer ("vacante").

Uso: python etl/redes_catastro.py   (después de procesar_idem; reescribe redes.geojson de cada municipio)
"""
import json

import geopandas as gpd
import pandas as pd

from comun import PROCESSED, RAW, solo_poligonos

M = 25830


def procesar(carpeta) -> dict:
    f = carpeta / "redes.geojson"
    raw = RAW / "idem" / carpeta.name / "IDEM_VPLA_SVAC_SOCU_26.geojson"
    if not f.exists() or not raw.exists():
        return {}
    redes = gpd.read_file(f)
    if redes.empty or "estado" not in redes:
        return {}
    dudosas = redes.index[redes["estado"] == "sin_dato"]
    if not len(dudosas):
        return {}
    svac = gpd.read_file(raw)
    svac = svac[svac["DS_OCUPACION"].isin(["Ocupado", "Vacante"])].to_crs(M)
    svac["geometry"] = solo_poligonos(svac.geometry)
    r = redes.loc[dudosas].to_crs(M)
    r["geometry"] = solo_poligonos(r.geometry)
    r["rid"] = r.index
    cruce = gpd.overlay(r[["rid", "geometry"]], svac[["DS_OCUPACION", "geometry"]], how="intersection", keep_geom_type=True)
    if cruce.empty:
        return {}
    cruce["a"] = cruce.geometry.area
    sup = cruce.pivot_table(index="rid", columns="DS_OCUPACION", values="a", aggfunc="sum", fill_value=0)
    for c in ("Ocupado", "Vacante"):
        if c not in sup:
            sup[c] = 0.0
    total = r.geometry.area.reindex(sup.index)
    cubierto = (sup["Ocupado"] + sup["Vacante"]) / total
    nuevo = pd.Series("sin_dato", index=sup.index)
    nuevo[(cubierto >= 0.3) & (sup["Ocupado"] >= sup["Vacante"])] = "existente"
    nuevo[(cubierto >= 0.3) & (sup["Vacante"] > sup["Ocupado"])] = "vacante"
    redes.loc[nuevo.index, "estado"] = nuevo
    redes["estado_fuente"] = None
    redes.loc[nuevo.index[nuevo != "sin_dato"], "estado_fuente"] = "catastro"
    f.write_text(redes.to_json(drop_id=True, ensure_ascii=False), encoding="utf-8")
    return nuevo.value_counts().to_dict()


def main():
    tot = {}
    for carpeta in sorted(d for d in PROCESSED.iterdir() if d.is_dir() and d.name[:3].isdigit()):
        for k, v in procesar(carpeta).items():
            tot[k] = tot.get(k, 0) + v
    print("redes sin estado resueltas con el catastro:", json.dumps(tot))


if __name__ == "__main__":
    main()
