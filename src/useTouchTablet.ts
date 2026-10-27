import { useEffect, useState } from 'react'

export function useTouchTablet() {
  const [isTouchTablet, setIsTouchTablet] = useState(() => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse) and (min-width: 600px)').matches)

  useEffect(() => {
    const query = window.matchMedia('(pointer: coarse) and (min-width: 600px)')
    const update = () => setIsTouchTablet(query.matches)
    query.addEventListener('change', update)
    window.addEventListener('resize', update)
    update()
    return () => {
      query.removeEventListener('change', update)
      window.removeEventListener('resize', update)
    }
  }, [])

  return isTouchTablet
}
