import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../context/useAuth'
import type { Role } from '../../data/roleAccess'
import DashboardNotFound from './DashboardNotFound'

type PrivateRouteProps = {
  allowedRole: Role
  children: ReactNode
}

function PrivateRoute({ allowedRole, children }: PrivateRouteProps) {
  const { session, role, loading } = useAuth()

  if (loading) return null
  if (!session) return <Navigate to="/login" replace />
  // Signed in, but this dashboard isn't theirs — not part of their routes.
  if (role !== allowedRole) return <DashboardNotFound />

  return <>{children}</>
}

export default PrivateRoute
