import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

function ScrollToTop() {
  const { pathname, state } = useLocation()

  useEffect(() => {
    const scrollTo = (state as { scrollTo?: string } | null)?.scrollTo
    if (scrollTo) return
    window.scrollTo(0, 0)
    // Only react to actual page changes — a same-path state update (e.g. clearing
    // the scrollTo target after an anchor jump) must not re-trigger this reset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  return null
}

export default ScrollToTop
