import { t } from './locales/index'
import type { LocaleKey } from './locales/index'
import { NavLink, Link } from 'react-router-dom'
import { FileText, FolderOpen, Home, Settings } from 'lucide-react'
import yyLogo from './assets/yy-logo.png'

export type AppSection = 'home' | 'projects' | 'reports'

const links: { to: string; label: LocaleKey; icon: typeof Home; section: AppSection }[] = [
  { to: '/', label: '홈', icon: Home, section: 'home' },
  { to: '/projects', label: '프로젝트', icon: FolderOpen, section: 'projects' },
  { to: '/reports', label: '보고서', icon: FileText, section: 'reports' },
] as const

export default function AppNavigation({ active }: { active: AppSection }) {
  return <>
    <aside className="app-sidebar" aria-label={t("주 메뉴")}>
      <Link to="/" className="app-sidebar-brand"><img src={yyLogo} alt="" /><strong>{t("도안보고")}</strong></Link>
      <nav>{links.map(({ to, label, icon: Icon, section }) => <NavLink key={to} to={to} end={to === '/'} className={active === section ? 'active' : ''}><Icon size={18} /><span>{t(label)}</span></NavLink>)}</nav>
      <Link className="app-sidebar-settings" to="/projects?settings=1"><Settings size={17} /><span>{t("설정")}</span></Link>
      <small>{t("나의 뜨개 작업을")}<br />{t("한곳에서 관리해요.")}</small>
    </aside>
    <nav className="app-mobile-nav" aria-label={t("주 메뉴")}>
      {links.map(({ to, label, icon: Icon, section }) => <NavLink key={to} to={to} end={to === '/'} className={active === section ? 'active' : ''}><Icon size={19} /><span>{t(label)}</span></NavLink>)}
    </nav>
  </>
}
