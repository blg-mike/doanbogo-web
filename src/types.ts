export type SortMode = 'recent' | 'name' | 'upload'
export type ViewMode = 'cover' | 'list'
export type PaneId = 'primary' | 'secondary'
export type AnnotationTool = 'pan' | 'pen' | 'line' | 'highlight' | 'region-highlight' | 'eraser' | 'text'

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

export interface ProgressGuideScreenPosition {
  position: number
  xStartRatio: number
  xEndRatio: number
  positionOffset?: number
  rowSpacing?: number
  rowSpacingStartRow?: number
  rowSpacingDirection?: 'up' | 'down'
}

export interface ProgressGuide {
  id: string
  position: number
  role?: 'primary' | 'reference'
  xStartRatio?: number
  xEndRatio?: number
  markerProgress?: number
  opacity?: number
  thickness?: number
  rotationPositions?: Partial<Record<'0' | '90' | '180' | '270', ProgressGuideScreenPosition>>
  rowSpacing?: number
  rowSpacingStartRow?: number
  rowSpacingDirection?: 'up' | 'down'
  counterRowOffset?: number
  positionOffset?: number
  name?: string
  color?: string
  linkedCounterId?: string
  chartRegion?: ProgressChartRegion
  focus?: ProgressFocusSettings
}

export interface ProgressChartRegion {
  x: number
  y: number
  width: number
  height: number
  firstRow: number
  lastRow: number
  startCounterRow: number
  repeat: boolean
  direction: 'top-to-bottom' | 'bottom-to-top'
  rowPositions?: number[]
  rowLayout?: { top: number; height: number }
}

export interface ProgressFocusSettings {
  enabled: boolean
  strength: 'low' | 'medium' | 'high'
  range: 0 | 1 | 2
  scope: 'page' | 'region'
  rowSpacing: number
  dimOpacity?: number
  bandHeightRatio?: number
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

export interface RegionHighlight {
  id: string
  x: number
  y: number
  width: number
  height: number
  color: string
  opacity: number
}

export interface PageWorkRecord {
  documentId: string
  pageNumber: number
  rotation?: PageRotation
  horizontalPosition: number
  verticalPosition: number
  horizontalGuides?: ProgressGuide[]
  verticalGuides?: ProgressGuide[]
  progressMigration?: 'pending' | 'complete'
  legacyProgressGuides?: { horizontalGuides: ProgressGuide[]; verticalGuides: ProgressGuide[] }
  annotations: AnnotationRecord[]
  regionHighlights?: RegionHighlight[]
  colorworkGrid?: ColorworkGrid
}

export type PageRotation = 0 | 90 | 180 | 270

export interface DocumentRecord {
  id: string
  kind?: 'pdf' | 'photos'
  fileName: string
  size: number
  pageCount: number
  createdAt: number
  lastOpenedAt: number | null
  tags: string[]
  totalWorkTimeMs?: number
  pdf: Blob | null
  cover: Blob | null
}

export type HomeProjectStatus = 'active' | 'paused' | 'completed'

export interface HomeProject {
  key: string
  entityId: string
  kind: 'document' | 'chart'
  title: string
  fileName?: string
  documentKind?: 'pdf' | 'photos'
  pageCount?: number
  chartCraft?: ChartCraft
  cover: Blob | null
  tags: string[]
  status: HomeProjectStatus
  archivedAt: number | null
  deletedAt: number | null
  lastWorkedAt: number | null
  createdAt: number
  totalWorkTimeMs?: number
}

export interface PhotoPageRecord {
  documentId: string
  pageNumber: number
  blob: Blob
  width: number
  height: number
  addedAt: number
  sourceName: string
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
  hidden: false
  bookmarked: boolean
}

export interface ThumbnailGroup {
  id: string
  name: string
  pageNumbers: number[]
}

export interface PaneSnapshot {
  page: number
  zoom: number
  centerX: number
  centerY: number
  rotations?: Record<number, PageRotation>
}

export type CounterTaskKind = 'decrease' | 'increase'
export type CounterTaskStatus = 'done' | 'missed'
export type CounterKind = 'simple' | 'pattern' | 'task'
export type CounterUnit = 'row' | 'stitch' | 'round'

export interface CounterTaskRule {
  id: string
  kind: CounterTaskKind
  interval: number
  total: number
}

export interface CounterTaskOccurrence {
  ruleId: string
  occurrence: number
  status: CounterTaskStatus
}

export interface CounterTaskRecord {
  row: number
  status: CounterTaskStatus
}

export interface CounterPatternInstruction {
  id: string
  row: number
  message: string
}

export interface CounterSnapshot {
  id: string
  kind: CounterKind
  name: string
  color: string
  pinned: boolean
  linkedToId?: string
  legacyOverflow?: boolean
  value: number
  unit?: CounterUnit
  currentRow?: number
  patternRow?: number
  repeatLength?: number
  startRow?: number
  repeatStartNumber?: number
  repeatCount?: number | null
  taskKind?: CounterTaskKind
  firstTaskRow?: number
  interval?: number
  total?: number
  completedCount?: number
  nextTaskRow?: number
  taskRecords?: CounterTaskRecord[]
  instructions?: CounterPatternInstruction[]
  goalRow?: number | null
  goalFinalSide?: 'rs' | 'ws'
  firstSide?: 'rs' | 'ws'
  goalAlertEnabled?: boolean
  goalCompleted?: boolean
  patternAlertEnabled?: boolean
  patternPreviewEnabled?: boolean
}

export interface CounterHistoryEntry {
  id: string
  label: string
  counters: CounterSnapshot[]
  guides: { pageNumber: number; horizontalGuides: ProgressGuide[]; verticalGuides: ProgressGuide[] }[]
  actualRow: number
  baseCounterId?: string
  timeLapId?: string
  savedAt: number
}

export interface CounterTimeLap {
  id: string
  counterId: string
  sessionId: string
  historyEntryId: string
  elapsedMs: number
  durationMs: number
  rowDelta: -1 | 1
  recordedAt: number
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
  counters?: CounterSnapshot[]
  counterHistory?: CounterHistoryEntry[]
  counterTimeLaps?: CounterTimeLap[]
  collapsedCounterKinds?: Partial<Record<CounterKind, boolean>>
  counterSoundEnabled?: boolean
  counterPreviewEnabled?: boolean
  counterGuideAutoPanId?: string | null
  counterPanelCollapsed?: boolean
  counterMainId?: string
  counterVibrationEnabled?: boolean
  counterAlertAcknowledged?: string
  thumbnailGroups?: ThumbnailGroup[]
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
  usedMeters?: string
  memo?: string
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
  unit?: 'cm' | 'inch'
}

export interface ReportModification {
  id: string
  section: string
  original: string
  changed: string
  memo: string
}

export interface ReportModificationCandidate extends ReportModification {
  source: 'note_extraction' | 'counter'
  status: 'suggested' | 'confirmed' | 'dismissed'
  evidence: string
  fingerprint: string
}

export interface KnittingReport {
  id: string
  documentId: string
  title: string
  createdAt: number
  updatedAt: number
  status?: 'draft' | 'complete'
  completedAt?: number | null
  fields: Record<string, string>
  representativePhoto: string
  yarns: ReportYarn[]
  needles: ReportNeedle[]
  accessories: ReportAccessory[]
  measurements: ReportMeasurement[]
  modifications: ReportModification[]
  finishedPhotos: ReportPhoto[]
  workPhotos: ReportTimelinePhoto[]
  analysisCandidates?: ReportModificationCandidate[]
}
