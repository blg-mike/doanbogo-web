import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import LocalizedApp from './LocalizedApp'
import { LocaleProvider } from './locales'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LocaleProvider><LocalizedApp /></LocaleProvider>
  </StrictMode>,
)
