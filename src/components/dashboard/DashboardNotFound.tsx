import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/useAuth'
import { roleBasePath } from '../../data/roleAccess'
import './DashboardNotFound.css'

const REDIRECT_SECONDS = 3

function DashboardNotFound() {
  const { role } = useAuth()
  const navigate = useNavigate()
  const [secondsLeft, setSecondsLeft] = useState(REDIRECT_SECONDS)

  const target = role ? `${roleBasePath[role]}/dashboard` : '/login'

  useEffect(() => {
    if (secondsLeft <= 0) {
      navigate(target, { replace: true })
      return
    }
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000)
    return () => clearTimeout(timer)
  }, [secondsLeft, navigate, target])

  return (
    <div className="dash-404">
      <span className="dash-404-code">404</span>
      <h1>This page isn&apos;t part of your dashboard</h1>
      <p>
        Taking you back to your dashboard in <strong>{secondsLeft}</strong>
        {secondsLeft === 1 ? ' second' : ' seconds'}…
      </p>
    </div>
  )
}

export default DashboardNotFound
