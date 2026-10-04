import { Check, RefreshCw, X } from 'lucide-react'
import { useRegisterSW } from 'virtual:pwa-register/react'

export default function PwaUpdatePrompt() {
  const { needRefresh: [needRefresh, setNeedRefresh], offlineReady: [offlineReady, setOfflineReady], updateServiceWorker } = useRegisterSW({ immediate: true })
  if (!needRefresh && !offlineReady) return null

  return (
    <aside className="pwa-notice" role="status">
      <span className="pwa-notice-icon">{needRefresh ? <RefreshCw size={17} /> : <Check size={17} />}</span>
      <span>{needRefresh ? '새 버전이 준비됐어요. 작업 상태를 저장한 뒤 적용할 수 있습니다.' : '다음 방문부터 오프라인에서도 열 수 있도록 준비했습니다.'}</span>
      <div className="pwa-notice-actions">
        {needRefresh && <button className="pwa-update-button" onClick={() => void updateServiceWorker(true)}>새로고침</button>}
        <button className="pwa-dismiss-button" aria-label="알림 닫기" onClick={() => { setNeedRefresh(false); setOfflineReady(false) }}><X size={17} /></button>
      </div>
    </aside>
  )
}
