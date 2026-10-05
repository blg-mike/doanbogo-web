import { Suspense, lazy } from 'react'
import { HashRouter, Navigate, Route, Routes, useParams } from 'react-router-dom'
import BrandLoading from './BrandLoading'
import PwaUpdatePrompt from './PwaUpdatePrompt'
import './App.css'

const Workspace = lazy(() => import('./Workspace'))
const Viewer = lazy(() => import('./Viewer'))
const ChartCreate = lazy(() => import('./ChartCreate'))
const ChartEditor = lazy(() => import('./ChartEditor'))

function ViewerRoute() {
  const { id } = useParams()
  return <Suspense fallback={<BrandLoading kind="pdf" requestId={'viewer-module:' + id} layout="screen" />}><Viewer key={id} /></Suspense>
}

export default function App() {
  const pwaEnabled = !import.meta.env.VITE_PORTABLE

  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Suspense fallback={<BrandLoading kind="app" requestId="workspace-module" layout="screen" />}><Workspace /></Suspense>} />
        <Route path="/viewer/:id" element={<ViewerRoute />} />
        <Route path="/charts/new" element={<Suspense fallback={<BrandLoading kind="chart" requestId="chart-create-module" layout="screen" />}><ChartCreate /></Suspense>} />
        <Route path="/chart/:id" element={<Suspense fallback={<BrandLoading kind="chart" requestId="chart-editor-module" layout="screen" />}><ChartEditor /></Suspense>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {pwaEnabled && <PwaUpdatePrompt />}
    </HashRouter>
  )
}
