"""Utilidades compartidas por los scripts de ETL: rutas, lectura robusta de CSV y resolución de municipios."""
import json
import re
import unicodedata
import urllib.request
from pathlib import Path

import pandas as pd

RAIZ = Path(__file__).resolve().parent.parent
RAW = RAIZ / "data" / "raw"
RAW_CKAN = RAW / "ckan"
PROCESSED = RAIZ / "data" / "processed"
CKAN = "https://datos.comunidad.madrid/api/3/action/"
UTM_ETRS89_30N = "EPSG:25830"  # coordenadas UTM de los catálogos de la Comunidad


def sin_tildes(texto: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", str(texto)) if unicodedata.category(c) != "Mn")


def slug(texto: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", sin_tildes(texto).lower()).strip("-")


def descargar_ckan(dataset: str, destino: Path | None = None, forzar: bool = False) -> Path:
    """Descarga el primer CSV de un dataset CKAN usando la API (package_show). Reutiliza el fichero si ya existe."""
    destino = destino or RAW_CKAN / f"{dataset}.csv"
    if destino.exists() and not forzar:
        return destino
    with urllib.request.urlopen(f"{CKAN}package_show?id={dataset}", timeout=60) as r:
        recursos = json.load(r)["result"]["resources"]
    url = next(x["url"] for x in recursos if x["format"].upper() == "CSV")
    destino.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(url, timeout=300) as r:
        destino.write_bytes(r.read())
    return destino


def leer_csv(ruta: Path) -> pd.DataFrame:
    """Lee un CSV de la Comunidad (separador ';', UTF-8 o Windows-1252) y normaliza los nombres de columna."""
    for enc in ("utf-8-sig", "cp1252"):
        try:
            df = pd.read_csv(ruta, sep=";", encoding=enc, dtype=str, keep_default_na=False)
            break
        except UnicodeDecodeError:
            continue
    else:
        raise ValueError(f"No se pudo decodificar {ruta}")
    df.columns = [sin_tildes(c).strip() for c in df.columns]
    return df


def resolver_municipio(entrada: str) -> dict:
    """Devuelve {cod, nombre, slug} a partir de un código INE de 3 dígitos o de un nombre.

    La fuente de verdad es el censo anual de la Comunidad (CKAN), cuyo código de territorio
    son 4 dígitos: los 3 primeros son el código INE del municipio y el cuarto es un dígito de control.
    """
    pob = leer_csv(descargar_ckan("poblacion_censada_por_edad_nacionalidad_y_sexo", RAW_CKAN / "poblacion_censada_edad.csv"))
    mun = pob[pob["Tipo territorio"] == "Municipios"][["Codigo territorio", "Territorio"]].drop_duplicates()
    mun["cod"] = mun["Codigo territorio"].str[:3]
    entrada = entrada.strip()
    if entrada.isdigit():
        hit = mun[mun["cod"] == entrada.zfill(3)]
    else:
        clave = sin_tildes(entrada).lower()
        norm = mun["Territorio"].map(lambda t: sin_tildes(t).lower())
        hit = mun[norm == clave]
        if hit.empty:
            hit = mun[norm.str.contains(clave, regex=False)]
    if len(hit) != 1:
        cand = ", ".join(f"{r.cod} {r.Territorio}" for r in hit.itertuples()) or "ninguno"
        raise SystemExit(f"Municipio '{entrada}' no resuelto de forma unívoca. Candidatos: {cand}")
    fila = hit.iloc[0]
    nombre = re.sub(r"^(.*) \((El|La|Los|Las)\)$", r"\2 \1", fila["Territorio"])  # 'Álamo (El)' -> 'El Álamo'
    return {"cod": fila["cod"], "nombre": nombre, "nombre_ckan": fila["Territorio"], "slug": slug(nombre)}


def carpeta_salida(muni: dict) -> Path:
    out = PROCESSED / f"{muni['cod']}-{muni['slug']}"
    out.mkdir(parents=True, exist_ok=True)
    return out
