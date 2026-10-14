# Cuna y Canas: diario de decisiones

Documento vivo con todo el proceso: contexto, plan, decisiones, fuentes, pendientes e ideas descartadas.
Reglas: cada entrada lleva su fecha, y dentro de cada sección lo más reciente va arriba. Lo que cambia se tacha o se mueve a "Ideas descartadas", nunca se borra.

**Índice:** [1. Contexto](#1-contexto) · [2. Estado y plan](#2-estado-y-plan) · [3. Decisiones](#3-decisiones) · [4. Hallazgos en los datos](#4-hallazgos-en-los-datos) · [5. Fuentes](#5-fuentes) · [6. Infraestructura y tamaños](#6-infraestructura-y-tamaños) · [7. Preguntas abiertas](#7-preguntas-abiertas) · [8. Ideas descartadas](#8-ideas-descartadas) · [9. Bitácora](#9-bitácora)

---

## 1. Contexto

- **Concurso:** MAD Open Data Challenge 2026 (UC3M + Comunidad de Madrid).
- **Final:** 20 de octubre de 2026, de forma presencial en Digitaliza Madrid. Cada equipo tiene **10 minutos** de exposición y luego preguntas.
- **Qué hay que entregar:** un MVP funcional, una presentación y acceso del jurado a los datasets y al prototipo.
- **Requisito de las bases:** usar las **API de los catálogos de la Comunidad**, tanto la IDEM como el catálogo unificado (CKAN).
- **Cómo puntúa el jurado (sobre 100):**
  - 1.1 Tratamiento de los datos (25)
  - 1.2 Resolución del reto (25)
  - 2.1 Sencillez (25)
  - 2.2 **Interactividad y flexibilidad** (25)
  - El desempate es 2.2 → 1.2 → 1.1 → 2.1. **La interactividad es lo que más pesa.**
- **El proyecto en una frase:** "Qué hace falta y qué viene en tu barrio". Hay dos pantallas, una técnica (dónde poner nuevos centros) y otra ciudadana (qué hay y qué viene). El detalle está en `docs/Cuna y Canas · 1/2/3`.

---

## 2. Estado y plan

### Alcance: todo lo que está en los documentos (decidido el 14 de octubre)
El equipo cree que da tiempo a hacerlo todo. Si nos retrasamos, se recorta por el final de cada día, nunca la interactividad de la pantalla técnica.

### Qué pide cada criterio y qué paso lo cubre
| Requisito o criterio de las bases | Pasos que lo cubren |
|---|---|
| Usar las API de la IDEM y de CKAN (obligatorio) | 1, 2 (todo se descarga por API con scripts, sin ficheros a mano) |
| Acceso del jurado a datasets y prototipo (obligatorio) | 12 (`/datos` y la web en Oracle) |
| MVP funcional y presentación de impacto (obligatorio) | 7–10 y 19 |
| 1.1 Tratamiento de los datos (25) | 1, 2, 4, 6, 9 (cruzar fuentes, limpiar, rangos y fuente enlazada) |
| 1.2 Resolución del reto (25) | 6, 8, 11 (demanda, ubicaciones y prueba con el pasado) |
| 2.1 Sencillez (25) | 10 (pantalla ciudadana con frases cortas y estados) |
| 2.2 Interactividad y flexibilidad (25, desempata) | 8 (deslizadores, escenarios, arrastrar parcelas) y 10 (filtros por situación) |
| Validar y explicar la información (criterio 5 de la fase de ideas) | 9 (muestra revisada a mano) y 11 |

### Calendario por etapas (revisado el 14 oct por la noche)
**Ojo con la fecha:** la entrega de premios del 20 de octubre es **a las 9:00** (apartado 4.5 de las bases). El día útil de verdad acaba el 19 por la noche. El código se congela el 19 a mediodía.

**Etapa 1: cierre de datos y repositorio (martes 14, noche)**
- [x] 1. `etl/descargar_ckan.py`: centros, natalidad y población por municipio.
- [x] 2. `etl/descargar_idem.py`, `etl/procesar_idem.py` y `etl/verificar.py`: capas ligeras de suelo y planeamiento, ponderadas por superficie.
- [ ] 3. Git y GitHub: `git init`, `.gitignore` (sin `data/raw`, `.venv` ni `node_modules`), primer commit, repositorio en GitHub y push.
- [ ] 3b. `etl/pipeline.py MUNICIPIO`: encadena CKAN, IDEM y verificación, y regenera `data/processed/municipios.json` (índice con código INE, nombre, centro del mapa y qué datos tiene cada municipio).

**Etapa 2: demanda y accesibilidad (miércoles 15)**
- [ ] 4. INE: padrón por sección censal (descarga, recorte a Getafe y Navalcarnero, geometrías de secciones). Resultado: `poblacion_secciones.geojson`.
- [ ] 5. Paradas de transporte del GTFS del CRTM (solo `stops.txt`, recortadas al municipio) y zonas básicas de salud (SHP, recortadas). Resultados: `paradas.geojson` y `zonas_salud.geojson`.
- [ ] 6. Modelo de demanda: viviendas previstas × personas por hogar × estructura de edades de un barrio de referencia (El Bercial) × curva de llenado anual. Entradas fijadas, salida siempre en rango (mínimo, central y máximo). Resultado: `demanda.json` por ámbito, año y grupo de edad.

**Etapa 3: web y pantalla técnica (jueves 16)**
- [ ] 7. Base de la web: Vite, React, TypeScript, MapLibre y Tailwind. Lee `municipios.json`, tiene el selector de municipio y carga las capas del elegido. Sin nada escrito a fuego para Getafe.
- [ ] 8. Algoritmo y controles: cobertura máxima con límite de capacidad en TypeScript (en un Web Worker para que no se bloquee el mapa), deslizadores (población, capacidad, superficie mínima, minutos andando), escenarios lado a lado, arrastrar una parcela, los 5 servicios y exportación en GeoJSON y en informe.

**Etapa 4: lo que viene y pantalla ciudadana (viernes 17)**
- [ ] 9. Licitaciones: descarga de PLACSP (ATOM) y BOCM (XML) filtrando por municipio; extracción con Claude Code a fichas JSON (objeto, ubicación, importe, fase, fecha, enlace oficial, código INE); reglas: no inventar, "sin datos" si no está claro y rechazo si el municipio del anuncio no coincide; revisión a mano de una muestra. Resultado: `licitaciones.json`.
- [ ] 10. Pantalla ciudadana: buscador con CartoCiudad, filtros por situación (bebé, escolar, cuidar de mayores) y por estado, tarjetas con la fuente enlazada, brecha visible y ficha en PDF.

**Etapa 5: validación y publicación (sábado 18)**
- [ ] 11. Prueba con el pasado en Los Molinos y Buenavista (población prevista frente a padrón real, con el error a la vista), prueba de robustez (menos viviendas y retrasos de etapa), informe exportable.
- [ ] 12. Publicación: VM de Oracle con nginx, HTTPS (nip.io y Let's Encrypt), carpeta `/datos` pública para el jurado y GitHub Pages de respaldo. Prueba en móvil y con red lenta.

**Etapa 6: presentación y cierre (domingo 19)**
- [ ] 13. Presentación de 10 minutos, ensayo cronometrado, vídeo de respaldo de la demo, accesos del jurado y congelación del código a mediodía. El resto del día es solo ensayo.

**Si vamos justos, el recorte se hace por este orden** (nunca la interactividad de la pantalla técnica): FastAPI y cron → ficha en PDF → comparación de dos escenarios → arrastrar parcelas → extracción automática de licitaciones (queda un puñado de fichas hechas a mano).

---

## 3. Decisiones

### 14 oct: el cambio de municipio es de datos y arquitectura, no de prompt
- **Estado real a las 14 oct (verificado):** el único código es `etl/descargar_idem.py`. No hay prompt, ni modelo de IA, ni web (`web/` y `data/processed/` vacías), ni git. "Cambiar de municipio en la demo" era una propuesta, no una función.
- **Diseño propuesto (sin implementar):**
  - `data/processed/municipios.json` como índice: código INE, nombre, centro del mapa y qué datos tiene cada uno.
  - Una carpeta por municipio (`065-getafe/`, `096-navalcarnero/`) con todas sus capas, generada por un único `etl/pipeline.py MUNICIPIO`.
  - La web carga la carpeta según un selector, sin nada escrito a fuego para Getafe.
  - Si falta un dato, el índice lo marca y la web muestra "sin datos". Cada ficha lleva el código INE y una comprobación impide mezclar municipios.
  - Para la demo: Getafe y Navalcarnero ya procesados, con selector instantáneo y sin depender de la red.
- **El único prompt real del proyecto** será el de extracción de licitaciones (paso 9), con estos requisitos de diseño: no inventar, marcar "sin datos", validar que el municipio del anuncio coincide con el elegido.

### 14 oct: HTTPS en la VM
Con nip.io (o un dominio) y Let's Encrypt. Así no aparece "No seguro" y funciona "usar mi ubicación".

### 14 oct: los 5 servicios en la herramienta
Escuela infantil, colegio, centro de salud, centro de día y residencia, todos funcionando. Para la presentación se elegirá un hilo conductor, pero el jurado puede probar cualquiera.

### 14 oct: extracción de licitaciones con Claude Code (plan Max), sin pagar API
- El plan Max **no incluye créditos de la API** (la API se factura aparte), pero sí incluye Claude Code.
- La extracción la hace Claude Code: lee los anuncios descargados del BOCM y de PLACSP y escribe las fichas en `data/processed/licitaciones.json`, sin ningún coste extra.
- Si hay muchos, se lanza por lotes en modo no interactivo (`claude -p`).
- Se hace una vez, sin conexión. La web solo lee el JSON resultante.
- Se descarta un modelo local, porque es más lento y menos preciso.

### 14 oct: Oracle Cloud para alojar, no para procesar
- La VM Always Free (Ampere A1) aloja **la web, los datos procesados y los datos brutos** que el jurado puede descargar (`/datos`). Así se cumple el requisito de dar acceso a los datasets.
- El espacio no es problema: el plan gratuito tiene 200 GB de disco y 10 GB de Object Storage, y nuestro proyecto completo ocupa menos de 1 GB (ver §6).
- **Lo que nos limita no es el servidor, sino el navegador.** Al móvil o al portátil del jurado no se le mandan 22 MB, solo las capas ligeras. Si alguna capa crece mucho (por ejemplo, todo el suelo vacante y ocupado), se convierte a teselas vectoriales con PMTiles, que nginx sirve por trozos.
- El proceso de datos (Python) se ejecuta en local. Más adelante podría pasar a la VM con un cron.

### 14 oct: buscador de direcciones con CartoCiudad
El geocodificador público de CartoCiudad se puede llamar directamente desde el navegador, así que el buscador no necesita backend propio. FastAPI pasa a ser opcional.

### 14 oct: municipio de demostración, **Getafe**
Comparamos los municipios por los datos disponibles en las API de la Comunidad, contando solo los centros en alta:

| Municipio | Parcelas en el Portal del Suelo | Centros educativos | Atención primaria | Centros sociales (de mayores) |
|---|---|---|---|---|
| **Getafe** | 41 | 110 | 10 | 55 (15) |
| Majadahonda | 103 (100 residenciales en Los Satélites) | 47 | 2 | 19 (7) |
| Parla | 45 (casi todas industriales) | 67 | 6 | 28 (12) |
| Valdemoro | 0 | 46 | 2 | 16 (10) |
| Arroyomolinos | 1 | 25 | 1 | 3 (2) |

Getafe es el más completo, y además su fase de desarrollo es la adecuada (ver §4).

### 14 oct: casos de uso dentro de Getafe
Los ámbitos del planeamiento de la IDEM traen el **número de viviendas previstas** (`NM_VIV_TOT`):

| Ámbito | Viviendas | Papel en el demo |
|---|---|---|
| SUS-PP-2 **Los Molinos** | 6.276 | **Prueba con el pasado**: barrio ya habitado, se compara la población prevista con la real |
| SUS-PP-3 **Buenavista** | 5.958 | Prueba con el pasado y pantalla ciudadana |
| AA-01 **El Rosón** | 2.752 | **Caso futuro**: el 42% de los pisos está por construir |
| SUI-07 PAU-3 Perales del Río | 1.750 | Secundario |
| SUI-05 PAU-2 El Bercial-Universidad | 5.950 | Barrio antiguo y consolidado, sirve de referencia de "barrio parecido" para la estructura de edades |

### 14 oct: de dónde sale el suelo libre
- **Fuente principal: la capa IDEM `IDEM_VPLA_SVAC_SOCU_26`** (suelo vacante y ocupado, 2026). En Getafe tiene **371 parcelas vacantes de equipamiento**, que son las candidatas.
- Se complementa con las redes públicas del planeamiento (`VPLA_V_RED_REF_25`): 66 educativas, 11 sanitarias, 15 asistenciales y 38 deportivas.
- **El Portal del Suelo** casi no tiene suelo dotacional (la mayoría es residencial o industrial). Es un complemento, y su capa WFS `IDEM_V_SUELO_PARCELA` ya trae la geometría, así que el Catastro queda solo como respaldo.
- Usamos el refundido de **2025** (`*_REF_25`), más reciente que el de 2023 citado en el documento 2.

### 14 oct: arquitectura
- **Web estática con datos precalculados más un algoritmo en el navegador.** Es una aplicación React completa, con mapa, deslizadores y animaciones, pero sin servidor. Los recálculos son instantáneos y la demo no se cae.
- **Pila:**
  - Datos: Python con pandas y geopandas.
  - Web: Vite, React, TypeScript, MapLibre y Tailwind.
  - Optimización: algoritmo voraz de cobertura máxima con límite de capacidad, en TypeScript.
- **Modelo de lenguaje:** solo en el proceso de datos, sin conexión, para extraer campos del BOCM y de las licitaciones. Las fichas revisadas a mano sirven también de validación.
- **No usamos** la base de datos Autonomous ni la IA generativa de Oracle.

### 14 oct: proyecto en `C:/dev/datathon-mad`
Lo sacamos de OneDrive para que no sincronice `.venv` ni `node_modules`. La copia de seguridad se hace con git y GitHub.

---

## 4. Hallazgos en los datos
Sirven para la presentación, en el criterio de tratamiento de los datos.

### 14 oct: resultados de la IDEM ponderados por superficie (paso 2)
Antes contábamos parcelas; ahora medimos metros cuadrados, que es lo que importa. Equipamiento vacante = m² de parcelas vacantes de uso equipamiento / m² totales de equipamiento (vacantes + ocupadas) dentro del ámbito.

| Ámbito (Getafe) | Viviendas | Equipamiento vacante por **superficie** | Antes, por nº de parcelas | Suelo residencial vacante |
|---|---|---|---|---|
| Los Molinos | 6.276 | **72,1 %** (133.879 m² libres frente a 51.683 ocupados) | 59 % | 8,2 % |
| Buenavista | 5.958 | **60,4 %** (105.609 m²) | 67 % | 9,8 % |
| El Bercial-Universidad | 5.950 | 37,5 % | 47 % | 4,2 % |
| Perales del Río | 1.750 | 34,5 % | 18 % | 0,5 % |
| El Rosón | 2.752 | 19,8 % | 37 % | **35,5 %** (aún por construir) |

- **Los Molinos y Buenavista mantienen el mensaje**: casi todo el residencial está construido (menos del 10 % vacante) y entre el 60 y el 72 % del suelo de equipamiento sigue vacío. Es la historia del proyecto, ahora con superficies.
- **El Rosón es el caso futuro de verdad**: el 35,5 % de su suelo residencial está sin construir. Hay que cambiar lo que decíamos del "37 % de equipamiento vacante", que era un artefacto de contar parcelas.
- **Navalcarnero** muestra el patrón extremo en los barrios que aún no existen: S-15 (5.165 viviendas) tiene el 99,5 % del residencial y el 98,5 % del equipamiento vacantes. La Dehesa (1.591 viviendas) está a medio hacer: 15,8 % de residencial y 58,9 % de equipamiento vacantes. Ideal para enseñar un barrio "futuro" y otro "ya habitado a medias".
- **Candidatas a nuevo centro (equipamiento vacante, 50 m² o más):** Getafe 294 (239 de 1.000 m² o más, 84 de 5.000 m² o más, 38 de 10.000 m² o más); Navalcarnero 431 (305, 148 y 72).
- **Control:** la suma de las viviendas previstas por ámbito sale 25.388 (Getafe) y 21.434 (Navalcarnero), igual que en la primera consulta a la IDEM.

### 14 oct: calidad de los datos de la IDEM (paso 2)
- **Los polígonos de las parcelas vienen mal formados:** 10.340 de 24.765 en Getafe (42 %) y 5.378 de 13.533 en Navalcarnero son geometrías inválidas (autointersecciones y anillos degenerados). Se reparan, y comprobamos que las superficies casi no cambian (+0,25 % en total, +0,01 % en las candidatas).
- **`NM_AREA` está vacío** en la capa de suelo vacante y ocupado: la superficie se calcula nosotros a partir de la geometría, en metros (ETRS89 UTM 30N).
- **Parcelas sin superficie en origen:** 52 de las 371 candidatas de Getafe (y 32 de las 493 de Navalcarnero) tienen un polígono degenerado de 0 m² y solo conservan su posición central. No se pueden evaluar y se descartan, anotándolo. Otras 25 de Getafe miden menos de 50 m² y también se descartan.
- **Los ámbitos vienen repetidos en varios polígonos** (44 polígonos son 31 ámbitos en Getafe, 68 son 49 en Navalcarnero). Se unen por nombre y se toman las viviendas una vez, no sumadas. Comprobado que no hay discrepancias entre los polígonos de un mismo ámbito.
- **Hay 1 referencia catastral duplicada** entre las candidatas de Getafe.
- **El estado "prevista" casi no existe en las redes dotacionales:** en Getafe, de 726 elementos, los educativos son 46 "existente" y 20 sin etiquetar, ninguno "prevista" (solo hay 26 zonas verdes previstas); en Navalcarnero todos están sin etiquetar. → **Cambia el plan:** el estado "prevista" no se puede inferir de las redes. Vendrá de las licitaciones y el BOCM (paso 9), y para el suelo reservado diremos "suelo disponible" y no "prevista".
- **El texto de la IDEM es UTF-8 correcto** (`EL ROSÓN`): el carácter roto que vimos solo era la terminal.
- **9 de los 31 ámbitos de Getafe y 15 de los 49 de Navalcarnero no traen viviendas previstas.** Se muestran como "sin datos".

### 14 oct: calidad de los datos de CKAN (paso 1)
- **Cada dataset identifica el municipio de una forma distinta:** educativos y sociales con el código INE de 3 dígitos (`CDMUNI`, `municipio_codigo`), sanitarios solo con el nombre (`municipio_nombre`) y las series estadísticas con 4 dígitos (el cuarto es de control). La clave común es el código INE de 3 dígitos, y el nombre se saca del censo anual (`etl/comun.py`).
- **Centros educativos de Getafe:** 187 registros, de ellos 105 en ALTA (no 110 como habíamos contado antes: aquella cifra incluía alguno en trámite). 104 tienen coordenadas.
- **Centros sanitarios de Getafe:** 1.008 filas, que son 358 centros distintos (una fila por oferta asistencial). 350 se pueden dibujar.
- **Centros sociales de Getafe:** 55 (54 con coordenadas); 15 son de personas mayores.
- **Errores de origen en las coordenadas (investigado a fondo el 14 oct):** 3 centros sanitarios de Getafe (`CS18137`, `CS20396`, `SS01519`) tienen la dirección y el municipio bien (Getafe, CP 28906/28905) pero coordenadas a 20–60 km. No son fallos de formato: son UTM válidas dentro de la Comunidad. Lo contrastamos con el geocodificador oficial CartoCiudad (API pública, `reverseGeocode` y `candidates`):
  | Centro | Dirección declarada | Dónde caen las coordenadas del dato | Posición correcta según CartoCiudad |
  |---|---|---|---|
  | `CS20396` | Avda. de Rocinante 8, Getafe | **Avenida Rocinante, Madrid capital** | 40,3168 N, 3,6965 O (Getafe) |
  | `SS01519` | Avda. Juan Carlos I, Getafe | **Avenida Juan Carlos I, Alcalá de Henares** | en Getafe (CartoCiudad no da el punto de esa avenida) |
  | `CS18137` | Calle Rachel Carson 1, Getafe | Campo abierto junto a Miraflores de la Sierra (sin calle homónima) | 40,2756 N, 3,6838 O (Los Gavilanes, Getafe) |
  - **Causa más probable (2 de 3 confirmadas):** el registro se geocodificó solo por el nombre de la calle y se asignó una calle **homónima de otro municipio**. En el tercer caso no hemos encontrado la causa (la diferencia no es un simple dígito cambiado), y no lo afirmamos.
  - **Alcance:** en toda la Comunidad hay 21 centros de 15.709 (el 0,13 %) a más de 15 km de la mediana de su municipio, la mitad en servicios sanitarios integrados en organizaciones no sanitarias.
  - **Qué hacemos:** el filtro genérico (más de 15 km de la mediana) los descarta y lo anota en `_control_ckan.json`.
  - **Mejora posible (pendiente, opcional):** recuperar estos 3 y los 5 sin coordenadas con CartoCiudad (dirección + municipio), marcándolos como "posición recalculada, no oficial". Hay que cuidar que la dirección geocodificada caiga en el municipio correcto, que es la misma trampa que los ha causado.
  - **Para la presentación:** es un ejemplo de cómo comprobamos los datos con una segunda fuente oficial, y un riesgo real para el planificador, porque un centro mal situado cuenta como cobertura que no existe.
- **Navalcarnero:** 23 centros educativos en alta, 65 sanitarios y 17 sociales. Población de 2025: 33.352; nacidos vivos de 2024: 283.
- **Getafe:** nacidos vivos de 2024: 1.489 (tasa bruta del 7,84 por mil).

### 14 oct: ✅ RESUELTO: lo de los 50.000 habitantes es texto oculto, no es un requisito
- **Comprobación técnica del PDF:** en la portada, ese texto se escribe con color de relleno blanco (`1 1 1 sc`) sobre rectángulos blancos, es decir, blanco sobre blanco. Al abrir el PDF no se ve (se ve en blanco), pero `pdftotext` lo extrae. Seguramente es un resto de la plantilla de otra edición que se ocultó en vez de borrarse.
- **El reto vinculante es el apartado 3:** natalidad, transportes, servicios sociales, bienestar y salud, **sin límite de población**. → **Seguimos con Getafe.**
- Por si acaso: (1) la herramienta acepta cualquier municipio como parámetro; (2) se puede preguntar a la organización por el canal de dudas, aunque no es imprescindible; (3) en la demo se puede cambiar de municipio en directo, lo que cuenta para el criterio 2.2 de flexibilidad.
- La comparativa de abajo se guarda como plan B y para esa demostración de flexibilidad.

*Lo que escribimos antes de comprobarlo:*
- La portada de las bases dice: *"Pueblos con vida de la Comunidad de Madrid. ¿A qué municipio de menos de 50.000 habitantes podría mudarme?"*. El apartado 3, el del reto, no repite el límite, pero ese es el título del concurso.
- El objetivo 2 de las bases habla de *"la accesibilidad de los servicios como elemento clave en la decisión de elegir un municipio como lugar de vida"*. Encaja con nuestra pantalla ciudadana para quien se va a mudar.
- Los documentos de la fase de ideas no nombran ningún municipio, así que cambiarlo no contradice lo que presentamos.
- Comparamos candidatos de menos de 50.000 habitantes con las mismas API de la IDEM (población del censo anual de 2025, CKAN `poblacion_censada_por_edad_nacionalidad_y_sexo`. Por encima de 50.000 quedan Tres Cantos con 54.506, Majadahonda con 73.662 y Valdemoro con 86.078):

| Municipio | Habitantes (aprox.) | Viviendas previstas | Residencial vacante | Equipamiento vacante |
|---|---|---|---|---|
| **Navalcarnero** | 33.352 | **21.434** | 1.186 | **493** |
| Arroyomolinos | 38.185 | 11.274 | 427 | 75 |
| Paracuellos de Jarama | 27.649 | 6.588 | 633 | 71 |
| Algete | 21.194 | 10.331 | 467 | 151 |
| Villaviciosa de Odón | 30.068 | 5.554 | 1.866 | 92 |
| Torrejón de Velasco | 4.895 | 12.768 | 566 | 94 |
| *(Getafe, como referencia)* | 195.628 | 25.388 | 302 | 371 |

- **Navalcarnero** tiene más suelo de equipamiento vacante que Getafe, 21.000 viviendas previstas para unos 33.000 habitantes y una mezcla de barrios ya habitados (suelo urbano no consolidado incorporado, como La Dehesa con 1.591 viviendas o San Isidro con 1.049) y futuros (el sector S-15 con 5.165 viviendas y los PAU 2, 3 y 4).
- El código ya admite cualquier municipio (`descargar_idem.py MUNICIPIO CODIGO`), así que cambiar cuesta alrededor de una hora.

### 14 oct: Getafe está en el punto justo de desarrollo
Cruzamos el suelo vacante y ocupado de 2026 con los ámbitos del planeamiento, contando parcelas catastrales:

| Ámbito | Residencial ocupado | Equipamiento vacante |
|---|---|---|
| Buenavista | ~100% multifamiliar, 77% unifamiliar | **67%** (34 de 51) |
| Los Molinos | 95% multifamiliar, 81% unifamiliar | **59%** (16 de 27) |
| El Bercial | 95% multifamiliar, 89% unifamiliar | 47% |
| El Rosón | 58% multifamiliar (42% por construir) | 37% |
| Perales del Río | ~99% | 18% |

- **Las viviendas ya están habitadas, pero más de la mitad del suelo de equipamiento sigue vacío.** Es el lema del proyecto, demostrado con datos de la IDEM.
- Que los barrios estén habitados permite la prueba con el pasado, y El Rosón sirve de caso futuro.
- Cuidado: son conteos de parcelas. Ya están ponderados por superficie en el paso 2 (ver más abajo).

### 14 oct: hay datos que los documentos daban por no disponibles
- **Viviendas previstas por ámbito:** el documento 2 dice que "no está como dato abierto", pero sí está, en `NM_VIV_TOT` de `VPLA_V_AMBITO_REF_25`.
- **Suelo vacante:** el documento 2 dice que la descarga "no está localizada", pero existe por WFS en `IDEM_VPLA_SVAC_SOCU_26`, actualizada en 2026 (frente al estudio de 2019).
- → Hay que actualizar el documento 2 y contarlo en la presentación.

---

## 5. Fuentes

### Confirmadas (API)
| Dato | Endpoint | Notas |
|---|---|---|
| Redes públicas (planeamiento 2025) | WFS IDEM `UsoDelSuelo:VPLA_V_RED_REF_25` | 1.566 elementos; `DS_MUNICIPIO='GETAFE'` |
| Ámbitos y viviendas previstas | WFS IDEM `UsoDelSuelo:VPLA_V_AMBITO_REF_25` | 44 elementos; `NM_VIV_TOT`, superficies de equipamiento |
| Ordenanzas | WFS IDEM `UsoDelSuelo:VPLA_V_ORDENANZA_REF_25` | 2.596 elementos |
| Suelo vacante y ocupado 2026 | WFS IDEM `UsoDelSuelo:IDEM_VPLA_SVAC_SOCU_26` | `CD_MUNICIPIO='065'`; 24.765 parcelas; campos `DS_USO`, `DS_OCUPACION`, `CD_REF_CAT` |
| Parcelas del Portal del Suelo con geometría | WFS IDEM `UsoDelSuelo:IDEM_V_SUELO_PARCELA` | `DS_MUNICIPIO='Getafe'`; 41 parcelas |
| Centros educativos | CKAN `centros_educativos` | Coordenadas UTM; se filtra `SITUACIÓN=ALTA` |
| Centros sanitarios | CKAN `centros_servicios_establecimientos_sanitarios` | Una fila por oferta asistencial; quitar duplicados por registro |
| Centros de atención social | CKAN `atencion_social_registro_centros` | Plazas autorizadas y sector |
| Parcelas del Portal del Suelo (CSV) | CKAN `parcelas_portal_suelo` | No trae coordenadas; usar la capa WFS |

- WFS base: `https://idem.comunidad.madrid/geoidem/UsoDelSuelo/wfs`
- API CKAN: `https://datos.comunidad.madrid/api/3/action/package_search?q=...`

### Encontradas en CKAN el 14 de octubre (pendientes de usar)
| Dato | Dataset CKAN | Notas |
|---|---|---|
| Población por edad, sexo y nacionalidad por municipio | `poblacion_censada_por_edad_nacionalidad_y_sexo` | Censo anual 2021–2025, 15 MB; ya en `data/raw/ckan` |
| Nacidos vivos por municipio | `mnp_nacidos_vivos_por_residencia_y_sexo` | Para la demanda de natalidad |
| Nacidos por edad de la madre por municipio | `mnp_nacidos_vivos_por_edad_y_nacionalidad` | |
| Tasa bruta de natalidad por municipio | `1915900` | |
| ~~Nacimientos por edad de la madre~~ y ~~matrícula de infantil~~ | `1917742`, `1919460` | Solo dan el total regional, sin municipios. No sirven |

### Por localizar o confirmar
- [ ] Matrícula de infantil de primer ciclo (CKAN)
- [ ] Padrón por sección censal y geometrías de las secciones (INE)
- [ ] GTFS interurbano del CRTM
- [ ] Zonas básicas de salud, capa SHP de 2019
- [ ] Licitaciones: PLACSP (ATOM), BOCM (XML) y Portal de Contratación de la Comunidad

---

## 6. Infraestructura y tamaños

### Lo que se descarga (disco local y VM)
| Bloque | Tamaño aproximado | Comentario |
|---|---|---|
| Capas de la IDEM de Getafe (ya en `data/raw`) | 30 MB | 22 MB son del suelo vacante y ocupado |
| CKAN (centros, nacimientos, matrícula) | 10–30 MB | Toda la Comunidad; se filtra Getafe |
| INE: padrón por sección y geometrías de secciones | 100–300 MB | Los ficheros son nacionales, se recorta Getafe (unas 100 secciones) |
| GTFS del CRTM | 50–150 MB | Sobre todo `stop_times`; solo se usan las paradas |
| Zonas básicas de salud | < 10 MB | |
| Licitaciones y BOCM | 50–200 MB | Según cuántos meses se recorran |
| **Total de datos brutos** | **< 1 GB** | |
| `.venv` | 250 MB | No se sube |
| `node_modules` | ~300 MB | No se sube |

### Lo que recibe el navegador (medido el 14 de octubre)
| Capa | Tamaño |
|---|---|
| 371 parcelas vacantes de equipamiento | 0,2 MB |
| Redes públicas (1.566) | 1,3 MB |
| Ordenanzas (2.596) | 1,2 MB |
| Ámbitos (44) | 0,1 MB |
| Todo el suelo vacante y ocupado, simplificado | 11 MB → solo con PMTiles o no se usa |

**Objetivo:** que la web descargue menos de 5 MB en total, y alrededor de 1 MB comprimido con gzip.

### Oracle Always Free
Un Ampere A1 (hasta 4 núcleos y 24 GB de RAM), 200 GB de disco, 10 GB de Object Storage y 10 TB de tráfico al mes. Va sobradísimo para lo que necesitamos.

---

## 7. Preguntas abiertas
- ~~¿Getafe o un municipio de menos de 50.000?~~ → texto oculto en el PDF, seguimos con Getafe (§4).
- ~~¿HTTPS?~~ → decidido: sí (§3).
- ~~¿Qué servicio guía la demo?~~ → decidido: los 5 (§3).
- ~~¿Qué modelo de lenguaje?~~ → decidido: Claude Code con el plan Max (§3).

## 7b. Notas aclaratorias
- **14 oct: por qué los 22 MB son un problema aunque estén en Oracle.** Oracle solo guarda el fichero y lo entrega. Quien lo dibuja es el navegador del que mira, que tiene que descargarlo entero (8–20 s con el wifi de un evento o un 4G), leerlo y pintar 24.765 polígonos, lo que en un móvil se nota. Por eso al navegador solo van las capas filtradas (~3 MB), y el fichero completo se queda en `/datos` para quien quiera descargarlo. Otra opción son las teselas PMTiles, que solo envían el trozo de mapa visible.
- **Cómo funciona el aligerado:**
  1. **Filtrar filas:** solo las parcelas que interesan (las vacantes de equipamiento, 371 de 24.765).
  2. **Quitar columnas:** solo los campos que usa la web.
  3. **Simplificar geometría:** quitar vértices sobrantes, con 1 m de tolerancia.
  4. **Redondear coordenadas:** 6 decimales, unos 10 cm.
  5. **Comprimir con gzip en nginx:** unas 4 veces menos.
  Resultado: los datos brutos quedan en `data/raw` y en `/datos`, y los ligeros en `data/processed` y en la web.

---

## 8. Ideas descartadas
- **14 oct, Valdemoro y Arroyomolinos:** no tienen parcelas en el Portal del Suelo.
- **14 oct, Madrid capital:** el planeamiento refundido de la IDEM no la incluye.
- **14 oct, base de datos Autonomous de Oracle:** sobra para el volumen de datos que tenemos.
- **14 oct, mandar los 22 MB del suelo vacante y ocupado al navegador:** se filtra o se convierte en teselas.
- **14 oct, recortar el alcance:** lo propuso Claude y el equipo prefiere intentar hacerlo todo.

---

## 9. Bitácora
- **14 oct (noche, 2):** paso 2 hecho: `descargar_idem.py` genérico por código INE, `procesar_idem.py` y `verificar.py`. Getafe 818 KB y Navalcarnero 624 KB de capas ligeras. Hallazgos: parcelas con geometría inválida, 52 candidatas sin superficie, y el estado "prevista" no sale de las redes.
- **14 oct (noche):** paso 1 hecho: `etl/comun.py` y `etl/descargar_ckan.py`, probados con Getafe y Navalcarnero; se detectaron y descartaron 3 coordenadas erróneas.
- **14 oct (tarde, 2):** comprobamos que el texto de los 50.000 habitantes está oculto (blanco sobre blanco) en el PDF; el apartado 3 no pone límites. Getafe se queda. Decidido también: HTTPS, los 5 servicios y extracción con Claude Code.
- **14 oct (tarde):** al leer las bases vemos que el título del reto habla de municipios de menos de 50.000 habitantes. Getafe queda en revisión y Navalcarnero aparece como alternativa (§4).
- **14 oct:** elegimos Getafe; descargamos las 5 capas de la IDEM; confirmamos que el suelo de equipamiento sigue vacante en los barrios nuevos; fijamos el calendario completo; decidimos usar Oracle como alojamiento y para dar acceso a los datos al jurado.
