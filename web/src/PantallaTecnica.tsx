import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import type { Feature, FeatureCollection, Geometry, MultiPolygon, Point, Polygon, Position } from 'geojson'
import Mapa, { type CapaMapa, type Marcador } from './Mapa'
import { calcular, circulo, existentesDe, OCUPACION_MINIMA, pesoDemanda, type Escenario, type Resultado } from './algoritmo'
import type { DatosMunicipio, Parcela, Servicio, ServicioId } from './tipos'
import { Aviso, Boton, capitalizar, dec, Deslizador, Interruptor, n, nombreBarrio, Paso, Leyenda } from './ui'
import { Icono } from './iconos'
import { descargarGeoJSON, descargarInforme } from './exportar'
import GraficaPoblacion, { type FilaPoblacion, type GrupoId } from './GraficaPoblacion'

interface Props { datos: DatosMunicipio; servicios: Record<ServicioId, Servicio> }

const COLOR_ESTADO: Record<string, string> = { habitado: '#8a8a8a', en_desarrollo: '#131313', futuro: '#de0029', sin_datos: '#c4c4c4' }
const NOMBRE_ESTADO: Record<string, string> = { habitado: 'Habitado', en_desarrollo: 'En desarrollo', futuro: 'Por construir', sin_datos: 'Sin datos' }
const ANIO_BASE = 2025
const ANIO_FIN = 2040
const GRUPOS_SERVICIO: Record<ServicioId, GrupoId[]> = {
  escuela_infantil: ['bebes'], colegio: ['ninos'], centro_salud: ['bebes', 'ninos', 'jovenes', 'adultos', 'mayores'], centro_dia: ['mayores'], residencia: ['mayores'],
}
const NOMBRE_RED: Record<string, string> = { educativo: 'educativo', sanitario: 'sanitario', asistencial: 'asistencial', deportivo: 'deportivo', cultural: 'cultural' }
// qué uso de red pública es "adecuado" para cada servicio (criterio del documento: uso adecuado, superficie, titularidad pública)
const USO_ADECUADO: Record<ServicioId, string[]> = { escuela_infantil: ['educativo'], colegio: ['educativo'], centro_salud: ['sanitario'], centro_dia: ['asistencial'], residencia: ['asistencial'] }

function escenarioInicial(s: Servicio, d: DatosMunicipio, zona: string | null = null): Escenario {
  const hv = d.demanda?.calibracion.parametros.hab_por_vivienda ?? [2, 2, 2]
  return { habPorVivienda: hv[1], habPorViviendaCentral: hv[1], llenado: 1, tasaUso: s.tasa_uso[1], capacidad: s.capacidad[1],
    minutos: s.minutos_andando, supMinima: s.sup_min_m2, nCentros: 'auto', contarExistentes: true, fijados: [], excluidas: [],
    factorNatalidad: 1, factorFuturo: 1, demandaFija: null, zona, soloRedPublica: false }
}

function anillos(g: Geometry | null): Position[][][] {
  if (!g) return []
  if (g.type === 'Polygon') return [g.coordinates]
  if (g.type === 'MultiPolygon') return g.coordinates
  if (g.type === 'GeometryCollection') return g.geometries.flatMap(anillos)
  return []
}
function dentro(lon: number, lat: number, polys: Position[][][]): boolean {
  for (const poly of polys) {
    const a = poly[0]; let d = false
    for (let i = 0, j = a.length - 1; i < a.length; j = i++) {
      const [xi, yi] = a[i], [xj, yj] = a[j]
      if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) d = !d
    }
    if (d) return true
  }
  return false
}

export default function PantallaTecnica({ datos, servicios }: Props) {
  const [sid, setSid] = useState<ServicioId>('colegio')
  const s = servicios[sid]
  const [esc, setEsc] = useState<Escenario>(() => escenarioInicial(s, datos))
  const [anio, setAnio] = useState(2035)
  const [aniosLlenado, setAniosLlenado] = useState(10)
  const [guardado, setGuardado] = useState<{ esc: Escenario; res: Resultado; servicio: string; anio: number } | null>(null)
  const [verParadas, setVerParadas] = useState(false)
  const [verDemanda, setVerDemanda] = useState(true)
  const [verZonas, setVerZonas] = useState(false)
  const [pestana, setPestana] = useState<'ajustes' | 'resultados'>('ajustes')
  const [cifra, setCifra] = useState('')

  // cambiar de servicio reinicia los supuestos del servicio, pero conserva la zona de estudio
  useEffect(() => { setEsc((e) => escenarioInicial(servicios[sid], datos, e.zona)); setCifra(''); setVerZonas(sid === 'centro_salud') }, [sid, datos, servicios])
  useEffect(() => { setGuardado(null) }, [datos])

  const upd = (p: Partial<Escenario>) => setEsc((e) => ({ ...e, ...p }))
  const llenadoDe = (a: number) => Math.max(0, Math.min(1, (a - ANIO_BASE) / aniosLlenado))
  const escE = useMemo(() => ({ ...esc, llenado: llenadoDe(anio) }), [esc, anio, aniosLlenado]) // eslint-disable-line react-hooks/exhaustive-deps

  // titularidad: una parcela que cae dentro de una red pública de equipamiento del planeamiento es suelo público reservado
  const parcelas = useMemo(() => {
    const redes = datos.redes.features.filter((f) => f.properties?.tipo !== 'zona_verde').map((f) => ({ p: f.properties as Record<string, string>, polys: anillos(f.geometry) }))
    return datos.parcelas.features.map((f) => {
      const r = redes.find((x) => dentro(f.properties.lon, f.properties.lat, x.polys))
      return { ...f, properties: { ...f.properties, red: r ? `${r.p.red ?? 'Red pública'} · ${NOMBRE_RED[r.p.tipo] ?? r.p.tipo}` : null } } as Feature<Polygon | MultiPolygon, Parcela>
    })
  }, [datos])

  const capasPuntos = useMemo(() => ({ centros_educativos: datos.educativos, centros_sanitarios: datos.sanitarios, centros_sociales: datos.sociales }), [datos])
  const existentes = useMemo(() => existentesDe(s, capasPuntos, esc.capacidad), [s, capasPuntos, esc.capacidad])
  const res = useMemo(() => calcular(s, escE, datos.demandaPuntos.features, parcelas, existentes, datos.paradas.features), [s, escE, datos, parcelas, existentes])

  const rango = useMemo(() => {
    if (esc.demandaFija != null) return [esc.demandaFija, esc.demandaFija]
    const hv = datos.demanda?.calibracion.parametros.hab_por_vivienda ?? [esc.habPorVivienda, esc.habPorVivienda, esc.habPorVivienda]
    const pts = datos.demandaPuntos.features.filter((f) => !esc.zona || f.properties.ambito === esc.zona)
    const tot = (h: number, t: number) => pts.reduce((a, f) => a + pesoDemanda(f.properties, s, { ...escE, habPorVivienda: h, tasaUso: t }), 0)
    return [Math.round(tot(hv[0], s.tasa_uso[0])), Math.round(tot(hv[2], s.tasa_uso[2]))]
  }, [datos, s, esc, escE])

  // población de la zona año a año, por grupos (con natalidad y llegada de personas del escenario)
  const filas: FilaPoblacion[] = useMemo(() => {
    const pts = datos.demandaPuntos.features.filter((f) => !esc.zona || f.properties.ambito === esc.zona)
    const out: FilaPoblacion[] = []
    for (let a = ANIO_BASE; a <= ANIO_FIN; a++) {
      const fila = { anio: a, bebes: 0, ninos: 0, jovenes: 0, adultos: 0, mayores: 0 }
      for (const f of pts) {
        const p = f.properties
        const k = p.tipo === 'futuro' ? (esc.habPorVivienda / esc.habPorViviendaCentral) * llenadoDe(a) * esc.factorFuturo : 1
        fila.bebes += p.g0_2 * k * esc.factorNatalidad
        fila.ninos += (p.g3_5 * esc.factorNatalidad + p.g6_11) * k
        fila.jovenes += p.g12_17 * k
        fila.mayores += p.g65 * k
        fila.adultos += Math.max(0, p.pob - p.g0_2 - p.g3_5 - p.g6_11 - p.g12_17 - p.g65) * k
      }
      out.push(fila)
    }
    return out
  }, [datos, esc, aniosLlenado]) // eslint-disable-line react-hooks/exhaustive-deps

  // dimensión temporal y "ver si aguanta": cálculos más pesados, en diferido para que los deslizadores vayan fluidos
  const escDif = useDeferredValue(esc)
  const anioDif = useDeferredValue(anio)
  const temporal = useMemo(() => {
    const porAnio = []
    for (let a = ANIO_BASE; a <= ANIO_FIN; a++) {
      const r = calcular(s, { ...escDif, llenado: llenadoDe(a), nCentros: 'auto', fijados: [] }, datos.demandaPuntos.features, parcelas, existentes, datos.paradas.features)
      porAnio.push({ anio: a, necesarios: r.centrosNecesarios, mejor: r.propuestas[0] ?? null })
    }
    const hitos: { centro: number; anio: number }[] = []
    let k = 1
    for (const x of porAnio) while (x.necesarios >= k && k <= 8) { hitos.push({ centro: k, anio: x.anio }); k++ }
    const primero = porAnio.find((x) => x.necesarios > 0 && x.mejor)
    const ultimo = porAnio[porAnio.length - 1]
    return { hitos, primero, ultimo, cambia: !!(primero?.mejor && ultimo.mejor && primero.mejor.id !== ultimo.mejor.id) }
  }, [s, escDif, aniosLlenado, datos, parcelas, existentes]) // eslint-disable-line react-hooks/exhaustive-deps
  const hv = datos.demanda?.calibracion.parametros.hab_por_vivienda
  const robustas = useMemo(() => {
    const r = calcular(s, { ...escDif, habPorVivienda: hv?.[0] ?? escDif.habPorVivienda, llenado: llenadoDe(anioDif - 3) }, datos.demandaPuntos.features, parcelas, existentes, datos.paradas.features)
    return new Set(r.propuestas.map((p) => p.id))
  }, [s, escDif, anioDif, aniosLlenado, datos, parcelas, existentes, hv]) // eslint-disable-line react-hooks/exhaustive-deps

  const estadoAmbito = useMemo(() => new Map((datos.demanda?.ambitos ?? []).map((a) => [a.ambito, a])), [datos])
  const zonas = useMemo(() => (datos.demanda?.ambitos ?? []).filter((a) => (a.viviendas ?? 0) >= 150).sort((a, b) => (b.viviendas ?? 0) - (a.viviendas ?? 0)), [datos])

  const capas: CapaMapa[] = useMemo(() => {
    const amb: FeatureCollection = { ...datos.ambitos, features: datos.ambitos.features.map((f) => {
      const a = estadoAmbito.get(String(f.properties?.nombre))
      return { ...f, properties: { ...f.properties, estado: a?.estado ?? 'sin_datos', zona: f.properties?.nombre === esc.zona, poblacion_actual: a?.poblacion_actual ?? null,
        pob_completo: a?.poblacion_completo ? `${n(a.poblacion_completo[0])}–${n(a.poblacion_completo[2])}` : null } }
    }) }
    const fijadas = new Set(esc.fijados.map((f) => f.id))
    const excl = new Set(esc.excluidas)
    const parc: FeatureCollection = { type: 'FeatureCollection', features: parcelas.map((f) => ({ ...f, properties: { ...f.properties,
      clase: fijadas.has(f.properties.ref_catastral) ? 'fijada' : excl.has(f.properties.ref_catastral) ? 'excluida'
        : f.properties.area_m2 >= esc.supMinima && (!esc.soloRedPublica || f.properties.red) ? 'candidata' : 'pequena' } })) }
    const dem: FeatureCollection = { ...datos.demandaPuntos, features: datos.demandaPuntos.features.filter((f) => !esc.zona || f.properties.ambito === esc.zona)
      .map((f) => ({ ...f, properties: { ...f.properties, w: pesoDemanda(f.properties, s, escE) } })) }
    const radio = (lista: { lon: number; lat: number }[]): FeatureCollection<Polygon> => ({ type: 'FeatureCollection',
      features: lista.map((p) => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [circulo(p.lon, p.lat, res.radioM)] } })) })
    const ex: FeatureCollection<Point> = { type: 'FeatureCollection', features: existentes.map((c) => ({ type: 'Feature',
      properties: { nombre: capitalizar(c.nombre), detalle: c.detalle, capacidad: c.capacidad, real: c.capacidadReal }, geometry: { type: 'Point', coordinates: [c.lon, c.lat] } })) }
    return [
      { id: 'ambitos', datos: amb, estilo: { type: 'fill', paint: { 'fill-color': ['match', ['get', 'estado'], ...Object.entries(COLOR_ESTADO).flat(), '#cbd5e1'], 'fill-opacity': ['case', ['get', 'zona'], 0.16, 0.05] } } as CapaMapa['estilo'],
        popup: (p) => `<b>${nombreBarrio(String(p.nombre))}</b><br><small>${p.nombre}</small><br>${p.clase_suelo ?? ''}<br>Viviendas previstas: ${p.viviendas ? n(Number(p.viviendas)) : 'sin datos'}<br>Estado: ${NOMBRE_ESTADO[String(p.estado)]}<br>Población hoy (INE): ${p.poblacion_actual ? n(Number(p.poblacion_actual)) : 'sin datos'}<br>Población al completarse: ${p.pob_completo ?? 'sin datos'}<br><i>Pulsa para estudiar esta zona</i>` },
      { id: 'ambitos-borde', datos: amb, estilo: { type: 'line', paint: { 'line-color': ['case', ['get', 'zona'], '#de0029', ['match', ['get', 'estado'], ...Object.entries(COLOR_ESTADO).flat(), '#94a3b8']], 'line-width': ['case', ['get', 'zona'], 3, 1.4], 'line-dasharray': [3, 2] } } as CapaMapa['estilo'] },
      { id: 'zonas', datos: datos.zonasSalud, visible: verZonas, estilo: { type: 'line', paint: { 'line-color': '#1e7d4f', 'line-width': 2, 'line-dasharray': [1, 2] } },
        popup: (p) => `<b>Zona básica de salud ${p.nombre ?? p.codigo}</b><br>Habitantes (INE 2023): ${n(Number(p.poblacion_2023))}<br>Centros de salud y consultorios: ${p.centros_salud}` },
      { id: 'radios-existentes', datos: radio(existentes), estilo: { type: 'fill', paint: { 'fill-color': '#131313', 'fill-opacity': 0.04 } } },
      { id: 'radios-propuestas', datos: radio(res.propuestas), estilo: { type: 'fill', paint: { 'fill-color': '#de0029', 'fill-opacity': 0.08 } } },
      { id: 'parcelas', datos: parc, estilo: { type: 'fill', paint: { 'fill-color': ['match', ['get', 'clase'], 'candidata', '#2b5c8a', 'fijada', '#de0029', 'excluida', '#595959', '#c4c4c4'], 'fill-opacity': 0.7 } } as CapaMapa['estilo'],
        popup: (p) => `<b>Parcela vacante de equipamiento</b><br>Ref. catastral: ${p.ref_catastral}<br>Superficie: ${n(Number(p.area_m2))} m²<br>Titularidad: ${p.red && p.red !== 'null' ? `suelo público (${p.red})` : 'por confirmar'}<br>Barrio: ${nombreBarrio(p.ambito as string | null)}<br><i>${p.clase === 'pequena' ? 'No cumple los criterios de suelo' : p.clase === 'fijada' ? 'Fijada por ti. Pulsa para soltarla' : 'Pulsa para fijarla como ubicación'}</i>` },
      { id: 'demanda', datos: dem, visible: verDemanda, estilo: { type: 'circle', paint: { 'circle-radius': ['interpolate', ['linear'], ['sqrt', ['get', 'w']], 0, 1, 10, 6, 40, 16], 'circle-color': ['match', ['get', 'tipo'], 'futuro', '#de0029', '#595959'], 'circle-opacity': 0.35, 'circle-stroke-width': 0.5, 'circle-stroke-color': '#fff' } } as CapaMapa['estilo'],
        popup: (p) => `<b>${p.tipo === 'futuro' ? 'Demanda futura' : 'Demanda actual'}</b><br>${p.tipo === 'futuro' ? 'Suelo residencial vacante' : 'Sección censal ' + p.origen}<br>Barrio: ${nombreBarrio(p.ambito as string | null)}<br>Usuarios de ${s.nombre.toLowerCase()}: ${n(Math.round(Number(p.w)))}` },
      { id: 'paradas', datos: datos.paradas, visible: verParadas, estilo: { type: 'circle', paint: { 'circle-radius': 3, 'circle-color': ['match', ['get', 'modo'], 'metro', '#de0029', 'cercanias', '#131313', '#8a8a8a'], 'circle-stroke-width': 1, 'circle-stroke-color': '#fff' } } as CapaMapa['estilo'],
        popup: (p) => `<b>Parada ${capitalizar(String(p.nombre))}</b><br>${String(p.lineas ?? '—').split('; ').join('<br>')}` },
      { id: 'existentes', datos: ex, estilo: { type: 'circle', paint: { 'circle-radius': 5.5, 'circle-color': '#131313', 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' } },
        popup: (p) => `<b>${p.nombre}</b><br>${p.detalle}<br>Capacidad: ${n(Number(p.capacidad))} ${s.unidad}${p.real === true || p.real === 'true' ? '' : ' (supuesta)'}` },
    ]
  }, [datos, esc, escE, s, existentes, res, estadoAmbito, verParadas, verDemanda, verZonas, parcelas])

  const marcadores: Marcador[] = useMemo(() => res.propuestas.map((p) => ({ id: p.id, lon: p.lon, lat: p.lat, texto: String(p.orden), color: p.fijado ? '#b10021' : '#de0029',
    arrastrable: true, titulo: 'Arrástralo para probar otra ubicación' })), [res])

  const alternarParcela = (ref: string) => {
    const par = parcelas.find((f) => f.properties.ref_catastral === ref)
    if (!par) return
    setEsc((e) => e.fijados.some((f) => f.id === ref)
      ? { ...e, fijados: e.fijados.filter((f) => f.id !== ref) }
      : { ...e, fijados: [...e.fijados, { id: ref, lon: par.properties.lon, lat: par.properties.lat, etiqueta: par.properties.ambito ?? 'Parcela fijada' }], excluidas: e.excluidas.filter((x) => x !== ref) })
  }
  const arrastrar = (id: string, lon: number, lat: number) => setEsc((e) => ({
    ...e,
    excluidas: parcelas.some((f) => f.properties.ref_catastral === id) ? [...new Set([...e.excluidas, id])] : e.excluidas,
    fijados: [...e.fijados.filter((f) => f.id !== id), { id: `punto-${Date.now()}`, lon, lat, etiqueta: 'Ubicación elegida a mano' }],
  }))
  const aplicarCifra = (v: string) => {
    setCifra(v)
    const x = Number(v.replace(/\./g, '').replace(',', '.'))
    upd({ demandaFija: v.trim() && Number.isFinite(x) && x > 0 ? x : null })
  }

  const pct = (x: number) => (res.demandaTotal ? Math.round((100 * x) / res.demandaTotal) : 0)
  const unidad = s.unidad === 'plazas' ? 'plazas' : 'usuarios'
  const objetivo = esc.nCentros === 'auto' ? res.centrosNecesarios : esc.nCentros
  const titular = res.propuestas.length
    ? `${res.propuestas.length} ${res.propuestas.length === 1 ? 'centro nuevo' : 'centros nuevos'}`
    : res.sinCubrir === 0 ? 'La oferta actual basta' : 'Ningún centro nuevo viable'
  const zonaTxt = esc.zona ? nombreBarrio(esc.zona) : datos.indice.nombre
  const usoAdecuado = (red: string | null) => !!red && USO_ADECUADO[sid].some((u) => red.endsWith(u))

  const panelResultados = (<>
    <div className="border-b border-linea px-6 pt-6 pb-5">
      <div className="text-xs font-medium tracking-wide text-texto-3 uppercase">{s.nombre} · {zonaTxt} · {anio}</div>
      <div className="mt-1 text-[30px] leading-tight font-semibold tracking-tight">{titular}</div>
      <p className="mt-1 text-sm text-texto-2">{esc.demandaFija != null
        ? <>Con tu cifra: <b className="text-tinta">{n(esc.demandaFija)}</b> {unidad}, repartidos como la población.</>
        : <>Demanda en {anio}: entre <b className="text-tinta">{n(rango[0])}</b> y <b className="text-tinta">{n(rango[1])}</b> {unidad}. En este escenario, {n(res.demandaTotal)} ({n(res.demandaActual)} hoy y {n(res.demandaFutura)} por llegar).</>}</p>
      <div className="mt-4 flex h-3 w-full overflow-hidden bg-gris-2" role="img" aria-label="Cobertura de la demanda">
        <div className="bg-tinta transition-all" style={{ width: `${pct(res.cubiertaExistentes)}%` }} />
        <div className="bg-rojo transition-all" style={{ width: `${pct(res.cubiertaNuevos)}%` }} />
      </div>
      <dl className="mt-2.5 grid grid-cols-3 gap-2 text-xs">
        <div><dt className="flex items-center gap-1.5 text-texto-2"><span className="h-2 w-2 bg-tinta" />Centros actuales</dt><dd className="text-base font-semibold tabular-nums">{pct(res.cubiertaExistentes)} %</dd></div>
        <div><dt className="flex items-center gap-1.5 text-texto-2"><span className="h-2 w-2 bg-rojo" />Centros nuevos</dt><dd className="text-base font-semibold tabular-nums">{pct(res.cubiertaNuevos)} %</dd></div>
        <div><dt className="flex items-center gap-1.5 text-texto-2"><span className="h-2 w-2 bg-gris-2 outline outline-linea" />Sin cubrir</dt><dd className="text-base font-semibold tabular-nums">{pct(res.sinCubrir)} %</dd></div>
      </dl>
      {res.dispersa && <div className="mt-4"><Aviso titulo="Demanda dispersa">Lo que queda sin cubrir no llenaría ni el {Math.round(OCUPACION_MINIMA * 100)} % de un centro nuevo en ninguna parcela. Puede atenderse ampliando centros existentes.</Aviso></div>}
      {!res.dispersa && res.sinCubrir > 0 && res.propuestas.length > 0 && res.propuestas.length >= objetivo && (
        <div className="mt-4"><Aviso>Parte de la demanda queda lejos de las parcelas o supera la capacidad. Prueba con más tiempo a pie, menos superficie mínima o más centros.</Aviso></div>)}
    </div>

    <section className="border-b border-linea px-6 py-5">
      <h3 className="mb-2 font-semibold">Cuándo hace falta cada centro</h3>
      {temporal.hitos.length ? (
        <>
          <ol className="relative ml-1 border-l-2 border-linea">
            {temporal.hitos.map((h) => (
              <li key={h.centro} className="relative pb-2.5 pl-4 last:pb-0 text-sm">
                <span className="absolute top-1 -left-[7px] h-3 w-3 bg-rojo" />
                <b className="tabular-nums">{h.anio === ANIO_BASE ? 'Ya hoy' : h.anio}</b> · {h.centro === 1 ? 'el primer centro nuevo' : `el ${h.centro}.º centro nuevo`}{h.anio === ANIO_BASE ? ' (déficit actual)' : ''}
              </li>
            ))}
          </ol>
          <p className="mt-2 text-xs text-texto-2">Si los barrios nuevos se completan en {aniosLlenado} años. {temporal.cambia
            ? <>La mejor parcela <b className="text-tinta">cambia</b> entre la primera etapa ({temporal.primero?.anio}) y la última ({ANIO_FIN}): conviene reservar las dos.</>
            : temporal.primero ? <>La mejor parcela es la misma en {temporal.primero.anio} y en {ANIO_FIN}.</> : null}</p>
        </>
      ) : <p className="text-sm text-texto-2">Con estos supuestos no hace falta ningún centro nuevo antes de {ANIO_FIN}.</p>}
    </section>

    <section className="border-b border-linea px-6 py-5">
      <h3 className="mb-3 font-semibold">Ubicaciones propuestas</h3>
      {res.propuestas.length === 0 && <p className="text-sm text-texto-2">{res.sinCubrir === 0 ? 'Con estos supuestos, los centros que ya existen cubren toda la demanda.' : 'Ningún centro nuevo tendría suficiente demanda cerca con estos supuestos.'}</p>}
      <ol className="grid gap-3">
        {res.propuestas.map((p) => (
          <li key={p.id} className="border border-linea">
            <div className="flex items-start gap-3 p-3">
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center text-sm font-semibold text-white ${p.fijado ? 'bg-rojo-oscuro' : 'bg-rojo'}`}>{p.orden}</span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{nombreBarrio(p.ambito)}{p.fijado && <span className="ml-2 align-middle text-[11px] font-medium text-rojo">FIJADA</span>}</div>
                <div className="text-xs text-texto-3">{p.ref_catastral ? `Ref. catastral ${p.ref_catastral}` : 'Ubicación elegida a mano'}{p.area_m2 != null ? ` · ${n(p.area_m2)} m²` : ''}</div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
                  <span className={p.red ? 'text-ok' : 'text-texto-3'}>{p.red ? (usoAdecuado(p.red) ? '● Suelo público de uso adecuado' : '● Suelo público') : '○ Titularidad por confirmar'}</span>
                  {!p.fijado && <span className={robustas.has(p.id) ? 'text-ok' : 'text-aviso'}>{robustas.has(p.id) ? '● Aguanta con menos viviendas y retraso' : '● Cambia si hay menos viviendas o retraso'}</span>}
                </div>
              </div>
              <div className="text-right"><div className="font-semibold tabular-nums">{n(p.captada)}</div><div className="text-[11px] text-texto-3">{unidad} · {p.ocupacionPct} %</div></div>
            </div>
            <details className="border-t border-gris-2 text-xs">
              <summary className="cursor-pointer px-3 py-2 text-texto-2 hover:text-tinta">Ficha de la ubicación</summary>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 px-3 pb-3 text-texto-2">
                <dt>Coordenadas</dt><dd className="text-tinta tabular-nums">{p.lat.toFixed(5)}, {p.lon.toFixed(5)}</dd>
                <dt>Superficie</dt><dd className="text-tinta">{p.area_m2 != null ? `${n(p.area_m2)} m²` : '—'}</dd>
                <dt>Titularidad</dt><dd className="text-tinta">{p.red ? `Pública: red del planeamiento (${p.red})` : 'Sin confirmar: no consta como red pública en el planeamiento'}</dd>
                <dt>Personas cubiertas</dt><dd className="text-tinta">{n(p.personasEnRadio)} del grupo de edad a menos de {esc.minutos} min</dd>
                {p.paradaMasCercana && <><dt>Parada más cercana</dt><dd className="text-tinta">{capitalizar(p.paradaMasCercana.nombre)} · {n(p.paradaMasCercana.metros)} m</dd></>}
                <dt>Licitaciones cerca</dt><dd className="text-tinta">sin datos todavía</dd>
                {p.ambito && p.ambito !== nombreBarrio(p.ambito) && <><dt>Ámbito</dt><dd className="text-tinta">{p.ambito}</dd></>}
                {p.alternativas.length > 0 && <><dt>Descartadas</dt><dd className="text-tinta">{p.alternativas.map((a) => <div key={a.ref}>{a.ambito ? nombreBarrio(a.ambito) : a.ref}: {a.motivo}</div>)}</dd></>}
              </dl>
              {p.ref_catastral && !p.fijado && (
                <button className="mx-3 mb-3 text-texto-2 underline underline-offset-2 hover:text-rojo" onClick={() => upd({ excluidas: [...esc.excluidas, p.ref_catastral!] })}>Descartar esta parcela</button>
              )}
            </details>
          </li>
        ))}
      </ol>
      {res.sinCubrirPorAmbito.length > 0 && res.sinCubrir > 0 && (
        <p className="mt-3 text-xs text-texto-2">Sin cubrir, sobre todo en: {res.sinCubrirPorAmbito.slice(0, 3).map((a) => `${a.ambito === 'Fuera de ámbitos' ? 'fuera de los barrios nuevos' : nombreBarrio(a.ambito)} (${n(a.demanda)})`).join(', ')}.</p>
      )}
    </section>

    <section className="border-b border-linea px-6 py-5">
      <h3 className="mb-3 font-semibold">Comparar y exportar</h3>
      <div className="flex flex-wrap gap-2">
        <Boton icono="guardar" onClick={() => setGuardado({ esc: escE, res, servicio: s.nombre, anio })}>Guardar escenario A</Boton>
        <Boton icono="descargar" onClick={() => descargarInforme(res, escE, s, datos)}>Informe</Boton>
        <Boton icono="descargar" onClick={() => descargarGeoJSON(res, s, datos.indice)}>GeoJSON</Boton>
      </div>
      {guardado && (
        <table className="mt-4 w-full text-sm">
          <thead><tr className="border-b border-tinta text-left text-xs text-texto-2"><th className="py-1.5 font-medium"></th><th className="font-medium">Escenario A</th><th className="font-medium">Actual</th></tr></thead>
          <tbody>
            {([
              ['Servicio', guardado.servicio, s.nombre],
              ['Año', String(guardado.anio), String(anio)],
              ['Habitantes por vivienda', dec(guardado.esc.habPorVivienda, 2), dec(esc.habPorVivienda, 2)],
              ['Natalidad', `${Math.round(guardado.esc.factorNatalidad * 100)} %`, `${Math.round(esc.factorNatalidad * 100)} %`],
              ['Demanda', n(guardado.res.demandaTotal), n(res.demandaTotal)],
              ['Centros nuevos', String(guardado.res.propuestas.length), String(res.propuestas.length)],
              ['Sin cubrir', n(guardado.res.sinCubrir), n(res.sinCubrir)],
              ['Ubicaciones que se mantienen', '', `${res.propuestas.filter((p) => guardado.res.propuestas.some((q) => q.id === p.id)).length} de ${res.propuestas.length}`],
            ] as const).map(([k, a, b]) => <tr key={k} className="border-b border-gris-2"><td className="py-1.5 pr-2 text-texto-2">{k}</td><td className="tabular-nums">{a}</td><td className="font-semibold tabular-nums">{b}</td></tr>)}
          </tbody>
        </table>
      )}
    </section>

    {datos.demanda && (
      <section className="px-6 py-5">
        <h3 className="flex items-center gap-2 font-semibold"><Icono nombre="validar" className="h-5 w-5" />¿Acierta el modelo?</h3>
        <p className="mt-1 mb-3 text-xs text-texto-2">Predecimos cada barrio sin mirar sus datos y lo comparamos con su población real ({datos.demanda.prueba_con_el_pasado[0]?.anio}, INE).</p>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-tinta text-left text-xs text-texto-2"><th className="py-1.5 font-medium">Barrio</th><th className="text-right font-medium">Real</th><th className="text-right font-medium">Error modelo</th><th className="text-right font-medium">Regla habitual</th></tr></thead>
          <tbody>{datos.demanda.prueba_con_el_pasado.map((b) => (
            <tr key={b.ambito} className="border-b border-gris-2">
              <td className="py-1.5">{nombreBarrio(b.ambito)}</td><td className="text-right tabular-nums">{n(b.real)}</td>
              <td className="text-right font-semibold tabular-nums">{b.error_pct > 0 ? '+' : ''}{dec(b.error_pct)} %</td>
              <td className="text-right text-texto-3 tabular-nums">{b.error_ingenua_pct > 0 ? '+' : ''}{dec(b.error_ingenua_pct)} %</td>
            </tr>))}
          </tbody>
        </table>
        <p className="mt-4 text-[11px] leading-relaxed text-texto-3">Fuentes: IDEM (planeamiento 2025, suelo vacante 2026), Portal de Datos Abiertos de la Comunidad de Madrid, INE (Atlas de renta por sección), Consorcio de Transportes. Distancias en línea recta.</p>
      </section>
    )}
  </>)

  return (
    <div className="flex h-full min-h-0 flex-col md:grid md:grid-cols-[320px_1fr] xl:grid-cols-[340px_1fr_400px]">
      <aside className="order-2 min-h-0 flex-1 overflow-y-auto border-r border-linea bg-white md:order-1">
        <div className="sticky top-0 z-10 flex border-b border-linea bg-white xl:hidden" role="tablist">
          {(['ajustes', 'resultados'] as const).map((t) => (
            <button key={t} role="tab" aria-selected={pestana === t} onClick={() => setPestana(t)}
              className={`flex-1 border-b-[3px] py-2.5 text-sm font-semibold ${pestana === t ? 'border-rojo' : 'border-transparent text-texto-2'}`}>
              {t === 'ajustes' ? 'Ajustes' : `Resultados · ${titular}`}
            </button>
          ))}
        </div>
        <div className={pestana === 'resultados' ? 'xl:hidden' : 'hidden'}>{panelResultados}</div>
        <div className={pestana === 'resultados' ? 'hidden xl:block' : ''}>
          <Paso num={1} titulo="Zona y servicio">
            <label className="mb-3 block text-sm">
              <span className="text-texto-2">Zona de estudio <span className="text-texto-3">(o pulsa un barrio en el mapa)</span></span>
              <select className="mt-1 w-full border border-tinta bg-white px-2.5 py-2 font-medium" value={esc.zona ?? ''} onChange={(e) => upd({ zona: e.target.value || null, fijados: [], excluidas: [] })}>
                <option value="">Todo {datos.indice.nombre}</option>
                {zonas.map((a) => <option key={a.ambito} value={a.ambito}>{nombreBarrio(a.ambito)} · {n(a.viviendas ?? 0)} viviendas</option>)}
              </select>
            </label>
            <div className="grid">
              {(Object.keys(servicios) as ServicioId[]).map((id) => (
                <button key={id} onClick={() => setSid(id)} aria-pressed={id === sid}
                  className={`flex items-center gap-3 border-l-[3px] px-3 py-2 text-left text-sm transition-colors ${id === sid ? 'border-rojo bg-gris-1 font-semibold' : 'border-transparent text-texto-2 hover:bg-gris-1'}`}>
                  <Icono nombre={id} className="h-5 w-5 shrink-0" />{servicios[id].nombre}
                </button>
              ))}
            </div>
          </Paso>

          <Paso num={2} titulo={`Población de ${zonaTxt}`}>
            <GraficaPoblacion filas={filas} destacados={GRUPOS_SERVICIO[sid]} anio={anio} onAnio={setAnio} />
            <div className="mt-4">
              <Deslizador etiqueta="Año de la previsión" valor={anio} min={ANIO_BASE} max={ANIO_FIN} paso={1} formato={String}
                onChange={setAnio} ayuda={`En ${anio} habrá llegado el ${Math.round(llenadoDe(anio) * 100)} % de la población de los barrios nuevos`} />
              <Deslizador etiqueta="Natalidad" valor={esc.factorNatalidad} min={0.6} max={1.4} paso={0.05} formato={(v) => `${v >= 1 ? '+' : ''}${Math.round((v - 1) * 100)} %`}
                onChange={(v) => upd({ factorNatalidad: v })} ayuda="Más o menos nacimientos que hoy (afecta a 0-5 años)" />
              <Deslizador etiqueta="Llegada de personas" valor={esc.factorFuturo} min={0.5} max={1.5} paso={0.05} formato={(v) => `${v >= 1 ? '+' : ''}${Math.round((v - 1) * 100)} %`}
                onChange={(v) => upd({ factorFuturo: v })} ayuda="Más o menos población nueva de la que prevé el modelo" />
              <label className="block text-sm">
                <span className="text-texto-2">O escribe una cifra concreta de {unidad}</span>
                <div className="mt-1 flex">
                  <input inputMode="numeric" className="h-9 min-w-0 flex-1 border border-tinta px-2.5 tabular-nums" placeholder={`p. ej. ${s.unidad === 'plazas' ? '1.000' : '20.000'}`} value={cifra} onChange={(e) => aplicarCifra(e.target.value)} />
                  {cifra && <button type="button" className="h-9 border border-l-0 border-tinta px-3 text-xs hover:bg-gris-1" onClick={() => aplicarCifra('')}>Usar el modelo</button>}
                </div>
              </label>
            </div>
          </Paso>

          <Paso num={3} titulo="Condiciones del servicio">
            <Deslizador etiqueta="Tiempo máximo a pie" valor={esc.minutos} min={5} max={30} paso={1} formato={(v) => `${v} min`}
              onChange={(v) => upd({ minutos: v })} ayuda={`${n(esc.minutos * 80)} m en línea recta`} />
            <Deslizador etiqueta="Centros nuevos" valor={objetivo} min={0} max={Math.max(10, res.centrosNecesarios)}
              paso={1} formato={(v) => (esc.nCentros === 'auto' ? `${v} · automático` : String(v))} onChange={(v) => upd({ nCentros: v })}
              ayuda={esc.nCentros === 'auto' ? 'Los que hacen falta según la demanda' : undefined} />
            {esc.nCentros !== 'auto' && <button className="-mt-2 mb-1 text-xs text-rojo underline underline-offset-2" onClick={() => upd({ nCentros: 'auto' })}>Volver a automático</button>}
            <details className="group mt-2 border-t border-linea pt-3">
              <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-texto-2 hover:text-tinta">
                <Icono nombre="ajustes" className="h-4 w-4" />Supuestos avanzados<span className="ml-auto text-xs transition-transform group-open:rotate-180">▾</span>
              </summary>
              <div className="mt-4">
                {hv && <Deslizador etiqueta="Habitantes por vivienda nueva" valor={esc.habPorVivienda} min={hv[0]} max={hv[2]} paso={0.01}
                  formato={(v) => dec(v, 2)} onChange={(v) => upd({ habPorVivienda: v })}
                  ayuda={`Medido en barrios nuevos de ${datos.demanda?.calibracion.municipio}: ${dec(hv[0], 2)}–${dec(hv[2], 2)}`} />}
                <Deslizador etiqueta="Años para completar los barrios" valor={aniosLlenado} min={3} max={20} paso={1} formato={(v) => `${v} años`}
                  onChange={setAniosLlenado} ayuda={`Desde ${ANIO_BASE}. Los Molinos tardó más de 8 años en llenarse (INE)`} />
                <Deslizador etiqueta="Tasa de uso" valor={esc.tasaUso} min={s.tasa_uso[0] * 0.5} max={Math.min(1, s.tasa_uso[2] * 1.3)} paso={0.005}
                  formato={(v) => `${dec(v * 100)} %`} onChange={(v) => upd({ tasaUso: v })} ayuda={s.nota_tasa} />
                <Deslizador etiqueta="Capacidad por centro" valor={esc.capacidad} min={Math.round(s.capacidad[0] * 0.5)} max={Math.round(s.capacidad[2] * 1.5)}
                  paso={sid === 'centro_salud' ? 500 : 5} formato={(v) => `${n(v)} ${s.unidad === 'plazas' ? 'plazas' : 'hab.'}`} onChange={(v) => upd({ capacidad: v })} ayuda={`Valor de partida: ${n(s.capacidad[1])} (supuesto)`} />
                <Deslizador etiqueta="Superficie mínima de parcela" valor={esc.supMinima} min={0} max={20000} paso={250} formato={(v) => `${n(v)} m²`}
                  onChange={(v) => upd({ supMinima: v })} ayuda={`${n(res.candidatas)} parcelas cumplen los criterios`} />
                <Interruptor activo={esc.soloRedPublica} onChange={(v) => upd({ soloRedPublica: v })}>Solo suelo público (red del planeamiento)</Interruptor>
                <Interruptor activo={esc.contarExistentes} onChange={(v) => upd({ contarExistentes: v })}>Descontar los {existentes.length} centros existentes</Interruptor>
              </div>
            </details>
          </Paso>

          <Paso num={4} titulo="Capas del mapa">
            <Interruptor activo={verDemanda} onChange={setVerDemanda}>Dónde está la demanda</Interruptor>
            <Interruptor activo={verParadas} onChange={setVerParadas}>Paradas de transporte</Interruptor>
            <Interruptor activo={verZonas} onChange={setVerZonas}>Zonas básicas de salud</Interruptor>
          </Paso>
          {(esc.fijados.length > 0 || esc.excluidas.length > 0) && (
            <div className="px-5 py-4"><Boton className="w-full" onClick={() => upd({ fijados: [], excluidas: [] })}>Deshacer ubicaciones fijadas y descartadas</Boton></div>
          )}
          <p className="px-5 py-4 text-xs leading-relaxed text-texto-3">Consejo: pulsa una parcela azul para fijarla como ubicación, o arrastra un marcador rojo para probar otro sitio.</p>
        </div>
      </aside>

      <div className="relative order-1 h-[45vh] shrink-0 md:order-2 md:h-auto">
        <Mapa bbox={datos.encuadre} capas={capas} marcadores={marcadores}
          onClickCapa={(capa, p) => {
            if (capa === 'parcelas' && p.clase !== 'pequena') alternarParcela(String(p.ref_catastral))
            else if (capa === 'ambitos' && estadoAmbito.has(String(p.nombre))) upd({ zona: String(p.nombre), fijados: [], excluidas: [] })
          }}
          onArrastrar={arrastrar} />
        <Leyenda>
          <Ley color="#131313" t={`${s.nombre} existente`} redondo />
          <Ley color="#de0029" t="Ubicación propuesta" />
          <Ley color="#2b5c8a" t="Suelo vacante de equipamiento" />
          <Ley color="#de0029" t="Barrio por construir" borde />
          <Ley color="#131313" t="Barrio en desarrollo" borde />
          {verDemanda && <Ley color="#595959" t="Demanda hoy · en rojo, la futura" redondo />}
        </Leyenda>
        {esc.zona && (
          <button type="button" className="absolute right-12 bottom-8 border border-tinta bg-white px-3 py-1.5 text-xs shadow-sm hover:bg-gris-1" onClick={() => upd({ zona: null, fijados: [], excluidas: [] })}>
            Ver todo {datos.indice.nombre}
          </button>
        )}
      </div>

      <aside className="hidden min-h-0 overflow-y-auto border-l border-linea bg-white xl:order-3 xl:block">{panelResultados}</aside>
    </div>
  )
}

function Ley({ color, t, redondo, borde }: { color: string; t: string; redondo?: boolean; borde?: boolean }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className={`inline-block h-3 w-3 ${redondo ? 'rounded-full' : ''}`} style={borde ? { border: `1.5px dashed ${color}` } : { background: color }} />{t}
    </div>
  )
}
