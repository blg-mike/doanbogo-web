import { useNavigate } from 'react-router-dom'
import { ArrowLeft, FilePlus2, Grid3X3, Images } from 'lucide-react'
import AppNavigation from './AppNavigation'
import './Home.css'

export default function NewProject() {
  const navigate = useNavigate()
  return <div className="app-page-frame new-project-page"><AppNavigation active="projects" /><main className="app-page-main">
    <header className="collection-header"><div><button className="home-view-all" onClick={() => navigate('/')}><ArrowLeft size={15} />홈으로</button><p className="home-eyebrow">NEW PROJECT</p><h1>새 프로젝트 만들기</h1><p>도안이나 차트를 선택해 뜨개 작업을 시작하세요.</p></div></header>
    <div className="new-project-options"><button onClick={() => navigate('/projects?add=pdf')}><FilePlus2 size={24} />PDF 가져오기<small>가지고 있는 PDF 도안을 추가해요.</small></button><button onClick={() => navigate('/projects?add=photos')}><Images size={24} />사진 도안 만들기<small>카메라나 사진으로 페이지를 만들어요.</small></button><button onClick={() => navigate('/charts/new')}><Grid3X3 size={24} />차트 만들기<small>새 대바늘·코바늘 차트를 만들어요.</small></button></div>
  </main></div>
}
