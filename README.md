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
python etl/pipeline.py Getafe Navalcarnero   # todo: CKAN, IDEM, INE, CRTM, zonas de salud, demanda y verificación
```

## Web

```bash
cd web
npm install
npm run dev      # http://localhost:5173 (lee los datos de data/processed)
npm run build    # versión de producción en web/dist
```
