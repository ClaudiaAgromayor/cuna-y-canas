import { useEffect, useMemo, useState } from 'react'
import type { FeatureCollection } from 'geojson'
import Mapa, { type CapaMapa } from './Mapa'
import { CRITERIOS, enFrase, ESCALA, formatoCriterio, lista, posicion, puntuar, SITUACIONES, TAMANOS, TOP, ZONAS, type Puntuado, type ResumenMunicipio } from './criterios'
import FichaMunicipio from './FichaMunicipio'
import type { MunicipioIndice, Rango, Servicio, ServicioId } from './tipos'
import { Icono } from './iconos'
import { Aviso, Boton, dec, n, Leyenda } from './ui'

interface Modelo { municipio: string; parametros: { hab_por_vivienda: Rango; pct_menores18: Rango; pct_mayores65: Rango }; reparto_menores: Record<string, number> }
interface Resumen { generado: string; modelo: Modelo | null; municipios: ResumenMunicipio[] }

interface Props {
  servicios: Record<ServicioId, Servicio>
  detallados: MunicipioIndice[]
  situacionesIniciales?: string[]
  selInicial?: string
  verBarrios: (cod: string) => void
  planificar: (cod: string) => void
}

const BASE = import.meta.env.BASE_URL
const GRUPOS = [...new Set(CRITERIOS.map((c) => c.grupo))]
const ENCUADRE_CM: [number, number, number, number] = [-4.58, 39.88, -3.05, 41.17] // toda la Comunidad de Madrid
const BORDE_TONO: Record<string, string> = { neutro: 'border-texto-3', ok: 'border-ok', aviso: 'border-aviso', rojo: 'border-rojo' }

export interface Futuro { pob: Rango; items: { s: Servicio; plazas: number[]; centros: number[] }[] }
export interface Sitio { colegios: number; grandes: number; titulo: string; tono: string }

export default function PantallaMunicipios({ servicios, detallados, verBarrios, planificar, situacionesIniciales, selInicial }: Props) {
  const [resumen, setResumen] = useState<Resumen | null>(null)
  const [limites, setLimites] = useState<FeatureCollection | null>(null)
  const [situaciones, setSituaciones] = useState<string[]>(situacionesIniciales ?? ['bebe'])
  const [criterios, setCriterios] = useState<string[]>(() => [...new Set(SITUACIONES.filter((s) => (situacionesIniciales ?? ['bebe']).includes(s.id)).flatMap((s) => s.criterios))])
  const [tamanos, setTamanos] = useState<string[]>([])
  const [distMax, setDistMax] = useState(90)
  const [sel, setSel] = useState<string | null>(selInicial ?? null)
  const [comparar, setComparar] = useState<string[]>([])
  const [verComparacion, setVerComparacion] = useState(false)
  const [abiertos, setAbiertos] = useState<string[]>([])

  useEffect(() => {
    fetch(`${BASE}municipios_resumen.json`).then((r) => r.json()).then(setResumen)
    fetch(`${BASE}municipios.geojson`).then((r) => r.json()).then(setLimites)
  }, [])

  const filtrados = useMemo(() => (resumen?.municipios ?? []).filter((m) =>
    m.dist_madrid_km <= distMax && (!tamanos.length || tamanos.some((t) => { const x = TAMANOS.find((y) => y.id === t)!; return m.poblacion >= x.min && m.poblacion < x.max }))),
  [resumen, distMax, tamanos])
  const ranking = useMemo(() => puntuar(filtrados, criterios), [filtrados, criterios])
  // los que cumplen los filtros pero no tienen datos de lo elegido: en gris y fuera del ranking
  const sinDatos = useMemo(() => new Set(filtrados.filter((m) => !ranking.some((r) => r.m.cod_ine === m.cod_ine)).map((m) => m.cod_ine)), [filtrados, ranking])
  const porCod = useMemo(() => {
    let puesto = 0, previo = NaN
    return new Map(ranking.map((r, i) => {
      const redondo = Math.round(r.puntos)
      if (redondo !== previo) { puesto = i + 1; previo = redondo }
      return [r.m.cod_ine, { ...r, puesto }]
    }))
  }, [ranking])
  const elegido = sel ? porCod.get(sel) ?? (resumen ? { m: resumen.municipios.find((x) => x.cod_ine === sel)!, puntos: NaN, detalle: {}, puesto: 0 } : null) : null

  const alternarSituacion = (id: string) => {
    const s = SITUACIONES.find((x) => x.id === id)!
    if (situaciones.includes(id)) {
      const resto = SITUACIONES.filter((x) => x.id !== id && situaciones.includes(x.id)).flatMap((x) => x.criterios)
      setSituaciones(situaciones.filter((x) => x !== id))
      setCriterios(criterios.filter((c) => !s.criterios.includes(c) || resto.includes(c)))
    } else {
      setSituaciones([...situaciones, id])
      setCriterios([...new Set([...criterios, ...s.criterios])])
    }
  }
  const alternarCriterio = (id: string) => setCriterios((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]))

  const capas: CapaMapa[] = useMemo(() => {
    if (!limites) return []
    const datos: FeatureCollection = { ...limites, features: limites.features.map((f) => {
      const r = porCod.get(String(f.properties?.cod_ine))
      return { ...f, properties: { ...f.properties, puntos: r ? Math.round(r.puntos) : -1, puesto: r?.puesto ?? null, top: !!r && r.puesto <= TOP } }
    }) }
    const selFc: FeatureCollection = { ...limites, features: limites.features.filter((f) => f.properties?.cod_ine === sel || comparar.includes(String(f.properties?.cod_ine))) }
    return [
      { id: 'm-relleno', datos, estilo: { type: 'fill', paint: {
        'fill-color': ['case', ['<', ['get', 'puntos'], 0], '#f3f3f3', ['!', ['get', 'top']], '#e4dcdd',
          ['interpolate', ['linear'], ['get', 'puesto'], 1, ESCALA[5], 5, ESCALA[4], 10, ESCALA[3], 15, ESCALA[2]]],
        'fill-opacity': 0.9 } } as CapaMapa['estilo'],
        popup: (p) => Number(p.puntos) < 0 ? `<b>${p.nombre}</b><br><span style="color:#595959">${sinDatos.has(String(p.cod_ine)) ? 'Sin datos para lo que has marcado' : 'No cumple los filtros de tamaño o distancia'}</span>`
          : `<b>${p.nombre}</b><br>Puesto ${p.puesto} de ${ranking.length} · coincidencia ${p.puntos} %` },
      { id: 'm-borde', datos, estilo: { type: 'line', paint: { 'line-color': '#ffffff', 'line-width': 0.8 } } },
      { id: 'm-sel', datos: selFc, estilo: { type: 'line', paint: { 'line-color': '#131313', 'line-width': 2.5 } } },
    ]
  }, [limites, porCod, sel, comparar, ranking.length, sinDatos])

  if (!resumen || !limites) return <div className="m-5 text-sm text-texto-2">Cargando los 179 municipios…</div>

  const detallado = (cod: string) => detallados.some((d) => d.cod_ine === cod)

  return (
    <div className="flex h-full min-h-0 flex-col md:grid md:grid-cols-[minmax(340px,460px)_1fr]">
      <div className="relative order-1 h-[42vh] shrink-0 md:order-2 md:h-auto">
        <Mapa bbox={ENCUADRE_CM} capas={capas} onClickCapa={(capa, p) => { if (capa === 'm-relleno') { setSel(String(p.cod_ine)); setVerComparacion(false) } }} />
        <Leyenda>
          <div className="mb-1 font-medium">Los {TOP} que mejor encajan</div>
          <div className="flex">{[...ESCALA].slice(2).reverse().map((c) => <span key={c} className="h-2.5 w-9" style={{ background: c }} />)}</div>
          <div className="flex justify-between text-texto-3"><span>1.º</span><span>15.º</span></div>
          <div className="mt-1 flex items-center gap-1.5 text-texto-3"><span className="h-2.5 w-4" style={{ background: '#e4dcdd' }} />resto</div>
          {sinDatos.size > 0 && <div className="mt-0.5 flex items-center gap-1.5 text-texto-3"><span className="h-2.5 w-4 border border-linea" style={{ background: '#f3f3f3' }} />sin datos</div>}
        </Leyenda>
      </div>

      <aside className="order-2 min-h-0 flex-1 overflow-y-auto border-r border-linea md:order-1">
        {verComparacion && comparar.length > 0 ? (
          <Comparacion lista={comparar.map((c) => porCod.get(c) ?? { m: resumen.municipios.find((x) => x.cod_ine === c)!, puntos: NaN, detalle: {}, puesto: 0 })}
            criterios={criterios} volver={() => setVerComparacion(false)} quitar={(c) => setComparar(comparar.filter((x) => x !== c))} />
        ) : elegido ? (
          <Ficha r={elegido} total={ranking.length} criterios={criterios} modelo={resumen.modelo} servicios={servicios}
            situaciones={situaciones} limites={limites} puestos={porCod}
            volver={() => setSel(null)} comparando={comparar.includes(elegido.m.cod_ine)}
            alternarComparar={() => setComparar((c) => c.includes(elegido.m.cod_ine) ? c.filter((x) => x !== elegido.m.cod_ine) : [...c, elegido.m.cod_ine].slice(-3))}
            detallado={detallado(elegido.m.cod_ine)} verBarrios={() => verBarrios(elegido.m.cod_ine)} planificar={() => planificar(elegido.m.cod_ine)} />
        ) : (
          <>
            <div className="px-6 pt-7 pb-2">
              <h1 className="text-[28px] leading-tight font-semibold tracking-tight">¿Dónde vivir en la<br />Comunidad de Madrid?</h1>
              <p className="mt-2 text-sm text-texto-2">Dinos qué necesitas y ordenamos los {resumen.municipios.length} municipios según lo bien que encajan, con datos oficiales y abiertos.</p>
            </div>

            <section className="px-6 pt-4">
              <h2 className="mb-2 text-sm font-semibold">1. Tu situación</h2>
              <div className="grid grid-cols-2 gap-1.5">
                {SITUACIONES.map((s) => {
                  const on = situaciones.includes(s.id)
                  return (
                    <button key={s.id} type="button" aria-pressed={on} onClick={() => alternarSituacion(s.id)}
                      className={`flex items-center gap-2 border px-2.5 py-2 text-left text-[13px] leading-tight transition-colors ${on ? 'border-tinta bg-tinta text-white' : 'border-linea bg-white text-tinta hover:border-tinta'}`}>
                      <Icono nombre={s.icono} className="h-5 w-5 shrink-0" />{s.texto}
                    </button>
                  )
                })}
              </div>
              {situaciones.length > 0 && (
                <div className="mt-2.5 border-l-2 border-rojo bg-gris-1 px-3 py-2 text-xs leading-relaxed text-texto-2">
                  {SITUACIONES.filter((s) => situaciones.includes(s.id)).map((s) => (
                    <p key={s.id}><b className="text-tinta">{s.texto}:</b> {s.nota ? `${s.nota} ` : ''}Miramos {lista(s.criterios.map((id) => enFrase(CRITERIOS.find((c) => c.id === id)!.texto)))}.</p>
                  ))}
                  <p className="mt-1 text-texto-3">Puedes quitar o añadir criterios en el punto 2.</p>
                </div>
              )}
            </section>

            <section className="px-6 pt-5">
              <h2 className="mb-1 text-sm font-semibold">2. Qué es importante para ti <span className="font-normal text-texto-3">({criterios.length} elegidos)</span></h2>
              <div className="border-t border-linea">
                {GRUPOS.map((g) => {
                  const cs = CRITERIOS.filter((c) => c.grupo === g)
                  const nSel = cs.filter((c) => criterios.includes(c.id)).length
                  const abierto = abiertos.includes(g)
                  return (
                    <div key={g} className="border-b border-linea">
                      <button type="button" className="flex w-full items-center gap-2 py-2.5 text-left text-sm" onClick={() => setAbiertos((a) => abierto ? a.filter((x) => x !== g) : [...a, g])} aria-expanded={abierto}>
                        <span className="font-medium">{g}</span>
                        {nSel > 0 && <span className="bg-rojo px-1.5 text-[11px] font-semibold text-white">{nSel}</span>}
                        <span className="ml-auto text-xs text-texto-3">{abierto ? '▴' : '▾'}</span>
                      </button>
                      {abierto && (
                        <div className="grid gap-0.5 pb-2.5">
                          {cs.map((c) => (
                            <label key={c.id} className="flex cursor-pointer items-start gap-2.5 py-1 text-sm" title={c.explica}>
                              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-tinta" checked={criterios.includes(c.id)} onChange={() => alternarCriterio(c.id)} />
                              <span><span className="text-tinta">{c.texto}</span><span className="block text-xs text-texto-2">{c.explica}</span><span className="block text-[11px] text-texto-3">Fuente: {c.fuente}</span></span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>

            <section className="px-6 pt-5">
              <h2 className="mb-2 text-sm font-semibold">3. Tamaño y distancia</h2>
              <div className="flex flex-wrap gap-1.5">
                {TAMANOS.map((t) => {
                  const on = tamanos.includes(t.id)
                  return <button key={t.id} type="button" aria-pressed={on} onClick={() => setTamanos((x) => on ? x.filter((y) => y !== t.id) : [...x, t.id])}
                    className={`border px-2.5 py-1.5 text-xs ${on ? 'border-tinta bg-tinta text-white' : 'border-linea hover:border-tinta'}`}>{t.texto} hab.</button>
                })}
              </div>
              <label className="mt-3 block text-sm">
                <div className="flex justify-between"><span className="text-texto-2">A menos de</span><b className="tabular-nums">{distMax >= 90 ? 'cualquier distancia' : `${distMax} km de Madrid`}</b></div>
                <input type="range" min={10} max={90} step={5} value={distMax} style={{ ['--p' as string]: `${((distMax - 10) / 80) * 100}%` }} onChange={(e) => setDistMax(Number(e.target.value))} aria-label="Distancia máxima a Madrid" />
              </label>
            </section>

            <section className="px-6 pt-5 pb-8">
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="text-sm font-semibold">Los que mejor encajan</h2>
                <span className="text-xs text-texto-3">{ranking.length} municipios cumplen los filtros{sinDatos.size ? ` · ${sinDatos.size} sin datos` : ''}</span>
              </div>
              {criterios.length === 0 && <Aviso tono="info">Marca al menos un criterio para ordenar los municipios.</Aviso>}
              <ol className="border-t border-tinta">
                {criterios.length > 0 && ranking.slice(0, TOP).map((r, i) => {
                  const puesto = porCod.get(r.m.cod_ine)?.puesto ?? i + 1
                  const empate = ranking.some((o, j) => j !== i && Math.round(o.puntos) === Math.round(r.puntos))
                  return (
                  <li key={r.m.cod_ine}>
                    <button type="button" onClick={() => setSel(r.m.cod_ine)} className="flex w-full items-center gap-3 border-b border-linea py-2.5 text-left hover:bg-gris-1">
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center text-sm font-semibold ${puesto <= 3 ? 'bg-rojo text-white' : 'border border-tinta'}`} title={empate ? 'Empatado con otro municipio' : undefined}>{puesto}{empate ? '=' : ''}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{r.m.nombre}</span>
                        <span className="block text-xs text-texto-3">{n(r.m.poblacion)} hab. · {dec(r.m.dist_madrid_km, 0)} km de Madrid{r.m.lineas_tren_madrid.length ? ' · tren o Metro a Madrid' : ''}</span>
                      </span>
                      <span className="w-20 shrink-0">
                        <span className="block text-right text-sm font-semibold tabular-nums">{Math.round(r.puntos)} %</span>
                        <span className="mt-0.5 block h-1.5 bg-gris-2"><span className="block h-full bg-rojo" style={{ width: `${r.puntos}%` }} /></span>
                      </span>
                    </button>
                  </li>
                )})}
              </ol>
              <p className="mt-3 text-xs text-texto-3">Pulsa un municipio para ver su ficha.</p>
              <details className="mt-3 border-t border-linea pt-2 text-xs leading-relaxed text-texto-2">
                <summary className="cursor-pointer py-1 font-medium text-tinta">Cómo ordenamos y de dónde salen los datos</summary>
                <ul className="mt-1 grid list-disc gap-1.5 pl-4">
                  <li><b className="text-tinta">Nada es una opinión.</b> Cada criterio es un dato oficial y abierto (debajo de cada uno pone su fuente), descargado por API del Portal de Datos Abiertos de la Comunidad, la IDEM, el INE y el Consorcio Regional de Transportes.</li>
                  <li><b className="text-tinta">Comparamos con los demás municipios.</b> En cada criterio, el mejor de los que cumplen tus filtros saca 100 y el peor, 0. La coincidencia es la media de lo que has marcado: todos los criterios pesan igual.</li>
                  <li><b className="text-tinta">Servicios: suficientes y donde elegir.</b> En colegios, centros de salud, residencias… contamos si hay bastantes para su población (60 %) y cuántos hay para elegir (40 %). Así un pueblo de 300 habitantes con una escuela no gana a una ciudad con veinte.</li>
                  <li><b className="text-tinta">Trabajo en Madrid</b> no premia estar cerca, sino llegar bien: si hay tren o Metro hasta Madrid, cuántos autobuses van directos y la zona del abono, que marca lo que cuesta cada mes.</li>
                </ul>
              </details>
            </section>
          </>
        )}
        {comparar.length > 0 && !verComparacion && (
          <div className="sticky bottom-0 flex items-center gap-2 border-t border-tinta bg-white px-6 py-3 text-sm">
            <span className="min-w-0 flex-1 truncate">Comparar: <b>{comparar.map((c) => resumen.municipios.find((m) => m.cod_ine === c)?.nombre).join(', ')}</b></span>
            <Boton primario onClick={() => setVerComparacion(true)}>Ver comparación</Boton>
          </div>
        )}
      </aside>
    </div>
  )
}

/* ---------- ficha de un municipio ---------- */

function Ficha({ r, total, criterios, modelo, servicios, situaciones, limites, puestos, volver, comparando, alternarComparar, detallado, verBarrios, planificar }: {
  r: Puntuado & { puesto: number }; total: number; criterios: string[]; modelo: Modelo | null; servicios: Record<ServicioId, Servicio>
  situaciones: string[]; limites: FeatureCollection; puestos: Map<string, { puesto: number }>
  volver: () => void; comparando: boolean; alternarComparar: () => void; detallado: boolean; verBarrios: () => void; planificar: () => void
}) {
  const m = r.m
  const cs = CRITERIOS.filter((c) => criterios.includes(c.id))
  // lo que viene: población que traerán las viviendas previstas y servicios que harán falta (rangos)
  const futuro = useMemo((): Futuro | null => {
    if (!modelo || !m.viviendas_previstas) return null
    const hv = modelo.parametros.hab_por_vivienda, men = modelo.parametros.pct_menores18, may = modelo.parametros.pct_mayores65, rep = modelo.reparto_menores
    const pob = hv.map((h) => m.viviendas_previstas! * h) as Rango
    const grupo = (k: string) => pob.map((p, i) => (k === 'g65' ? (p * may[i]) / 100 : k === 'pob' ? p : (p * men[i] * (rep[k] ?? 0)) / 100))
    const necesita = (sid: ServicioId) => {
      const s = servicios[sid]
      const usuarios = [0, 2].map((i) => s.grupo.reduce((t, g) => t + grupo(g)[i], 0) * s.tasa_uso[i])
      return { s, plazas: usuarios.map(Math.round), centros: usuarios.map((u) => u / s.capacidad[1]) }
    }
    return { pob, items: (['escuela_infantil', 'colegio', 'centro_salud', 'residencia'] as ServicioId[]).map(necesita) }
  }, [m, modelo, servicios])

  const tiles: { icono: string; valor: string; texto: string }[] = [
    { icono: 'escuela_infantil', valor: String(m.esc_infantil_publica + m.esc_infantil_privada), texto: `escuelas infantiles (${m.esc_infantil_publica} públicas)` },
    { icono: 'colegio', valor: String(m.colegio_publico + m.colegio_concertado + m.colegio_privado), texto: `colegios: ${m.colegio_publico} públicos, ${m.colegio_concertado} concertados, ${m.colegio_privado} privados` },
    { icono: 'colegio', valor: String(m.instituto_publico), texto: 'institutos públicos' },
    { icono: 'centro_salud', valor: String(m.atencion_primaria), texto: `centros de salud y consultorios` },
    { icono: 'centro_salud', valor: `${dec(m.hospital_km, 0)} km`, texto: 'al hospital más cercano' },
    { icono: 'centro_salud', valor: String(m.farmacias), texto: 'farmacias' },
    { icono: 'residencia', valor: n(m.plazas_residencia), texto: `plazas en ${m.residencias} residencias` },
    { icono: 'centro_dia', valor: String(m.centros_dia + m.hogares_mayores), texto: 'centros de día y hogares de mayores' },
    { icono: 'tren', valor: m.lineas_tren_madrid.length ? 'Sí' : 'No', texto: m.lineas_tren_madrid.length ? `tren o Metro hasta Madrid: ${m.lineas_tren_madrid.slice(0, 5).join(', ')}${m.lineas_tren_madrid.length > 5 ? '…' : ''}` : 'hay tren ni Metro hasta Madrid' },
    { icono: 'autobus', valor: String(m.bus_madrid), texto: `líneas de autobús directas a Madrid (${m.lineas_interurbanas} interurbanas en total)` },
    { icono: 'colegio', valor: String(m.bibliotecas), texto: 'bibliotecas' },
    { icono: 'arbol', valor: m.zonas_verdes_m2_hab != null ? `${n(m.zonas_verdes_m2_hab)} m²` : '—', texto: `de parques por habitante${m.zonas_verdes_fuente ? ` (${m.zonas_verdes_fuente})` : ' (sin datos)'}` },
  ]
  // ¿hay sitio para lo que viene? colegios que harían falta frente a parcelas vacantes donde cabe uno
  const sitio: Sitio | null = futuro && m.suelo_detallado ? (() => {
    const colegios = futuro.items.find((x) => x.s.nombre.startsWith('Colegio'))?.centros[1] ?? 0
    const grandes = m.parcelas_equip_8000 ?? 0
    const [titulo, tono] = colegios < 0.5 ? ['Poca presión sobre el suelo', 'neutro'] : grandes >= colegios * 2 ? ['Hay suelo de sobra', 'ok'] : grandes >= colegios ? ['Suelo justo', 'aviso'] : ['Puede faltar suelo', 'rojo']
    return { colegios, grandes, titulo, tono }
  })() : null
  const imprimir = () => {
    document.body.dataset.imprimir = 'municipio'
    const limpiar = () => { delete document.body.dataset.imprimir; window.removeEventListener('afterprint', limpiar) }
    window.addEventListener('afterprint', limpiar)
    setTimeout(() => window.print(), 100)
  }

  return (
    <div className="ficha">
      <div className="flex items-center gap-2 border-b border-linea px-6 py-3 text-sm no-imprimir">
        <button type="button" onClick={volver} className="text-texto-2 hover:text-tinta">← Volver a la lista</button>
      </div>
      {m.foto && (
        <figure className="relative">
          <img src={m.foto} alt={`Vista de ${m.nombre}`} className="h-44 w-full object-cover" loading="lazy" onError={(e) => { (e.currentTarget.parentElement as HTMLElement).style.display = 'none' }} />
          <figcaption className="absolute right-0 bottom-0 bg-black/55 px-2 py-0.5 text-[10px] text-white">
            Foto: <a className="underline" href={m.foto_pagina ?? '#'} target="_blank" rel="noreferrer">Wikimedia Commons</a> (licencia libre; autoría en el enlace)
          </figcaption>
        </figure>
      )}
      <div className="px-6 pt-5 pb-5">
        <div className="text-xs font-medium tracking-wide text-texto-3 uppercase">Municipio · código INE 28{m.cod_ine}</div>
        <h1 className="mt-1 text-[30px] leading-tight font-semibold tracking-tight">{m.nombre}</h1>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-texto-2">
          <span><b className="text-tinta">{n(m.poblacion)}</b> habitantes ({m.anio_poblacion})</span>
          {m.crecimiento_pct != null && <span><b className="text-tinta">{m.crecimiento_pct > 0 ? '+' : ''}{dec(m.crecimiento_pct)} %</b> desde {m.periodo_crecimiento.split('-')[0]}</span>}
          <span><b className="text-tinta">{dec(m.dist_madrid_km, 0)} km</b> de Madrid</span>
          {m.corona && <span>abono <b className="text-tinta">zona {m.corona}</b></span>}
        </div>
        {Number.isFinite(r.puntos) && criterios.length > 0 && (
          <div className="mt-4 flex items-center gap-3 bg-gris-1 px-4 py-3">
            <div className="text-[28px] font-semibold tabular-nums">{Math.round(r.puntos)} %</div>
            <div className="text-sm text-texto-2">de coincidencia con lo que buscas · puesto <b className="text-tinta">{r.puesto}</b> de {total}</div>
          </div>
        )}
        <div className="no-imprimir mt-4 flex flex-wrap gap-2">
          {detallado && <Boton primario icono="ubicacion" onClick={verBarrios}>Ver el mapa de {m.nombre}</Boton>}
          {!detallado && <span className="self-center text-xs text-texto-3">Mapa detallado en preparación</span>}
          <Boton icono="capas" onClick={alternarComparar}>{comparando ? 'Quitar de la comparación' : 'Comparar'}</Boton>
          <Boton icono="descargar" onClick={imprimir}>Ficha PDF</Boton>
        </div>
      </div>

      {cs.length > 0 && Number.isFinite(r.puntos) && (
        <section className="border-t border-linea px-6 py-5">
          <h2 className="mb-3 font-semibold">Cómo queda en lo que te importa</h2>
          <ul className="grid gap-2.5">
            {cs.map((c) => {
              const p = r.detalle[c.id]
              return (
                <li key={c.id} className="text-sm">
                  <div className="flex items-baseline justify-between gap-2"><span>{c.texto}</span><span className="text-xs text-texto-3">{formatoCriterio(c, m)}</span></div>
                  <div className="mt-1 h-1.5 bg-gris-2"><div className="h-full bg-tinta" style={{ width: `${p ?? 0}%` }} /></div>
                  <div className="mt-0.5 text-xs text-texto-3">{posicion(p)} · <span title={c.explica}>{c.fuente}</span></div>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <section className="border-t border-linea px-6 py-5">
        <h2 className="mb-3 font-semibold">Lo que hay</h2>
        <div className="grid grid-cols-2 gap-px bg-linea sm:grid-cols-3">
          {tiles.map((t) => (
            <div key={t.texto} className="bg-white p-3">
              <Icono nombre={t.icono} className="h-5 w-5 text-texto-2" />
              <div className="mt-1.5 text-xl font-semibold tabular-nums">{t.valor}</div>
              <div className="text-xs leading-snug text-texto-2">{t.texto}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-linea px-6 py-5">
        <h2 className="mb-2 font-semibold">Lo que viene</h2>
        {futuro ? (
          <>
            <p className="text-sm text-texto-2">El planeamiento prevé <b className="text-tinta">{n(m.viviendas_previstas!)} viviendas</b> en {m.ambitos_desarrollo} {m.ambitos_desarrollo === 1 ? 'ámbito' : 'ámbitos'} de desarrollo. Cuando estén habitadas pueden llegar <b className="text-tinta">entre {n(futuro.pob[0])} y {n(futuro.pob[2])} personas</b> más.</p>
            <ul className="mt-3 border-t border-gris-2">
              {futuro.items.map(({ s, plazas, centros }) => (
                <li key={s.nombre} className="flex items-baseline justify-between gap-3 border-b border-gris-2 py-2 text-sm">
                  <span>{s.nombre}</span>
                  <span className="text-right text-texto-2">{s.unidad === 'plazas'
                    ? (plazas[1] < 1 ? 'no hace falta ampliar' : <>entre <b className="text-tinta">{n(plazas[0])}</b> y <b className="text-tinta">{n(plazas[1])}</b> plazas más</>)
                    : (centros[1] < 0.15 ? 'basta con los actuales' : <>el equivalente a <b className="text-tinta">{dec(centros[1], 1)}</b> {centros[1] < 1.5 ? 'centro' : 'centros'}</>)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-texto-3">Estimación con el modelo calibrado en barrios nuevos de {modelo?.municipio}. Es lo que harán falta por la población nueva, además de lo que ya existe.</p>
            {sitio && (
              <div className={`mt-4 border-l-[3px] bg-gris-1 px-4 py-3 text-sm ${BORDE_TONO[sitio.tono]}`}>
                <div className="font-semibold">¿Hay sitio para lo que viene? {sitio.titulo}</div>
                <p className="mt-1 text-texto-2">Tiene <b className="text-tinta">{n(m.parcelas_equip ?? 0)} parcelas vacantes</b> de equipamiento ({n((m.suelo_equip_m2 ?? 0) / 10000)} ha); en <b className="text-tinta">{n(sitio.grandes)}</b> cabría un colegio (8.000 m² o más) y en {n(m.parcelas_equip_1500 ?? 0)} una escuela infantil o un centro de día. La población nueva necesitaría el equivalente a {dec(sitio.colegios, 1)} {sitio.colegios < 1.5 ? 'colegio' : 'colegios'}.</p>
                <p className="mt-1 text-xs text-texto-3">Fuente: IDEM, suelo vacante y ocupado 2026.</p>
              </div>
            )}
          </>
        ) : <p className="text-sm text-texto-2">{m.planeamiento_en_idem ? 'El planeamiento vigente no prevé nuevas viviendas en ámbitos de desarrollo.' : 'El planeamiento de este municipio no está en la base refundida de la IDEM.'}</p>}
        {detallado && <button type="button" className="no-imprimir mt-3 text-sm font-medium text-rojo underline underline-offset-2" onClick={planificar}>Ver dónde podrían ir los nuevos centros →</button>}
      </section>

      <section className="border-t border-linea px-6 py-5 text-sm">
        <h2 className="mb-2 font-semibold">Su gente</h2>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-texto-2">
          <span>Menores de 15 años</span><b className="text-right text-tinta">{dec(m.pct_menores15)} %</b>
          <span>65 años o más</span><b className="text-right text-tinta">{dec(m.pct_mayores65)} %</b>
          <span>Nacimientos ({m.anio_nacidos})</span><b className="text-right text-tinta">{m.nacidos != null ? n(m.nacidos) : 'sin datos'}</b>
          <span>Renta disponible por habitante</span><b className="text-right text-tinta">{m.renta_per_capita != null ? `${n(m.renta_per_capita)} €` : 'sin datos'}</b>
          <span>Paro registrado</span><b className="text-right text-tinta">{m.paro_por_100 != null ? `${dec(m.paro_por_100)} por cada 100 hab.` : 'sin datos'}</b>
          <span>Densidad</span><b className="text-right text-tinta">{n(m.densidad)} hab./km²</b>
        </div>
      </section>
      <p className="border-t border-linea px-6 py-4 text-xs leading-relaxed text-texto-3">Fuentes: Portal de Datos Abiertos de la Comunidad de Madrid (padrón, nacimientos, centros educativos, sanitarios y sociales, farmacias, bibliotecas, renta y paro), IDEM (límites, planeamiento 2025) y Consorcio Regional de Transportes. Distancias en línea recta.</p>
      <FichaMunicipio r={r} total={total} criterios={cs} situaciones={SITUACIONES.filter((s) => situaciones.includes(s.id)).map((s) => s.texto)}
        tiles={tiles} futuro={futuro} sitio={sitio} modelo={modelo?.municipio ?? null} limites={limites} puestos={puestos} />
    </div>
  )
}

/* ---------- comparación lado a lado ---------- */

function Comparacion({ lista, criterios, volver, quitar }: { lista: (Puntuado & { puesto?: number })[]; criterios: string[]; volver: () => void; quitar: (c: string) => void }) {
  const filas: [string, (m: ResumenMunicipio) => number | null, (v: number) => string, boolean][] = [
    ['Habitantes', (m) => m.poblacion, n, true],
    ['Crecimiento (%)', (m) => m.crecimiento_pct, (v) => dec(v), true],
    ['Distancia a Madrid (km)', (m) => m.dist_madrid_km, (v) => dec(v, 0), false],
    ['Escuelas infantiles públicas', (m) => m.esc_infantil_publica, n, true],
    ['Colegios públicos', (m) => m.colegio_publico, n, true],
    ['Colegios concertados', (m) => m.colegio_concertado, n, true],
    ['Institutos públicos', (m) => m.instituto_publico, n, true],
    ['Centros de salud y consultorios', (m) => m.atencion_primaria, n, true],
    ['Hospital más cercano (km)', (m) => m.hospital_km, (v) => dec(v, 0), false],
    ['Farmacias', (m) => m.farmacias, n, true],
    ['Plazas de residencia por 100 mayores', (m) => m.plazas_residencia_100may, (v) => dec(v), true],
    ['Líneas de tren o Metro hasta Madrid', (m) => m.lineas_tren_madrid.length, n, true],
    ['Autobuses directos a Madrid', (m) => m.bus_madrid, n, true],
    ['Zona del abono', (m) => (m.corona ? ZONAS.indexOf(m.corona) : null), (v) => ZONAS[v], false],
    ['Zonas verdes (m²/hab.)', (m) => m.zonas_verdes_m2_hab, n, true],
    ['Viviendas previstas', (m) => m.viviendas_previstas, n, true],
    ['Renta por habitante (€)', (m) => m.renta_per_capita, n, true],
  ]
  return (
    <div>
      <div className="border-b border-linea px-6 py-3 text-sm"><button type="button" onClick={volver} className="text-texto-2 hover:text-tinta">← Volver</button></div>
      <div className="px-6 py-5">
        <h1 className="text-[26px] font-semibold tracking-tight">Comparación</h1>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-tinta text-left">
                <th className="py-2 pr-3 font-medium text-texto-2"></th>
                {lista.map((r) => (
                  <th key={r.m.cod_ine} className="py-2 pr-3 align-bottom font-semibold">
                    {r.m.nombre}
                    {criterios.length > 0 && Number.isFinite(r.puntos) && <div className="text-xs font-normal text-texto-3">{Math.round(r.puntos)} % coincidencia</div>}
                    <button type="button" className="text-xs font-normal text-texto-3 underline" onClick={() => quitar(r.m.cod_ine)}>quitar</button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map(([t, f, fmt, mas]) => {
                const vs = lista.map((r) => f(r.m))
                const validos = vs.filter((v): v is number => v != null)
                const mejor = validos.length > 1 ? (mas ? Math.max(...validos) : Math.min(...validos)) : null
                return (
                  <tr key={t} className="border-b border-gris-2">
                    <td className="py-1.5 pr-3 text-texto-2">{t}</td>
                    {vs.map((v, i) => <td key={i} className={`py-1.5 pr-3 tabular-nums ${v != null && v === mejor ? 'font-semibold text-rojo' : ''}`}>{v == null ? '—' : fmt(v)}</td>)}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-texto-3">En rojo, el mejor valor de cada fila.</p>
      </div>
    </div>
  )
}
