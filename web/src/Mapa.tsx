import { useEffect, useRef, useState } from 'react'
import maplibregl, { type LayerSpecification, type MapLayerMouseEvent } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { FeatureCollection } from 'geojson'

export interface CapaMapa {
  id: string
  datos: FeatureCollection
  estilo: Omit<LayerSpecification, 'id' | 'source'>
  visible?: boolean
  popup?: (p: Record<string, unknown>) => string
}

export interface Marcador {
  id: string
  lon: number
  lat: number
  texto: string
  color: string
  arrastrable?: boolean
  titulo?: string
  html?: string      // contenido HTML (un icono SVG) en lugar de texto
  clase?: string     // clase CSS adicional, p. ej. "pequeno"
}

interface Props {
  bbox: [number, number, number, number]
  capas: CapaMapa[]
  marcadores?: Marcador[]
  onClickCapa?: (capa: string, propiedades: Record<string, unknown>, lngLat: [number, number]) => void
  onArrastrar?: (id: string, lon: number, lat: number) => void
  onClickMapa?: (lon: number, lat: number) => void
  centrarEn?: [number, number] | null
}

// Mapa base oficial del Instituto Geográfico Nacional (IGN Base, WMTS público), atenuado para que destaquen los datos
const IGN = 'https://www.ign.es/wmts/ign-base?layer=IGNBaseTodo&style=default&tilematrixset=GoogleMapsCompatible&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image%2Fjpeg&TileMatrix={z}&TileCol={x}&TileRow={y}'
const ESTILO_BASE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    base: { type: 'raster', tileSize: 256, tiles: [IGN], maxzoom: 19,
      attribution: '© IGN · Datos: Comunidad de Madrid, INE, CRTM' },
  },
  layers: [{ id: 'base', type: 'raster', source: 'base', paint: { 'raster-saturation': -0.75, 'raster-brightness-min': 0.15, 'raster-contrast': -0.1 } }],
}

export default function Mapa({ bbox, capas, marcadores = [], onClickCapa, onArrastrar, onClickMapa, centrarEn }: Props) {
  const div = useRef<HTMLDivElement>(null)
  const mapa = useRef<maplibregl.Map | null>(null)
  const listo = useRef(false)
  const marcas = useRef(new Map<string, maplibregl.Marker>())
  const callbacks = useRef({ onClickCapa, onArrastrar, onClickMapa })
  callbacks.current = { onClickCapa, onArrastrar, onClickMapa }
  const capasRef = useRef(capas)
  capasRef.current = capas
  const bboxRef = useRef(bbox)
  bboxRef.current = bbox

  useEffect(() => {
    const m = new maplibregl.Map({ container: div.current!, style: ESTILO_BASE, bounds: bbox, fitBoundsOptions: { padding: 30 }, attributionControl: { compact: true } })
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    m.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left')
    // las capas de datos se añaden en cuanto el estilo está listo, sin esperar a que lleguen las teselas del mapa base
    m.once('style.load', () => { listo.current = true; sincronizar(m, capasRef.current) })
    m.on('click', (ev: MapLayerMouseEvent) => {
      const ids = capasRef.current.filter((c) => c.visible !== false && m.getLayer(c.id)).map((c) => c.id)
      const f = m.queryRenderedFeatures(ev.point, { layers: ids })[0]
      if (f) {
        const capa = capasRef.current.find((c) => c.id === f.layer.id)
        if (capa?.popup) new maplibregl.Popup({ maxWidth: '320px' }).setLngLat(ev.lngLat).setHTML(capa.popup(f.properties)).addTo(m)
        callbacks.current.onClickCapa?.(f.layer.id, f.properties, [ev.lngLat.lng, ev.lngLat.lat])
      } else {
        callbacks.current.onClickMapa?.(ev.lngLat.lng, ev.lngLat.lat)
      }
    })
    m.on('mousemove', (ev) => {
      const ids = capasRef.current.filter((c) => c.popup && c.visible !== false && m.getLayer(c.id)).map((c) => c.id)
      m.getCanvas().style.cursor = m.queryRenderedFeatures(ev.point, { layers: ids }).length ? 'pointer' : ''
    })
    // el contenedor cambia de tamaño con la rejilla de la página: el mapa se ajusta y se reencuadra la primera vez
    let encuadrado = false
    const ro = new ResizeObserver(() => {
      m.resize()
      if (!encuadrado && div.current && div.current.clientWidth > 50) { m.fitBounds(bboxRef.current, { padding: 30, duration: 0 }); encuadrado = true }
    })
    ro.observe(div.current!)
    mapa.current = m
    setGeneracion((g) => g + 1) // vuelve a colocar los marcadores en el mapa nuevo
    if (import.meta.env.DEV) (window as unknown as { __mapa: maplibregl.Map }).__mapa = m // para depurar desde la consola
    return () => {
      // los marcadores pertenecen a este mapa: si no se borran, quedarían enganchados a un mapa ya destruido
      marcas.current.forEach((mk) => mk.remove()); marcas.current.clear()
      ro.disconnect(); m.remove(); mapa.current = null; listo.current = false
    }
    // el mapa se crea una vez; bbox cambia con el municipio y se gestiona abajo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { mapa.current?.fitBounds(bbox, { padding: 30, duration: 800 }) }, [bbox])
  useEffect(() => { if (centrarEn) mapa.current?.flyTo({ center: centrarEn, zoom: 14.4, duration: 900 }) }, [centrarEn])
  useEffect(() => { if (mapa.current && listo.current) sincronizar(mapa.current, capas) }, [capas])

  const [generacion, setGeneracion] = useState(0)
  useEffect(() => {
    const m = mapa.current
    if (!m) return
    const vivos = new Set(marcadores.map((x) => x.id))
    for (const [id, mk] of marcas.current) if (!vivos.has(id)) { mk.remove(); marcas.current.delete(id) }
    for (const x of marcadores) {
      let mk = marcas.current.get(x.id)
      const el = mk?.getElement() ?? document.createElement('div')
      el.className = `marcador ${x.clase ?? ''}`
      el.style.background = x.color
      if (x.html) el.innerHTML = x.html
      else el.textContent = x.texto
      el.style.cursor = x.arrastrable ? 'grab' : 'default'
      el.title = x.titulo ?? ''
      if (!mk) {
        mk = new maplibregl.Marker({ element: el, draggable: !!x.arrastrable }).setLngLat([x.lon, x.lat]).addTo(m)
        mk.on('dragend', () => { const p = mk!.getLngLat(); callbacks.current.onArrastrar?.(x.id, p.lng, p.lat) })
        marcas.current.set(x.id, mk)
      } else {
        mk.setLngLat([x.lon, x.lat]).setDraggable(!!x.arrastrable)
      }
    }
  }, [marcadores, generacion])

  return <div ref={div} className="h-full w-full" />
}

function sincronizar(m: maplibregl.Map, capas: CapaMapa[]) {
  const ids = new Set(capas.map((c) => c.id))
  for (const l of m.getStyle().layers ?? []) {
    if (l.id !== 'base' && !ids.has(l.id)) { m.removeLayer(l.id); if (m.getSource(l.id)) m.removeSource(l.id) }
  }
  for (const c of capas) {
    const src = m.getSource(c.id) as maplibregl.GeoJSONSource | undefined
    if (src) src.setData(c.datos)
    else m.addSource(c.id, { type: 'geojson', data: c.datos })
    if (!m.getLayer(c.id)) m.addLayer({ id: c.id, source: c.id, ...c.estilo } as LayerSpecification)
    else {
      const paint = (c.estilo as { paint?: Record<string, unknown> }).paint ?? {}
      for (const [k, v] of Object.entries(paint)) m.setPaintProperty(c.id, k, v)
    }
    m.setLayoutProperty(c.id, 'visibility', c.visible === false ? 'none' : 'visible')
  }
  // respetar el orden de la lista: la última capa queda encima
  for (const c of capas) m.moveLayer(c.id)
}
