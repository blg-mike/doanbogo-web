import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { viteSingleFile } from 'vite-plugin-singlefile'

const repository = process.env.GITHUB_REPOSITORY?.split('/')[1]

function inlinePortableAppIcons() {
  const icons = [
    { href: '/src/assets/yy-favicon.ico', mime: 'image/x-icon', file: 'yy-favicon.ico' },
    { href: '/src/assets/yy-favicon.png', mime: 'image/png', file: 'yy-favicon.png' },
    { href: '/src/assets/yy-app-icon.png', mime: 'image/png', file: 'yy-app-icon.png' },
  ]
  return {
    name: 'inline-portable-app-icons',
    transformIndexHtml: {
      order: 'pre' as const,
      handler(html: string) {
        return icons.reduce((result, icon) => result.replace(icon.href, 'data:' + icon.mime + ';base64,' + readFileSync(join(process.cwd(), 'src/assets', icon.file)).toString('base64')), html)
      },
    },
  }
}

export default defineConfig(({ mode }) => {
  const portable = mode === 'portable'
  const manifest = {
    name: '도안보고',
    short_name: '도안보고',
    description: 'PDF 도안과 나만의 뜨개 차트를 모아 보세요.',
    theme_color: '#f8fafd',
    background_color: '#f8fafd',
    display: 'standalone' as const,
    start_url: './',
    scope: './',
    icons: [
      { src: 'pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' as const },
      { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' as const },
      { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' as const },
    ],
  }

  return {
    base: portable ? './' : process.env.GITHUB_ACTIONS === 'true' && repository ? '/' + repository + '/' : '/',
    publicDir: portable ? false : 'public',
    define: { 'import.meta.env.VITE_PORTABLE': JSON.stringify(portable) },
    plugins: [
      react(),
      VitePWA({
        disable: portable,
        registerType: 'prompt',
        injectRegister: portable ? false : 'auto',
        includeAssets: ['pwa-192.png', 'pwa-512.png', 'pwa-maskable-512.png'],
        manifest: portable ? false : manifest,
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,mjs}'],
        },
      }),
      ...(portable ? [inlinePortableAppIcons(), viteSingleFile({ removeViteModuleLoader: true })] : []),
    ],
    build: portable ? {
      outDir: 'portable',
      emptyOutDir: true,
      assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    } : undefined,
  }
})
