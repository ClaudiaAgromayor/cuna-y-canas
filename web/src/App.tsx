import { useEffect, useState } from 'react'
import { cargarIndice, cargarMunicipio, cargarServicios } from './datos'
import PantallaTecnica from './PantallaTecnica'
import PantallaCiudadana from './PantallaCiudadana'
import PantallaMunicipios from './PantallaMunicipios'
import type { DatosMunicipio, MunicipioIndice, Servicio, ServicioId } from './tipos'
import { Logo } from './iconos'
import { n } from './ui'

type Pantalla = 'municipios' | 'ciudadana' | 'tecnica'
const PANTALLAS: [Pantalla, string, string][] = [
  ['municipios', '¿Dónde vivir?', 'Compara los municipios'],
  ['ciudadana', 'Barrios', 'Qué hay y qué viene'],
  ['tecnica', 'Planificar', 'Para técnicos'],
]

const leerHash = () => new URLSearchParams(location.hash.slice(1))

export default function App() {
  const [indice, setIndice] = useState<MunicipioIndice[]>([])
  const [servicios, setServicios] = useState<Record<ServicioId, Servicio> | null>(null)
  const [cod, setCod] = useState<string | null>(leerHash().get('m'))
  const [pantalla, setPantalla] = useState<Pantalla>((leerHash().get('p') as Pantalla) ?? 'municipios')
  const [datos, setDatos] = useState<DatosMunicipio | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([cargarIndice(), cargarServicios()]).then(([i, s]) => {
      const completos = i.filter((m) => m.completo !== false).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
      setIndice(completos); setServicios(s)
      setCod((c) => (c && completos.some((m) => m.cod_ine === c) ? c : completos.find((m) => m.cod_ine === '065')?.cod_ine ?? completos[0]?.cod_ine ?? null))
    }).catch((e) => setError(`No se pudieron cargar los datos: ${e.message}`))
  }, [])

  useEffect(() => {
    const m = indice.find((x) => x.cod_ine === cod)
    if (!m || pantalla === 'municipios') return
    setDatos((d) => (d?.indice.cod_ine === m.cod_ine ? d : null)); setError('')
    cargarMunicipio(m).then(setDatos).catch((e) => setError(e.message))
  }, [cod, indice, pantalla])

  useEffect(() => { history.replaceState(null, '', `#p=${pantalla}${cod && pantalla !== 'municipios' ? `&m=${cod}` : ''}`) }, [cod, pantalla])

  const muni = indice.find((x) => x.cod_ine === cod)
  const irA = (p: Pantalla, c?: string) => { if (c) setCod(c); setPantalla(p); window.scrollTo(0, 0) }

  return (
    <div className="flex h-full flex-col">
      <header className="bg-tinta text-white">
        <div className="flex flex-wrap items-stretch gap-x-6 px-4 sm:px-5">
          <a href="#p=municipios" className="flex items-center gap-3 py-3" onClick={(e) => { e.preventDefault(); irA('municipios') }}>
            <Logo />
            <div className="leading-tight">
              <div className="text-[19px] font-bold tracking-tight">Cuna y Canas</div>
              <div className="hidden text-xs text-white/60 xl:block">Qué hace falta y qué viene en tu barrio</div>
            </div>
          </a>
          <nav className="order-3 -mx-4 flex w-full overflow-x-auto border-t border-white/10 text-sm sm:mx-0 md:order-none md:w-auto md:border-0" aria-label="Secciones">
            {PANTALLAS.map(([id, t, sub]) => (
              <button key={id} onClick={() => irA(id)} aria-current={pantalla === id}
                className={`flex shrink-0 flex-col justify-center border-b-[3px] px-4 py-2 text-left leading-tight transition-colors ${pantalla === id ? 'border-rojo text-white' : 'border-transparent text-white/70 hover:text-white'}`}>
                <span className="font-semibold">{t}</span><span className="hidden text-[11px] text-white/50 lg:inline">{sub}</span>
              </button>
            ))}
          </nav>
          {pantalla !== 'municipios' && (
            <label className="ml-auto flex items-center gap-2 py-3 text-sm">
              <span className="hidden text-white/60 xl:inline">Municipio</span>
              <select className="max-w-[60vw] border border-white/30 bg-tinta px-2.5 py-1.5 font-semibold text-white focus:border-white focus:outline-none" value={cod ?? ''} onChange={(e) => setCod(e.target.value)}>
                {indice.map((m) => <option key={m.cod_ine} value={m.cod_ine}>{m.nombre}</option>)}
              </select>
            </label>
          )}
        </div>
      </header>
      {muni && pantalla !== 'municipios' && (
        <div className="hidden flex-wrap items-center gap-x-5 gap-y-1 border-b border-linea bg-gris-1 px-5 py-2 text-xs text-texto-2 lg:flex">
          <span className="font-semibold text-tinta">{muni.nombre}</span>
          {muni.poblacion && <span>{n(muni.poblacion)} habitantes ({muni.anio_poblacion})</span>}
          {muni.viviendas_previstas && <span>{n(muni.viviendas_previstas)} viviendas previstas en el planeamiento</span>}
          <span className="ml-auto">Con datos abiertos de la Comunidad de Madrid, el INE y el Consorcio de Transportes</span>
        </div>
      )}
      <main className="min-h-0 flex-1">
        {error && <div className="m-5 border-l-[3px] border-rojo bg-gris-1 p-3 text-sm">{error}</div>}
        {!error && !servicios && <div className="m-5 text-sm text-texto-2">Cargando…</div>}
        {servicios && pantalla === 'municipios' && (
          <PantallaMunicipios servicios={servicios} detallados={indice} verBarrios={(c) => irA('ciudadana', c)} planificar={(c) => irA('tecnica', c)} />
        )}
        {servicios && pantalla !== 'municipios' && !datos && !error && <div className="m-5 text-sm text-texto-2">Cargando {muni?.nombre ?? 'datos'}…</div>}
        {servicios && datos && pantalla === 'tecnica' && <PantallaTecnica key={datos.indice.cod_ine} datos={datos} servicios={servicios} />}
        {servicios && datos && pantalla === 'ciudadana' && <PantallaCiudadana key={datos.indice.cod_ine} datos={datos} servicios={servicios} />}
      </main>
    </div>
  )
}
