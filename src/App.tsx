import { Suspense, lazy, useEffect } from 'react'
import { HashRouter, Navigate, Route, Routes, useParams } from 'react-router-dom'
import BrandLoading from './BrandLoading'
import PwaUpdatePrompt from './PwaUpdatePrompt'
import './App.css'
import './Home.css'

const Workspace = lazy(() => import('./Workspace'))
const Home = lazy(() => import('./Home'))
const ProjectDetail = lazy(() => import('./ProjectDetail'))
const ReportsPage = lazy(() => import('./ReportsPage'))
const NewProject = lazy(() => import('./NewProject'))
const StandaloneReportRoute = lazy(() => import('./StandaloneReportRoute'))
const Viewer = lazy(() => import('./Viewer'))
const ChartCreate = lazy(() => import('./ChartCreate'))
const ChartEditor = lazy(() => import('./ChartEditor'))

function ViewerRoute() {
  const { id } = useParams()
  return <Suspense fallback={<BrandLoading kind="pdf" requestId={'viewer-module:' + id} layout="screen" />}><Viewer key={id} /></Suspense>
}

function ScreenWakeLock() {
  useEffect(() => {
    let active = true
    let requesting = false
    let requestAgain = false
    let sentinel: WakeLockSentinel | null = null

    const requestLock = async () => {
      if (!active || document.visibilityState !== 'visible' || !('wakeLock' in navigator) || (sentinel && !sentinel.released)) return
      if (requesting) {
        requestAgain = true
        return
      }
      requesting = true
      try {
        const requested = await navigator.wakeLock.request('screen')
        if (!active) {
          await requested.release()
          return
        }
        sentinel = requested
        requested.addEventListener('release', () => {
          if (sentinel === requested) sentinel = null
        }, { once: true })
      } catch {
        // The browser or operating system may deny a screen wake lock.
      } finally {
        requesting = false
        if (requestAgain) {
          requestAgain = false
          void requestLock()
        }
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void requestLock()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    void requestLock()
    return () => {
      active = false
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (sentinel && !sentinel.released) void sentinel.release()
    }
  }, [])

  return null
}

export default function App() {
  const pwaEnabled = !import.meta.env.VITE_PORTABLE

  return (
    <HashRouter>
      <ScreenWakeLock />
      <Routes>
        <Route path="/" element={<Suspense fallback={<BrandLoading kind="app" requestId="home-module" layout="screen" />}><Home /></Suspense>} />
        <Route path="/projects" element={<Suspense fallback={<BrandLoading kind="app" requestId="projects-module" layout="screen" />}><Workspace /></Suspense>} />
        <Route path="/projects/new" element={<Suspense fallback={<BrandLoading kind="app" requestId="new-project-module" layout="screen" />}><NewProject /></Suspense>} />
        <Route path="/projects/:kind/:id" element={<Suspense fallback={<BrandLoading kind="app" requestId="project-detail-module" layout="screen" />}><ProjectDetail /></Suspense>} />
        <Route path="/reports" element={<Suspense fallback={<BrandLoading kind="report" requestId="reports-module" layout="screen" />}><ReportsPage /></Suspense>} />
        <Route path="/report/:documentId/:reportId" element={<Suspense fallback={<BrandLoading kind="report" requestId="report-module" layout="screen" />}><StandaloneReportRoute /></Suspense>} />
        <Route path="/viewer/:id" element={<ViewerRoute />} />
        <Route path="/charts/new" element={<Suspense fallback={<BrandLoading kind="chart" requestId="chart-create-module" layout="screen" />}><ChartCreate /></Suspense>} />
        <Route path="/chart/:id" element={<Suspense fallback={<BrandLoading kind="chart" requestId="chart-editor-module" layout="screen" />}><ChartEditor /></Suspense>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {pwaEnabled && <PwaUpdatePrompt />}
    </HashRouter>
  )
}
