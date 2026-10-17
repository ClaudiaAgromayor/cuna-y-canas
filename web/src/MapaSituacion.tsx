import { useMemo } from 'react'
import type { FeatureCollection, Position } from 'geojson'

const K = Math.cos((40.4 * Math.PI) / 180) // corrección de la longitud a la latitud de Madrid
const SOL: Position = [-3.7038, 40.4168]
const proy = ([lon, lat]: Position) => [lon * K * 1000, -lat * 1000]

/** Mapa vectorial de los 179 municipios para imprimir: nítido en papel y sin depender del mapa interactivo. */
export default function MapaSituacion({ limites, cod, color }: { limites: FeatureCollection; cod: string; color: (cod: string) => string }) {
  const { formas, caja } = useMemo(() => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    const anillo = (r: Position[]) => r.map((p, i) => {
      const [x, y] = proy(p)
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y)
      return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`
    }).join('') + 'Z'
    const formas = limites.features.map((f) => {
      const g = f.geometry
      const polis = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []
      return { cod: String(f.properties?.cod_ine), d: polis.flatMap((p) => p.map(anillo)).join('') }
    })
    return { formas, caja: [x0, y0, x1 - x0, y1 - y0] }
  }, [limites])
  const elegido = formas.find((f) => f.cod === cod)
  const [sx, sy] = proy(SOL)
  return (
    <svg viewBox={caja.map((v) => v.toFixed(0)).join(' ')} className="block h-auto w-full" role="img" aria-label="Situación del municipio en la Comunidad de Madrid">
      {formas.map((f) => <path key={f.cod} d={f.d} fill={f.cod === cod ? '#de0029' : color(f.cod)} stroke="#fff" strokeWidth={2.5} strokeLinejoin="round" />)}
      {elegido && <path d={elegido.d} fill="none" stroke="#131313" strokeWidth={6} strokeLinejoin="round" />}
      <circle cx={sx} cy={sy} r={9} fill="#131313" stroke="#fff" strokeWidth={3} />
      <text x={sx + 14} y={sy + 7} fontSize={30} fontWeight={600} fill="#131313" stroke="#fff" strokeWidth={6} paintOrder="stroke">Madrid</text>
    </svg>
  )
}
