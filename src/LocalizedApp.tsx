import App from './App'
import { useLocale } from './locales'

export default function LocalizedApp() {
  useLocale()
  return <App />
}
