import { describe, expect, it } from 'vitest'
import { pdfBinaryResourceOptions, resolvePdfBinaryAsset } from './pdfBinaryResources'

describe('PDF.js bundled binary resources', () => {
  it('includes the JPEG 2000 decoder and supporting PDF resources', () => {
    expect(resolvePdfBinaryAsset('wasmUrl', 'openjpeg.wasm')).toBeTypeOf('string')
    expect(resolvePdfBinaryAsset('cMapUrl', 'UniKS-UTF16-H.bcmap')).toBeTypeOf('string')
    expect(resolvePdfBinaryAsset('standardFontDataUrl', 'LiberationSans-Regular.ttf')).toBeTypeOf('string')
  })

  it('loads bundled resources through the main thread for single-file compatibility', () => {
    const options = pdfBinaryResourceOptions()
    expect(options.useWorkerFetch).toBe(false)
    expect(options.cMapPacked).toBe(true)
    expect(options.wasmUrl).toContain('/pdfjs/wasm/')
    expect(options.BinaryDataFactory).toBeDefined()
  })
})
