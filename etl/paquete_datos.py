"""Datasets elaborados para el jurado: CSV fáciles de abrir, un ZIP con todo y una página con el diccionario de datos.

Escribe en data/processed/datos/ (Vite lo copia a la web, así que se publica con ella en Oracle):
    municipios.csv          indicadores de los 179 municipios ("¿Dónde vivir?")
    barrios.csv             barrios y ámbitos de desarrollo: viviendas, población hoy y al completarse, por edades
    parcelas_vacantes.csv   suelo de equipamiento vacante con su punto central
    cuna-y-canas-datos.zip  todos los GeoJSON y JSON que usa la web, por municipio
    index.html              qué es cada fichero, cada campo y de dónde sale

Uso: python etl/paquete_datos.py
"""
import csv
import html
import json
import zipfile
from datetime import date

from shapely.geometry import shape

from comun import PROCESSED

SALIDA = PROCESSED / "datos"

CAMPOS_MUNICIPIO = {
    "cod_ine": "Código INE del municipio (3 cifras, provincia 28)",
    "nombre": "Nombre del municipio",
    "poblacion": "Habitantes (padrón continuo, Portal de Datos Abiertos)",
    "anio_poblacion": "Año del dato de población",
    "crecimiento_pct": "Crecimiento de la población en el periodo indicado (%)",
    "pob_0_4 / pob_5_14 / pob_65": "Habitantes de 0-4, 5-14 y 65 o más años (padrón)",
    "pct_menores15 / pct_mayores65": "Porcentaje de menores de 15 y de 65 o más años",
    "nacidos / tasa_natalidad": "Nacimientos del último año y nacimientos por 1.000 habitantes",
    "renta_per_capita": "Renta disponible bruta por habitante (€)",
    "paro_por_100": "Paro registrado por cada 100 habitantes",
    "esc_infantil_publica / _privada": "Escuelas infantiles por titularidad (centros educativos, CKAN)",
    "colegio_publico / _concertado / _privado": "Colegios de infantil y primaria por titularidad",
    "instituto_publico / fp": "Institutos públicos y centros con Formación Profesional",
    "centros_salud / consultorios / atencion_primaria": "Centros de salud, consultorios locales y su suma (centros sanitarios, CKAN)",
    "hospital_km": "Distancia en línea recta al hospital general más cercano (km)",
    "farmacias / farmacias_10mil": "Farmacias y farmacias por 10.000 habitantes",
    "residencias / plazas_residencia / plazas_residencia_100may": "Residencias de mayores, plazas y plazas por 100 mayores de 65 (servicios sociales, CKAN)",
    "centros_dia / plazas_centro_dia / plazas_dia_100may / hogares_mayores": "Centros de día, plazas, plazas por 100 mayores y hogares o clubes de mayores",
    "bibliotecas / equip_culturales / equip_deportivos": "Bibliotecas (CKAN) y parcelas de equipamiento cultural y deportivo del planeamiento (IDEM)",
    "est_metro / est_cercanias / est_metro_ligero": "Estaciones en el municipio (Consorcio Regional de Transportes)",
    "paradas_interurbano / paradas_urbano / lineas_interurbanas": "Paradas de autobús y líneas interurbanas distintas (CRTM)",
    "lineas_tren_madrid": "Líneas de Cercanías, Metro o Metro Ligero que llevan a Madrid (CRTM, recorridos)",
    "bus_madrid": "Líneas de autobús interurbano directas a Madrid (CRTM, recorridos)",
    "corona": "Zona tarifaria del abono de transporte: A, B1, B2, B3, C1, C2 (CRTM)",
    "hab_por_vivienda": "Habitantes por vivienda completa que usa el modelo de población para este municipio: mínimo, central y máximo (ver «Cómo se han elaborado»)",
    "dist_madrid_km": "Distancia en línea recta a la Puerta del Sol (km)",
    "zonas_verdes_m2 / zonas_verdes_m2_hab / zonas_verdes_fuente": "Superficie de parques y por habitante; fuente: EIEL 2023 (parques existentes) o planeamiento (IDEM)",
    "pct_protegido": "% del término en un Espacio Natural Protegido o LIC/ZEC de la Red Natura 2000 (IDEM)",
    "viviendas_pendientes": "De las viviendas previstas, las que el catastro aún da por sin construir (viviendas de cada ámbito × % de suelo residencial vacante); sin dato de ocupación, el ámbito se cuenta entero",
    "viviendas_previstas / viviendas_previstas_por_100hab / ambitos_desarrollo": "Viviendas previstas en el planeamiento refundido 2025 (IDEM), por 100 habitantes y nº de ámbitos con viviendas",
    "parcelas_equip / parcelas_equip_1500 / parcelas_equip_8000 / suelo_equip_m2": "Parcelas de equipamiento vacantes (IDEM, suelo vacante 2026): total, de 1.500 m² o más, de 8.000 m² o más y superficie",
    "sup_km2 / densidad": "Superficie del término (km²) y habitantes por km²",
    "foto / foto_pagina": "Imagen del municipio en Wikimedia Commons (Wikidata) y página con su autoría y licencia",
}
CAMPOS_BARRIO = {
    "cod_ine / municipio": "Municipio",
    "ambito": "Nombre del ámbito de planeamiento (barrio en desarrollo) en la IDEM",
    "clase_suelo": "Clase de suelo (urbano no consolidado, urbanizable…)",
    "estado": "futuro (sin construir), en_desarrollo o habitado",
    "viviendas": "Viviendas previstas en el ámbito (planeamiento refundido 2025)",
    "pct_residencial_vacante": "% del suelo residencial aún vacante",
    "pct_equipamiento_vacante / equipamiento_vacante_m2": "% y m² del suelo para equipamientos aún sin construir",
    "poblacion_actual / anio_poblacion_actual": "Población hoy (INE, Atlas de Distribución de Renta por sección censal, repartida por superficie)",
    "poblacion_completo_min / _central / _max": "Población cuando el barrio esté completo: viviendas × habitantes por vivienda del municipio (modelo de población, con rango)",
    "g0_2, g3_5, g6_11, g12_17, g65 (min/central/max)": "Población al completarse por edad: 0-2, 3-5, 6-11, 12-17 y 65 o más",
}


def plano(v):
    if isinstance(v, list):
        return ", ".join(map(str, v))
    return "" if v is None else v


def escribir(nombre, filas):
    claves = list(dict.fromkeys(k for f in filas for k in f))
    with open(SALIDA / nombre, "w", newline="", encoding="utf-8-sig") as fh:  # con BOM y ";" para que Excel lo abra bien
        w = csv.DictWriter(fh, claves, delimiter=";")
        w.writeheader()
        w.writerows({k: plano(f.get(k)) for k in claves} for f in filas)
    return len(filas)


def main():
    SALIDA.mkdir(exist_ok=True)
    resumen = json.loads((PROCESSED / "municipios_resumen.json").read_text(encoding="utf-8"))["municipios"]
    nombres = {m["cod_ine"]: m["nombre"] for m in resumen}
    n_mun = escribir("municipios.csv", resumen)

    barrios, parcelas = [], []
    carpetas = sorted(d for d in PROCESSED.iterdir() if d.is_dir() and d.name[:3].isdigit())
    for d in carpetas:
        cod = d.name[:3]
        dem = d / "demanda.json"
        vac = {}
        if (d / "resumen_ambitos.json").exists():
            vac = {a["ambito"]: a for a in json.loads((d / "resumen_ambitos.json").read_text(encoding="utf-8"))["ambitos"]}
        if dem.exists():
            for a in json.loads(dem.read_text(encoding="utf-8"))["ambitos"]:
                f = {"cod_ine": cod, "municipio": nombres.get(cod, ""), **{k: v for k, v in a.items() if k not in ("poblacion_completo", "grupos_completo")}}
                for i, s in enumerate(("min", "central", "max")):
                    if a.get("poblacion_completo"):
                        f[f"poblacion_completo_{s}"] = a["poblacion_completo"][i]
                    for g, r in (a.get("grupos_completo") or {}).items():
                        f[f"{g}_{s}"] = r[i]
                v = vac.get(a["ambito"], {})
                f["pct_equipamiento_vacante"] = v.get("pct_equipamiento_vacante")
                f["equipamiento_vacante_m2"] = v.get("equipamiento_vacante_m2")
                barrios.append(f)
        pv = d / "parcelas_vacantes.geojson"
        if pv.exists():
            for x in json.loads(pv.read_text(encoding="utf-8"))["features"]:
                c = shape(x["geometry"]).representative_point()
                parcelas.append({"cod_ine": cod, "municipio": nombres.get(cod, ""), **x["properties"], "lon": round(c.x, 6), "lat": round(c.y, 6)})
    n_bar = escribir("barrios.csv", barrios)
    n_par = escribir("parcelas_vacantes.csv", parcelas)

    zip_ = SALIDA / "cuna-y-canas-datos.zip"
    with zipfile.ZipFile(zip_, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for f in sorted(PROCESSED.rglob("*")):
            if f.is_file() and SALIDA not in f.parents:
                z.write(f, f.relative_to(PROCESSED).as_posix())
    mb = zip_.stat().st_size / 1e6

    (SALIDA / "index.html").write_text(pagina(n_mun, n_bar, n_par, len(carpetas), mb), encoding="utf-8")
    print(f"municipios {n_mun} · barrios {n_bar} · parcelas {n_par} · zip {mb:.1f} MB")


def tabla(campos):
    return "".join(f"<tr><td><code>{html.escape(k)}</code></td><td>{html.escape(v)}</td></tr>" for k, v in campos.items())


def pagina(n_mun, n_bar, n_par, n_carp, mb):
    hoy = date.today().strftime("%d/%m/%Y")
    return f"""<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Datos abiertos · Cuna y Canas</title>
<style>
body{{margin:0;font:15px/1.55 "IBM Plex Sans",system-ui,"Segoe UI",sans-serif;color:#131313;background:#fff}}
header{{background:#131313;color:#fff;padding:14px 24px}} header a{{color:#fff;text-decoration:none;font-weight:700;font-size:19px}}
main{{max-width:980px;margin:0 auto;padding:28px 20px 60px}} h1{{font-size:30px;margin:0 0 6px}} h2{{font-size:19px;border-bottom:2px solid #131313;padding-bottom:4px;margin-top:36px}}
.sub{{color:#595959}} .rojo{{color:#de0029;font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase}}
table{{width:100%;border-collapse:collapse;font-size:14px}} td,th{{text-align:left;padding:7px 8px;border-bottom:1px solid #ebebeb;vertical-align:top}} th{{border-bottom:1px solid #131313;font-weight:600}}
code{{background:#f5f5f5;padding:1px 4px;font-size:13px}} a.b{{display:inline-block;background:#131313;color:#fff;padding:7px 12px;text-decoration:none;font-weight:600;font-size:13px;white-space:nowrap}}
.nota{{border-left:3px solid #de0029;background:#f5f5f5;padding:10px 14px;margin:16px 0}}
</style></head><body>
<header><a href="../index.html">← Cuna y Canas</a></header>
<main>
<div class="rojo">MAD Open Data Challenge 2026 · datasets elaborados</div>
<h1>Datos abiertos de Cuna y Canas</h1>
<p class="sub">Los datos que usa la herramienta, ya limpios y cruzados, para que cualquiera pueda comprobarlos o reutilizarlos. Generados el {hoy} a partir de las API públicas de la Comunidad de Madrid (IDEM y Portal de Datos Abiertos), el INE y el Consorcio Regional de Transportes.</p>

<h2>Descargas</h2>
<table><tr><th>Fichero</th><th>Qué contiene</th><th>Filas</th><th></th></tr>
<tr><td><b>municipios.csv</b></td><td>Indicadores de los 179 municipios: población, servicios, transporte y conexión con Madrid, naturaleza, planeamiento, suelo vacante, renta y paro.</td><td>{n_mun}</td><td><a class="b" href="municipios.csv" download>CSV</a></td></tr>
<tr><td><b>barrios.csv</b></td><td>Ámbitos de desarrollo (barrios nuevos) de {n_carp} municipios: viviendas previstas, población hoy y cuando estén completos, por edad, con rango.</td><td>{n_bar}</td><td><a class="b" href="barrios.csv" download>CSV</a></td></tr>
<tr><td><b>parcelas_vacantes.csv</b></td><td>Parcelas de suelo para equipamientos públicos aún vacantes, con superficie y coordenadas.</td><td>{n_par}</td><td><a class="b" href="parcelas_vacantes.csv" download>CSV</a></td></tr>
<tr><td><b>cuna-y-canas-datos.zip</b></td><td>Todo lo que usa la web, por municipio, en GeoJSON y JSON: centros educativos, sanitarios y sociales, farmacias, paradas, secciones censales con su serie de población, zonas de salud, planeamiento, parcelas, demanda y controles de calidad.</td><td>{mb:.0f} MB</td><td><a class="b" href="cuna-y-canas-datos.zip" download>ZIP</a></td></tr>
</table>
<div class="nota">Los CSV usan <code>;</code> como separador y codificación UTF-8, así que se abren directamente con Excel. Coordenadas en WGS84 (EPSG:4326). Los ficheros de cada municipio llevan su código INE y se comprueba automáticamente que ningún fichero mezcla municipios.</div>

<h2>Cómo se han elaborado</h2>
<ul>
<li><b>Todo por API, nada a mano:</b> CKAN del Portal de Datos Abiertos (<code>package_show</code>), WFS de la IDEM (planeamiento, suelo vacante, secciones censales, espacios protegidos, EIEL), INE (tabla 31105 del Atlas de Renta) y servicios de datos abiertos del CRTM.</li>
<li><b>Limpieza:</b> geometrías reparadas, centros con coordenadas en otra ciudad descartados (más de 15 km del municipio), paradas de otras provincias filtradas y paradas compartidas entre redes unificadas.</li>
<li><b>Población futura:</b> viviendas previstas × habitantes por vivienda completa de cada municipio, con rango. El factor sale de un modelo calibrado con 28 barrios nuevos ya habitados de 17 municipios (INE 2023) y explicado por el tamaño del hogar y el % de menores de 15 años del municipio; descuenta el suelo residencial que el catastro aún da por vacante. Prueba con el pasado dejando fuera el municipio entero: error medio del 13 %, frente al 25 % de la regla habitual (viviendas × tamaño medio del hogar).</li>
</ul>

<h2>Diccionario: municipios.csv</h2>
<table><tr><th>Campo</th><th>Significado y fuente</th></tr>{tabla(CAMPOS_MUNICIPIO)}</table>
<h2>Diccionario: barrios.csv</h2>
<table><tr><th>Campo</th><th>Significado y fuente</th></tr>{tabla(CAMPOS_BARRIO)}</table>
<h2>Diccionario: parcelas_vacantes.csv</h2>
<p>Una fila por parcela de equipamiento vacante (IDEM, capa de suelo vacante y ocupado): municipio, atributos de la parcela tal como vienen de la IDEM (uso, superficie <code>area_m2</code>…) y su punto central (<code>lon</code>, <code>lat</code>).</p>
<p class="sub" style="margin-top:40px;font-size:13px">Licencia de los datos de origen: la de cada organismo (reutilización libre citando la fuente). Elaboración: equipo Cuna y Canas.</p>
</main></body></html>
"""


if __name__ == "__main__":
    main()
