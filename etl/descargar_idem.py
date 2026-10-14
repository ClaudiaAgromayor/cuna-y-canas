"""Descarga por WFS las capas de la IDEM de un municipio a data/raw/idem/<cod>-<slug>/.

Uso: python etl/descargar_idem.py MUNICIPIO        (nombre o código INE de 3 dígitos)
     python etl/descargar_idem.py Getafe

Todas las capas se filtran por código de municipio (CD_MUNICIPIO), no por nombre, para evitar problemas
con tildes y eñes. Si el fichero ya existe no se vuelve a descargar (usar --forzar para repetirlo).
"""
import json
import sys
import urllib.parse
import urllib.request

from comun import RAW, resolver_municipio, slug

WFS = "https://idem.comunidad.madrid/geoidem/UsoDelSuelo/wfs"

CAPAS = [
    "VPLA_V_RED_REF_25",        # planeamiento refundido 2025: redes (dotaciones públicas)
    "VPLA_V_AMBITO_REF_25",     # ámbitos y viviendas previstas
    "VPLA_V_ORDENANZA_REF_25",  # ordenanzas (usos y edificabilidad)
    "IDEM_V_SUELO_PARCELA",     # parcelas del Portal del Suelo, con geometría
    "IDEM_VPLA_SVAC_SOCU_26",   # suelo vacante y ocupado (2026)
]


def get_features(capa: str, cod: str) -> dict:
    params = {
        "service": "WFS", "version": "2.0.0", "request": "GetFeature",
        "typeNames": f"UsoDelSuelo:{capa}", "outputFormat": "application/json",
        "srsName": "EPSG:4326", "CQL_FILTER": f"CD_MUNICIPIO='{cod}'",
    }
    with urllib.request.urlopen(f"{WFS}?{urllib.parse.urlencode(params)}", timeout=300) as r:
        return json.load(r)


def carpeta_raw(muni: dict):
    return RAW / "idem" / f"{muni['cod']}-{muni['slug']}"


def descargar(muni: dict, forzar: bool = False) -> None:
    out = carpeta_raw(muni)
    out.mkdir(parents=True, exist_ok=True)
    for capa in CAPAS:
        destino = out / f"{capa}.geojson"
        if destino.exists() and not forzar:
            print(f"{capa:28s} ya descargada ({destino.stat().st_size // 1000} KB)")
            continue
        fc = get_features(capa, muni["cod"])
        destino.write_text(json.dumps(fc, ensure_ascii=False), encoding="utf-8")
        print(f"{capa:28s} {len(fc.get('features', [])):6d} elementos -> {destino.name}")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        raise SystemExit(__doc__)
    descargar(resolver_municipio(args[0]), forzar="--forzar" in sys.argv)
