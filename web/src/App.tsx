import { useEffect, useState } from 'react'
import { cargarIndice, cargarMunicipio, cargarServicios } from './datos'
import PantallaTecnica from './PantallaTecnica'
import PantallaCiudadana from './PantallaCiudadana'
import type { DatosMunicipio, MunicipioIndice, Servicio, ServicioId } from './tipos'
import { Logo } from './iconos'
import { n } from './ui'

type Pantalla = 'tecnica' | 'ciudadana'

const leerHash = () => new URLSearchParams(location.hash.slice(1))

export default function App() {
  const [indice, setIndice] = useState<MunicipioIndice[]>([])
  const [servicios, setServicios] = useState<Record<ServicioId, Servicio> | null>(null)
  const [cod, setCod] = useState<string | null>(leerHash().get('m'))
  const [pantalla, setPantalla] = useState<Pantalla>((leerHash().get('p') as Pantalla) ?? 'ciudadana')
  const [datos, setDatos] = useState<DatosMunicipio | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([cargarIndice(), cargarServicios()]).then(([i, s]) => {
      setIndice(i); setServicios(s)
      setCod((c) => (c && i.some((m) => m.cod_ine === c) ? c : i[0]?.cod_ine ?? null))
    }).catch((e) => setError(`No se pudieron cargar los datos: ${e.message}`))
  }, [])

  useEffect(() => {
    const m = indice.find((x) => x.cod_ine === cod)
    if (!m) return
    setDatos(null); setError('')
    cargarMunicipio(m).then(setDatos).catch((e) => setError(e.message))
  }, [cod, indice])

  useEffect(() => { if (cod) history.replaceState(null, '', `#m=${cod}&p=${pantalla}`) }, [cod, pantalla])

  const muni = indice.find((x) => x.cod_ine === cod)

  return (
    <div className="flex h-full flex-col">
      <header className="bg-tinta text-white">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-2 px-5">
          <a href="#" className="flex items-center gap-3 py-3" onClick={(e) => { e.preventDefault(); setPantalla('ciudadana') }}>
            <Logo />
            <div className="leading-tight">
              <div className="text-[19px] font-bold tracking-tight">Cuna y Canas</div>
              <div className="text-xs text-white/60">Qué hace falta y qué viene en tu barrio</div>
            </div>
          </a>
          <nav className="flex self-stretch text-sm" aria-label="Pantallas">
            {([['ciudadana', 'Mi barrio'], ['tecnica', 'Planificar dotaciones']] as const).map(([id, t]) => (
              <button key={id} onClick={() => setPantalla(id)} aria-current={pantalla === id}
                className={`border-b-[3px] px-4 pt-1 transition-colors ${pantalla === id ? 'border-rojo font-semibold text-white' : 'border-transparent text-white/70 hover:text-white'}`}>
                {t}
              </button>
            ))}
          </nav>
          <label className="ml-auto flex items-center gap-2 py-3 text-sm">
            <span className="text-white/60">Municipio</span>
            <select className="border border-white/30 bg-tinta px-2.5 py-1.5 font-semibold text-white focus:border-white focus:outline-none" value={cod ?? ''} onChange={(e) => setCod(e.target.value)}>
              {indice.map((m) => <option key={m.cod_ine} value={m.cod_ine}>{m.nombre}</option>)}
            </select>
          </label>
        </div>
      </header>
      {muni && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-linea bg-gris-1 px-5 py-2 text-xs text-texto-2">
          <span className="font-semibold text-tinta">{muni.nombre}</span>
          {muni.poblacion && <span>{n(muni.poblacion)} habitantes ({muni.anio_poblacion})</span>}
          {muni.viviendas_previstas && <span>{n(muni.viviendas_previstas)} viviendas previstas en el planeamiento</span>}
          {muni.faltan.length > 0 && <span className="text-aviso">Sin datos: {muni.faltan.join(', ')}</span>}
          <span className="ml-auto">Con datos abiertos de la Comunidad de Madrid, el INE y el Consorcio de Transportes</span>
        </div>
      )}
      <main className="min-h-0 flex-1">
        {error && <div className="m-5 border-l-[3px] border-rojo bg-gris-1 p-3 text-sm">{error}</div>}
        {!error && (!datos || !servicios) && <div className="m-5 text-sm text-texto-2">Cargando {muni?.nombre ?? 'datos'}…</div>}
        {datos && servicios && (pantalla === 'tecnica'
          ? <PantallaTecnica key={datos.indice.cod_ine} datos={datos} servicios={servicios} />
          : <PantallaCiudadana key={datos.indice.cod_ine} datos={datos} servicios={servicios} />)}
      </main>
    </div>
  )
}
