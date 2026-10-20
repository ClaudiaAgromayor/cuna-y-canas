# Cuna y Canas

**What's missing and what's coming to your neighbourhood: from the cradle to the grey hairs** (*"de la cuna a las canas"*).

**First place at the MAD Open Data Challenge 2026** (Universidad Carlos III de Madrid and Comunidad de Madrid, final held on 20 October 2026 at Digitaliza Madrid).

Most tools tell you where to live *today*. Cuna y Canas tells you what will be missing *tomorrow*, and where to put it. It turns the open data of the Comunidad de Madrid into answers for two audiences, with the same data behind both: families looking for a home, and the planners who decide where schools, health centres and care homes go.

- **Live prototype:** <https://objectstorage.eu-madrid-1.oraclecloud.com/n/axo19lrq7chl/b/cuna-y-canas/o/index.html>
- **Open datasets** (CSV, ZIP and data dictionary): <https://objectstorage.eu-madrid-1.oraclecloud.com/n/axo19lrq7chl/b/cuna-y-canas/o/datos/index.html>

Team: Lucía Cordero and Claudia Agromayor.

## Contents

1. [What it does](#what-it-does)
2. [Key figures](#key-figures)
3. [Data sources](#data-sources)
4. [Data cleaning and verification](#data-cleaning-and-verification)
5. [How many people will live in a new neighbourhood: the population model](#how-many-people-will-live-in-a-new-neighbourhood-the-population-model)
6. [Demand: who needs what, and where](#demand-who-needs-what-and-where)
7. [Where to put a new centre](#where-to-put-a-new-centre)
8. [How municipalities are ranked](#how-municipalities-are-ranked)
9. [Datasets we publish](#datasets-we-publish)
10. [Limitations](#limitations)
11. [Repository structure](#repository-structure)
12. [Reproducing the data](#reproducing-the-data)
13. [Running the web app](#running-the-web-app)
14. [Publishing to Oracle Cloud](#publishing-to-oracle-cloud)

## What it does

Three sections on top of the same data:

- **Where to live** (*¿Dónde vivir?*). Ranks the 179 municipalities of the Comunidad de Madrid for your situation (a baby, school-age children, caring for older parents, commuting to Madrid) and for what you care about (24 criteria, each one an official figure with its source in view). Each municipality has a sheet, printable as a PDF, with what it has and what is coming, and municipalities can be compared side by side.
- **Neighbourhoods** (*Barrios*). What is within a 5 to 20 minute walk of each neighbourhood under development, and what is on its way, with each service's status and official source. Nothing is pre-selected: you choose what you are looking for. A neighbourhood sheet can be saved as a PDF.
- **Plan** (*Planificar*, for planners). How much demand there will be year by year, where new centres could go on vacant public land, and when each one is needed. Planners can move a centre, remove one, or change the birth rate, the pace of new arrivals, the walking time, the usage rates or the capacities, and everything is recalculated immediately. A read-only version of the plan is available to anyone from the municipality sheet.

The planner access is a demo and needs no password.

## Key figures

| Figure | Value | Note |
|---|---|---|
| Municipalities in the ranking | **179** | 178 with detailed data |
| Dwellings foreseen by urban planning (outside Madrid city) | **513,487** | in 144 municipalities |
| Of those, still unbuilt according to the land registry | **222,705** | in 143 municipalities; our own estimate, plausible range 180,000 to 310,000 |
| People who could arrive in those dwellings | **0.47 to 0.67 million** | from the population model |
| School places that would be needed | **38,000 to 93,000** | |
| Health-centre equivalents | **19 to 27** | |
| Example, Getafe | 25,388 planned, 3,095 unbuilt, **5,000 to 7,000** more people | most of the plan is already built |
| Example, Los Molinos (Getafe) | 11,473 residents, no health centre or public nursery within 10 minutes on foot, 72% of the land reserved for facilities still empty | |

## Data sources

Open data only, all retrieved through APIs.

| Source | Used for | Not used for |
|---|---|---|
| **CKAN** open data portal of the Comunidad de Madrid (`datos.comunidad.madrid`) | Schools, health centres and social-care centres (with places), registered population by age (2021 to 2025), births, pharmacies, libraries, income per head, unemployment | Tenders and works (not integrated yet) |
| **IDEM**, the spatial data infrastructure of the Comunidad de Madrid (WFS) | Urban planning 2025 (neighbourhoods under development and their planned dwellings), vacant and occupied land 2026 (land registry parcels), census tracts, municipal boundaries | Land ownership (public land is inferred from the planning data) |
| **INE**, Atlas of Household Income Distribution (table 31105) | Population by age and household size per census tract, 2015 to 2023 | Data after 2023 at census-tract level |
| **CRTM**, Regional Transport Consortium | Stops and lines of Metro, commuter rail and buses, with accessibility | Travel times (only typical speeds are used) |
| Wikidata / Wikimedia Commons | Freely licensed photos of municipalities | |
| CartoCiudad | Address search | |

The IDEM (*Infraestructura de Datos Espaciales de la Comunidad de Madrid*) is the Comunidad's official map server: a WFS service from which geographic features (parcels, planning areas, census tracts) are downloaded together with their attributes. CKAN is the software behind the open data portal, which offers the tabular datasets.

Why these sources: they are official, they can be checked and re-requested when they change, and they cover all 179 municipalities with the same code.

## Data cleaning and verification

Official data does not arrive ready to use. The pipeline handles, automatically:

- **Invalid geometries.** In Getafe, 10,340 of 24,765 land parcels (42%) have invalid polygons (self-intersections, collapsed rings). They are repaired with a standard geometry-repair function, and total area changes by only 0.25%.
- **Missing areas.** The area field of the vacant/occupied land layer is empty, so areas are computed from the geometry in metres (ETRS89 / UTM 30N).
- **Neighbourhoods drawn in several pieces.** Each piece repeats the same dwelling count, so pieces are merged by name and dwellings are counted once (in Getafe, 44 polygons are 31 neighbourhoods).
- **Parcels without area.** 52 of the 371 candidate parcels in Getafe have zero area and are discarded, as are 25 smaller than 50 m².
- **Mixed-up codes.** Health-zone codes differ between datasets, so they are matched by geometry. One "Navalcarnero" bus stop was in Villarrubia de los Ojos (Ciudad Real), 123 km away, because a municipality code repeats in another province; stops are now also filtered by province.
- **Automatic verification** (`etl/verificar.py`): every file carries the municipality's INE code, nothing lies more than 25 km from the municipality, no geometry is empty or invalid, and the web payload per municipality stays small. The process fails if any check fails.

We also found errors in official data (health centres placed in another city with a same-named street, stops from Ciudad Real tagged with a Madrid municipality code) that could be returned to the Comunidad.

## How many people will live in a new neighbourhood: the population model

Urban planning says how many dwellings a new neighbourhood will have, but not how many people will live in them. The forecast is a product of two numbers:

> **future population = dwellings still to be built x people per dwelling**

The dwellings are known (planning data and land registry). The unknown is people per dwelling in neighbourhoods that do not exist yet. The model is trained to predict exactly that, so it can be applied to neighbourhoods that have not been built.

**Why not just multiply by the household size?** The simple rule (dwellings x median household size of the municipality) assumes new neighbourhoods look like the rest of the town. They do not: not all planned dwellings are occupied, and new households tend to be smaller. In Getafe the municipal household is about 2.6 people, while its new neighbourhoods have 1.5 to 2.2 people per dwelling (median 2.0).

**Training data.** 28 already-inhabited new neighbourhoods from 17 municipalities, selected as planning areas with at least 500 planned dwellings, less than 20% of residential land still vacant, and at least one whole census tract inside (so their real population can be read from INE 2023). For each one the target is:

> people per completed dwelling = real population / (planned dwellings x share of residential land occupied according to the land registry)

**Model.** A ridge regression (a linear regression with a penalty on large weights, so it does not memorise 28 data points, lambda = 1) on the logarithm of that target, with two features of the municipality: median household size (INE) and the share of under-15s (registered population). It has three numbers (an intercept and one weight per feature). Working on the log scale guarantees a positive result and makes errors proportional. Fitted values (standardised features): intercept 0.910, household size +0.197, share of under-15s -0.112. The second feature has a negative effect once household size is accounted for; we include it because it improves out-of-municipality error, not because of a causal theory.

**Test, the strictest possible.** For each neighbourhood, the whole municipality is left out of training and the real population is compared with the prediction:

| | Mean error | Median error |
|---|---|---|
| **Our model** | **13.1%** | **10.4%** |
| Simple rule (dwellings x household size) | 25.1% | |

22 of the 28 neighbourhoods are below 20% error. The worst case is La Garena Sur (Alcalá de Henares, +43%). Buenavista (Getafe, +22%) is still filling up, gaining about 500 residents a year. The model beats the simple rule in 17 of 28 neighbourhoods.

**Range.** Every figure is shown with a range: the 10th to 90th percentile of the real/predicted ratio in that test (0.816 to 1.161, that is, 18% below to 16% above). The real value falls inside it in 79% of the neighbourhoods. Because the range is computed from the same 28 test results, that coverage is somewhat optimistic for new neighbourhoods.

**Variables tried and discarded** (none improved the out-of-municipality error reliably with 28 neighbourhoods): income, density, population, distance to Madrid, birth rate, protected housing share, building type, gross density, one-person households and mean age. A finding: calibrating with Getafe alone underestimated other municipalities, because Getafe's new neighbourhoods are mostly small protected-housing households. A realistic ceiling with this data is about 12 to 13%.

**What the test does and does not show.** The model is tested on neighbourhoods that are already built, where the true answer is known; the future itself cannot be tested. The test checks that the method generalises to municipalities it has not seen, not that a given forecast will come true.

**Applying it.** Population of a planning area when complete = planned dwellings x people per dwelling (with range). Age composition uses the shares observed in the 28 neighbourhoods (under 18: 20.2%, 28.4%, 30.8%; over 65: 3.7%, 6.6%, 10.3% at the 10th percentile, median and 90th percentile), and minors are split by age with the municipal census. For "what is coming", only dwellings still unbuilt count: planned dwellings x the share of residential land the land registry shows as vacant (areas without data are counted in full).

**Why 513,487 becomes 222,705.** The planning layer lists all dwellings of each area, including neighbourhoods built years ago. By the land registry, 186,000 of the planned dwellings (36%) are in areas already more than 90% built, 165,000 are in areas partly built, and 146,000 are in areas that are almost empty. Counting only areas at least 50% vacant gives 180,000; counting whole areas with at least 10% vacant gives 311,000; the central value, 222,705, lies in between. The weak assumption is that vacant land is built at the area's average density. No official figure of pending dwellings has been published.

## Demand: who needs what, and where

Demand for a service = people of the relevant age x usage rate. Demand is spread over points: census tracts for today (122 in Getafe, about 1,500 residents each) and unbuilt residential plots for the future.

| Service | Counts | Usage rate | New-centre capacity | Min. plot | Walking time |
|---|---|---|---|---|---|
| Nursery | children 0 to 2 | 45% (35 to 55) | 120 places (75 to 150) | 1,500 m2 | 10 min |
| School | children 3 to 11 | 85% (80 to 90) | 675 places (450 to 900) | 8,000 m2 | 15 min |
| Health centre | whole population | 100% | 25,000 residents (15,000 to 30,000) | 2,000 m2 | 15 min |
| Day centre | people 65+ | 1.3 per 100 (1.0 to 1.6) | 60 places (40 to 90) | 1,500 m2 | 15 min |
| Care home | people 65+ | 4.3 per 100 (3.5 to 5.0) | 120 places (80 to 180) | 4,000 m2 | municipality scale |

The care-home and day-centre rates are real averages of the Comunidad (57,996 care-home places and 16,906 day-centre places for 1.34 million people aged 65+). The school and nursery rates and all capacities are adjustable assumptions without an official source, marked "to be verified" in the app. Distances are straight lines at 80 m per minute. Existing centres use their real places when the register provides them (day centres and care homes) and a typical capacity otherwise (schools, nurseries, health centres).

## Where to put a new centre

1. **Existing centres absorb first.** Each existing centre takes the demand within walking distance, nearest first, up to its capacity.
2. **What is left** is divided by the capacity of a new centre, which gives how many new centres are needed.
3. **Candidates** are vacant facility parcels above the minimum area for the service.
4. **Greedy selection.** For each candidate, the uncovered demand inside its walking radius is added up (capped at the capacity); the best one is chosen, its demand is marked as covered, and the process repeats. It is fast and gives sensible results but does not guarantee the globally best combination.
5. **Dispersed demand.** If a centre would fill less than 30% of its capacity, the app warns that demand is dispersed.
6. **Public land.** A parcel counts as public if it lies inside a public network of the planning (equipment or green areas); otherwise it is shown as "ownership to be confirmed".
7. **Alternatives and robustness.** The app shows discarded alternatives with the reason, and tests whether each proposal still holds with fewer residents per dwelling and a three-year delay.

Changing the birth rate, the pace of new arrivals, the walking time, the usage rates or the capacities recalculates everything immediately.

## How municipalities are ranked

- Each criterion gives each municipality a **score from 0 to 100 equal to its position** among the municipalities (it beats that percentage of the others): 100 is the best, 0 the worst.
- The final match is the **average** of the chosen criteria.
- **Services** mix **60% variety** (how many centres there are, compared with other municipalities) and **40% sufficiency** (how many per resident, capped at the median: reaching "normal" counts as enough). No centre at all scores 0.
- Some criteria are yes or no (for example, rail or Metro to Madrid), and some are capped at the 75th percentile so very large municipalities do not dominate.
- A municipality with **no data in any chosen criterion is left out** of the ranking, not scored zero; if only some criteria are missing, they are skipped in its average.
- "I work in Madrid" does not measure kilometres: it measures whether there is rail or Metro to Madrid, how many direct buses there are, and the fare zone.

## Datasets we publish

Written to `data/processed/datos/` and published with the web app:

- `municipios.csv`: indicators of the 179 municipalities.
- `barrios.csv`: neighbourhoods and planning areas, with dwellings, population today and when complete, by age.
- `parcelas_vacantes.csv`: vacant facility land with its central point.
- `cuna-y-canas-datos.zip`: every GeoJSON and JSON file the web uses, by municipality.
- `index.html`: what each file and each field is, and where it comes from (data dictionary).

## Limitations

- Distances are straight lines (80 m per minute), not street routes.
- Usage rates and capacities are adjustable assumptions; those without a source are marked "to be verified".
- Public land is inferred from the planning data ("ownership to be confirmed").
- Tenders and works in progress are not integrated yet, so the app does not know which schools are already being built.
- The model is trained on 28 neighbourhoods and tested only on neighbourhoods already built.
- The estimate of dwellings still to be built (222,705) is our own, not an official figure.
- The planner access is a demo, without a password.

Next steps: add tenders and works in progress (public procurement platform and the regional official gazette), compute walking times on the street network, validate usage rates and capacities with municipal technicians, and offer a real planner login with returning the data errors we found to the Comunidad.

## Repository structure

```
etl/             Python scripts: download through APIs and processing
data/raw/        data as it arrives from the APIs (not versioned)
data/processed/  light GeoJSON/JSON files read by the web app (one folder per municipality)
web/             web application (Vite + React + TypeScript + MapLibre + Tailwind)
despliegue/      publishing script for Oracle Cloud
docs/            competition documents, speech scripts and images
DECISIONES.md    decisions, findings and project status (in Spanish)
```

## Reproducing the data

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python etl/modelo_poblacion.py                # population model: fits the 28 neighbourhoods of 17 municipalities and runs the leave-one-municipality-out test
python etl/lote_demanda.py                    # recomputes demand for all municipalities with that model (about 4 minutes)
python etl/municipios_resumen.py              # indicators of the 179 municipalities for "Where to live"
python etl/vivienda_nueva.py                  # unbuilt residential plots (after the summary: adds the counts)
python etl/redes_catastro.py                  # built or not? state of green areas and facilities from the land registry
python etl/paquete_datos.py                   # downloadable datasets (CSV, ZIP and data dictionary)
python etl/pipeline.py Getafe Navalcarnero    # detail of one or several municipalities: CKAN, IDEM, INE, CRTM, demand and verification
python etl/lote.py                            # detail of all municipalities (about 40 minutes)
python etl/verificar.py                       # checks that no file mixes municipalities
```

There is no single command for everything: update a municipality with `etl/pipeline.py`, then run the remaining scripts in the order above.

## Running the web app

```bash
cd web
npm install
npm run dev      # http://localhost:5173 (reads the data from data/processed)
npm run build    # production build in web/dist
```

## Publishing to Oracle Cloud

Live app: <https://objectstorage.eu-madrid-1.oraclecloud.com/n/axo19lrq7chl/b/cuna-y-canas/o/index.html>

To publish again after changes (needs `%USERPROFILE%\.oci\config` and an API key; the key never goes into the repository):

```bash
py -3.13 -m venv .venv-oci
.venv-oci\Scripts\pip install oci-cli
cd web && npm run build && cd ..
.venv-oci\Scripts\python despliegue\oracle.py   # uploads only what changed, compressed
```

Sources of the data: Portal de Datos Abiertos de la Comunidad de Madrid, IDEM, INE, Consorcio Regional de Transportes, Wikidata and Wikimedia Commons (free-licence photos) and CartoCiudad. Base map © IGN.
