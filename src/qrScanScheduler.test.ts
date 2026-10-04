import { describe, expect, it, vi } from 'vitest'
import { QrScanScheduler, type QrScanRequest, type QrWorkerPort } from './qrScanScheduler'

function request(pageNumber: number): QrScanRequest {
  return { generation: 1, pageNumber, width: 2, height: 2, pixels: new ArrayBuffer(16) }
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
  it('keeps one scan active, bounds queued buffers, and moves the active page ahead', () => {
    const { worker, sent } = workerMock()
    const results: number[] = []
    const dropped: number[] = []
    const scheduler = new QrScanScheduler(() => worker, (scan) => results.push(scan.pageNumber), (scan) => dropped.push(scan.pageNumber), 2)

    scheduler.enqueue(request(1))
    scheduler.enqueue(request(2))
    scheduler.enqueue(request(3))
    scheduler.setActivePage(4)
    scheduler.enqueue(request(4))

    expect(sent).toHaveLength(1)
    expect(dropped).toEqual([2])
    worker.onmessage?.({ data: { id: sent[0].id, links: [] } } as MessageEvent)
    expect(sent.map((message) => message.id)).toEqual([1, 4])
    worker.onmessage?.({ data: { id: sent[1].id, links: [] } } as MessageEvent)
    expect(sent.map((message) => message.id)).toEqual([1, 4, 3])
    worker.onmessage?.({ data: { id: sent[2].id, links: [] } } as MessageEvent)
    expect(results).toEqual([1, 4, 3])
    scheduler.dispose()
  })

  it('settles the active and queued pages with empty results if the worker fails', () => {
    const { worker } = workerMock()
    const results: number[] = []
    const scheduler = new QrScanScheduler(() => worker, (scan) => results.push(scan.pageNumber), () => {}, 2)
    scheduler.enqueue(request(1))
    scheduler.enqueue(request(2))

    worker.onerror?.({ message: 'worker error', preventDefault: vi.fn() } as unknown as ErrorEvent)

    expect(results).toEqual([2, 1])
    expect(worker.terminate).toHaveBeenCalledOnce()
    scheduler.enqueue(request(3))
    expect(results).toEqual([2, 1, 3])
    scheduler.dispose()
  })
})
