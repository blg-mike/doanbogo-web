import { t } from './locales/index'
import type { LocaleKey } from './locales/index'
import { NavLink } from 'react-router-dom'
import { FileText, FolderOpen } from 'lucide-react'
import WorkspaceLanguageSelect from './WorkspaceLanguageSelect'
import yyLogo from './assets/yy-logo.png'

export type AppSection = 'projects' | 'reports'

const links: { to: string; label: LocaleKey; icon: typeof FolderOpen; section: AppSection }[] = [
  { to: '/projects', label: '프로젝트', icon: FolderOpen, section: 'projects' },
  { to: '/reports', label: '보고서', icon: FileText, section: 'reports' },
] as const

const homepageHref = import.meta.env.MODE === 'portable'
  ? './homepage.html'
  : import.meta.env.DEV ? '/homepage/' : '/'

function CoffeeSupportLink({ className }: { className: string }) {
  const label = t('실 한 볼 선물하기')
  return <a className={className} href="https://buymeacoffee.com/knitpeek" target="_blank" rel="noopener noreferrer" aria-label={label} title={label}>
    <span className="app-support-icon" aria-hidden="true">🧶</span>
    <span className="app-support-label">{label}</span>
  </a>
}

export default function AppNavigation({ active }: { active: AppSection }) {
  return <>
    <aside className="app-sidebar" aria-label={t("주 메뉴")}>
      <a href={homepageHref} className="app-sidebar-brand" aria-label={t("도안보고 홈")}><img src={yyLogo} alt="" /><strong>{t("도안보고")}</strong></a>
      <nav>{links.map(({ to, label, icon: Icon, section }) => <NavLink key={to} to={to} className={active === section ? 'active' : ''}><Icon size={18} /><span>{t(label)}</span></NavLink>)}</nav>
      <div className="app-sidebar-footer"><small>{t("나의 뜨개 작업을")}<br />{t("한곳에서 관리해요.")}</small><WorkspaceLanguageSelect className="app-sidebar-language" /><CoffeeSupportLink className="app-sidebar-coffee" /></div>
    </aside>
    <nav className="app-mobile-nav" aria-label={t("주 메뉴")}>
      {links.map(({ to, label, icon: Icon, section }) => <NavLink key={to} to={to} className={active === section ? 'active' : ''}><Icon size={19} /><span>{t(label)}</span></NavLink>)}
      <div className="app-mobile-language"><WorkspaceLanguageSelect /></div>
      <CoffeeSupportLink className="app-mobile-coffee" />
    </nav>
  </>
}
