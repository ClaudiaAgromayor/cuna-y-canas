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
              <button type="button" onClick={() => ir({ a: 'tecnica', cod: '065' })} className="inline-flex items-center gap-2 border border-tinta px-5 py-3 text-sm font-semibold hover:bg-gris-1">
                <Icono nombre="ajustes" className="h-4 w-4" />Planifico servicios públicos{!tecnico && <span className="text-xs font-normal text-texto-3">· acceso técnico</span>}
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
            { t: 'Navalcarnero crece', d: '21.434 viviendas previstas para 33.352 habitantes. ¿Dónde irían los colegios?', icono: 'colegio', fn: () => ir({ a: 'tecnica', cod: '096', servicio: 'colegio' }) },
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

      {/* radar */}
      <section className="border-y border-linea bg-gris-1">
        <div className="mx-auto max-w-6xl px-6 py-10">
          <h2 className="text-xl font-semibold">Radar: ¿hay sitio para lo que viene?</h2>
          <p className="mt-1 max-w-3xl text-sm text-texto-2">Los municipios que más pueden crecer según su planeamiento, cuántos colegios harían falta por la población nueva y cuántas parcelas vacantes de equipamiento tienen donde cabría uno (8.000 m² o más).</p>
          <div className="mt-4 overflow-x-auto bg-white">
            <table className="w-full min-w-[640px] text-sm">
              <thead><tr className="border-b border-tinta text-left text-xs text-texto-2">
                <th className="px-3 py-2 font-medium">Municipio</th><th className="px-3 py-2 text-right font-medium">Habitantes</th><th className="px-3 py-2 text-right font-medium">Puede crecer</th>
                <th className="px-3 py-2 text-right font-medium">Colegios que harían falta</th><th className="px-3 py-2 text-right font-medium">Parcelas donde cabe uno</th><th className="px-3 py-2 font-medium">Diagnóstico</th></tr></thead>
              <tbody>
                {radar.map((r) => (
                  <tr key={r.m.cod_ine} className="cursor-pointer border-b border-gris-2 hover:bg-gris-1" onClick={() => ir({ a: 'municipios', sel: r.m.cod_ine })}>
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
          <p className="mt-2 text-xs text-texto-3">Diagnóstico orientativo: una misma parcela puede servir para un colegio o para otro servicio. Pulsa un municipio para ver su ficha; el detalle de dónde ponerlos está en la herramienta para técnicos.</p>
        </div>
      </section>

      {/* qué nos hace distintos */}
      <section className="mx-auto max-w-6xl px-6 py-10">
        <h2 className="text-xl font-semibold">Qué hace distinto a Cuna y Canas</h2>
        <div className="mt-4 grid gap-px bg-linea sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['validar', 'Mira al futuro', 'No solo lo que hay hoy: lo que va a hacer falta cuando se habiten las viviendas que ya prevé el planeamiento.'],
            ['suelo', 'Comprueba si hay sitio', 'Cruza la demanda con el suelo público vacante de la IDEM: dónde cabe cada colegio, centro de salud o residencia.'],
            ['ajustes', 'Sirve para decidir', 'Para la Administración: dónde poner cada centro, cuándo hace falta y si la propuesta aguanta con otros supuestos.'],
            ['check', 'Validado con datos reales', 'Predecimos barrios ya construidos sin mirar sus datos: un error medio del 19 %, la mitad que la regla habitual.'],
          ].map(([ic, t, d]) => (
            <div key={t} className="bg-white p-5"><Icono nombre={ic} className="h-6 w-6" /><div className="mt-3 font-semibold">{t}</div><p className="mt-1 text-sm text-texto-2">{d}</p></div>
          ))}
        </div>
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <div className="border-l-[3px] border-tinta pl-4">
            <div className="font-semibold">Un mismo dato, dos lecturas</div>
            <p className="mt-1 text-sm text-texto-2">El vecino lee frases cortas y estados: <i>"Colegio: faltarán entre 959 y 1.882 plazas; hay 675 cerca"</i>. El técnico lee cifras, rangos y mapas para decidir dónde y cuándo.</p>
          </div>
          <div className="border-l-[3px] border-rojo pl-4">
            <div className="font-semibold">Datos abiertos mejores para todos</div>
            <p className="mt-1 text-sm text-texto-2">Al cruzar fuentes hemos encontrado errores en datos oficiales: centros sanitarios situados en calles homónimas de otra ciudad, paradas de otra provincia con el mismo código de municipio y miles de parcelas con geometría inválida. Los detectamos, los corregimos y los podemos devolver a la Comunidad.</p>
          </div>
        </div>
      </section>

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
