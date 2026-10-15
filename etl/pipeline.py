"""Genera de principio a fin los datos de uno o varios municipios y el índice que lee la web.

Uso: python etl/pipeline.py MUNICIPIO [MUNICIPIO ...]     (nombre o código INE de 3 dígitos)
     python etl/pipeline.py Getafe Navalcarnero
     python etl/pipeline.py --indice                        (solo regenera municipios.json)

Pasos por municipio (cada uno reutiliza lo ya descargado en data/raw):
  1. CKAN: centros educativos, sanitarios y sociales, natalidad y población   (descargar_ckan.py)
  2. IDEM: ámbitos, redes, suelo vacante y Portal del Suelo                    (procesar_idem.py)
  3. INE + IDEM: secciones censales con población 2015-2023                    (secciones.py)
  4. CRTM: paradas de autobús, Metro y Cercanías                               (transporte.py)
  5. Zonas básicas de salud                                                    (zonas.py)
  6. Modelo de demanda y prueba con el pasado                                  (demanda.py)
  7. Verificación anti-mezcla                                                  (verificar.py)
Al final regenera data/processed/municipios.json.
"""
import json
import sys
import time

import geopandas as gpd

import demanda
import descargar_ckan
import procesar_idem
import secciones
import transporte
import verificar
import zonas
from comun import PROCESSED, resolver_municipio

PASOS = [("ckan", descargar_ckan.procesar), ("idem", procesar_idem.procesar), ("secciones", secciones.procesar),
         ("transporte", transporte.procesar), ("zonas_salud", zonas.procesar), ("demanda", demanda.procesar)]

# capas que la web puede pintar; si falta alguna, el índice lo dice y la web muestra "sin datos"
CAPAS = ["ambitos", "parcelas_vacantes", "redes", "portal_suelo", "centros_educativos", "centros_sanitarios",
         "centros_sociales", "farmacias", "secciones", "paradas", "zonas_salud", "demanda_puntos"]
TABLAS = ["natalidad", "poblacion", "resumen_ambitos", "secciones_series", "demanda"]


def ficha_indice(d) -> dict | None:
    cod, slug = d.name.split("-", 1)
    capas = {c: (d / f"{c}.geojson").exists() for c in CAPAS}
    tablas = {t: (d / f"{t}.json").exists() for t in TABLAS}
    ctrl = {}
    for f in d.glob("_control*.json"):
        ctrl.update(json.loads(f.read_text(encoding="utf-8")))
    nombre = ctrl.get("municipio", {}).get("nombre", slug)
    ref = next((d / f"{c}.geojson" for c in ("secciones", "ambitos", "centros_educativos") if capas.get(c)), None)
    if ref is None:
        return None
    g = gpd.read_file(ref)
    if g.empty:
        return None
    minx, miny, maxx, maxy = g.total_bounds
    pob = json.loads((d / "poblacion.json").read_text(encoding="utf-8")) if tablas["poblacion"] else {}
    ult = max(pob.get("por_anio", {}) or [None]) if pob else None
    dem = json.loads((d / "demanda.json").read_text(encoding="utf-8")) if tablas["demanda"] else {}
    return {
        "cod_ine": cod, "slug": slug, "carpeta": d.name, "nombre": nombre,
        "centro": [round((minx + maxx) / 2, 5), round((miny + maxy) / 2, 5)],
        "bbox": [round(v, 5) for v in (minx, miny, maxx, maxy)],
        "poblacion": pob.get("por_anio", {}).get(ult, {}).get("Total") if ult else None, "anio_poblacion": ult,
        "viviendas_previstas": sum(a["viviendas"] or 0 for a in dem.get("ambitos", [])) or None,
        "capas": capas, "tablas": tablas,
        "faltan": [k for k, v in {**capas, **tablas}.items() if not v],
        "completo": all(capas[c] for c in ("ambitos", "parcelas_vacantes", "demanda_puntos")) and tablas["demanda"],
        "generado": time.strftime("%Y-%m-%d %H:%M", time.localtime(max(f.stat().st_mtime for f in d.iterdir()))),
    }


def indice() -> dict:
    municipios = []
    for d in sorted(p for p in PROCESSED.iterdir() if p.is_dir()):
        try:
            f = ficha_indice(d)
        except Exception as e:  # noqa: BLE001 - una carpeta rota no impide el índice
            print(f"  índice: {d.name} omitido ({e})")
            continue
        if f:
            municipios.append(f)
    doc = {"municipios": municipios, "servicios": "servicios.json"}
    (PROCESSED / "municipios.json").write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
    return doc


def ejecutar(muni: dict) -> bool:
    print(f"\n=== {muni['nombre']} (INE {muni['cod']}) ===")
    ok = True
    for nombre, paso in PASOS:
        t = time.time()
        try:
            paso(muni)
            print(f"  {nombre:12s} ok ({time.time() - t:.0f} s)")
        except Exception as e:  # un paso que falla no impide los demás: el índice marcará lo que falte
            ok = False
            print(f"  {nombre:12s} FALLO: {type(e).__name__}: {e}")
    fallos = verificar.verificar(PROCESSED / f"{muni['cod']}-{muni['slug']}")
    for f in fallos:
        print("  FALLO verificación:", f)
    return ok and not fallos


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args and "--indice" not in sys.argv:
        raise SystemExit(__doc__)
    todo_ok = all([ejecutar(resolver_municipio(a)) for a in args])
    idx = indice()
    print(f"\nmunicipios.json: {', '.join(m['nombre'] + (' (faltan: ' + ', '.join(m['faltan']) + ')' if m['faltan'] else '') for m in idx['municipios'])}")
    sys.exit(0 if todo_ok else 1)
