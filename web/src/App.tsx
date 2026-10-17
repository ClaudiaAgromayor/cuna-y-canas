import { useEffect, useState } from 'react'
import { cargarIndice, cargarMunicipio, cargarServicios } from './datos'
import PantallaTecnica from './PantallaTecnica'
import PantallaCiudadana from './PantallaCiudadana'
import PantallaMunicipios from './PantallaMunicipios'
import PantallaInicio, { type Destino } from './PantallaInicio'
import type { DatosMunicipio, MunicipioIndice, Servicio, ServicioId } from './tipos'
import { Icono, Logo } from './iconos'
import { n } from './ui'

type Pantalla = 'inicio' | 'municipios' | 'ciudadana' | 'tecnica'
interface Sesion { organismo: string; cod: string | null }

const NAV_CIUDADANA: [Pantalla, string][] = [['inicio', 'Inicio'], ['municipios', '¿Dónde vivir?'], ['ciudadana', 'Barrios']]
const leerHash = () => new URLSearchParams(location.hash.slice(1))
const leerSesion = (): Sesion | null => { try { return JSON.parse(localStorage.getItem('cyc_sesion') ?? 'null') } catch { return null } }

export default function App() {
  const h = leerHash()
  const [indice, setIndice] = useState<MunicipioIndice[]>([])
  const [servicios, setServicios] = useState<Record<ServicioId, Servicio> | null>(null)
  const [cod, setCod] = useState<string | null>(h.get('m'))
  const [pantalla, setPantalla] = useState<Pantalla>((h.get('p') as Pantalla) ?? 'inicio')
  const [datos, setDatos] = useState<DatosMunicipio | null>(null)
  const [error, setError] = useState('')
  const [sesion, setSesion] = useState<Sesion | null>(leerSesion)
  const [login, setLogin] = useState<{ despues?: Destino } | null>(null)
  // parámetros de entrada para los ejemplos de un clic y los enlaces compartidos
  const [entrada, setEntrada] = useState<{ situaciones?: string[]; sel?: string; barrio?: string; servicio?: ServicioId; zona?: string; clave: number }>(
    { situaciones: h.get('s')?.split(','), sel: h.get('sel') ?? undefined, barrio: h.get('b') ?? undefined, servicio: (h.get('serv') as ServicioId) ?? undefined, clave: 0 })

  useEffect(() => {
    Promise.all([cargarIndice(), cargarServicios()]).then(([i, s]) => {
      const completos = i.filter((m) => m.completo !== false).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
      setIndice(completos); setServicios(s)
      setCod((c) => (c && completos.some((m) => m.cod_ine === c) ? c : completos.find((m) => m.cod_ine === '065')?.cod_ine ?? completos[0]?.cod_ine ?? null))
    }).catch((e) => setError(`No se pudieron cargar los datos: ${e.message}`))
  }, [])

  // la pantalla técnica exige haber entrado como técnico
  useEffect(() => { if (pantalla === 'tecnica' && !sesion) { setPantalla('inicio'); setLogin({ despues: cod ? { a: 'tecnica', cod } : undefined }) } }, [pantalla, sesion, cod])

  useEffect(() => {
    const m = indice.find((x) => x.cod_ine === cod)
    if (!m || pantalla === 'municipios' || pantalla === 'inicio') return
    setDatos((d) => (d?.indice.cod_ine === m.cod_ine ? d : null)); setError('')
    cargarMunicipio(m).then(setDatos).catch((e) => setError(e.message))
  }, [cod, indice, pantalla])

  useEffect(() => { history.replaceState(null, '', `#p=${pantalla}${cod && (pantalla === 'ciudadana' || pantalla === 'tecnica') ? `&m=${cod}` : ''}`) }, [cod, pantalla])

  const muni = indice.find((x) => x.cod_ine === cod)
  const irA = (p: Pantalla, c?: string) => { if (c) setCod(c); setPantalla(p); window.scrollTo(0, 0) }
  const ir = (d: Destino) => {
    if (d.a === 'tecnica' && !sesion) { setLogin({ despues: d }); return }
    setEntrada({ situaciones: d.a === 'municipios' ? d.situaciones : undefined, sel: d.a === 'municipios' ? d.sel : undefined,
      barrio: d.a === 'ciudadana' ? d.barrio : undefined, servicio: d.a === 'tecnica' ? d.servicio : undefined, zona: d.a === 'tecnica' ? d.zona : undefined, clave: Date.now() })
    irA(d.a, 'cod' in d ? d.cod : undefined)
  }
  const entrar = (s: Sesion) => {
    setSesion(s); try { localStorage.setItem('cyc_sesion', JSON.stringify(s)) } catch { /* sin almacenamiento: la sesión dura lo que la pestaña */ }
    const despues = login?.despues
    setLogin(null)
    if (despues?.a === 'tecnica') { setEntrada({ servicio: despues.servicio, zona: despues.zona, clave: Date.now() }); irA('tecnica', s.cod ?? despues.cod) }
    else irA('tecnica', s.cod ?? cod ?? undefined)
  }
  const salir = () => { setSesion(null); try { localStorage.removeItem('cyc_sesion') } catch { /* nada */ } ; irA('inicio') }

  const nav: [Pantalla, string][] = sesion ? [...NAV_CIUDADANA, ['tecnica', 'Planificar']] : NAV_CIUDADANA
  const conSelector = pantalla === 'ciudadana' || pantalla === 'tecnica'

  return (
    <div className="flex h-full flex-col">
      <header className="bg-tinta text-white">
        <div className="flex flex-wrap items-stretch gap-x-5 px-4 sm:px-5">
          <a href="#p=inicio" className="flex items-center gap-3 py-2.5" onClick={(e) => { e.preventDefault(); irA('inicio') }}>
            <Logo className="h-10 w-10" />
            <div className="leading-tight">
              <div className="text-[19px] font-bold tracking-tight">Cuna y Canas</div>
              <div className="hidden text-xs text-white/60 xl:block">Qué hace falta y qué viene en tu barrio</div>
            </div>
          </a>
          <nav className="order-3 -mx-4 flex w-full overflow-x-auto border-t border-white/10 text-sm md:order-none md:mx-0 md:w-auto md:border-0" aria-label="Secciones">
            {nav.map(([id, t]) => (
              <button key={id} onClick={() => irA(id)} aria-current={pantalla === id}
                className={`flex shrink-0 items-center gap-1.5 border-b-[3px] px-3.5 py-2.5 font-semibold transition-colors ${pantalla === id ? 'border-rojo text-white' : 'border-transparent text-white/70 hover:text-white'}`}>
                {id === 'tecnica' && <Icono nombre="ajustes" className="h-4 w-4" />}{t}
              </button>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 py-2">
            {conSelector && (
              <select aria-label="Municipio" className="max-w-[46vw] border border-white/30 bg-tinta px-2.5 py-1.5 text-sm font-semibold text-white focus:border-white focus:outline-none" value={cod ?? ''} onChange={(e) => setCod(e.target.value)}>
                {indice.map((m) => <option key={m.cod_ine} value={m.cod_ine}>{m.nombre}</option>)}
              </select>
            )}
            {sesion ? (
              <div className="flex items-center gap-2">
                <span className="hidden h-8 w-8 items-center justify-center bg-rojo text-xs font-bold lg:flex">{sesion.organismo.split(' ').filter((w) => w.length > 2).slice(0, 2).map((w) => w[0]).join('').toUpperCase()}</span>
                <span className="hidden max-w-[180px] text-xs leading-tight lg:block"><span className="block text-white/60">Técnico/a</span><span className="block truncate font-semibold">{sesion.organismo}</span></span>
                <button type="button" onClick={salir} className="border border-white/30 px-2.5 py-1.5 text-xs font-semibold hover:border-white">Salir</button>
              </div>
            ) : (
              <button type="button" onClick={() => setLogin({})} className="inline-flex items-center gap-1.5 border border-white/40 px-3 py-1.5 text-xs font-semibold hover:border-white">
                <Icono nombre="ajustes" className="h-4 w-4" />Acceso técnicos
              </button>
            )}
          </div>
        </div>
      </header>
      {muni && conSelector && (
        <div className="hidden flex-wrap items-center gap-x-5 gap-y-1 border-b border-linea bg-gris-1 px-5 py-2 text-xs text-texto-2 lg:flex">
          <span className="font-semibold text-tinta">{muni.nombre}</span>
          {muni.poblacion && <span>{n(muni.poblacion)} habitantes ({muni.anio_poblacion})</span>}
          {muni.viviendas_previstas && <span>{n(muni.viviendas_previstas)} viviendas previstas en el planeamiento</span>}
          <span className="ml-auto">{pantalla === 'tecnica' ? 'Modo técnico: cifras, rangos y supuestos ajustables' : 'Con datos abiertos de la Comunidad de Madrid, el INE y el Consorcio de Transportes'}</span>
        </div>
      )}
      <main className="min-h-0 flex-1">
        {error && <div className="m-5 border-l-[3px] border-rojo bg-gris-1 p-3 text-sm">{error}</div>}
        {!error && !servicios && <div className="m-5 text-sm text-texto-2">Cargando…</div>}
        {servicios && pantalla === 'inicio' && <PantallaInicio servicios={servicios} ir={ir} tecnico={!!sesion} />}
        {servicios && pantalla === 'municipios' && (
          <PantallaMunicipios key={`m-${entrada.clave}`} servicios={servicios} detallados={indice} situacionesIniciales={entrada.situaciones} selInicial={entrada.sel}
            verBarrios={(c) => irA('ciudadana', c)} planificar={(c) => ir({ a: 'tecnica', cod: c })} />
        )}
        {servicios && conSelector && !datos && !error && <div className="m-5 text-sm text-texto-2">Cargando {muni?.nombre ?? 'datos'}…</div>}
        {servicios && datos && pantalla === 'tecnica' && sesion && <PantallaTecnica key={`${datos.indice.cod_ine}-${entrada.clave}`} datos={datos} servicios={servicios} servicioInicial={entrada.servicio} zonaInicial={entrada.zona} />}
        {servicios && datos && pantalla === 'ciudadana' && <PantallaCiudadana key={`${datos.indice.cod_ine}-${entrada.clave}`} datos={datos} servicios={servicios} barrioInicial={entrada.barrio} />}
      </main>
      {login && <Login indice={indice} alCerrar={() => setLogin(null)} alEntrar={entrar} codSugerido={login.despues && 'cod' in login.despues ? login.despues.cod : cod} />}
    </div>
  )
}

/** Acceso de demostración para técnicos: sin contraseña. En producción iría con Cl@ve o certificado electrónico. */
function Login({ indice, alCerrar, alEntrar, codSugerido }: { indice: MunicipioIndice[]; alCerrar: () => void; alEntrar: (s: Sesion) => void; codSugerido: string | null }) {
  const sugerido = indice.find((m) => m.cod_ine === codSugerido)
  const [org, setOrg] = useState(sugerido ? `ayto-${sugerido.cod_ine}` : 'cm')
  const elegir = () => {
    if (org === 'cm') alEntrar({ organismo: 'Comunidad de Madrid', cod: codSugerido })
    else { const m = indice.find((x) => `ayto-${x.cod_ine}` === org); alEntrar({ organismo: `Ayuntamiento de ${m?.nombre ?? ''}`, cod: m?.cod_ine ?? null }) }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="titulo-login" onClick={alCerrar}>
      <div className="w-full max-w-md bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 bg-tinta px-5 py-4 text-white"><Logo className="h-8 w-8" /><div id="titulo-login" className="font-semibold">Acceso para técnicos</div>
          <button type="button" className="ml-auto text-white/70 hover:text-white" onClick={alCerrar} aria-label="Cerrar">✕</button></div>
        <div className="px-5 py-5">
          <p className="text-sm text-texto-2">La herramienta de planificación es para quien decide dónde y cuándo abrir colegios, centros de salud y residencias: Comunidad de Madrid y ayuntamientos.</p>
          <label className="mt-4 block text-sm font-semibold" htmlFor="organismo">Organismo</label>
          <select id="organismo" className="mt-1 w-full border border-tinta px-3 py-2.5" value={org} onChange={(e) => setOrg(e.target.value)}>
            <option value="cm">Comunidad de Madrid</option>
            {indice.map((m) => <option key={m.cod_ine} value={`ayto-${m.cod_ine}`}>Ayuntamiento de {m.nombre}</option>)}
          </select>
          <button type="button" onClick={elegir} className="mt-5 w-full bg-tinta py-3 text-sm font-semibold text-white hover:bg-rojo">Entrar</button>
          <p className="mt-3 text-xs text-texto-3">Versión de demostración: no pide contraseña ni guarda datos personales. En un despliegue real el acceso sería con Cl@ve o certificado electrónico.</p>
        </div>
      </div>
    </div>
  )
}
