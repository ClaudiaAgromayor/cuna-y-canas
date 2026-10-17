import type { FeatureCollection, Point } from 'geojson'
import type { DatosMunicipio, Demanda, MunicipioIndice, Servicio, ServicioId } from './tipos'

const BASE = import.meta.env.BASE_URL

const vacia = (): FeatureCollection<never> => ({ type: 'FeatureCollection', features: [] })

async function json<T>(ruta: string): Promise<T> {
  const r = await fetch(`${BASE}${ruta}`)
  if (!r.ok) throw new Error(`${ruta}: ${r.status}`)
  return r.json() as Promise<T>
}

/** Si una capa no existe para el municipio, se devuelve vacía: la interfaz muestra "sin datos" en vez de fallar. */
async function capa<T = FeatureCollection>(m: MunicipioIndice, nombre: string): Promise<T> {
  if (m.capas[nombre] === false && nombre !== 'farmacias') return vacia() as T
  try {
    return await json<T>(`${m.carpeta}/${nombre}.geojson`)
  } catch {
    return vacia() as T
  }
}

export async function cargarIndice(): Promise<MunicipioIndice[]> {
  return (await json<{ municipios: MunicipioIndice[] }>('municipios.json')).municipios
}

export async function cargarServicios(): Promise<Record<ServicioId, Servicio>> {
  return json('servicios.json')
}

const cache = new Map<string, Promise<DatosMunicipio>>()

export function cargarMunicipio(m: MunicipioIndice): Promise<DatosMunicipio> {
  if (!cache.has(m.cod_ine)) {
    cache.set(m.cod_ine, (async () => {
      const [ambitos, parcelas, demandaPuntos, educativos, sanitarios, sociales, paradas, zonasSalud, redes, farmacias, demanda, viviendaNueva, portalSuelo] = await Promise.all([
        capa(m, 'ambitos'), capa(m, 'parcelas_vacantes'), capa(m, 'demanda_puntos'), capa(m, 'centros_educativos'),
        capa(m, 'centros_sanitarios'), capa(m, 'centros_sociales'), capa(m, 'paradas'), capa(m, 'zonas_salud'), capa(m, 'redes'), capa(m, 'farmacias'),
        m.tablas.demanda ? json<Demanda>(`${m.carpeta}/demanda.json`).catch(() => null) : Promise.resolve(null),
        capa(m, 'vivienda_nueva'), capa(m, 'portal_suelo'),
      ])
      const pts = (demandaPuntos as FeatureCollection<Point>).features
      const xs = pts.map((f) => f.geometry.coordinates[0]), ys = pts.map((f) => f.geometry.coordinates[1])
      // encuadre desde los puntos de demanda; si son muy pocos (un solo punto da un encuadre de tamaño cero y el mapa no se dibuja), el del municipio
      const caja: [number, number, number, number] | null = xs.length ? [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] : null
      const encuadre: [number, number, number, number] = caja && caja[2] - caja[0] > 0.01 && caja[3] - caja[1] > 0.008 ? caja : m.bbox
      const datos = { indice: m, encuadre, ambitos, parcelas, demandaPuntos, educativos, sanitarios, sociales, farmacias, paradas, zonasSalud, redes, demanda, viviendaNueva, portalSuelo } as DatosMunicipio
      comprobarMunicipio(datos)
      return datos
    })())
  }
  return cache.get(m.cod_ine)!
}

/** Segunda barrera anti-mezcla (la primera es etl/verificar.py): todo elemento debe ser del municipio cargado. */
function comprobarMunicipio(d: DatosMunicipio) {
  const cod = d.indice.cod_ine
  const capas = { ambitos: d.ambitos, parcelas: d.parcelas, demanda: d.demandaPuntos, educativos: d.educativos, sanitarios: d.sanitarios,
    sociales: d.sociales, farmacias: d.farmacias, paradas: d.paradas, zonas: d.zonasSalud, redes: d.redes }
  for (const [nombre, fc] of Object.entries(capas)) {
    const ajenos = fc.features.filter((f) => (f.properties as { cod_ine?: string } | null)?.cod_ine !== cod)
    if (ajenos.length) throw new Error(`La capa ${nombre} trae ${ajenos.length} elementos que no son de ${d.indice.nombre}`)
  }
  if (d.demanda && d.demanda.cod_ine !== cod) throw new Error(`demanda.json no es de ${d.indice.nombre}`)
}
