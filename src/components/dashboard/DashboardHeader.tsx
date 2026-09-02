import { useEffect, useRef, useState } from 'react'
import { Calendar, ChevronDown, LogOut, Menu } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/useAuth'
import { roleLabel, roleAvatarIcon, roleBasePath, ROLE, type Role } from '../../data/roleAccess'
import Logo from '../Logo'
import './DashboardHeader.css'

type DashboardHeaderProps = {
  role: Role
  onToggleSidebar: () => void
}

function DashboardHeader({ role, onToggleSidebar }: DashboardHeaderProps) {
  const navigate = useNavigate()
  const { session } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const AvatarIcon = roleAvatarIcon[role]

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  const handleCalendarClick = () => {
    const path = role === ROLE.STUDENT ? 'classes' : 'schedule'
    navigate(`${roleBasePath[role]}/${path}`)
  }

  return (
    <header className="dash-header">
      <button className="dash-header-toggle" onClick={onToggleSidebar} aria-label="Toggle menu">
        <Menu size={20} />
      </button>

      <Logo />

      <div className="dash-header-actions">
        <button className="dash-icon-btn" aria-label="Calendar" onClick={handleCalendarClick}>
          <Calendar size={20} />
        </button>

        <div className="dash-avatar-menu" ref={menuRef}>
          <button
            className="dash-avatar-trigger"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-label="Account menu"
          >
            <span className="dash-avatar">
              <AvatarIcon size={18} />
            </span>
            <ChevronDown size={16} className={`dash-avatar-chevron ${menuOpen ? 'is-open' : ''}`} />
          </button>

          {menuOpen && (
            <div className="dash-avatar-dropdown">
              <div className="dash-avatar-dropdown-user">
                <strong>{session?.user.email}</strong>
                <span>{roleLabel[role]}</span>
              </div>
              <button className="dash-avatar-dropdown-item" onClick={handleLogout}>
                <LogOut size={16} /> Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

export default DashboardHeader
