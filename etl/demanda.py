"""Modelo de demanda: cuánta población y de qué edades tendrá cada ámbito, y puntos de demanda para el algoritmo.

Uso: python etl/demanda.py MUNICIPIO        (nombre o código INE de 3 dígitos)

Modelo (transparente y en rangos):
  población de un ámbito al completarse = viviendas previstas × habitantes por vivienda prevista
  - "habitantes por vivienda prevista" se calibra con barrios nuevos YA HABITADOS de Getafe (INE 2023):
    población real repartida por áreas / viviendas del plan. Rango = mínimo y máximo observados; central = mediana.
  - % de menores de 18 y de 65 y más: los observados en esos barrios (rango y mediana).
  - reparto de los menores por edades (0-2, 3-5, 6-11, 12-17): el del censo del municipio, por tramos quinquenales.
Prueba con el pasado: cada barrio de calibración se predice con los parámetros de los DEMÁS barrios (deja uno fuera)
y se compara con su población real de 2023, junto a la regla ingenua (viviendas × tamaño medio del hogar).

Genera:
  data/processed/servicios.json                    parámetros por servicio (supuestos ajustables en la web)
  data/processed/<cod>-<slug>/demanda.json         calibración, prueba con el pasado y demanda por ámbito
  data/processed/<cod>-<slug>/demanda_puntos.geojson  dónde está la demanda: secciones (hoy) y suelo residencial vacante (futuro)
"""
import json
import statistics as st
import sys

import geopandas as gpd
import pandas as pd

from comun import PROCESSED, carpeta_salida, resolver_municipio, solo_poligonos
from procesar_idem import leer

M = 25830
CALIBRACION = "065"            # los parámetros salen de los barrios nuevos de Getafe (los únicos con series fiables)
MIN_VIVIENDAS_CALIB = 1000     # barrios pequeños: el reparto por áreas es demasiado ruidoso
MAX_RES_VACANTE_CALIB = 15     # solo barrios ya construidos (% de suelo residencial vacante)
MIN_SECCIONES_ENTERAS = 1      # al menos una sección censal entera dentro del ámbito: si no, el reparto por áreas no es fiable

# Supuestos por servicio. Son puntos de partida ajustables con deslizadores en la web, no normas.
# "existentes" dice qué centros del municipio cuentan como oferta ya disponible de ese servicio.
SERVICIOS = {
    "escuela_infantil": {
        "nombre": "Escuela infantil", "etapa": "Tengo un bebé", "grupo": ["g0_2"], "tasa_uso": [0.35, 0.45, 0.55],
        "nota_tasa": "proporción de niños de 0-2 años que acuden a escuela infantil (supuesto, por verificar con la estadística educativa)",
        "capacidad": [75, 120, 150], "unidad": "plazas", "sup_min_m2": 1500, "minutos_andando": 10,
        "existentes": {"capa": "centros_educativos", "campo": "tipo", "valores": ["EEI", "EEI-CN", "EIPR"]}},
    "colegio": {
        "nombre": "Colegio (infantil y primaria)", "etapa": "Tengo hijos en edad escolar", "grupo": ["g3_5", "g6_11"], "tasa_uso": [0.8, 0.85, 0.9],
        "nota_tasa": "proporción de alumnado de 3-11 años en centros sostenidos con fondos públicos, públicos y concertados (supuesto, por verificar)",
        "capacidad": [450, 675, 900], "unidad": "plazas", "sup_min_m2": 8000, "minutos_andando": 15,
        "existentes": {"capa": "centros_educativos", "campo": "tipo", "valores": ["CP INF-PRI", "CP INF-PRI-SEC", "CPR INF-PRI", "CPR INF-PRI-SEC"],
                       "titularidad": ["PÚBLICO", "PRIVADO CONCERTADO"]}},
    "centro_salud": {
        "nombre": "Centro de salud", "etapa": "Para toda la familia", "grupo": ["pob"], "tasa_uso": [1, 1, 1],
        "nota_tasa": "toda la población",
        "capacidad": [15000, 25000, 30000], "unidad": "habitantes por centro", "sup_min_m2": 2000, "minutos_andando": 15,
        "existentes": {"capa": "centros_sanitarios", "campo": "tipo", "valores": ["Centro de salud"]}},
    "centro_dia": {
        "nombre": "Centro de día para mayores", "etapa": "Cuido de mis padres", "grupo": ["g65"], "tasa_uso": [0.01, 0.015, 0.03],
        "nota_tasa": "plazas por persona de 65 y más años (supuesto, por verificar)",
        "capacidad": [40, 60, 90], "unidad": "plazas", "sup_min_m2": 1500, "minutos_andando": 15,
        "existentes": {"capa": "centros_sociales", "campo": "tipo", "valores": ["CENTROS DE DÍA"], "sector_contiene": "mayores",
                       "excluir_subtipo": ["HOGARES Y CLUBES"], "campo_capacidad": "plazas"}},
    "residencia": {
        "nombre": "Residencia de mayores", "etapa": "Cuido de mis padres", "grupo": ["g65"], "tasa_uso": [0.04, 0.05, 0.06],
        "nota_tasa": "plazas por persona de 65 y más años; 5 por cada 100 es la ratio de referencia que se cita habitualmente",
        "capacidad": [80, 120, 180], "unidad": "plazas", "sup_min_m2": 4000, "minutos_andando": 30,
        "existentes": {"capa": "centros_sociales", "campo": "tipo", "valores": ["CENTROS RESIDENCIALES"], "sector_contiene": "mayores",
                       "campo_capacidad": "plazas"}},
}


def reparto_menores(muni_dir) -> dict:
    """Peso de cada tramo dentro de los menores de 18, a partir del censo municipal por tramos de 5 años."""
    p = json.loads((muni_dir / "poblacion.json").read_text(encoding="utf-8"))["por_anio"]
    u = p[max(p)]
    t = {k: u.get(k) or 0 for k in ("De 0-4 años", "De 5-9 años", "De 10-14 años", "De 15-19 años")}
    a, b, c, d = t.values()
    tramos = {"g0_2": 0.6 * a, "g3_5": 0.4 * a + 0.2 * b, "g6_11": 0.8 * b + 0.4 * c, "g12_17": 0.6 * c + 0.6 * d}
    tot = sum(tramos.values())
    return {k: round(v / tot, 4) for k, v in tramos.items()}


def barrios_calibracion() -> list[dict]:
    muni = resolver_municipio(CALIBRACION)
    d = PROCESSED / f"{muni['cod']}-{muni['slug']}"
    series = json.loads((d / "secciones_series.json").read_text(encoding="utf-8"))["por_ambito"]
    resumen = {a["ambito"]: a for a in json.loads((d / "resumen_ambitos.json").read_text(encoding="utf-8"))["ambitos"]}
    filas = []
    for amb, s in series.items():
        r = resumen.get(amb)
        if not r or not r["viviendas_previstas"] or r["viviendas_previstas"] < MIN_VIVIENDAS_CALIB:
            continue
        if r["pct_residencial_vacante"] is None or r["pct_residencial_vacante"] > MAX_RES_VACANTE_CALIB:
            continue
        u = s[max(s)]
        if u.get("secciones_enteras", 0) < MIN_SECCIONES_ENTERAS:
            continue
        filas.append({"ambito": amb, "viviendas": r["viviendas_previstas"], "anio": int(max(s)), "poblacion": u["poblacion"],
                      "hab_por_vivienda": round(u["poblacion"] / r["viviendas_previstas"], 3), "tam_hogar": u["tam_hogar"],
                      "pct_menores18": round(100 * u["menores18"] / u["poblacion"], 1),
                      "pct_mayores65": round(100 * u["mayores65"] / u["poblacion"], 1),
                      "serie": {int(y): v["poblacion"] for y, v in sorted(s.items())}})
    return filas


def rango(valores: list[float]) -> list[float]:
    return [round(min(valores), 3), round(st.median(valores), 3), round(max(valores), 3)]


def prueba_con_el_pasado(barrios: list[dict], tam_hogar_municipal: float) -> list[dict]:
    res = []
    for b in barrios:
        otros = [o["hab_por_vivienda"] for o in barrios if o is not b]
        pred = b["viviendas"] * st.mean(otros)
        ingenua = b["viviendas"] * tam_hogar_municipal
        res.append({"ambito": b["ambito"], "anio": b["anio"], "real": b["poblacion"],
                    "prediccion": round(pred), "error_pct": round(100 * (pred - b["poblacion"]) / b["poblacion"], 1),
                    "prediccion_ingenua": round(ingenua), "error_ingenua_pct": round(100 * (ingenua - b["poblacion"]) / b["poblacion"], 1),
                    "rango": [round(b["viviendas"] * min(otros)), round(b["viviendas"] * max(otros))],
                    "dentro_del_rango": b["viviendas"] * min(otros) <= b["poblacion"] <= b["viviendas"] * max(otros)})
    return res


def puntos_demanda(muni, out, reparto, params, pob_actual_amb, ambitos_df) -> gpd.GeoDataFrame:
    """Demanda actual (secciones) y futura (suelo residencial vacante de cada ámbito, repartido por superficie)."""
    sec = gpd.read_file(out / "secciones.geojson").to_crs(M)
    sec = sec[sec["poblacion"].notna()]
    pts = []
    for r in sec.itertuples():
        menores = r.poblacion * (r.pct_menores18 or 0) / 100
        pts.append({"tipo": "actual", "origen": r.cod_seccion, "ambito": r.ambito, "pob": r.poblacion,
                    **{k: menores * v for k, v in reparto.items()}, "g65": r.poblacion * (r.pct_mayores65 or 0) / 100,
                    "geometry": r.geometry.representative_point()})
    # futuro: lo que falta hasta completar cada ámbito, sobre sus parcelas residenciales vacantes
    suelo = leer(muni, "IDEM_VPLA_SVAC_SOCU_26")
    suelo["geometry"] = solo_poligonos(suelo.geometry)
    res_vac = suelo[suelo["DS_USO"].str.startswith("Residencial") & (suelo["DS_OCUPACION"] == "Vacante")].copy()
    res_vac["area"] = res_vac.geometry.area
    res_vac = res_vac[res_vac["area"] > 0]
    res_vac["geometry"] = res_vac.geometry.representative_point()
    j = gpd.sjoin(res_vac[["area", "geometry"]], ambitos_df[["nombre", "geometry"]], predicate="within")
    for amb, d in j.groupby("nombre"):
        a = ambitos_df[ambitos_df["nombre"] == amb].iloc[0]
        if pd.isna(a["viviendas"]):
            continue
        falta = a["viviendas"] * params["hab_por_vivienda"][1] - pob_actual_amb.get(amb, 0)
        if falta <= 0:
            continue
        for r in d.itertuples():
            pob = falta * r.area / d["area"].sum()
            menores = pob * params["pct_menores18"][1] / 100
            pts.append({"tipo": "futuro", "origen": "suelo residencial vacante", "ambito": amb, "pob": pob,
                        **{k: menores * v for k, v in reparto.items()}, "g65": pob * params["pct_mayores65"][1] / 100,
                        "geometry": r.geometry})
    g = gpd.GeoDataFrame(pts, crs=M).to_crs(4326)
    for c in ["pob", *reparto, "g65"]:
        g[c] = g[c].round(1)
    g["cod_ine"] = muni["cod"]
    g["geometry"] = g.geometry.set_precision(1e-6)
    return g


def procesar(muni: dict) -> dict:
    out = carpeta_salida(muni)
    (PROCESSED / "servicios.json").write_text(json.dumps(SERVICIOS, ensure_ascii=False, indent=1), encoding="utf-8")
    barrios = barrios_calibracion()
    params = {"hab_por_vivienda": rango([b["hab_por_vivienda"] for b in barrios]),
              "pct_menores18": rango([b["pct_menores18"] for b in barrios]),
              "pct_mayores65": rango([b["pct_mayores65"] for b in barrios])}
    reparto = reparto_menores(out)
    ine_mun = json.loads((out / "secciones_series.json").read_text(encoding="utf-8"))
    hogar_mun = st.median([v["tam_hogar"] for s in ine_mun["por_seccion"].values() for y, v in s.items() if v.get("tam_hogar")] or [2.6])
    gtf = resolver_municipio(CALIBRACION)
    hogar_getafe = 2.6
    try:
        ser = json.loads((PROCESSED / f"{gtf['cod']}-{gtf['slug']}" / "secciones_series.json").read_text(encoding="utf-8"))["por_seccion"]
        ult = max(int(y) for s in ser.values() for y in s)
        hogar_getafe = round(st.median([s[str(ult)]["tam_hogar"] for s in ser.values() if str(ult) in s and s[str(ult)]["tam_hogar"]]), 2)
    except (FileNotFoundError, ValueError):
        pass
    backtest = prueba_con_el_pasado(barrios, hogar_getafe)

    amb = gpd.read_file(out / "ambitos.geojson").to_crs(M)
    resumen = {a["ambito"]: a for a in json.loads((out / "resumen_ambitos.json").read_text(encoding="utf-8"))["ambitos"]}
    series = ine_mun["por_ambito"]
    pob_actual = {a: s[max(s)]["poblacion"] for a, s in series.items()}
    ambitos = []
    for a in amb.itertuples():
        r = resumen.get(a.nombre, {})
        vac = r.get("pct_residencial_vacante")
        estado = "sin_datos" if vac is None else "habitado" if vac < 15 else "en_desarrollo" if vac < 85 else "futuro"
        fila = {"ambito": a.nombre, "clase_suelo": a.clase_suelo, "viviendas": None if pd.isna(a.viviendas) else int(a.viviendas),
                "estado": estado, "pct_residencial_vacante": vac, "poblacion_actual": pob_actual.get(a.nombre),
                "anio_poblacion_actual": int(max(series[a.nombre])) if a.nombre in series else None}
        if fila["viviendas"]:
            pob = [round(fila["viviendas"] * h) for h in params["hab_por_vivienda"]]
            menores = [p * m / 100 for p, m in zip(pob, params["pct_menores18"])]
            mayores = [p * m / 100 for p, m in zip(pob, params["pct_mayores65"])]
            fila["poblacion_completo"] = pob
            fila["grupos_completo"] = {**{k: [round(x * v) for x in menores] for k, v in reparto.items()}, "g65": [round(x) for x in mayores]}
        ambitos.append(fila)
    ambitos.sort(key=lambda f: -(f["viviendas"] or 0))

    doc = {"cod_ine": muni["cod"],
           "modelo": "población al completarse = viviendas previstas × habitantes por vivienda prevista; resultados en [mínimo, central, máximo]",
           "calibracion": {"municipio": gtf["nombre"], "fuente": "INE (Atlas de Distribución de Renta de los Hogares) + IDEM (ámbitos y suelo vacante)",
                           "criterio": f"barrios con al menos {MIN_VIVIENDAS_CALIB} viviendas previstas, menos del {MAX_RES_VACANTE_CALIB} % de suelo residencial vacante y al menos {MIN_SECCIONES_ENTERAS} sección censal entera dentro",
                           "barrios": barrios, "parametros": params, "reparto_menores": reparto,
                           "tam_hogar_mediano_municipio": hogar_getafe},
           "prueba_con_el_pasado": backtest,
           "ambitos": ambitos}
    (out / "demanda.json").write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
    pts = puntos_demanda(muni, out, reparto, params, pob_actual, amb)
    (out / "demanda_puntos.geojson").write_text(pts.to_json(drop_id=True, ensure_ascii=False), encoding="utf-8")
    return {"barrios_calibracion": [b["ambito"] for b in barrios], "parametros": params, "reparto_menores": reparto,
            "prueba_con_el_pasado": [(b["ambito"], b["real"], b["prediccion"], b["error_pct"], b["error_ingenua_pct"], b["dentro_del_rango"]) for b in backtest],
            "puntos_actual": int((pts["tipo"] == "actual").sum()), "puntos_futuro": int((pts["tipo"] == "futuro").sum()),
            "poblacion_futura_central": round(float(pts.loc[pts["tipo"] == "futuro", "pob"].sum())),
            "ambitos_por_estado": pd.Series([a["estado"] for a in ambitos]).value_counts().to_dict()}


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    m = resolver_municipio(sys.argv[1])
    print(f"Municipio: {m['nombre']} (INE {m['cod']})")
    for k, v in procesar(m).items():
        print(f"  {k:26s} {v}")
