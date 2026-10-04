type PdfBinaryResourceKind = 'cMapUrl' | 'standardFontDataUrl' | 'wasmUrl'

const pdfBinaryAssets = import.meta.glob([
  '../node_modules/pdfjs-dist/cmaps/*.bcmap',
  '../node_modules/pdfjs-dist/standard_fonts/*.pfb',
  '../node_modules/pdfjs-dist/standard_fonts/*.ttf',
  '../node_modules/pdfjs-dist/wasm/*.wasm',
], {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

const resourceDirectories: Record<PdfBinaryResourceKind, string> = {
  cMapUrl: 'cmaps',
  standardFontDataUrl: 'standard_fonts',
  wasmUrl: 'wasm',
}

export function resolvePdfBinaryAsset(kind: PdfBinaryResourceKind, filename: string) {
  const path = '../node_modules/pdfjs-dist/' + resourceDirectories[kind] + '/' + filename
  return pdfBinaryAssets[path]
}

async function fetchPdfBinaryAsset(kind: PdfBinaryResourceKind, filename: string) {
  const url = resolvePdfBinaryAsset(kind, filename)
  if (!url) throw new Error('PDF.js 자산을 찾을 수 없습니다: ' + filename)
  const response = await fetch(url)
  if (!response.ok) throw new Error('PDF.js 자산을 불러오지 못했습니다: ' + filename)
  return new Uint8Array(await response.arrayBuffer())
}

class BundledPdfBinaryDataFactory {
  async fetch({ kind, filename }: { kind: PdfBinaryResourceKind; filename: string }) {
    return fetchPdfBinaryAsset(kind, filename)
  }
}

export function pdfBinaryResourceOptions() {
  const baseUrl = import.meta.env.BASE_URL + 'pdfjs/'
  return {
    cMapUrl: baseUrl + 'cmaps/',
    cMapPacked: true,
    standardFontDataUrl: baseUrl + 'standard_fonts/',
    wasmUrl: baseUrl + 'wasm/',
    useWorkerFetch: false,
    BinaryDataFactory: BundledPdfBinaryDataFactory,
  }
}
