/**
 * Localización de nuevos centros: cobertura máxima con límite de capacidad, por un método voraz.
 *
 * 1. Demanda: cada punto (sección censal hoy, o suelo residencial vacante en el futuro) aporta
 *    personas del grupo de edad del servicio × tasa de uso. La demanda futura se escala con el escenario.
 * 2. Oferta existente: cada centro existente cubre, hasta su capacidad, la demanda que tiene a menos de
 *    X minutos andando, empezando por la más cercana.
 * 3. Nuevos centros: en cada paso se elige la parcela candidata que más demanda sin cubrir capta dentro
 *    de su radio (sin pasar de la capacidad). Se repite hasta colocar N centros.
 * Distancias en línea recta (no por calles): 1 minuto andando ≈ 80 m. Es una aproximación y se dice.
 */
import type { Feature, FeatureCollection, Point, Polygon, MultiPolygon } from 'geojson'
import type { Parcela, PuntoDemanda, Servicio } from './tipos'

export const METROS_POR_MINUTO = 80
/** Un centro nuevo que no llegaría a esta ocupación no se propone: esa demanda está dispersa y se atiende de otra forma. */
export const OCUPACION_MINIMA = 0.3

export interface Escenario {
  habPorVivienda: number      // habitantes por vivienda prevista (escala la demanda futura)
  habPorViviendaCentral: number
  llenado: number             // 0-1: qué parte de la población futura ha llegado ya
  tasaUso: number
  capacidad: number
  minutos: number
  supMinima: number
  nCentros: number | 'auto'
  contarExistentes: boolean
  fijados: Fijado[]           // parcelas o puntos que el técnico obliga a usar
  excluidas: string[]         // parcelas que el técnico descarta
}

export interface Fijado { id: string; lon: number; lat: number; etiqueta: string }

export interface Existente { id: string; nombre: string; lon: number; lat: number; capacidad: number; capacidadReal: boolean; detalle: string }

export interface Propuesta {
  orden: number
  id: string
  lon: number
  lat: number
  ref_catastral: string | null
  area_m2: number | null
  ambito: string | null
  fijado: boolean
  captada: number            // demanda (usuarios del servicio) que pasa a estar cubierta
  personasEnRadio: number    // personas del grupo de edad a menos de X minutos
  ocupacionPct: number       // captada / capacidad
  paradaMasCercana: { nombre: string; modo: string; metros: number } | null
  alternativas: { ref: string; ambito: string | null; captada: number; motivo: string }[]
}

export interface Resultado {
  demandaTotal: number
  demandaActual: number
  demandaFutura: number
  cubiertaExistentes: number
  cubiertaNuevos: number
  sinCubrir: number
  centrosNecesarios: number
  propuestas: Propuesta[]
  existentes: Existente[]
  candidatas: number
  radioM: number
  sinCubrirPorAmbito: { ambito: string; demanda: number }[]
  dispersa: boolean          // queda demanda sin cubrir pero ninguna parcela llenaría un centro hasta la ocupación mínima
}

const R = 6371008.8
export function metros(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const x = ((lon2 - lon1) * Math.PI / 180) * Math.cos(((lat1 + lat2) / 2) * Math.PI / 180)
  const y = (lat2 - lat1) * Math.PI / 180
  return Math.sqrt(x * x + y * y) * R
}

export function pesoDemanda(p: PuntoDemanda, s: Servicio, e: Escenario): number {
  const grupo = s.grupo.reduce((t, g) => t + ((p as unknown as Record<string, number>)[g] ?? 0), 0)
  const escala = p.tipo === 'futuro' ? (e.habPorVivienda / e.habPorViviendaCentral) * e.llenado : 1
  return grupo * escala * e.tasaUso
}

export function existentesDe(s: Servicio, capas: Record<string, FeatureCollection<Point>>, capacidadPorDefecto: number): Existente[] {
  const x = s.existentes
  const fc = capas[x.capa]
  if (!fc) return []
  return fc.features.filter((f) => {
    const p = f.properties as Record<string, string | number | null>
    if (!x.valores.includes(String(p[x.campo]))) return false
    if (x.titularidad && !x.titularidad.includes(String(p.titularidad))) return false
    if (x.sector_contiene && !String(p.sector ?? '').toLowerCase().includes(x.sector_contiene)) return false
    if (x.excluir_subtipo && x.excluir_subtipo.includes(String(p.subtipo))) return false
    return true
  }).map((f, i) => {
    const p = f.properties as Record<string, string | number | null>
    const real = x.campo_capacidad ? Number(p[x.campo_capacidad]) : NaN
    const capReal = Number.isFinite(real) && real > 0
    return {
      // el registro sanitario no trae nombre: se identifica por su tipo y su calle
      id: String(p.codigo ?? p.registro ?? i), nombre: p.nombre ? String(p.nombre) : `${p.tipo ?? 'Centro'}${p.direccion ? ` (${String(p.direccion).trim()})` : ''}`,
      lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1],
      capacidad: capReal ? real : capacidadPorDefecto, capacidadReal: capReal,
      detalle: [p.tipo_largo ?? p.subtipo ?? p.tipo, p.titularidad ?? p.naturaleza].filter(Boolean).join(' · '),
    }
  })
}

interface Vecino { i: number; d: number }

export function calcular(
  s: Servicio, e: Escenario,
  demanda: Feature<Point, PuntoDemanda>[],
  parcelas: Feature<Polygon | MultiPolygon, Parcela>[],
  existentes: Existente[],
  paradas: Feature<Point>[],
): Resultado {
  const radio = e.minutos * METROS_POR_MINUTO
  const pts = demanda.map((f) => ({ lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], p: f.properties, w: pesoDemanda(f.properties, s, e) }))
  const sinCubrir = pts.map((p) => p.w)
  const vecinos = (lon: number, lat: number): Vecino[] =>
    pts.map((p, i) => ({ i, d: metros(lon, lat, p.lon, p.lat) })).filter((v) => v.d <= radio).sort((a, b) => a.d - b.d)

  // 2. la oferta existente absorbe primero la demanda cercana
  let cubiertaExistentes = 0
  if (e.contarExistentes) {
    const pares: { c: number; i: number; d: number }[] = []
    existentes.forEach((c, ci) => vecinos(c.lon, c.lat).forEach((v) => pares.push({ c: ci, i: v.i, d: v.d })))
    pares.sort((a, b) => a.d - b.d)
    const libre = existentes.map((c) => c.capacidad)
    for (const { c, i } of pares) {
      const q = Math.min(libre[c], sinCubrir[i])
      if (q <= 0) continue
      libre[c] -= q; sinCubrir[i] -= q; cubiertaExistentes += q
    }
  }

  // 3. candidatas: parcelas vacantes de equipamiento con superficie suficiente, más los puntos fijados a mano
  type Cand = { id: string; lon: number; lat: number; ref: string | null; area: number | null; ambito: string | null; fijado: boolean; etiqueta?: string; vec: Vecino[] }
  const excl = new Set(e.excluidas)
  const fijadosIds = new Set(e.fijados.map((f) => f.id))
  const cands: Cand[] = parcelas
    .filter((f) => f.properties.area_m2 >= e.supMinima && !excl.has(f.properties.ref_catastral) && !fijadosIds.has(f.properties.ref_catastral))
    .map((f) => ({ id: f.properties.ref_catastral, lon: f.properties.lon, lat: f.properties.lat, ref: f.properties.ref_catastral,
      area: f.properties.area_m2, ambito: f.properties.ambito, fijado: false, vec: vecinos(f.properties.lon, f.properties.lat) }))
  const fijados: Cand[] = e.fijados.map((f) => {
    const par = parcelas.find((p) => p.properties.ref_catastral === f.id)
    return { id: f.id, lon: f.lon, lat: f.lat, ref: par ? f.id : null, area: par?.properties.area_m2 ?? null, ambito: par?.properties.ambito ?? null,
      fijado: true, etiqueta: f.etiqueta, vec: vecinos(f.lon, f.lat) }
  })

  const demandaSinCubrirTrasExistentes = sinCubrir.reduce((a, b) => a + b, 0)
  const necesarios = Math.ceil(Math.max(0, demandaSinCubrirTrasExistentes - 1e-9) / e.capacidad)
  const n = e.nCentros === 'auto' ? Math.max(necesarios, fijados.length) : Math.max(e.nCentros, fijados.length)

  const ganancia = (c: Cand) => Math.min(e.capacidad, c.vec.reduce((t, v) => t + sinCubrir[v.i], 0))
  const asignar = (c: Cand) => {
    let libre = e.capacidad, captada = 0
    for (const v of c.vec) {
      const q = Math.min(libre, sinCubrir[v.i])
      if (q <= 0) continue
      sinCubrir[v.i] -= q; libre -= q; captada += q
      if (libre <= 0) break
    }
    return captada
  }
  const personas = (c: Cand) => c.vec.reduce((t, v) => t + s.grupo.reduce((g, k) => g + ((pts[v.i].p as unknown as Record<string, number>)[k] ?? 0) * (pts[v.i].p.tipo === 'futuro' ? (e.habPorVivienda / e.habPorViviendaCentral) * e.llenado : 1), 0), 0)
  const parada = (lon: number, lat: number) => {
    let mejor: Propuesta['paradaMasCercana'] = null
    for (const f of paradas) {
      const d = metros(lon, lat, f.geometry.coordinates[0], f.geometry.coordinates[1])
      if (!mejor || d < mejor.metros) mejor = { nombre: String(f.properties?.nombre ?? ''), modo: String(f.properties?.modo ?? ''), metros: Math.round(d) }
    }
    return mejor
  }

  const propuestas: Propuesta[] = []
  const restantes = [...cands]
  const cola = [...fijados]
  let cubiertaNuevos = 0
  for (let k = 0; k < n; k++) {
    let elegido: Cand | undefined
    let alternativas: Propuesta['alternativas'] = []
    if (cola.length) {
      elegido = cola.shift()
    } else {
      const orden = restantes.map((c) => ({ c, g: ganancia(c) })).sort((a, b) => b.g - a.g || (b.c.area ?? 0) - (a.c.area ?? 0))
      if (!orden.length || orden[0].g < OCUPACION_MINIMA * e.capacidad) break // lo que queda está demasiado disperso
      elegido = orden[0].c
      alternativas = orden.slice(1, 4).map(({ c, g }) => ({
        ref: c.ref ?? c.id, ambito: c.ambito, captada: Math.round(g),
        motivo: g < orden[0].g ? `capta ${Math.round(orden[0].g - g)} usuarios menos` : 'misma captación, menos superficie',
      }))
      restantes.splice(restantes.indexOf(elegido), 1)
    }
    if (!elegido) break
    const captada = asignar(elegido)
    cubiertaNuevos += captada
    propuestas.push({
      orden: k + 1, id: elegido.id, lon: elegido.lon, lat: elegido.lat, ref_catastral: elegido.ref, area_m2: elegido.area,
      ambito: elegido.ambito ?? (elegido.etiqueta ?? null), fijado: elegido.fijado, captada: Math.round(captada),
      personasEnRadio: Math.round(personas(elegido)), ocupacionPct: Math.round((100 * captada) / e.capacidad),
      paradaMasCercana: parada(elegido.lon, elegido.lat), alternativas,
    })
  }

  const total = pts.reduce((t, p) => t + p.w, 0)
  const porAmbito = new Map<string, number>()
  pts.forEach((p, i) => { if (sinCubrir[i] > 0.5) porAmbito.set(p.p.ambito ?? 'Fuera de ámbitos', (porAmbito.get(p.p.ambito ?? 'Fuera de ámbitos') ?? 0) + sinCubrir[i]) })
  return {
    demandaTotal: Math.round(total),
    demandaActual: Math.round(pts.filter((p) => p.p.tipo === 'actual').reduce((t, p) => t + p.w, 0)),
    demandaFutura: Math.round(pts.filter((p) => p.p.tipo === 'futuro').reduce((t, p) => t + p.w, 0)),
    cubiertaExistentes: Math.round(cubiertaExistentes),
    cubiertaNuevos: Math.round(cubiertaNuevos),
    sinCubrir: Math.round(sinCubrir.reduce((a, b) => a + b, 0)),
    centrosNecesarios: necesarios,
    propuestas, existentes,
    candidatas: cands.length + fijados.length,
    radioM: radio,
    dispersa: e.nCentros === 'auto' && propuestas.length < n && sinCubrir.reduce((a, b) => a + b, 0) > 0,
    sinCubrirPorAmbito: [...porAmbito].map(([ambito, d]) => ({ ambito, demanda: Math.round(d) })).sort((a, b) => b.demanda - a.demanda),
  }
}

/** Polígono circular aproximado (para pintar el radio andando en el mapa). */
export function circulo(lon: number, lat: number, radio: number, lados = 48): [number, number][] {
  const out: [number, number][] = []
  for (let k = 0; k <= lados; k++) {
    const a = (2 * Math.PI * k) / lados
    const dx = (radio * Math.cos(a)) / (R * Math.cos((lat * Math.PI) / 180))
    const dy = (radio * Math.sin(a)) / R
    out.push([lon + (dx * 180) / Math.PI, lat + (dy * 180) / Math.PI])
  }
  return out
}
