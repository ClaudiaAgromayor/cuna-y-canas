import { useEffect, useMemo, useState } from 'react'
import type { ResumenMunicipio } from './criterios'
import type { Rango, Servicio, ServicioId } from './tipos'
import { Icono, Logo } from './iconos'
import { dec, n } from './ui'

interface Modelo { municipio: string; parametros: { hab_por_vivienda: Rango; pct_menores18: Rango; pct_mayores65: Rango }; reparto_menores: Record<string, number> }
interface Resumen { modelo: Modelo | null; municipios: ResumenMunicipio[] }

export type Destino =
  | { a: 'municipios'; situaciones?: string[]; sel?: string }
  | { a: 'ciudadana'; cod: string; barrio?: string }
  | { a: 'tecnica'; cod: string; servicio?: ServicioId; zona?: string }

interface Props { servicios: Record<ServicioId, Servicio>; ir: (d: Destino) => void; tecnico: boolean }

const BASE = import.meta.env.BASE_URL

/** Plazas que hará falta por la población que traerán las viviendas previstas (rango del modelo calibrado). */
function necesidades(viviendas: number, modelo: Modelo, servicios: Record<ServicioId, Servicio>) {
  const hv = modelo.parametros.hab_por_vivienda, men = modelo.parametros.pct_menores18, may = modelo.parametros.pct_mayores65, rep = modelo.reparto_menores
  const grupo = (k: string, i: number) => {
    const p = viviendas * hv[i]
    return k === 'pob' ? p : k === 'g65' ? (p * may[i]) / 100 : (p * men[i] * (rep[k] ?? 0)) / 100
  }
  const usuarios = (sid: ServicioId, i: number) => servicios[sid].grupo.reduce((t, g) => t + grupo(g, i), 0) * servicios[sid].tasa_uso[i]
  return {
    personas: [viviendas * hv[0], viviendas * hv[2]],
    escuela: [usuarios('escuela_infantil', 0), usuarios('escuela_infantil', 2)],
    colegio: [usuarios('colegio', 0), usuarios('colegio', 2)],
    colegiosCentral: usuarios('colegio', 1) / servicios.colegio.capacidad[1],
    salud: [usuarios('centro_salud', 0) / servicios.centro_salud.capacidad[1], usuarios('centro_salud', 2) / servicios.centro_salud.capacidad[1]],
    residencia: [usuarios('residencia', 0), usuarios('residencia', 2)],
  }
}

export default function PantallaInicio({ servicios, ir, tecnico }: Props) {
  const [resumen, setResumen] = useState<Resumen | null>(null)
  useEffect(() => { fetch(`${BASE}municipios_resumen.json`).then((r) => r.json()).then(setResumen) }, [])

  const total = useMemo(() => {
    if (!resumen?.modelo) return null
    const viv = resumen.municipios.reduce((t, m) => t + (m.viviendas_previstas ?? 0), 0)
    return { viv, ...necesidades(viv, resumen.modelo, servicios), municipios: resumen.municipios.filter((m) => (m.viviendas_previstas ?? 0) > 0).length }
  }, [resumen, servicios])

  // radar: municipios que más crecen y si les queda suelo para los colegios que harán falta
  const radar = useMemo(() => {
    if (!resumen?.modelo) return []
    return resumen.municipios
      .filter((m) => m.poblacion >= 1000 && (m.viviendas_previstas ?? 0) >= 300 && m.suelo_detallado)
      .map((m) => {
        const grandes = m.parcelas_equip_8000 ?? 0
        const nec = necesidades(m.viviendas_previstas!, resumen.modelo!, servicios)
        const colegios = nec.colegiosCentral
        const estado = colegios < 0.5 ? 'sin_presion' : grandes >= colegios * 2 ? 'holgado' : grandes >= colegios ? 'justo' : 'falta'
        return { m, crece: (100 * nec.personas[0]) / m.poblacion, creceMax: (100 * nec.personas[1]) / m.poblacion, colegios, grandes, estado }
      })
      .sort((a, b) => b.crece - a.crece)
      .slice(0, 10)
  }, [resumen, servicios])

  // datos llamativos para quien busca casa: los primeros de cada lista, pulsables
  const datos = useMemo(() => {
    if (!resumen) return null
    const top = (f: (m: ResumenMunicipio) => number | null | undefined, fmt: (v: number) => string, min = 0) =>
      [...resumen.municipios].filter((m) => (f(m) ?? 0) > min).sort((a, b) => (f(b) ?? 0) - (f(a) ?? 0)).slice(0, 5).map((m) => ({ m, v: fmt(f(m)!) }))
    return [
      { t: 'Donde más se va a construir', f: 'Viviendas previstas en el planeamiento (IDEM)', filas: top((m) => m.viviendas_previstas, n) },
      { t: 'Más solares para vivienda', f: 'Parcelas residenciales sin construir (catastro, IDEM)', filas: top((m) => m.solares_vivienda, n) },
      { t: 'Suelo público en venta para vivienda', f: 'Parcelas residenciales (Portal del Suelo)', filas: top((m) => m.suelo_publico_vivienda, n) },
      { t: 'Los que más crecen', f: 'Población, último periodo (padrón), más de 5.000 hab.', filas: top((m) => (m.poblacion >= 5000 ? m.crecimiento_pct : null), (v) => `+${dec(v)} %`) },
    ]
  }, [resumen])

  const ESTADO: Record<string, [string, string]> = { holgado: ['Hay suelo de sobra', 'bg-ok'], justo: ['Suelo justo', 'bg-aviso'], falta: ['Puede faltar suelo', 'bg-rojo'], sin_presion: ['Poca presión', 'bg-texto-3'] }

  return (
    <div className="h-full overflow-y-auto">
      {/* portada */}
      <section className="border-b border-linea bg-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 py-10 md:grid-cols-[1.2fr_1fr] md:py-14">
          <div>
            <div className="text-xs font-semibold tracking-wide text-rojo uppercase">Datos abiertos de la Comunidad de Madrid · {resumen?.municipios.length ?? 179} municipios</div>
            <h1 className="mt-3 text-[36px] leading-[1.08] font-semibold tracking-tight md:text-[48px]">Llegan las familias.<br /><span className="text-texto-2">¿Llegarán los colegios?</span></h1>
            <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-texto-2">
              Los barrios nuevos se llenan antes de tener colegio, centro de salud o residencia. <b className="text-tinta">Cuna y Canas</b> anticipa ese desfase en cada municipio:
              cuánta gente va a llegar, qué servicios le van a faltar, si queda suelo público para ellos y dónde ponerlos.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button type="button" onClick={() => ir({ a: 'municipios' })} className="inline-flex items-center gap-2 bg-tinta px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-rojo">
                <Icono nombre="ubicacion" className="h-4 w-4" />Busco dónde vivir
              </button>
            </div>
          </div>
          <div className="self-center border border-tinta">
            <div className="border-b border-tinta bg-tinta px-5 py-3 text-sm text-white">Lo que prevé el planeamiento urbanístico vigente</div>
            {total ? (
              <dl className="divide-y divide-linea">
                <div className="px-5 py-4"><dt className="text-sm text-texto-2">Viviendas nuevas previstas en {total.municipios} municipios</dt><dd className="text-[34px] leading-tight font-semibold tabular-nums">{n(total.viv)}</dd></div>
                <div className="px-5 py-4"><dt className="text-sm text-texto-2">Personas que pueden llegar</dt><dd className="text-2xl font-semibold tabular-nums">{dec(total.personas[0] / 1e6, 2)}–{dec(total.personas[1] / 1e6, 2)} millones</dd></div>
                <div className="grid grid-cols-2 divide-x divide-linea">
                  <div className="px-5 py-4"><dt className="text-xs text-texto-2">Plazas de colegio que harán falta</dt><dd className="text-xl font-semibold tabular-nums">{n(total.colegio[0] / 1000)}–{n(total.colegio[1] / 1000)} mil</dd></div>
                  <div className="px-5 py-4"><dt className="text-xs text-texto-2">Centros de salud equivalentes</dt><dd className="text-xl font-semibold tabular-nums">{n(total.salud[0])}–{n(total.salud[1])}</dd></div>
                </div>
              </dl>
            ) : <div className="p-5 text-sm text-texto-2">Calculando…</div>}
            <div className="border-t border-linea px-5 py-2 text-[11px] text-texto-3">Fuera de Madrid capital. Modelo calibrado con barrios nuevos reales de Getafe (INE).</div>
          </div>
        </div>
      </section>

      {/* ejemplos de un clic */}
      <section className="mx-auto max-w-6xl px-6 py-10">
        <h2 className="text-xl font-semibold">Pruébalo con un clic</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { t: 'Los Molinos (Getafe)', d: '11.473 vecinos y ningún centro de salud a 10 minutos a pie. ¿Qué hay y qué viene?', icono: 'ubicacion', fn: () => ir({ a: 'ciudadana', cod: '065', barrio: 'SUS-PP-2 LOS MOLINOS' }) },
            { t: 'Familia con bebé que trabaja en Madrid', d: '¿Qué municipios encajan mejor? Ranking de los 179 con datos oficiales.', icono: 'escuela_infantil', fn: () => ir({ a: 'municipios', situaciones: ['bebe', 'madrid'] }) },
            { t: 'Arroyomolinos', d: '38.185 habitantes y ningún centro de salud, solo un consultorio. Mira su ficha.', icono: 'centro_salud', fn: () => ir({ a: 'municipios', sel: '015' }) },
            tecnico
              ? { t: 'Navalcarnero crece', d: '21.434 viviendas previstas para 33.352 habitantes. ¿Dónde irían los colegios?', icono: 'colegio', fn: () => ir({ a: 'tecnica', cod: '096', servicio: 'colegio' }) }
              : { t: 'Boadilla del Monte', d: '417 solares para vivienda sin construir y 11 parcelas públicas en venta. ¿Qué hay alrededor?', icono: 'casa_nueva', fn: () => ir({ a: 'ciudadana', cod: '022' }) },
          ].map((e) => (
            <button key={e.t} type="button" onClick={e.fn} className="group flex flex-col items-start border border-linea p-4 text-left transition-colors hover:border-tinta">
              <Icono nombre={e.icono} className="h-6 w-6 text-rojo" />
              <span className="mt-3 font-semibold">{e.t}</span>
              <span className="mt-1 text-sm text-texto-2">{e.d}</span>
              <span className="mt-3 text-sm font-medium text-rojo group-hover:underline">Ver →</span>
            </button>
          ))}
        </div>
      </section>

      {/* lo que puede encontrar quien busca casa */}
      <section className="mx-auto max-w-6xl px-6 py-10">
        <h2 className="text-xl font-semibold">Qué puedes encontrar si buscas casa</h2>
        <p className="mt-1 max-w-3xl text-sm text-texto-2">Lo que no sale en los portales inmobiliarios: qué hay de verdad cerca, qué se va a construir y qué servicios llegarán (o no). Con datos oficiales de la Comunidad de Madrid.</p>
        <div className="mt-5 grid gap-px bg-linea sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['ubicacion', 'Qué hay a 10 minutos de tu casa', 'Colegios, escuelas infantiles, centros de salud, farmacias, residencias, parques y paradas, en cualquier punto del mapa.', () => ir({ a: 'ciudadana', cod: '065' })],
            ['casa_nueva', 'Qué se va a construir', 'Barrios nuevos del planeamiento, solares para vivienda sin construir y suelo público en venta.', () => ir({ a: 'ciudadana', cod: '022' })],
            ['colegio', 'Qué servicios harán falta', 'Cuántas plazas de colegio o de escuela infantil necesitará tu barrio cuando esté lleno, y cuántas hay hoy.', () => ir({ a: 'ciudadana', cod: '065', barrio: 'SUS-PP-2 LOS MOLINOS' })],
            ['tren', 'Dónde vivir según tu vida', 'Con bebé, con hijos, cuidando a tus mayores o trabajando en Madrid: los 179 municipios ordenados para ti.', () => ir({ a: 'municipios' })],
          ].map(([ic, t, d, fn]) => (
            <button key={t as string} type="button" onClick={fn as () => void} className="group bg-white p-5 text-left hover:bg-gris-1">
              <Icono nombre={ic as string} className="h-6 w-6 text-rojo" /><div className="mt-3 font-semibold">{t as string}</div><p className="mt-1 text-sm text-texto-2">{d as string}</p>
              <span className="mt-2 inline-block text-sm font-medium text-rojo group-hover:underline">Ver →</span>
            </button>
          ))}
        </div>

        {datos && (
          <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {datos.map((b) => (
              <div key={b.t} className="border-t-2 border-tinta pt-3">
                <div className="text-sm font-semibold">{b.t}</div>
                <div className="text-xs text-texto-3">{b.f}</div>
                <ol className="mt-2 grid gap-1 text-sm">
                  {b.filas.map((x, k) => (
                    <li key={x.m.cod_ine}>
                      <button type="button" onClick={() => ir({ a: 'municipios', sel: x.m.cod_ine })} className="flex w-full items-baseline gap-2 text-left hover:text-rojo">
                        <span className="w-4 text-xs text-texto-3">{k + 1}</span><span className="min-w-0 flex-1 truncate">{x.m.nombre}</span><b className="tabular-nums">{x.v}</b>
                      </button>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* radar: solo para técnicos */}
      {tecnico && (
      <section className="border-y border-linea bg-gris-1">
        <div className="mx-auto max-w-6xl px-6 py-10">
          <div className="text-xs font-semibold tracking-wide text-rojo uppercase">Solo técnicos</div>
          <h2 className="text-xl font-semibold">Radar: ¿hay sitio para lo que viene?</h2>
          <p className="mt-1 max-w-3xl text-sm text-texto-2">Los municipios que más pueden crecer según su planeamiento, cuántos colegios harían falta por la población nueva y cuántas parcelas vacantes de equipamiento tienen donde cabría uno (8.000 m² o más).</p>
          <div className="mt-4 overflow-x-auto bg-white">
            <table className="w-full min-w-[640px] text-sm">
              <thead><tr className="border-b border-tinta text-left text-xs text-texto-2">
                <th className="px-3 py-2 font-medium">Municipio</th><th className="px-3 py-2 text-right font-medium">Habitantes</th><th className="px-3 py-2 text-right font-medium">Puede crecer</th>
                <th className="px-3 py-2 text-right font-medium">Colegios que harían falta</th><th className="px-3 py-2 text-right font-medium">Parcelas donde cabe uno</th><th className="px-3 py-2 font-medium">Diagnóstico</th></tr></thead>
              <tbody>
                {radar.map((r) => (
                  <tr key={r.m.cod_ine} className="cursor-pointer border-b border-gris-2 hover:bg-gris-1" onClick={() => ir({ a: 'tecnica', cod: r.m.cod_ine, servicio: 'colegio' })}>
                    <td className="px-3 py-2 font-medium">{r.m.nombre}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{n(r.m.poblacion)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">+{n(r.crece)}–{n(r.creceMax)} %</td>
                    <td className="px-3 py-2 text-right tabular-nums">{dec(r.colegios, 1)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.grandes}</td>
                    <td className="px-3 py-2"><span className="inline-flex items-center gap-1.5 text-xs font-medium"><span className={`h-2 w-2 ${ESTADO[r.estado][1]}`} />{ESTADO[r.estado][0]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-texto-3">Diagnóstico orientativo: una misma parcela puede servir para un colegio o para otro servicio. Pulsa un municipio para planificar dónde ponerlos.</p>
        </div>
      </section>
      )}

      <footer className="border-t border-linea bg-tinta text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-6 py-6 text-xs text-white/70">
          <Logo className="h-7 w-7" />
          <span>Cuna y Canas · MAD Open Data Challenge 2026</span>
          <span className="ml-auto">Fuentes: Portal de Datos Abiertos e IDEM de la Comunidad de Madrid, INE, Consorcio Regional de Transportes, CartoCiudad, Wikimedia Commons</span>
        </div>
      </footer>
    </div>
  )
}
