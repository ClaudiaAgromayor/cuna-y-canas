import { useMemo, useState } from 'react'
import type { FeatureCollection, Geometry, Point, Polygon, Position } from 'geojson'
import Mapa, { type CapaMapa, type Marcador } from './Mapa'
import { circulo, existentesDe, metros, METROS_POR_MINUTO, type Existente } from './algoritmo'
import type { DatosMunicipio, Servicio, ServicioId } from './tipos'
import { Icono, iconoSvg } from './iconos'
import { Aviso, capitalizar, Estado, Linea, n, nombreBarrio } from './ui'

interface Props { datos: DatosMunicipio; servicios: Record<ServicioId, Servicio> }

const INTERESES: { id: string; texto: string; icono: string; servicios: ServicioId[] }[] = [
  { id: 'bebe', texto: 'Tengo un bebé', icono: 'escuela_infantil', servicios: ['escuela_infantil'] },
  { id: 'escolar', texto: 'Hijos en edad escolar', icono: 'colegio', servicios: ['colegio'] },
  { id: 'familia', texto: 'Salud', icono: 'centro_salud', servicios: ['centro_salud'] },
  { id: 'mayores', texto: 'Cuido de mis mayores', icono: 'residencia', servicios: ['centro_dia', 'residencia'] },
]
const FUENTE: Record<string, string> = {
  centros_educativos: 'https://datos.comunidad.madrid/dataset/centros_educativos',
  centros_sanitarios: 'https://datos.comunidad.madrid/dataset/centros_servicios_establecimientos_sanitarios',
  centros_sociales: 'https://datos.comunidad.madrid/dataset/atencion_social_registro_centros',
}
const minutos = (m: number) => Math.max(1, Math.round(m / METROS_POR_MINUTO))

/** Anillos de cualquier geometría poligonal (también colecciones), para no fallar con geometrías reparadas. */
function poligonos(g: Geometry | null): Position[][][] {
  if (!g) return []
  if (g.type === 'Polygon') return [g.coordinates]
  if (g.type === 'MultiPolygon') return g.coordinates
  if (g.type === 'GeometryCollection') return g.geometries.flatMap(poligonos)
  return []
}

interface Lugar { lon: number; lat: number; texto: string }
interface Candidato { address: string; muni: string; lat: number; lng: number; type: string }

export default function PantallaCiudadana({ datos, servicios }: Props) {
  const [lugar, setLugar] = useState<Lugar | null>(null)
  const [intereses, setIntereses] = useState<string[]>(INTERESES.map((e) => e.id))
  const [q, setQ] = useState('')
  const [cands, setCands] = useState<Candidato[]>([])
  const [buscando, setBuscando] = useState(false)
  const [errorBusqueda, setErrorBusqueda] = useState('')

  const capasPuntos = useMemo(() => ({ centros_educativos: datos.educativos, centros_sanitarios: datos.sanitarios, centros_sociales: datos.sociales }), [datos])
  const sids = [...new Set(INTERESES.filter((e) => intereses.includes(e.id)).flatMap((e) => e.servicios))]

  async function buscar() {
    if (!q.trim()) return
    setBuscando(true); setErrorBusqueda(''); setCands([])
    try {
      // geocodificador oficial CartoCiudad (IGN); se añade el municipio para no confundir calles homónimas
      const url = `https://www.cartociudad.es/geocoder/api/geocoder/candidates?limit=6&q=${encodeURIComponent(`${q}, ${datos.indice.nombre}`)}`
      const r: Candidato[] = await (await fetch(url)).json()
      const delMunicipio = r.filter((c) => c.muni?.toLowerCase() === datos.indice.nombre.toLowerCase() && c.lat && c.lng)
      if (delMunicipio.length === 1) elegir({ lon: delMunicipio[0].lng, lat: delMunicipio[0].lat, texto: delMunicipio[0].address })
      else setCands(delMunicipio)
      if (!delMunicipio.length) setErrorBusqueda(`No encontramos esa dirección en ${datos.indice.nombre}. Prueba con otra o pulsa en el mapa.`)
    } catch {
      setErrorBusqueda('El buscador no responde ahora mismo. Pulsa en el mapa o elige un barrio.')
    } finally { setBuscando(false) }
  }
  const elegir = (l: Lugar) => { setLugar(l); setCands([]) }

  const ambitoDe = (lon: number, lat: number) => {
    for (const f of datos.ambitos.features) {
      for (const poly of poligonos(f.geometry)) {
        const anillo = poly[0]
        let dentro = false
        for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
          const [xi, yi] = anillo[i], [xj, yj] = anillo[j]
          if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dentro = !dentro
        }
        if (dentro) return String(f.properties?.nombre)
      }
    }
    return null
  }

  const resultado = useMemo(() => {
    if (!lugar) return null
    const amb = ambitoDe(lugar.lon, lugar.lat)
    const demAmb = datos.demanda?.ambitos.find((a) => a.ambito === amb)
    const porServicio = sids.map((sid) => {
      const s = servicios[sid]
      const radio = s.minutos_andando * METROS_POR_MINUTO
      const todos = existentesDe(s, capasPuntos, s.capacidad[1]).map((c) => ({ ...c, d: metros(lugar.lon, lugar.lat, c.lon, c.lat) })).sort((a, b) => a.d - b.d)
      const cerca = todos.filter((c) => c.d <= radio)
      const capCerca = cerca.reduce((t, c) => t + c.capacidad, 0)
      let prevision: string | null = null
      if (demAmb?.grupos_completo && demAmb.estado !== 'sin_datos') {
        const g = s.grupo.map((k) => (k === 'pob' ? demAmb.poblacion_completo : demAmb.grupos_completo![k])).filter(Boolean) as [number, number, number][]
        const lo = Math.round(g.reduce((t, x) => t + x[0], 0) * s.tasa_uso[0]), hi = Math.round(g.reduce((t, x) => t + x[2], 0) * s.tasa_uso[2])
        if (sid === 'centro_salud') {
          prevision = `${nombreBarrio(amb)} tendrá entre ${n(lo)} y ${n(hi)} habitantes. Un centro de salud atiende a unos ${n(s.capacidad[1])} y hay ${cerca.length} a menos de ${s.minutos_andando} minutos a pie.`
        } else if (hi > capCerca) {
          prevision = `Harán falta entre ${n(lo)} y ${n(hi)} ${s.unidad}. A menos de ${s.minutos_andando} minutos a pie hay ${n(capCerca)}${cerca.some((c) => !c.capacidadReal) ? ' (capacidad estimada)' : ''}.`
        }
      }
      return { sid, s, cerca, masCercano: todos[0] as (Existente & { d: number }) | undefined, prevision }
    })
    const suelo = datos.parcelas.features.filter((f) => metros(lugar.lon, lugar.lat, f.properties.lon, f.properties.lat) <= 10 * METROS_POR_MINUTO)
    const paradas = datos.paradas.features.map((f) => ({ f, d: metros(lugar.lon, lugar.lat, f.geometry.coordinates[0], f.geometry.coordinates[1]) }))
      .filter((x) => x.d <= 5 * METROS_POR_MINUTO).sort((a, b) => a.d - b.d).slice(0, 3)
    return { amb, demAmb, porServicio, suelo, paradas }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lugar, datos, intereses, servicios, capasPuntos])

  const capas: CapaMapa[] = useMemo(() => {
    const radio: FeatureCollection<Polygon> = { type: 'FeatureCollection', features: lugar ? [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [circulo(lugar.lon, lugar.lat, 10 * METROS_POR_MINUTO)] } }] : [] }
    const todos: FeatureCollection<Point> = { type: 'FeatureCollection', features: sids.flatMap((sid) => existentesDe(servicios[sid], capasPuntos, servicios[sid].capacidad[1])
      .map((c) => ({ type: 'Feature' as const, properties: { nombre: c.nombre, detalle: c.detalle, servicio: servicios[sid].nombre }, geometry: { type: 'Point' as const, coordinates: [c.lon, c.lat] } }))) }
    return [
      { id: 'c-ambitos', datos: datos.ambitos, estilo: { type: 'line', paint: { 'line-color': '#131313', 'line-width': 1, 'line-opacity': 0.35, 'line-dasharray': [3, 2] } },
        popup: (p) => `<b>${nombreBarrio(String(p.nombre))}</b><br><span style="color:#595959">Barrio en desarrollo · ${p.viviendas ? n(Number(p.viviendas)) + ' viviendas previstas' : 'sin datos de viviendas'}</span>` },
      { id: 'c-suelo', datos: datos.parcelas, estilo: { type: 'fill', paint: { 'fill-color': '#2b5c8a', 'fill-opacity': 0.3 } },
        popup: (p) => `<b>Suelo reservado para equipamientos</b><br>${n(Number(p.area_m2))} m², todavía sin construir` },
      { id: 'c-radio', datos: radio, estilo: { type: 'line', paint: { 'line-color': '#de0029', 'line-width': 1.5, 'line-dasharray': [2, 2] } } },
      { id: 'c-todos', datos: todos, visible: !lugar, estilo: { type: 'circle', paint: { 'circle-radius': 4, 'circle-color': '#131313', 'circle-stroke-width': 1.5, 'circle-stroke-color': '#fff' } },
        popup: (p) => `<b>${p.nombre}</b><br>${p.servicio}<br><span style="color:#595959">${p.detalle}</span>` },
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datos, lugar, intereses])

  const centro = useMemo<[number, number] | null>(() => (lugar ? [lugar.lon, lugar.lat] : null), [lugar])
  const marcadores: Marcador[] = useMemo(() => {
    if (!lugar || !resultado) return []
    const cercanos = resultado.porServicio.flatMap(({ sid, s, cerca }) => cerca.slice(0, 6).map((c) => ({
      id: `${sid}-${c.id}`, lon: c.lon, lat: c.lat, texto: '', color: '#131313', html: iconoSvg(sid), clase: 'pequeno', titulo: `${capitalizar(c.nombre)} · ${s.nombre}`,
    })))
    return [...cercanos, { id: 'yo', lon: lugar.lon, lat: lugar.lat, texto: '', color: '#de0029', html: iconoSvg('ubicacion'), titulo: lugar.texto }]
  }, [lugar, resultado])
  const barrios = (datos.demanda?.ambitos ?? []).filter((a) => a.viviendas && a.viviendas >= 500)

  const elegirBarrio = (nombre: string) => {
    const pts = datos.demandaPuntos.features.filter((p) => p.properties.ambito === nombre)
    if (pts.length) {
      elegir({ lon: pts.reduce((t, p) => t + p.geometry.coordinates[0], 0) / pts.length, lat: pts.reduce((t, p) => t + p.geometry.coordinates[1], 0) / pts.length, texto: nombreBarrio(nombre) })
      return
    }
    const f = datos.ambitos.features.find((x) => x.properties?.nombre === nombre)
    const c = f ? poligonos(f.geometry)[0]?.[0] ?? [] : []
    if (c.length) elegir({ lon: c.reduce((t, x) => t + x[0], 0) / c.length, lat: c.reduce((t, x) => t + x[1], 0) / c.length, texto: nombreBarrio(nombre) })
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[minmax(420px,520px)_1fr]">
      <aside className="ficha min-h-0 overflow-y-auto border-r border-linea">
        <div className="px-6 pt-7 pb-5">
          <h1 className="text-[28px] leading-tight font-semibold tracking-tight">¿Qué hay cerca de tu casa<br /><span className="text-texto-2">y qué está por venir?</span></h1>

          {/* 1. dirección */}
          <form className="no-imprimir mt-6" onSubmit={(e) => { e.preventDefault(); buscar() }}>
            <label htmlFor="direccion" className="mb-1.5 block text-sm font-semibold">Tu dirección en {datos.indice.nombre}</label>
            <div className="flex">
              <div className="relative flex-1">
                <Icono nombre="buscar" className="pointer-events-none absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-texto-3" />
                <input id="direccion" className="h-12 w-full border border-tinta bg-white pr-3 pl-10 text-[15px] placeholder:text-texto-3 focus:outline-2 focus:outline-offset-[-2px] focus:outline-rojo"
                  placeholder="Calle y número, p. ej. Avenida Rocinante 8" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="street-address" />
              </div>
              <button className="h-12 bg-tinta px-5 text-sm font-semibold text-white transition-colors hover:bg-rojo disabled:opacity-60" disabled={buscando}>{buscando ? 'Buscando…' : 'Buscar'}</button>
            </div>
            {errorBusqueda && <p className="mt-2 text-sm text-rojo-oscuro">{errorBusqueda}</p>}
            {cands.length > 0 && (
              <ul className="border border-t-0 border-tinta bg-white text-sm shadow-sm">
                {cands.map((c) => (
                  <li key={`${c.address}${c.lat}`} className="border-t border-linea first:border-t-0">
                    <button type="button" className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-gris-1" onClick={() => elegir({ lon: c.lng, lat: c.lat, texto: c.address })}>
                      <Icono nombre="ubicacion" className="h-4 w-4 text-texto-3" />{c.address}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-2.5 flex items-center gap-2 text-sm text-texto-2">
              <span>o elige un barrio nuevo:</span>
              <select className="min-w-0 flex-1 border-b border-tinta bg-transparent py-1 font-medium text-tinta focus:outline-none" value="" onChange={(e) => e.target.value && elegirBarrio(e.target.value)}>
                <option value="">Seleccionar…</option>
                {barrios.map((a) => <option key={a.ambito} value={a.ambito}>{nombreBarrio(a.ambito)}</option>)}
              </select>
            </div>
          </form>

          {/* 2. intereses */}
          <fieldset className="no-imprimir mt-6">
            <legend className="mb-2 text-sm font-semibold">Qué te interesa</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {INTERESES.map((e) => {
                const on = intereses.includes(e.id)
                return (
                  <button type="button" key={e.id} aria-pressed={on} onClick={() => setIntereses((x) => on ? x.filter((y) => y !== e.id) : [...x, e.id])}
                    className={`relative flex flex-col items-start gap-2 border p-3 text-left text-[13px] leading-tight transition-colors ${on ? 'border-tinta bg-white text-tinta shadow-[inset_0_0_0_1px_#131313]' : 'border-linea bg-gris-1 text-texto-3 hover:border-texto-3'}`}>
                    <Icono nombre={e.icono} className="h-6 w-6" />
                    <span className="font-medium">{e.texto}</span>
                    {on && <span className="absolute top-2 right-2 flex h-4 w-4 items-center justify-center bg-tinta text-white"><Icono nombre="check" className="h-3 w-3" /></span>}
                  </button>
                )
              })}
            </div>
          </fieldset>
        </div>

        {!resultado && (
          <ol className="mx-6 mb-8 grid gap-3 border-t border-linea pt-5 text-sm text-texto-2">
            {['Escribe tu dirección, elige un barrio o pulsa en el mapa.', 'Marca lo que te interesa: colegios, salud, mayores…', 'Verás qué hay a pocos minutos a pie y qué suelo está reservado para nuevos servicios.'].map((t, i) => (
              <li key={t} className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center border border-tinta text-xs font-semibold text-tinta">{i + 1}</span>{t}</li>
            ))}
          </ol>
        )}

        {resultado && lugar && (
          <div className="border-t border-linea">
            <div className="flex items-start gap-3 bg-gris-1 px-6 py-4">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center bg-rojo text-white"><Icono nombre="ubicacion" className="h-5 w-5" /></span>
              <div className="min-w-0">
                <div className="font-semibold">{lugar.texto}</div>
                <div className="text-sm text-texto-2">{resultado.amb
                  ? <>Barrio en desarrollo: <b className="text-tinta">{nombreBarrio(resultado.amb)}</b>{resultado.demAmb?.viviendas ? ` · ${n(resultado.demAmb.viviendas)} viviendas previstas` : ''}</>
                  : 'Fuera de los barrios de nuevo desarrollo'}</div>
              </div>
            </div>

            {resultado.porServicio.map(({ sid, s, cerca, masCercano, prevision }) => (
              <section key={sid} className="border-b border-linea px-6 py-5">
                <div className="mb-2 flex items-center gap-2.5">
                  <Icono nombre={sid} className="h-5 w-5" />
                  <h2 className="font-semibold">{s.nombre}</h2>
                  <span className="ml-auto text-xs text-texto-3">{cerca.length ? `${cerca.length} a menos de ${s.minutos_andando} min` : `ninguno a menos de ${s.minutos_andando} min`}</span>
                </div>
                {cerca.length === 0 && masCercano && (
                  <p className="text-sm text-texto-2">El más cercano es <b className="text-tinta">{capitalizar(masCercano.nombre)}</b>, a unos {minutos(masCercano.d)} minutos a pie.</p>
                )}
                <ul>
                  {cerca.slice(0, 3).map((c) => (
                    <li key={c.id} className="flex items-center gap-3 border-t border-gris-2 py-2.5 first:border-t-0">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[15px] font-medium" title={c.nombre}>{capitalizar(c.nombre)}</div>
                        <div className="flex flex-wrap items-center gap-x-3 text-xs text-texto-3">
                          <span className="capitalize">{c.detalle.toLowerCase()}</span>
                          <a className="inline-flex items-center gap-0.5 text-texto-2 underline-offset-2 hover:text-rojo hover:underline" href={FUENTE[s.existentes.capa]} target="_blank" rel="noreferrer">
                            Fuente<Icono nombre="externo" className="h-3 w-3" /></a>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[15px] font-semibold tabular-nums">{minutos(c.d)} min</div>
                        <Estado estado="abierto" />
                      </div>
                    </li>
                  ))}
                </ul>
                {cerca.length > 3 && <div className="pt-1 text-xs text-texto-3">y {cerca.length - 3} más en el mapa</div>}
                {prevision && <div className="mt-3"><Aviso titulo={`Cuando ${resultado.amb ? nombreBarrio(resultado.amb) : 'el barrio'} esté completo`}>{prevision}</Aviso></div>}
              </section>
            ))}

            <section className="border-b border-linea px-6 py-5">
              <div className="mb-2 flex items-center gap-2.5"><Icono nombre="suelo" className="h-5 w-5" /><h2 className="font-semibold">Lo que está por venir</h2></div>
              {resultado.suelo.length ? (
                <div className="flex items-center gap-3">
                  <div className="flex-1 text-sm text-texto-2"><b className="text-tinta">{resultado.suelo.length} parcelas</b> reservadas para equipamientos públicos a menos de 10 minutos ({n(resultado.suelo.reduce((t, f) => t + f.properties.area_m2, 0))} m²), todavía sin construir.</div>
                  <Estado estado="suelo" />
                </div>
              ) : <p className="text-sm text-texto-2">No hay suelo de equipamiento vacante a menos de 10 minutos.</p>}
              <p className="mt-2 text-xs text-texto-3">Licitaciones y obras en marcha: sin datos todavía para {datos.indice.nombre}. Fuente del suelo: IDEM, suelo vacante 2026.</p>
            </section>

            <section className="border-b border-linea px-6 py-5">
              <div className="mb-2 flex items-center gap-2.5"><Icono nombre="autobus" className="h-5 w-5" /><h2 className="font-semibold">Transporte a menos de 5 minutos</h2></div>
              {resultado.paradas.length ? (
                <ul>
                  {resultado.paradas.map(({ f, d }) => (
                    <li key={String(f.properties?.id)} className="flex items-start gap-3 border-t border-gris-2 py-2 first:border-t-0">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{capitalizar(String(f.properties?.nombre))}</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {String(f.properties?.lineas ?? '').split('; ').flatMap((tramo) => {
                            const [modo, ls] = tramo.split(': ')
                            return (ls ?? '').split(',').map((l) => l.trim()).filter((l) => l && l !== '—').map((l) => <Linea key={`${modo}${l}`} codigo={l} modo={modo} />)
                          })}
                        </div>
                      </div>
                      <span className="text-sm font-semibold tabular-nums">{minutos(d)} min</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-texto-2">Ninguna parada a menos de 5 minutos.</p>}
            </section>

            <div className="no-imprimir flex gap-2 px-6 py-5">
              <button type="button" className="inline-flex items-center gap-2 border border-tinta px-4 py-2 text-sm hover:bg-gris-1" onClick={() => window.print()}>
                <Icono nombre="descargar" className="h-4 w-4" />Descargar ficha (PDF)</button>
              <button type="button" className="px-3 py-2 text-sm text-texto-2 underline-offset-2 hover:underline" onClick={() => { setLugar(null); setQ('') }}>Buscar otra dirección</button>
            </div>
            <p className="px-6 pb-6 text-xs leading-relaxed text-texto-3">Datos abiertos de la Comunidad de Madrid (IDEM y Portal de Datos Abiertos), INE y Consorcio Regional de Transportes. Las previsiones son estimaciones con su rango y no atribuyen responsabilidades. Tiempos a pie en línea recta.</p>
          </div>
        )}
      </aside>
      <div className="relative min-h-[420px]">
        <Mapa bbox={datos.encuadre} capas={capas} marcadores={marcadores} centrarEn={centro}
          onClickMapa={(lon, lat) => elegir({ lon, lat, texto: 'Punto elegido en el mapa' })}
          onClickCapa={(capa, _p, ll) => { if (capa !== 'c-todos') elegir({ lon: ll[0], lat: ll[1], texto: 'Punto elegido en el mapa' }) }} />
        <div className="pointer-events-none absolute top-3 left-3 bg-white/95 px-3 py-2 text-xs shadow-sm">
          <div className="flex items-center gap-2"><span className="h-3 w-3 bg-tinta" />Servicios existentes</div>
          <div className="mt-1 flex items-center gap-2"><span className="h-3 w-3 bg-suelo/40 outline outline-suelo/60" />Suelo reservado para equipamientos</div>
          <div className="mt-1 flex items-center gap-2"><span className="h-0 w-3 border-t-2 border-dashed border-rojo" />10 minutos a pie</div>
        </div>
      </div>
    </div>
  )
}
