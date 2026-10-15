/**
 * Criterios del comparador "¿Dónde vivir?" y su puntuación.
 *
 * Cada criterio lee un indicador de municipios_resumen.json. La puntuación de un municipio es la media de sus
 * percentiles en los criterios elegidos (0 = el peor de los municipios que pasan los filtros, 100 = el mejor).
 *
 * Los criterios "por habitante" tienen un problema: en un pueblo de 300 habitantes una sola escuela da una ratio
 * altísima. Por eso combinan dos cosas:
 *   - suficiencia (60 %): la ratio por habitante, con tope en el percentil 75 (a partir de ahí "hay suficiente");
 *   - variedad (40 %): cuántos centros hay para elegir.
 */

export interface ResumenMunicipio {
  cod_ine: string
  nombre: string
  poblacion: number
  anio_poblacion: number
  crecimiento_pct: number | null
  periodo_crecimiento: string
  pob_0_4: number
  pob_5_14: number
  pob_65: number
  pct_menores15: number
  pct_mayores65: number
  nacidos: number | null
  anio_nacidos: number
  tasa_natalidad: number | null
  renta_per_capita: number | null
  paro_por_100: number | null
  esc_infantil_publica: number
  esc_infantil_privada: number
  colegio_publico: number
  colegio_concertado: number
  colegio_privado: number
  instituto_publico: number
  fp: number
  centros_salud: number
  consultorios: number
  atencion_primaria: number
  hospital_km: number
  farmacias: number
  farmacias_10mil: number
  bibliotecas: number
  residencias: number
  plazas_residencia: number
  plazas_residencia_100may: number | null
  centros_dia: number
  plazas_centro_dia: number
  plazas_dia_100may: number | null
  hogares_mayores: number
  centros_infancia_familia: number
  est_metro: number
  est_cercanias: number
  est_metro_ligero: number
  paradas_interurbano: number
  paradas_urbano: number
  lineas_interurbanas: number
  tren_o_metro: boolean
  viviendas_previstas: number | null
  viviendas_previstas_por_100hab: number | null
  ambitos_desarrollo: number
  zonas_verdes_m2: number | null
  zonas_verdes_m2_hab: number | null
  equip_deportivos: number
  equip_culturales: number
  planeamiento_en_idem: boolean
  sup_km2: number
  densidad: number
  dist_madrid_km: number
  foto: string | null        // imagen representativa en Wikimedia Commons (Wikidata P18)
  foto_pagina: string | null // página del fichero, con autoría y licencia
}

export interface Criterio {
  id: string
  grupo: string
  texto: string
  explica: string
  valor: (m: ResumenMunicipio) => number | null
  mayorEsMejor: boolean
  icono: string
  cantidad?: (m: ResumenMunicipio) => number // número absoluto de centros: aporta la "variedad"
  unidad: string
}

const porMil = (x: number, pob: number) => (pob > 0 ? (1000 * x) / pob : 0)

export const CRITERIOS: Criterio[] = [
  // Educación
  { id: 'ei_publica', grupo: 'Educación', icono: 'escuela_infantil', unidad: 'por 1.000 niños de 0-4', texto: 'Escuela infantil pública', explica: 'Escuelas infantiles y casas de niños públicas por cada 1.000 niños de 0 a 4 años', valor: (m) => porMil(m.esc_infantil_publica, m.pob_0_4), cantidad: (m) => m.esc_infantil_publica, mayorEsMejor: true },
  { id: 'ei_total', grupo: 'Educación', icono: 'escuela_infantil', unidad: 'por 1.000 niños de 0-4', texto: 'Escuela infantil (pública o privada)', explica: 'Todas las escuelas infantiles por cada 1.000 niños de 0 a 4 años', valor: (m) => porMil(m.esc_infantil_publica + m.esc_infantil_privada, m.pob_0_4), cantidad: (m) => m.esc_infantil_publica + m.esc_infantil_privada, mayorEsMejor: true },
  { id: 'col_publico', grupo: 'Educación', icono: 'colegio', unidad: 'por 1.000 niños de 5-14', texto: 'Colegio público', explica: 'Colegios públicos de infantil y primaria por cada 1.000 niños de 5 a 14 años', valor: (m) => porMil(m.colegio_publico, m.pob_5_14), cantidad: (m) => m.colegio_publico, mayorEsMejor: true },
  { id: 'col_concertado', grupo: 'Educación', icono: 'colegio', unidad: 'por 1.000 niños de 5-14', texto: 'Colegio concertado', explica: 'Colegios concertados por cada 1.000 niños de 5 a 14 años', valor: (m) => porMil(m.colegio_concertado, m.pob_5_14), cantidad: (m) => m.colegio_concertado, mayorEsMejor: true },
  { id: 'col_privado', grupo: 'Educación', icono: 'colegio', unidad: 'colegios', texto: 'Colegio privado', explica: 'Colegios privados (número)', valor: (m) => m.colegio_privado, mayorEsMejor: true },
  { id: 'instituto', grupo: 'Educación', icono: 'colegio', unidad: 'por 1.000 niños de 5-14', texto: 'Instituto público', explica: 'Institutos y centros públicos con secundaria por cada 1.000 niños de 5 a 14 años', valor: (m) => porMil(m.instituto_publico, m.pob_5_14), cantidad: (m) => m.instituto_publico, mayorEsMejor: true },
  { id: 'fp', grupo: 'Educación', icono: 'colegio', unidad: 'centros', texto: 'Formación Profesional', explica: 'Centros con Formación Profesional (número)', valor: (m) => m.fp, mayorEsMejor: true },
  // Salud
  { id: 'primaria', grupo: 'Salud', icono: 'centro_salud', unidad: 'por 10.000 hab.', texto: 'Centro de salud o consultorio', explica: 'Centros de salud y consultorios por cada 10.000 habitantes', valor: (m) => (m.poblacion ? (1e4 * m.atencion_primaria) / m.poblacion : 0), cantidad: (m) => m.atencion_primaria, mayorEsMejor: true },
  { id: 'hospital', grupo: 'Salud', icono: 'centro_salud', unidad: 'km', texto: 'Hospital cerca', explica: 'Distancia en línea recta al hospital general más cercano (km)', valor: (m) => m.hospital_km, mayorEsMejor: false },
  { id: 'farmacia', grupo: 'Salud', icono: 'centro_salud', unidad: 'por 10.000 hab.', texto: 'Farmacias', explica: 'Farmacias por cada 10.000 habitantes', valor: (m) => m.farmacias_10mil, cantidad: (m) => m.farmacias, mayorEsMejor: true },
  // Mayores
  { id: 'residencia', grupo: 'Mayores', icono: 'residencia', unidad: 'plazas por 100 mayores', texto: 'Plazas en residencias', explica: 'Plazas en residencias de mayores por cada 100 personas de 65 años o más', valor: (m) => m.plazas_residencia_100may, cantidad: (m) => m.residencias, mayorEsMejor: true },
  { id: 'centro_dia', grupo: 'Mayores', icono: 'centro_dia', unidad: 'plazas por 100 mayores', texto: 'Centro de día', explica: 'Plazas en centros de día por cada 100 personas de 65 años o más', valor: (m) => m.plazas_dia_100may, cantidad: (m) => m.centros_dia, mayorEsMejor: true },
  { id: 'hogar_mayores', grupo: 'Mayores', icono: 'centro_dia', unidad: 'hogares', texto: 'Hogar o club de mayores', explica: 'Hogares y clubes de mayores (número)', valor: (m) => m.hogares_mayores, mayorEsMejor: true },
  // Transporte
  { id: 'tren', grupo: 'Transporte', icono: 'autobus', unidad: 'estaciones', texto: 'Metro o Cercanías', explica: 'Estaciones de Metro, Metro Ligero y Cercanías en el municipio', valor: (m) => m.est_metro + m.est_cercanias + m.est_metro_ligero, mayorEsMejor: true },
  { id: 'autobus', grupo: 'Transporte', icono: 'autobus', unidad: 'líneas', texto: 'Muchas líneas de autobús', explica: 'Líneas de autobús interurbano distintas que paran en el municipio', valor: (m) => m.lineas_interurbanas, mayorEsMejor: true },
  { id: 'madrid', grupo: 'Transporte', icono: 'ubicacion', unidad: 'km', texto: 'Cerca de Madrid', explica: 'Distancia en línea recta a la Puerta del Sol (km)', valor: (m) => m.dist_madrid_km, mayorEsMejor: false },
  // Bienestar
  { id: 'verde', grupo: 'Bienestar', icono: 'suelo', unidad: 'm² por hab.', texto: 'Parques y zonas verdes', explica: 'Metros cuadrados de zonas verdes públicas del planeamiento por habitante', valor: (m) => m.zonas_verdes_m2_hab, cantidad: (m) => m.zonas_verdes_m2 ?? 0, mayorEsMejor: true },
  { id: 'deporte', grupo: 'Bienestar', icono: 'centro_dia', unidad: 'por 10.000 hab.', texto: 'Instalaciones deportivas', explica: 'Parcelas de equipamiento deportivo público por cada 10.000 habitantes', valor: (m) => (m.poblacion ? (1e4 * m.equip_deportivos) / m.poblacion : 0), cantidad: (m) => m.equip_deportivos, mayorEsMejor: true },
  { id: 'cultura', grupo: 'Bienestar', icono: 'colegio', unidad: 'por 10.000 hab.', texto: 'Cultura y bibliotecas', explica: 'Bibliotecas y equipamientos culturales por cada 10.000 habitantes', valor: (m) => (m.poblacion ? (1e4 * (m.bibliotecas + m.equip_culturales)) / m.poblacion : 0), cantidad: (m) => m.bibliotecas + m.equip_culturales, mayorEsMejor: true },
  { id: 'tranquilo', grupo: 'Bienestar', icono: 'suelo', unidad: 'hab./km²', texto: 'Tranquilidad (poca densidad)', explica: 'Habitantes por km²: cuanto menos, más tranquilo', valor: (m) => m.densidad, mayorEsMejor: false },
  // Futuro
  { id: 'joven', grupo: 'Futuro y empleo', icono: 'escuela_infantil', unidad: '% menores de 15', texto: 'Ambiente joven y familias', explica: 'Porcentaje de menores de 15 años', valor: (m) => m.pct_menores15, mayorEsMejor: true },
  { id: 'crece', grupo: 'Futuro y empleo', icono: 'validar', unidad: '% de crecimiento', texto: 'Municipio que crece', explica: 'Crecimiento de la población en los últimos años (%)', valor: (m) => m.crecimiento_pct, mayorEsMejor: true },
  { id: 'vivienda_nueva', grupo: 'Futuro y empleo', icono: 'suelo', unidad: 'viviendas por 100 hab.', texto: 'Vivienda nueva prevista', explica: 'Viviendas previstas en el planeamiento por cada 100 habitantes', valor: (m) => m.viviendas_previstas_por_100hab, mayorEsMejor: true },
  { id: 'empleo', grupo: 'Futuro y empleo', icono: 'validar', unidad: 'parados por 100 hab.', texto: 'Menos paro', explica: 'Personas en paro registrado por cada 100 habitantes', valor: (m) => m.paro_por_100, mayorEsMejor: false },
]

export const SITUACIONES: { id: string; texto: string; icono: string; criterios: string[] }[] = [
  { id: 'bebe', texto: 'Tengo un bebé o espero uno', icono: 'escuela_infantil', criterios: ['ei_publica', 'primaria', 'hospital', 'farmacia', 'verde'] },
  { id: 'escolar', texto: 'Tengo hijos en edad escolar', icono: 'colegio', criterios: ['col_publico', 'instituto', 'deporte', 'cultura', 'joven'] },
  { id: 'mayores', texto: 'Cuido de mis mayores', icono: 'residencia', criterios: ['residencia', 'centro_dia', 'primaria', 'hospital'] },
  { id: 'madrid', texto: 'Trabajo en Madrid', icono: 'autobus', criterios: ['tren', 'autobus', 'madrid'] },
  { id: 'tranquilo', texto: 'Busco tranquilidad', icono: 'suelo', criterios: ['tranquilo', 'verde'] },
  { id: 'vivienda', texto: 'Busco vivienda nueva', icono: 'suelo', criterios: ['vivienda_nueva', 'crece'] },
  { id: 'jubilado', texto: 'Soy mayor', icono: 'centro_dia', criterios: ['primaria', 'hospital', 'farmacia', 'hogar_mayores', 'centro_dia'] },
]

export const TAMANOS: { id: string; texto: string; min: number; max: number }[] = [
  { id: 'xs', texto: 'Menos de 5.000', min: 0, max: 5000 },
  { id: 's', texto: '5.000 – 20.000', min: 5000, max: 20000 },
  { id: 'm', texto: '20.000 – 50.000', min: 20000, max: 50000 },
  { id: 'l', texto: 'Más de 50.000', min: 50000, max: Infinity },
]

export interface Puntuado { m: ResumenMunicipio; puntos: number; detalle: Record<string, number> }

/** Percentil (0-100) de cada municipio en una lista de valores; los empates comparten percentil. */
function percentiles(vals: { cod: string; v: number }[], mayorEsMejor: boolean): Map<string, number> {
  const orden = [...vals].sort((a, b) => (mayorEsMejor ? a.v - b.v : b.v - a.v))
  const primero = new Map<number, number>(), ultimo = new Map<number, number>()
  orden.forEach((x, i) => { if (!primero.has(x.v)) primero.set(x.v, i); ultimo.set(x.v, i) })
  const n = orden.length
  return new Map(orden.map((x) => [x.cod, n > 1 ? (100 * (primero.get(x.v)! + ultimo.get(x.v)!) / 2) / (n - 1) : 100]))
}

function cuantil(xs: number[], q: number): number {
  const o = [...xs].sort((a, b) => a - b)
  return o.length ? o[Math.min(o.length - 1, Math.floor(q * (o.length - 1)))] : 0
}

/** Puntúa los municipios que pasan los filtros: media de percentiles en los criterios elegidos. */
export function puntuar(lista: ResumenMunicipio[], criterios: string[]): Puntuado[] {
  const cs = CRITERIOS.filter((c) => criterios.includes(c.id))
  const porCriterio: Record<string, Map<string, number>> = {}
  for (const c of cs) {
    let vals = lista.map((m) => ({ cod: m.cod_ine, v: c.valor(m) })).filter((x): x is { cod: string; v: number } => x.v != null && Number.isFinite(x.v))
    if (!c.cantidad) { porCriterio[c.id] = percentiles(vals, c.mayorEsMejor); continue }
    const tope = cuantil(vals.map((x) => x.v), 0.75)
    vals = vals.map((x) => ({ ...x, v: Math.min(x.v, tope) }))
    const suficiencia = percentiles(vals, true)
    const variedad = percentiles(lista.map((m) => ({ cod: m.cod_ine, v: c.cantidad!(m) })), true)
    porCriterio[c.id] = new Map(vals.map((x) => [x.cod, 0.6 * suficiencia.get(x.cod)! + 0.4 * (variedad.get(x.cod) ?? 0)]))
  }
  return lista.map((m) => {
    const detalle: Record<string, number> = {}
    for (const c of cs) { const p = porCriterio[c.id].get(m.cod_ine); if (p != null) detalle[c.id] = p }
    const vs = Object.values(detalle)
    return { m, puntos: vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : 0, detalle }
  }).sort((a, b) => b.puntos - a.puntos)
}

/** Formato del valor de un criterio para mostrarlo. */
export function formatoCriterio(c: Criterio, m: ResumenMunicipio): string {
  const v = c.valor(m)
  if (v == null || !Number.isFinite(v)) return 'sin datos'
  const d = Math.abs(v) < 10 ? 1 : 0
  return `${v.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: d })} ${c.unidad}`
}
