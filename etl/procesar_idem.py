"""Procesa las capas brutas de la IDEM de un municipio y deja las capas ligeras que lee la web.

Uso: python etl/procesar_idem.py MUNICIPIO        (nombre o código INE de 3 dígitos)
     python etl/procesar_idem.py Getafe

Si las capas brutas no están, se descargan antes (etl/descargar_idem.py).
Genera en data/processed/<cod>-<slug>/:
  ambitos.geojson           ámbitos de planeamiento (uno por ámbito) con viviendas previstas
  redes.geojson             dotaciones públicas del planeamiento (educativas, sanitarias, asistenciales, deportivas...)
  parcelas_vacantes.geojson parcelas vacantes de uso equipamiento: las candidatas a nuevo centro
  portal_suelo.geojson      parcelas del Portal del Suelo
  resumen_ambitos.json      por ámbito: viviendas y % de suelo ocupado/vacante ponderado por superficie
  _control_idem.json        recuentos y descartes de cada paso
"""
import json
import sys

import geopandas as gpd
import numpy as np
import pandas as pd

from comun import carpeta_salida, resolver_municipio, solo_poligonos
from descargar_idem import carpeta_raw, descargar

M = 25830            # CRS métrico (ETRS89 / UTM 30N) para medir superficies y simplificar
TOL_M = 1.0          # tolerancia de simplificación de geometrías, en metros
TOL_ZV_M = 4.0       # las zonas verdes son enormes y no necesitan tanto detalle
AREA_MIN_M2 = 50     # por debajo son astillas del catastro, no parcelas utilizables

TIPOS_RED = {"Educativos": "educativo", "Sanitarios": "sanitario", "Asistenciales": "asistencial",
             "Deportivos": "deportivo", "Culturales": "cultural",
             "Parques Municipales y Urbanos": "zona_verde", "Jardines y Plazas": "zona_verde"}


def leer(muni: dict, capa: str) -> gpd.GeoDataFrame:
    g = gpd.read_file(carpeta_raw(muni) / f"{capa}.geojson", encoding="utf-8")
    if g.empty or "CD_MUNICIPIO" not in g:  # capa sin elementos en este municipio
        return gpd.GeoDataFrame({"CD_MUNICIPIO": []}, geometry=[], crs=M)
    cods = set(g["CD_MUNICIPIO"].unique())
    if cods - {muni["cod"]}:  # comprobación anti-mezcla de municipios
        raise SystemExit(f"{capa} contiene otros municipios: {cods}")
    return g.to_crs(M)


def reparar(g: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Repara geometrías inválidas (autointersecciones, anillos degenerados) sin tocar las válidas."""
    g = g.copy()
    malas = ~g.geometry.is_valid
    g.loc[malas, "geometry"] = g.geometry[malas].make_valid(method="structure", keep_collapsed=False)
    return g[~g.geometry.is_empty]


def guardar(g: gpd.GeoDataFrame, ruta, muni: dict, tol: float = TOL_M) -> int:
    g = g.copy()
    g["geometry"] = solo_poligonos(g.geometry.simplify(tol, preserve_topology=True))
    g = g[~g.geometry.is_empty]
    g["cod_ine"] = muni["cod"]
    g = g.to_crs(4326)
    g["geometry"] = solo_poligonos(g.geometry.set_precision(1e-6, mode="pointwise"))  # ~10 cm: aligera sin reconstruir la topología
    g = g[~g.geometry.is_empty]
    ruta.write_text(g.to_json(drop_id=True, ensure_ascii=False), encoding="utf-8")
    return len(g)


def num(serie) -> pd.Series:
    return pd.to_numeric(serie, errors="coerce")


VACIO = '{"type": "FeatureCollection", "features": []}'


def ambitos(muni, ctrl):
    raw = leer(muni, "VPLA_V_AMBITO_REF_25")
    ctrl["ambitos_poligonos_brutos"] = len(raw)
    if raw.empty:  # municipio sin ámbitos de desarrollo en el planeamiento refundido
        (carpeta_salida(muni) / "ambitos.geojson").write_text(VACIO, encoding="utf-8")
        ctrl["ambitos"] = 0
        return gpd.GeoDataFrame({"nombre": [], "viviendas": [], "clase_suelo": []}, geometry=[], crs=M)
    ctrl["ambitos_geometrias_invalidas_reparadas"] = int((~raw.geometry.is_valid).sum())
    raw = reparar(raw)
    raw["viv"] = num(raw["NM_VIV_TOT"])
    # un ámbito puede venir en varios polígonos con los mismos datos: se disuelve por nombre y no se suman las viviendas
    discrepantes = raw.groupby("DS_NOMB_AMB")["viv"].nunique()
    ctrl["ambitos_con_viviendas_discrepantes_entre_poligonos"] = discrepantes[discrepantes > 1].index.tolist()
    g = raw.dissolve(by="DS_NOMB_AMB", aggfunc={
        "DS_CLAS_SUE": "first", "viv": "max", "NM_VIV_PROT": "max", "NM_S_RL_EQU": "max", "NM_S_RG_EQU": "max",
        "NM_S_SL_EQU": "max", "NM_C_ED": "max"}).reset_index()
    g = g.rename(columns={"DS_NOMB_AMB": "nombre", "DS_CLAS_SUE": "clase_suelo", "viv": "viviendas",
                          "NM_VIV_PROT": "viviendas_protegidas", "NM_S_RL_EQU": "red_local_equip_m2",
                          "NM_S_RG_EQU": "red_general_equip_m2", "NM_S_SL_EQU": "sistema_local_equip_m2",
                          "NM_C_ED": "coef_edificabilidad"})
    g["sup_m2"] = g.geometry.area.round()
    for c in ("viviendas_protegidas", "red_local_equip_m2", "red_general_equip_m2", "sistema_local_equip_m2", "coef_edificabilidad"):
        g[c] = num(g[c])
    ctrl["ambitos"] = len(g)
    ctrl["ambitos_sin_viviendas"] = int(g["viviendas"].isna().sum())
    ctrl["ambitos_guardados"] = guardar(g, carpeta_salida(muni) / "ambitos.geojson", muni)
    return g


def redes(muni, ctrl):
    raw = leer(muni, "VPLA_V_RED_REF_25")
    if raw.empty:
        (carpeta_salida(muni) / "redes.geojson").write_text(VACIO, encoding="utf-8")
        ctrl["redes_guardadas"] = 0
        return raw
    ctrl["redes_geometrias_invalidas_reparadas"] = int((~raw.geometry.is_valid).sum())
    raw = reparar(raw)
    g = raw[(raw["DS_USO_GLOBAL"] == "Equipamientos") & raw["DS_USO_DETA"].isin(TIPOS_RED)].copy()
    ctrl["redes_brutas"], ctrl["redes_dotacionales"] = len(raw), len(g)
    g["tipo"] = g["DS_USO_DETA"].map(TIPOS_RED)
    nombre = g["DS_NOMB_RED"].fillna("")
    # el estado solo está en el nombre de la red ("RED GENERAL EXISTENTE ..."); muchas no lo traen
    g["estado"] = np.select([nombre.str.contains(r"\bEXISTENTE\b"), nombre.str.contains(r"\bPREVISTA\b")], ["existente", "prevista"], "sin_dato")
    g["sup_m2"] = g.geometry.area.round()
    g = g.rename(columns={"DS_TIPO": "red", "DS_NOMB_AMB": "ambito", "DS_NOMB_RED": "nombre_red"})[["tipo", "red", "estado", "ambito", "nombre_red", "sup_m2", "geometry"]]
    ctrl["redes_por_tipo_y_estado"] = {f"{t}/{e}": int(n) for (t, e), n in g.groupby(["tipo", "estado"]).size().items()}
    zv = g["tipo"] == "zona_verde"
    ruta = carpeta_salida(muni) / "redes.geojson"
    resto = guardar(g[~zv], ruta.with_name("_tmp_redes.geojson"), muni)
    verdes = guardar(g[zv], ruta.with_name("_tmp_zv.geojson"), muni, TOL_ZV_M)
    partes = [gpd.read_file(ruta.with_name(n)) for n in ("_tmp_redes.geojson", "_tmp_zv.geojson")]
    ruta.write_text(pd.concat(partes, ignore_index=True).pipe(gpd.GeoDataFrame, crs=4326).to_json(drop_id=True, ensure_ascii=False), encoding="utf-8")
    for n in ("_tmp_redes.geojson", "_tmp_zv.geojson"):
        ruta.with_name(n).unlink()
    ctrl["redes_guardadas"] = resto + verdes
    return g


def suelo(muni, ambitos_g, ctrl):
    """Parcelas vacantes de equipamiento y resumen por ámbito."""
    raw = leer(muni, "IDEM_VPLA_SVAC_SOCU_26")
    ctrl["suelo_parcelas_brutas"] = len(raw)
    if raw.empty:
        out = carpeta_salida(muni)
        (out / "parcelas_vacantes.geojson").write_text(VACIO, encoding="utf-8")
        (out / "resumen_ambitos.json").write_text(json.dumps({"cod_ine": muni["cod"], "ambitos": []}), encoding="utf-8")
        return
    ctrl["suelo_geometrias_invalidas_reparadas"] = int((~raw.geometry.is_valid).sum())
    raw = raw.copy()
    malas = ~raw.geometry.is_valid
    raw.loc[malas, "geometry"] = raw.geometry[malas].make_valid(method="structure", keep_collapsed=False)
    raw["area_m2"] = raw.geometry.area  # NM_AREA viene vacío en la capa: se calcula
    raw["grupo"] = np.where(raw["DS_USO"].str.startswith("Residencial"), "residencial", raw["DS_USO"].str.lower())

    # asignar cada parcela a un ámbito por su punto representativo (sin duplicar si hay ámbitos solapados)
    pts = raw[["geometry"]].copy()
    pts["geometry"] = raw.geometry.representative_point()
    j = gpd.sjoin(pts, ambitos_g[["nombre", "geometry"]], how="left", predicate="within")
    ctrl["suelo_parcelas_en_ambitos_solapados"] = int(j.index.duplicated().sum())
    raw["ambito"] = j[~j.index.duplicated(keep="first")]["nombre"]

    # resumen por ámbito, ponderado por superficie
    filas = []
    for nombre, d in raw.dropna(subset=["ambito"]).groupby("ambito"):
        sup = d.groupby(["grupo", "DS_OCUPACION"])["area_m2"].sum()
        def m2(grupo, ocup): return float(sup.get((grupo, ocup), 0.0))
        def pct(grupo):
            vac, ocu = m2(grupo, "Vacante"), m2(grupo, "Ocupado")
            return None if vac + ocu == 0 else round(100 * vac / (vac + ocu), 1)
        a = ambitos_g[ambitos_g["nombre"] == nombre].iloc[0]
        filas.append({"ambito": nombre, "viviendas_previstas": None if pd.isna(a["viviendas"]) else int(a["viviendas"]),
                      "residencial_ocupado_m2": round(m2("residencial", "Ocupado")), "residencial_vacante_m2": round(m2("residencial", "Vacante")),
                      "equipamiento_ocupado_m2": round(m2("equipamiento", "Ocupado")), "equipamiento_vacante_m2": round(m2("equipamiento", "Vacante")),
                      "pct_residencial_vacante": pct("residencial"), "pct_equipamiento_vacante": pct("equipamiento"),
                      "parcelas_equipamiento_vacantes": int(((d["grupo"] == "equipamiento") & (d["DS_OCUPACION"] == "Vacante")).sum())})
    filas.sort(key=lambda f: -(f["viviendas_previstas"] or 0))
    (carpeta_salida(muni) / "resumen_ambitos.json").write_text(
        json.dumps({"cod_ine": muni["cod"], "fuente": "IDEM suelo vacante y ocupado 2026 y planeamiento refundido 2025", "ambitos": filas}, ensure_ascii=False, indent=1), encoding="utf-8")
    ctrl["resumen_ambitos"] = len(filas)

    # candidatas: equipamiento vacante
    v = raw[(raw["DS_USO"] == "Equipamiento") & (raw["DS_OCUPACION"] == "Vacante")].copy()
    ctrl["candidatas_vacantes_equipamiento"] = len(v)
    ctrl["candidatas_sin_superficie_en_origen"] = int((v["area_m2"] == 0).sum())  # polígono degenerado en la IDEM: solo conservan su posición
    pequenas = v["area_m2"] < AREA_MIN_M2
    ctrl[f"candidatas_descartadas_menores_de_{AREA_MIN_M2}_m2"] = int(pequenas.sum())
    v = v[~pequenas]
    v["area_m2"] = v["area_m2"].round()
    ctrl["candidatas_duplicadas_por_referencia_catastral"] = int(v["CD_REF_CAT"].duplicated().sum())
    cen = v.geometry.representative_point().to_crs(4326)
    v["lon"], v["lat"] = cen.x.round(6), cen.y.round(6)
    v = v.rename(columns={"CD_REF_CAT": "ref_catastral", "FC_FECHA_ALTA": "fecha_alta"})
    v["fecha_alta"] = v["fecha_alta"].astype(str).str[:10]
    ctrl["candidatas_guardadas"] = guardar(v[["ref_catastral", "area_m2", "ambito", "fecha_alta", "lon", "lat", "geometry"]], carpeta_salida(muni) / "parcelas_vacantes.geojson", muni)
    ctrl["candidatas_por_tamano_m2"] = {f">={t}": int((v["area_m2"] >= t).sum()) for t in (1000, 2000, 5000, 10000)}


def portal_suelo(muni, ctrl):
    raw = leer(muni, "IDEM_V_SUELO_PARCELA")
    ctrl["portal_suelo_parcelas"] = len(raw)
    if raw.empty:
        (carpeta_salida(muni) / "portal_suelo.geojson").write_text('{"type": "FeatureCollection", "features": []}', encoding="utf-8")
        return
    ctrl["portal_suelo_sin_geometria"] = int(raw.geometry.isna().sum())
    g = raw.rename(columns={"DS_PARCELA": "parcela", "DS_LOCALIZACION": "localizacion", "DS_REGIMEN_ES": "regimen", "DS_CLASE_ES": "clase",
                            "DS_USO_PPAL_ES": "uso", "DS_URBANIZA_ES": "urbanizacion", "NM_SUPER_REG": "sup_m2",
                            "NM_SUPER_EDIF": "edificabilidad_m2", "CD_REF_CATASTRAL_14": "ref_catastral", "DS_GESTOR": "gestor"})
    g = g[["parcela", "localizacion", "regimen", "clase", "uso", "urbanizacion", "sup_m2", "edificabilidad_m2", "ref_catastral", "gestor", "geometry"]]
    ctrl["portal_suelo_por_uso"] = g["uso"].value_counts().to_dict()
    ctrl["portal_suelo_guardadas"] = guardar(g.dropna(subset=["geometry"]), carpeta_salida(muni) / "portal_suelo.geojson", muni)


def procesar(muni: dict) -> dict:
    descargar(muni)  # no repite lo ya descargado
    ctrl: dict = {"municipio": muni}
    amb = ambitos(muni, ctrl)
    redes(muni, ctrl)
    suelo(muni, amb, ctrl)
    portal_suelo(muni, ctrl)
    out = carpeta_salida(muni)
    ctrl["tamanos_kb"] = {f.name: round(f.stat().st_size / 1000) for f in sorted(out.glob("*")) if f.suffix in (".geojson", ".json") and not f.name.startswith("_")}
    (out / "_control_idem.json").write_text(json.dumps(ctrl, ensure_ascii=False, indent=1), encoding="utf-8")
    return ctrl


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    m = resolver_municipio(sys.argv[1])
    print(f"Municipio: {m['nombre']} (INE {m['cod']})")
    c = procesar(m)
    for k, v in c.items():
        if k != "municipio":
            print(f"  {k:55s} {v}")
