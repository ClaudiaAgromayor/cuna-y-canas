"""Modelo de población: cuántos habitantes por vivienda tendrá un barrio nuevo cuando se complete.

Uso: python etl/modelo_poblacion.py       (recalibra y escribe data/processed/modelo_poblacion.json)

Qué hace:
  1. Reúne los barrios nuevos YA HABITADOS de toda la Comunidad (no solo de Getafe): ámbitos de desarrollo con al menos
     500 viviendas previstas, menos del 20 % de suelo residencial vacante y una sección censal entera dentro, cuya población
     real conocemos por el INE (Atlas de Distribución de Renta, 2023). Salen 28 barrios de 17 municipios.
  2. Para cada barrio mide los habitantes por vivienda "cuando está completo":
        hab/vivienda completa = población real / (viviendas previstas × grado de ocupación del suelo residencial)
     El grado de ocupación sale del catastro (IDEM, suelo vacante y ocupado): un barrio con el 10 % del suelo residencial
     sin construir todavía no tiene todos sus vecinos.
  3. Lo explica con dos datos del MUNICIPIO, que existen para cualquier municipio: el tamaño mediano del hogar (INE) y el
     porcentaje de menores de 15 años (padrón). Es una regresión lineal regularizada (ridge) sobre el logaritmo.
  4. Prueba con el pasado, la más exigente: deja fuera el MUNICIPIO ENTERO (no solo el barrio), lo predice con los demás y
     lo compara con su población real. Se compara con la regla habitual (viviendas × tamaño medio del hogar del municipio).
  5. El rango [mínimo, central, máximo] que se da a cada municipio sale de esa misma prueba: percentiles 10 y 90 del cociente
     real / previsto. Así el rango dice lo que de verdad se ha equivocado el modelo, no un mínimo y máximo cualquiera.

Se eligieron esas dos variables probando otras (renta, densidad, distancia a Madrid, vivienda protegida, tipología, natalidad,
hogares unipersonales, edad media): ninguna mejoraba de forma fiable con 28 barrios, y más variables solo ajustarían ruido.
"""
import json
import math
import statistics as st

import numpy as np

from comun import PROCESSED

MIN_VIVIENDAS = 500
MAX_VACANTE = 20          # % de suelo residencial vacante: más allá, el barrio está a medio hacer
MIN_SECCIONES_ENTERAS = 1
RASGOS = ["tam", "men15"]
LAMBDA = 1.0
SALIDA = PROCESSED / "modelo_poblacion.json"


def rasgos_municipio(carpeta) -> dict | None:
    """Tamaño mediano del hogar (INE, último año) y % de menores de 15 años (padrón) de un municipio ya procesado."""
    try:
        ss = json.loads((carpeta / "secciones_series.json").read_text(encoding="utf-8"))["por_seccion"]
        pj = json.loads((carpeta / "poblacion.json").read_text(encoding="utf-8"))["por_anio"]
    except (FileNotFoundError, KeyError):
        return None
    u = pj[max(pj)]
    menores = sum(v for k, v in u.items() if k.startswith(("De 0-4", "De 5-9", "De 10-14")))
    tams = [s[max(s)]["tam_hogar"] for s in ss.values() if s and s[max(s)].get("tam_hogar")]
    if not u.get("Total") or not tams:
        return None
    return {"tam": round(st.median(tams), 3), "men15": round(100 * menores / u["Total"], 2)}


def barrios_calibracion() -> list[dict]:
    filas = []
    for d in sorted(x for x in PROCESSED.iterdir() if x.is_dir() and x.name[:3].isdigit()):
        rasgos = rasgos_municipio(d)
        try:
            series = json.loads((d / "secciones_series.json").read_text(encoding="utf-8"))["por_ambito"]
            resumen = {a["ambito"]: a for a in json.loads((d / "resumen_ambitos.json").read_text(encoding="utf-8"))["ambitos"]}
        except FileNotFoundError:
            continue
        if not rasgos:
            continue
        for amb, s in series.items():
            r = resumen.get(amb)
            if not r or not r["viviendas_previstas"] or r["viviendas_previstas"] < MIN_VIVIENDAS:
                continue
            if r["pct_residencial_vacante"] is None or r["pct_residencial_vacante"] > MAX_VACANTE:
                continue
            u = s[max(s)]
            if u.get("secciones_enteras", 0) < MIN_SECCIONES_ENTERAS:
                continue
            viv = r["viviendas_previstas"]
            comp = 1 - r["pct_residencial_vacante"] / 100
            filas.append({"cod_ine": d.name[:3], "carpeta": d.name, "ambito": amb, "viviendas": viv, "anio": int(max(s)), "poblacion": u["poblacion"],
                          "ocupacion": round(comp, 3), "hab_por_vivienda_completa": u["poblacion"] / (viv * comp),
                          "pct_menores18": 100 * u["menores18"] / u["poblacion"], "pct_mayores65": 100 * u["mayores65"] / u["poblacion"], **rasgos})
    return filas


def ajustar(filas: list[dict]) -> dict:
    X = np.array([[f[k] for k in RASGOS] for f in filas])
    y = np.log([f["hab_por_vivienda_completa"] for f in filas])
    mu, sd = X.mean(0), X.std(0) + 1e-9
    A = np.c_[np.ones(len(X)), (X - mu) / sd]
    reg = LAMBDA * np.eye(A.shape[1])
    reg[0, 0] = 0
    w = np.linalg.solve(A.T @ A + reg, A.T @ y)
    return {"rasgos": RASGOS, "mu": mu.tolist(), "sd": sd.tolist(), "w": w.tolist(), "lambda": LAMBDA}


def central(modelo: dict, rasgos: dict) -> float:
    x = (np.array([rasgos[k] for k in modelo["rasgos"]]) - np.array(modelo["mu"])) / np.array(modelo["sd"])
    return math.exp(modelo["w"][0] + float(x @ np.array(modelo["w"][1:])))


def construir() -> dict:
    filas = barrios_calibracion()
    modelo = ajustar(filas)
    prueba, ratios = [], []
    for f in filas:
        resto = [g for g in filas if g["cod_ine"] != f["cod_ine"]]       # sin el municipio entero
        hv = central(ajustar(resto), f)
        pred = f["viviendas"] * f["ocupacion"] * hv
        ingenua = f["viviendas"] * f["tam"]                              # regla habitual: viviendas × tamaño del hogar
        ratios.append(f["poblacion"] / pred)
        prueba.append({"ambito": f["ambito"], "municipio": f["cod_ine"], "anio": f["anio"], "real": round(f["poblacion"]),
                       "prediccion": round(pred), "error_pct": round(100 * (pred - f["poblacion"]) / f["poblacion"], 1),
                       "prediccion_ingenua": round(ingenua), "error_ingenua_pct": round(100 * (ingenua - f["poblacion"]) / f["poblacion"], 1)})
    p10, p90 = (float(x) for x in np.percentile(ratios, [10, 90]))
    for b, r in zip(prueba, ratios):
        b["dentro_del_rango"] = p10 <= r <= p90
    e = np.array([abs(b["error_pct"]) for b in prueba])
    ei = np.array([abs(b["error_ingenua_pct"]) for b in prueba])
    pct = lambda k: [round(float(v), 2) for v in np.percentile([f[k] for f in filas], [10, 50, 90])]
    doc = {"modelo": modelo, "razon_rango": [round(p10, 3), round(p90, 3)],
           "tam_mediana_global": round(st.median(f["tam"] for f in filas), 3), "men15_mediana_global": round(st.median(f["men15"] for f in filas), 2),
           "pct_menores18": pct("pct_menores18"), "pct_mayores65": pct("pct_mayores65"),
           "calibracion": {"n_barrios": len(filas), "n_municipios": len({f["cod_ine"] for f in filas}),
                           "criterio": f"barrios con al menos {MIN_VIVIENDAS} viviendas previstas, menos del {MAX_VACANTE} % de suelo residencial vacante y una sección censal entera dentro"},
           "resumen_prueba": {"error_medio_pct": round(float(e.mean()), 1), "error_mediano_pct": round(float(np.median(e)), 1),
                              "error_regla_habitual_pct": round(float(ei.mean()), 1), "dentro_del_rango_pct": round(100 * float(np.mean([b["dentro_del_rango"] for b in prueba]))),
                              "criterio": "se deja fuera el municipio entero y se predice con los demás"},
           "barrios": [{"ambito": f["ambito"], "municipio": f["cod_ine"], "viviendas": f["viviendas"], "poblacion": round(f["poblacion"]),
                        "ocupacion": f["ocupacion"], "hab_por_vivienda": round(f["poblacion"] / f["viviendas"], 3)} for f in filas],
           "prueba": prueba}
    SALIDA.write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
    return doc


def cargar() -> dict:
    return json.loads(SALIDA.read_text(encoding="utf-8"))


def hab_por_vivienda(doc: dict, rasgos: dict | None) -> list[float]:
    """[mínimo, central, máximo] de habitantes por vivienda completa para un municipio (con sus rasgos o, si faltan, los medianos)."""
    r = rasgos or {"tam": doc["tam_mediana_global"], "men15": doc["men15_mediana_global"]}
    c = central(doc["modelo"], r)
    lo, hi = doc["razon_rango"]
    return [round(c * lo, 3), round(c, 3), round(c * hi, 3)]


if __name__ == "__main__":
    d = construir()
    print(json.dumps(d["calibracion"], ensure_ascii=False))
    print(json.dumps(d["resumen_prueba"], ensure_ascii=False))
    print("rango del cociente real/previsto (P10, P90):", d["razon_rango"], "· pesos:", [round(x, 3) for x in d["modelo"]["w"]])
