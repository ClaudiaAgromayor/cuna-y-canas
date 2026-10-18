import { useState, type ReactNode } from 'react'
import { Icono } from './iconos'

export const n = (x: number) => Math.round(x).toLocaleString('es-ES')
export const dec = (x: number, d = 1) => x.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d })

const MINUSCULAS = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'en'])
/** "SUS-PP-2 LOS MOLINOS" -> "Los Molinos"; "SUI-05 PAU-2 EL BERCIAL-UNIVERSIDAD" -> "El Bercial-Universidad". El código oficial se conserva aparte. */
/**
 * Imprime una ficha con un nombre de archivo claro: al guardar en PDF el navegador propone el título de la página,
 * así que se pone "FichaSanFernandoDeHenares" mientras se imprime y después se restaura.
 */
export function imprimirConNombre(tipo: 'barrio' | 'municipio', nombre: string, espera = 100) {
  const camel = nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^A-Za-z0-9]+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('')
  const titulo = document.title
  document.title = `Ficha${camel}`
  document.body.dataset.imprimir = tipo
  const limpiar = () => { delete document.body.dataset.imprimir; document.title = titulo; window.removeEventListener('afterprint', limpiar) }
  window.addEventListener('afterprint', limpiar)
  setTimeout(() => window.print(), espera)
}

/** Parámetros de la dirección al abrir la página. Solo se usan en desarrollo, para sacar capturas de estados concretos (cmp, plano, serv, min). */
export const DIRECCION_INICIAL = new URLSearchParams(typeof location !== 'undefined' ? location.hash.slice(1) : '')
export const ayuda = (k: string) => (import.meta.env.DEV ? DIRECCION_INICIAL.get(k) : null)

export function nombreBarrio(ambito: string | null | undefined): string {
  if (!ambito) return 'Fuera de los barrios en desarrollo'
  // los códigos de planeamiento siempre llevan guion: SUS-PP-2, AA-01, S-I.1, PAU-2
  const sin = ambito.replace(/^(?:[A-Z]{1,5}(?:-[A-Z0-9.]+)+\s+)+/, '').trim()
  if (!sin || (/^[A-Z0-9.\-]+$/.test(sin) && /\d/.test(sin))) return ambito // solo hay código (S-15, PAU-4): se deja tal cual
  if (!/[a-záéíóúñ]/.test(sin)) {
    return sin.toLowerCase().split(/(\s+|-|\()/).map((w, i) => (i > 0 && MINUSCULAS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join('')
      .replace(/(^|\s)(Ii|Iii|Iv|Vi|Vii|Viii|Ix)(?=\s|$)/g, (_m, a: string, r: string) => a + r.toUpperCase()) // números romanos: "La Dehesilla II"
  }
  return sin
}

/** "HEIDI GARABATOS LOS MOLINOS" -> "Heidi Garabatos Los Molinos": los registros vienen en mayúsculas. */
export function capitalizar(t: string): string {
  if (/[a-záéíóúñ]/.test(t)) return t
  return t.toLowerCase().replace(/(^|[\s(\-/,.])([a-záéíóúñü])/g, (_m, a: string, b: string) => a + b.toUpperCase())
    .replace(/(?<=\s)(De|Del|Y|En)(?=\s)/g, (w) => w.toLowerCase())
}

/** Bloque numerado de un panel: "1  Servicio". */
export function Paso({ num, titulo, children, extra }: { num?: number; titulo: string; children: ReactNode; extra?: ReactNode }) {
  return (
    <section className="border-b border-linea px-5 py-5">
      <div className="mb-3 flex items-center gap-2.5">
        {num != null && <span className="flex h-6 w-6 items-center justify-center bg-tinta text-xs font-semibold text-white">{num}</span>}
        <h3 className="text-[15px] font-semibold">{titulo}</h3>
        <div className="ml-auto">{extra}</div>
      </div>
      {children}
    </section>
  )
}

export function Deslizador({ etiqueta, valor, min, max, paso, formato, onChange, ayuda }: {
  etiqueta: string; valor: number; min: number; max: number; paso: number
  formato: (v: number) => string; onChange: (v: number) => void; ayuda?: string
}) {
  const p = max > min ? ((valor - min) / (max - min)) * 100 : 0
  return (
    <label className="mb-4 block last:mb-0">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-texto-2">{etiqueta}</span>
        <span className="font-semibold whitespace-nowrap tabular-nums">{formato(valor)}</span>
      </div>
      <input type="range" min={min} max={max} step={paso} value={valor} style={{ ['--p' as string]: `${p}%` }}
        onChange={(e) => onChange(Number(e.target.value))} aria-label={etiqueta} />
      {ayuda && <div className="text-xs leading-snug text-texto-3">{ayuda}</div>}
    </label>
  )
}

export function Interruptor({ activo, onChange, children }: { activo: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-1.5 text-sm">
      <span className="text-texto-2">{children}</span>
      <button type="button" role="switch" aria-checked={activo} onClick={() => onChange(!activo)}
        className={`relative h-5 w-9 shrink-0 transition-colors ${activo ? 'bg-tinta' : 'bg-linea'}`}>
        <span className={`absolute top-0.5 h-4 w-4 bg-white transition-all ${activo ? 'left-[18px]' : 'left-0.5'}`} />
      </button>
    </label>
  )
}

export function Boton({ children, onClick, primario, icono, className = '' }: { children: ReactNode; onClick?: () => void; primario?: boolean; icono?: string; className?: string }) {
  return (
    <button type="button" onClick={onClick}
      className={`inline-flex items-center justify-center gap-2 border px-3.5 py-2 text-sm transition-colors ${primario
        ? 'border-tinta bg-tinta text-white hover:border-rojo hover:bg-rojo' : 'border-tinta bg-white text-tinta hover:bg-gris-1'} ${className}`}>
      {icono && <Icono nombre={icono} className="h-4 w-4" />}{children}
    </button>
  )
}

export function Aviso({ titulo, children, tono = 'aviso' }: { titulo?: string; children: ReactNode; tono?: 'aviso' | 'info' }) {
  return (
    <div className={`border-l-[3px] bg-gris-1 px-3.5 py-2.5 text-sm leading-snug ${tono === 'aviso' ? 'border-rojo' : 'border-tinta'}`}>
      {titulo && <div className="mb-0.5 font-semibold">{titulo}</div>}
      <div className="text-texto-2">{children}</div>
    </div>
  )
}

export type EstadoId = 'abierto' | 'plan' | 'suelo' | 'prevista' | 'licitada' | 'adjudicada' | 'obras'
export function Estado({ estado }: { estado: EstadoId }) {
  const [t, c] = ({ abierto: ['Abierto', 'bg-ok'], plan: ['Reservado, sin hacer', 'bg-texto-3'], suelo: ['Suelo disponible', 'bg-suelo'], prevista: ['Prevista', 'bg-texto-3'],
    licitada: ['Licitada', 'bg-aviso'], adjudicada: ['Adjudicada', 'bg-aviso'], obras: ['En obras', 'bg-rojo'] } as const)[estado]
  return <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-texto-2"><span className={`h-2 w-2 ${c}`} />{t}</span>
}

export function Linea({ codigo, modo }: { codigo: string; modo: string }) {
  const c = modo === 'metro' ? 'bg-rojo text-white' : modo === 'cercanias' ? 'bg-tinta text-white' : modo === 'urbano' ? 'border border-tinta text-tinta' : 'bg-gris-2 text-tinta'
  return <span className={`inline-block px-1.5 text-[11px] leading-[18px] font-semibold tabular-nums ${c}`}>{codigo}</span>
}

/** Leyenda del mapa: siempre visible en pantallas medianas y grandes; en móvil, plegada tras un botón para no tapar el mapa. */
export function Leyenda({ children }: { children: ReactNode }) {
  const [abierta, setAbierta] = useState(false)
  return (
    <div className="absolute top-3 left-3 text-xs">
      <button type="button" className="border border-tinta bg-white px-2.5 py-1 font-medium shadow-sm md:hidden" onClick={() => setAbierta(!abierta)} aria-expanded={abierta}>
        {abierta ? 'Ocultar leyenda' : 'Leyenda'}
      </button>
      <div className={`${abierta ? 'block' : 'hidden'} pointer-events-none mt-1 bg-white/95 px-3 py-2.5 shadow-sm md:mt-0 md:block`}>{children}</div>
    </div>
  )
}
