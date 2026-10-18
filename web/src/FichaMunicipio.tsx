import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { FeatureCollection } from 'geojson'
import { colorPuesto, formatoCriterio, lista, posicion, type Criterio, type Puntuado } from './criterios'
import type { Futuro, Sitio } from './PantallaMunicipios'
import { Icono, Logo } from './iconos'
import MapaSituacion from './MapaSituacion'
import { dec, n } from './ui'

interface Props {
  r: Puntuado & { puesto: number }
  total: number
  criterios: Criterio[]
  situaciones: string[]
  tiles: { icono: string; valor: string; texto: string }[]
  futuro: Futuro | null
  sitio: Sitio | null
  modelo: string | null
  limites: FeatureCollection
  puestos: Map<string, { puesto: number }>
}

const TONO: Record<string, string> = { neutro: '#8a8a8a', ok: '#1e7d4f', aviso: '#9a5b00', rojo: '#de0029' }

function Titulo({ children }: { children: ReactNode }) {
  return <h2 className="mb-2 border-b-2 border-tinta pb-1 text-[12.5pt] font-semibold">{children}</h2>
}

/** Ficha de un municipio para imprimir o guardar en PDF (A4). Se pinta fuera de la aplicación para que, al imprimir, solo salga esto. */
export default function FichaMunicipio({ r, total, criterios, situaciones, tiles, futuro, sitio, modelo, limites, puestos }: Props) {
  const m = r.m
  const hoy = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
  const conRanking = criterios.length > 0 && Number.isFinite(r.puntos)
  const cifras: [string, string][] = [
    [n(m.poblacion), `habitantes (${m.anio_poblacion})`],
    [m.crecimiento_pct != null ? `${m.crecimiento_pct > 0 ? '+' : ''}${dec(m.crecimiento_pct)} %` : '—', `población desde ${m.periodo_crecimiento.split('-')[0]}`],
    [`${dec(m.dist_madrid_km, 0)} km`, 'a la Puerta del Sol'],
    [m.corona ? `Zona ${m.corona}` : '—', 'del abono de transporte'],
  ]

  return createPortal(
    <div className="ficha-imprimible ficha-municipio">
      <header className="flex items-center gap-3 border-b-2 border-tinta pb-2">
        <Logo className="h-9 w-9" />
        <div className="leading-tight"><div className="text-[14pt] font-bold">Cuna y Canas</div><div className="text-[8.5pt] text-texto-2">Qué hace falta y qué viene en tu municipio</div></div>
        <div className="ml-auto text-right text-[8.5pt] text-texto-2">Ficha de municipio<br />{hoy}</div>
      </header>

      {/* 1. Quién es */}
      <section className="mt-4 flex gap-5">
        <div className="min-w-0 flex-1">
          <div className="text-[8.5pt] font-semibold tracking-wide text-rojo uppercase">Comunidad de Madrid · código INE 28{m.cod_ine}</div>
          <h1 className="text-[26pt] leading-[1.1] font-semibold tracking-tight">{m.nombre}</h1>
          <div className="mt-3 grid grid-cols-4 border-y border-tinta">
            {cifras.map(([v, t], i) => (
              <div key={t} className={`px-2 py-2 ${i ? 'border-l border-linea' : ''}`}>
                <div className="text-[14pt] leading-tight font-semibold">{v}</div>
                <div className="text-[7.5pt] leading-snug text-texto-2">{t}</div>
              </div>
            ))}
          </div>
        </div>
        {m.foto && <img src={m.foto} alt="" className="h-[36mm] w-[52mm] shrink-0 object-cover" />}
      </section>

      {/* 2. Cómo encaja con lo que buscas, con su situación en el mapa */}
      <section className="mt-5 grid grid-cols-[58mm_1fr] gap-5">
        <div>
          <MapaSituacion limites={limites} cod={m.cod_ine} color={(c) => (conRanking ? colorPuesto(puestos.get(c)?.puesto) : '#ebebeb')} />
          <p className="mt-1 text-[7.5pt] leading-snug text-texto-2">
            <span className="mr-1 inline-block h-2 w-2 bg-rojo" />{m.nombre}
            {conRanking && <><span className="mr-1 ml-2 inline-block h-2 w-2" style={{ background: '#b50f2b' }} />los 15 que mejor encajan</>}
          </p>
        </div>
        <div>
          {conRanking ? (
            <>
              <div className="flex items-baseline gap-3">
                <div className="text-[30pt] leading-none font-semibold">{Math.round(r.puntos)} %</div>
                <div className="text-[9.5pt] text-texto-2">de coincidencia con lo que buscas<br />Puesto <b className="text-tinta">{r.puesto}</b> de {total} municipios</div>
              </div>
              {situaciones.length > 0 && <div className="mt-2 text-[8.5pt] text-texto-2">Buscabas: <b className="text-tinta">{lista(situaciones.map((s) => `«${s}»`))}</b>.</div>}
              <table className="mt-2 w-full text-[8.5pt]">
                <tbody>
                  {criterios.slice(0, 12).map((c) => {
                    const p = r.detalle[c.id]
                    return (
                      <tr key={c.id} className="border-b border-gris-2 align-top">
                        <td className="py-1 pr-2">{c.texto}<div className="text-[7pt] text-texto-3">{c.fuente}</div></td>
                        <td className="py-1 pr-2 whitespace-nowrap">{formatoCriterio(c, m)}</td>
                        <td className="w-[26mm] py-1">
                          <div className="mt-1 h-[2mm] bg-gris-2"><div className="h-full bg-tinta" style={{ width: `${p ?? 0}%` }} /></div>
                          <div className="text-[7pt] text-texto-2">{posicion(p)}</div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {criterios.length > 12 && <div className="mt-1 text-[7.5pt] text-texto-3">Y {criterios.length - 12} criterios más en la web.</div>}
            </>
          ) : (
            <p className="text-[10pt] text-texto-2">Elige tu situación o lo que te importa en la web para ver cómo encaja {m.nombre} con lo que buscas.</p>
          )}
        </div>
      </section>

      {/* 3. Lo que hay */}
      <section className="mt-5">
        <Titulo>Lo que hay hoy</Titulo>
        <div className="grid grid-cols-4 gap-x-4 gap-y-2.5">
          {tiles.map((t) => (
            <div key={t.texto} className="flex gap-2">
              <Icono nombre={t.icono} className="mt-0.5 h-4 w-4 shrink-0 text-texto-2" />
              <div><div className="text-[13pt] leading-tight font-semibold">{t.valor}</div><div className="text-[7.5pt] leading-snug text-texto-2">{t.texto}</div></div>
            </div>
          ))}
        </div>
      </section>

      {/* 4. Lo que viene */}
      <section className="mt-5">
        <Titulo>Lo que viene</Titulo>
        {futuro ? (
          <>
            <p className="text-[10pt]">El planeamiento prevé <b>{n(m.viviendas_previstas!)} viviendas</b> en {m.ambitos_desarrollo} {m.ambitos_desarrollo === 1 ? 'ámbito' : 'ámbitos'} de desarrollo; según el catastro, <b>{n(m.viviendas_pendientes ?? m.viviendas_previstas!)}</b> aún están sin construir. Cuando estén habitadas pueden llegar <b>entre {n(futuro.pob[0])} y {n(futuro.pob[2])} personas</b> más.</p>
            <table className="mt-2 w-full text-[9.5pt]">
              <thead><tr className="border-b border-tinta text-left text-[8pt] text-texto-2"><th className="py-1 font-medium">Servicio</th><th className="py-1 text-right font-medium">Lo que hará falta por la población nueva</th></tr></thead>
              <tbody>
                {futuro.items.map(({ s, plazas, centros }) => (
                  <tr key={s.nombre} className="border-b border-gris-2">
                    <td className="py-1">{s.nombre}</td>
                    <td className="py-1 text-right">{s.unidad === 'plazas'
                      ? (plazas[1] < 1 ? 'no hace falta ampliar' : <>entre <b>{n(plazas[0])}</b> y <b>{n(plazas[1])}</b> plazas más</>)
                      : (centros[1] < 0.15 ? 'basta con los actuales' : <>el equivalente a <b>{dec(centros[1], 1)}</b> {centros[1] < 1.5 ? 'centro' : 'centros'}</>)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1 text-[7.5pt] text-texto-3">Estimación con el modelo calibrado con {modelo ?? '28 barrios nuevos'}, con su rango. Es lo que hará falta además de lo que ya existe.</p>
            {sitio && (
              <div className="mt-3 border-l-[3px] bg-gris-1 px-3 py-2 text-[9.5pt]" style={{ borderColor: TONO[sitio.tono] }}>
                <b>¿Hay sitio para lo que viene? {sitio.titulo}.</b> Tiene {n(m.parcelas_equip ?? 0)} parcelas vacantes de equipamiento ({n((m.suelo_equip_m2 ?? 0) / 10000)} ha); en {n(sitio.grandes)} cabría un colegio (8.000 m² o más) y en {n(m.parcelas_equip_1500 ?? 0)} una escuela infantil o un centro de día. La población nueva necesitaría el equivalente a {dec(sitio.colegios, 1)} {sitio.colegios < 1.5 ? 'colegio' : 'colegios'}.
              </div>
            )}
          </>
        ) : <p className="text-[10pt] text-texto-2">{m.planeamiento_en_idem ? 'El planeamiento vigente no prevé nuevas viviendas en ámbitos de desarrollo.' : 'El planeamiento de este municipio no está en la base refundida de la IDEM.'}</p>}
      </section>

      {/* 5. Su gente */}
      <section className="mt-5">
        <Titulo>Su gente</Titulo>
        <div className="grid grid-cols-3 gap-x-6 gap-y-1 text-[9.5pt]">
          {([
            ['Menores de 15 años', `${dec(m.pct_menores15)} %`], ['65 años o más', `${dec(m.pct_mayores65)} %`], [`Nacimientos (${m.anio_nacidos})`, m.nacidos != null ? n(m.nacidos) : 'sin datos'],
            ['Renta por habitante', m.renta_per_capita != null ? `${n(m.renta_per_capita)} €` : 'sin datos'], ['Paro registrado', m.paro_por_100 != null ? `${dec(m.paro_por_100)} por 100 hab.` : 'sin datos'], ['Densidad', `${n(m.densidad)} hab./km²`],
          ] as [string, string][]).map(([t, v]) => (
            <div key={t} className="flex justify-between gap-2 border-b border-gris-2 py-1"><span className="text-texto-2">{t}</span><b>{v}</b></div>
          ))}
        </div>
      </section>

      <footer className="mt-5 border-t border-linea pt-2 text-[7pt] leading-snug text-texto-2">
        <b className="text-tinta">Cómo se calcula.</b> Cada criterio compara el municipio con los demás que cumplen tus filtros: el mejor saca 100 y el peor, 0; la coincidencia es la media. En los servicios cuenta cuántos hay para elegir (60 %) y que haya al menos los normales para su población (40 %); si no hay ninguno, 0.
        {' '}<b className="text-tinta">Fuentes</b>, todas abiertas y descargadas por API: Portal de Datos Abiertos de la Comunidad de Madrid (padrón, nacimientos, centros educativos, sanitarios y sociales, farmacias, bibliotecas, renta y paro), IDEM (límites y planeamiento 2025), Consorcio Regional de Transportes (estaciones, líneas y zonas tarifarias) e INE. Distancias en línea recta.{m.foto_pagina ? ` Foto: Wikimedia Commons (licencia libre), ${decodeURIComponent(m.foto_pagina.split('File:')[1] ?? '').replace(/_/g, ' ')}.` : ''}
      </footer>
    </div>,
    document.body,
  )
}
