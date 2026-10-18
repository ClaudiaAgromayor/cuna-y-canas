import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Feature, FeatureCollection, MultiPolygon, Point, Polygon } from 'geojson'
import Mapa, { type CapaMapa, type Marcador } from './Mapa'
import { calcular, circulo, existentesDe, type Escenario } from './algoritmo'
import { cargarMunicipio } from './datos'
import type { DatosMunicipio, MunicipioIndice, Parcela, Servicio, ServicioId } from './tipos'
import { capitalizar, n, nombreBarrio } from './ui'
import { Icono } from './iconos'

const SERVICIOS: ServicioId[] = ['colegio', 'escuela_infantil', 'centro_salud', 'centro_dia', 'residencia']
const ANIO = 2035

function escenario(s: Servicio, d: DatosMunicipio, llenado: number): Escenario {
  const hv = d.demanda?.calibracion.parametros.hab_por_vivienda ?? [2, 2, 2]
  return { habPorVivienda: hv[1], habPorViviendaCentral: hv[1], llenado, tasaUso: s.tasa_uso[1], capacidad: s.capacidad[1],
    minutos: s.minutos_andando, supMinima: s.sup_min_m2, nCentros: 'auto', contarExistentes: true, fijados: [], excluidas: [],
    factorNatalidad: 1, factorFuturo: 1, demandaFija: null, zona: null, soloRedPublica: false }
}

/**
 * Vista de solo lectura del plano de planificación, para quien busca casa: dónde podrían ir los centros nuevos
 * según el mismo cálculo que usa el técnico, sin poder cambiar supuestos ni ubicaciones.
 */
export default function PlanoPublico({ indice, servicios, cerrar }: { indice: MunicipioIndice; servicios: Record<ServicioId, Servicio>; cerrar: () => void }) {
  const [datos, setDatos] = useState<DatosMunicipio | null>(null)
  const [error, setError] = useState('')
  const [sid, setSid] = useState<ServicioId>('colegio')
  useEffect(() => { cargarMunicipio(indice).then(setDatos).catch((e) => setError(e.message)) }, [indice])
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrar() }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [cerrar])

  const s = servicios[sid]
  const parcelas = useMemo(() => (datos?.parcelas.features ?? []) as Feature<Polygon | MultiPolygon, Parcela>[], [datos])
  const existentes = useMemo(() => (datos ? existentesDe(s, { centros_educativos: datos.educativos, centros_sanitarios: datos.sanitarios, centros_sociales: datos.sociales }, s.capacidad[1]) : []), [datos, s])
  const res = useMemo(() => (datos ? calcular(s, escenario(s, datos, 1), datos.demandaPuntos.features, parcelas, existentes, datos.paradas.features) : null), [datos, s, parcelas, existentes])
  const hoy = useMemo(() => (datos ? calcular(s, escenario(s, datos, 0), datos.demandaPuntos.features, parcelas, existentes, datos.paradas.features) : null), [datos, s, parcelas, existentes])

  const lugarDe = (p: { ambito: string | null; paradaMasCercana?: { nombre: string } | null }) =>
    p.ambito && p.ambito !== 'Fuera de ámbitos' ? nombreBarrio(p.ambito) : p.paradaMasCercana ? `Cerca de ${capitalizar(p.paradaMasCercana.nombre)}` : 'En la ciudad ya construida'

  const capas: CapaMapa[] = useMemo(() => {
    if (!datos || !res) return []
    const radio = (lista: { lon: number; lat: number }[]): FeatureCollection<Polygon> => ({ type: 'FeatureCollection',
      features: lista.map((p) => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [circulo(p.lon, p.lat, res.radioM)] } })) })
    const ex: FeatureCollection<Point> = { type: 'FeatureCollection', features: existentes.map((c) => ({ type: 'Feature',
      properties: { nombre: capitalizar(c.nombre), detalle: c.detalle }, geometry: { type: 'Point', coordinates: [c.lon, c.lat] } })) }
    const libres: FeatureCollection = { type: 'FeatureCollection', features: parcelas.filter((f) => f.properties.area_m2 >= s.sup_min_m2) }
    return [
      { id: 'barrios', datos: datos.ambitos, estilo: { type: 'line', paint: { 'line-color': '#8a8a8a', 'line-width': 1.2, 'line-dasharray': [3, 2] } } },
      { id: 'radios', datos: radio(res.propuestas), estilo: { type: 'fill', paint: { 'fill-color': '#de0029', 'fill-opacity': 0.1 } } },
      { id: 'libres', datos: libres, estilo: { type: 'fill', paint: { 'fill-color': '#2b5c8a', 'fill-opacity': 0.55 } },
        popup: (p) => `<b>Suelo vacante de equipamiento</b><br>${n(Number(p.area_m2))} m² · cabría un centro` },
      { id: 'existentes', datos: ex, estilo: { type: 'circle', paint: { 'circle-radius': 5.5, 'circle-color': '#131313', 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' } },
        popup: (p) => `<b>${p.nombre}</b><br>${p.detalle}` },
    ]
  }, [datos, res, existentes, parcelas, s])
  const marcadores: Marcador[] = useMemo(() => (res?.propuestas ?? []).map((p) => ({ id: p.id, lon: p.lon, lat: p.lat, texto: String(p.orden), color: '#de0029', titulo: lugarDe(p) })), [res]) // eslint-disable-line react-hooks/exhaustive-deps

  const unidad = s.unidad === 'plazas' ? 'plazas' : 'usuarios'
  const frase = !res ? '' : res.propuestas.length
    ? `Con la población prevista para ${ANIO}, ${indice.nombre} necesitaría ${res.propuestas.length === 1 ? 'un centro nuevo' : `${res.propuestas.length} centros nuevos`} de ${s.nombre.toLowerCase()}${hoy && hoy.propuestas.length ? `; ${hoy.propuestas.length === 1 ? 'uno haría falta ya hoy' : `${hoy.propuestas.length} harían falta ya hoy`}` : ''}. En el mapa, en rojo, dónde podrían ir sobre suelo público vacante.`
    : res.sinCubrir === 0 ? `Los centros que ya hay en ${indice.nombre} bastan para la demanda prevista en ${ANIO}.`
    : `No hace falta ningún centro nuevo de ${s.nombre.toLowerCase()}: los actuales atienden la mayor parte y lo que falta está repartido, así que se cubriría ampliando los que ya hay.`

  return createPortal(
    <div className="no-imprimir fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={`Dónde podrían ir los nuevos centros en ${indice.nombre}`} onClick={cerrar}>
      <div className="flex h-full max-h-[900px] w-full max-w-[1400px] flex-col overflow-hidden bg-white shadow-xl md:flex-row" onClick={(e) => e.stopPropagation()}>
        <div className="flex max-h-[45%] min-h-0 shrink-0 flex-col overflow-y-auto border-b border-linea md:max-h-none md:w-[400px] md:border-r md:border-b-0">
          <div className="flex items-start gap-3 border-b border-linea px-5 py-4">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium tracking-wide text-texto-3 uppercase">{indice.nombre} · {ANIO}</div>
              <h2 className="text-xl leading-tight font-semibold">Dónde podrían ir los nuevos centros</h2>
            </div>
            <button type="button" onClick={cerrar} aria-label="Cerrar" className="border border-linea px-2.5 py-1 text-lg leading-none hover:border-tinta">×</button>
          </div>
          <div className="flex flex-wrap gap-1.5 px-5 pt-4">
            {SERVICIOS.map((id) => (
              <button key={id} type="button" aria-pressed={sid === id} onClick={() => setSid(id)}
                className={`border px-2.5 py-1.5 text-xs ${sid === id ? 'border-tinta bg-tinta text-white' : 'border-linea hover:border-tinta'}`}>{servicios[id].nombre}</button>
            ))}
          </div>
          {error && <p className="px-5 py-4 text-sm text-rojo">{error}</p>}
          {!datos && !error && <p className="px-5 py-4 text-sm text-texto-2">Cargando el plano…</p>}
          {res && (
            <div className="px-5 py-4">
              <p className="border-l-[3px] border-rojo bg-gris-1 px-3 py-2 text-[15px] leading-snug">{frase}</p>
              {res.propuestas.length > 0 && (
                <ol className="mt-4 grid gap-2">
                  {res.propuestas.map((p) => (
                    <li key={p.id} className="flex items-start gap-3 text-sm">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center bg-rojo text-xs font-semibold text-white">{p.orden}</span>
                      <span className="min-w-0 flex-1"><b>{lugarDe(p)}</b><span className="block text-xs text-texto-3">{p.area_m2 != null ? `${n(p.area_m2)} m² · ` : ''}atendería a unos {n(p.captada)} {unidad}</span></span>
                    </li>
                  ))}
                </ol>
              )}
              <div className="mt-5 flex items-start gap-2 bg-gris-1 px-3 py-2.5 text-xs leading-relaxed text-texto-2">
                <Icono nombre="aviso" className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Vista de solo lectura, con los supuestos por defecto. Es una estimación orientativa con el mismo modelo que usan los técnicos, que pueden cambiar supuestos y ubicaciones en su herramienta.</span>
              </div>
              <ul className="mt-4 grid gap-1 text-xs text-texto-2">
                <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-tinta" />Centro que ya existe</li>
                <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 bg-rojo" />Dónde podría ir uno nuevo</li>
                <li className="flex items-center gap-2"><span className="h-2.5 w-2.5" style={{ background: '#2b5c8a' }} />Suelo vacante de equipamiento</li>
              </ul>
            </div>
          )}
        </div>
        <div className="relative min-h-[300px] flex-1">
          {datos && <Mapa bbox={datos.encuadre} capas={capas} marcadores={marcadores} />}
        </div>
      </div>
    </div>,
    document.body,
  )
}
