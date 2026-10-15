import type { Escenario, Resultado } from './algoritmo'
import type { DatosMunicipio, MunicipioIndice, Servicio } from './tipos'
import { n } from './ui'

function bajar(nombre: string, contenido: string, tipo: string) {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }))
  const a = Object.assign(document.createElement('a'), { href: url, download: nombre })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const fecha = () => new Date().toISOString().slice(0, 10)
const archivo = (s: Servicio, m: MunicipioIndice, ext: string) =>
  `cuna-y-canas_${m.slug}_${s.nombre.toLowerCase().replace(/[^a-záéíóúñ]+/g, '-')}_${fecha()}.${ext}`

export function descargarGeoJSON(r: Resultado, s: Servicio, m: MunicipioIndice) {
  const fc = {
    type: 'FeatureCollection',
    metadata: { municipio: m.nombre, cod_ine: m.cod_ine, servicio: s.nombre, generado: new Date().toISOString(), radio_m: r.radioM },
    features: r.propuestas.map((p) => ({
      type: 'Feature', geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
      properties: { orden: p.orden, ref_catastral: p.ref_catastral, superficie_m2: p.area_m2, ambito: p.ambito, fijada_a_mano: p.fijado,
        demanda_cubierta: p.captada, ocupacion_pct: p.ocupacionPct, personas_en_radio: p.personasEnRadio,
        parada_mas_cercana: p.paradaMasCercana?.nombre ?? null, parada_metros: p.paradaMasCercana?.metros ?? null, cod_ine: m.cod_ine },
    })),
  }
  bajar(archivo(s, m, 'geojson'), JSON.stringify(fc, null, 1), 'application/geo+json')
}

export function descargarInforme(r: Resultado, e: Escenario, s: Servicio, d: DatosMunicipio) {
  const m = d.indice
  const filas = r.propuestas.map((p) => `<tr><td>${p.orden}</td><td>${p.ambito ?? '—'}</td><td>${p.ref_catastral ?? 'punto elegido a mano'}</td>
    <td>${p.area_m2 ? n(p.area_m2) + ' m²' : '—'}</td><td>${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}</td><td>${n(p.captada)}</td>
    <td>${p.paradaMasCercana ? `${p.paradaMasCercana.nombre} (${n(p.paradaMasCercana.metros)} m)` : '—'}</td>
    <td>${p.alternativas.map((a) => `${a.ambito ?? a.ref}: ${a.motivo}`).join('<br>') || '—'}</td></tr>`).join('')
  const bt = (d.demanda?.prueba_con_el_pasado ?? []).map((b) =>
    `<tr><td>${b.ambito}</td><td>${n(b.real)}</td><td>${n(b.prediccion)} (${b.error_pct > 0 ? '+' : ''}${b.error_pct} %)</td><td>${n(b.prediccion_ingenua)} (${b.error_ingenua_pct > 0 ? '+' : ''}${b.error_ingenua_pct} %)</td></tr>`).join('')
  const html = `<!doctype html><html lang="es"><meta charset="utf-8"><title>Cuna y Canas · ${s.nombre} en ${m.nombre}</title>
<style>body{font:14px/1.45 system-ui,sans-serif;max-width:960px;margin:2rem auto;padding:0 1rem;color:#1e293b}h1{color:#be123c}
table{border-collapse:collapse;width:100%;margin:.5rem 0 1.5rem}td,th{border:1px solid #cbd5e1;padding:4px 6px;text-align:left;vertical-align:top}
th{background:#f1f5f9}.nota{color:#64748b;font-size:12px}</style>
<h1>${s.nombre} en ${m.nombre}</h1><p class="nota">Informe generado con Cuna y Canas el ${fecha()}. Código INE ${m.cod_ine}.</p>
<h2>Resumen</h2><table>
<tr><th>Demanda estimada (escenario)</th><td>${n(r.demandaTotal)} ${s.unidad} (hoy ${n(r.demandaActual)}, por llegar ${n(r.demandaFutura)})</td></tr>
<tr><th>Cubierta por centros existentes (${r.existentes.length})</th><td>${n(r.cubiertaExistentes)}</td></tr>
<tr><th>Cubierta por centros nuevos (${r.propuestas.length})</th><td>${n(r.cubiertaNuevos)}</td></tr>
<tr><th>Sin cubrir</th><td>${n(r.sinCubrir)}</td></tr><tr><th>Centros que harían falta</th><td>${r.centrosNecesarios}</td></tr></table>
<h2>Supuestos del escenario</h2><table>
<tr><th>Habitantes por vivienda nueva</th><td>${e.habPorVivienda.toFixed(2)}</td></tr>
<tr><th>Barrios nuevos ya habitados</th><td>${Math.round(e.llenado * 100)} %</td></tr>
<tr><th>Tasa de uso</th><td>${(e.tasaUso * 100).toFixed(1)} % — ${s.nota_tasa}</td></tr>
<tr><th>Capacidad por centro</th><td>${n(e.capacidad)} ${s.unidad}</td></tr>
<tr><th>Tiempo máximo andando</th><td>${e.minutos} min (${n(r.radioM)} m en línea recta)</td></tr>
<tr><th>Superficie mínima de parcela</th><td>${n(e.supMinima)} m²</td></tr></table>
<h2>Ubicaciones propuestas</h2><table><tr><th>#</th><th>Ámbito</th><th>Ref. catastral</th><th>Superficie</th><th>Coordenadas</th><th>Cubre</th><th>Parada más cercana</th><th>Alternativas descartadas</th></tr>${filas}</table>
${bt ? `<h2>Prueba con el pasado</h2><p>Cada barrio se predice con los parámetros de los demás y se compara con su población real (INE).</p>
<table><tr><th>Barrio</th><th>Real</th><th>Modelo</th><th>Regla habitual (viviendas × tamaño medio del hogar)</th></tr>${bt}</table>` : ''}
<p class="nota">Fuentes: IDEM de la Comunidad de Madrid (planeamiento refundido 2025, suelo vacante y ocupado 2026), Portal de Datos Abiertos de la Comunidad de Madrid (centros educativos, sanitarios y sociales; población), INE (Atlas de Distribución de Renta de los Hogares por sección censal), Consorcio Regional de Transportes de Madrid (paradas). Las distancias son en línea recta.</p>`
  bajar(archivo(s, m, 'html'), html, 'text/html')
}
