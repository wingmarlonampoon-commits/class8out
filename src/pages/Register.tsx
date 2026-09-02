import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, Eye, EyeOff } from 'lucide-react'
import bcrypt from 'bcryptjs'
import Logo from '../components/Logo'
import { businessPlans, teacherPlans } from '../data/pricing'
import { supabase } from '../lib/supabaseClient'
import { generateCompanyCode } from '../lib/companyCode'
import { ROLE, roleBasePath } from '../data/roleAccess'
import { DEFAULT_COMPANY_SETTINGS } from '../data/companySettings'
import './Auth.css'

const MAX_COMPANY_CODE_ATTEMPTS = 3

// Freelance teachers don't have a teacher_self_booking concept (no employer
// to gate against), so this deliberately omits that key — same
// timezone/interval defaults as DEFAULT_COMPANY_SETTINGS for consistency.
const DEFAULT_FREELANCE_SETTINGS = { timezone: 'Asia/Manila', time_interval: '30' as const }

type AccountType = 'company' | 'teacher'

function Register() {
  const navigate = useNavigate()
  const location = useLocation()
  const initial = location.state as { accountType?: AccountType; plan?: string } | null

  const [accountType, setAccountType] = useState<AccountType>(initial?.accountType ?? 'company')
  const plans = accountType === 'company' ? businessPlans : teacherPlans
  const [selectedPlan, setSelectedPlan] = useState(initial?.plan ?? plans[0].name)

  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleTypeChange = (type: AccountType) => {
    setAccountType(type)
    const nextPlans = type === 'company' ? businessPlans : teacherPlans
    setSelectedPlan(nextPlans[0].name)
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')

    const form = new FormData(e.currentTarget)
    const email = String(form.get('email') || '')
    const password = String(form.get('password') || '')
    const confirmPassword = String(form.get('confirmPassword') || '')

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    if (accountType !== 'company') {
      const name = String(form.get('name') || '')
      const teacherPhone = String(form.get('phone') || '')
      const plan = plans.find((p) => p.name === selectedPlan)!

      setLoading(true)

      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { role: ROLE.TEACHER } },
      })

      if (signUpError || !data.user) {
        setError(signUpError?.message || 'Could not create your account. Please try again.')
        setLoading(false)
        return
      }

      const passwordHash = await bcrypt.hash(password, 10)

      const { error: insertError } = await supabase.from('freelance_teachers').insert({
        names: name,
        email,
        phone: teacherPhone,
        password: passwordHash,
        subscription: {
          plan: plan.name,
          price: plan.price,
          period: plan.period,
          subscribed_at: new Date().toISOString(),
        },
        settings: DEFAULT_FREELANCE_SETTINGS,
      })

      setLoading(false)

      if (insertError) {
        setError('Your account was created, but saving your teacher profile failed. Please contact support.')
        return
      }

      navigate(`${roleBasePath[ROLE.TEACHER]}/dashboard`)
      return
    }

    const companyName = String(form.get('companyName') || '')
    const address = String(form.get('address') || '')
    const phone = String(form.get('phone') || '')
    const plan = plans.find((p) => p.name === selectedPlan)!

    setLoading(true)

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { role: ROLE.COMPANY } },
    })

    if (signUpError || !data.user) {
      setError(signUpError?.message || 'Could not create your account. Please try again.')
      setLoading(false)
      return
    }

    const passwordHash = await bcrypt.hash(password, 10)
    const subscription = {
      plan: plan.name,
      price: plan.price,
      period: plan.period,
      subscribed_at: new Date().toISOString(),
    }

    let insertError = null
    for (let attempt = 0; attempt < MAX_COMPANY_CODE_ATTEMPTS; attempt++) {
      const { error: attemptError } = await supabase.from('company_registration').insert({
        company_name: companyName,
        address,
        phone_number: phone,
        subscription,
        company_settings: DEFAULT_COMPANY_SETTINGS,
        email,
        password: passwordHash,
        CompanyCode: generateCompanyCode(),
        Role: 1,
      })

      insertError = attemptError
      // Only a CompanyCode collision is worth retrying with a freshly generated code.
      if (!insertError || !/companycode/i.test(insertError.message)) break
    }

    setLoading(false)

    if (insertError) {
      setError('Your account was created, but saving your company details failed. Please contact support.')
      return
    }

    navigate(`${roleBasePath[ROLE.COMPANY]}/dashboard`)
  }

  return (
    <section className="auth-section">
      <Link to="/" className="auth-back">
        <ArrowLeft size={16} /> Back to Home
      </Link>

      <div className="auth-card auth-card-wide">
        <div className="auth-header">
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <Logo large />
          </div>
          <h1>Start for free</h1>
          <p>No credit card required to get started.</p>
        </div>

        {error && <div className="auth-error">{error}</div>}

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <span className="form-label">I am signing up as</span>
            <div className="radio-pill-group">
              <label className={`radio-pill ${accountType === 'company' ? 'is-active' : ''}`}>
                <input
                  type="radio"
                  name="accountType"
                  value="company"
                  checked={accountType === 'company'}
                  onChange={() => handleTypeChange('company')}
                />
                ESL Company
              </label>
              <label className={`radio-pill ${accountType === 'teacher' ? 'is-active' : ''}`}>
                <input
                  type="radio"
                  name="accountType"
                  value="teacher"
                  checked={accountType === 'teacher'}
                  onChange={() => handleTypeChange('teacher')}
                />
                Freelance ESL Teacher
              </label>
            </div>
          </div>

          {accountType === 'company' ? (
            <>
              <label>
                Company Name
                <input type="text" name="companyName" placeholder="Bright Sparks ESL" required />
              </label>
              <label>
                Address
                <input type="text" name="address" required />
              </label>
              <label>
                Phone Number
                <input type="tel" name="phone" placeholder="+63 9XX XXX XXXX" required />
              </label>
            </>
          ) : (
            <>
              <label>
                Name
                <input type="text" name="name" placeholder="Jane Doe" required />
              </label>
              <label>
                Phone Number
                <input type="tel" name="phone" placeholder="+63 9XX XXX XXXX" required />
              </label>
            </>
          )}

          <div className="form-group">
            <span className="form-label">Choose your plan</span>
            <div className="plan-radio-group">
              {plans.map((plan) => (
                <label
                  key={plan.name}
                  className={`plan-radio ${selectedPlan === plan.name ? 'is-active' : ''}`}
                >
                  <input
                    type="radio"
                    name="plan"
                    value={plan.name}
                    checked={selectedPlan === plan.name}
                    onChange={() => setSelectedPlan(plan.name)}
                  />
                  <span className="plan-radio-name">{plan.name}</span>
                  <span className="plan-radio-price">
                    {plan.price}
                    {plan.period}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <label>
            Email
            <input type="email" name="email" placeholder="you@example.com" required />
          </label>

          <label>
            Password
            <div className="password-field">
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                placeholder="••••••••"
                minLength={6}
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>

          <label>
            Confirm Password
            <div className="password-field">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                name="confirmPassword"
                placeholder="••••••••"
                minLength={6}
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowConfirmPassword((v) => !v)}
                aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
              >
                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>

          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? 'Creating Account…' : 'Create Account'}
          </button>
        </form>

        <div className="auth-footer">
          Already have an account?{' '}
          <Link to="/login" className="auth-link">
            Log in
          </Link>
        </div>
      </div>
    </section>
  )
}

export default Register
