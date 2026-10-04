import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { X } from 'lucide-react'
import { PdfThumbnail } from './PdfPage'
import type { PageRecord, TechniqueCropSlot } from './types'

type Point = { x: number; y: number }
type Frame = { x: number; y: number; width: number; height: number }
const initialFrame: Frame = { x: 18, y: 18, width: 390, height: 330 }

async function renderPdfRegion(pdf: PDFDocumentProxy, slot: TechniqueCropSlot, maxWidth: number, maxHeight: number, signal: AbortSignal) {
  const page = await pdf.getPage(slot.pageNumber)
  if (signal.aborted) return null
  const base = page.getViewport({ scale: 1 })
  const scale = Math.min(1.5, maxWidth / base.width, maxHeight / base.height)
  const viewport = page.getViewport({ scale })
  const source = document.createElement('canvas')
  source.width = Math.ceil(viewport.width)
  source.height = Math.ceil(viewport.height)
  const context = source.getContext('2d', { alpha: false })
  if (!context) return null
  let renderTask: ReturnType<typeof page.render> | undefined
  const cancelRender = () => renderTask?.cancel()
  signal.addEventListener('abort', cancelRender)
  try {
    renderTask = page.render({ canvas: source, canvasContext: context, viewport })
    await renderTask.promise
    if (signal.aborted) return null
    const x = Math.max(0, Math.floor(slot.x * source.width))
    const y = Math.max(0, Math.floor(slot.y * source.height))
    const width = Math.max(1, Math.min(source.width - x, Math.ceil(slot.width * source.width)))
    const height = Math.max(1, Math.min(source.height - y, Math.ceil(slot.height * source.height)))
    const cropped = document.createElement('canvas')
    cropped.width = width
    cropped.height = height
    const croppedContext = cropped.getContext('2d', { alpha: false })
    if (!croppedContext) return null
    croppedContext.drawImage(source, x, y, width, height, 0, 0, width, height)
    return cropped
  } finally {
    signal.removeEventListener('abort', cancelRender)
    source.width = 0
    source.height = 0
  }
}

function RegionImage({ pdf, slot, className, style }: {
  pdf: PDFDocumentProxy
  slot: TechniqueCropSlot
  className: string
  style?: React.CSSProperties
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const controller = new AbortController()
    void renderPdfRegion(pdf, slot, 1500, 1100, controller.signal).then((image) => {
      const target = canvasRef.current
      if (!image || !target || controller.signal.aborted) return
      target.width = image.width
      target.height = image.height
      target.getContext('2d')?.drawImage(image, 0, 0)
    }).catch(() => undefined)
    return () => controller.abort()
  }, [pdf, slot])

  return <canvas ref={canvasRef} className={className} style={style} aria-label="저장된 CROP 이미지" />
}

function CropPageView({ pdf, pageNumber, selection, onSelection }: {
  pdf: PDFDocumentProxy
  pageNumber: number
  selection: TechniqueCropSlot | null
  onSelection: (selection: Omit<TechniqueCropSlot, 'pageNumber'> | null) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragRef = useRef<{ pointerId: number; start: Point } | null>(null)
  const [size, setSize] = useState<Size | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    let renderTask: ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']> | undefined
    let stagingCanvas: HTMLCanvasElement | undefined
    void (async () => {
      try {
        const page = await pdf.getPage(pageNumber)
        if (controller.signal.aborted) return
        const base = page.getViewport({ scale: 1 })
        const scale = Math.min(1.35, 1000 / base.width, 530 / base.height)
        const viewport = page.getViewport({ scale })
        const targetCanvas = canvasRef.current
        if (!targetCanvas) throw new Error('PDF 페이지를 표시할 수 없습니다.')
        stagingCanvas = document.createElement('canvas')
        stagingCanvas.width = Math.ceil(viewport.width)
        stagingCanvas.height = Math.ceil(viewport.height)
        const context = stagingCanvas.getContext('2d', { alpha: false })
        if (!context) throw new Error('PDF 페이지를 표시할 수 없습니다.')
        setError('')
        renderTask = page.render({ canvas: stagingCanvas, canvasContext: context, viewport })
        await renderTask.promise
        if (controller.signal.aborted) return
        const targetContext = targetCanvas.getContext('2d', { alpha: false })
        if (!targetContext) throw new Error('PDF 페이지를 표시할 수 없습니다.')
        targetCanvas.width = stagingCanvas.width
        targetCanvas.height = stagingCanvas.height
        targetContext.drawImage(stagingCanvas, 0, 0)
        setSize({ width: viewport.width, height: viewport.height })
      } catch (cause) {
        if (!controller.signal.aborted && !(cause instanceof Error && cause.name === 'RenderingCancelledException')) {
          setError(cause instanceof Error ? cause.message : 'PDF 페이지를 표시하지 못했습니다.')
        }
      } finally {
        if (stagingCanvas) {
          stagingCanvas.width = 0
          stagingCanvas.height = 0
        }
      }
    })()
    return () => {
      controller.abort()
      renderTask?.cancel()
    }
  }, [pdf, pageNumber])

  function normalizedPoint(event: ReactPointerEvent<HTMLDivElement>): Point {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)), y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)) }
  }

  function pointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!size || (event.pointerType === 'mouse' && event.button !== 0)) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { pointerId: event.pointerId, start: normalizedPoint(event) }
    const point = normalizedPoint(event)
    onSelection({ x: point.x, y: point.y, width: 0, height: 0 })
  }

  function updateSelection(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const point = normalizedPoint(event)
    onSelection({
      x: Math.min(drag.start.x, point.x),
      y: Math.min(drag.start.y, point.y),
      width: Math.abs(point.x - drag.start.x),
      height: Math.abs(point.y - drag.start.y),
    })
  }

  function pointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    updateSelection(event)
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null
  }

  return <div className="technique-crop-page-wrap">
    <div
      className="technique-crop-page"
      style={size
        ? { width: size.width, aspectRatio: size.width + ' / ' + size.height }
        : { position: 'absolute', width: 1, height: 1, visibility: 'hidden', pointerEvents: 'none' }}
      onPointerDown={pointerDown}
      onPointerMove={updateSelection}
      onPointerUp={pointerUp}
      onPointerCancel={pointerUp}
    >
      <canvas ref={canvasRef} aria-label={pageNumber + '페이지 CROP 미리보기'} />
      {size && selection && <div className="technique-crop-selection" style={{ left: selection.x * 100 + '%', top: selection.y * 100 + '%', width: selection.width * 100 + '%', height: selection.height * 100 + '%' }} />}
    </div>
    {error && <p className="technique-error" role="alert">{error}</p>}
    {!size && !error && <p className="technique-loading">PDF 페이지를 불러오고 있어요…</p>}
  </div>
}

export function TechniqueDialog({ pdf, pages, slots, initialPage, onClose, onSave, onDelete, onOpen }: {
  pdf: PDFDocumentProxy
  pages: PageRecord[]
  slots: (TechniqueCropSlot | null)[]
  initialPage: number
  onClose: () => void
  onSave: (index: number, slot: TechniqueCropSlot) => void
  onDelete: (index: number) => void
  onOpen: (index: number) => void
}) {
  const pageGridRef = useRef<HTMLDivElement>(null)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [pageNumber, setPageNumber] = useState(initialPage)
  const [selection, setSelection] = useState<Omit<TechniqueCropSlot, 'pageNumber'> | null>(null)

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  function editSlot(index: number) {
    setEditingIndex(index)
    setPageNumber(initialPage)
    setSelection(null)
  }

  const pageRecords = new Map(pages.map((record) => [record.pageNumber, record]))
  const validSelection = Boolean(selection && selection.width >= 0.01 && selection.height >= 0.01)

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="modal-card technique-modal" role="dialog" aria-modal="true" aria-label="기법 CROP 슬롯">
      <header className="modal-heading">
        <div><h2>기법</h2>{editingIndex !== null && <p>슬롯 {editingIndex + 1}에 저장할 페이지와 영역을 선택하세요.</p>}</div>
        {editingIndex !== null && <button type="button" className="text-control" onClick={() => { setEditingIndex(null); setSelection(null) }}>슬롯 목록</button>}
        <button type="button" className="icon-button light" aria-label="기법 닫기" onClick={onClose}><X size={18} /></button>
      </header>
      {editingIndex === null
        ? <div className="technique-slot-grid">
          {Array.from({ length: 5 }, (_, index) => {
            const slot = slots[index] ?? null
            return <article className="technique-slot-card" key={index}>
              <button type="button" className="technique-slot-main" aria-label={slot ? '슬롯 ' + (index + 1) + ', ' + slot.pageNumber + '페이지 CROP 열기' : '슬롯 ' + (index + 1) + ' CROP 지정'} onClick={() => slot ? onOpen(index) : editSlot(index)}>
                <span className="technique-slot-preview">{slot ? <RegionImage pdf={pdf} slot={slot} className="technique-slot-image" /> : <span>영역을 지정하세요</span>}</span>
                <strong>슬롯 {index + 1}</strong>
                <small>{slot ? slot.pageNumber + '페이지 CROP' : '비어 있음'}</small>
              </button>
              <div className="technique-slot-actions">
                <button type="button" onClick={() => editSlot(index)}>{slot ? '영역 변경' : '지정'}</button>
                {slot && <button type="button" className="technique-delete" onClick={() => onDelete(index)}>삭제</button>}
              </div>
            </article>
          })}
        </div>
        : <>
          <div className="technique-page-grid" ref={pageGridRef} aria-label="페이지 선택">
            {Array.from({ length: pdf.numPages }, (_, index) => index + 1).map((page) => {
              const record = pageRecords.get(page)
              return <PdfThumbnail key={page} pdf={pdf} pageNumber={page} active={page === pageNumber} hidden={Boolean(record?.hidden)} bookmarked={Boolean(record?.bookmarked)} root={pageGridRef} onSelect={() => { setPageNumber(page); setSelection(null) }} />
            })}
          </div>
          <div className="technique-crop-workspace">
            <p>페이지 위에서 원하는 영역을 드래그하세요. 선택한 사각형만 슬롯에 저장됩니다.</p>
            <CropPageView
              key={pageNumber}
              pdf={pdf}
              pageNumber={pageNumber}
              selection={selection ? { pageNumber, ...selection } : null}
              onSelection={setSelection}
            />
          </div>
          <footer className="technique-dialog-actions">
            <span>{validSelection ? '페이지 ' + pageNumber + ' · 선택 영역 준비됨' : '저장할 영역을 드래그하세요'}</span>
            <button type="button" className="primary-button" disabled={!validSelection} onClick={() => {
              if (!selection || editingIndex === null) return
              onSave(editingIndex, { pageNumber, ...selection })
              setEditingIndex(null)
              setSelection(null)
            }}>슬롯 저장</button>
          </footer>
        </>}
    </section>
  </div>
}

export function TechniquePopover({ pdf, slot, onClose }: { pdf: PDFDocumentProxy; slot: TechniqueCropSlot; onClose: () => void }) {
  const areaRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<Frame>(initialFrame)
  const dragRef = useRef<{ pointerId: number; mode: 'move' | 'resize'; x: number; y: number; before: Frame } | null>(null)
  const [frame, setFrame] = useState(initialFrame)
  const [zoom, setZoom] = useState(100)

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  useEffect(() => {
    const area = areaRef.current?.parentElement
    if (!area) return
    const observer = new ResizeObserver(() => {
      const bounds = area.getBoundingClientRect()
      const width = Math.min(Math.max(260, frameRef.current.width), Math.max(260, bounds.width - 24))
      const height = Math.min(Math.max(210, frameRef.current.height), Math.max(210, bounds.height - 24))
      const next = { x: Math.min(Math.max(12, frameRef.current.x), Math.max(12, bounds.width - width - 12)), y: Math.min(Math.max(12, frameRef.current.y), Math.max(12, bounds.height - height - 12)), width, height }
      frameRef.current = next
      setFrame(next)
    })
    observer.observe(area)
    return () => observer.disconnect()
  }, [])

  function beginDrag(event: ReactPointerEvent<HTMLElement>, mode: 'move' | 'resize') {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { pointerId: event.pointerId, mode, x: event.clientX, y: event.clientY, before: frameRef.current }
  }

  function moveDrag(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current
    const area = areaRef.current?.parentElement
    if (!drag || drag.pointerId !== event.pointerId || !area) return
    const bounds = area.getBoundingClientRect()
    const dx = event.clientX - drag.x
    const dy = event.clientY - drag.y
    const before = drag.before
    const next = drag.mode === 'move'
      ? { ...before, x: Math.min(Math.max(0, before.x + dx), Math.max(0, bounds.width - before.width)), y: Math.min(Math.max(0, before.y + dy), Math.max(0, bounds.height - before.height)) }
      : { ...before, width: Math.min(Math.max(250, before.width + dx), Math.max(250, bounds.width - before.x)), height: Math.min(Math.max(200, before.height + dy), Math.max(200, bounds.height - before.y)) }
    frameRef.current = next
    setFrame(next)
  }

  function finishDrag(event: ReactPointerEvent<HTMLElement>) {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null
  }

  return <div className="technique-popover-layer" ref={areaRef} onPointerDown={(event) => event.stopPropagation()}>
    <section className="technique-popover" aria-label={'기법 슬롯, PDF ' + slot.pageNumber + '페이지 CROP'} style={{ left: frame.x, top: frame.y, width: frame.width, height: frame.height }}>
      <header className="technique-popover-header" onPointerDown={(event) => beginDrag(event, 'move')} onPointerMove={moveDrag} onPointerUp={finishDrag} onPointerCancel={finishDrag}>
        <strong>기법 · {slot.pageNumber}페이지</strong>
        <button type="button" aria-label="기법 이미지 닫기" onPointerDown={(event) => event.stopPropagation()} onClick={onClose}><X size={17} /></button>
      </header>
      <div className="technique-popover-image">
        <RegionImage pdf={pdf} slot={slot} className="technique-popover-canvas" style={{ transform: 'scale(' + zoom / 100 + ')' }} />
      </div>
      <footer className="technique-popover-controls">
        <span>{slot.pageNumber}페이지</span>
        <div>
          <button type="button" aria-label="축소" disabled={zoom <= 25} onClick={() => setZoom((current) => Math.max(25, current - 25))}>−</button>
          <output>{zoom}%</output>
          <button type="button" aria-label="확대" disabled={zoom >= 400} onClick={() => setZoom((current) => Math.min(400, current + 25))}>+</button>
        </div>
      </footer>
      <button type="button" className="technique-popover-resize" aria-label="기법 프레임 크기 조절" title="드래그해 프레임 크기 조절" onPointerDown={(event) => beginDrag(event, 'resize')} onPointerMove={moveDrag} onPointerUp={finishDrag} onPointerCancel={finishDrag} />
    </section>
  </div>
}

type Size = { width: number; height: number }
