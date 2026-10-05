import { Suspense, lazy } from 'react'
import { HashRouter, Navigate, Route, Routes, useParams } from 'react-router-dom'
import PwaUpdatePrompt from './PwaUpdatePrompt'
import './App.css'

const Workspace = lazy(() => import('./Workspace'))
const Viewer = lazy(() => import('./Viewer'))
const ChartCreate = lazy(() => import('./ChartCreate'))
const ChartEditor = lazy(() => import('./ChartEditor'))

function ViewerRoute() {
  const { id } = useParams()
  return <Viewer key={id} />
}

export default function App() {
  const pwaEnabled = !import.meta.env.VITE_PORTABLE

  return (
    <HashRouter>
      <Suspense fallback={<main className="viewer-state"><div className="loading-orb" /><p>도안보고를 여는 중이에요…</p></main>}>
        <Routes>
          <Route path="/" element={<Workspace />} />
          <Route path="/viewer/:id" element={<ViewerRoute />} />
          <Route path="/charts/new" element={<ChartCreate />} />
          <Route path="/chart/:id" element={<ChartEditor />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      {pwaEnabled && <PwaUpdatePrompt />}
    </HashRouter>
  )
}
