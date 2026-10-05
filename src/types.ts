export type SortMode = 'recent' | 'name' | 'upload'
export type ViewMode = 'cover' | 'list'
export type PaneId = 'primary' | 'secondary'
export type AnnotationTool = 'pan' | 'pen' | 'line' | 'highlight' | 'eraser' | 'text'

export interface ProgressLineStyle {
  visible: boolean
  color: string
  thickness: number
  opacity: number
}

export interface ProgressSettings {
  horizontal: ProgressLineStyle
  vertical: ProgressLineStyle
}

export interface ProgressGuide {
  id: string
  position: number
}

export interface AnnotationStyle {
  color: string
  thickness: number
  opacity: number
  fontSize: number
}

export interface AnnotationSettings {
  pen: AnnotationStyle
  line: AnnotationStyle
  highlight: AnnotationStyle
  text: AnnotationStyle
}

export interface ColorworkSettings {
  chartWidthCm: number
  chartHeightCm: number
  gaugeStitches: number
  gaugeRows: number
}

export interface ColorworkCell {
  color: string
  opacity: number
}

export interface ColorworkGrid extends ColorworkSettings {
  columns: number
  rows: number
  x: number
  y: number
  displayWidth: number
  displayHeight: number
  visible: boolean
  cells: (ColorworkCell | null)[]
}

export interface ColorworkCreateRequest {
  id: string
  paneId: PaneId
  pageNumber: number
  settings: ColorworkSettings
}

export interface AnnotationRecord {
  id: string
  type: 'pen' | 'line' | 'highlight' | 'text'
  points: { x: number; y: number }[]
  text?: string
  boxWidth?: number
  boxHeight?: number
  style: AnnotationStyle
}

export interface PageWorkRecord {
  documentId: string
  pageNumber: number
  rotation?: PageRotation
  horizontalPosition: number
  verticalPosition: number
  horizontalGuides?: ProgressGuide[]
  verticalGuides?: ProgressGuide[]
  annotations: AnnotationRecord[]
  colorworkGrid?: ColorworkGrid
}

export type PageRotation = 0 | 90 | 180 | 270

export interface DocumentRecord {
  id: string
  fileName: string
  size: number
  pageCount: number
  createdAt: number
  lastOpenedAt: number | null
  tags: string[]
  pdf: Blob
  cover: Blob | null
}

export interface PageRecognitionRecord {
  documentId: string
  pageNumber: number
  version: 1
  pdfLinksDone: boolean
  pdfLinks: { x: number; y: number; width: number; height: number; href: string }[]
  qrLinksDone: boolean
  qrLinks: { x: number; y: number; width: number; height: number; href: string }[]
  qrInputMaxDimension: number
}

export interface PageRecord {
  documentId: string
  pageNumber: number
  hidden: boolean
  bookmarked: boolean
}

export interface PaneSnapshot {
  page: number
  zoom: number
  centerX: number
  centerY: number
  rotations?: Record<number, PageRotation>
}

export interface ViewerSnapshot {
  documentId: string
  split: boolean
  splitInitialized?: boolean
  activePane: PaneId
  primary: PaneSnapshot
  secondary: PaneSnapshot
  wideRatio: number
  tallRatio: number
  progressSettings?: ProgressSettings
  annotationSettings?: AnnotationSettings
  updatedAt: number
}

export interface PreferenceRecord {
  key: string
  value: string
}

export type ChartCraft = 'knitting' | 'crochet'
export type ChartUnit = 'in' | 'cm'
export type CrochetSymbolId = 'chain' | 'slip' | 'single' | 'half-double' | 'double' | 'treble'

export interface CrochetSymbolObject {
  id: string
  symbol: CrochetSymbolId
  x: number
  y: number
  scale: number
  rotation: number
  color: string
  layerId: string
}

export interface ChartLayer {
  id: string
  name: string
  visible: boolean
  locked: boolean
}

export interface ChartDocument {
  id: string
  title: string
  craft: ChartCraft
  createdAt: number
  updatedAt: number
  lastOpenedAt: number | null
  unit: ChartUnit
  width: number
  height: number
  gaugeStitches: number
  gaugeRows: number
  palette: string[]
  cells: (string | null)[]
  objects: CrochetSymbolObject[]
  layers: ChartLayer[]
}

export interface ReportPhoto {
  id: string
  label: string
  dataUrl: string
}

export interface ReportTimelinePhoto extends ReportPhoto {
  uploadedAt: number
  activityDate: string
}

export interface ReportYarn {
  id: string
  photo: string
  brand: string
  product: string
  colorName: string
  colorNumber: string
  lot: string
  fiber: string
  country: string
  weightClass: string
  recommendedNeedle: string
  skeinWeight: string
  skeinLength: string
  retailer: string
  purchaseLink: string
  price: string
  quantity: string
  usedSkeins: string
  usedWeight: string
  leftover: string
}

export interface ReportNeedle {
  id: string
  section: string
  type: string
  size: string
  cableLength: string
  memo: string
}

export interface ReportAccessory {
  id: string
  photo: string
  type: string
  size: string
  quantity: string
  detail: string
}

export interface ReportMeasurement {
  id: string
  label: string
  pattern: string
  finished: string
}

export interface ReportModification {
  id: string
  section: string
  original: string
  changed: string
  memo: string
}

export interface KnittingReport {
  id: string
  documentId: string
  title: string
  createdAt: number
  updatedAt: number
  fields: Record<string, string>
  representativePhoto: string
  yarns: ReportYarn[]
  needles: ReportNeedle[]
  accessories: ReportAccessory[]
  measurements: ReportMeasurement[]
  modifications: ReportModification[]
  finishedPhotos: ReportPhoto[]
  workPhotos: ReportTimelinePhoto[]
}
