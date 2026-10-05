import { describe, expect, it, vi } from 'vitest'
import { QrScanScheduler, type QrScanRequest, type QrWorkerPort } from './qrScanScheduler'

function request(pageNumber: number): QrScanRequest {
  return { generation: 1, pageNumber }
}

function workerMock() {
  const sent: { id: number; width: number; height: number; pixels: ArrayBuffer }[] = []
  const worker = {
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    postMessage: vi.fn((message: typeof sent[number]) => sent.push(message)),
    terminate: vi.fn(),
  } as unknown as QrWorkerPort
  return { worker, sent }
}

describe('QR scan scheduling', () => {
  it('captures only the active scan, keeps one queued request, and moves the active page ahead', () => {
    const { worker, sent } = workerMock()
    const results: number[] = []
    const dropped: number[] = []
    const scheduler = new QrScanScheduler(() => worker, (scan) => results.push(scan.pageNumber), (scan) => dropped.push(scan.pageNumber), 1)
    const submit = (page: number) => scheduler.enqueue({ ...request(page), capturePixels: () => ({ width: 2, height: 2, pixels: new ArrayBuffer(16), inputMaxDimension: 1000 }) })

    submit(1)
    submit(2)
    submit(3)
    scheduler.setActivePage(4)
    submit(4)

    expect(sent).toHaveLength(1)
    expect(dropped).toEqual([2, 3])
    worker.onmessage?.({ data: { id: sent[0].id, links: [] } } as MessageEvent)
    expect(sent.map((message) => message.id)).toEqual([1, 4])
    worker.onmessage?.({ data: { id: sent[1].id, links: [] } } as MessageEvent)
    expect(results).toEqual([1, 4])
    scheduler.dispose()
  })

  it('does not cache a worker failure as an empty result and drops queued work', () => {
    const { worker } = workerMock()
    const results: number[] = []
    const dropped: number[] = []
    const scheduler = new QrScanScheduler(() => worker, (scan) => results.push(scan.pageNumber), (scan) => dropped.push(scan.pageNumber), 1)
    const submit = (page: number) => scheduler.enqueue({ ...request(page), capturePixels: () => ({ width: 2, height: 2, pixels: new ArrayBuffer(16), inputMaxDimension: 1000 }) })
    submit(1)
    submit(2)

    worker.onerror?.({ message: 'worker error', preventDefault: vi.fn() } as unknown as ErrorEvent)

    expect(results).toEqual([])
    expect(dropped).toEqual([1, 2])
    expect(worker.terminate).toHaveBeenCalledOnce()
    submit(3)
    expect(results).toEqual([])
    expect(dropped).toEqual([1, 2, 3])
    scheduler.dispose()
  })

  it('defers capture for a queued request until it reaches the Worker', () => {
    const { worker, sent } = workerMock()
    const scheduler = new QrScanScheduler(() => worker, () => {}, () => {}, 1)
    const activeCapture = vi.fn(() => ({ width: 2, height: 2, pixels: new ArrayBuffer(16), inputMaxDimension: 1000 }))
    const queuedCapture = vi.fn(() => ({ width: 2, height: 2, pixels: new ArrayBuffer(16), inputMaxDimension: 1000 }))
    scheduler.enqueue({ ...request(1), capturePixels: activeCapture })
    scheduler.enqueue({ ...request(2), capturePixels: queuedCapture })

    expect(activeCapture).toHaveBeenCalledOnce()
    expect(queuedCapture).not.toHaveBeenCalled()
    worker.onmessage?.({ data: { id: sent[0].id, links: [] } } as MessageEvent)
    expect(queuedCapture).toHaveBeenCalledOnce()
    scheduler.dispose()
  })
})
