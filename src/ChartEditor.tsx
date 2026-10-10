import { formatNumber, t, type LocaleKey } from './locales/index'
import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import BrandLoading from './BrandLoading'
import { ArrowLeft, Check, ChevronDown, Copy, Download, Eraser, FlipHorizontal2, FlipVertical2, Hand, Layers, Minus, MousePointer2, PaintBucket, Paintbrush, Plus, Redo2, RotateCcw, RotateCw, Save, Trash2, Undo2 } from 'lucide-react'
import { crochetSymbols, exportChart } from './charts'
import { getChart, markProjectWorked, saveChart } from './storage'
import { DESIGN_SYSTEM_COLORS } from './designTokens'
import type { ChartDocument, ChartLayer, CrochetSymbolId, CrochetSymbolObject } from './types'
import './Chart.css'

type GridTool = 'paint' | 'erase' | 'fill' | 'select' | 'pan'
type CellRect = { left: number; top: number; right: number; bottom: number }

function SymbolGlyph({ symbol }: { symbol: CrochetSymbolId }) {
  if (symbol === 'chain') return <ellipse cx="20" cy="25" rx="8" ry="13" fill="#fff" />
  if (symbol === 'slip') return <circle cx="20" cy="25" r="5" fill="currentColor" />
  if (symbol === 'single') return <path d="M11 16L29 34M29 16L11 34" />
  if (symbol === 'half-double') return <path d="M8 40H32M20 12V40M9 20H31" />
  if (symbol === 'double') return <path d="M8 40H32M20 12V40M9 20H31M16 27L23 24" />
  return <path d="M8 40H32M20 12V40M9 20H31M16 26L23 23M16 34L23 31" />
}

function cloneChart(chart: ChartDocument): ChartDocument {
  return { ...chart, palette: [...chart.palette], cells: [...chart.cells], objects: chart.objects.map((item) => ({ ...item })), layers: chart.layers.map((item) => ({ ...item })) }
}

function cellIndex(chart: ChartDocument, col: number, row: number) {
  return row * chart.width + col
}

function normalizedRect(a: { col: number; row: number }, b: { col: number; row: number }): CellRect {
  return { left: Math.min(a.col, b.col), right: Math.max(a.col, b.col), top: Math.min(a.row, b.row), bottom: Math.max(a.row, b.row) }
}

export default function ChartEditor() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [chart, setChart] = useState<ChartDocument | null>(null)
  const [missing, setMissing] = useState(false)
  const chartRef = useRef<ChartDocument | null>(null)
  const [past, setPast] = useState<ChartDocument[]>([])
  const [future, setFuture] = useState<ChartDocument[]>([])
  const pastRef = useRef<ChartDocument[]>([])
  const futureRef = useRef<ChartDocument[]>([])
  const [saveStatus, setSaveStatus] = useState<'saving' | 'saved' | 'error'>('saved')
  const [selectedColor, setSelectedColor] = useState('#e34b4b')
  const [tool, setTool] = useState<GridTool>('paint')
  const [selectedSymbol, setSelectedSymbol] = useState<CrochetSymbolId>('single')
  const [selectedObjects, setSelectedObjects] = useState<string[]>([])
  const selectedObjectsRef = useRef<string[]>([])
  selectedObjectsRef.current = selectedObjects
  const [activeLayer, setActiveLayer] = useState('')
  const [zoom, setZoom] = useState(1)
  const [cellSelection, setCellSelection] = useState<CellRect | null>(null)
  const [freeformSelection, setFreeformSelection] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const [exporting, setExporting] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const pointerRef = useRef<{ col: number; row: number } | null>(null)
  const strokeBeforeRef = useRef<ChartDocument | null>(null)
  const strokeDraftRef = useRef<ChartDocument | null>(null)
  const selectionStartRef = useRef<{ col: number; row: number } | null>(null)
  const panStartRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null)
  const objectDragRef = useRef<{ before: ChartDocument; x: number; y: number; ids: string[] } | null>(null)
  const freeSelectionStartRef = useRef<{ x: number; y: number } | null>(null)
  const freeformSvgRef = useRef<SVGSVGElement>(null)
  const clipboardRef = useRef<{ width: number; height: number; cells: (string | null)[] } | null>(null)

  useEffect(() => {
    let active = true
    void getChart(id).then(async (saved) => {
      if (!active) return
      if (!saved) { setMissing(true); return }
      setMissing(false)
      const opened = { ...saved, lastOpenedAt: Date.now() }
      const persisted = await saveChart(opened)
      await markProjectWorked('chart', id)
      if (!active) return
      chartRef.current = persisted
      setChart(persisted)
      setActiveLayer(persisted.layers[0]?.id ?? '')
      setSaveStatus('saved')
    }).catch(() => { if (active) setMissing(true) })
    return () => { active = false }
  }, [id])

  useEffect(() => {
    if (!chart || chart.id !== id) return
    setSaveStatus('saving')
    const timeout = window.setTimeout(() => {
      void saveChart(chart).then((saved) => {
        void markProjectWorked('chart', saved.id)
        if (chartRef.current?.id === saved.id) setSaveStatus('saved')
      }).catch(() => setSaveStatus('error'))
    }, 450)
    return () => window.clearTimeout(timeout)
  }, [chart, id])

  const transition = useCallback((next: ChartDocument) => {
    const previous = chartRef.current
    if (!previous || JSON.stringify(previous) === JSON.stringify(next)) return
    pastRef.current = [...pastRef.current.slice(-39), previous]
    futureRef.current = []
    setPast(pastRef.current)
    setFuture([])
    chartRef.current = next
    setChart(next)
  }, [])

  const finishGesture = useCallback((before: ChartDocument | null, after: ChartDocument | null) => {
    if (!before || !after || JSON.stringify(before) === JSON.stringify(after)) return
    pastRef.current = [...pastRef.current.slice(-39), before]
    futureRef.current = []
    setPast(pastRef.current)
    setFuture([])
  }, [])

  const undo = useCallback(() => {
    const current = chartRef.current
    const previous = pastRef.current.at(-1)
    if (!current || !previous) return
    pastRef.current = pastRef.current.slice(0, -1)
    futureRef.current = [...futureRef.current, current]
    setPast(pastRef.current)
    setFuture(futureRef.current)
    chartRef.current = previous
    setChart(previous)
  }, [])

  const redo = useCallback(() => {
    const current = chartRef.current
    const next = futureRef.current.at(-1)
    if (!current || !next) return
    futureRef.current = futureRef.current.slice(0, -1)
    pastRef.current = [...pastRef.current, current]
    setPast(pastRef.current)
    setFuture(futureRef.current)
    chartRef.current = next
    setChart(next)
  }, [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault(); redo()
      } else if (event.key === 'Escape') {
        setCellSelection(null); setFreeformSelection(null); setSelectedObjects([])
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        if (document.activeElement instanceof HTMLInputElement) return
        removeSelectedObjects()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  // The handlers read current refs, and these actions do not depend on the render's chart closure.
  // oxlint-disable-next-line react/exhaustive-deps
  }, [undo, redo])

  const gridMetrics = chart?.craft === 'knitting' ? (() => {
    const maxDimension = Math.max(chart.width, chart.height)
    const baseCell = Math.min(28, 2200 / maxDimension)
    const maxZoom = Math.min(2.6, 3300 / (baseCell * maxDimension))
    const cell = baseCell * Math.min(zoom, maxZoom)
    return { cell, margin: 27, width: chart.width * cell + 27, height: chart.height * cell + 27, maxZoom }
  })() : null

  useEffect(() => {
    if (!chart || chart.craft !== 'knitting' || !canvasRef.current || !gridMetrics) return
    const canvas = canvasRef.current
    const { cell, margin, width, height } = gridMetrics
    canvas.width = Math.ceil(width)
    canvas.height = Math.ceil(height)
    canvas.style.width = width + 'px'
    canvas.style.height = height + 'px'
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, width, height)
    ctx.font = `${Math.max(6, Math.min(9, cell * .36))}px sans-serif`
    ctx.fillStyle = '#7d8797'
    ctx.textAlign = 'center'
    for (let col = 0; col < chart.width; col++) ctx.fillText(String(chart.width - col), margin + (col + .5) * cell, 11)
    ctx.textAlign = 'right'
    for (let row = 0; row < chart.height; row++) ctx.fillText(String(chart.height - row), margin - 5, margin + (row + .63) * cell)
    for (let index = 0; index < chart.cells.length; index++) {
      const color = chart.cells[index]
      if (color) {
        const col = index % chart.width
        const row = Math.floor(index / chart.width)
        ctx.fillStyle = color
        ctx.fillRect(margin + col * cell, margin + row * cell, cell, cell)
      }
    }
    ctx.beginPath()
    for (let col = 0; col <= chart.width; col++) {
      ctx.moveTo(margin + col * cell, margin)
      ctx.lineTo(margin + col * cell, margin + chart.height * cell)
    }
    for (let row = 0; row <= chart.height; row++) {
      ctx.moveTo(margin, margin + row * cell)
      ctx.lineTo(margin + chart.width * cell, margin + row * cell)
    }
    ctx.strokeStyle = '#cfd5dd'
    ctx.lineWidth = .7
    ctx.stroke()
    if (cellSelection) {
      const left = margin + cellSelection.left * cell
      const top = margin + cellSelection.top * cell
      const selectedWidth = (cellSelection.right - cellSelection.left + 1) * cell
      const selectedHeight = (cellSelection.bottom - cellSelection.top + 1) * cell
      ctx.fillStyle = DESIGN_SYSTEM_COLORS.primarySoft
      ctx.fillRect(left, top, selectedWidth, selectedHeight)
      ctx.strokeStyle = DESIGN_SYSTEM_COLORS.primary
      ctx.lineWidth = 2
      ctx.strokeRect(left, top, selectedWidth, selectedHeight)
    }
  }, [chart, gridMetrics, cellSelection])

  const setGridCell = useCallback((draft: ChartDocument, col: number, row: number, color: string | null) => {
    if (col < 0 || row < 0 || col >= draft.width || row >= draft.height) return draft
    const index = cellIndex(draft, col, row)
    if (draft.cells[index] === color) return draft
    draft.cells[index] = color
    return draft
  }, [])

  function gridPoint(event: PointerEvent<HTMLCanvasElement>) {
    if (!gridMetrics || !chart) return null
    const bounds = event.currentTarget.getBoundingClientRect()
    return {
      col: Math.floor((event.clientX - bounds.left - gridMetrics.margin) / gridMetrics.cell),
      row: Math.floor((event.clientY - bounds.top - gridMetrics.margin) / gridMetrics.cell),
    }
  }

  function fillFrom(col: number, row: number) {
    if (!chart) return
    const draft = cloneChart(chart)
    const start = cellIndex(draft, col, row)
    const target = draft.cells[start]
    if (target === selectedColor) return
    const queue = [start]
    const seen = new Set<number>()
    while (queue.length) {
      const index = queue.pop()!
      if (seen.has(index) || draft.cells[index] !== target) continue
      seen.add(index)
      draft.cells[index] = selectedColor
      const x = index % draft.width
      const y = Math.floor(index / draft.width)
      if (x > 0) queue.push(index - 1)
      if (x + 1 < draft.width) queue.push(index + 1)
      if (y > 0) queue.push(index - draft.width)
      if (y + 1 < draft.height) queue.push(index + draft.width)
    }
    transition(draft)
  }

  function onGridPointerDown(event: PointerEvent<HTMLCanvasElement>) {
    if (!chart || chart.craft !== 'knitting' || event.button !== 0) return
    const point = gridPoint(event)
    if (!point) return
    if (tool === 'pan') {
      const viewport = viewportRef.current
      if (viewport) panStartRef.current = { x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop }
      event.currentTarget.setPointerCapture(event.pointerId)
      return
    }
    if (point.col < 0 || point.row < 0 || point.col >= chart.width || point.row >= chart.height) return
    if (tool === 'fill') { fillFrom(point.col, point.row); return }
    if (tool === 'select') {
      selectionStartRef.current = point
      setCellSelection(normalizedRect(point, point))
      event.currentTarget.setPointerCapture(event.pointerId)
      return
    }
    strokeBeforeRef.current = cloneChart(chart)
    strokeDraftRef.current = cloneChart(chart)
    pointerRef.current = point
    const draft = strokeDraftRef.current
    if (draft) {
      setGridCell(draft, point.col, point.row, tool === 'erase' ? null : selectedColor)
      chartRef.current = draft
      setChart(draft)
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function onGridPointerMove(event: PointerEvent<HTMLCanvasElement>) {
    if (panStartRef.current && viewportRef.current) {
      viewportRef.current.scrollLeft = panStartRef.current.left - (event.clientX - panStartRef.current.x)
      viewportRef.current.scrollTop = panStartRef.current.top - (event.clientY - panStartRef.current.y)
      return
    }
    const point = gridPoint(event)
    if (!point || !chart) return
    const currentChart = chartRef.current
    if (!currentChart || currentChart.craft !== 'knitting') return
    const bounded = { col: Math.min(currentChart.width - 1, Math.max(0, point.col)), row: Math.min(currentChart.height - 1, Math.max(0, point.row)) }
    if (selectionStartRef.current && tool === 'select') {
      setCellSelection(normalizedRect(selectionStartRef.current, bounded))
      return
    }
    const draft = strokeDraftRef.current
    if (!draft || !pointerRef.current) return
    const start = pointerRef.current
    const dx = Math.abs(bounded.col - start.col)
    const dy = Math.abs(bounded.row - start.row)
    const sx = start.col < bounded.col ? 1 : -1
    const sy = start.row < bounded.row ? 1 : -1
    let error = dx - dy
    let x = start.col
    let y = start.row
    while (true) {
      setGridCell(draft, x, y, tool === 'erase' ? null : selectedColor)
      if (x === bounded.col && y === bounded.row) break
      const twice = error * 2
      if (twice > -dy) { error -= dy; x += sx }
      if (twice < dx) { error += dx; y += sy }
    }
    pointerRef.current = bounded
    chartRef.current = draft
    setChart(cloneChart(draft))
  }

  function onGridPointerUp() {
    if (panStartRef.current) { panStartRef.current = null; return }
    if (selectionStartRef.current) { selectionStartRef.current = null; return }
    finishGesture(strokeBeforeRef.current, strokeDraftRef.current)
    strokeBeforeRef.current = null
    strokeDraftRef.current = null
    pointerRef.current = null
  }

  function updateTitle(title: string) {
    if (!chart) return
    transition({ ...chart, title: title.trim() || t('제목 없음') })
  }

  function updatePaletteColor(index: number, color: string) {
    if (!chart) return
    const next = cloneChart(chart)
    const original = next.palette[index]
    next.palette[index] = color
    if (next.craft === 'knitting') next.cells = next.cells.map((cell) => cell === original ? color : cell)
    if (next.craft === 'crochet') next.objects = next.objects.map((object) => object.color === original ? { ...object, color } : object)
    setSelectedColor(color)
    transition(next)
  }

  function chooseColor(color: string) {
    setSelectedColor(color)
    if (!chart || chart.craft !== 'crochet' || !selectedObjects.length) return
    const ids = new Set(selectedObjects)
    transition({ ...chart, objects: chart.objects.map((item) => ids.has(item.id) ? { ...item, color } : item) })
  }

  function addPaletteColor(color: string) {
    if (!chart || chart.palette.length >= 12) return
    transition({ ...chart, palette: [...chart.palette, color] })
    setSelectedColor(color)
  }

  async function doExport(format: 'png' | 'pdf') {
    if (!chart) return
    setExporting(true)
    try { await exportChart(chart, format) } catch { setSaveStatus('error') }
    finally { setExporting(false) }
  }

  function copySelection() {
    if (!chart || chart.craft !== 'knitting' || !cellSelection) return
    const width = cellSelection.right - cellSelection.left + 1
    const height = cellSelection.bottom - cellSelection.top + 1
    const cells: (string | null)[] = []
    for (let row = cellSelection.top; row <= cellSelection.bottom; row++) for (let col = cellSelection.left; col <= cellSelection.right; col++) cells.push(chart.cells[cellIndex(chart, col, row)])
    clipboardRef.current = { width, height, cells }
  }

  function pasteSelection() {
    if (!chart || chart.craft !== 'knitting' || !clipboardRef.current) return
    const draft = cloneChart(chart)
    const clip = clipboardRef.current
    const left = cellSelection ? Math.min(draft.width - clip.width, cellSelection.left + 1) : 0
    const top = cellSelection ? Math.min(draft.height - clip.height, cellSelection.top + 1) : 0
    for (let row = 0; row < clip.height; row++) for (let col = 0; col < clip.width; col++) {
      const x = left + col; const y = top + row
      if (x < draft.width && y < draft.height) draft.cells[cellIndex(draft, x, y)] = clip.cells[row * clip.width + col]
    }
    setCellSelection({ left, top, right: Math.min(draft.width - 1, left + clip.width - 1), bottom: Math.min(draft.height - 1, top + clip.height - 1) })
    transition(draft)
  }

  function mirrorSelection(horizontal: boolean) {
    if (!chart || chart.craft !== 'knitting' || !cellSelection) return
    const draft = cloneChart(chart)
    const source: (string | null)[] = []
    const w = cellSelection.right - cellSelection.left + 1
    const h = cellSelection.bottom - cellSelection.top + 1
    for (let row = 0; row < h; row++) for (let col = 0; col < w; col++) source.push(chart.cells[cellIndex(chart, cellSelection.left + col, cellSelection.top + row)])
    for (let row = 0; row < h; row++) for (let col = 0; col < w; col++) {
      const fromCol = horizontal ? w - col - 1 : col
      const fromRow = horizontal ? row : h - row - 1
      draft.cells[cellIndex(draft, cellSelection.left + col, cellSelection.top + row)] = source[fromRow * w + fromCol]
    }
    transition(draft)
  }

  function svgPointFromClient(clientX: number, clientY: number) {
    const bounds = freeformSvgRef.current?.getBoundingClientRect()
    if (!bounds) return { x: 0, y: 0 }
    const side = Math.min(bounds.width / 1000, bounds.height / 800)
    return { x: (clientX - bounds.left - (bounds.width - 1000 * side) / 2) / side, y: (clientY - bounds.top - (bounds.height - 800 * side) / 2) / side }
  }

  function symbolPoint(event: PointerEvent<SVGSVGElement>) {
    return svgPointFromClient(event.clientX, event.clientY)
  }

  function onFreeformPointerDown(event: PointerEvent<SVGSVGElement>) {
    if (!chart || chart.craft !== 'crochet' || event.button !== 0) return
    const point = symbolPoint(event)
    if (selectedSymbol && tool === 'paint') {
      const layer = chart.layers.find((item) => item.id === activeLayer && item.visible && !item.locked)
      if (!layer) return
      const object: CrochetSymbolObject = { id: crypto.randomUUID(), symbol: selectedSymbol, x: Math.min(980, Math.max(20, point.x)), y: Math.min(775, Math.max(25, point.y)), scale: 1, rotation: 0, color: selectedColor, layerId: layer.id }
      transition({ ...chart, objects: [...chart.objects, object] })
      setSelectedObjects([object.id])
      return
    }
    freeSelectionStartRef.current = point
    setFreeformSelection({ x: point.x, y: point.y, width: 0, height: 0 })
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function onFreeformPointerMove(event: PointerEvent<SVGSVGElement>) {
    if (!freeSelectionStartRef.current) return
    const point = symbolPoint(event)
    const start = freeSelectionStartRef.current
    setFreeformSelection({ x: Math.min(start.x, point.x), y: Math.min(start.y, point.y), width: Math.abs(start.x - point.x), height: Math.abs(start.y - point.y) })
  }

  function onFreeformPointerUp() {
    if (!chart || !freeSelectionStartRef.current) return
    const rect = freeformSelection
    if (!rect || (rect.width < 3 && rect.height < 3)) setSelectedObjects([])
    else setSelectedObjects(chart.objects.filter((object) => Math.abs(object.x - rect.x - rect.width / 2) <= rect.width / 2 + 20 * object.scale && Math.abs(object.y - rect.y - rect.height / 2) <= rect.height / 2 + 25 * object.scale &&
      chart.layers.some((layer) => layer.id === object.layerId && layer.visible && !layer.locked)).map((object) => object.id))
    setFreeformSelection(null)
    freeSelectionStartRef.current = null
  }

  function startObjectDrag(event: PointerEvent<SVGGElement>, object: CrochetSymbolObject) {
    if (!chart || chart.craft !== 'crochet') return
    event.stopPropagation()
    const layer = chart.layers.find((item) => item.id === object.layerId)
    if (!layer || layer.locked || !layer.visible) return
    const point = svgPointFromClient(event.clientX, event.clientY)
    const ids = selectedObjects.includes(object.id) ? selectedObjects : [object.id]
    setSelectedObjects(ids)
    objectDragRef.current = { before: cloneChart(chart), x: point.x, y: point.y, ids }
    ;(event.currentTarget.ownerSVGElement ?? event.currentTarget).setPointerCapture(event.pointerId)
  }

  function moveObjects(event: React.PointerEvent<SVGSVGElement>) {
    if (!objectDragRef.current || !chart) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const side = Math.min(bounds.width / 1000, bounds.height / 800)
    const point = { x: (event.clientX - bounds.left - (bounds.width - 1000 * side) / 2) / side, y: (event.clientY - bounds.top - (bounds.height - 800 * side) / 2) / side }
    const deltaX = point.x - objectDragRef.current.x
    const deltaY = point.y - objectDragRef.current.y
    const selected = new Set(objectDragRef.current.ids)
    const draft = { ...chart, objects: chart.objects.map((item) => selected.has(item.id) ? { ...item, x: item.x + deltaX, y: item.y + deltaY } : item) }
    objectDragRef.current.x = point.x
    objectDragRef.current.y = point.y
    chartRef.current = draft
    setChart(draft)
  }

  function stopObjectDrag() {
    if (!objectDragRef.current || !chartRef.current) return
    finishGesture(objectDragRef.current.before, chartRef.current)
    objectDragRef.current = null
  }

  function removeSelectedObjects() {
    const current = chartRef.current
    const selection = selectedObjectsRef.current
    if (!current || current.craft !== 'crochet' || !selection.length) return
    const ids = new Set(selection)
    transition({ ...current, objects: current.objects.filter((item) => !ids.has(item.id)) })
    setSelectedObjects([])
  }

  function transformSelected(transform: (object: CrochetSymbolObject) => CrochetSymbolObject) {
    if (!chart || chart.craft !== 'crochet' || !selectedObjects.length) return
    const ids = new Set(selectedObjects)
    transition({ ...chart, objects: chart.objects.map((item) => ids.has(item.id) ? transform(item) : item) })
  }

  function addLayer() {
    if (!chart || chart.craft !== 'crochet') return
    const layer: ChartLayer = { id: crypto.randomUUID(), name: `레이어 ${chart.layers.length + 1}`, visible: true, locked: false }
    transition({ ...chart, layers: [layer, ...chart.layers] })
    setActiveLayer(layer.id)
  }

  function moveLayer(id: string, offset: -1 | 1) {
    if (!chart || chart.craft !== 'crochet') return
    const layers = [...chart.layers]
    const index = layers.findIndex((layer) => layer.id === id)
    const target = index + offset
    if (index < 0 || target < 0 || target >= layers.length) return
    ;[layers[index], layers[target]] = [layers[target], layers[index]]
    transition({ ...chart, layers })
  }

  function updateLayer(id: string, change: Partial<ChartLayer>) {
    if (!chart || chart.craft !== 'crochet') return
    transition({ ...chart, layers: chart.layers.map((layer) => layer.id === id ? { ...layer, ...change } : layer) })
    if (change.locked || change.visible === false) {
      const layer = chart.layers.find((item) => item.id === id)
      if (layer && (change.locked || !change.visible)) setSelectedObjects((items) => items.filter((objectId) => !chart.objects.some((object) => object.id === objectId && object.layerId === id)))
    }
  }

  if (!chart || chart.id !== id) return missing
    ? <main className="chart-not-found"><h1>{t("차트를 찾을 수 없습니다")}</h1><button className="secondary-button" onClick={() => navigate('/')}>{t("워크스페이스로")}</button></main>
    : <BrandLoading kind="chart" requestId={'chart-data:' + id} layout="screen" />

  return (
    <main className="chart-editor-shell">
      <header className="chart-editor-header">
        <button className="chart-back" onClick={() => { const current = chartRef.current; if (current) void saveChart(current).then(() => navigate('/'), () => navigate('/')); else navigate('/') }} aria-label={t("워크스페이스로")}><ArrowLeft size={20} /><span>{t("워크스페이스")}</span></button>
        <input className="chart-title-input" aria-label={t("차트 이름")} maxLength={120} value={chart.title} onChange={(event) => { chartRef.current = { ...chart, title: event.target.value }; setChart(chartRef.current) }} onBlur={(event) => updateTitle(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} />
        <button className="chart-icon-button" disabled={!past.length} onClick={undo} title={t("실행 취소")}><Undo2 size={17} /></button>
        <button className="chart-icon-button" disabled={!future.length} onClick={redo} title={t("다시 실행")}><Redo2 size={17} /></button>
        <span className={'chart-save-state ' + saveStatus}>{saveStatus === 'saved' ? <><Check size={14} />{t(" 저장됨")}</> : saveStatus === 'saving' ? <><Save size={14} />{t(" 저장 중")}</> : t('저장 오류')}</span>
        <details className="chart-export-menu"><summary aria-label={t("내보내기")}><Download size={17} /><ChevronDown size={13} /></summary><div><button disabled={exporting} onClick={() => void doExport('png')}>{t("PNG 이미지 저장")}</button><button disabled={exporting} onClick={() => void doExport('pdf')}>{t("PDF 저장")}</button></div></details>
      </header>
      {chart.craft === 'knitting' ? <div className="chart-editor-main knitting-editor">
        <aside className="chart-tool-panel">
          <p className="chart-tool-heading">{t("색상")}</p>
          <div className="chart-palette">{chart.palette.map((color, index) => <div className="chart-swatch-wrap" key={index}><button aria-label={t('색상 {count}', { count: formatNumber(index + 1) })} className={'chart-swatch ' + (selectedColor === color ? 'chosen' : '')} style={{ backgroundColor: color }} onClick={() => { setSelectedColor(color); setTool('paint') }} /><input type="color" aria-label={t("색상 변경")} value={color} onChange={(event) => updatePaletteColor(index, event.target.value)} /></div>)}
            {chart.palette.length < 12 && <label className="chart-add-swatch"><Plus size={15} /><input type="color" aria-label={t("색상 추가")} value={selectedColor} onChange={(event) => addPaletteColor(event.target.value)} /></label>}</div>
          <p className="chart-tool-heading">{t("도구")}</p>
          <div className="chart-grid-tools">
            <ToolButton active={tool === 'paint'} title={t("색칠")} onClick={() => setTool('paint')}><Paintbrush size={18} /></ToolButton>
            <ToolButton active={tool === 'erase'} title={t("지우개")} onClick={() => setTool('erase')}><Eraser size={18} /></ToolButton>
            <ToolButton active={tool === 'fill'} title={t("영역 채우기")} onClick={() => setTool('fill')}><PaintBucket size={18} /></ToolButton>
            <ToolButton active={tool === 'select'} title={t("영역 선택")} onClick={() => setTool('select')}><MousePointer2 size={18} /></ToolButton>
            <ToolButton active={tool === 'pan'} title={t("화면 이동")} onClick={() => setTool('pan')}><Hand size={18} /></ToolButton>
          </div>
          {cellSelection && <div className="chart-selection-tools"><button onClick={copySelection}><Copy size={14} />{t(" 복사")}</button><button onClick={pasteSelection}>{t("붙여넣기")}</button><button aria-label={t("좌우 반전")} onClick={() => mirrorSelection(true)}><FlipHorizontal2 size={15} /></button><button aria-label={t("상하 반전")} onClick={() => mirrorSelection(false)}><FlipVertical2 size={15} /></button></div>}
          <div className="chart-grid-size">{chart.width}{t("코 × ")}{chart.height}{t("단")}<br /><small>{t("원형뜨기 · 오른쪽에서 왼쪽")}</small></div>
        </aside>
        <section className="chart-canvas-area">
          <div className="chart-canvas-viewport" ref={viewportRef}>
            <canvas ref={canvasRef} className={'knit-canvas tool-' + tool} onPointerDown={onGridPointerDown} onPointerMove={onGridPointerMove} onPointerUp={onGridPointerUp} onPointerCancel={onGridPointerUp} aria-label={t("대바늘 색상 차트 편집 캔버스")} />
          </div>
          <ZoomControls zoom={zoom} setZoom={setZoom} maxZoom={gridMetrics?.maxZoom} />
        </section>
      </div> : <div className="chart-editor-main crochet-editor">
        <aside className="chart-tool-panel crochet-tool-panel">
          <p className="chart-tool-heading">{t("뜨개 기호")}</p>
          <div className="chart-symbol-list">{crochetSymbols.map((item) => <button key={item.id} className={'chart-symbol-option ' + (selectedSymbol === item.id && tool === 'paint' ? 'active' : '')} onClick={() => { setSelectedSymbol(item.id); setTool('paint') }}><svg viewBox="0 0 40 50" aria-hidden="true"><g color={selectedColor} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><SymbolGlyph symbol={item.id} /></g></svg><span>{t(item.name as LocaleKey)}</span></button>)}</div>
          <div className="chart-crochet-palette" aria-label={t("실 색상")}>{chart.palette.map((color, index) => <div className="chart-swatch-wrap" key={index}><button aria-label={t('실 색상 {count}', { count: formatNumber(index + 1) })} className={'chart-swatch ' + (selectedColor === color ? 'chosen' : '')} style={{ backgroundColor: color }} onClick={() => chooseColor(color)} /><input type="color" aria-label={t("실 색상 변경")} value={color} onChange={(event) => updatePaletteColor(index, event.target.value)} /></div>)}{chart.palette.length < 12 && <label className="chart-add-swatch"><Plus size={15} /><input type="color" aria-label={t("실 색상 추가")} value={selectedColor} onChange={(event) => addPaletteColor(event.target.value)} /></label>}</div>
          <ToolButton active={tool !== 'paint'} title={t("기호 선택")} onClick={() => setTool('select')}><MousePointer2 size={18} /></ToolButton>
          <div className="chart-layer-panel"><div className="chart-layer-heading"><strong><Layers size={15} />{t(" 레이어")}</strong><button aria-label={t("레이어 추가")} onClick={addLayer}><Plus size={16} /></button></div>
            {chart.layers.map((layer, index) => <div key={layer.id} className={'chart-layer-row ' + (activeLayer === layer.id ? 'active' : '')} onClick={() => setActiveLayer(layer.id)}><input aria-label={layer.name + ' ' + t('표시')} type="checkbox" checked={layer.visible} onChange={(event) => updateLayer(layer.id, { visible: event.target.checked })} /><input aria-label={t("레이어 이름")} value={layer.name} onClick={(event) => event.stopPropagation()} onChange={(event) => updateLayer(layer.id, { name: event.target.value })} /><button aria-label={layer.locked ? t('레이어 잠금 해제') : t('레이어 잠금')} onClick={(event) => { event.stopPropagation(); updateLayer(layer.id, { locked: !layer.locked }) }}>{layer.locked ? '🔒' : '○'}</button><button disabled={index === 0} aria-label={t("레이어 위로")} onClick={(event) => { event.stopPropagation(); moveLayer(layer.id, -1) }}>↑</button><button disabled={index === chart.layers.length - 1} aria-label={t("레이어 아래로")} onClick={(event) => { event.stopPropagation(); moveLayer(layer.id, 1) }}>↓</button></div>)}
          </div>
        </aside>
        <section className="chart-canvas-area crochet-canvas-area">
          <div className="chart-freeform-toolbar" aria-label={t("선택한 기호 편집")}>
            <span>{selectedObjects.length ? t('{count}개 선택', { count: formatNumber(selectedObjects.length) }) : t('기호를 선택해 이동')}</span>
            <button disabled={!selectedObjects.length} onClick={() => transformSelected((item) => ({ ...item, scale: Math.min(4, item.scale + .15) }))}><Plus size={15} />{t(" 크게")}</button>
            <button disabled={!selectedObjects.length} onClick={() => transformSelected((item) => ({ ...item, scale: Math.max(.25, item.scale - .15) }))}><Minus size={15} />{t(" 작게")}</button>
            <button disabled={!selectedObjects.length} onClick={() => transformSelected((item) => ({ ...item, rotation: item.rotation - 15 }))}><RotateCcw size={15} /></button>
            <button disabled={!selectedObjects.length} onClick={() => transformSelected((item) => ({ ...item, rotation: item.rotation + 15 }))}><RotateCw size={15} /></button>
            <button disabled={!selectedObjects.length} onClick={() => { if (!chart || chart.craft !== 'crochet') return; const ids = new Set(selectedObjects); const copies = chart.objects.filter((item) => ids.has(item.id)).map((item) => ({ ...item, id: crypto.randomUUID(), x: item.x + 45, y: item.y + 45 })); transition({ ...chart, objects: [...chart.objects, ...copies] }); setSelectedObjects(copies.map((item) => item.id)) }}><Copy size={15} /></button>
            <button disabled={!selectedObjects.length} onClick={removeSelectedObjects}><Trash2 size={15} /></button>
          </div>
          <div className="chart-freeform-viewport">
            <svg ref={freeformSvgRef} className="chart-freeform-canvas" style={{ width: `${zoom * 100}%`, minWidth: zoom > 1 ? `${zoom * 600}px` : undefined }} viewBox="0 0 1000 800" onPointerDown={onFreeformPointerDown} onPointerMove={(event) => { onFreeformPointerMove(event); moveObjects(event) }} onPointerUp={() => { onFreeformPointerUp(); stopObjectDrag() }} onPointerCancel={() => { stopObjectDrag(); freeSelectionStartRef.current = null; setFreeformSelection(null) }} aria-label={t("코바늘 기호 차트 편집 캔버스")}>
              <defs><pattern id="chart-dot-grid" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#e7ebf1" /></pattern></defs>
              <rect width="1000" height="800" fill="#fff" /><rect width="1000" height="800" fill="url(#chart-dot-grid)" />
              {[...chart.objects].filter((item) => chart.layers.some((layer) => layer.id === item.layerId && layer.visible)).sort((a, b) => chart.layers.findIndex((layer) => b.layerId === layer.id) - chart.layers.findIndex((layer) => a.layerId === layer.id)).map((item) => <g key={item.id} transform={`translate(${item.x} ${item.y}) rotate(${item.rotation}) scale(${item.scale})`} color={item.color} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" onPointerDown={(event) => startObjectDrag(event, item)}>
                <g transform="translate(-20 -25)"><SymbolGlyph symbol={item.symbol} />{selectedObjects.includes(item.id) && <rect x="1" y="1" width="38" height="48" fill="none" stroke={DESIGN_SYSTEM_COLORS.primary} strokeWidth="1.5" strokeDasharray="3 2" />}</g>
              </g>)}
              {freeformSelection && <rect x={freeformSelection.x} y={freeformSelection.y} width={freeformSelection.width} height={freeformSelection.height} fill={DESIGN_SYSTEM_COLORS.primarySoft} stroke={DESIGN_SYSTEM_COLORS.primary} strokeDasharray="5 4" pointerEvents="none" />}
            </svg>
          </div>
          <ZoomControls zoom={zoom} setZoom={setZoom} />
        </section>
      </div>}
    </main>
  )
}

function ToolButton({ active, title, onClick, children }: { active: boolean; title: string; onClick: () => void; children: ReactNode }) {
  return <button className={'chart-tool-button ' + (active ? 'active' : '')} aria-label={title} title={title} onClick={onClick}>{children}</button>
}

function ZoomControls({ zoom, setZoom, maxZoom = 2.6 }: { zoom: number; setZoom: (value: number) => void; maxZoom?: number }) {
  return <div className="chart-zoom-controls"><button aria-label={t("축소")} onClick={() => setZoom(Math.max(.4, +(zoom - .2).toFixed(1)))}><Minus size={15} /></button><span>{Math.round(Math.min(zoom, maxZoom) * 100)}%</span><button aria-label={t("확대")} onClick={() => setZoom(Math.min(maxZoom, +(zoom + .2).toFixed(1)))}><Plus size={15} /></button></div>
}
