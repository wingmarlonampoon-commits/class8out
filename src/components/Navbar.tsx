import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import Logo from './Logo'
import { scrollToId } from '../lib/scroll'
import { useAuth } from '../context/useAuth'
import { roleBasePath } from '../data/roleAccess'
import './Navbar.css'

const links = [
  { id: 'home', label: 'Home' },
  { id: 'about', label: 'About' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'contact', label: 'Contact Us' },
]

function Navbar() {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState('home')
  const [scrolled, setScrolled] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const { session, role } = useAuth()
  const isHome = location.pathname === '/'

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!isHome) return

    const sections = links
      .map((link) => document.getElementById(link.id))
      .filter((el): el is HTMLElement => el !== null)

    if (sections.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting)
        if (visible.length > 0) {
          setActive(visible[0].target.id)
        }
      },
      { rootMargin: '-100px 0px -60% 0px', threshold: 0 },
    )

    sections.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [isHome])

  useEffect(() => {
    if (!isHome) return
    const state = location.state as { scrollTo?: string } | null
    if (state?.scrollTo) {
      requestAnimationFrame(() => scrollToId(state.scrollTo!))
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [isHome, location, navigate])

  const goToSection = (id: string) => {
    setOpen(false)
    if (isHome) {
      scrollToId(id)
      setActive(id)
    } else {
      navigate('/', { state: { scrollTo: id } })
    }
  }

  const goToPage = (path: string) => {
    setOpen(false)
    navigate(path)
  }

  return (
    <header className={`navbar ${scrolled ? 'is-scrolled' : ''}`}>
      <div className="container navbar-inner">
        <Logo onClick={() => goToSection('home')} />

        <nav className={`navbar-links ${open ? 'is-open' : ''}`}>
          {links.map((link) => (
            <button
              key={link.id}
              className={`navbar-link ${isHome && active === link.id ? 'is-active' : ''}`}
              onClick={() => goToSection(link.id)}
            >
              {link.label}
            </button>
          ))}

          <div className="navbar-actions navbar-actions-mobile">
            {session && role ? (
              <button className="btn btn-primary btn-block" onClick={() => goToPage(`${roleBasePath[role]}/dashboard`)}>
                Go back to Dashboard
              </button>
            ) : (
              <>
                <button className="btn btn-outline btn-block" onClick={() => goToPage('/login')}>
                  Login
                </button>
                <button className="btn btn-primary btn-block" onClick={() => goToPage('/register')}>
                  Start for Free
                </button>
              </>
            )}
          </div>
        </nav>

        <div className="navbar-actions navbar-actions-desktop">
          {session && role ? (
            <button className="btn btn-primary" onClick={() => goToPage(`${roleBasePath[role]}/dashboard`)}>
              Go back to Dashboard
            </button>
          ) : (
            <>
              <button className="navbar-login" onClick={() => goToPage('/login')}>
                Login
              </button>
              <button className="btn btn-primary" onClick={() => goToPage('/register')}>
                Start for Free
              </button>
            </>
          )}
        </div>

        <button
          className="navbar-toggle"
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
    </header>
  )
}

export default Navbar
