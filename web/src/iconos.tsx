/** Iconos de línea propios (24×24, trazo 1,75), en el estilo sobrio de las webs de la Comunidad de Madrid. */
const TRAZOS: Record<string, string> = {
  escuela_infantil: 'M5 11h11a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4Zm11 0V7.5A2.5 2.5 0 0 1 18.5 5H20M8 19.5a1.5 1.5 0 1 0 0-.01M15 19.5a1.5 1.5 0 1 0 0-.01M5 11 3.5 7',
  colegio: 'M3 21h18M5 21V10l7-5 7 5v11M10 21v-5h4v5M12 5V2.5h3',
  centro_salud: 'M9.5 3.5h5v6h6v5h-6v6h-5v-6h-6v-5h6z',
  centro_dia: 'M8.5 8a2.5 2.5 0 1 0 0-.01M15.5 8a2.5 2.5 0 1 0 0-.01M4 19c0-3 2-5 4.5-5s4.5 2 4.5 5M11 19c0-3 2-5 4.5-5S20 16 20 19',
  residencia: 'M3.5 11 12 4l8.5 7M5.5 9.5V20h13V9.5M12 17.5l-2.6-2.5a1.6 1.6 0 0 1 2.6-2 1.6 1.6 0 0 1 2.6 2Z',
  buscar: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM15.5 15.5 21 21',
  ubicacion: 'M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11Zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  autobus: 'M6 17V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v11M6 17h12M6 11h12M8 20v-3M16 20v-3M8.5 14h.01M15.5 14h.01',
  suelo: 'M4 20h16M4 20V9l8-5 8 5v11M9 20v-6h6v6',
  descargar: 'M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 20h14',
  guardar: 'M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6',
  aviso: 'M12 8v5M12 16.5h.01M10.3 4.2 2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z',
  check: 'M5 12.5 10 17l9-10',
  externo: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  capas: 'M12 3 3 8l9 5 9-5-9-5ZM3 13l9 5 9-5M3 17.5l9 5 9-5',
  ajustes: 'M4 7h10M18 7h2M4 17h4M12 17h8M16 5v4M10 15v4',
  validar: 'M4 19V5M4 19h16M8 15l3-4 3 2 5-6',
  tren: 'M7 15V6a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v9a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2ZM7 10h10M9.5 13.5h.01M14.5 13.5h.01M9 17l-2 4M15 17l2 4',
  arbol: 'M12 21v-6M12 15c-3.6 0-6-2.2-6-5 0-1.9 1.1-3.4 2.7-4.1C9.2 4.2 10.5 3 12 3s2.8 1.2 3.3 2.9C16.9 6.6 18 8.1 18 10c0 2.8-2.4 5-6 5ZM9 21h6',
  casa_nueva: 'M3.5 11 12 4l8.5 7M5.5 9.5V20h13V9.5M12 11v6M9 14h6',
}

export function Icono({ nombre, className = 'h-5 w-5' }: { nombre: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={TRAZOS[nombre] ?? ''} />
    </svg>
  )
}

/** SVG en texto, para los marcadores HTML del mapa. */
export function iconoSvg(nombre: string): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${TRAZOS[nombre] ?? ''}"/></svg>`
}

/**
 * Logotipo propio (idea de Lucía): la cabeza de un bebé con un solo pelo, y ese pelo es una cana. De la cuna a las canas.
 * Cuadrado rojo en el lenguaje visual de la Comunidad, pero no es su emblema.
 */
export function Logo({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} role="img" aria-label="Cuna y Canas">
      <rect width="40" height="40" fill="#de0029" />
      {/* la cana: un rizo gris claro que sale de la coronilla */}
      <path d="M20 13.2c-.4-3.4 1.2-6.4 4.3-6.9 2.6-.4 4 2 2.6 3.7-1.1 1.3-3.2.6-2.9-1" fill="none" stroke="#d6d6d6" strokeWidth="1.9" strokeLinecap="round" />
      {/* cabeza */}
      <circle cx="20" cy="24" r="11" fill="#fff" />
      {/* ojos cerrados, mofletes y sonrisa */}
      <path d="M14.6 22.6q1.6 1.5 3.2 0M22.2 22.6q1.6 1.5 3.2 0" fill="none" stroke="#131313" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M17.4 27.4q2.6 2.4 5.2 0" fill="none" stroke="#de0029" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="13.6" cy="26.2" r="1.3" fill="#f3b6bf" />
      <circle cx="26.4" cy="26.2" r="1.3" fill="#f3b6bf" />
    </svg>
  )
}
