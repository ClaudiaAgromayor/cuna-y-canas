import { createPortal } from 'react-dom'
import { Logo } from './iconos'
import type { EstadoId } from './ui'
import { dec, n } from './ui'

export interface ItemFicha { id: string; nombre: string; detalle: string; estado: EstadoId; minutos: number }
export interface GrupoFicha { titulo: string; items: ItemFicha[]; masCercano: { nombre: string; minutos: number } | null }

interface Props {
  municipio: string
  lugar: string
  estadoBarrio: string | null
  viviendas: number | null
  foto: { url: string; pagina: string | null } | null
  imagenMapa: string
  radioMin: number
  veredicto: { tienes: number; total: number }
  poblacion: { hoy: number | null; anio: number | null; completo: [number, number] | null }
  previsiones: { servicio: string; texto: string }[]
  grupos: GrupoFicha[]
  paradas: { nombre: string; lineas: string; minutos: number }[]
  suelo: { parcelas: number; m2: number }
}

const ESTADO: Record<EstadoId, string> = { abierto: 'Abierto', plan: 'Reservado, sin hacer', suelo: 'Suelo disponible', prevista: 'Prevista', licitada: 'Licitada', adjudicada: 'Adjudicada', obras: 'En obras' }

/** Ficha del barrio para imprimir o guardar en PDF (A4). Se pinta fuera de la aplicación para que, al imprimir, solo salga esto. */
export default function FichaBarrio(p: Props) {
  const hoy = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
  return createPortal(
    <div className="ficha-imprimible ficha-barrio">
      <header className="flex items-center gap-3 border-b-2 border-tinta pb-2">
        <Logo className="h-9 w-9" />
        <div className="leading-tight"><div className="text-[15pt] font-bold">Cuna y Canas</div><div className="text-[9pt] text-texto-2">Qué hace falta y qué viene en tu barrio</div></div>
        <div className="ml-auto text-right text-[9pt] text-texto-2">Ficha de barrio<br />{hoy}</div>
      </header>

      <section className="mt-4 flex gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-[9pt] font-semibold tracking-wide text-rojo uppercase">{p.municipio}</div>
          <h1 className="text-[22pt] leading-tight font-semibold">{p.lugar}</h1>
          <div className="mt-1 text-[10pt] text-texto-2">{p.estadoBarrio ? `${p.estadoBarrio}${p.viviendas ? ` · ${n(p.viviendas)} viviendas previstas en el planeamiento` : ''}` : 'Fuera de los barrios en desarrollo'}</div>
        </div>
        {p.foto && <img src={p.foto.url} alt="" className="h-[30mm] w-[45mm] object-cover" />}
      </section>

      {p.imagenMapa && (
        <section className="mt-3">
          <img src={p.imagenMapa} alt={`Mapa de ${p.lugar}`} className="w-full border border-linea" style={{ maxHeight: '95mm', objectFit: 'cover' }} />
          <div className="mt-1 flex flex-wrap gap-x-4 text-[8pt] text-texto-2">
            <span>● negro: ya existe</span><span>● gris: en el planeamiento</span><span>● rojo: prevista</span><span>● azul: suelo disponible</span><span>- - círculo: {p.radioMin} min a pie</span>
          </div>
        </section>
      )}

      <section className="mt-4 grid grid-cols-3 border border-tinta">
        <div className="border-r border-linea p-3"><div className="text-[8pt] text-texto-2">De lo que buscas, a menos de {p.radioMin} min</div><div className="text-[20pt] font-semibold">{p.veredicto.tienes}<span className="text-texto-3">/{p.veredicto.total}</span></div></div>
        <div className="border-r border-linea p-3"><div className="text-[8pt] text-texto-2">Población hoy{p.poblacion.anio ? ` (${p.poblacion.anio}, INE)` : ''}</div><div className="text-[20pt] font-semibold">{p.poblacion.hoy != null ? n(p.poblacion.hoy) : '—'}</div></div>
        <div className="p-3"><div className="text-[8pt] text-texto-2">Cuando el barrio esté completo</div><div className="text-[20pt] font-semibold">{p.poblacion.completo ? `${n(p.poblacion.completo[0])}–${n(p.poblacion.completo[1])}` : '—'}</div></div>
      </section>

      {p.previsiones.length > 0 && (
        <section className="mt-4 border-l-[3px] border-rojo bg-gris-1 px-3 py-2">
          <div className="text-[11pt] font-semibold">Lo que hará falta cuando el barrio esté completo</div>
          <ul className="mt-1 text-[10pt]">{p.previsiones.map((x) => <li key={x.servicio}><b>{x.servicio}:</b> {x.texto}</li>)}</ul>
          <div className="mt-1 text-[8pt] text-texto-2">Estimación del modelo con su rango. No atribuye responsabilidades.</div>
        </section>
      )}

      <section className="partible mt-4">
        <h2 className="border-b border-tinta pb-1 text-[12pt] font-semibold">Qué hay cerca y qué viene</h2>
        <table className="mt-1 w-full text-[9pt]">
          <tbody>
            {p.grupos.map((g) => [
              <tr key={g.titulo} className="bg-gris-1"><td colSpan={3} className="px-2 py-1 font-semibold">{g.titulo}</td></tr>,
              ...(g.items.length ? g.items.slice(0, 5).map((x) => (
                <tr key={x.id} className="border-b border-gris-2">
                  <td className="px-2 py-1">{x.nombre}<div className="text-[8pt] text-texto-2">{x.detalle}</div></td>
                  <td className="px-2 py-1 whitespace-nowrap">{ESTADO[x.estado]}</td>
                  <td className="px-2 py-1 text-right whitespace-nowrap">{x.minutos} min</td>
                </tr>
              )) : [<tr key={`${g.titulo}-nada`} className="border-b border-gris-2"><td colSpan={3} className="px-2 py-1 text-texto-2">Ninguno a menos de {p.radioMin} min{g.masCercano ? `. El más cercano: ${g.masCercano.nombre}, a ${g.masCercano.minutos} min.` : '.'}</td></tr>]),
            ])}
          </tbody>
        </table>
        {p.suelo.parcelas > 0 && <p className="mt-2 text-[9pt]"><b>Suelo reservado cerca:</b> {p.suelo.parcelas} parcelas vacantes para equipamientos públicos ({n(p.suelo.m2)} m²), todavía sin construir.</p>}
      </section>

      {p.paradas.length > 0 && (
        <section className="mt-4">
          <h2 className="border-b border-tinta pb-1 text-[12pt] font-semibold">Transporte a menos de 5 minutos</h2>
          <ul className="mt-1 text-[9pt]">{p.paradas.map((x) => <li key={x.nombre} className="border-b border-gris-2 py-1">{x.nombre} · {x.minutos} min<div className="text-[8pt] text-texto-2">{x.lineas}</div></li>)}</ul>
        </section>
      )}

      <footer className="mt-5 border-t border-linea pt-2 text-[7.5pt] leading-snug text-texto-2">
        Datos abiertos de la Comunidad de Madrid (IDEM y Portal de Datos Abiertos), INE (Atlas de Distribución de Renta por sección censal) y Consorcio Regional de Transportes.
        Distancias a pie en línea recta ({dec(p.radioMin * 0.08, 1)} km = {p.radioMin} min). Mapa base © IGN.{p.foto?.pagina ? ` Foto: Wikimedia Commons (licencia libre), ${decodeURIComponent(p.foto.pagina.split('File:')[1] ?? '').replace(/_/g, ' ')}.` : ''} Licitaciones y obras: sin datos todavía.
      </footer>
    </div>,
    document.body,
  )
}
