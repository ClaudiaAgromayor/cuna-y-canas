import { n } from './ui'

export interface FilaPoblacion { anio: number; bebes: number; ninos: number; jovenes: number; adultos: number; mayores: number }
export type GrupoId = Exclude<keyof FilaPoblacion, 'anio'>

export const GRUPOS: { id: GrupoId; texto: string }[] = [
  { id: 'bebes', texto: 'Bebés (0-2)' },
  { id: 'ninos', texto: 'Niños (3-11)' },
  { id: 'jovenes', texto: 'Jóvenes (12-17)' },
  { id: 'adultos', texto: 'Adultos' },
  { id: 'mayores', texto: 'Mayores (65+)' },
]
const COLOR: Record<GrupoId, string> = { bebes: '#3d3d3d', ninos: '#6b6b6b', jovenes: '#9a9a9a', adultos: '#d4d4d4', mayores: '#b9b9b9' }

/** Barras apiladas por año. El grupo que usa el servicio elegido se pinta en rojo; el año elegido, enmarcado. */
export default function GraficaPoblacion({ filas, destacados, anio, onAnio }: { filas: FilaPoblacion[]; destacados: GrupoId[]; anio: number; onAnio: (a: number) => void }) {
  if (!filas.length) return null
  const W = 300, H = 132, pie = 16
  const max = Math.max(...filas.map((f) => GRUPOS.reduce((t, g) => t + f[g.id], 0))) || 1
  const ancho = W / filas.length
  const sel = filas.find((f) => f.anio === anio) ?? filas[filas.length - 1]
  const total = (f: FilaPoblacion) => GRUPOS.reduce((t, g) => t + f[g.id], 0)
  const orden: GrupoId[] = [...GRUPOS.map((g) => g.id).filter((g) => !destacados.includes(g)), ...destacados] // destacados abajo
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H + pie}`} className="w-full" role="img" aria-label="Población prevista por año y grupo de edad">
        {filas.map((f, i) => {
          let y = H
          const x = i * ancho
          return (
            <g key={f.anio} onClick={() => onAnio(f.anio)} className="cursor-pointer">
              <rect x={x} y={0} width={ancho} height={H} fill={f.anio === sel.anio ? '#f5f5f5' : 'transparent'} />
              {[...orden].reverse().map((g) => {
                const h = (f[g] / max) * (H - 6)
                y -= h
                return <rect key={g} x={x + 1.5} y={y} width={ancho - 3} height={Math.max(0, h)} fill={destacados.includes(g) ? '#de0029' : COLOR[g]} />
              })}
              {(i % 5 === 0 || f.anio === sel.anio) && <text x={x + ancho / 2} y={H + 12} textAnchor="middle" fontSize="8.5" fill={f.anio === sel.anio ? '#131313' : '#8a8a8a'} fontWeight={f.anio === sel.anio ? 700 : 400}>{f.anio}</text>}
            </g>
          )
        })}
      </svg>
      <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
        {GRUPOS.map((g) => (
          <div key={g.id} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 shrink-0" style={{ background: destacados.includes(g.id) ? '#de0029' : COLOR[g.id] }} />
            <span className={destacados.includes(g.id) ? 'font-semibold' : 'text-texto-2'}>{g.texto}</span>
            <span className="ml-auto tabular-nums">{n(sel[g.id])}</span>
          </div>
        ))}
        <div className="col-span-2 mt-0.5 flex justify-between border-t border-linea pt-0.5"><span className="text-texto-2">Total en {sel.anio}</span><b className="tabular-nums">{n(total(sel))}</b></div>
      </div>
    </div>
  )
}
