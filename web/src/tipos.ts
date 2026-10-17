import type { FeatureCollection, Point, Polygon, MultiPolygon } from 'geojson'

export type Rango = [number, number, number] // [mínimo, central, máximo]

export interface MunicipioIndice {
  cod_ine: string
  slug: string
  carpeta: string
  nombre: string
  centro: [number, number]
  bbox: [number, number, number, number]
  poblacion: number | null
  anio_poblacion: string | null
  viviendas_previstas: number | null
  capas: Record<string, boolean>
  tablas: Record<string, boolean>
  faltan: string[]
  completo?: boolean
}

export type ServicioId = 'escuela_infantil' | 'colegio' | 'centro_salud' | 'centro_dia' | 'residencia'

export interface Servicio {
  nombre: string
  etapa: string
  grupo: string[]
  tasa_uso: Rango
  nota_tasa: string
  capacidad: Rango
  unidad: string
  sup_min_m2: number
  minutos_andando: number
  escala?: 'municipio' // residencias: se eligen en todo el municipio, no por cercanía
  existentes: {
    capa: string
    campo: string
    valores: string[]
    titularidad?: string[]
    sector_contiene?: string
    excluir_subtipo?: string[]
    campo_capacidad?: string
  }
}

export interface PuntoDemanda {
  tipo: 'actual' | 'futuro'
  origen: string
  ambito: string | null
  pob: number
  g0_2: number
  g3_5: number
  g6_11: number
  g12_17: number
  g65: number
  cod_ine: string
}

export interface Parcela {
  ref_catastral: string
  area_m2: number
  ambito: string | null
  fecha_alta: string
  lon: number
  lat: number
  cod_ine: string
  red?: string | null // añadido en el navegador: red pública del planeamiento en la que cae
}

export interface AmbitoDemanda {
  ambito: string
  clase_suelo: string
  viviendas: number | null
  estado: 'habitado' | 'en_desarrollo' | 'futuro' | 'sin_datos'
  pct_residencial_vacante: number | null
  poblacion_actual: number | null
  anio_poblacion_actual: number | null
  poblacion_completo?: Rango
  grupos_completo?: Record<string, Rango>
}

export interface PruebaPasado {
  ambito: string
  anio: number
  real: number
  prediccion: number
  error_pct: number
  prediccion_ingenua: number
  error_ingenua_pct: number
  rango: [number, number]
  dentro_del_rango: boolean
}

export interface Demanda {
  cod_ine: string
  modelo: string
  calibracion: {
    municipio: string
    fuente: string
    criterio: string
    barrios: { ambito: string; viviendas: number; poblacion: number; hab_por_vivienda: number; serie: Record<string, number> }[]
    parametros: { hab_por_vivienda: Rango; pct_menores18: Rango; pct_mayores65: Rango }
    reparto_menores: Record<string, number>
    tam_hogar_mediano_municipio: number
  }
  prueba_con_el_pasado: PruebaPasado[]
  ambitos: AmbitoDemanda[]
}

export interface DatosMunicipio {
  indice: MunicipioIndice
  encuadre: [number, number, number, number] // zona habitada y por habitar: lo que interesa ver al abrir el mapa
  ambitos: FeatureCollection<Polygon | MultiPolygon>
  parcelas: FeatureCollection<Polygon | MultiPolygon, Parcela>
  demandaPuntos: FeatureCollection<Point, PuntoDemanda>
  educativos: FeatureCollection<Point>
  sanitarios: FeatureCollection<Point>
  sociales: FeatureCollection<Point>
  farmacias: FeatureCollection<Point>
  viviendaNueva: FeatureCollection // solares residenciales vacantes (IDEM, suelo vacante y ocupado)
  portalSuelo: FeatureCollection   // suelo público en venta o concesión (Portal del Suelo)
  paradas: FeatureCollection<Point>
  zonasSalud: FeatureCollection<Polygon | MultiPolygon>
  redes: FeatureCollection<Polygon | MultiPolygon>
  demanda: Demanda | null
}
