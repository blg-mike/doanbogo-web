import { useEffect, useRef } from 'react'
import AppNavigation from './AppNavigation'
import { mountGaugebook } from './gaugebook.js'
import './Gaugebook.css'

export default function GaugebookPage() {
  const root = useRef<HTMLElement>(null)
  useEffect(() => {
    if (root.current) return mountGaugebook(root.current)
  }, [])

  return <div className="workspace-app-frame reports-page">
    <AppNavigation active="gaugebook" />
    <main className="workspace-shell">
      <section ref={root} className="workspace-content report-workspace-content gaugebook">
        <div id="main" />
        <dialog id="modal" className="modal-card" aria-label="사진 크게 보기">
          <div id="dialogBody" />
          <button type="button" className="icon-button close" aria-label="닫기" data-act="close">×</button>
        </dialog>
        <div role="status" id="toast" />
      </section>
    </main>
  </div>
}
