"""Descarga por la API de CKAN los datasets de la Comunidad de Madrid y deja los de un municipio en data/processed.

Uso: python etl/descargar_ckan.py MUNICIPIO        (nombre o código INE de 3 dígitos)
     python etl/descargar_ckan.py Getafe
     python etl/descargar_ckan.py 096

Genera data/processed/<cod>-<slug>/ con:
  centros_educativos.geojson   solo centros en ALTA y con coordenadas
  centros_sanitarios.geojson   un elemento por centro (se agrupan las ofertas asistenciales)
  centros_sociales.geojson     centros de atención social con plazas y sector
  natalidad.json               nacidos vivos por año y tasa bruta de natalidad
  poblacion.json               población censada por tramo de edad y año
  _control_ckan.json           recuento de filas en cada paso, para detectar pérdidas
"""
import json
import sys

import geopandas as gpd
import pandas as pd

from comun import RAW_CKAN, UTM_ETRS89_30N, carpeta_salida, descargar_ckan, leer_csv, resolver_municipio, sin_tildes


RADIO_MAX_M = 15_000  # un punto más lejos que esto de la mediana del municipio se considera coordenada errónea


def a_geojson(df: pd.DataFrame, x: str, y: str, columnas: dict, muni: dict, ruta, ctrl: dict, clave: str) -> None:
    """Convierte UTM->WGS84, descarta coordenadas ausentes o absurdas y guarda GeoJSON.

    Anota en `ctrl` cuántos puntos se guardan y cuáles se descartan (sin coordenadas o fuera del municipio).
    """
    xs, ys = pd.to_numeric(df[x], errors="coerce"), pd.to_numeric(df[y], errors="coerce")
    ok = xs.gt(0) & ys.gt(0)
    cerca = ((xs - xs[ok].median()).abs() < RADIO_MAX_M) & ((ys - ys[ok].median()).abs() < RADIO_MAX_M)
    sel = df[ok & cerca].rename(columns=columnas)[list(columnas.values())].copy()
    sel["cod_ine"] = muni["cod"]  # cada elemento lleva su municipio: permite detectar mezclas
    g = gpd.GeoDataFrame(sel, geometry=gpd.points_from_xy(xs[ok & cerca], ys[ok & cerca]), crs=UTM_ETRS89_30N).to_crs(4326)
    g.geometry = g.geometry.set_precision(1e-6)
    ruta.write_text(g.to_json(drop_id=True, ensure_ascii=False), encoding="utf-8")
    ctrl[f"{clave}_guardados"] = len(sel)
    ctrl[f"{clave}_sin_coordenadas"] = int((~ok).sum())
    ctrl[f"{clave}_coordenadas_fuera_del_municipio"] = int((ok & ~cerca).sum())


def educativos(muni, out, ctrl):
    d = leer_csv(descargar_ckan("centros_educativos"))
    d = d[d["CDMUNI"] == muni["cod"]]
    ctrl["educativos_municipio"] = len(d)
    d = d[d["SITUACION"] == "ALTA"]
    ctrl["educativos_en_alta"] = len(d)
    cols = {"CODIGO": "codigo", "CENTRO": "nombre", "TIPO_ABRV": "tipo", "TIPO_EXT": "tipo_largo",
            "TITULARIDAD": "titularidad", "DOMICILIO": "direccion", "CDPOSTAL": "cp", "DISTRITO": "distrito"}
    a_geojson(d, "UTM_X", "UTM_Y", cols, muni, out / "centros_educativos.geojson", ctrl, "educativos")


def sanitarios(muni, out, ctrl):
    d = leer_csv(descargar_ckan("centros_servicios_establecimientos_sanitarios"))
    nombres = {sin_tildes(muni["nombre"]).lower(), sin_tildes(muni["nombre_ckan"]).lower()}
    d = d[d["municipio_nombre"].map(lambda t: sin_tildes(t).lower()).isin(nombres)]
    ctrl["sanitarios_filas"] = len(d)
    # el fichero trae una fila por oferta asistencial: se agrupa por número de registro
    agr = d.groupby("centro_nro_registro", sort=False).agg(
        tipo=("centro_tipo", "first"), dependencia=("dependecia_funcional", "first"),
        direccion=("direccion_vial_nombre", "first"), cp=("direccion_codigo_postal", "first"),
        x=("localizacion_coordenada_x", "first"), y=("localizacion_coordenada_y", "first"),
        ofertas=("oferta_asistecial", lambda s: sorted(set(s)))).reset_index().rename(columns={"centro_nro_registro": "registro"})
    agr["n_ofertas"] = agr["ofertas"].map(len)
    agr["ofertas"] = agr["ofertas"].map(lambda o: "; ".join(o))
    ctrl["sanitarios_centros"] = len(agr)
    cols = {c: c for c in ["registro", "tipo", "dependencia", "direccion", "cp", "n_ofertas", "ofertas"]}
    a_geojson(agr, "x", "y", cols, muni, out / "centros_sanitarios.geojson", ctrl, "sanitarios")


def sociales(muni, out, ctrl):
    d = leer_csv(descargar_ckan("atencion_social_registro_centros"))
    d = d[d["municipio_codigo"] == muni["cod"]].copy()
    ctrl["sociales_municipio"] = len(d)
    d["plazas"] = pd.to_numeric(d["plazas_autorizadas_numero"], errors="coerce")
    d["direccion"] = (d["direccion_via_tipo"] + " " + d["direccion_via_nombre"] + " " + d["direccion_portal"]).str.strip()
    cols = {"numero_registro": "registro", "sector": "sector", "tipo": "tipo", "subtipo": "subtipo",
            "denominacion": "nombre", "plazas": "plazas", "direccion": "direccion", "entidad_naturaleza": "naturaleza"}
    a_geojson(d, "direccion_coor_x", "direccion_coor_y", cols, muni, out / "centros_sociales.geojson", ctrl, "sociales")


def serie_municipal(nombre_dataset: str, muni: dict, filtros: dict | None = None) -> pd.DataFrame:
    """Filas de un dataset estadístico (código de territorio de 4 dígitos) que son del municipio."""
    d = leer_csv(descargar_ckan(nombre_dataset))
    d = d[(d["Tipo territorio"] == "Municipios") & (d["Codigo territorio"].str[:3] == muni["cod"])]
    for col, val in (filtros or {}).items():
        d = d[d[col] == val]
    return d


def demografia(muni, out, ctrl):
    nac = serie_municipal("mnp_nacidos_vivos_por_residencia_y_sexo", muni, {"Sexo": "Total"})
    tasa = serie_municipal("1915900", muni)
    natalidad = {
        "cod_ine": muni["cod"],
        "nacidos_vivos": {int(r.Ano): int(r.Valor) for r in nac.itertuples() if r.Valor.isdigit()},
        "tasa_bruta_por_mil": {int(r.Ano): float(r.Valor) for r in tasa.itertuples() if r.Valor.replace(".", "", 1).isdigit()},
    }
    (out / "natalidad.json").write_text(json.dumps(natalidad, ensure_ascii=False, indent=1), encoding="utf-8")
    ctrl["natalidad_anios"] = len(natalidad["nacidos_vivos"])

    pob = serie_municipal("poblacion_censada_por_edad_nacionalidad_y_sexo", muni, {"Sexo": "Total", "Nacionalidad": "Total"})
    por_anio: dict = {}
    for r in pob.itertuples():
        por_anio.setdefault(r.Ano, {})[r.Edad] = int(r.Valor) if r.Valor.isdigit() else None
    (out / "poblacion.json").write_text(
        json.dumps({"cod_ine": muni["cod"], "fuente": "Censo anual, Comunidad de Madrid", "por_anio": por_anio}, ensure_ascii=False, indent=1),
        encoding="utf-8")
    ctrl["poblacion_anios"] = len(por_anio)
    ctrl["poblacion_total_ultimo_anio"] = por_anio.get(max(por_anio), {}).get("Total") if por_anio else None


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    muni = resolver_municipio(sys.argv[1])
    out = carpeta_salida(muni)
    print(f"Municipio: {muni['nombre']} (INE {muni['cod']}) -> {out}")
    ctrl: dict = {"municipio": muni}
    for paso in (educativos, sanitarios, sociales, demografia):
        paso(muni, out, ctrl)
        print(f"  {paso.__name__:12s} ok")
    (out / "_control_ckan.json").write_text(json.dumps(ctrl, ensure_ascii=False, indent=1), encoding="utf-8")
    for k, v in ctrl.items():
        if k != "municipio":
            print(f"  {k:34s} {v}")


if __name__ == "__main__":
    main()
