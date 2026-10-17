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

/** Paso "redondo" del eje (1, 2 o 5 por una potencia de 10) para unas 3 líneas de referencia. */
function paso(max: number) {
  const bruto = max / 3, p = 10 ** Math.floor(Math.log10(bruto || 1)), r = bruto / p
  return (r <= 1 ? 1 : r <= 2 ? 2 : r <= 5 ? 5 : 10) * p
}

/**
 * Población de la zona año a año, centrada en quien usa el servicio elegido:
 * la cifra clave (hoy → último año), barras de ese grupo a su propia escala y, debajo, el reparto de todos los grupos en el año elegido.
 */
export default function GraficaPoblacion({ filas, destacados, anio, onAnio }: { filas: FilaPoblacion[]; destacados: GrupoId[]; anio: number; onAnio: (a: number) => void }) {
  if (!filas.length) return null
  const valor = (f: FilaPoblacion) => destacados.reduce((t, g) => t + f[g], 0)
  const total = (f: FilaPoblacion) => GRUPOS.reduce((t, g) => t + f[g.id], 0)
  const primero = filas[0], ultimo = filas[filas.length - 1]
  const sel = filas.find((f) => f.anio === anio) ?? ultimo
  const cambio = valor(primero) ? (100 * (valor(ultimo) - valor(primero))) / valor(primero) : 0
  const nombre = destacados.length >= GRUPOS.length ? 'Toda la población' : GRUPOS.filter((g) => destacados.includes(g.id)).map((g) => g.texto).join(' y ')

  const W = 300, H = 110, IZQ = 30, DER = 10, pie = 15
  const st = paso(Math.max(...filas.map(valor)))
  const tope = Math.max(st, Math.ceil(Math.max(...filas.map(valor)) / st) * st)
  const ancho = (W - IZQ - DER) / filas.length
  const y = (v: number) => H - (v / tope) * (H - 8)
  const maxGrupo = Math.max(...GRUPOS.map((g) => sel[g.id])) || 1

  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-xs text-texto-2">{nombre}</div>
          <div className="text-[22px] leading-tight font-semibold tabular-nums">{n(valor(primero))} <span className="text-texto-3">→</span> {n(valor(ultimo))}</div>
          <div className="text-xs text-texto-3">de {primero.anio} a {ultimo.anio}</div>
        </div>
        <div className={`text-right text-[22px] leading-tight font-semibold tabular-nums ${cambio > 0.5 ? 'text-rojo' : 'text-tinta'}`}>{cambio > 0 ? '+' : ''}{n(cambio)} %</div>
      </div>

      <svg viewBox={`0 0 ${W} ${H + pie}`} className="mt-2 w-full" role="img" aria-label={`${nombre} por año, de ${primero.anio} a ${ultimo.anio}`}>
        {Array.from({ length: Math.round(tope / st) + 1 }, (_, i) => i * st).map((v) => (
          <g key={v}>
            <line x1={IZQ} x2={W - DER} y1={y(v)} y2={y(v)} stroke={v ? '#ebebeb' : '#131313'} strokeWidth={v ? 1 : 1.2} />
            <text x={IZQ - 4} y={y(v) + 3.5} textAnchor="end" fontSize="9" fill="#8a8a8a">{n(v)}</text>
          </g>
        ))}
        {filas.map((f, i) => {
          const x = IZQ + i * ancho, elegido = f.anio === sel.anio, v = valor(f)
          return (
            <g key={f.anio} onClick={() => onAnio(f.anio)} className="cursor-pointer">
              <rect x={x} y={0} width={ancho} height={H} fill="transparent" />
              <rect x={x + 1.5} y={y(v)} width={ancho - 3} height={H - y(v)} fill={elegido ? '#b10021' : '#de0029'} opacity={elegido ? 1 : 0.55} />
              {elegido && <text x={x + ancho / 2} y={y(v) - 3} textAnchor="middle" fontSize="9.5" fontWeight={700} fill="#131313">{n(v)}</text>}
              {(i % 5 === 0 || elegido) && <text x={x + ancho / 2} y={H + 11} textAnchor="middle" fontSize="9" fill={elegido ? '#131313' : '#8a8a8a'} fontWeight={elegido ? 700 : 400}>{f.anio}</text>}
            </g>
          )
        })}
      </svg>

      <div className="mt-2 border-t border-linea pt-2">
        <div className="mb-1 flex justify-between text-xs text-texto-2"><span>Todos en {sel.anio}</span><b className="text-tinta tabular-nums">{n(total(sel))} personas</b></div>
        {GRUPOS.map((g) => {
          const on = destacados.includes(g.id)
          return (
            <div key={g.id} className="grid grid-cols-[92px_1fr_44px] items-center gap-2 py-0.5 text-xs">
              <span className={on ? 'font-semibold' : 'text-texto-2'}>{g.texto}</span>
              <span className="h-2 bg-gris-1"><span className="block h-full" style={{ width: `${(100 * sel[g.id]) / maxGrupo}%`, background: on ? '#de0029' : '#8a8a8a' }} /></span>
              <span className="text-right tabular-nums">{n(sel[g.id])}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
