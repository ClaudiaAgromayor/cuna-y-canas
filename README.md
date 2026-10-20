# Cuna y Canas

**What's missing and what's coming to your neighbourhood: from the cradle to the grey hairs** (*"de la cuna a las canas"*).

**First place at the MAD Open Data Challenge 2026** (Universidad Carlos III de Madrid and Comunidad de Madrid).

Most tools tell you where to live *today*. Cuna y Canas tells you what will be missing *tomorrow* (schools, health centres, day centres, care homes) and where to put it, using only the open data of the Comunidad de Madrid.

- **Live prototype:** <https://objectstorage.eu-madrid-1.oraclecloud.com/n/axo19lrq7chl/b/cuna-y-canas/o/index.html>
- **Open datasets** (CSV, ZIP, data dictionary): <https://objectstorage.eu-madrid-1.oraclecloud.com/n/axo19lrq7chl/b/cuna-y-canas/o/datos/index.html>

## What it does

- **Where to live.** Ranks the 179 municipalities for your situation (baby, school-age children, older parents, commuting to Madrid) using 24 official criteria, each with its source in view. Printable sheet per municipality and side-by-side comparison.
- **Neighbourhoods.** What is within a 5 to 20 minute walk of each neighbourhood under development, and what is on its way.
- **Plan** (for planners, demo access with no password). Demand year by year, where new centres could go on vacant land and when they are needed. Move or remove a centre, or change birth rate, arrivals or walking time, and everything is recalculated.

## How it works

1. **Data.** Open APIs only: Comunidad de Madrid open data portal (CKAN) and its spatial data infrastructure (IDEM, urban planning and land registry parcels), INE (population by age and household size per census tract) and the Regional Transport Consortium (stops and lines). The pipeline repairs invalid geometries and verifies that no file mixes municipalities.
2. **Population model.** Future population = dwellings still to be built x people per dwelling. A small ridge regression (household size and share of under-15s of the municipality, log scale) is trained on 28 already-inhabited neighbourhoods from 17 municipalities to predict people per dwelling in neighbourhoods that do not exist yet. Leaving each whole municipality out of training, the mean error is **13.1%** against **25.1%** for the simple rule (dwellings x household size), and the stated range contains the real value in 79% of cases. It is tested on built neighbourhoods; the future itself cannot be tested.
3. **Demand and siting.** Demand = people of the relevant age x usage rate. Existing centres absorb nearby demand first; new centres go greedily on vacant facility parcels, each covering the most uncovered demand within walking distance without exceeding its capacity.
4. **Dwellings still to be built.** Of 513,487 dwellings foreseen by planning (144 municipalities, outside Madrid city), the land registry shows about **222,705** unbuilt (our own estimate; plausible range 180,000 to 310,000), enough for **0.47 to 0.67 million** people and **38,000 to 93,000** school places.

## Limitations

Distances are straight lines (80 m per minute), not street routes. Usage rates and capacities are adjustable assumptions, those without a source are marked "to be verified". Public land is inferred from planning data. Tenders and works in progress are not integrated yet.

## Run it

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python etl/pipeline.py Getafe     # data of one municipality (use etl/lote.py for all, about 40 minutes)
python etl/modelo_poblacion.py    # population model and its test
python etl/lote_demanda.py        # demand for all municipalities
python etl/municipios_resumen.py  # indicators for "Where to live"
python etl/vivienda_nueva.py      # unbuilt residential plots
python etl/redes_catastro.py      # built or not, from the land registry
python etl/paquete_datos.py       # downloadable datasets
python etl/verificar.py           # consistency checks

cd web
npm install
npm run dev                       # http://localhost:5173
npm run build                     # production build in web/dist
```

Publishing to Oracle Cloud: `.venv-oci\Scripts\python despliegue\oracle.py` (needs your own `%USERPROFILE%\.oci\config` and API key, which never go into the repository).

Decisions and findings are in [DECISIONES.md](DECISIONES.md) (in Spanish). Team: Lucía Cordero and Claudia Agromayor.
