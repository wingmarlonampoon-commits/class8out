import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import DashboardHeader from './DashboardHeader'
import DashboardSidebar from './DashboardSidebar'
import type { Role } from '../../data/roleAccess'
import './DashboardLayout.css'

type DashboardLayoutProps = {
  role: Role
}

const COLLAPSE_KEY = 'dash-sidebar-collapsed'

function DashboardLayout({ role }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1'
    } catch {
      return false
    }
  })

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0')
      } catch {
        /* ignore */
      }
      return next
    })
  }

  return (
    <div className="dash-shell">
      <DashboardHeader role={role} onToggleSidebar={() => setSidebarOpen((v) => !v)} />
      <div className="dash-body">
        <DashboardSidebar
          role={role}
          open={sidebarOpen}
          onNavigate={() => setSidebarOpen(false)}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapsed}
        />
        <main className="dash-main">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default DashboardLayout
