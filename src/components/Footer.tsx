import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowUp } from 'lucide-react'
import Logo from './Logo'
import { scrollToId } from '../lib/scroll'
import './Footer.css'

const sectionLinks = [
  {
    title: 'Product',
    links: [
      { label: 'Features', id: 'features' },
      { label: 'Pricing', id: 'pricing' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About', id: 'about' },
      { label: 'Contact Us', id: 'contact' },
    ],
  },
]

const accountLinks = [
  { label: 'Login', path: '/login' },
  { label: 'Start for Free', path: '/register' },
]

function Footer() {
  const location = useLocation()
  const navigate = useNavigate()
  const isHome = location.pathname === '/'

  const goToSection = (id: string) => {
    if (isHome) {
      scrollToId(id)
    } else {
      navigate('/', { state: { scrollTo: id } })
    }
  }

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' })

  return (
    <footer className="footer">
      <div className="footer-accent" aria-hidden="true" />

      <div className="container footer-inner">
        <div className="footer-brand">
          <Logo large />
          <p>The all-in-one booking system built for ESL companies and freelance teachers.</p>
        </div>

        <div className="footer-columns">
          {sectionLinks.map((col) => (
            <div className="footer-col" key={col.title}>
              <h4>{col.title}</h4>
              <ul>
                {col.links.map((link) => (
                  <li key={link.label}>
                    <button onClick={() => goToSection(link.id)}>{link.label}</button>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div className="footer-col">
            <h4>Account</h4>
            <ul>
              {accountLinks.map((link) => (
                <li key={link.label}>
                  <button onClick={() => navigate(link.path)}>{link.label}</button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="footer-bottom">
        <div className="container footer-bottom-inner">
          <span>© {new Date().getFullYear()} Class8out. All rights reserved.</span>
          <button className="footer-top-btn" onClick={scrollToTop} aria-label="Back to top">
            <ArrowUp size={16} />
          </button>
        </div>
      </div>
    </footer>
  )
}

export default Footer
