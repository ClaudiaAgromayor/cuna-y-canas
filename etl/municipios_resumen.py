"""Resumen comparable de TODOS los municipios de la Comunidad de Madrid, para el comparador "¿Dónde vivir?".

Uso: python etl/municipios_resumen.py

Fuentes (todas por API): CKAN de la Comunidad (población por edad, nacimientos, centros educativos, sanitarios,
sociales, farmacias, bibliotecas, renta, paro), IDEM (límites municipales, ámbitos con viviendas previstas y
redes públicas: zonas verdes, deporte y cultura) y Consorcio Regional de Transportes (estaciones y paradas).
Genera:
  data/processed/municipios_resumen.json   un registro por municipio con unos 40 indicadores y su fecha
  data/processed/municipios.geojson        límites municipales simplificados (para el mapa de la Comunidad)
"""
import json
import urllib.parse
import urllib.request

import geopandas as gpd
import shapely
import numpy as np
import pandas as pd

import modelo_poblacion as MP
from comun import PROCESSED, RAW, descargar_ckan, leer_csv, sin_tildes

M = 25830
SOL = (440284, 4474264)  # Puerta del Sol, ETRS89 UTM 30N
IDEM = "https://idem.comunidad.madrid/geoidem"
CRTM = "https://services5.arcgis.com/UxADft6QPcvFyDU1/arcgis/rest/services"


def wfs(espacio: str, capa: str, propiedades: str | None = None, cache: str | None = None) -> dict:
    destino = RAW / "idem" / "_comunidad" / f"{cache or capa}.geojson"
    if destino.exists():
        return json.loads(destino.read_text(encoding="utf-8"))
    p = {"service": "WFS", "version": "2.0.0", "request": "GetFeature", "typeNames": f"{espacio}:{capa}",
         "outputFormat": "application/json", "srsName": "EPSG:4326"}
    if propiedades:
        p["propertyName"] = propiedades
    with urllib.request.urlopen(f"{IDEM}/{espacio}/wfs?{urllib.parse.urlencode(p)}", timeout=600) as r:
        d = json.load(r)
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(json.dumps(d, ensure_ascii=False), encoding="utf-8")
    return d


def crtm(servicio: str) -> pd.DataFrame:
    destino = RAW / "crtm" / "_comunidad" / f"{servicio}.json"
    if not destino.exists():
        filas, offset = [], 0
        while True:
            p = {"where": "CODIGOPROVINCIA='28'", "outFields": "IDESTACION,CODIGOMUNICIPIO,LINEAS", "returnGeometry": "false",
                 "f": "json", "resultOffset": offset, "resultRecordCount": 2000}
            req = urllib.request.Request(f"{CRTM}/{servicio}/FeatureServer/0/query?{urllib.parse.urlencode(p)}", headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=300) as r:
                lote = [f["attributes"] for f in json.load(r).get("features", [])]
            filas += lote
            if len(lote) < 2000:
                break
            offset += 2000
        destino.parent.mkdir(parents=True, exist_ok=True)
        destino.write_text(json.dumps(filas), encoding="utf-8")
    return pd.DataFrame(json.loads(destino.read_text(encoding="utf-8")))


def crtm_lineas(servicio: str, capa: int) -> pd.DataFrame:
    """Qué municipios recorre cada línea (combinaciones distintas de línea, municipio y zona tarifaria), de la capa de tramos."""
    destino = RAW / "crtm" / "_comunidad" / f"{servicio}_lineas.json"
    if not destino.exists():
        p = {"where": "1=1", "outFields": "NUMEROLINEAUSUARIO,CODIGOPROVINCIA,CODIGOMUNICIPIO,CORONATARIFARIA",
             "returnDistinctValues": "true", "returnGeometry": "false", "f": "json", "resultRecordCount": 2000}
        req = urllib.request.Request(f"{CRTM}/{servicio}/FeatureServer/{capa}/query?{urllib.parse.urlencode(p)}", headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=300) as r:
            d = json.load(r)
        if d.get("exceededTransferLimit"):
            raise RuntimeError(f"{servicio}: más de 2000 combinaciones, hay que paginar")
        destino.parent.mkdir(parents=True, exist_ok=True)
        destino.write_text(json.dumps([f["attributes"] for f in d["features"]]), encoding="utf-8")
    d = pd.DataFrame(json.loads(destino.read_text(encoding="utf-8")))
    return d[d["CODIGOPROVINCIA"] == "28"]


ZONAS = ["A", "B1", "B2", "B3", "C1", "C2"]


def conexion_madrid() -> pd.DataFrame:
    """Lo bien conectado que está cada municipio con Madrid, con datos del Consorcio Regional de Transportes:
    - lineas_tren_madrid: líneas de Cercanías, Metro o Metro Ligero que unen el municipio con Madrid. Las de Metro cuentan
      todas (la red está integrada: MetroSur enlaza con las líneas 3 y 10); Cercanías y Metro Ligero solo si llegan a Madrid
      (así no cuentan la C-9 Cercedilla-Cotos ni el tranvía de Parla).
    - bus_madrid: líneas de autobús interurbano que van del municipio a Madrid sin transbordo.
    - corona: zona tarifaria del abono (A, B1, B2, B3, C1, C2): de ella depende lo que cuesta ir a Madrid cada mes."""
    filas = []
    for servicio, capa, modo in [("M5_Red", 4, "Cercanías"), ("M4_Red", 4, "Metro"), ("M10_Red", 4, "Metro Ligero"), ("M8_Red", 2, "bus")]:
        d = crtm_lineas(servicio, capa).assign(modo=modo)
        llega = set(d.loc[d["CODIGOMUNICIPIO"] == "079", "NUMEROLINEAUSUARIO"])
        d["a_madrid"] = True if modo == "Metro" else d["NUMEROLINEAUSUARIO"].isin(llega)
        filas.append(d)
    d = pd.concat(filas)
    tren = d[(d["modo"] != "bus") & d["a_madrid"]].copy()
    # variantes de una misma línea (C-4a/C-4b, Metro 12-1/12-2, 10a/10b) cuentan como una
    base = tren["NUMEROLINEAUSUARIO"].str.split("-").str[0].where(tren["modo"] != "Cercanías", tren["NUMEROLINEAUSUARIO"]).str.rstrip("ab")
    tren["linea"] = [b if m == "Cercanías" else f"{m} {b}" for b, m in zip(base, tren["modo"])]
    R = pd.DataFrame(index=sorted(d["CODIGOMUNICIPIO"].unique()))
    R["lineas_tren_madrid"] = tren.groupby("CODIGOMUNICIPIO")["linea"].agg(lambda s: sorted(set(s)))
    R["bus_madrid"] = d[(d["modo"] == "bus") & d["a_madrid"]].groupby("CODIGOMUNICIPIO")["NUMEROLINEAUSUARIO"].nunique()
    validas = d[d["CORONATARIFARIA"].isin(ZONAS)]
    R["corona"] = validas.groupby("CODIGOMUNICIPIO")["CORONATARIFARIA"].agg(lambda s: s.mode().min())
    R["lineas_tren_madrid"] = R["lineas_tren_madrid"].apply(lambda x: x if isinstance(x, list) else [])
    R["bus_madrid"] = R["bus_madrid"].fillna(0).astype(int)
    return R


def fotos_wikidata() -> dict:
    """Imagen representativa (P18) de cada municipio en Wikidata, por código INE (P772). Licencias libres de Wikimedia Commons."""
    destino = RAW / "wikidata_fotos.json"
    if not destino.exists():
        q = 'SELECT ?ine ?img WHERE { ?m wdt:P772 ?ine . FILTER(STRSTARTS(?ine, "28") && STRLEN(?ine) = 5) OPTIONAL { ?m wdt:P18 ?img } }'
        req = urllib.request.Request("https://query.wikidata.org/sparql?format=json&query=" + urllib.parse.quote(q),
                                     headers={"User-Agent": "CunaYCanas/1.0 (datathon MAD Open Data 2026)"})
        with urllib.request.urlopen(req, timeout=120) as r:
            destino.write_text(r.read().decode("utf-8"), encoding="utf-8")
    fotos = {}
    for x in json.loads(destino.read_text(encoding="utf-8"))["results"]["bindings"]:
        if "img" in x and x["ine"]["value"][2:] not in fotos:
            url = x["img"]["value"].replace("http://", "https://")
            fichero = urllib.parse.unquote(url.rsplit("/", 1)[1])
            fotos[x["ine"]["value"][2:]] = {"foto": f"{url}?width=720", "foto_pagina": f"https://commons.wikimedia.org/wiki/File:{urllib.parse.quote(fichero.replace(' ', '_'))}"}
    return fotos


def serie(dataset: str, filtros: dict | None = None) -> pd.DataFrame:
    d = leer_csv(descargar_ckan(dataset))
    d = d[d["Tipo territorio"] == "Municipios"].copy()
    for c, v in (filtros or {}).items():
        d = d[d[c] == v]
    d["cod"] = d["Codigo territorio"].str[:3]
    d["v"] = pd.to_numeric(d["Valor"].str.replace(",", ".", regex=False), errors="coerce")
    return d


def ultimo(d: pd.DataFrame) -> pd.Series:
    """Valor del último año disponible de cada municipio."""
    d = d.dropna(subset=["v"]).sort_values("Ano")
    return d.groupby("cod")["v"].last()


def puntos_utm(df: pd.DataFrame, x: str, y: str) -> gpd.GeoDataFrame:
    xs = pd.to_numeric(df[x].astype(str).str.replace(",", ".", regex=False), errors="coerce")
    ys = pd.to_numeric(df[y].astype(str).str.replace(",", ".", regex=False), errors="coerce")
    ok = xs.gt(0) & ys.gt(0)
    return gpd.GeoDataFrame(df[ok].copy(), geometry=gpd.points_from_xy(xs[ok], ys[ok]), crs=M)


def main() -> None:
    # --- límites municipales (IDEM) ---
    lim = gpd.GeoDataFrame.from_features(wfs("UnidadesAdministrativas", "IDEM_CM_UNID_ADMIN")["features"], crs=4326).to_crs(M)
    lim = lim.dissolve(by="CD_MUNICIPIO", aggfunc={"DS_NOMBRE": "first"}).reset_index().rename(columns={"CD_MUNICIPIO": "cod"})
    lim["sup_km2"] = lim.geometry.area / 1e6
    cen = lim.geometry.representative_point()
    lim["dist_madrid_km"] = np.hypot(cen.x - SOL[0], cen.y - SOL[1]) / 1000
    lim.loc[lim["cod"] == "079", "dist_madrid_km"] = 0  # la propia capital
    R = pd.DataFrame({"cod": lim["cod"]}).set_index("cod")

    # --- población y natalidad (CKAN) ---
    pob = serie("poblacion_censada_por_edad_nacionalidad_y_sexo", {"Sexo": "Total", "Nacionalidad": "Total"})
    nombres = pob.drop_duplicates("cod").set_index("cod")["Territorio"]
    ult = pob["Ano"].max()
    p = pob[pob["Ano"] == ult].pivot_table(index="cod", columns="Edad", values="v", aggfunc="sum")
    R["poblacion"] = p["Total"]
    R["anio_poblacion"] = int(ult)
    primero = pob["Ano"].min()
    R["poblacion_inicio"] = pob[(pob["Ano"] == primero) & (pob["Edad"] == "Total")].set_index("cod")["v"]
    R["crecimiento_pct"] = 100 * (R["poblacion"] / R["poblacion_inicio"] - 1)
    R["periodo_crecimiento"] = f"{primero}-{ult}"
    tramo = lambda *ks: sum(p.get(k, 0).fillna(0) for k in ks)  # noqa: E731
    R["pob_0_4"] = tramo("De 0-4 años")
    R["pob_5_14"] = tramo("De 5-9 años", "De 10-14 años")
    R["pob_65"] = tramo(*[c for c in p.columns if c.startswith("De ") and int(c.split()[1].split("-")[0]) >= 65])
    R["pct_menores15"] = 100 * (R["pob_0_4"] + R["pob_5_14"]) / R["poblacion"]
    R["pct_mayores65"] = 100 * R["pob_65"] / R["poblacion"]
    nac = serie("mnp_nacidos_vivos_por_residencia_y_sexo", {"Sexo": "Total"})
    R["nacidos"] = ultimo(nac)
    R["anio_nacidos"] = int(nac["Ano"].max())
    R["tasa_natalidad"] = ultimo(serie("1915900"))
    renta = serie("irpf_indicador_renta", {"Medida": "Per cápita"})
    R["renta_per_capita"] = ultimo(renta)
    R["paro_por_100"] = ultimo(serie("1902280"))

    # --- educación (CKAN centros educativos en alta) ---
    e = leer_csv(descargar_ckan("centros_educativos"))
    e = e[e["SITUACION"] == "ALTA"].copy()
    t, tit = e["TIPO_ABRV"], e["TITULARIDAD"]
    pub, conc, priv = tit.str.startswith("PÚBLICO"), tit == "PRIVADO CONCERTADO", tit == "PRIVADO"
    infantil = t.isin(["EEI", "EEI-CN", "EIPR", "CPR INF", "ZNAS.CN."]) | t.str.startswith("CRA")
    primaria = t.str.contains("PRI") | t.str.startswith("CRA")
    secundaria = t.isin(["IES", "IESO"]) | t.str.contains("SEC") | t.eq("CPR ES")
    cuenta = lambda m: e[m].groupby("CDMUNI").size()  # noqa: E731
    R["esc_infantil_publica"] = cuenta(infantil & pub)
    R["esc_infantil_privada"] = cuenta(infantil & ~pub)
    R["colegio_publico"] = cuenta(primaria & pub)
    R["colegio_concertado"] = cuenta(primaria & conc)
    R["colegio_privado"] = cuenta(primaria & priv)
    R["instituto_publico"] = cuenta(secundaria & pub)
    R["fp"] = cuenta(t.str.contains("FP") | t.eq("IES"))

    # --- salud ---
    s = leer_csv(descargar_ckan("centros_servicios_establecimientos_sanitarios")).drop_duplicates("centro_nro_registro")
    s["mun"] = s["municipio_nombre"].map(lambda x: sin_tildes(x).lower())
    clave = {sin_tildes(v).lower(): k for k, v in nombres.items()}
    s["cod"] = s["mun"].map(clave)
    R["centros_salud"] = s[s["centro_tipo"] == "Centro de salud"].groupby("cod").size()
    R["consultorios"] = s[s["centro_tipo"] == "Consultorio de atención primaria"].groupby("cod").size()
    hosp = puntos_utm(s[s["centro_tipo"].str.startswith("Hospital general")], "localizacion_coordenada_x", "localizacion_coordenada_y")
    hx, hy = hosp.geometry.x.values, hosp.geometry.y.values
    R["hospital_km"] = pd.Series([float(np.min(np.hypot(hx - c.x, hy - c.y))) / 1000 for c in cen], index=lim["cod"])
    f = leer_csv(descargar_ckan("oficinas_farmacia"))
    f["cod"] = f["MUNICIPIO_NOMBRE"].map(lambda x: clave.get(sin_tildes(x).lower()))
    R["farmacias"] = f.groupby("cod").size()
    b = leer_csv(descargar_ckan("spacm_listado_bibliotecas_servicios_lectura"))
    b["cod"] = b["localidad"].map(lambda x: clave.get(sin_tildes(str(x)).lower()))
    R["bibliotecas"] = b.groupby("cod").size()

    # --- mayores y familia (registro de centros de atención social) ---
    a = leer_csv(descargar_ckan("atencion_social_registro_centros"))
    a["plazas"] = pd.to_numeric(a["plazas_autorizadas_numero"], errors="coerce")
    may = a[a["sector"] == "Personas mayores"]
    R["residencias"] = may[may["tipo"] == "CENTROS RESIDENCIALES"].groupby("municipio_codigo").size()
    R["plazas_residencia"] = may[may["tipo"] == "CENTROS RESIDENCIALES"].groupby("municipio_codigo")["plazas"].sum()
    dia = may[(may["tipo"] == "CENTROS DE DÍA") & (may["subtipo"] != "HOGARES Y CLUBES")]
    R["centros_dia"] = dia.groupby("municipio_codigo").size()
    R["plazas_centro_dia"] = dia.groupby("municipio_codigo")["plazas"].sum()
    R["hogares_mayores"] = may[may["subtipo"] == "HOGARES Y CLUBES"].groupby("municipio_codigo").size()
    R["centros_infancia_familia"] = a[a["sector"].isin(["Infancia", "Infancia y Adolescencia", "Familia", "Adolescencia"])].groupby("municipio_codigo").size()

    # --- transporte (CRTM) ---
    for servicio, col in [("M4_Red", "est_metro"), ("M5_Red", "est_cercanias"), ("M10_Red", "est_metro_ligero"), ("M8_Red", "paradas_interurbano"), ("M9_Red", "paradas_urbano")]:
        d = crtm(servicio)
        R[col] = d.drop_duplicates("IDESTACION").groupby("CODIGOMUNICIPIO").size()
        if servicio == "M8_Red":
            d["lineas"] = d["LINEAS"].fillna("").str.split(",")
            R["lineas_interurbanas"] = d.explode("lineas").assign(l=lambda x: x["lineas"].str.strip()).query("l != ''").groupby("CODIGOMUNICIPIO")["l"].nunique()
    con = conexion_madrid()
    R["lineas_tren_madrid"] = pd.Series({c: con["lineas_tren_madrid"].get(c, []) for c in R.index}, dtype=object)
    R["bus_madrid"] = con["bus_madrid"]
    R["corona"] = con["corona"]

    # --- planeamiento y bienestar (IDEM, toda la Comunidad sin geometría) ---
    amb = pd.DataFrame([x["properties"] for x in wfs("UsoDelSuelo", "VPLA_V_AMBITO_REF_25", "CD_MUNICIPIO,DS_NOMB_AMB,NM_VIV_TOT", "ambitos_props")["features"]])
    amb = amb.drop_duplicates(["CD_MUNICIPIO", "DS_NOMB_AMB"])
    R["viviendas_previstas"] = amb.groupby("CD_MUNICIPIO")["NM_VIV_TOT"].sum(min_count=1)
    R["ambitos_desarrollo"] = amb[amb["NM_VIV_TOT"].fillna(0) > 0].groupby("CD_MUNICIPIO").size()
    red = pd.DataFrame([x["properties"] for x in wfs("UsoDelSuelo", "VPLA_V_RED_REF_25", "CD_MUNICIPIO,DS_USO_DETA,NM_AREA", "redes_props")["features"]])
    red["NM_AREA"] = pd.to_numeric(red["NM_AREA"], errors="coerce")
    verde = red[red["DS_USO_DETA"].isin(["Parques Municipales y Urbanos", "Jardines y Plazas"])]
    # zonas verdes: parques que existen según la EIEL 2023 (155 municipios); si no está, el suelo verde del planeamiento
    eiel = pd.DataFrame([x["properties"] for x in wfs("CubiertaTerrestre", "IDEM_EIEL_PARQUE_23", "MUN,TIPOPARQUE,SUP_PARCEL")["features"]])
    parques = eiel[eiel["TIPOPARQUE"] != "REFUGIOS DE PESCA Y MONTAÑA"].groupby("MUN")["SUP_PARCEL"].sum()
    plan = verde.groupby("CD_MUNICIPIO")["NM_AREA"].sum()
    R["zonas_verdes_m2"] = parques.reindex(R.index).fillna(plan.reindex(R.index))
    R["zonas_verdes_fuente"] = np.where(R.index.isin(parques.index), "EIEL 2023 (parques existentes)", np.where(R.index.isin(plan.index), "planeamiento (suelo reservado)", None))
    R["equip_deportivos"] = red[red["DS_USO_DETA"] == "Deportivos"].groupby("CD_MUNICIPIO").size()
    R["equip_culturales"] = red[red["DS_USO_DETA"] == "Culturales"].groupby("CD_MUNICIPIO").size()
    R["planeamiento_en_idem"] = R.index.isin(red["CD_MUNICIPIO"].unique())

    # --- suelo reservado para equipamientos (de las carpetas detalladas de cada municipio) ---
    suelo = {}
    for d in PROCESSED.iterdir():
        f = d / "parcelas_vacantes.geojson"
        if not d.is_dir() or not f.exists():
            continue
        areas = [x["properties"].get("area_m2") or 0 for x in json.loads(f.read_text(encoding="utf-8"))["features"]]
        suelo[d.name.split("-")[0]] = {"suelo_equip_m2": sum(areas), "parcelas_equip": len(areas),
                                        "parcelas_equip_1500": sum(a >= 1500 for a in areas),   # cabe una escuela infantil o un centro de día
                                        "parcelas_equip_8000": sum(a >= 8000 for a in areas)}  # cabe un colegio
    for k in ("suelo_equip_m2", "parcelas_equip", "parcelas_equip_1500", "parcelas_equip_8000"):
        R[k] = pd.Series({c: v[k] for c, v in suelo.items()})
    R["suelo_detallado"] = R.index.isin(list(suelo))

    # --- derivados por habitante ---
    # --- naturaleza: parte del término municipal dentro de un espacio natural protegido o de la Red Natura 2000 (IDEM) ---
    capas = [wfs("LugaresProtegidos", c) for c in ("IDEM_MA_ENP", "IDEM_MA_RED_NATURA_LIC_ZEC")]  # sin ZEPA: protege estepas cerealistas para aves, no espacios para pasear
    prot = gpd.GeoDataFrame.from_features([f for c in capas for f in c["features"]], crs=4326).to_crs(M)
    prot = prot.geometry.make_valid().buffer(0).union_all()
    R["pct_protegido"] = pd.Series({c: 100 * shapely.make_valid(g).intersection(prot).area / g.area for c, g in zip(lim["cod"], lim.geometry)})
    R["sup_km2"] = lim.set_index("cod")["sup_km2"]
    R["dist_madrid_km"] = lim.set_index("cod")["dist_madrid_km"]
    R["densidad"] = R["poblacion"] / R["sup_km2"]
    R["viviendas_previstas_por_100hab"] = 100 * R["viviendas_previstas"] / R["poblacion"]
    R["zonas_verdes_m2_hab"] = R["zonas_verdes_m2"] / R["poblacion"]
    R["farmacias_10mil"] = 1e4 * R["farmacias"].fillna(0) / R["poblacion"]
    R["plazas_residencia_100may"] = 100 * R["plazas_residencia"].fillna(0) / R["pob_65"].replace(0, np.nan)
    R["plazas_dia_100may"] = 100 * R["plazas_centro_dia"].fillna(0) / R["pob_65"].replace(0, np.nan)
    R["atencion_primaria"] = R["centros_salud"].fillna(0) + R["consultorios"].fillna(0)
    R["tren_o_metro"] = (R[["est_metro", "est_cercanias", "est_metro_ligero"]].fillna(0).sum(axis=1) > 0)

    conteos = ["esc_infantil_publica", "esc_infantil_privada", "colegio_publico", "colegio_concertado", "colegio_privado", "instituto_publico", "fp",
               "centros_salud", "consultorios", "farmacias", "bibliotecas", "residencias", "plazas_residencia", "centros_dia", "plazas_centro_dia",
               "hogares_mayores", "centros_infancia_familia", "est_metro", "est_cercanias", "est_metro_ligero", "paradas_interurbano",
               "paradas_urbano", "lineas_interurbanas", "bus_madrid", "equip_deportivos", "equip_culturales", "ambitos_desarrollo",
               "parcelas_equip", "parcelas_equip_1500", "parcelas_equip_8000"]
    R[conteos] = R[conteos].fillna(0).astype(int)
    R["nombre"] = [nombres.get(c, lim.set_index("cod").loc[c, "DS_NOMBRE"]) for c in R.index]
    R["nombre"] = R["nombre"].str.replace(r"^(.*) \((El|La|Los|Las)\)$", r"\2 \1", regex=True)
    fotos = fotos_wikidata()
    R["foto"] = [fotos.get(c, {}).get("foto") for c in R.index]
    R["foto_pagina"] = [fotos.get(c, {}).get("foto_pagina") for c in R.index]
    R = R[R["poblacion"].notna()]  # 998 y 999 son terrenos comuneros sin población
    R = R.drop(columns=["poblacion_inicio"]).round(2)
    filas = [{"cod_ine": c, **{k: (None if (isinstance(v, float) and np.isnan(v)) else (v.item() if hasattr(v, "item") else v)) for k, v in r.items()}} for c, r in R.iterrows()]
    # modelo de población (etl/modelo_poblacion.py): habitantes por vivienda completa de cada municipio, con su rango, y parámetros comunes
    mp = MP.cargar()
    for f in filas:
        carpeta = next(PROCESSED.glob(f"{f['cod_ine']}-*"), None)
        rasgos = (MP.rasgos_municipio(carpeta) if carpeta else None) or {"tam": mp["tam_mediana_global"], "men15": f["pct_menores15"] or mp["men15_mediana_global"]}
        f["hab_por_vivienda"] = MP.hab_por_vivienda(mp, rasgos)
    getafe = next(PROCESSED.glob("065-*/demanda.json"), None)
    reparto = json.loads(getafe.read_text(encoding="utf-8"))["calibracion"]["reparto_menores"] if getafe else None
    parametros = {"municipio": f"{mp['calibracion']['n_barrios']} barrios nuevos de {mp['calibracion']['n_municipios']} municipios",
                  "parametros": {"hab_por_vivienda": MP.hab_por_vivienda(mp, None), "pct_menores18": mp["pct_menores18"], "pct_mayores65": mp["pct_mayores65"]},
                  "reparto_menores": reparto, "criterio": mp["calibracion"]["criterio"], "prueba": mp["resumen_prueba"]}
    doc = {"generado": pd.Timestamp.now().strftime("%Y-%m-%d"), "n": len(filas), "modelo": parametros,
           "municipios": sorted(filas, key=lambda x: x["nombre"])}
    (PROCESSED / "municipios_resumen.json").write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")

    geo = lim.loc[lim["cod"].isin(R.index), ["cod", "geometry"]].copy()
    geo["nombre"] = geo["cod"].map(R["nombre"])
    geo["geometry"] = geo.geometry.simplify(120, preserve_topology=True)
    geo = geo.to_crs(4326)
    geo["geometry"] = geo.geometry.set_precision(1e-5, mode="pointwise")
    (PROCESSED / "municipios.geojson").write_text(geo.rename(columns={"cod": "cod_ine"}).to_json(drop_id=True, ensure_ascii=False), encoding="utf-8")
    print(f"{len(filas)} municipios · {(PROCESSED / 'municipios_resumen.json').stat().st_size // 1000} KB · límites {(PROCESSED / 'municipios.geojson').stat().st_size // 1000} KB")
    for c in ["poblacion", "nacidos", "renta_per_capita", "colegio_publico", "atencion_primaria", "hospital_km", "farmacias", "est_cercanias", "viviendas_previstas", "zonas_verdes_m2_hab"]:
        print(f"  {c:28s} sin dato en {int(R[c].isna().sum())} · mediana {R[c].median():.1f}")


if __name__ == "__main__":
    main()
