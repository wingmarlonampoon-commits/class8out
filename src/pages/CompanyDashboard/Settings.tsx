import { useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import { Building2, Clock, Eye, EyeOff, Globe, Layers, Lock, Mail, MapPin, Phone, UserCheck } from 'lucide-react'
import bcrypt from 'bcryptjs'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/useAuth'
import { DEFAULT_COMPANY_SETTINGS, type CompanySettings } from '../../data/companySettings'
import { getAllTimezones } from '../../lib/timezones'
import '../../styles/settingsPanel.css'

type CompanyRow = {
  company_name: string
  address: string
  phone_number: string
  email: string
  CompanyCode: string
  created_at: string
  subscription: { plan: string; price: string; period: string } | null
  company_settings: Partial<CompanySettings> | null
}

type Message = { type: 'success' | 'error'; text: string }

const TIMEZONES = getAllTimezones()

function Settings() {
  const { session } = useAuth()
  const [company, setCompany] = useState<CompanyRow | null>(null)
  const [loading, setLoading] = useState(true)

  const [timezone, setTimezone] = useState(DEFAULT_COMPANY_SETTINGS.timezone)
  const [timeInterval, setTimeInterval] = useState<'30' | '60'>(DEFAULT_COMPANY_SETTINGS.time_interval)
  const [teacherSelfBooking, setTeacherSelfBooking] = useState(DEFAULT_COMPANY_SETTINGS.teacher_self_booking)

  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<Message | null>(null)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const [passwordMessage, setPasswordMessage] = useState<Message | null>(null)

  useEffect(() => {
    const email = session?.user.email
    if (!email) return

    supabase
      .from('company_registration')
      .select('company_name, address, phone_number, email, CompanyCode, created_at, subscription, company_settings')
      .eq('email', email)
      .single()
      .then(({ data }) => {
        if (data) {
          setCompany(data as CompanyRow)
          const settings = data.company_settings ?? {}
          setTimezone(settings.timezone ?? DEFAULT_COMPANY_SETTINGS.timezone)
          setTimeInterval(settings.time_interval ?? DEFAULT_COMPANY_SETTINGS.time_interval)
          setTeacherSelfBooking(settings.teacher_self_booking ?? DEFAULT_COMPANY_SETTINGS.teacher_self_booking)
        }
        setLoading(false)
      })
  }, [session])

  const handleSave = async () => {
    if (!company) return

    setSaving(true)
    setSaveMessage(null)

    const newSettings: CompanySettings = {
      timezone,
      time_interval: timeInterval,
      teacher_self_booking: teacherSelfBooking,
    }

    // Sitewide defaults, so saving here cascades to every admin (co-admins
    // included, not just the one saving) and every teacher in the company —
    // matched by CompanyCode/company_code rather than just the caller's own
    // row, so nobody is left running on stale settings.
    const [{ error: adminsError }, { error: teachersError }] = await Promise.all([
      supabase
        .from('company_registration')
        .update({ company_settings: newSettings, updated_at: new Date().toISOString() })
        .eq('CompanyCode', company.CompanyCode),
      supabase
        .from('company_organizational_chart')
        .update({ Settings: newSettings, updated_at: new Date().toISOString() })
        .eq('company_code', company.CompanyCode),
    ])

    setSaving(false)
    setSaveMessage(
      adminsError || teachersError
        ? { type: 'error', text: 'Could not save settings. Please try again.' }
        : { type: 'success', text: 'Settings saved for you, co-admins, and all teachers.' },
    )
  }

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault()
    setPasswordMessage(null)

    const email = session?.user.email
    if (!email) return

    if (newPassword !== confirmNewPassword) {
      setPasswordMessage({ type: 'error', text: 'New passwords do not match.' })
      return
    }
    if (newPassword.length < 6) {
      setPasswordMessage({ type: 'error', text: 'New password must be at least 6 characters.' })
      return
    }

    setChangingPassword(true)

    const { error: verifyError } = await supabase.auth.signInWithPassword({ email, password: currentPassword })
    if (verifyError) {
      setChangingPassword(false)
      setPasswordMessage({ type: 'error', text: 'Current password is incorrect.' })
      return
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
    if (updateError) {
      setChangingPassword(false)
      setPasswordMessage({ type: 'error', text: 'Could not update password. Please try again.' })
      return
    }

    const passwordHash = await bcrypt.hash(newPassword, 10)
    await supabase
      .from('company_registration')
      .update({ password: passwordHash, updated_at: new Date().toISOString() })
      .eq('email', email)

    setChangingPassword(false)
    setPasswordMessage({ type: 'success', text: 'Password updated.' })
    setCurrentPassword('')
    setNewPassword('')
    setConfirmNewPassword('')
  }

  const accentStyle = (color: string) => ({ '--accent': color }) as CSSProperties

  return (
    <div className="settings-page">
      <div className="settings-grid">
        <div className="settings-col">
          <div className="settings-panel settings-panel-decor" style={accentStyle('#2f6bff')}>
            <div className="settings-profile-header">
              <span className="settings-profile-avatar">
                <Building2 size={22} />
              </span>
              <div>
                <h2 className="settings-profile-name">{loading ? 'Loading…' : company?.company_name ?? 'Company'}</h2>
                {company && <span className="settings-profile-code">Code: {company.CompanyCode}</span>}
              </div>
            </div>

            {loading ? (
              <p className="settings-loading">Loading company details…</p>
            ) : company ? (
              <div className="settings-details-grid">
                <div className="settings-detail" style={accentStyle('#2f6bff')}>
                  <span className="settings-detail-icon">
                    <Mail size={16} />
                  </span>
                  <div>
                    <span className="settings-detail-label">Email</span>
                    <span className="settings-detail-value">{company.email}</span>
                  </div>
                </div>

                <div className="settings-detail" style={accentStyle('#1fa971')}>
                  <span className="settings-detail-icon">
                    <Phone size={16} />
                  </span>
                  <div>
                    <span className="settings-detail-label">Phone Number</span>
                    <span className="settings-detail-value">{company.phone_number}</span>
                  </div>
                </div>

                <div className="settings-detail" style={accentStyle('#f5a524')}>
                  <span className="settings-detail-icon">
                    <MapPin size={16} />
                  </span>
                  <div>
                    <span className="settings-detail-label">Address</span>
                    <span className="settings-detail-value">{company.address}</span>
                  </div>
                </div>

                {company.subscription && (
                  <div className="settings-detail" style={accentStyle('#8b5cf6')}>
                    <span className="settings-detail-icon">
                      <Layers size={16} />
                    </span>
                    <div>
                      <span className="settings-detail-label">Plan</span>
                      <span className="settings-detail-value">
                        {company.subscription.plan}
                        {company.subscription.price !== 'Free' &&
                          ` · ${company.subscription.price}${company.subscription.period}`}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="settings-loading">Could not load company details.</p>
            )}
          </div>

          <div className="settings-panel settings-panel-decor" style={accentStyle('#e5484d')}>
            <div className="settings-panel-header-icon">
              <span className="settings-icon-badge">
                <Lock size={18} />
              </span>
              <div>
                <h2>Change Password</h2>
                <p className="settings-panel-subtitle">Use a strong password you don't use anywhere else.</p>
              </div>
            </div>

            <form className="settings-password-form" onSubmit={handleChangePassword}>
              <div className="settings-input-group">
                <label htmlFor="current-password" className="settings-field-label">
                  Current Password
                </label>
                <div className="settings-password-field">
                  <input
                    id="current-password"
                    type={showCurrent ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrent((v) => !v)}
                    aria-label={showCurrent ? 'Hide password' : 'Show password'}
                  >
                    {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="settings-input-group">
                <label htmlFor="new-password" className="settings-field-label">
                  New Password
                </label>
                <div className="settings-password-field">
                  <input
                    id="new-password"
                    type={showNew ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    minLength={6}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew((v) => !v)}
                    aria-label={showNew ? 'Hide password' : 'Show password'}
                  >
                    {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="settings-input-group">
                <label htmlFor="confirm-new-password" className="settings-field-label">
                  Confirm New Password
                </label>
                <div className="settings-password-field">
                  <input
                    id="confirm-new-password"
                    type={showConfirm ? 'text' : 'password'}
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    minLength={6}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm((v) => !v)}
                    aria-label={showConfirm ? 'Hide password' : 'Show password'}
                  >
                    {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="settings-save-row">
                {passwordMessage && (
                  <span className={`settings-save-message is-${passwordMessage.type}`}>{passwordMessage.text}</span>
                )}
                <button className="btn btn-primary" type="submit" disabled={changingPassword}>
                  {changingPassword ? 'Updating…' : 'Change Password'}
                </button>
              </div>
            </form>
          </div>
        </div>

        <div className="settings-panel settings-panel-fill settings-panel-decor" style={accentStyle('#8b5cf6')}>
          <div className="settings-panel-header-icon">
            <span className="settings-icon-badge">
              <Globe size={18} />
            </span>
            <div>
              <h2>System Settings</h2>
              <p className="settings-panel-subtitle">Sitewide defaults every teacher and student follows.</p>
            </div>
          </div>

          <div className="settings-field">
            <div className="settings-field-heading">
              <span className="settings-field-icon" style={accentStyle('#2f6bff')}>
                <Globe size={15} />
              </span>
              <label htmlFor="settings-timezone" className="settings-field-label">
                Time Zone
              </label>
            </div>
            <p className="settings-field-help">
              The time zone that everyone on the system will follow — students and teachers will see all bookings
              and schedules in this time zone.
            </p>
            <select
              id="settings-timezone"
              className="settings-select"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            >
              {TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
          </div>

          <div className="settings-field">
            <div className="settings-field-heading">
              <span className="settings-field-icon" style={accentStyle('#8b5cf6')}>
                <Clock size={15} />
              </span>
              <span className="settings-field-label">Time Interval</span>
            </div>
            <p className="settings-field-help">
              Any class schedule that falls outside a fixed slot will be rounded up to the nearest 30-minute or
              1-hour block, depending on which you choose here.
            </p>
            <div className="settings-radio-group">
              <label className={`settings-radio ${timeInterval === '30' ? 'is-active' : ''}`}>
                <input
                  type="radio"
                  name="timeInterval"
                  value="30"
                  checked={timeInterval === '30'}
                  onChange={() => setTimeInterval('30')}
                />
                30 Minutes
              </label>
              <label className={`settings-radio ${timeInterval === '60' ? 'is-active' : ''}`}>
                <input
                  type="radio"
                  name="timeInterval"
                  value="60"
                  checked={timeInterval === '60'}
                  onChange={() => setTimeInterval('60')}
                />
                1 Hour
              </label>
            </div>
          </div>

          <div className="settings-field">
            <div className="settings-field-heading">
              <span className="settings-field-icon" style={accentStyle('#1fa971')}>
                <UserCheck size={15} />
              </span>
              <span className="settings-field-label">Teacher Self-Booking</span>
            </div>
            <p className="settings-field-help">
              Allow teachers to book their own students directly, without going through a company admin.
            </p>
            <div className="settings-radio-group">
              <label className={`settings-radio ${teacherSelfBooking ? 'is-active' : ''}`}>
                <input
                  type="radio"
                  name="teacherSelfBooking"
                  checked={teacherSelfBooking}
                  onChange={() => setTeacherSelfBooking(true)}
                />
                Allow
              </label>
              <label className={`settings-radio ${!teacherSelfBooking ? 'is-active' : ''}`}>
                <input
                  type="radio"
                  name="teacherSelfBooking"
                  checked={!teacherSelfBooking}
                  onChange={() => setTeacherSelfBooking(false)}
                />
                Don't Allow
              </label>
            </div>
          </div>

          <div className="settings-save-row">
            {saveMessage && <span className={`settings-save-message is-${saveMessage.type}`}>{saveMessage.text}</span>}
            <button className="btn btn-primary" type="button" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Settings
