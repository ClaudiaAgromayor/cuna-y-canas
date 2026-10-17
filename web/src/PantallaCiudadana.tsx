import { useEffect, useMemo, useRef, useState } from 'react'
import type { Feature, FeatureCollection, Geometry, Point, Polygon, Position } from 'geojson'
import type maplibregl from 'maplibre-gl'
import Mapa, { fotoDelMapa, type CapaMapa, type Marcador } from './Mapa'
import FichaBarrio from './FichaBarrio'
import { circulo, metros, METROS_POR_MINUTO } from './algoritmo'
import type { AmbitoDemanda, DatosMunicipio, Servicio, ServicioId } from './tipos'
import { Icono, iconoSvg } from './iconos'
import { Aviso, capitalizar, dec, Estado, Linea, n, nombreBarrio, type EstadoId, Leyenda } from './ui'

interface Props { datos: DatosMunicipio; servicios: Record<ServicioId, Servicio>; barrioInicial?: string; catsIniciales?: string[] }

/* ---------- qué se puede buscar ---------- */

type Fuente = 'educativos' | 'sanitarios' | 'sociales' | 'farmacias' | 'redes' | 'suelo'
interface Categoria { id: string; grupo: string; texto: string; icono: string; fuente: Fuente; filtro: (p: Record<string, unknown>) => boolean; servicio?: ServicioId }

const P = (p: Record<string, unknown>, k: string) => String(p[k] ?? '')
const publico = (p: Record<string, unknown>) => P(p, 'titularidad').startsWith('PÚBLICO')
const CATEGORIAS: Categoria[] = [
  { id: 'ei_publica', grupo: 'Educación', texto: 'Escuela infantil pública', icono: 'escuela_infantil', fuente: 'educativos', servicio: 'escuela_infantil', filtro: (p) => ['EEI', 'EEI-CN'].includes(P(p, 'tipo')) },
  { id: 'ei_privada', grupo: 'Educación', texto: 'Escuela infantil privada', icono: 'escuela_infantil', fuente: 'educativos', filtro: (p) => ['EIPR', 'CPR INF'].includes(P(p, 'tipo')) },
  { id: 'col_publico', grupo: 'Educación', texto: 'Colegio público', icono: 'colegio', fuente: 'educativos', servicio: 'colegio', filtro: (p) => P(p, 'tipo').includes('PRI') && publico(p) },
  { id: 'col_concertado', grupo: 'Educación', texto: 'Colegio concertado', icono: 'colegio', fuente: 'educativos', filtro: (p) => P(p, 'tipo').includes('PRI') && P(p, 'titularidad') === 'PRIVADO CONCERTADO' },
  { id: 'col_privado', grupo: 'Educación', texto: 'Colegio privado', icono: 'colegio', fuente: 'educativos', filtro: (p) => P(p, 'tipo').includes('PRI') && P(p, 'titularidad') === 'PRIVADO' },
  { id: 'instituto', grupo: 'Educación', texto: 'Instituto', icono: 'colegio', fuente: 'educativos', filtro: (p) => ['IES', 'IESO'].includes(P(p, 'tipo')) || (P(p, 'tipo').includes('SEC') && !P(p, 'tipo').includes('PRI')) },
  { id: 'salud', grupo: 'Salud', texto: 'Centro de salud o consultorio', icono: 'centro_salud', fuente: 'sanitarios', servicio: 'centro_salud', filtro: (p) => ['Centro de salud', 'Consultorio de atención primaria'].includes(P(p, 'tipo')) },
  { id: 'hospital', grupo: 'Salud', texto: 'Hospital', icono: 'centro_salud', fuente: 'sanitarios', filtro: (p) => P(p, 'tipo').startsWith('Hospital') },
  { id: 'farmacia', grupo: 'Salud', texto: 'Farmacia', icono: 'centro_salud', fuente: 'farmacias', filtro: () => true },
  { id: 'centro_dia', grupo: 'Mayores', texto: 'Centro de día', icono: 'centro_dia', fuente: 'sociales', servicio: 'centro_dia', filtro: (p) => P(p, 'tipo') === 'CENTROS DE DÍA' && P(p, 'subtipo') !== 'HOGARES Y CLUBES' && P(p, 'sector').includes('mayores') },
  { id: 'residencia', grupo: 'Mayores', texto: 'Residencia', icono: 'residencia', fuente: 'sociales', servicio: 'residencia', filtro: (p) => P(p, 'tipo') === 'CENTROS RESIDENCIALES' && P(p, 'sector').includes('mayores') },
  { id: 'hogar', grupo: 'Mayores', texto: 'Hogar o club de mayores', icono: 'centro_dia', fuente: 'sociales', filtro: (p) => P(p, 'subtipo') === 'HOGARES Y CLUBES' },
  { id: 'parque', grupo: 'Ocio y bienestar', texto: 'Parques y zonas verdes', icono: 'suelo', fuente: 'redes', filtro: (p) => P(p, 'tipo') === 'zona_verde' && Number(p.sup_m2) >= 1000 },
  { id: 'deporte', grupo: 'Ocio y bienestar', texto: 'Instalaciones deportivas', icono: 'centro_dia', fuente: 'redes', filtro: (p) => P(p, 'tipo') === 'deportivo' },
  { id: 'cultura', grupo: 'Ocio y bienestar', texto: 'Equipamiento cultural', icono: 'colegio', fuente: 'redes', filtro: (p) => P(p, 'tipo') === 'cultural' },
  { id: 'suelo', grupo: 'Lo que viene', texto: 'Suelo reservado para nuevos servicios', icono: 'suelo', fuente: 'suelo', filtro: () => true },
]
const GRUPOS = [...new Set(CATEGORIAS.map((c) => c.grupo))]

const ESTADOS: { id: EstadoId; texto: string; disponible: boolean }[] = [
  { id: 'abierto', texto: 'Ya existe', disponible: true },
  { id: 'plan', texto: 'En el planeamiento', disponible: true },
  { id: 'prevista', texto: 'Prevista', disponible: true },
  { id: 'suelo', texto: 'Suelo disponible', disponible: true },
  { id: 'licitada', texto: 'Licitada', disponible: false },
  { id: 'obras', texto: 'En obras', disponible: false },
]
const FUENTE_URL: Record<Fuente, string> = {
  educativos: 'https://datos.comunidad.madrid/dataset/centros_educativos',
  sanitarios: 'https://datos.comunidad.madrid/dataset/centros_servicios_establecimientos_sanitarios',
  sociales: 'https://datos.comunidad.madrid/dataset/atencion_social_registro_centros',
  farmacias: 'https://datos.comunidad.madrid/dataset/oficinas_farmacia',
  redes: 'https://idem.comunidad.madrid',
  suelo: 'https://idem.comunidad.madrid',
}
const NOMBRE_FUENTE: Record<Fuente, string> = { educativos: 'Centros educativos', sanitarios: 'Registro sanitario', sociales: 'Registro de centros sociales', farmacias: 'Oficinas de farmacia', redes: 'Planeamiento (IDEM)', suelo: 'Suelo vacante 2026 (IDEM)' }
const ETIQUETA_ESTADO_BARRIO: Record<string, string> = { habitado: 'Habitado', en_desarrollo: 'En construcción', futuro: 'Por construir', sin_datos: 'Sin datos' }

/* ---------- utilidades ---------- */

function poligonos(g: Geometry | null): Position[][][] {
  if (!g) return []
  if (g.type === 'Polygon') return [g.coordinates]
  if (g.type === 'MultiPolygon') return g.coordinates
  if (g.type === 'GeometryCollection') return g.geometries.flatMap(poligonos)
  return []
}
function centroide(g: Geometry): [number, number] {
  if (g.type === 'Point') return g.coordinates as [number, number]
  const anillo = poligonos(g).sort((a, b) => b[0].length - a[0].length)[0]?.[0] ?? []
  return [anillo.reduce((t, x) => t + x[0], 0) / (anillo.length || 1), anillo.reduce((t, x) => t + x[1], 0) / (anillo.length || 1)]
}
const minutos = (m: number) => Math.max(1, Math.round(m / METROS_POR_MINUTO))

interface Lugar { lon: number; lat: number; texto: string; ambito: string | null }
interface Candidato { address: string; muni: string; lat: number; lng: number }
interface Item { id: string; cat: Categoria; nombre: string; detalle: string; estado: EstadoId; lon: number; lat: number; d: number }

/** Viviendas del ámbito: las del planeamiento o, si no constan, una estimación con rango a partir de la superficie y la edificabilidad. */
function textoViviendas(p: Record<string, unknown>) {
  const v = Number(p.viviendas), lo = Number(p.viviendas_est_min), hi = Number(p.viviendas_est_max)
  const viv = v ? `${n(v)} viviendas previstas` : lo ? `entre ${n(lo)} y ${n(hi)} viviendas (estimación)` : 'sin datos de viviendas'
  const extra = [p.uso, p.figura && `${p.figura}${p.promocion ? ` de promoción ${String(p.promocion).toLowerCase()}` : ''}`,
    Number(p.sup_m2) ? `${n(Number(p.sup_m2) / 10000)} ha` : null, Number(p.coef_edificabilidad) ? `edificabilidad ${String(p.coef_edificabilidad).replace('.', ',')} m²/m²` : null].filter(Boolean)
  return `${viv}${extra.length ? `<br>${extra.join(' · ')}` : ''}${lo && !v ? '<br><span style="font-size:11px">Estimado con la superficie × edificabilidad del planeamiento (IDEM) y 120-180 m² por vivienda unifamiliar u 80-110 colectiva</span>' : ''}`
}

export default function PantallaCiudadana({ datos, servicios, barrioInicial, catsIniciales }: Props) {
  const [lugar, setLugar] = useState<Lugar | null>(null)
  // Escape (o la X de la ventanita): quita el sitio elegido y cierra la ventanita, de una vez
  const quitarLugar = () => { document.querySelectorAll('.maplibregl-popup').forEach((x) => x.remove()); setLugar(null) }
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') quitarLugar() }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [])
  // de entrada nada marcado; si se llega desde "¿Dónde vivir?", solo lo que se buscaba allí
  const [cats, setCats] = useState<string[]>(catsIniciales ?? [])
  const [estados, setEstados] = useState<EstadoId[]>(['abierto', 'plan', 'prevista', 'suelo'])
  const [radioMin, setRadioMin] = useState(10)
  const [abiertos, setAbiertos] = useState<string[]>([])
  const [buscarCalle, setBuscarCalle] = useState(false)
  const [q, setQ] = useState('')
  const [cands, setCands] = useState<Candidato[]>([])
  const [msg, setMsg] = useState('')
  // últimas búsquedas: las 4 últimas opciones que la persona ha marcado (se recuerdan en este navegador)
  const [recientes, setRecientes] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('cyc_recientes') ?? '[]') } catch { return [] } })
  const mapaRef = useRef<maplibregl.Map | null>(null)
  const [sinConstruir, setSinConstruir] = useState<Map<string, { pct: number | null; m2: number }>>(new Map())
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}${datos.indice.carpeta}/resumen_ambitos.json`).then((r) => r.json())
      .then((d: { ambitos: { ambito: string; pct_equipamiento_vacante: number | null; equipamiento_vacante_m2: number }[] }) =>
        setSinConstruir(new Map(d.ambitos.map((a) => [a.ambito, { pct: a.pct_equipamiento_vacante, m2: a.equipamiento_vacante_m2 }]))))
      .catch(() => setSinConstruir(new Map()))
  }, [datos])
  const [imagenMapa, setImagenMapa] = useState('')
  const [foto, setFoto] = useState<{ url: string; pagina: string | null } | null>(null)
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}municipios_resumen.json`).then((r) => r.json())
      .then((d: { municipios: { cod_ine: string; foto: string | null; foto_pagina: string | null }[] }) => {
        const m = d.municipios.find((x) => x.cod_ine === datos.indice.cod_ine)
        if (m?.foto) setFoto({ url: m.foto, pagina: m.foto_pagina })
      }).catch(() => setFoto(null))
  }, [datos])
  const alternarCat = (id: string) => setCats((x) => {
    if (x.includes(id)) return x.filter((y) => y !== id)
    setRecientes((r) => {
      const nuevo = [id, ...r.filter((y) => y !== id)].slice(0, 4)
      try { localStorage.setItem('cyc_recientes', JSON.stringify(nuevo)) } catch { /* sin almacenamiento */ }
      return nuevo
    })
    return [...x, id]
  })
  // ficha en PDF: primero una foto del mapa tal como se ve, después el diálogo de imprimir
  const imprimirFicha = async () => {
    if (mapaRef.current) setImagenMapa(await fotoDelMapa(mapaRef.current))
    document.body.dataset.imprimir = 'barrio'
    const limpiar = () => { delete document.body.dataset.imprimir; window.removeEventListener('afterprint', limpiar) }
    window.addEventListener('afterprint', limpiar)
    setTimeout(() => window.print(), 150)
  }
  const refResultados = useRef<HTMLDivElement>(null)
  // al elegir un sitio, el panel baja solo hasta la respuesta (antes quedaba debajo de los filtros)
  useEffect(() => { if (lugar) setTimeout(() => refResultados.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60) }, [lugar])

  const demanda = useMemo(() => new Map((datos.demanda?.ambitos ?? []).map((a) => [a.ambito, a])), [datos])
  const barrios = useMemo(() => (datos.demanda?.ambitos ?? []).filter((a) => (a.viviendas ?? 0) >= 150).sort((a, b) => (b.viviendas ?? 0) - (a.viviendas ?? 0)), [datos])

  // todos los elementos que se pueden enseñar, calculados una sola vez por municipio
  const universo = useMemo(() => {
    const fc: Record<Fuente, Feature[]> = { educativos: datos.educativos.features, sanitarios: datos.sanitarios.features, sociales: datos.sociales.features,
      farmacias: datos.farmacias.features, redes: datos.redes.features, suelo: datos.parcelas.features }
    const out: Omit<Item, 'd'>[] = []
    for (const c of CATEGORIAS) {
      fc[c.fuente].forEach((f, i) => {
        const p = (f.properties ?? {}) as Record<string, unknown>
        if (!c.filtro(p)) return
        const [lon, lat] = centroide(f.geometry)
        let estado: EstadoId = 'abierto', nombre = p.nombre ? capitalizar(String(p.nombre)) : '', detalle = ''
        if (c.fuente === 'redes') {
          estado = p.estado === 'prevista' ? 'prevista' : p.estado === 'existente' ? 'abierto' : 'plan'
          nombre = c.id === 'parque' ? 'Zona verde' : c.id === 'deporte' ? 'Equipamiento deportivo' : 'Equipamiento cultural'
          detalle = `${n(Number(p.sup_m2))} m² · ${p.red ?? 'red pública'}`
        } else if (c.fuente === 'suelo') {
          estado = 'suelo'; nombre = 'Parcela para equipamiento público'
          detalle = `${n(Number(p.area_m2))} m², sin construir`
        } else {
          if (!nombre) nombre = `${p.tipo ?? c.texto}${p.direccion ? ` (${capitalizar(String(p.direccion))})` : ''}`
          detalle = [p.tipo_largo ?? p.subtipo ?? p.tipo, p.titularidad ?? p.naturaleza ?? p.dependencia].filter(Boolean)
            .map((x) => { const t = String(x).toLowerCase(); return t.charAt(0).toUpperCase() + t.slice(1) }).join(' · ')
          if (p.plazas) detalle += ` · ${n(Number(p.plazas))} plazas`
        }
        out.push({ id: `${c.id}-${p.codigo ?? p.registro ?? p.ref_catastral ?? i}-${i}`, cat: c, nombre, detalle, estado, lon, lat })
      })
    }
    return out
  }, [datos])

  const radio = radioMin * METROS_POR_MINUTO
  // sin nada marcado se enseña todo lo que hay; en cuanto se marca algo, solo eso
  const catsEf = useMemo(() => (cats.length ? cats : CATEGORIAS.map((c) => c.id)), [cats])
  const resultado = useMemo(() => {
    if (!lugar) return null
    const cerca: Item[] = universo.filter((x) => cats.includes(x.cat.id) && estados.includes(x.estado))
      .map((x) => ({ ...x, d: metros(lugar.lon, lugar.lat, x.lon, x.lat) })).filter((x) => x.d <= radio).sort((a, b) => a.d - b.d)
    const porCat = CATEGORIAS.filter((c) => catsEf.includes(c.id)).map((c) => {
      const items = cerca.filter((x) => x.cat.id === c.id)
      const masCercano = items.length ? null : universo.filter((x) => x.cat.id === c.id && x.estado === 'abierto')
        .map((x) => ({ ...x, d: metros(lugar.lon, lugar.lat, x.lon, x.lat) })).sort((a, b) => a.d - b.d)[0] ?? null
      return { c, items, masCercano }
    })
    const paradas = datos.paradas.features.map((f) => ({ f, d: metros(lugar.lon, lugar.lat, f.geometry.coordinates[0], f.geometry.coordinates[1]) }))
      .filter((x) => x.d <= 5 * METROS_POR_MINUTO).sort((a, b) => a.d - b.d).slice(0, 3)
    return { cerca, porCat, paradas, amb: lugar.ambito ? demanda.get(lugar.ambito) ?? null : null }
  }, [lugar, universo, catsEf, estados, radio, datos, demanda])

  // lo que hará falta en el barrio cuando esté completo (rangos del modelo)
  const previsiones = useMemo(() => {
    const a = resultado?.amb
    if (!a?.grupos_completo || a.estado === 'sin_datos') return []
    const ids = [...new Set(CATEGORIAS.filter((c) => catsEf.includes(c.id) && c.servicio).map((c) => c.servicio!))]
    return ids.map((sid) => {
      const s = servicios[sid]
      const g = s.grupo.map((k) => (k === 'pob' ? a.poblacion_completo : a.grupos_completo![k])).filter(Boolean) as [number, number, number][]
      const lo = Math.round(g.reduce((t, x) => t + x[0], 0) * s.tasa_uso[0]), hi = Math.round(g.reduce((t, x) => t + x[2], 0) * s.tasa_uso[2])
      const abiertos = (resultado?.cerca ?? []).filter((x) => x.cat.servicio === sid && x.estado === 'abierto').length
      return { s, lo, hi, abiertos }
    })
  }, [resultado, cats, servicios])

  /* ---------- acciones ---------- */
  const ambitoDe = (lon: number, lat: number) => {
    for (const f of datos.ambitos.features) for (const poly of poligonos(f.geometry)) {
      const a = poly[0]; let dentro = false
      for (let i = 0, j = a.length - 1; i < a.length; j = i++) {
        const [xi, yi] = a[i], [xj, yj] = a[j]
        if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dentro = !dentro
      }
      if (dentro) return String(f.properties?.nombre)
    }
    return null
  }
  const elegirPunto = (lon: number, lat: number, texto: string) => setLugar({ lon, lat, texto, ambito: ambitoDe(lon, lat) })
  const elegirBarrio = (a: AmbitoDemanda) => {
    const pts = datos.demandaPuntos.features.filter((p) => p.properties.ambito === a.ambito)
    const f = datos.ambitos.features.find((x) => x.properties?.nombre === a.ambito)
    const [lon, lat] = pts.length ? [pts.reduce((t, p) => t + p.geometry.coordinates[0], 0) / pts.length, pts.reduce((t, p) => t + p.geometry.coordinates[1], 0) / pts.length]
      : f ? centroide(f.geometry) : datos.indice.centro
    setLugar({ lon, lat, texto: nombreBarrio(a.ambito), ambito: a.ambito })
  }
  async function buscar() {
    if (!q.trim()) return
    setMsg(''); setCands([])
    try {
      const url = `https://www.cartociudad.es/geocoder/api/geocoder/candidates?limit=6&q=${encodeURIComponent(`${q}, ${datos.indice.nombre}`)}`
      const r: Candidato[] = await (await fetch(url)).json()
      const ok = r.filter((c) => c.muni?.toLowerCase() === datos.indice.nombre.toLowerCase() && c.lat && c.lng)
      if (ok.length === 1) elegirPunto(ok[0].lng, ok[0].lat, ok[0].address)
      else setCands(ok)
      if (!ok.length) setMsg(`No encontramos esa calle en ${datos.indice.nombre}.`)
    } catch { setMsg('El buscador no responde. Elige un barrio o pulsa en el mapa.') }
  }
  // ejemplos de un clic: llegar con un barrio ya elegido
  useEffect(() => {
    const a = barrioInicial ? demanda.get(barrioInicial) : undefined
    if (a) elegirBarrio(a)
  }, [barrioInicial]) // eslint-disable-line react-hooks/exhaustive-deps


  /* ---------- mapa ---------- */
  const capas: CapaMapa[] = useMemo(() => {
    const circ: FeatureCollection<Polygon> = { type: 'FeatureCollection', features: lugar ? [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [circulo(lugar.lon, lugar.lat, radio)] } }] : [] }
    const ambs: FeatureCollection = { ...datos.ambitos, features: datos.ambitos.features.map((f) => ({ ...f, properties: { ...f.properties,
      estado: demanda.get(String(f.properties?.nombre))?.estado ?? 'sin_datos', sel: f.properties?.nombre === lugar?.ambito,
      vacio: sinConstruir.get(String(f.properties?.nombre))?.pct ?? -1, vacioM2: sinConstruir.get(String(f.properties?.nombre))?.m2 ?? 0 } })) }
    const items: FeatureCollection<Point> = { type: 'FeatureCollection', features: (resultado?.cerca ?? []).map((x) => ({ type: 'Feature', properties: { nombre: x.nombre, cat: x.cat.texto, estado: x.estado, detalle: x.detalle }, geometry: { type: 'Point', coordinates: [x.lon, x.lat] } })) }
    return [
      // antes de elegir: cada barrio coloreado por el suelo para servicios que sigue sin construir; después, resaltado el elegido
      { id: 'b-ambitos', datos: ambs, estilo: { type: 'fill', paint: lugar
        ? { 'fill-color': ['match', ['get', 'estado'], 'futuro', '#de0029', 'en_desarrollo', '#131313', '#8a8a8a'], 'fill-opacity': ['case', ['get', 'sel'], 0.14, 0.05] }
        : { 'fill-color': ['case', ['<', ['get', 'vacio'], 0], '#e6e6e6', ['interpolate', ['linear'], ['get', 'vacio'], 0, '#f6e3e6', 40, '#e3808f', 80, '#b50f2b']], 'fill-opacity': 0.7 } } as CapaMapa['estilo'],
        popup: (p) => `<b>${nombreBarrio(String(p.nombre))}</b><br><span style="color:#595959">${ETIQUETA_ESTADO_BARRIO[String(p.estado)]} · ${textoViviendas(p)}${Number(p.vacio) >= 0 ? `<br>${n(Number(p.vacio))} % del suelo para servicios aún sin construir (${n(Number(p.vacioM2))} m²)` : ''}</span>` },
      { id: 'b-ambitos-borde', datos: ambs, estilo: { type: 'line', paint: { 'line-color': ['case', ['get', 'sel'], '#de0029', '#595959'], 'line-width': ['case', ['get', 'sel'], 2.5, 1], 'line-dasharray': [3, 2] } } as CapaMapa['estilo'] },
      { id: 'b-radio', datos: circ, estilo: { type: 'line', paint: { 'line-color': '#de0029', 'line-width': 1.5, 'line-dasharray': [2, 2] } } },
      { id: 'b-items', datos: items, estilo: { type: 'circle', paint: { 'circle-radius': 6, 'circle-color': ['match', ['get', 'estado'], 'abierto', '#131313', 'suelo', '#2b5c8a', 'prevista', '#de0029', '#8a8a8a'], 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' } } as CapaMapa['estilo'],
        popup: (p) => `<b>${p.nombre}</b><br>${p.cat}<br><span style="color:#595959">${p.detalle}</span>` },
    ]
  }, [datos, demanda, lugar, radio, resultado, sinConstruir])
  // cada resultado con el icono de su servicio, coloreado por su estado (idea 3 de Lucía)
  const COLOR_MARCA: Record<EstadoId, string> = { abierto: '#131313', plan: '#8a8a8a', prevista: '#de0029', suelo: '#2b5c8a', licitada: '#9a5b00', adjudicada: '#9a5b00', obras: '#de0029' }
  const marcadores: Marcador[] = useMemo(() => {
    if (!lugar) return []
    const iconos: Marcador[] = (resultado?.cerca ?? []).slice(0, 60).map((x) => ({ id: x.id, lon: x.lon, lat: x.lat, texto: '', color: COLOR_MARCA[x.estado], html: iconoSvg(x.cat.icono), clase: 'pequeno', titulo: `${x.nombre} · ${x.cat.texto}` }))
    return [...iconos, { id: 'yo', lon: lugar.lon, lat: lugar.lat, texto: '', color: '#de0029', html: iconoSvg('ubicacion'), titulo: lugar.texto }]
  }, [lugar, resultado]) // eslint-disable-line react-hooks/exhaustive-deps
  const centro = useMemo<[number, number] | null>(() => (lugar ? [lugar.lon, lugar.lat] : null), [lugar])
  const amb = resultado?.amb ?? null

  return (
    <div className="flex h-full min-h-0 flex-col md:grid md:grid-cols-[minmax(340px,480px)_1fr]">
      <div className="relative order-1 h-[42vh] shrink-0 md:order-2 md:h-auto">
        <Mapa bbox={datos.encuadre} capas={capas} marcadores={marcadores} centrarEn={centro} alCrear={(m) => { mapaRef.current = m }} alCerrarPopup={quitarLugar}
          onClickCapa={(capa, p, ll) => {
            if (capa === 'b-ambitos') { const a = demanda.get(String(p.nombre)); if (a) elegirBarrio(a); else elegirPunto(ll[0], ll[1], 'Punto elegido en el mapa') }
            else if (capa !== 'b-items') elegirPunto(ll[0], ll[1], 'Punto elegido en el mapa')
          }}
          onClickMapa={(lon, lat) => elegirPunto(lon, lat, 'Punto elegido en el mapa')} />
        <Leyenda>
          {lugar ? [['#131313', 'Ya existe'], ['#8a8a8a', 'En el planeamiento'], ['#de0029', 'Prevista'], ['#2b5c8a', 'Suelo disponible']].map(([c, t]) => (
            <div key={t} className="flex items-center gap-2 py-0.5"><span className="h-3 w-3 rounded-full" style={{ background: c }} />{t}</div>
          )) : (
            <div className="w-44">
              <div className="mb-1 font-medium">Suelo para servicios aún sin construir en cada barrio</div>
              <div className="flex h-2.5" style={{ background: 'linear-gradient(to right, #f6e3e6, #e3808f, #b50f2b)' }} />
              <div className="flex justify-between text-texto-3"><span>poco</span><span>mucho</span></div>
            </div>
          )}
        </Leyenda>
      </div>

      <aside className="ficha order-2 min-h-0 flex-1 overflow-y-auto border-r border-linea md:order-1">
        <div className="px-6 pt-6 pb-2">
          <div className="text-xs font-medium tracking-wide text-texto-3 uppercase">{datos.indice.nombre}</div>
          <h1 className="mt-1 text-[26px] leading-tight font-semibold tracking-tight">Qué hay y qué viene en cada barrio</h1>
        </div>

        <section className="no-imprimir px-6 pt-4">
          <h2 className="mb-2 text-sm font-semibold">1. Elige un barrio <span className="font-normal text-texto-3">o pulsa en el mapa</span></h2>
          <div className="grid max-h-56 grid-cols-1 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
            {barrios.map((a) => {
              const on = lugar?.ambito === a.ambito
              return (
                <button key={a.ambito} type="button" onClick={() => elegirBarrio(a)} aria-pressed={on}
                  className={`border px-3 py-2 text-left transition-colors ${on ? 'border-tinta bg-tinta text-white' : 'border-linea hover:border-tinta'}`}>
                  <div className="truncate text-sm font-medium">{nombreBarrio(a.ambito)}</div>
                  <div className={`text-[11px] ${on ? 'text-white/70' : 'text-texto-3'}`}>{ETIQUETA_ESTADO_BARRIO[a.estado]} · {n(a.viviendas ?? 0)} viviendas</div>
                  {(sinConstruir.get(a.ambito)?.pct ?? null) != null && (
                    <div className={`text-[11px] ${on ? 'text-white/70' : 'text-rojo-oscuro'}`}>{n(sinConstruir.get(a.ambito)!.pct!)} % del suelo para servicios sin construir</div>
                  )}
                </button>
              )
            })}
          </div>
          {barrios.length === 0 && <p className="text-sm text-texto-2">Este municipio no tiene barrios en desarrollo en el planeamiento. Pulsa en el mapa para elegir una zona.</p>}
          <button type="button" className="mt-2 text-xs text-texto-2 underline underline-offset-2 hover:text-tinta" onClick={() => setBuscarCalle(!buscarCalle)}>{buscarCalle ? 'Ocultar buscador' : '¿Ya vives aquí? Busca tu calle'}</button>
          {buscarCalle && (
            <form className="mt-2" onSubmit={(e) => { e.preventDefault(); buscar() }}>
              <div className="flex"><input className="h-10 min-w-0 flex-1 border border-tinta px-3 text-sm" placeholder="Calle y número" value={q} onChange={(e) => setQ(e.target.value)} />
                <button className="h-10 bg-tinta px-4 text-sm font-semibold text-white hover:bg-rojo">Buscar</button></div>
              {msg && <p className="mt-1 text-xs text-rojo-oscuro">{msg}</p>}
              {cands.length > 0 && <ul className="border border-t-0 border-tinta text-sm">{cands.map((c) => <li key={c.address + c.lat}><button type="button" className="w-full px-3 py-2 text-left hover:bg-gris-1" onClick={() => { elegirPunto(c.lng, c.lat, c.address); setCands([]) }}>{c.address}</button></li>)}</ul>}
            </form>
          )}
        </section>

        <section className="no-imprimir px-6 pt-5">
          <h2 className="mb-2 text-sm font-semibold">2. Qué buscas <span className="font-normal text-texto-3">({cats.length} elegidos)</span></h2>
          {recientes.length > 0 && (
            <div className="mb-3">
              <div className="mb-1.5 text-xs text-texto-3">Últimas búsquedas</div>
              <div className="flex flex-wrap gap-1.5">
                {recientes.map((id) => {
                  const c = CATEGORIAS.find((x) => x.id === id)
                  if (!c) return null
                  const on = cats.includes(id)
                  return <button key={id} type="button" aria-pressed={on} onClick={() => alternarCat(id)}
                    className={`inline-flex items-center gap-1.5 border px-2.5 py-1.5 text-[13px] ${on ? 'border-tinta bg-tinta text-white' : 'border-linea hover:border-tinta'}`}>
                    <Icono nombre={c.icono} className="h-4 w-4" />{c.texto}</button>
                })}
              </div>
            </div>
          )}
          <div className="border-t border-linea">
            {GRUPOS.map((g) => {
              const cs = CATEGORIAS.filter((c) => c.grupo === g), nSel = cs.filter((c) => cats.includes(c.id)).length, ab = abiertos.includes(g)
              return (
                <div key={g} className="border-b border-linea">
                  <button type="button" aria-expanded={ab} className="flex w-full items-center gap-2 py-2.5 text-left text-sm" onClick={() => setAbiertos((a) => ab ? a.filter((x) => x !== g) : [...a, g])}>
                    <span className="font-medium">{g}</span>{nSel > 0 && <span className="bg-rojo px-1.5 text-[11px] font-semibold text-white">{nSel}</span>}<span className="ml-auto text-xs text-texto-3">{ab ? '▴' : '▾'}</span>
                  </button>
                  {ab && <div className="grid grid-cols-1 gap-0.5 pb-2.5 sm:grid-cols-2">{cs.map((c) => (
                    <label key={c.id} className="flex cursor-pointer items-center gap-2 py-1 text-sm">
                      <input type="checkbox" className="h-4 w-4 accent-tinta" checked={cats.includes(c.id)} onChange={() => alternarCat(c.id)} />{c.texto}
                    </label>))}</div>}
                </div>
              )
            })}
          </div>
        </section>

        <section className="no-imprimir px-6 pt-5">
          <h2 className="text-sm font-semibold">3. A qué distancia y qué mostrar</h2>
          <p className="mb-2 text-xs text-texto-3">Hasta dónde irías andando y qué quieres ver: lo que ya funciona, lo que el plan urbanístico reserva o prevé, y el suelo libre donde podría ir un servicio nuevo.</p>
          <div className="flex">
            {[5, 10, 15, 20].map((m) => <button key={m} type="button" aria-pressed={radioMin === m} onClick={() => setRadioMin(m)}
              className={`flex-1 border-y border-l px-2 py-1.5 text-sm last:border-r ${radioMin === m ? 'border-tinta bg-tinta text-white' : 'border-linea hover:bg-gris-1'}`}>{m} min</button>)}
          </div>
          <div className="mt-1 text-xs text-texto-3">a pie, en línea recta ({n(radio)} m)</div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
            {ESTADOS.map((e) => (
              <label key={e.id} className={`flex items-center gap-1.5 text-sm ${e.disponible ? 'cursor-pointer' : 'text-texto-3'}`} title={e.disponible ? '' : 'Sin datos todavía: llegará con las licitaciones y el BOCM'}>
                <input type="checkbox" className="h-4 w-4 accent-tinta" disabled={!e.disponible} checked={estados.includes(e.id)} onChange={() => setEstados((x) => x.includes(e.id) ? x.filter((y) => y !== e.id) : [...x, e.id])} />
                {e.texto}{!e.disponible && ' (sin datos)'}
              </label>
            ))}
          </div>
        </section>

        {!resultado && <p className="mx-6 mt-6 mb-8 border-t border-linea pt-5 text-sm text-texto-2">Elige un barrio de la lista o pulsa en el mapa para ver qué hay a su alrededor y qué está por venir.</p>}

        {resultado && lugar && (
          <div ref={refResultados} className="mt-6 scroll-mt-2 border-t border-tinta">
            <div className="flex items-start gap-3 bg-gris-1 px-6 py-4">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center bg-rojo text-white"><Icono nombre="ubicacion" className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{lugar.texto}</div>
                <div className="text-sm text-texto-2">{amb ? `${ETIQUETA_ESTADO_BARRIO[amb.estado]} · ${n(amb.viviendas ?? 0)} viviendas previstas` : 'Fuera de los barrios en desarrollo'} · {resultado.cerca.length} resultados a menos de {radioMin} min</div>
              </div>
            </div>

            {(() => {
              // veredicto de un vistazo (idea de Lucía): cuántas de las cosas que buscas tienes cerca
              const buscadas = resultado.porCat.filter(({ c }) => c.id !== 'suelo')
              const tienes = buscadas.filter((x) => x.items.length > 0)
              if (!buscadas.length) return null
              return (
                <section className="border-b border-linea px-6 py-4">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[30px] leading-none font-semibold tabular-nums">{tienes.length}<span className="text-texto-3">/{buscadas.length}</span></span>
                    <span className="text-sm text-texto-2">de las cosas que buscas, a menos de {radioMin} min a pie</span>
                  </div>
                  <ul className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
                    {buscadas.map(({ c, items, masCercano }) => (
                      <li key={c.id} className="flex items-center gap-2">
                        <span className={`flex h-4 w-4 shrink-0 items-center justify-center text-[10px] font-bold text-white ${items.length ? 'bg-ok' : 'bg-rojo'}`}>{items.length ? '✓' : '✕'}</span>
                        <span className="min-w-0 flex-1 truncate">{c.texto}</span>
                        <span className="shrink-0 text-xs text-texto-3 tabular-nums">{items.length ? `${minutos(items[0].d)} min` : masCercano ? `${minutos(masCercano.d)} min` : '—'}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )
            })()}

            {amb && (amb.poblacion_actual || amb.poblacion_completo) && (
              <section className="border-b border-linea px-6 py-4">
                <h2 className="mb-2 font-semibold">Su población</h2>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><div className="text-xs text-texto-3">Hoy ({amb.anio_poblacion_actual ?? '—'}, INE)</div><div className="text-xl font-semibold tabular-nums">{amb.poblacion_actual ? n(amb.poblacion_actual) : 'sin datos'}</div></div>
                  <div><div className="text-xs text-texto-3">Cuando esté completo</div><div className="text-xl font-semibold tabular-nums">{amb.poblacion_completo ? `${n(amb.poblacion_completo[0])}–${n(amb.poblacion_completo[2])}` : 'sin datos'}</div></div>
                </div>
                {previsiones.filter((p) => p.hi > 0).length > 0 && (
                  <div className="mt-3"><Aviso titulo="Lo que hará falta cuando esté completo">
                    <ul className="mt-1 grid gap-0.5">{previsiones.filter((p) => p.hi > 0).map((p) => (
                      <li key={p.s.nombre}>{p.s.nombre}: {p.s.unidad === 'plazas' ? `entre ${n(p.lo)} y ${n(p.hi)} plazas` : `entre ${n(p.lo)} y ${n(p.hi)} habitantes que atender`} · hoy hay {p.abiertos} a menos de {radioMin} min</li>))}</ul>
                    <div className="mt-1 text-xs">Estimación del modelo con su rango. No atribuye responsabilidades.</div>
                  </Aviso></div>
                )}
              </section>
            )}

            {resultado.porCat.map(({ c, items, masCercano }) => (
              <section key={c.id} className="border-b border-linea px-6 py-4">
                <div className="mb-1.5 flex items-center gap-2.5">
                  <Icono nombre={c.icono} className="h-5 w-5" /><h2 className="font-semibold">{c.texto}</h2>
                  <span className="ml-auto text-xs text-texto-3">{items.length ? `${items.length} a menos de ${radioMin} min` : 'ninguno cerca'}</span>
                </div>
                {!items.length && masCercano && <p className="text-sm text-texto-2">El más cercano: <b className="text-tinta">{masCercano.nombre}</b>, a unos {minutos(masCercano.d)} minutos a pie.</p>}
                <ul>
                  {items.slice(0, 4).map((x) => (
                    <li key={x.id} className="flex items-center gap-3 border-t border-gris-2 py-2 first:border-t-0">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[15px] font-medium" title={x.nombre}>{x.nombre}</div>
                        <div className="truncate text-xs text-texto-3">{x.detalle && <>{x.detalle} · </>}<a className="underline-offset-2 hover:text-rojo hover:underline" href={FUENTE_URL[c.fuente]} target="_blank" rel="noreferrer">{NOMBRE_FUENTE[c.fuente]}</a></div>
                      </div>
                      <div className="shrink-0 text-right"><div className="text-sm font-semibold tabular-nums">{minutos(x.d)} min</div><Estado estado={x.estado} /></div>
                    </li>
                  ))}
                </ul>
                {items.length > 4 && <div className="pt-1 text-xs text-texto-3">y {items.length - 4} más en el mapa</div>}
              </section>
            ))}

            <section className="border-b border-linea px-6 py-4">
              <div className="mb-1.5 flex items-center gap-2.5"><Icono nombre="autobus" className="h-5 w-5" /><h2 className="font-semibold">Transporte a menos de 5 min</h2></div>
              {resultado.paradas.length ? <ul>{resultado.paradas.map(({ f, d }) => (
                <li key={String(f.properties?.id)} className="flex items-start gap-3 border-t border-gris-2 py-2 first:border-t-0">
                  <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{capitalizar(String(f.properties?.nombre))}</div>
                    <div className="mt-1 flex flex-wrap gap-1">{String(f.properties?.lineas ?? '').split('; ').flatMap((t) => { const [modo, ls] = t.split(': '); return (ls ?? '').split(',').map((l) => l.trim()).filter((l) => l && l !== '—').map((l) => <Linea key={modo + l} codigo={l} modo={modo} />) })}</div></div>
                  <span className="text-sm font-semibold tabular-nums">{minutos(d)} min</span>
                </li>))}</ul> : <p className="text-sm text-texto-2">Ninguna parada a menos de 5 minutos.</p>}
            </section>

            <div className="no-imprimir flex flex-wrap gap-2 px-6 py-5">
              <button type="button" className="inline-flex items-center gap-2 border border-tinta px-4 py-2 text-sm hover:bg-gris-1" onClick={imprimirFicha}><Icono nombre="descargar" className="h-4 w-4" />Ficha del barrio (PDF)</button>
            </div>
            <p className="px-6 pb-6 text-xs leading-relaxed text-texto-3">Datos abiertos de la Comunidad de Madrid (IDEM y Portal de Datos Abiertos), INE y Consorcio Regional de Transportes. Licitaciones y obras: sin datos todavía. Distancias a pie en línea recta.{amb?.pct_residencial_vacante != null ? ` Suelo residencial aún sin construir en el barrio: ${dec(amb.pct_residencial_vacante)} %.` : ''}</p>
          </div>
        )}
      </aside>
      {resultado && lugar && (() => {
        const buscadas = resultado.porCat.filter(({ c }) => c.id !== 'suelo')
        const suelo = resultado.cerca.filter((x) => x.cat.id === 'suelo')
        return (
          <FichaBarrio municipio={datos.indice.nombre} lugar={lugar.texto} estadoBarrio={amb ? ETIQUETA_ESTADO_BARRIO[amb.estado] : null} viviendas={amb?.viviendas ?? null}
            foto={foto} imagenMapa={imagenMapa} radioMin={radioMin}
            veredicto={{ tienes: buscadas.filter((x) => x.items.length > 0).length, total: buscadas.length }}
            poblacion={{ hoy: amb?.poblacion_actual ?? null, anio: amb?.anio_poblacion_actual ?? null, completo: amb?.poblacion_completo ? [amb.poblacion_completo[0], amb.poblacion_completo[2]] : null }}
            previsiones={previsiones.filter((x) => x.hi > 0).map((x) => ({ servicio: x.s.nombre, texto: `${x.s.unidad === 'plazas' ? `entre ${n(x.lo)} y ${n(x.hi)} plazas` : `entre ${n(x.lo)} y ${n(x.hi)} habitantes que atender`}; hoy hay ${x.abiertos} a menos de ${radioMin} min` }))}
            grupos={buscadas.map(({ c, items, masCercano }) => ({ titulo: c.texto, items: items.map((x) => ({ id: x.id, nombre: x.nombre, detalle: x.detalle, estado: x.estado, minutos: minutos(x.d) })),
              masCercano: masCercano ? { nombre: masCercano.nombre, minutos: minutos(masCercano.d) } : null }))}
            paradas={resultado.paradas.map(({ f, d }) => ({ nombre: capitalizar(String(f.properties?.nombre)), lineas: String(f.properties?.lineas ?? '—'), minutos: minutos(d) }))}
            suelo={{ parcelas: suelo.length, m2: suelo.reduce((t, x) => t + Number(x.detalle.split(' m²')[0].replace(/\./g, '')), 0) }} />
        )
      })()}
    </div>
  )
}
