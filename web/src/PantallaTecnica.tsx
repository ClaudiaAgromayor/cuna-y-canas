import { useEffect, useMemo, useState } from 'react'
import type { FeatureCollection, Point, Polygon } from 'geojson'
import Mapa, { type CapaMapa, type Marcador } from './Mapa'
import { calcular, circulo, existentesDe, OCUPACION_MINIMA, pesoDemanda, type Escenario, type Resultado } from './algoritmo'
import type { DatosMunicipio, Servicio, ServicioId } from './tipos'
import { Aviso, Boton, capitalizar, dec, Deslizador, Interruptor, n, nombreBarrio, Paso } from './ui'
import { Icono } from './iconos'
import { descargarGeoJSON, descargarInforme } from './exportar'

interface Props { datos: DatosMunicipio; servicios: Record<ServicioId, Servicio> }

const COLOR_ESTADO: Record<string, string> = { habitado: '#8a8a8a', en_desarrollo: '#131313', futuro: '#de0029', sin_datos: '#c4c4c4' }
const NOMBRE_ESTADO: Record<string, string> = { habitado: 'Habitado', en_desarrollo: 'En desarrollo', futuro: 'Por construir', sin_datos: 'Sin datos' }

function escenarioInicial(s: Servicio, d: DatosMunicipio): Escenario {
  const hv = d.demanda?.calibracion.parametros.hab_por_vivienda ?? [2, 2, 2]
  return { habPorVivienda: hv[1], habPorViviendaCentral: hv[1], llenado: 1, tasaUso: s.tasa_uso[1], capacidad: s.capacidad[1],
    minutos: s.minutos_andando, supMinima: s.sup_min_m2, nCentros: 'auto', contarExistentes: true, fijados: [], excluidas: [] }
}

export default function PantallaTecnica({ datos, servicios }: Props) {
  const [sid, setSid] = useState<ServicioId>('escuela_infantil')
  const s = servicios[sid]
  const [esc, setEsc] = useState<Escenario>(() => escenarioInicial(s, datos))
  const [guardado, setGuardado] = useState<{ esc: Escenario; res: Resultado; servicio: string } | null>(null)
  const [verParadas, setVerParadas] = useState(false)
  const [verDemanda, setVerDemanda] = useState(true)
  const [verZonas, setVerZonas] = useState(false)

  // cambiar de servicio o de municipio reinicia los supuestos a los de partida
  useEffect(() => { setEsc(escenarioInicial(servicios[sid], datos)); setVerZonas(sid === 'centro_salud') }, [sid, datos, servicios])
  useEffect(() => { setGuardado(null) }, [datos])

  const upd = (p: Partial<Escenario>) => setEsc((e) => ({ ...e, ...p }))
  const capasPuntos = useMemo(() => ({ centros_educativos: datos.educativos, centros_sanitarios: datos.sanitarios, centros_sociales: datos.sociales }), [datos])
  const existentes = useMemo(() => existentesDe(s, capasPuntos, esc.capacidad), [s, capasPuntos, esc.capacidad])
  const res = useMemo(() => calcular(s, esc, datos.demandaPuntos.features, datos.parcelas.features, existentes, datos.paradas.features),
    [s, esc, datos, existentes])

  // rango de demanda con los supuestos extremos (siempre se enseña un rango, no una cifra única)
  const rango = useMemo(() => {
    const hv = datos.demanda?.calibracion.parametros.hab_por_vivienda ?? [esc.habPorVivienda, esc.habPorVivienda, esc.habPorVivienda]
    const tot = (h: number, t: number) => datos.demandaPuntos.features.reduce((a, f) => a + pesoDemanda(f.properties, s, { ...esc, habPorVivienda: h, tasaUso: t }), 0)
    return [Math.round(tot(hv[0], s.tasa_uso[0])), Math.round(tot(hv[2], s.tasa_uso[2]))]
  }, [datos, s, esc])

  const estadoAmbito = useMemo(() => new Map((datos.demanda?.ambitos ?? []).map((a) => [a.ambito, a])), [datos])

  const capas: CapaMapa[] = useMemo(() => {
    const amb: FeatureCollection = { ...datos.ambitos, features: datos.ambitos.features.map((f) => {
      const a = estadoAmbito.get(String(f.properties?.nombre))
      return { ...f, properties: { ...f.properties, estado: a?.estado ?? 'sin_datos', poblacion_actual: a?.poblacion_actual ?? null,
        pob_completo: a?.poblacion_completo ? `${n(a.poblacion_completo[0])}–${n(a.poblacion_completo[2])}` : null } }
    }) }
    const fijadas = new Set(esc.fijados.map((f) => f.id))
    const excl = new Set(esc.excluidas)
    const parc: FeatureCollection = { ...datos.parcelas, features: datos.parcelas.features.map((f) => ({ ...f, properties: { ...f.properties,
      clase: fijadas.has(f.properties.ref_catastral) ? 'fijada' : excl.has(f.properties.ref_catastral) ? 'excluida' : f.properties.area_m2 >= esc.supMinima ? 'candidata' : 'pequena' } })) }
    const dem: FeatureCollection = { ...datos.demandaPuntos, features: datos.demandaPuntos.features.map((f) => ({ ...f, properties: { ...f.properties, w: pesoDemanda(f.properties, s, esc) } })) }
    const radio = (lista: { lon: number; lat: number }[]): FeatureCollection<Polygon> => ({ type: 'FeatureCollection',
      features: lista.map((p) => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [circulo(p.lon, p.lat, res.radioM)] } })) })
    const ex: FeatureCollection<Point> = { type: 'FeatureCollection', features: existentes.map((c) => ({ type: 'Feature',
      properties: { nombre: c.nombre, detalle: c.detalle, capacidad: c.capacidad, real: c.capacidadReal }, geometry: { type: 'Point', coordinates: [c.lon, c.lat] } })) }
    return [
      { id: 'ambitos', datos: amb, estilo: { type: 'fill', paint: { 'fill-color': ['match', ['get', 'estado'], ...Object.entries(COLOR_ESTADO).flat(), '#cbd5e1'], 'fill-opacity': 0.06 } } as CapaMapa['estilo'],
        popup: (p) => `<b>${nombreBarrio(String(p.nombre))}</b><br><small>${p.nombre}</small><br>${p.clase_suelo ?? ''}<br>Viviendas previstas: ${p.viviendas ? n(Number(p.viviendas)) : 'sin datos'}<br>Estado: ${NOMBRE_ESTADO[String(p.estado)]}<br>Población hoy (INE): ${p.poblacion_actual ? n(Number(p.poblacion_actual)) : 'sin datos'}<br>Población al completarse: ${p.pob_completo ?? 'sin datos'}` },
      { id: 'ambitos-borde', datos: amb, estilo: { type: 'line', paint: { 'line-color': ['match', ['get', 'estado'], ...Object.entries(COLOR_ESTADO).flat(), '#94a3b8'], 'line-width': 1.4, 'line-dasharray': [3, 2] } } as CapaMapa['estilo'] },
      { id: 'zonas', datos: datos.zonasSalud, visible: verZonas, estilo: { type: 'line', paint: { 'line-color': '#1e7d4f', 'line-width': 2, 'line-dasharray': [1, 2] } },
        popup: (p) => `<b>Zona básica de salud ${p.nombre ?? p.codigo}</b><br>Habitantes (INE 2023): ${n(Number(p.poblacion_2023))}<br>Centros de salud: ${p.centros_salud}` },
      { id: 'radios-existentes', datos: radio(existentes), estilo: { type: 'fill', paint: { 'fill-color': '#131313', 'fill-opacity': 0.04 } } },
      { id: 'radios-propuestas', datos: radio(res.propuestas), estilo: { type: 'fill', paint: { 'fill-color': '#de0029', 'fill-opacity': 0.08 } } },
      { id: 'parcelas', datos: parc, estilo: { type: 'fill', paint: { 'fill-color': ['match', ['get', 'clase'], 'candidata', '#2b5c8a', 'fijada', '#de0029', 'excluida', '#595959', '#c4c4c4'], 'fill-opacity': 0.7 } } as CapaMapa['estilo'],
        popup: (p) => `<b>Parcela vacante de equipamiento</b><br>Ref. catastral: ${p.ref_catastral}<br>Superficie: ${n(Number(p.area_m2))} m²<br>Ámbito: ${p.ambito ?? '—'}<br><i>${p.clase === 'pequena' ? 'Más pequeña que la superficie mínima' : p.clase === 'fijada' ? 'Fijada por ti. Clic para soltarla' : 'Clic para fijarla como ubicación'}</i>` },
      { id: 'demanda', datos: dem, visible: verDemanda, estilo: { type: 'circle', paint: { 'circle-radius': ['interpolate', ['linear'], ['sqrt', ['get', 'w']], 0, 1, 10, 6, 40, 16], 'circle-color': ['match', ['get', 'tipo'], 'futuro', '#de0029', '#595959'], 'circle-opacity': 0.35, 'circle-stroke-width': 0.5, 'circle-stroke-color': '#fff' } } as CapaMapa['estilo'],
        popup: (p) => `<b>${p.tipo === 'futuro' ? 'Demanda futura' : 'Demanda actual'}</b><br>${p.tipo === 'futuro' ? 'Suelo residencial vacante' : 'Sección censal ' + p.origen}<br>Ámbito: ${p.ambito ?? '—'}<br>Usuarios de ${s.nombre.toLowerCase()}: ${n(Math.round(Number(p.w)))}` },
      { id: 'paradas', datos: datos.paradas, visible: verParadas, estilo: { type: 'circle', paint: { 'circle-radius': 3, 'circle-color': ['match', ['get', 'modo'], 'metro', '#de0029', 'cercanias', '#131313', '#8a8a8a'], 'circle-stroke-width': 1, 'circle-stroke-color': '#fff' } } as CapaMapa['estilo'],
        popup: (p) => `<b>Parada ${p.nombre}</b><br>${String(p.lineas ?? '—').split('; ').join('<br>')}` },
      { id: 'existentes', datos: ex, estilo: { type: 'circle', paint: { 'circle-radius': 5.5, 'circle-color': '#131313', 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' } },
        popup: (p) => `<b>${p.nombre}</b><br>${p.detalle}<br>Capacidad: ${n(Number(p.capacidad))} ${s.unidad}${p.real === true || p.real === 'true' ? '' : ' (supuesta)'}` },
    ]
  }, [datos, esc, s, existentes, res, estadoAmbito, verParadas, verDemanda, verZonas])

  const marcadores: Marcador[] = res.propuestas.map((p) => ({ id: p.id, lon: p.lon, lat: p.lat, texto: String(p.orden), color: p.fijado ? '#b10021' : '#de0029',
    arrastrable: true, titulo: 'Arrástralo para probar otra ubicación' }))

  const alternarParcela = (ref: string) => {
    const par = datos.parcelas.features.find((f) => f.properties.ref_catastral === ref)
    if (!par) return
    setEsc((e) => e.fijados.some((f) => f.id === ref)
      ? { ...e, fijados: e.fijados.filter((f) => f.id !== ref) }
      : { ...e, fijados: [...e.fijados, { id: ref, lon: par.properties.lon, lat: par.properties.lat, etiqueta: par.properties.ambito ?? 'Parcela fijada' }], excluidas: e.excluidas.filter((x) => x !== ref) })
  }
  const arrastrar = (id: string, lon: number, lat: number) => setEsc((e) => ({
    ...e,
    excluidas: datos.parcelas.features.some((f) => f.properties.ref_catastral === id) ? [...new Set([...e.excluidas, id])] : e.excluidas,
    fijados: [...e.fijados.filter((f) => f.id !== id), { id: `punto-${Date.now()}`, lon, lat, etiqueta: 'Ubicación elegida a mano' }],
  }))

  const hv = datos.demanda?.calibracion.parametros.hab_por_vivienda
  const pct = (x: number) => (res.demandaTotal ? Math.round((100 * x) / res.demandaTotal) : 0)

  const unidad = s.unidad === 'plazas' ? 'plazas' : 'usuarios'
  const objetivo = esc.nCentros === 'auto' ? res.centrosNecesarios : esc.nCentros
  const titular = res.propuestas.length
    ? `${res.propuestas.length} ${res.propuestas.length === 1 ? 'centro nuevo' : 'centros nuevos'}`
    : res.sinCubrir === 0 ? 'La oferta actual basta' : 'Ningún centro nuevo viable'

  return (
    <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[320px_1fr_400px]">
      {/* controles */}
      <aside className="min-h-0 overflow-y-auto border-r border-linea bg-white">
        <Paso num={1} titulo="Servicio">
          <div className="grid">
            {(Object.keys(servicios) as ServicioId[]).map((id) => (
              <button key={id} onClick={() => setSid(id)} aria-pressed={id === sid}
                className={`flex items-center gap-3 border-l-[3px] px-3 py-2.5 text-left text-sm transition-colors ${id === sid ? 'border-rojo bg-gris-1 font-semibold' : 'border-transparent text-texto-2 hover:bg-gris-1'}`}>
                <Icono nombre={id} className="h-5 w-5 shrink-0" />{servicios[id].nombre}
              </button>
            ))}
          </div>
        </Paso>
        <Paso num={2} titulo="Escenario">
          <Deslizador etiqueta="Barrios nuevos ya habitados" valor={esc.llenado} min={0} max={1} paso={0.05} formato={(v) => `${Math.round(v * 100)} %`}
            onChange={(v) => upd({ llenado: v })} ayuda="0 % = la población de hoy · 100 % = todos los barrios completos" />
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
              <Deslizador etiqueta="Tasa de uso" valor={esc.tasaUso} min={s.tasa_uso[0] * 0.5} max={Math.min(1, s.tasa_uso[2] * 1.3)} paso={0.005}
                formato={(v) => `${dec(v * 100)} %`} onChange={(v) => upd({ tasaUso: v })} ayuda={s.nota_tasa} />
              <Deslizador etiqueta="Capacidad por centro" valor={esc.capacidad} min={Math.round(s.capacidad[0] * 0.5)} max={Math.round(s.capacidad[2] * 1.5)}
                paso={sid === 'centro_salud' ? 500 : 5} formato={(v) => `${n(v)} ${s.unidad === 'plazas' ? 'plazas' : 'hab.'}`} onChange={(v) => upd({ capacidad: v })} ayuda={`Valor de partida: ${n(s.capacidad[1])} (supuesto)`} />
              <Deslizador etiqueta="Superficie mínima de parcela" valor={esc.supMinima} min={0} max={20000} paso={250} formato={(v) => `${n(v)} m²`}
                onChange={(v) => upd({ supMinima: v })} ayuda={`${n(res.candidatas)} parcelas la cumplen`} />
              <Interruptor activo={esc.contarExistentes} onChange={(v) => upd({ contarExistentes: v })}>Descontar los {existentes.length} centros existentes</Interruptor>
            </div>
          </details>
        </Paso>
        <Paso num={3} titulo="Capas del mapa">
          <Interruptor activo={verDemanda} onChange={setVerDemanda}>Dónde está la demanda</Interruptor>
          <Interruptor activo={verParadas} onChange={setVerParadas}>Paradas de transporte</Interruptor>
          <Interruptor activo={verZonas} onChange={setVerZonas}>Zonas básicas de salud</Interruptor>
        </Paso>
        {(esc.fijados.length > 0 || esc.excluidas.length > 0) && (
          <div className="px-5 py-4"><Boton className="w-full" onClick={() => upd({ fijados: [], excluidas: [] })}>Deshacer ubicaciones fijadas y descartadas</Boton></div>
        )}
        <p className="px-5 py-4 text-xs leading-relaxed text-texto-3">Consejo: pulsa una parcela azul para fijarla como ubicación, o arrastra un marcador rojo para probar otro sitio.</p>
      </aside>

      {/* mapa */}
      <div className="relative min-h-[420px]">
        <Mapa bbox={datos.encuadre} capas={capas} marcadores={marcadores}
          onClickCapa={(capa, p) => { if (capa === 'parcelas' && p.clase !== 'pequena') alternarParcela(String(p.ref_catastral)) }}
          onArrastrar={arrastrar} />
        <div className="pointer-events-none absolute top-3 left-3 bg-white/95 px-3 py-2.5 text-xs shadow-sm">
          <Ley color="#131313" t={`${s.nombre} existente`} redondo />
          <Ley color="#de0029" t="Ubicación propuesta" />
          <Ley color="#2b5c8a" t="Suelo vacante de equipamiento" />
          <Ley color="#de0029" t="Barrio por construir" borde />
          <Ley color="#131313" t="Barrio en desarrollo" borde />
          {verDemanda && <Ley color="#595959" t="Demanda hoy · en rojo, la futura" redondo />}
        </div>
      </div>

      {/* resultados */}
      <aside className="min-h-0 overflow-y-auto border-l border-linea bg-white">
        <div className="border-b border-linea px-6 pt-6 pb-5">
          <div className="text-xs font-medium tracking-wide text-texto-3 uppercase">{s.nombre} · {datos.indice.nombre}</div>
          <div className="mt-1 text-[30px] leading-tight font-semibold tracking-tight">{titular}</div>
          <p className="mt-1 text-sm text-texto-2">Demanda estimada: entre <b className="text-tinta">{n(rango[0])}</b> y <b className="text-tinta">{n(rango[1])}</b> {unidad}. En este escenario, {n(res.demandaTotal)} ({n(res.demandaActual)} hoy y {n(res.demandaFutura)} por llegar).</p>
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
                  </div>
                  <div className="text-right"><div className="font-semibold tabular-nums">{n(p.captada)}</div><div className="text-[11px] text-texto-3">{unidad} · {p.ocupacionPct} %</div></div>
                </div>
                <details className="border-t border-gris-2 text-xs">
                  <summary className="cursor-pointer px-3 py-2 text-texto-2 hover:text-tinta">Detalle y alternativas</summary>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 px-3 pb-3 text-texto-2">
                    <dt>Coordenadas</dt><dd className="text-tinta tabular-nums">{p.lat.toFixed(5)}, {p.lon.toFixed(5)}</dd>
                    <dt>A menos de {esc.minutos} min</dt><dd className="text-tinta">{n(p.personasEnRadio)} personas del grupo de edad</dd>
                    {p.paradaMasCercana && <><dt>Parada más cercana</dt><dd className="text-tinta">{capitalizar(p.paradaMasCercana.nombre)} · {n(p.paradaMasCercana.metros)} m</dd></>}
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
            <Boton icono="guardar" onClick={() => setGuardado({ esc, res, servicio: s.nombre })}>Guardar escenario A</Boton>
            <Boton icono="descargar" onClick={() => descargarInforme(res, esc, s, datos)}>Informe</Boton>
            <Boton icono="descargar" onClick={() => descargarGeoJSON(res, s, datos.indice)}>GeoJSON</Boton>
          </div>
          {guardado && (
            <table className="mt-4 w-full text-sm">
              <thead><tr className="border-b border-tinta text-left text-xs text-texto-2"><th className="py-1.5 font-medium"></th><th className="font-medium">Escenario A</th><th className="font-medium">Actual</th></tr></thead>
              <tbody>
                {([
                  ['Servicio', guardado.servicio, s.nombre],
                  ['Habitantes por vivienda', dec(guardado.esc.habPorVivienda, 2), dec(esc.habPorVivienda, 2)],
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
      </aside>
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
