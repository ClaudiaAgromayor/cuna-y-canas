# Cuna y Canas

**What's missing and what's coming to your neighbourhood: from the cradle to the grey hairs ("de la cuna a las canas").**

**First place at the MAD Open Data Challenge 2026** (Universidad Carlos III de Madrid and Comunidad de Madrid, final on 20 October 2026).

Most tools tell you where to live *today*. Cuna y Canas tells you what will be missing *tomorrow*, and where to put it. It turns the Comunidad de Madrid's open data into answers for two audiences, with the same data behind both:

- **Where to live** (*¿Dónde vivir?*). Ranks the 179 municipalities of the Comunidad de Madrid for your situation (a baby, school-age children, older parents, commuting to Madrid) and for what you care about (24 criteria, each one an official figure with its source in view). Each municipality has a sheet with what it has and what is coming.
- **Neighbourhoods** (*Barrios*). What is within a 5 to 20 minute walk of each neighbourhood, and what is on its way, with each service's status and official source.
- **Plan** (*Planificar*, for planners). How much demand there will be year by year, where new centres could go on vacant public land, when each one is needed, and how the result changes if you move a centre, remove one, or change the birth rate or the pace of new arrivals.

**Try it:** [live prototype](https://objectstorage.eu-madrid-1.oraclecloud.com/n/axo19lrq7chl/b/cuna-y-canas/o/index.html) and [open datasets](https://objectstorage.eu-madrid-1.oraclecloud.com/n/axo19lrq7chl/b/cuna-y-canas/o/datos/index.html) (CSV, ZIP and data dictionary).

### How it works

1. **Data**: open data only, all through APIs: the Comunidad de Madrid open data portal (CKAN) for schools, health and social centres, population and births; the IDEM spatial data infrastructure (WFS) for urban planning and vacant land; INE (Atlas of Household Income Distribution) for population by age and household size per census tract; and the Regional Transport Consortium for stops and lines. Wikidata/Commons provides licensed photos and CartoCiudad provides address search.
2. **Cleaning**: official data is not ready to use (for example, 42% of Getafe's land parcels have invalid geometries). The pipeline repairs them, computes missing areas, merges neighbourhoods drawn in several pieces, and verifies that no file mixes municipalities.
3. **Population model**: new-neighbourhood population = dwellings still to be built x people per dwelling. People per dwelling comes from a small ridge regression on the log scale, trained on 28 already-inhabited neighbourhoods from 17 municipalities, using the municipality's household size and share of under-15s. Leaving a whole municipality out for testing, the mean error is **13.1%** against **25.1%** for the simple rule (dwellings x household size), and the stated range contains the real value in 79% of the neighbourhoods. Every figure is shown with a range.
4. **Demand and siting**: demand = people of the relevant age x usage rate, spread over census tracts (today) and unbuilt residential plots (future). Existing centres absorb nearby demand first; new centres are placed greedily on vacant equipment parcels, each one covering the most uncovered demand within walking distance without exceeding its capacity.

### Limitations

Distances are straight lines (80 m/min), not street routes. Usage rates and capacities are adjustable assumptions, and those without a source are marked "to be verified". Public land is inferred from the planning data ("ownership to be confirmed"). Tenders and works in progress are not integrated yet. The planner access is a demo with no password. The estimate of dwellings still to be built (222,705, with a plausible range of 180,000 to 310,000) is our own, not an official figure.

*The rest of this file is in Spanish.*

---

# En español


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
python etl/modelo_poblacion.py                # modelo de población: calibra con 28 barrios nuevos de 17 municipios y hace la prueba con el pasado
python etl/lote_demanda.py                   # recalcula la demanda de todos los municipios con ese modelo (unos 4 minutos)
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
