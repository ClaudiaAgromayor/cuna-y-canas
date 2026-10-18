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
- [x] 3. Git y GitHub (hecho el 14 oct): repositorio `https://github.com/ClaudiaAgromayor/cuna-y-canas`, rama `main`, primer commit `f453ab9` con los scripts, `data/processed` y la documentación. `.gitignore` excluye `data/raw`, `.venv` y `node_modules`. La compañera de equipo está invitada como colaboradora.
- [x] 3b. `etl/pipeline.py MUNICIPIO [...]` (hecho el 15 oct): encadena los 6 pasos y la verificación, y regenera `data/processed/municipios.json` (código INE, nombre, centro, bbox, población, viviendas previstas, capas disponibles y lo que falta). Getafe y Navalcarnero en 23 segundos.

**Etapa 2: demanda y accesibilidad (miércoles 15)**
- [x] 4. `etl/secciones.py` (hecho el 15 oct): geometrías de la IDEM (`IDEM_GDIE_G_SECCION`) e indicadores del INE por sección 2015–2023 (tabla 31105 del Atlas de Renta: población, % menores de 18, % 65 y más, tamaño del hogar). Población de cada ámbito repartida por áreas. Resultados: `secciones.geojson` y `secciones_series.json`.
- [x] 5. `etl/transporte.py` y `etl/zonas.py` (hecho el 15 oct): paradas de los servicios de datos abiertos del CRTM (interurbanos, urbanos, Cercanías, Metro y Metro Ligero), filtradas por provincia y municipio; zonas básicas de salud construidas uniendo secciones y nombradas cruzando con el SHP de CKAN. Resultados: `paradas.geojson` y `zonas_salud.geojson`.
- [x] 6. `etl/demanda.py` (hecho el 15 oct): población al completarse = viviendas previstas × habitantes por vivienda prevista, calibrado con 4 barrios nuevos ya habitados de Getafe; rangos [mínimo, central, máximo]; prueba con el pasado dejando cada barrio fuera. Resultados: `servicios.json` (supuestos por servicio), `demanda.json` y `demanda_puntos.geojson` (dónde está la demanda hoy y en el futuro). La curva de llenado año a año pasa a la web como deslizador.

**Etapa 3: web y pantalla técnica (jueves 16)**
- [x] 7. Base de la web (hecho el 15-16 oct): `web/` con Vite, React 19, TypeScript, MapLibre 5.6 y Tailwind 4. Lee `municipios.json`, selector de municipio en la cabecera, el municipio y la pantalla quedan en la URL (`#m=065&p=tecnica`) y nada está escrito a fuego para Getafe. Segunda barrera anti-mezcla en el navegador (`datos.ts` rechaza elementos de otro municipio). Mapa base oficial del IGN.
- [x] 8. Pantalla técnica (hecho el 16 oct): `web/src/algoritmo.ts` (cobertura máxima con límite de capacidad, voraz), los 5 servicios, 7 deslizadores (habitantes por vivienda, llenado de barrios nuevos, tasa de uso, capacidad, minutos andando, superficie mínima, nº de centros), descontar centros existentes, fijar o descartar parcelas con un clic, **arrastrar** una ubicación propuesta y ver el resultado al momento, guardar un escenario A y compararlo, alternativas descartadas con su motivo, prueba con el pasado a la vista y exportación en GeoJSON e informe HTML.

**Etapa 4: lo que viene y pantalla ciudadana (viernes 17)**
- [ ] 9. Licitaciones: descarga de PLACSP (ATOM) y BOCM (XML) filtrando por municipio; extracción con Claude Code a fichas JSON (objeto, ubicación, importe, fase, fecha, enlace oficial, código INE); reglas: no inventar, "sin datos" si no está claro y rechazo si el municipio del anuncio no coincide; revisión a mano de una muestra. Resultado: `licitaciones.json`.
- [~] 10. Pantalla ciudadana (casi hecha el 16 oct): buscador de direcciones con CartoCiudad (funciona desde el navegador y filtra por municipio), selector de barrios nuevos, clic en el mapa, filtros por etapa de la vida, tarjetas con estado y enlace a la fuente oficial, aviso de brecha con rango, suelo reservado cerca ("Suelo disponible"), paradas a menos de 5 minutos con sus líneas y ficha imprimible en PDF. **Falta:** los estados prevista, licitada, adjudicada y en obras, que llegan con el paso 9.

**Etapa 5: validación y publicación (sábado 18)**
- [ ] 11. Prueba con el pasado en Los Molinos y Buenavista (población prevista frente a padrón real, con el error a la vista), prueba de robustez (menos viviendas y retrasos de etapa), informe exportable.
- [~] 12. Publicación: **hecha la web en Oracle Object Storage el 17 oct** (ver la decisión del 17 oct; sustituye a la VM con nginx). Falta la carpeta `datos/` para el jurado, GitHub Pages de respaldo y la prueba en móvil y con red lenta.

**Etapa 6: presentación y cierre (domingo 19)**
- [ ] 13. Presentación de 10 minutos, ensayo cronometrado, vídeo de respaldo de la demo, accesos del jurado y congelación del código a mediodía. El resto del día es solo ensayo.

**Si vamos justos, el recorte se hace por este orden** (nunca la interactividad de la pantalla técnica): FastAPI y cron → ficha en PDF → comparación de dos escenarios → arrastrar parcelas → extracción automática de licitaciones (queda un puñado de fichas hechas a mano).

---

## 3. Decisiones

### 17 oct (tarde, 2): criterios transparentes, "Trabajo en Madrid" y fichas PDF
- **Crítica de Claudia:** no se entendía de dónde salía cada criterio y "Trabajo en Madrid" premiaba estar cerca (distancia a Sol, nº de estaciones), cuando se puede trabajar en Madrid y vivir lejos si se está bien conectado.
- **Decisión: "Trabajo en Madrid" mide la conexión, no la cercanía.** Tres datos del Consorcio Regional de Transportes, sacados por API de las capas de tramos (`M5_Red/4`, `M4_Red/4`, `M10_Red/4`, `M8_Red/2`, combinaciones distintas de línea, municipio y zona):
  - **Tren o Metro hasta Madrid** (sí o no, 0 o 100 puntos): alguna línea de Cercanías, Metro o Metro Ligero une el municipio con Madrid. Las de Metro cuentan todas (red integrada: MetroSur enlaza con las líneas 3 y 10); las de Cercanías y Metro Ligero, solo si llegan a Madrid (así no cuentan la C-9 Cercedilla-Cotos ni el tranvía de Parla). Variantes unificadas (C-4a/b → C-4, Metro 12-1/2 → Metro 12). 38 municipios lo tienen.
  - **Autobuses directos a Madrid:** líneas interurbanas cuyo recorrido pasa por el municipio y por Madrid. Con tope en el percentil 75 (4 líneas): con tantas como el 25 % mejor servido ya cuenta como bien servido.
  - **Zona del abono** (A, B1, B2, B3, C1, C2): la moda de las zonas de sus paradas; de ella depende lo que cuesta ir a Madrid cada mes. Reparto: A 1, B1 10, B2 13, B3 26, C1 44, C2 85.
  - La distancia a Sol sigue como criterio opcional ("Cerca de Madrid"), con la aclaración de que estar cerca no es estar bien conectado.
- **Descartado: minutos de viaje a Madrid** con la velocidad de los tramos del CRTM: son velocidades tipo (15, 40 o 70 km/h en autobús; 30 km/h en todos los de Cercanías), no tiempos reales. Daría cifras con apariencia de precisión que no tienen.
- **Transparencia en la web:** cada criterio lleva su fuente; al elegir una situación se explica qué se mira ("Trabajo en Madrid: no premiamos vivir cerca, sino llegar bien. Miramos…"); desplegable "Cómo ordenamos y de dónde salen los datos" (percentiles, todos los criterios pesan igual, suficiencia 60 % + variedad 40 %). Iconos propios para tren, tranquilidad (árbol) y vivienda nueva (casa con +), que antes repetían la casa.
- **Ficha PDF del municipio rehecha** (`FichaMunicipio.tsx`, como la del barrio): cabecera con logo y fecha; nombre, 4 cifras (habitantes, crecimiento, km a Sol, zona del abono) y foto; **mapa de situación vectorial** (`MapaSituacion.tsx`, SVG con los 179 municipios, el elegido en rojo y los 15 mejores en granate: se imprime nítido y no depende de WebGL); coincidencia, puesto y tabla de criterios con valor, fuente y posición; "Lo que hay hoy" en 4 columnas; "Lo que viene" en tabla; "¿Hay sitio?"; "Su gente"; método y fuentes. Dos páginas A4.
- **Por qué salían mal los PDF:** (1) una regla de impresión antigua ocultaba todos los `<header>`, también la cabecera de la ficha; (2) Chrome no imprime colores de fondo si no se le pide (`print-color-adjust: exact`), así que barras y mapas salían en blanco; (3) el margen de página hacía que el navegador añadiera fecha y URL. Ahora: `@page { margin: 0 }` y el margen lo pone la ficha con `box-decoration-break: clone` (se repite en cada página); las tablas largas pueden partirse entre páginas, pero nunca una fila.
- **Revisión automática de las fichas:** en desarrollo, `?imprimir=municipio` o `?imprimir=barrio` deja la página lista para Chrome sin ventana (`chrome --headless --print-to-pdf`). Así se revisan los PDF sin pulsar botones.
- **Gráfica de población de Planificar rehecha** ("se ve poco"): antes, barras apiladas de toda la población en grises, con el grupo del servicio como franja fina. Ahora: cifra clave grande (p. ej. "Niños (3-11): 691 → 793, +15 %"), barras **solo del grupo del servicio a su escala** con eje y valor del año elegido, y debajo el reparto de todos los grupos del año elegido con barras horizontales.
- Publicado en Oracle (4 archivos cambiados).

### 17 oct (tarde): qué piden exactamente y Oracle Cloud
- **Correo de la organización (fase de proyectos):** hay que entregar **(1) un prototipo funcional** y **(2) los datasets elaborados** que usa el prototipo. Contacto: jgarciag@inf.uc3m.es y el canal de Discord del datathon. **Ni el correo ni las bases exigen Oracle**: la cuenta de Oracle Cloud es un recurso que ofrece la organización (tenancy `uc3mdatathon`, dominio de identidad `Default`).
- **Acceso a Oracle:** al entrar sale "Se ha producido un error del sistema en Oracle Identity Cloud Service". Es un fallo del servicio de identidad de Oracle, no de la contraseña. La cuenta ya estaba activa (se había entrado antes), así que no es la activación.
- **Segundo intento:** sale "No puede marcar y acceder a la URL de conexión directamente". **Causa:** se abrió la página de acceso (`idcs-….identity.oraclecloud.com/ui/v1/signin`) desde un marcador o una pestaña antigua. Esa dirección es de un solo uso: Oracle la genera en cada inicio de sesión y caduca. El primer error seguramente venía de lo mismo (sesión antigua guardada).
- **Cómo entrar:** cerrar todas las pestañas de Oracle, abrir una ventana privada y empezar siempre por `https://cloud.oracle.com/?tenant=uc3mdatathon` (o cloud.oracle.com → nombre de la cuenta en la nube `uc3mdatathon` → dominio `Default` → usuario y contraseña). Guardar como marcador esa dirección, nunca la de `idcs-…/signin`. Si con eso sigue fallando, escribir a la organización.
- **Resuelto (17 oct):** entrando así funciona. Región de la cuenta: **Spain Central (Madrid), `eu-madrid-1`**. Es una cuenta Free Trial: al acabar la prueba queda limitada a los recursos Always Free (suficiente para nosotros).
- **Conexión desde el ordenador:** la herramienta de Oracle (`oci-cli`) va en un entorno aparte, `.venv-oci`, para no alterar las versiones del `.venv` del ETL. Clave de API: se genera en la consola (Mi perfil → Tokens and keys → API keys); **la clave privada `.pem` se queda en `%USERPROFILE%\.oci\` y nunca se pega en el chat ni se sube a GitHub** (`*.pem` añadido al `.gitignore`). La "vista previa del archivo de configuración" (OCID del usuario y de la tenancy, huella y región) no es secreta y sirve para crear `%USERPROFILE%\.oci\config`.
- **Cómo está organizada la cuenta:** cada equipo tiene su **compartimento** dentro de la tenancy común. El nuestro es **`Delacunaalascanas`** (los demás, de otros equipos, no se tocan). No tenemos permiso para ver grupos ni políticas de la raíz, pero sí para crear almacenamiento en nuestro compartimento.
- **Decisión: web en Object Storage, no en una VM** (sustituye a lo previsto en el paso 12). Bucket **`cuna-y-canas`** (namespace `axo19lrq7chl`, región Madrid) con lectura pública de objetos y **sin listado** (`ObjectReadWithoutList`). Por qué: la web es estática (todo se calcula en el navegador), así que no hace falta servidor; viene con HTTPS de Oracle, sin mantener nginx ni certificados, y entra de sobra en lo gratuito (unos 55 MB; el límite gratuito es de 20 GB).
- **Dirección pública del prototipo:** https://objectstorage.eu-madrid-1.oraclecloud.com/n/axo19lrq7chl/b/cuna-y-canas/o/index.html
- **Script `despliegue/oracle.py`** (se ejecuta con `.venv-oci\Scripts\python`): sube `web/dist` (web + `data/processed`, que Vite copia dentro) **comprimido con gzip**, con su tipo de contenido y su caché (los `assets/` con huella, un año; el resto, 5 minutos), y **solo lo que ha cambiado** (compara el MD5). Primera subida: 3.389 archivos en 14 segundos. El JS pasa de 1,3 MB a 367 KB y la carga va rápida con la wifi del evento.
- **Comprobado en el navegador sobre Oracle:** portada con cifras, Barrios (Los Molinos con mapa del IGN, iconos y datos) y Planificar (Navalcarnero con propuestas), sin errores en la consola.
- **Detalle menor visto al probar:** si se cambia a mano la parte `#p=…` de la dirección sin recargar, la app no cambia de pantalla (solo lee la dirección al cargar). Los enlaces y botones van bien.
- **Pendiente:** (a) preparar los "datasets elaborados" como entregable claro (paquete descargable y diccionario de datos) y subirlos al mismo bucket en `datos/`; (b) plan B: GitHub Pages con el mismo `web/dist`, por si Oracle fallara el día 20.

### 17 oct (tarde): competencia publicada y guion
- **Proyectos publicados de otros equipos (búsqueda en GitHub y la web, 17 oct):** solo **ViveTuMunicipio** tiene repositorio público (`pauladuck04/vive-tu-municipio`): un buscador de municipios con Elasticsearch, Logstash, padrón, centros, AEMET y agenda cultural. Es un comparador del presente, sin previsión ni planificación. Del resto no hay nada publicado (hay un repositorio "Oportunia" vacío, del 5 de octubre, sin confirmar que sea del concurso).
- **Guion de 10 minutos** en `docs/GUION_PRESENTACION.md`: gancho con Los Molinos, cifras de la Comunidad, demo en 4 pasos (¿Dónde vivir? → Barrios → Planificar con ▶ → Radar), fiabilidad (API, prueba con el pasado, errores en datos oficiales), diferencia, futuro y cierre. Incluye el reparto entre las dos, la preparación, preguntas probables y el plan B.

### 17 oct (tarde): ficha del barrio, últimas búsquedas y más ideas de Lucía
- **Ficha del barrio para imprimir o guardar en PDF, rehecha:**
  1. Cabecera con el logo y la fecha.
  2. Municipio y barrio en grande, con la foto del municipio.
  3. **Foto del mapa** tal como se ve, con su leyenda.
  4. Tres cifras clave: lo que tienes cerca (por ejemplo 3/8), la población de hoy y la población cuando esté completo.
  5. Lo que hará falta.
  6. Tabla de qué hay cerca y qué viene, con su estado y los minutos.
  7. Transporte y fuentes.

  Se pinta fuera de la aplicación (en un portal de React), así que al imprimir solo sale la ficha, en A4.
- **"Qué buscas":** los 4 botones fijos de situación se sustituyen por **"Últimas búsquedas"**, con las 4 últimas opciones marcadas por la persona (se recuerdan en el navegador). Si no hay ninguna, no se muestra nada.
- **"3. A qué distancia y qué mostrar"** lleva ahora una frase que explica para qué sirve.
- **Idea 3 de Lucía:** cada resultado aparece en el mapa con el icono de su servicio, coloreado por su estado.
- **Idea 4 de Lucía:** antes de elegir barrio, el mapa colorea cada barrio por el **% de suelo para servicios aún sin construir** (Los Molinos 72 %, Buenavista 60 %), y las tarjetas lo dicen.
- **Pendiente de Lucía:** idea 1 completa (el ranking flotando sobre el mapa; ya está la parte de "solo los 15 mejores en color") e idea 6 (en móvil, barra inferior y panel deslizable).

### 17 oct: cómo nos desmarcamos de los otros 14 equipos
**La competencia** (programa de la final, 20 oct; nosotros exponemos de 10:30 a 10:40):

| Tipo de proyecto | Equipos |
|---|---|
| Elegir municipio o mudarse | EL pueblo (donde mudarte sin echar nada de menos), Madrid 179, ViveTuMunicipio, Aterriza (tu llegada paso a paso), Rumbo a Casa, HabitaMadrid (radiografía de la repoblación), Nido |
| Mayores | MADcompaña (acompañante urbano), CERCA DE TI (cuidar también es llegar) |
| Otros | Oportunia (emprender en los municipios), MadridSilencio, Alcanza, MiMad, GoMAD |

**Conclusión:** unos siete equipos harán un comparador de municipios. El nuestro no puede ser el centro del discurso. **Lo que solo tenemos nosotros:**
1. **Miramos al futuro:** cuánta gente va a llegar según el planeamiento y qué servicios le van a faltar.
2. **¿Hay sitio?** Cruzamos esa demanda con el suelo público vacante (IDEM) de cada municipio.
3. **Herramienta para la Administración:** dónde poner cada centro, cuándo y si la propuesta aguanta.
4. **Validado con el pasado:** error medio del 19 % frente al 39 % de la regla habitual.
5. **Calidad de datos:** errores encontrados en datos oficiales, que podemos devolver a la Comunidad (organizadora).

**Frase para venderlo:** *"Los demás te dicen dónde vivir hoy. Cuna y Canas te dice qué va a faltar mañana, y dónde ponerlo."*
**Titular de la portada:** *"Llegan las familias. ¿Llegarán los colegios?"*

### 17 oct: portada, acceso de técnicos, logo y mejoras de Lucía
- **Portada nueva (Inicio):**
  - Titular y cifras de toda la Comunidad: **513.487 viviendas previstas en 144 municipios**, entre **0,76 y 1,12 millones de personas** más, **78.000–154.000 plazas de colegio** y el equivalente a **31–45 centros de salud** (fuera de Madrid capital).
  - Dos caminos ("Busco dónde vivir" y "Planifico servicios públicos") y cuatro **ejemplos de un clic** (idea 7 de Lucía): Los Molinos, familia con bebé que trabaja en Madrid, Arroyomolinos y Navalcarnero.
  - **Radar "¿hay sitio para lo que viene?"**: los municipios que más pueden crecer, los colegios que harían falta y las parcelas donde cabe uno. Ejemplo: **Torrejón de Velasco** (4.895 habitantes) puede crecer entre un 388 y un 567 %, necesitaría unos 5 colegios y tiene 4 parcelas de 8.000 m² o más ("puede faltar suelo").
  - Bloque "Qué hace distinto a Cuna y Canas" y "Datos abiertos mejores para todos".
- **Acceso de técnicos arriba a la derecha** (entrar y salir). "Planificar" deja la navegación ciudadana y solo aparece con sesión. **Es un acceso de demostración, sin contraseña**: el usuario elige organismo (Comunidad de Madrid o un ayuntamiento) y la sesión se guarda en el navegador; en producción sería con Cl@ve o certificado. No se piden ni guardan credenciales.
- **Logo nuevo (idea de Lucía):** la cabeza de un bebé con un solo pelo, que es una cana, sobre el cuadrado rojo. También como icono de la pestaña.
- **Mejoras de Lucía incorporadas:**
  - Idea 1: en el mapa de "¿Dónde vivir?" solo los 15 mejores en color.
  - **Empates** visibles en el ranking (mismo puesto con "=").
  - Idea 2: **veredicto del barrio** ("tienes 5/8 de lo que buscas", con ✓/✕ y minutos).
  - Idea 5: botón **▶** que recorre los años de 2025 a 2040.
  - Idea 7: ejemplos de un clic.
  - Además, al elegir barrio el panel baja solo hasta la respuesta, que antes quedaba debajo de los controles (el diagnóstico de Lucía).
  - **Pendientes:** idea 3 (iconos por servicio en el mapa), idea 4 (barrios coloreados por suelo sin construir) e idea 6 (móvil con barra inferior y panel deslizable).
- **"¿Hay sitio para lo que viene?" en cada ficha de municipio:** parcelas vacantes de equipamiento, hectáreas, cuántas admiten un colegio (8.000 m² o más) o una escuela infantil o centro de día (1.500 m² o más), frente a los colegios que necesitaría la población nueva.


### 16 oct (noche): la herramienta pasa a cubrir toda la Comunidad, con tres secciones
**Por qué:** el equipo señaló que (1) a media pantalla la web no se organizaba bien, (2) la pantalla ciudadana es para **investigar pueblos** antes de mudarse, no para quien ya tiene una dirección, (3) hacían falta muchas más opciones en "qué te interesa", y (4) faltaban cosas que prometen los documentos Word. Se releyeron los documentos 1 y 3 y se cubrió cada punto.

**Tres secciones** (cabecera):
1. **¿Dónde vivir?** (nueva, es la entrada). Tu situación (bebé, hijos en edad escolar, cuido de mis mayores, trabajo en Madrid, tranquilidad, vivienda nueva, soy mayor) + **24 criterios** en 6 grupos (educación pública, concertada o privada, escuela infantil, instituto, FP, centro de salud, hospital cerca, farmacias, residencias, centros de día, hogares de mayores, metro o Cercanías, líneas de autobús, cerca de Madrid, zonas verdes, deporte, cultura, tranquilidad, ambiente joven, crecimiento, vivienda nueva, paro) + tamaño y distancia a Madrid. Ordena **los 179 municipios** en un mapa coloreado y un ranking. Cada municipio tiene su **ficha**: cómo queda en lo que te importa, lo que hay (12 indicadores), **lo que viene** (viviendas previstas → población que llegará → plazas que harán falta, con el modelo calibrado) y su gente (edad, nacimientos, renta, paro). **Comparador** de hasta 3 municipios lado a lado. Ficha en PDF.
2. **Barrios** (rehecha). Se elige un **barrio** de la lista o se pulsa en el mapa; la calle es opcional. 16 categorías (escuela infantil pública o privada, colegio público, concertado o privado, instituto, centro de salud o consultorio, hospital, farmacia, centro de día, residencia, hogar de mayores, parques, deporte, cultura, suelo reservado) con atajos por situación; distancia 5/10/15/20 minutos; **filtro por estado** (ya existe, en el planeamiento, prevista, suelo disponible; licitada y en obras se muestran desactivadas hasta tener los datos). Población del barrio hoy y al completarse, y lo que hará falta.
3. **Planificar** (técnicos), con todo lo del documento 1 y 3:
   - **Zona de estudio:** un barrio (lista o clic en el mapa) o todo el municipio.
   - **Gráfica de población año a año (2025–2040) por grupos** (bebés, niños, jóvenes, adultos, mayores), con el grupo del servicio en rojo.
   - Deslizadores de **año**, **natalidad** (±40 %) y **llegada de personas** (±50 %), y una **cifra concreta** escrita a mano ("1.000 niños"), que se reparte en el espacio como la población.
   - **Cuándo hace falta cada centro** (dimensión temporal) y si la mejor parcela **cambia** entre la primera y la última etapa.
   - **Ver si aguanta:** cada ubicación se recalcula con menos viviendas (mínimo calibrado) y 3 años de retraso, y se marca si se mantiene.
   - **Titularidad:** una parcela vacante que cae dentro de una red pública de equipamiento del planeamiento es suelo público ("de uso adecuado" si la red es del tipo del servicio). Interruptor "solo suelo público". En Getafe, 52 de las 294 candidatas.
   - Ficha por ubicación: coordenadas, superficie, titularidad, personas cubiertas, parada más cercana, licitaciones (sin datos todavía) y alternativas descartadas.

**Fotografías de licencia abierta** (lo prometía el documento 3): la imagen representativa de cada municipio en Wikidata (propiedad P18, buscada por código INE con la propiedad P772), servida desde Wikimedia Commons con enlace a su autoría y licencia. Los 179 municipios tienen foto.

**Adaptable a cualquier ancho:** pantalla ancha con 3 columnas en Planificar; media pantalla (≥ 768 px) con 2 columnas y "Ajustes / Resultados" en pestañas; móvil con el mapa arriba y el panel debajo. Cabecera compacta en una línea. En móvil la leyenda del mapa se pliega tras un botón para no taparlo.

### 16 oct (noche): cómo se puntúan los municipios
- Cada criterio da a cada municipio un **percentil** respecto a los que pasan los filtros; la coincidencia es la media de los percentiles elegidos. No hay pesos inventados.
- **Sesgo detectado y corregido:** con ratios por habitante ganaban aldeas de 300 habitantes (1 escuela para 15 niños). Ahora los criterios de servicios combinan **suficiencia (60 %)**, la ratio por habitante con tope en el percentil 75, y **variedad (40 %)**, cuántos centros hay para elegir.
- "Tengo un bebé" incluye hospital cerca.

### 16 oct (noche): procesado de toda la Comunidad
- `etl/lote.py` ejecuta el pipeline para los 178 municipios (todos menos Madrid capital, que no está en el planeamiento refundido). Unos 15 s por municipio.
- `etl/municipios_resumen.py` calcula unos 40 indicadores comparables de los 179 municipios (incluida Madrid) y sus límites (`municipios_resumen.json`, 236 KB; `municipios.geojson`, 157 KB).
- **Robustez:** el pipeline aguanta capas vacías (pueblos sin Portal del Suelo, sin centros sanitarios o **sin ámbitos de desarrollo**: Boadilla, Brunete, Ciempozuelos, Guadarrama…).
- **Consultorios de atención primaria:** se cuentan junto a los centros de salud. Son la atención primaria de los pueblos (154 en la Comunidad).
- **Farmacias** (CKAN `oficinas_farmacia`, coordenadas con coma decimal) añadidas a cada municipio.


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

### 16 oct (noche): hallazgos en los datos de toda la Comunidad
- **Arroyomolinos tiene 38.185 habitantes y ningún centro de salud** (solo un consultorio). Paracuellos, 27.649 habitantes y un centro de salud.
- **Navalcarnero tiene previstas 21.434 viviendas** para 33.352 habitantes: podría casi duplicar su población.
- **Los Molinos (Getafe):** 11.473 vecinos, sin centro de salud ni escuela infantil pública a menos de 10 minutos a pie, y con 20 parcelas reservadas para equipamientos sin construir alrededor. Con los supuestos de partida, hacen falta **2 colegios nuevos ya hoy**, y las dos ubicaciones aguantan con menos viviendas y 3 años de retraso.
- Datos que **no** existen a escala municipal en el catálogo: precio del alquiler (solo regional) y cobertura de banda ancha.

### 16 oct: rediseño con el estilo de las webs de la Comunidad de Madrid
- **Por qué:** la primera versión tenía colores pastel, botones redondeados y estaba poco organizada. El equipo pidió algo más profesional, limpio y muy fácil de usar, en la línea de comunidad.madrid.
- **Qué tomamos de comunidad.madrid** (revisada el 16 oct): cabecera negra (#131313), tipografía IBM Plex Sans, rojo institucional (#DE0029) solo como acento, botones rectos con borde fino (2 px de radio como máximo), mucho blanco y títulos grandes.
- **Logo:** uno propio (cuadrado rojo con una cuna en blanco), **no el emblema oficial** de la Comunidad. Usar la marca institucional en una herramienta no oficial podría parecer un respaldo de la Comunidad, y en el jurado hay representación suya. En su lugar, la mención "Con datos abiertos de la Comunidad de Madrid".
- **Sencillez:**
  - "Mi barrio" es la pantalla de entrada: un buscador grande, 4 casillas con icono para elegir qué te interesa, y resultados en filas con los minutos a pie y el estado.
  - En la pantalla técnica, 3 pasos numerados con solo 3 deslizadores a la vista; el resto va plegado en "Supuestos avanzados".
  - El resultado se resume en una frase grande ("3 centros nuevos") y una barra de cobertura.
- **Detalles:** iconos de línea propios en lugar de bolas de colores; las líneas de autobús y metro como etiquetas; los nombres en mayúsculas de los registros pasan a formato normal; el mapa se encuadra en la zona habitada y no en todo el término municipal.

### 16 oct: decisiones de la web
- **Sin Web Worker:** el cálculo completo tarda milisegundos (unos 300 puntos de demanda por 300 candidatas), así que no hace falta. Se descarta para no añadir complejidad.
- **Ocupación mínima del 30 %:** el algoritmo no propone un centro nuevo que se llenaría por debajo del 30 % de su capacidad. Sin esto proponía, por ejemplo, una escuela infantil al 23 %. Cuando ocurre, la web avisa de que la demanda restante está "dispersa" y que puede atenderse ampliando centros existentes.
- **Mapa base del IGN (IGN Base, WMTS público), atenuado.** El de CARTO empezó a pedir clave de API. El del IGN es oficial y encaja con el discurso de datos abiertos.
- **Distancias en línea recta, a 80 m por minuto.** Es una aproximación y la web lo dice. Mejora posible: tiempos por la red de calles.
- **Nombres legibles de barrio:** "SUS-PP-2 LOS MOLINOS" se muestra como "Los Molinos", con el código oficial al lado en la pantalla técnica. Los centros de salud del registro sanitario no traen nombre: se identifican por su calle ("Centro de salud (Palestina)").
- **Qué centros cuentan como oferta, por servicio** (`servicios.json`, campo `existentes`): escuelas infantiles públicas y privadas; colegios públicos y concertados; centros de salud; centros de día de mayores **sin** "hogares y clubes" (habrían sumado 1.459 plazas que no son de centro de día); residencias de mayores con sus plazas reales.
- **Colegio:** la tasa de uso pasa a ser la proporción de alumnado en centros sostenidos con fondos públicos (supuesto 80–90 %), coherente con contar como oferta los públicos y los concertados.
- **Probado en el navegador** con Getafe y Navalcarnero, en las dos pantallas. Resultados que sirven para la demo: en Getafe propone un colegio en Los Molinos que se llenaría al 100 % (675 plazas), a 212 m del metro El Casar; en la pantalla ciudadana, desde la Avenida Rocinante 8 no hay ningún centro de salud a menos de 15 minutos andando, y el barrio necesitará entre 959 y 1.882 plazas de colegio, frente a 675 cerca.
- **Arranque local:** `.claude/launch.json` (servidor `web`) o `npm --prefix web run dev`. Producción: `npm --prefix web run build` → `web/dist` (código de unos 344 KB comprimido, más unos 2,4 MB de datos de los dos municipios).

### 16 oct: más hallazgos en los datos
- **Las paradas compartidas entre redes aparecen dos veces** en los servicios del Consorcio: la misma parada física, con el mismo identificador, en interurbanos y en urbanos (237 en Getafe y 45 en Navalcarnero). Se fusionan en una sola con todas sus líneas: Getafe pasa de 594 registros a 357 paradas reales y Navalcarnero de 125 a 80.
- **Algunas geometrías reparadas salían como "colecciones"** (polígonos mezclados con líneas), y la web fallaba al buscar en qué barrio cae un punto. Ahora el procesado guarda solo polígonos y `verificar.py` rechaza cualquier otro tipo de geometría.

### 15 oct: el modelo de demanda, calibrado con barrios reales (paso 6)
- **En los barrios nuevos de Getafe viven entre 1,49 y 2,18 personas por vivienda prevista** (mediana 2,00), no los ~2,6 del tamaño medio del hogar. No todas las viviendas del plan llegan a estar habitadas, o no a la vez: la regla habitual (viviendas × tamaño del hogar) **sobreestima**.
- **Los menores de 18 son entre el 25,6 y el 30,5 %** de la población en esos barrios (mediana 29,5 %), frente al 18,2 % del conjunto de Getafe. Los mayores de 65, entre el 2,4 y el 9 %.
- **Barrios de calibración** (al menos 1.000 viviendas, menos del 15 % de suelo residencial vacante y al menos una sección censal entera dentro): El Bercial, Perales del Río, Los Molinos y Buenavista. Kelvinator quedó fuera: ninguna sección cae entera dentro y daba 0,7 habitantes por vivienda, un artefacto del reparto por áreas.
- **Prueba con el pasado (deja uno fuera, población real de 2023 según el INE):**

| Barrio | Real | Modelo | Error | Regla ingenua (viviendas × 2,6) |
|---|---|---|---|---|
| El Bercial | 12.931 | 10.887 | −15,8 % | +19,6 % |
| Perales del Río | 3.807 | 3.201 | −15,9 % | +19,5 % |
| Los Molinos | 11.473 | 12.205 | **+6,4 %** | +42,2 % |
| Buenavista | 8.854 | 12.266 | +38,5 % | +75,0 % |

  Error absoluto medio: **19 % frente al 39 %** de la regla habitual. Buenavista falla más porque todavía se está llenando (gana unos 500 habitantes al año); se dice tal cual en la presentación.
- **Los menores se reparten por edades** con el censo municipal de 2025: 0-2 años el 13,4 %, 3-5 el 14,8 %, 6-11 el 35,5 % y 12-17 el 36,3 % (Getafe). Es un supuesto: en los barrios nuevos probablemente hay más niños pequeños.
- **Población futura (central) por llegar:** unos 9.900 habitantes en Getafe y unos 40.600 en Navalcarnero, que casi duplicaría su población actual (33.352).
- **Navalcarnero no permite calibrar:** solo tiene 16 secciones censales (unos 2.000 habitantes cada una), demasiado grandes para medir sus ámbitos. Se usan los parámetros de Getafe, y así se indica.
- **Supuestos por servicio** (`servicios.json`): tasas de uso, capacidad por centro, superficie mínima y minutos andando. Son puntos de partida ajustables, no normas, y los que no tienen fuente están marcados "por verificar".

### 15 oct: secciones, transporte y zonas de salud (pasos 4 y 5)
- **La capa de secciones de la IDEM trae, por cada sección, su zona básica de salud y su zona de servicios sociales.** Pero esos códigos (6 dígitos) no coinciden con los del dataset de zonas de salud de CKAN (3 dígitos): el nombre se asigna cruzando por geometría.
- **Getafe tiene 8 zonas básicas de salud y 9 centros de salud.** Juan de la Cierva atiende a 40.687 habitantes con un solo centro; El Bercial (Los Molinos) a 20.054. Navalcarnero es una sola zona con 2 centros para unos 32.000 habitantes.
- **Paradas:** Getafe 594 (343 de interurbanos, 237 de urbanos, 9 de Metro y 5 de Cercanías); Navalcarnero 125.
- **Error de mezcla cazado por `verificar.py`:** una parada de "Navalcarnero" estaba en Villarrubia de los Ojos (Ciudad Real), a 123 km. El código de municipio 096 se repite en otra provincia (13096) y el Consorcio tiene líneas que llegan allí. Ahora se filtra también por provincia. **Es un buen ejemplo para la presentación** de por qué la comprobación automática importa.
- **Reparto de población por áreas:** cada sección aporta a un ámbito la fracción de su superficie que cae dentro. Antes usábamos "todo o nada" (mitad o más de la sección), y Buenavista perdía una sección de 3.894 habitantes que solo tiene el 43 % dentro.
- **Los Molinos ha pasado de 5.983 habitantes en 2015 a 11.473 en 2023** (INE, reparto por áreas). Buenavista, de 6.027 a 8.854.

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

### Confirmadas el 15 de octubre
| Dato | Fuente y acceso | Notas |
|---|---|---|
| Secciones censales (geometría + zona de salud + zona de servicios sociales) | WFS IDEM `UnidadesAdministrativas:IDEM_GDIE_G_SECCION`, filtro `CDMUNI` | 4.518 en la Comunidad; 122 en Getafe y 16 en Navalcarnero |
| Indicadores demográficos por sección 2015–2023 | INE, Atlas de Distribución de Renta, tabla 31105 (CSV `jaxiT3/files/t/es/csv_bdsc/31105.csv?nocab=1`) | 38 MB, toda la provincia; formato español (174.480 y 41,2) |
| Paradas y estaciones | CRTM, `services5.arcgis.com/UxADft6QPcvFyDU1` (M8_Red, M9_Red, M5_Red, M4_Red, M10_Red) | Filtro `CODIGOPROVINCIA='28' AND CODIGOMUNICIPIO`; trae las líneas y la accesibilidad |
| Zonas básicas de salud (nombres y geometría 2019) | CKAN `covid19_tia_zonas_basicas_salud` (SHP) | Solo para poner nombre a las zonas de la IDEM |

### Confirmadas el 16 de octubre
| Dato | Fuente | Notas |
|---|---|---|
| Límites municipales | WFS IDEM `UnidadesAdministrativas:IDEM_CM_UNID_ADMIN` | 194 polígonos (con enclaves), 179 municipios + 2 terrenos comuneros sin población |
| Farmacias | CKAN `oficinas_farmacia` | 2.956, con coordenadas UTM (coma decimal) y nombre del municipio |
| Bibliotecas | CKAN `spacm_listado_bibliotecas_servicios_lectura` | 809, por localidad |
| Renta disponible por habitante | CKAN `irpf_indicador_renta` (medida "Per cápita") | 2023 |
| Paro registrado por 100 habitantes | CKAN `1902280` | 2025 |
| Estaciones y paradas de toda la Comunidad | CRTM (M4, M5, M8, M9, M10), sin geometría | Para contar estaciones y líneas por municipio |

### Por localizar o confirmar
- [ ] Matrícula de infantil de primer ciclo (CKAN)
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
- **17 oct (tarde):** ficha del barrio rehecha con foto del mapa; últimas búsquedas en lugar de situaciones fijas; frase explicativa en distancia y estado; ideas 3 y 4 de Lucía (iconos en el mapa y barrios coloreados por suelo sin construir).
- **17 oct:** análisis de la competencia y estrategia para desmarcarnos; portada con cifras de la Comunidad, radar de suelo y ejemplos de un clic; acceso de técnicos (demo) arriba a la derecha; logo del bebé con una cana; mejoras de Lucía 1, 2, 5 y 7. Rama de Lucía integrada en `main`.
- **16 oct (noche, 3):** revisión de la interfaz con capturas. Diagnóstico: en las tres secciones la respuesta queda debajo de los controles. Siete propuestas con maqueta (pendientes de decidir): 1) ranking de ¿Dónde vivir? flotando sobre el mapa con solo los 15 mejores en color; 2) veredicto del barrio arriba ("tienes 3 de las 8 cosas que buscas", con ✓/✗ y minutos); 3) iconos por servicio en el mapa y parcelas agrupadas; 4) barrios coloreados por suelo de equipamiento sin construir antes de elegir; 5) Planificar en modo sencillo (servicio, año, nº de centros; el resto plegado) con botón ▶ 2025→2040; 6) móvil con cabecera de una línea, barra inferior y panel deslizable; 7) ejemplos de un clic en la portada. Propuesta de orden: 1, 2 y 5. **Problema detectado:** con "Tengo un bebé" el primero es Santa María de la Alameda (1.596 hab.), empatado al 73 % con Madrid; hay que mostrar empates y revisar el tamaño por defecto.
- **16 oct (noche, 2):** idea de logo nuevo: la cabeza de un bebé con un solo pelo que es una cana (cuna + canas). Se pedirá a Claude Design con el contexto del proyecto y la paleta de la web (rojo #DE0029, tinta #131313). Pendiente de elegir versión y cambiarlo en la cabecera.
- **14 oct (noche, 3):** repositorio creado en GitHub, primer commit subido e invitada la compañera de equipo. Paso 3 hecho.
- **17 oct (madrugada):** lote completo: **178 municipios procesados y verificados** (todos menos Madrid capital), con farmacias. Fallos corregidos por el camino: municipios sin ámbitos de desarrollo (20) y secciones que colapsaban al simplificar (Torrejón de Ardoz y Valdemoro). `data/processed` ocupa 53 MB.
- **16 oct (noche):** tres secciones (¿Dónde vivir?, Barrios, Planificar), 179 municipios comparables, lote de toda la Comunidad, todo lo que faltaba de los documentos en la pantalla técnica, y diseño adaptable a media pantalla y móvil.
- **16 oct (tarde):** rediseño de la web con el estilo de comunidad.madrid (logo propio, no el oficial).
- **16 oct:** la web funciona con las dos pantallas y los dos municipios (pasos 7 y 8 hechos y 10 casi). Probada en el navegador. Arreglados el mapa base, la ocupación mínima, las paradas duplicadas y las geometrías mixtas.
- **15 oct:** etapa 2 de datos completa: `pipeline.py`, `secciones.py`, `transporte.py`, `zonas.py` y `demanda.py`. El modelo calibrado con barrios reales reduce a la mitad el error de la regla habitual. La verificación cazó una parada de Ciudad Real colada en Navalcarnero.
- **14 oct (noche, 2):** paso 2 hecho: `descargar_idem.py` genérico por código INE, `procesar_idem.py` y `verificar.py`. Getafe 818 KB y Navalcarnero 624 KB de capas ligeras. Hallazgos: parcelas con geometría inválida, 52 candidatas sin superficie, y el estado "prevista" no sale de las redes.
- **14 oct (noche):** paso 1 hecho: `etl/comun.py` y `etl/descargar_ckan.py`, probados con Getafe y Navalcarnero; se detectaron y descartaron 3 coordenadas erróneas.
- **14 oct (tarde, 2):** comprobamos que el texto de los 50.000 habitantes está oculto (blanco sobre blanco) en el PDF; el apartado 3 no pone límites. Getafe se queda. Decidido también: HTTPS, los 5 servicios y extracción con Claude Code.
- **14 oct (tarde):** al leer las bases vemos que el título del reto habla de municipios de menos de 50.000 habitantes. Getafe queda en revisión y Navalcarnero aparece como alternativa (§4).
- **14 oct:** elegimos Getafe; descargamos las 5 capas de la IDEM; confirmamos que el suelo de equipamiento sigue vacante en los barrios nuevos; fijamos el calendario completo; decidimos usar Oracle como alojamiento y para dar acceso a los datos al jurado.

### 17 oct (noche): guion con role play
- La presentación empieza con dos escenas: **Laura**, vecina con un bebé que trabaja en Madrid y busca dónde mudarse (¿Dónde vivir?, compara Getafe y Navalcarnero, descarga las dos fichas PDF), y **Carmen**, técnica de la Comunidad (Planificar en Navalcarnero: ▶, arrastrar, natalidad y robustez). Después, 5 minutos de venta. Guion en `docs/GUION_PRESENTACION.md`.

### 17 oct (noche): zonas verdes y naturaleza
- **Problema (Claudia):** con solo "Parques y zonas verdes" el mapa no tenía sentido. Causas: (1) 49 municipios sin dato (Madrid, Boadilla, Guadarrama…: su planeamiento no está refundido en la IDEM) puntuaban como los peores; (2) el dato es suelo **reservado** en el planeamiento, no parques existentes (Getafe sale con 167 m²/hab.); (3) no recoge la naturaleza de verdad (sierra, montes, ríos).
- **Decisiones:** (a) el criterio pasa a llamarse **"Zonas verdes urbanas"** y explica que es suelo del planeamiento y que 49 municipios no lo tienen; (b) **sin datos ya no es lo mismo que el peor**: si un municipio no tiene dato de nada de lo elegido, sale en gris "sin datos" y fuera del ranking (leyenda y recuento); si le falta solo alguno, se promedian los que tiene; (c) criterio nuevo **"Naturaleza protegida"**: % del término municipal dentro de un Espacio Natural Protegido (`LugaresProtegidos:IDEM_MA_ENP`) o un LIC/ZEC de la Red Natura 2000 (`IDEM_MA_RED_NATURA_LIC_ZEC`), con tope en el percentil 75. Cobertura completa (179). "Busco tranquilidad" = poca densidad + naturaleza protegida + zonas verdes urbanas. Resultado: Puebla de la Sierra, El Atazar, Pinilla del Valle, Rascafría…
- **Descartado:** las ZEPA (zonas de aves) en ese cálculo: protegen estepas cerealistas, no espacios para pasear. Ojo: el LIC "Cuencas de los ríos Jarama y Henares" sí cubre entero el término de Daganzo, Camarma o Fresno de Torote (100 %): es Red Natura oficial y se deja.
- **Fuente encontrada para el futuro:** `CubiertaTerrestre:IDEM_EIEL_PARQUE_23` (Encuesta de Infraestructura y Equipamientos Locales 2023): 2.100 parques **existentes** con nombre, tipo, superficie, juegos infantiles y estado. Solo municipios pequeños (la EIEL no cubre los grandes), por eso no sustituye aún al planeamiento.

- **17 oct (noche):** la portada ya no tiene el botón "Planifico servicios públicos": la portada es para las familias; el acceso de técnicos queda solo arriba a la derecha.
- **17 oct (noche), zonas verdes con datos reales:** el criterio usa ahora los **parques existentes de la EIEL 2023** (`CubiertaTerrestre:IDEM_EIEL_PARQUE_23`, sin refugios de montaña) en los 155 municipios que cubre, y el suelo verde del planeamiento solo en las ciudades grandes que no están en la EIEL. Sin datos pasa de 49 a 6 (Madrid, Boadilla, Las Rozas, Pinto, Pozuelo y Rivas). Cada municipio indica de qué fuente sale (`zonas_verdes_fuente`). Ojo: el planeamiento da cifras más altas (incluye parques sin hacer); el tope en el percentil 75 limita la ventaja.

### 17 oct (noche): datasets para el jurado, nada marcado de entrada y viviendas estimadas
- **Datasets elaborados (requisito de las bases y del correo):** `etl/paquete_datos.py` genera `data/processed/datos/` y se publica con la web: `municipios.csv` (179), `barrios.csv` (4.228 ámbitos con población hoy y al completarse por edad), `parcelas_vacantes.csv` (9.131 con coordenadas), `cuna-y-canas-datos.zip` (todo lo que usa la web, unos 6 MB; no se versiona en git) e `index.html` con descargas, método y **diccionario de datos** con la fuente de cada campo. Enlace "Datos abiertos" en la cabecera de la web. Dirección: .../o/datos/index.html
- **Nada seleccionado de entrada (Claudia):** "¿Dónde vivir?" empieza sin situación ni criterios, y Barrios sin categorías. Al pasar de un municipio a su mapa ("Ver el mapa de X") se marcan solo las categorías equivalentes a los criterios elegidos (`CATS_DE_CRITERIO`; p. ej. colegio privado → colegio privado). Los ejemplos de la portada siguen llevando su selección.
- **Ámbitos sin número de viviendas (1.830 de 4.228):** la IDEM trae uso predominante, figura, promoción, superficie y coeficiente de edificabilidad. Se guardan (`uso`, `figura`, `promocion`) y en los residenciales con edificabilidad se estima un rango: superficie × coeficiente / (120-180 m² por vivienda unifamiliar, 80-110 colectiva, 90-150 sin precisar). 233 ámbitos estimados; p. ej. P-08 de Navalagamella: residencial unifamiliar, plan parcial privado, 17,9 ha, 0,2 m²/m² → 200-300 viviendas. Se muestra siempre como estimación y **no entra en el modelo de demanda** (solo usa viviendas oficiales). Los no residenciales (industrial, terciario) siguen "sin datos de viviendas", que es lo correcto.
- **17 oct (noche), pasos de "¿Dónde vivir?":** "1. Empieza por tu situación" se explica como **atajo** que marca los criterios del punto 2 ("2. Ajusta qué es importante para ti"); no son dos cosas distintas. Sin nada elegido, el mapa sale en **gris claro** (antes negro: la puntuación sin criterios era NaN y MapLibre pintaba el color por defecto) y la leyenda invita a elegir.
- **17 oct (noche), Barrios sin nada marcado:** al pulsar un punto se enseña todo lo que hay (todas las categorías); en cuanto se marca algo, solo eso.
- **17 oct (noche), tecla Escape en Barrios:** un solo Escape, o la X de la ventanita del mapa, quita el sitio elegido y cierra la ventanita a la vez (antes hacían falta dos pulsaciones y la X dejaba el sitio marcado).
- **17 oct (noche), "dónde hay" (Claudia: "quiero ver dónde hay escuelas infantiles"):** con **un solo servicio marcado**, el mapa ya no enseña el ranking por habitante (que ponía arriba pueblos pequeños con una escuela y dejaba pálidos Madrid o Getafe), sino **cuántos hay en cada municipio**: gris si ninguno, de rosa a granate cuantos más (escala por raíz cuadrada, porque Madrid tiene cientos). Ventanita con el número. Con dos o más criterios vuelve el ranking de los 15 que mejor encajan, y la leyenda lo explica.
- **17 oct (noche), ranking con sentido (Claudia: "con dos criterios vuelve a estar mal"):** (1) el mapa colorea **los 179 municipios** de claro a oscuro según la coincidencia (antes solo los 15 primeros: manchas sueltas); (2) en los servicios, **si no hay ninguno el criterio vale 0** (antes empataba con los demás sin servicio y sacaba unos 20 puntos); (3) variedad (cuántos hay para elegir) **60 - **17 oct (noche), ranking con sentido (Claudia: "con dos criterios vuelve a estar mal"):** (1) el mapa colorea **los 179 municipios** de claro a oscuro según la coincidencia (antes solo los 15 primeros: manchas sueltas); (2) en los servicios, **si no hay ninguno el criterio vale 0** (antes empataba con los demás sin servicio y sacaba unos 20 puntos); (3) variedad (cuántos hay para elegir) **60 %** y suficiencia **40 %** con tope en la **mediana** (antes 40/60 con tope en el P75: los pueblos diminutos con 2 escuelas para pocos niños copaban el ranking). Con escuela infantil pública + total, arriba: San Fernando, Guadarrama, Tres Cantos, Leganés, Alcorcón, San Sebastián de los Reyes…
- **17 oct (tarde-noche), Barrios: lo que ya hay y vivienda nueva (Claudia):** (1) al entrar en un municipio el mapa enseña desde el principio **los servicios que ya existen** (lo marcado o, sin nada marcado, todo), sin tener que pinchar; (2) capa nueva **"Dónde puede haber vivienda nueva"** (`etl/vivienda_nueva.py` → `vivienda_nueva.geojson`): solares **residenciales vacantes** del catastro según la IDEM (`IDEM_VPLA_SVAC_SOCU_26`, uso residencial + ocupación "Vacante", mínimo 100 m²), 53.543 en toda la Comunidad, más el **suelo público en venta para vivienda** del Portal del Suelo; cubre también los municipios sin plan refundido (Boadilla: 417 solares, 11 parcelas públicas residenciales en venta); se puede apagar en la leyenda. (3) **Fallo arreglado:** en 30 municipios pequeños (p. ej. El Vellón) el mapa salía en blanco porque el encuadre se calculaba con un único punto de demanda (tamaño cero); ahora usa el contorno del municipio.
- **17 oct (noche), portada para quien busca casa (Claudia):** el **radar** (¿hay sitio para los colegios?) y el ejemplo "Navalcarnero crece" (abre Planificar) **solo se ven con sesión de técnico**; para el público, el cuarto ejemplo es Boadilla (vivienda nueva). "Qué hace distinto" pasa a **"Qué puedes encontrar si buscas casa"**: 4 accesos (qué hay a 10 minutos, qué se va a construir, qué servicios harán falta, dónde vivir según tu vida) y 4 listas pulsables con datos reales: donde más se va a construir (viviendas previstas), más solares para vivienda (catastro), suelo público en venta para vivienda (Portal del Suelo) y los que más crecen (más de 5.000 hab.). `vivienda_nueva.py` añade al resumen `solares_vivienda`, `solares_vivienda_m2` y `suelo_publico_vivienda` (hay que ejecutarlo después de `municipios_resumen.py`; está en el README).
- **17 oct (noche), fallo "ninguno cerca" con el más cercano a 3 minutos:** sin nada marcado, la lista de lo que hay cerca usaba las categorías marcadas (ninguna) en vez de "todas"; por eso salía "ninguno cerca" y "hoy hay 0" en todo. Corregido. Además, "hoy hay N" en lo que hará falta dice ahora "públicos", porque el modelo calcula la demanda de la red pública.
- **17 oct (noche), el mapa "se movía hacia arriba" al pinchar:** al elegir un sitio, el panel bajaba solo a los resultados con `scrollIntoView`, que desplaza también los contenedores de fuera (la página) y arrastraba el mapa. Ahora solo se desplaza el panel (`aside.scrollBy`). Comprobado: la página y el mapa no se mueven.
- **17 oct (noche), varios arreglos de Barrios (Claudia):** (1) **pulsar un nombre de la lista** (p. ej. una escuela) lleva el mapa hasta él y abre su ventanita; (2) **el mapa ya no salta** al elegir un sitio: si se ve bien no se mueve y, si no, se desplaza sin alejarse (antes iba siempre a un zoom fijo); (3) **"En el planeamiento" no se entendía**: las zonas verdes y equipamientos de las redes del planeamiento sin estado se cruzan con el catastro (`etl/redes_catastro.py`, suelo vacante y ocupado de la IDEM): 9.391 resultan hechas ("Ya existe"), 509 reservadas pero vacías y 107 siguen sin saberse; la etiqueta pasa a "Reservado, sin hacer" con el detalle de la fuente; (4) el morado (suelo público en venta para vivienda) solo existe en unos 30 municipios: se mantiene, pero en la leyenda solo aparece si el municipio lo tiene; (5) geometrías inválidas en los solares por el redondeo de coordenadas: reparadas, el verificador vuelve a 0 fallos.
- **17 oct (noche), Planificar más claro (Claudia: "hay mazo cosa"):** (1) **la respuesta en una frase** arriba del todo ("Centro de salud: hacen falta 2 nuevos en Aranjuez para 2035. El 1.º hace falta ya hoy, cerca de…; el 2.º hacia 2032, en…"); (2) **nombres claros** en las ubicaciones propuestas: el barrio o "Cerca de <parada más cercana>" en vez de "Fuera de los barrios en desarrollo"; (3) **mapa más limpio** de entrada: las burbujas de demanda pasan a ser una capa que se enciende a mano; (4) **aviso al mover, fijar o soltar un centro**: "Has movido un centro. Antes se atendía el 87 % de la demanda; ahora, el 91 %: mejora"; (5) en la gráfica, "Toda la población" cuando el servicio es para todos.
- **17 oct (noche), zonas industriales en Barrios:** los ámbitos con uso no residencial (p. ej. Parque Empresarial La Carpetania, Getafe) salían "Sin datos · sin datos de viviendas" y en el mismo rojo que los barrios con casas. Ahora salen en gris, la ventanita dice "Zona industrial · no habrá viviendas" (o de oficinas y comercio) y "Cuando esté completo" dice "no es zona residencial".
- **17 oct (noche), contradicción en Planificar (Claudia):** con escuela infantil en Getafe decía "Demanda dispersa: puede atenderse ampliando centros existentes" y a la vez "Ya hoy · el primer centro nuevo (déficit actual)". El calendario contaba centros teóricos (demanda sin cubrir / capacidad) en vez de los viables. Ahora cuenta solo los centros nuevos que se proponen; con demanda dispersa, el titular dice "No hace falta ningún centro nuevo", el resumen explica que los actuales atienden el 94 % y lo que falta (138 plazas) puede cubrirse ampliándolos, y el calendario lo repite.
- **17 oct (noche), editar centros con una barra (Claudia: "pinchar y que se ponga un centro directo no me gusta"):** barra encima del mapa de Planificar con **Ver** (por defecto: pinchar solo informa), **+ Añadir centro** (pulsar una parcela azul pone un centro y suma uno al total) y **− Quitar centro** (pulsar un centro rojo o su parcela lo quita: un centro menos y esa parcela descartada); aviso con el efecto en la cobertura y botón **"Volver a la propuesta automática"**. Se quita además el sombreado de los centros existentes (sus círculos superpuestos formaban una mancha gris). Probado en Getafe, colegio: quitar el 1 → de 3 a 2 centros, 97 % → 95 %; volver → 3. Añadido al guion (escena de Carmen).
- **17 oct (noche), "¿Acierta el modelo?" (Claudia: "¿qué es, hace falta?"):** es la prueba con el pasado (barrios de Getafe ya habitados, predichos sin mirar sus datos: error medio del 19 % frente al 39 % de la regla habitual). Se queda solo en Planificar (técnicos y jurado; cubre el criterio 1.1), pero **plegada** bajo "¿Son fiables estas cifras?", con la explicación en una frase, las medias calculadas y columnas legibles ("Población real", "Nuestro error", "Regla habitual"; antes se pegaban).
- **17 oct (noche), residencias y centros de día con sentido (Claudia: "8 residencias ya hoy en Getafe es una barbaridad"):** (1) la tasa usaba la ratio ideal de 5 plazas por 100 mayores; ahora la **media real de la Comunidad**: residencias 4,3 por 100 (57.996 plazas / 1,34 millones de mayores de 65, rango 3,5-5) y centros de día 1,3 por 100 (rango 1-1,6); cambiado en `etl/demanda.py` y `servicios.json`; (2) las residencias **no se eligen por cercanía**: se calculan para todo el municipio (`escala: "municipio"`, sin deslizador de minutos a pie); (3) el titular de residencias va en plazas ("Faltan unas 770 plazas") y el resumen compara con la media ("Getafe tiene 2,2 por cada 100 mayores; la media es 4,3; equivale a entre 4 y 10 residencias según su tamaño"); (4) el calendario se agrupa por año ("Ya hoy · 6 centros nuevos") en vez de repetir líneas; (5) fuera la casilla "escribe una cifra concreta"; (6) la barra Ver / Añadir / Quitar pasa abajo, más pequeña. **Revisión de las 5 categorías** en Aranjuez, Getafe y Navalcarnero: resultados coherentes (p. ej. Navalcarnero no necesita residencias: 14,6 por 100; Getafe no necesita escuelas infantiles nuevas: 94 % cubierto).
- **17 oct (noche), presentación en diapositivas:** 19 diapositivas en un artifact de tipo Slides (https://claude.ai/artifact/WNVAW9rUKq8M9XrMyPRWeD, privado; se descarga en PowerPoint o PDF): showcase con capturas reales (Laura: ¿Dónde vivir?, ficha de Navalcarnero, Los Molinos; Carmen: Planificar en Navalcarnero), el problema (513.487 viviendas; Los Molinos), qué es (tres pantallas, dos lecturas), cómo funciona (fuentes por API, proceso, limpieza, modelo y prueba con el pasado, ranking, algoritmo de ubicaciones, vivienda nueva), diferencia, publicación y cierre. Guion en las notas de cada diapositiva. Las capturas se sacan con Chrome sin ventana sobre el servidor de desarrollo; para la de técnicos, `?sesion=<cod>` abre la sesión de demostración (solo en desarrollo).
- **18 oct, guion coherente con el ranking real (Claudia: "con bebé y trabajo en Madrid no salen primero esos"):** con esa situación arriba salen Leganés, Alcorcón y Madrid (87 %), no Getafe ni Navalcarnero. La escena de Laura ahora lo cuenta tal cual: ve las ciudades grandes, "yo no quiero una ciudad", filtra **20.000-50.000 hab.** y salen San Fernando de Henares (83 %), Torrelodones y Navalcarnero (3.º, 55 %). Compara San Fernando (Metro 7, abono B1, 15 autobuses directos, 200 viviendas previstas) con Navalcarnero (sin tren, B3, 9 autobuses, 21.434 viviendas previstas). Quitada la frase "más barato de vivienda seguro": no sale de nuestros datos. Getafe se queda para la parte de Los Molinos. Actualizados `docs/GUION_PRESENTACION.md` y la diapositiva "laura-ficha". **Ojo:** los rankings cambian si se toca la puntuación: repasar antes de ensayar.
- **18 oct, iconos del círculo en Barrios (Claudia: "no me deja pinchar encima de esos iconos"):** los iconos de servicios que salen dentro del círculo son marcadores HTML y solo tenían texto al pasar el ratón; ahora, al pulsarlos, abren su ventanita (nombre, tipo, minutos a pie, estado y detalle) sin mover el mapa ni cambiar el sitio elegido (`onClickMarcador` en `Mapa.tsx`).
- **18 oct, "Ver dónde podrían ir los nuevos centros" para el público (Claudia):** el enlace de la ficha del municipio ya no lleva a la zona de técnicos ni pide acceso: abre una **vista de solo lectura del plano** (`PlanoPublico.tsx`, ventana sobre la ficha) con el mismo cálculo del técnico y los supuestos por defecto, para 2035: frase resumen, lista de ubicaciones (barrio o parada cercana, superficie y a cuánta gente atendería), mapa con centros existentes, ubicaciones propuestas y suelo vacante, y selector de los 5 servicios. Sin deslizadores, sin añadir ni quitar, con aviso de que es una estimación orientativa. Cierra con Escape o la X. Probado en Navalcarnero sin sesión de técnico: 6 colegios nuevos, 3 ya hoy.
- **18 oct, residencias en el plano (Claudia: "al pulsar residencia de mayores pone esto"):** las residencias se calculan para todo el municipio (`escala: "municipio"`, minutos a pie = 180), así que el círculo de cobertura medía 14 km y cubría media Comunidad. Ahora **no se dibuja el círculo** en ese servicio, ni en la vista pública ni en Planificar. En la vista pública además: el mapa se encuadra en los puntos y parcelas del municipio (antes salía demasiado alejado), "atendería a unas 39 plazas" (concordancia) y la frase resumen se redacta bien ("haría falta 1 nuevo (centro de día para mayores), y haría falta ya hoy").
- **18 oct, nombre de la ficha al descargarla (Claudia):** al guardar en PDF el navegador propone el título de la página como nombre de archivo; ahora, mientras se imprime, el título es "FichaSanFernandoDeHenares" (sin acentos, cada palabra con mayúscula) y después se restaura. Fichas de barrio: "FichaLosMolinos" o, si se eligió un punto cualquiera, "Ficha<Municipio>PuntoElegido". Helper `imprimirConNombre` en `ui.tsx`.
- **18 oct, licitaciones (pregunta de Lucía por WhatsApp):** **no están integradas**. La web sigue diciendo "Licitaciones y obras: sin datos todavía" y los estados licitada/adjudicada/obras están desactivados (paso 9 sin hacer). Lucía dice que lo tenía hecho en su portátil personal y no le dio tiempo a hacer push; en GitHub no hay nada suyo. Aclaración pendiente: "licitaciones del terreno" (si habla de la venta o concesión de suelo público, ya está en la web como "suelo público en venta", del Portal del Suelo) o licitaciones de obra de colegios y centros (PLACSP y BOCM). Plan: que suba su trabajo a una **rama aparte** (`licitaciones`), sin tocar `main`; se decide si entra o no antes de congelar el código (19 oct al mediodía). Si no llega a tiempo, se deja como "siguiente paso" en la presentación.

### 18 oct: modelo de población mejorado (Claudia: "mejora el modelo que predice, error más pequeño")
- **Diagnóstico:** el factor de habitantes por vivienda salía de solo 4 barrios de Getafe (1,49-2,18; error medio del 19 % pero con una prueba muy benévola: dejando fuera un barrio, no un municipio) y se aplicaba igual a todos los municipios. Los barrios de Getafe son de vivienda protegida y hogares pequeños, así que fuera de Getafe **se subestimaba** la población.
- **Datos:** 28 barrios nuevos ya habitados de 17 municipios (ámbitos de más de 500 viviendas, menos del 20 % de suelo residencial vacante y una sección censal entera dentro; INE 2023 + IDEM) en lugar de 4.
- **Modelo (`etl/modelo_poblacion.py`):** habitantes por vivienda completa = población real / (viviendas × grado de ocupación del suelo residencial según el catastro); se explica con el tamaño mediano del hogar (INE) y el % de menores de 15 años del municipio, con regresión ridge sobre el logaritmo. Cada municipio recibe su propio factor y su rango, que es el percentil 10-90 del cociente real/previsto de la prueba (no un mínimo y máximo cualquiera).
- **Prueba con el pasado, la más exigente (se deja fuera el municipio entero):** error medio **13,1 %** (mediana 10,4 %) frente al **25,1 %** de la regla habitual (viviendas × tamaño del hogar); el rango acierta en el 79 % de los barrios. Antes: 19 % frente a 39 % con 4 barrios. **La cifra "39 %" era optimista para la regla habitual: la honesta es 25 %.** Los Molinos pasa de +6,4 % a +0,8 %, Buenavista de +38,5 % a +21,8 %.
- **Variables probadas y descartadas** (no mejoraban de forma fiable con 28 barrios): renta, densidad, población, distancia a Madrid, natalidad, vivienda protegida, tipología (unifamiliar), densidad bruta, hogares unipersonales y edad media. Con las dos elegidas el error medio baja de 20 % (media de barrios) a 13 %; más variables solo ajustarían ruido. Techo realista con estos datos: unos 12-13 %.
- **Efecto en las cifras:** personas que pueden llegar **1,08-1,53 millones** (antes 0,76-1,12); plazas de colegio **88-214 mil** (antes 78-154); centros de salud equivalentes **43-61** (antes 31-45). Navalcarnero: 2,6 habitantes por vivienda (antes 2,0). Actualizados: portada, ficha del municipio, Planificar (panel "¿Son fiables estas cifras?" con los 28 barrios), paquete de datos (campo `hab_por_vivienda`), guion y presentación.
- **Pasos nuevos:** `python etl/modelo_poblacion.py` y `python etl/lote_demanda.py` (en el README).

### 18 oct (tarde): cifras de "lo que viene" corregidas y retoques
- **Error importante corregido:** "viviendas previstas" del planeamiento incluye barrios ya construidos (Los Molinos, El Bercial…). De 513.487 previstas, el catastro da por construidas el 57 %: **quedan 222.705 por construir**. Getafe: 25.388 previstas, **3.095 pendientes**. Nuevo campo `viviendas_pendientes` (viviendas de cada ámbito × % de suelo residencial vacante; sin dato, se cuenta entero). La ficha, la portada, el radar, la lista "donde más se va a construir" (ahora Navalcarnero, Parla, Móstoles, Torrejón de Velasco, Valdemoro) y el criterio "Vivienda nueva por construir" usan los pendientes. **Cifras nuevas de la portada:** 222.705 viviendas aún sin construir (de 513.487), **0,47-0,67 millones de personas**, 38-93 mil plazas de colegio, 19-27 centros de salud equivalentes. Getafe: entre 5.076 y 7.221 personas más (antes decía 41.000-59.000, mal).
- **Tabla de la prueba del modelo (Planificar):** explica "Nuestro error" y "Regla habitual", reparto del error (22 de 28 barrios por debajo del 20 %; solo La Garena Sur, en Alcalá, pasa del 30 %: +43 %) y que mejoramos la regla habitual en 17 de 28 barrios.
- **Barra del mapa de Planificar rehecha:** "Prueba tu idea: ¿y si lo pones en otro sitio, o te quedas con menos?" con Solo mirar / Poner un centro / Quitar un centro y una frase fija que explica qué hace cada modo. Capas "Dónde está la demanda" y "Paradas de transporte" activadas por defecto.
- **Plano público de residencias** (vista de solo lectura): ya no dice "7 nuevas", sino plazas que faltan frente a la media de la Comunidad. **Comparación de municipios:** quitada la fila "Zonas verdes (m²/hab.)" porque mezclaba fuentes (Getafe 167 m² era suelo reservado en el planeamiento).
- **Datos de la historia del pitch (verificados en la web):** situaciones bebé + escolar + mayores → Tres Cantos 80 %, Alcalá 79 %, Getafe 79 %; añadiendo "Trabajo en Madrid" → Getafe y Tres Cantos 82 %, Alcalá 81 %. Getafe: colegios nuevos según tiempo a pie: 5 min → 8, 10 → 5, 15 → 3, 25 → 1; centro de salud: 10 min → 3, 15 min → ninguno. Centro de Getafe: 5 de 6 cosas a 10 min; Los Molinos 2 de 6; El Rosón (en construcción, 2.752 viviendas) 5 de 6. Plano público de Getafe: 3 colegios nuevos (2 ya hoy: Los Molinos y Buenavista) y 4 centros de día ya hoy; escuela infantil y centro de salud no necesitan nuevos.
- **Bases (4.2 de la fase de desarrollo):** 10 minutos de exposición y preguntas aparte; hay que presentar el resultado de la idea de la fase anterior; el nivel de desarrollo y lo completo del producto puntúa; los equipos deben dar al jurado acceso a datasets y prototipos para consultarlos durante la evaluación y deliberación → diapositiva final con los dos enlaces.
- **Solo desarrollo:** enlaces de ayuda para capturas (`cmp=`, `plano=1`, `serv=`, `min=`, `sesion=`).
- **18 oct (tarde), guion de la historia rehecho:** `docs/GUION_PRESENTACION.md` con una historia de 4:30 (Laura: hija de 5 años, otro bebé en camino y padres que quieren centro de día; compara Getafe, Alcalá y Tres Cantos; elige Getafe; ve barrios y lo que viene; Carmen, técnica del Ayuntamiento de Getafe, decide con "¿y si…?": tiempo a pie, quitar un centro y residencias) y la venta de 4:30 a 10:00 con el acceso del jurado (bases 4.2). Pendiente: **actualizar las diapositivas** (la de "El problema" tiene cifras antiguas; el guion usa 222.000 viviendas sin construir, 0,5-0,7 millones de personas, 38.000-93.000 plazas de colegio y 19-27 centros de salud). Claudia ha pedido NO tocar la presentación por ahora.
- **Popup de demanda (Planificar):** ahora enseña la cuenta: habitantes de la sección, los del grupo de edad que usa el servicio, × tasa de uso = usuarios.
- **18 oct (tarde), reparto del guion:** Claudia y Claude se ocupan solo del **speech del principio** (la historia, `docs/GUION_HISTORIA.md`, 0:00-4:30); **el resto de la presentación (diapositivas, venta, preguntas) lo lleva Lucía**. `GUION_PRESENTACION.md` vuelve a su versión anterior, con un aviso de que las escenas 1 y 2 las sustituye la historia nueva. Al final de `GUION_HISTORIA.md` hay una lista de las cifras que han cambiado (222.000 viviendas sin construir, 0,5-0,7 millones de personas, 38.000-93.000 plazas de colegio, 19-27 centros de salud, error del 13 % frente al 25 %) para que Lucía las actualice en sus diapositivas.
- **18 oct (tarde), frases del guion de la historia que no se entendían (Claudia):** reescritas sin chistes que haya que descifrar. Error de contenido corregido: **hogar o club de mayores** (dominó, para estar con gente) **no es lo mismo que centro de día** (cuidados y terapias durante el día); Pilar quiere el hogar y Paco, el centro de día; añadido un glosario (hogar / centro de día / residencia). Quitado "dos a uno", "mi cuenta corriente" y "mi cuñado lo ha apuntado". La demanda de cada zona se explica en llano (zona de unos 2.000 vecinos; el 85 % de los niños de 3 a 11 años va a colegio público o concertado). Las residencias de Getafe: **faltan unas 776 plazas** (titular de Planificar → Residencia de mayores). En Planificar, si se han movido o quitado centros, el calendario avisa de que es el de la propuesta automática.

- **Speech.docx (18/10/2026):** aplicadas solo las seis frases aclaradas (cuñado/renta, "Elegimos Getafe", hogar de mayores vs centro de día, El Rosón sin predecir precios, explicación de la demanda, residencias 2,2 vs 4,3 y 776 plazas). Copia del original en `docs/Speech_original.docx`.
- **Escala y datos en la historia (18/10/2026):** añadidos al final de "Getafe, lo que viene" un municipio abierto al azar (179 municipios, cálculo automático) y la pestaña Datos abiertos, para que se vea que la web es completa y los datos elaborados están publicados. En `GUION_HISTORIA.md` y `Speech.docx`.
- **Speech de la presentación (18/10/2026):** `docs/Speech_presentacion.docx`, mismo formato que el Speech original, cubre 5:00–10:00 siguiendo las diapositivas 1 a 6 del PDF final (problema, qué es, fuentes, cálculo, limitaciones, cierre). Usa las cifras actuales de la web. **Pendiente para Lucía:** la diapositiva 1 lleva cifras antiguas (1,08–1,53 M personas, 88–214 mil plazas, 43–61 centros de salud); deben ser 0,5–0,7 M, 38.000–93.000 y 19–27, con 222.000 viviendas sin construir. El aviso va al final del Word.
- **Speech completo (18/10/2026):** `docs/Speech_completo.docx` = historia de Laura y Carmen tal cual (Speech.docx) + parte nueva donde salen del personaje (5:00): "Bienvenidos a Cuna y Canas… somos Lucía y Claudia Agromayor…". En la parte nueva hablan Lucía y Claudia (asignación supuesta, cambiable); `Speech_presentacion.docx` es solo esa parte nueva.
- **Apertura (18/10/2026):** la bienvenida de 15 s se sustituye por una sola frase ("Bienvenidos a Cuna y Canas: los datos abiertos de Madrid, de la cuna a las canas, contados con una historia.") y enseguida el dibujo de Martina. Cambiado en `GUION_HISTORIA.md`, `Speech.docx` y `Speech_completo.docx`.
- **Barrios (18/10/2026):** (1) los iconos del mapa se apilaban y "se extendían" al repintarse porque se borraba la clase `maplibregl-marker`; ahora se conserva. (2) El panel "Lo que hará falta cuando esté completo" dice ahora **dónde podría ir** cada centro nuevo (mismo cálculo del plano público, limitado al barrio), con enlace al mapa y marcadores con borde amarillo; si no hace falta ninguno, lo dice y por qué (los existentes a menos de X min lo cubren). Desplegado en Oracle.
- **Segunda parte en lenguaje sencillo (18/10/2026):** `Speech_completo.docx` (y `Speech_presentacion.docx`) con la parte de la presentación reescrita para que se diga fácil, con comparaciones (barrio = clase que se llena, "examen sorpresa" del modelo) y frases cortas. La historia del principio no se toca; ya sin la bienvenida antigua de 15 s.
- **Barrios (18/10/2026), rectificación:** se quita el texto "Dónde podría ir" por servicio (quedaba largo y feo); en su lugar, un solo enlace "Ver dónde podrían ir los nuevos centros" al final del cuadro "Lo que hará falta", que abre el plano público (el mismo de ¿Dónde vivir?). Sin marcadores ni leyenda extra. Se mantiene el arreglo de los iconos apilados.
- **Barrios (18/10/2026):** cada servicio de la lista de resultados (Escuela infantil pública, Colegio...) es ahora un título con pestañita para abrir y cerrar; por defecto cerrados, con un resumen corto a la derecha ("1 · a 5 min"). Así la lista no es larguísima.
- **Lo que viene en la historia (18/10/2026):** se quitan del speech el plano de solo lectura (colegio, centro de día, escuela infantil), "cualquier otro municipio" y la pestaña Datos abiertos: un cliente no ve esos datos de entrada. Queda: cifra de Getafe (25.388 / 3.095 / 5.000-7.000) → ficha PDF → "alguien tendrá que decidir dónde se ponen". Hecho en `Speech.docx` y `GUION_HISTORIA.md`; `Speech_completo_facil.docx` lleva la historia nueva + la segunda parte sencilla (Speech_completo.docx estaba abierto en Word).
- **Barrios → ficha del municipio (18/10/2026):** arriba del panel de Barrios hay un enlace "Ficha de Getafe: todos sus datos y PDF →" que abre la ficha completa de ¿Dónde vivir? (lo que hay, lo que viene, Ficha PDF), para no perder esa información al pasar a Barrios.
- **Parte técnica en profundidad (18/10/2026):** `docs/Speech_tecnico_detallado.docx` para Claudia (diapositiva 4): versión corta de 75 s con sus siete pasos, versión larga en 7 bloques (datos y por qué, limpieza, modelo y cómo se entrena, si es bueno, demanda, algoritmo, ranking) y chuleta de preguntas del jurado, con las cifras reales del proyecto. No sustituye el texto de Speech_completo: son capas para elegir según el tiempo. Nota: se borraron Speech_original y Speech_presentacion (el usuario).
- **Speech final (18/10/2026):** quedan solo `docs/Speech_completo.docx` (historia + presentación 5:00-10:00, 730 palabras habladas en la 2.ª parte, hablantes Lucía/Claudia coherentes con las diapositivas) y `docs/Speech_tecnico_detallado.docx`. Cierre nuevo con acceso del jurado a prototipo y datos (bases 4.2). **Pendiente en diapositivas:** la 1 dice "222.705+ viviendas previstas de 143 municipios" (son las aún sin construir, de 513.487 previstas), y la 6 necesita los dos enlaces/QR. Borrados Speech.docx y Speech_completo_facil.docx (en git).
- **Comparación (18/10/2026):** en la tabla de comparación, el nombre de cada municipio es un enlace que abre su ficha (con "Ver comparación" abajo para volver).
- **Círculos de demanda (18/10/2026):** los círculos grises son secciones censales del INE (el INE las diseña de 1.000 a 2.500 habitantes; en Getafe: 122, media 1.557, mediana 1.358, P10-P90 866-2.560). Los rojos son los vecinos que vendrán, sobre solares residenciales vacíos (mediana 14 personas). El tamaño del círculo es proporcional a la raíz de los usuarios del servicio, no de los vecinos. La frase del guion pasa de "unos 2.000 vecinos" a "una zona del INE de unos 1.500 vecinos".
