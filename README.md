# Cuna y Canas

Qué hace falta y qué viene en tu barrio. MAD Open Data Challenge 2026.

Las decisiones y el estado del proyecto están en [DECISIONES.md](DECISIONES.md).

## Estructura

```
etl/             scripts Python: descarga por API y procesado
data/raw/        datos tal como llegan de las API (no se versiona)
data/processed/  GeoJSON/JSON ligeros que lee la web
web/             aplicación web (Vite + React + MapLibre)
docs/            documentos del concurso, validación y capturas
```

## Puesta en marcha en local

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python etl/descargar_idem.py GETAFE 065   # capas de la IDEM (planeamiento, suelo)
python etl/descargar_ckan.py Getafe        # centros, natalidad y población (admite nombre o código INE)
python etl/procesar_idem.py Getafe         # capas ligeras de suelo y planeamiento (descarga lo que falte)
python etl/verificar.py                    # comprueba que no se mezclan municipios
```
