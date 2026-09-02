import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import Logo from '../components/Logo'
import { supabase } from '../lib/supabaseClient'
import { roleBasePath, type Role } from '../data/roleAccess'
import './Auth.css'

function Login() {
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const email = String(form.get('email') || '')
    const password = String(form.get('password') || '')

    if (!email || !password) {
      setError('Please enter your email and password.')
      return
    }

    setError('')
    setLoading(true)

    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password })

    setLoading(false)

    if (signInError || !data.user) {
      setError(signInError?.message || 'Invalid email or password.')
      return
    }

    const role = data.user.user_metadata?.role as Role | undefined
    navigate(role ? `${roleBasePath[role]}/dashboard` : '/')
  }

  return (
    <section className="auth-section">
      <Link to="/" className="auth-back">
        <ArrowLeft size={16} /> Back to Home
      </Link>

      <div className="auth-card">
        <div className="auth-header">
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <Logo large />
          </div>
          <h1>Welcome back</h1>
          <p>Log in to manage your classes, bookings, and students.</p>
        </div>

        {error && <div className="auth-error">{error}</div>}

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            Email
            <input type="email" name="email" placeholder="you@example.com" required />
          </label>
          <label>
            Password
            <input type="password" name="password" placeholder="••••••••" required />
          </label>

          <div className="auth-row">
            <label className="auth-check">
              <input type="checkbox" name="remember" />
              Remember me
            </label>
            <button
              type="button"
              className="auth-link auth-link-btn"
              onClick={() => navigate('/', { state: { scrollTo: 'contact' } })}
            >
              Forgot password?
            </button>
          </div>

          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? 'Logging In…' : 'Log In'}
          </button>
        </form>

        <div className="auth-footer">
          Don&apos;t have an account?{' '}
          <Link to="/register" className="auth-link">
            Start for Free
          </Link>
        </div>
      </div>
    </section>
  )
}

export default Login
