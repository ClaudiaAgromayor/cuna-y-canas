# Cuna y Canas

Qué hace falta y qué viene en tu barrio. MAD Open Data Challenge 2026.

Herramienta de datos abiertos con tres secciones sobre los mismos datos:

- **¿Dónde vivir?** Compara los 179 municipios de la Comunidad de Madrid según tu situación (bebé, hijos en edad escolar, mayores, trabajo en Madrid…) y lo que te importa (24 criterios). Ficha de cada municipio con lo que hay y lo que viene.
- **Barrios.** Qué servicios hay y cuáles vienen alrededor de cada barrio en desarrollo, con su estado y su fuente oficial.
- **Planificar** (para técnicos). Cuánta demanda habrá año a año, dónde poner nuevos centros sobre suelo vacante, cuándo hacen falta y si la propuesta aguanta con otros supuestos.

Las decisiones, hallazgos y el estado del proyecto están en [DECISIONES.md](DECISIONES.md).

## Estructura

```
etl/             scripts Python: descarga por API y procesado
data/raw/        datos tal como llegan de las API (no se versiona)
data/processed/  GeoJSON/JSON ligeros que lee la web (una carpeta por municipio)
web/             aplicación web (Vite + React + TypeScript + MapLibre + Tailwind)
docs/            documentos del concurso
```

## Datos

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python etl/municipios_resumen.py             # indicadores de los 179 municipios para "¿Dónde vivir?"
python etl/vivienda_nueva.py                 # solares para vivienda sin construir (después del resumen: le añade los recuentos)
python etl/redes_catastro.py                 # ¿hecha o no? estado de zonas verdes y equipamientos con el catastro
python etl/paquete_datos.py                  # datasets para descargar (CSV, ZIP y diccionario)
python etl/pipeline.py Getafe Navalcarnero   # detalle de uno o varios municipios: CKAN, IDEM, INE, CRTM, demanda y verificación
python etl/lote.py                           # detalle de todos los municipios (unos 40 minutos)
python etl/verificar.py                      # comprueba que ningún fichero mezcla municipios
```

Fuentes, todas por API: Portal de Datos Abiertos de la Comunidad de Madrid (CKAN), IDEM (WFS), INE (Atlas de Distribución de Renta por sección censal), Consorcio Regional de Transportes (servicios de datos abiertos), Wikidata/Wikimedia Commons (fotos con licencia libre) y CartoCiudad (buscador de direcciones).

## Web

```bash
cd web
npm install
npm run dev      # http://localhost:5173 (lee los datos de data/processed)
npm run build    # versión de producción en web/dist
```

## Publicación en Oracle Cloud

La web publicada: https://objectstorage.eu-madrid-1.oraclecloud.com/n/axo19lrq7chl/b/cuna-y-canas/o/index.html

Para volver a publicar después de cambios (necesita `%USERPROFILE%\.oci\config` y la clave de API; la clave nunca va al repositorio):

```bash
py -3.13 -m venv .venv-oci
.venv-oci\Scripts\pip install oci-cli
cd web && npm run build && cd ..
.venv-oci\Scripts\python despliegue\oracle.py   # sube solo lo que ha cambiado, comprimido
```
