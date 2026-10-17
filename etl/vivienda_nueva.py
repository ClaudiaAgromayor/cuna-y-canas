"""Dónde se puede construir vivienda nueva: solares residenciales vacantes de cada municipio.

Fuente: IDEM, capa de suelo vacante y ocupado 2026 (IDEM_VPLA_SVAC_SOCU_26), parcela a parcela con datos del catastro:
uso (residencial unifamiliar, multifamiliar…) y ocupación (ocupado o vacante). Cubre todos los municipios,
también los que no tienen su planeamiento en la base refundida (p. ej. Boadilla del Monte).

Escribe <carpeta del municipio>/vivienda_nueva.geojson y añade la capa al índice (municipios.json).
Uso: python etl/vivienda_nueva.py            (todos los municipios ya procesados)
"""
import json

import geopandas as gpd

from comun import PROCESSED, RAW, solo_poligonos

M = 25830


def procesar(carpeta) -> int:
    raw = RAW / "idem" / carpeta.name / "IDEM_VPLA_SVAC_SOCU_26.geojson"
    salida = carpeta / "vivienda_nueva.geojson"
    if not raw.exists():
        salida.write_text('{"type":"FeatureCollection","features":[]}', encoding="utf-8")
        return 0
    g = gpd.read_file(raw)
    if g.empty or "DS_USO" not in g:
        salida.write_text('{"type":"FeatureCollection","features":[]}', encoding="utf-8")
        return 0
    g = g[g["DS_USO"].fillna("").str.startswith("Residencial") & (g["DS_OCUPACION"] == "Vacante")]
    if g.empty:
        salida.write_text('{"type":"FeatureCollection","features":[]}', encoding="utf-8")
        return 0
    g = g.to_crs(M)
    g["geometry"] = solo_poligonos(g.geometry)
    g = g[~g.geometry.is_empty]
    g["area_m2"] = g.geometry.area.round()
    g = g[g["area_m2"] >= 100]  # fuera retales y restos de parcela
    g["geometry"] = g.geometry.simplify(1.5)
    out = gpd.GeoDataFrame({"uso": g["DS_USO"], "ref_catastral": g["CD_REF_CAT"], "area_m2": g["area_m2"],
                            "cod_ine": carpeta.name[:3]}, geometry=g.geometry, crs=M).to_crs(4326)
    out["geometry"] = solo_poligonos(out.geometry.set_precision(1e-6, mode="pointwise"))  # el redondeo puede dejar geometrías inválidas
    out = out[~out.geometry.is_empty]
    salida.write_text(out.to_json(drop_id=True, ensure_ascii=False), encoding="utf-8")
    return len(out)


def main():
    indice_f = PROCESSED / "municipios.json"
    indice = json.loads(indice_f.read_text(encoding="utf-8"))
    total = 0
    for carpeta in sorted(d for d in PROCESSED.iterdir() if d.is_dir() and d.name[:3].isdigit()):
        n = procesar(carpeta)
        total += n
        for m in indice["municipios"] if isinstance(indice, dict) else indice:
            if m.get("cod_ine") == carpeta.name[:3]:
                m.setdefault("capas", {})["vivienda_nueva"] = n > 0
    indice_f.write_text(json.dumps(indice, ensure_ascii=False), encoding="utf-8")
    print(f"solares residenciales vacantes: {total}")

    # recuento por municipio en el resumen de "¿Dónde vivir?" y de la portada
    res_f = PROCESSED / "municipios_resumen.json"
    res = json.loads(res_f.read_text(encoding="utf-8"))
    carpetas = {d.name[:3]: d for d in PROCESSED.iterdir() if d.is_dir() and d.name[:3].isdigit()}
    for m in res["municipios"]:
        d = carpetas.get(m["cod_ine"])
        leer = lambda f: json.loads((d / f).read_text(encoding="utf-8"))["features"] if d and (d / f).exists() else []
        sol = leer("vivienda_nueva.geojson")
        m["solares_vivienda"] = len(sol)
        m["solares_vivienda_m2"] = round(sum(x["properties"]["area_m2"] for x in sol))
        m["suelo_publico_vivienda"] = sum(1 for x in leer("portal_suelo.geojson") if str(x["properties"].get("uso") or "").startswith("Resid"))
    res_f.write_text(json.dumps(res, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    main()
