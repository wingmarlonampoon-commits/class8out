import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  Building2,
  Check,
  Clock,
  Eye,
  EyeOff,
  ExternalLink,
  Globe,
  GraduationCap,
  Info,
  Layers,
  Lock,
  Mail,
  Phone,
  Play,
  Plus,
  Search,
  UserCheck,
  X,
} from 'lucide-react'
import bcrypt from 'bcryptjs'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/useAuth'
import { useTeacherIdentity } from '../../hooks/useTeacherIdentity'
import { getAllTimezones } from '../../lib/timezones'
import { toDirectImageUrl, getVideoEmbed } from '../../lib/mediaEmbeds'
import { ESL_SUBJECTS } from '../../data/eslSubjects'
import { COMM_PLATFORMS } from '../../data/commPlatforms'
import '../../styles/settingsPanel.css'
import './Settings.css'

type Message = { type: 'success' | 'error'; text: string }
type ContactEntry = { platform: string; handle: string }

const TIMEZONES = getAllTimezones()
const TIMEZONE_LABELS = new Map(TIMEZONES.map((tz) => [tz.value, tz.label]))

function Settings() {
  const { session } = useAuth()
  const { identity, loading } = useTeacherIdentity()

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const [passwordMessage, setPasswordMessage] = useState<Message | null>(null)

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault()
    setPasswordMessage(null)

    const email = session?.user.email
    if (!email || !identity) return

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
    const table = identity.kind === 'freelance' ? 'freelance_teachers' : 'company_organizational_chart'
    await supabase.from(table).update({ password: passwordHash, updated_at: new Date().toISOString() }).eq('email', email)

    setChangingPassword(false)
    setPasswordMessage({ type: 'success', text: 'Password updated.' })
    setCurrentPassword('')
    setNewPassword('')
    setConfirmNewPassword('')
  }

  const [freelanceTimezone, setFreelanceTimezone] = useState('')
  const [freelanceInterval, setFreelanceInterval] = useState<'30' | '60'>('30')
  const [schedulingSaving, setSchedulingSaving] = useState(false)
  const [schedulingMessage, setSchedulingMessage] = useState<Message | null>(null)

  useEffect(() => {
    if (identity?.kind !== 'freelance') return
    setFreelanceTimezone(identity.settings.timezone)
    setFreelanceInterval(identity.settings.time_interval)
  }, [identity])

  const handleSaveScheduling = async () => {
    if (identity?.kind !== 'freelance') return

    setSchedulingSaving(true)
    setSchedulingMessage(null)

    const { error } = await supabase
      .from('freelance_teachers')
      .update({
        settings: { timezone: freelanceTimezone, time_interval: freelanceInterval },
        updated_at: new Date().toISOString(),
      })
      .eq('id', identity.teacherId)

    setSchedulingSaving(false)

    if (error) {
      setSchedulingMessage({ type: 'error', text: 'Could not save your schedule settings. Please try again.' })
      return
    }

    setSchedulingMessage({ type: 'success', text: 'Schedule settings saved.' })
  }

  const [profileLoading, setProfileLoading] = useState(true)
  const [profilePhoto, setProfilePhoto] = useState('')
  const [profilePhotoError, setProfilePhotoError] = useState(false)
  const [profileIntroVideo, setProfileIntroVideo] = useState('')
  const [profileVideoPlaying, setProfileVideoPlaying] = useState(false)
  const [profileIntroMessage, setProfileIntroMessage] = useState('')
  const [profileSelectedSubjects, setProfileSelectedSubjects] = useState<string[]>([])
  const [profileCustomSubject, setProfileCustomSubject] = useState('')
  const [profileCustomSubjects, setProfileCustomSubjects] = useState<string[]>([])
  const [profileSubjectSearch, setProfileSubjectSearch] = useState('')
  type ContactRow = { platform: string; customPlatform: string; handle: string }
  const emptyContactRow = (): ContactRow => ({ platform: COMM_PLATFORMS[0], customPlatform: '', handle: '' })
  const [profileContactRows, setProfileContactRows] = useState<ContactRow[]>([emptyContactRow()])
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileMessage, setProfileMessage] = useState<Message | null>(null)

  useEffect(() => {
    if (!identity) return

    setProfileLoading(true)

    const query =
      identity.kind === 'freelance'
        ? supabase
            .from('freelance_teachers')
            .select('photo, intro_video, intro_message, subject, "Contact"')
            .eq('id', identity.teacherId)
            .maybeSingle()
        : supabase
            .from('company_organizational_chart')
            .select('photo, intro_video, intro_message, subjects, contact')
            .eq('id', identity.teacherId)
            .maybeSingle()

    query.then(({ data }) => {
      const row = data as
        | { photo: string | null; intro_video: string | null; intro_message: string | null; subjects?: string[] | null; subject?: string[] | null; contact?: { contacts?: ContactEntry[] } | null; Contact?: { contacts?: ContactEntry[] } | null }
        | null

      setProfilePhoto(row?.photo ?? '')
      setProfilePhotoError(false)
      setProfileIntroVideo(row?.intro_video ?? '')
      setProfileIntroMessage(row?.intro_message ?? '')

      const subjects = (identity.kind === 'freelance' ? row?.subject : row?.subjects) ?? []
      setProfileSelectedSubjects(subjects.filter((s) => ESL_SUBJECTS.includes(s)))
      setProfileCustomSubjects(subjects.filter((s) => !ESL_SUBJECTS.includes(s)))

      const contact = identity.kind === 'freelance' ? row?.Contact : row?.contact
      const loadedContacts = contact?.contacts ?? []
      const rows: ContactRow[] =
        loadedContacts.length > 0
          ? loadedContacts.map((c) =>
              COMM_PLATFORMS.includes(c.platform)
                ? { platform: c.platform, customPlatform: '', handle: c.handle }
                : { platform: 'Other', customPlatform: c.platform, handle: c.handle },
            )
          : [emptyContactRow()]
      setProfileContactRows(rows)

      setProfileLoading(false)
    })
  }, [identity])

  const toggleProfileSubject = (s: string) => {
    setProfileSelectedSubjects((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))
  }

  const addProfileCustomSubject = () => {
    const trimmed = profileCustomSubject.trim()
    if (!trimmed || profileCustomSubjects.includes(trimmed) || ESL_SUBJECTS.includes(trimmed)) {
      setProfileCustomSubject('')
      return
    }
    setProfileCustomSubjects((prev) => [...prev, trimmed])
    setProfileCustomSubject('')
  }

  const removeProfileCustomSubject = (s: string) => {
    setProfileCustomSubjects((prev) => prev.filter((x) => x !== s))
  }

  const updateContactRow = (index: number, patch: Partial<ContactRow>) => {
    setProfileContactRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  const addContactRow = () => {
    setProfileContactRows((prev) => [...prev, emptyContactRow()])
  }

  const removeContactRow = (index: number) => {
    setProfileContactRows((prev) => (prev.length === 1 ? [emptyContactRow()] : prev.filter((_, i) => i !== index)))
  }

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault()
    if (!identity) return

    setProfileSaving(true)
    setProfileMessage(null)

    // Every row with both a platform and handle filled in is saved — empty
    // rows (e.g. an unused blank one left from "Add Contact") are skipped.
    const finalContacts: ContactEntry[] = profileContactRows
      .map((row) => {
        const platform = row.platform === 'Other' ? row.customPlatform.trim() : row.platform
        const handle = row.handle.trim()
        return platform && handle ? { platform, handle } : null
      })
      .filter((c): c is ContactEntry => c !== null)

    const finalSubjects = [...profileSelectedSubjects, ...profileCustomSubjects]
    const contactPayload = finalContacts.length > 0 ? { contacts: finalContacts } : null

    const { error } =
      identity.kind === 'freelance'
        ? await supabase
            .from('freelance_teachers')
            .update({
              photo: profilePhoto.trim() || null,
              intro_video: profileIntroVideo.trim() || null,
              intro_message: profileIntroMessage.trim() || null,
              subject: finalSubjects.length > 0 ? finalSubjects : null,
              Contact: contactPayload,
              updated_at: new Date().toISOString(),
            })
            .eq('id', identity.teacherId)
        : await supabase
            .from('company_organizational_chart')
            .update({
              photo: profilePhoto.trim() || null,
              intro_video: profileIntroVideo.trim() || null,
              intro_message: profileIntroMessage.trim() || null,
              subjects: finalSubjects.length > 0 ? finalSubjects : null,
              contact: contactPayload,
              updated_at: new Date().toISOString(),
            })
            .eq('id', identity.teacherId)

    setProfileSaving(false)

    if (error) {
      setProfileMessage({ type: 'error', text: 'Could not save your profile. Please try again.' })
      return
    }

    setProfileMessage({ type: 'success', text: 'Profile updated.' })
  }

  const filteredProfileSubjects = ESL_SUBJECTS.filter((s) => s.toLowerCase().includes(profileSubjectSearch.trim().toLowerCase()))

  const timezoneLabel =
    identity?.kind === 'company' ? (TIMEZONE_LABELS.get(identity.companySettings.timezone) ?? identity.companySettings.timezone) : '—'
  const intervalLabel = identity?.kind === 'company' ? (identity.companySettings.time_interval === '60' ? '1 Hour' : '30 Minutes') : '—'
  const selfBookingAllowed = identity?.kind === 'company' ? identity.selfBookingAllowed : null

  return (
    <div className="settings-page">
      <div className="settings-grid">
        <div className="settings-col">
          <div className="settings-panel">
            <div className="settings-profile-header">
              <span className="settings-profile-avatar">
                <UserCheck size={22} />
              </span>
              <div>
                <h2 className="settings-profile-name">{loading ? 'Loading…' : (identity?.name ?? 'Teacher')}</h2>
                {identity?.kind === 'company' && <span className="settings-profile-code">{identity.companyName}</span>}
              </div>
            </div>

            {loading ? (
              <p className="settings-loading">Loading your details…</p>
            ) : identity ? (
              <div className="settings-details-grid">
                <div className="settings-detail">
                  <span className="settings-detail-icon">
                    <Mail size={16} />
                  </span>
                  <div>
                    <span className="settings-detail-label">Email</span>
                    <span className="settings-detail-value">{identity.email}</span>
                  </div>
                </div>

                {identity.kind === 'freelance' && (
                  <div className="settings-detail">
                    <span className="settings-detail-icon">
                      <Layers size={16} />
                    </span>
                    <div>
                      <span className="settings-detail-label">Plan</span>
                      <span className="settings-detail-value">
                        {identity.subscription?.plan ?? 'Free'} · <Link to="/teacher-dashboard/subscription">View</Link>
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="settings-loading">Could not load your details.</p>
            )}
          </div>

          <div className="settings-panel">
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

        {identity?.kind === 'company' ? (
          <div className="settings-panel settings-panel-fill">
            <div className="settings-panel-header-icon">
              <span className="settings-icon-badge">
                <Building2 size={18} />
              </span>
              <div>
                <h2>Company Policies</h2>
                <p className="settings-panel-subtitle">Set by your company admin — shown here for reference.</p>
              </div>
            </div>

            <div className="settings-field">
              <div className="settings-field-heading">
                <span className="settings-field-icon">
                  <Globe size={15} />
                </span>
                <span className="settings-field-label">Time Zone</span>
              </div>
              <p className="settings-policy-value">{loading ? '—' : timezoneLabel}</p>
            </div>

            <div className="settings-field">
              <div className="settings-field-heading">
                <span className="settings-field-icon">
                  <Clock size={15} />
                </span>
                <span className="settings-field-label">Time Interval</span>
              </div>
              <p className="settings-policy-value">{loading ? '—' : intervalLabel}</p>
            </div>

            <div className="settings-field">
              <div className="settings-field-heading">
                <span className="settings-field-icon">
                  <UserCheck size={15} />
                </span>
                <span className="settings-field-label">Self-Booking</span>
              </div>
              {loading ? (
                <p className="settings-policy-value">—</p>
              ) : (
                <span className={`settings-policy-badge ${selfBookingAllowed ? 'is-allowed' : 'is-blocked'}`}>
                  {selfBookingAllowed ? 'Allowed for you' : 'Not allowed'}
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="settings-panel settings-panel-fill">
            <div className="settings-panel-header-icon">
              <span className="settings-icon-badge">
                <Globe size={18} />
              </span>
              <div>
                <h2>Schedule Settings</h2>
                <p className="settings-panel-subtitle">Your own time zone and booking interval — you have no admin above you.</p>
              </div>
            </div>

            <div className="settings-field">
              <div className="settings-field-heading">
                <span className="settings-field-icon">
                  <Globe size={15} />
                </span>
                <label htmlFor="freelance-timezone" className="settings-field-label">
                  Time Zone
                </label>
              </div>
              <p className="settings-field-help">Your schedule, bookings, and the "now" line all follow this time zone.</p>
              <select
                id="freelance-timezone"
                className="settings-select"
                value={freelanceTimezone}
                onChange={(e) => setFreelanceTimezone(e.target.value)}
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
                <span className="settings-field-icon">
                  <Clock size={15} />
                </span>
                <span className="settings-field-label">Time Interval</span>
              </div>
              <p className="settings-field-help">How your weekly schedule grid is divided into bookable slots.</p>
              <div className="settings-radio-group">
                <label className={`settings-radio ${freelanceInterval === '30' ? 'is-active' : ''}`}>
                  <input
                    type="radio"
                    name="freelanceInterval"
                    checked={freelanceInterval === '30'}
                    onChange={() => setFreelanceInterval('30')}
                  />
                  30 Minutes
                </label>
                <label className={`settings-radio ${freelanceInterval === '60' ? 'is-active' : ''}`}>
                  <input
                    type="radio"
                    name="freelanceInterval"
                    checked={freelanceInterval === '60'}
                    onChange={() => setFreelanceInterval('60')}
                  />
                  1 Hour
                </label>
              </div>
            </div>

            <div className="settings-save-row">
              {schedulingMessage && <span className={`settings-save-message is-${schedulingMessage.type}`}>{schedulingMessage.text}</span>}
              <button className="btn btn-primary" type="button" onClick={handleSaveScheduling} disabled={schedulingSaving}>
                {schedulingSaving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="settings-panel">
        <div className="settings-panel-header-icon">
          <span className={`settings-icon-badge ${profilePhoto && !profilePhotoError ? 'settings-profile-avatar-badge' : ''}`}>
            {profilePhoto && !profilePhotoError ? (
              <img src={toDirectImageUrl(profilePhoto)} alt="" onError={() => setProfilePhotoError(true)} />
            ) : (
              <UserCheck size={18} />
            )}
          </span>
          <div>
            <h2>Your Profile</h2>
            <p className="settings-panel-subtitle">
              This is what {identity?.kind === 'company' ? 'your admin and students' : 'your students'} see about you.
            </p>
          </div>
        </div>

        {profileLoading ? (
          <p className="settings-loading">Loading…</p>
        ) : (
          <form id="teacher-profile-form" className="settings-profile-form" onSubmit={handleSaveProfile}>
            <div className="settings-profile-form-row">
              <label>
                Photo URL
                <input
                  type="url"
                  value={profilePhoto}
                  onChange={(e) => {
                    setProfilePhoto(e.target.value)
                    setProfilePhotoError(false)
                  }}
                  placeholder="https://…"
                />
              </label>

              <label>
                Intro Video URL
                <input
                  type="url"
                  value={profileIntroVideo}
                  onChange={(e) => {
                    setProfileIntroVideo(e.target.value)
                    setProfileVideoPlaying(false)
                  }}
                  placeholder="https://…"
                />
              </label>
            </div>

            {profileIntroVideo && (
              <div className="settings-profile-media-preview-row">
                <div className="settings-profile-media-preview">
                  <span className="settings-profile-media-preview-label">Video</span>
                  {(() => {
                    const embed = getVideoEmbed(profileIntroVideo)

                    if (embed && profileVideoPlaying) {
                      if (embed.provider === 'file') {
                        return <video className="settings-profile-video-preview-player" src={embed.embedUrl} controls autoPlay />
                      }
                      return (
                        <iframe
                          className="settings-profile-video-preview-player"
                          src={embed.embedUrl}
                          allow="autoplay; encrypted-media; picture-in-picture"
                          allowFullScreen
                        />
                      )
                    }

                    if (embed) {
                      return (
                        <button
                          type="button"
                          className="settings-profile-video-preview"
                          onClick={() => setProfileVideoPlaying(true)}
                          aria-label="Play video"
                        >
                          {embed.thumbnail ? <img src={embed.thumbnail} alt="" /> : <div className="settings-profile-video-preview-placeholder" />}
                          <span className="settings-profile-video-preview-play">
                            <Play size={18} fill="currentColor" />
                          </span>
                        </button>
                      )
                    }

                    return (
                      <a
                        href={profileIntroVideo}
                        target="_blank"
                        rel="noreferrer"
                        className="settings-profile-video-preview settings-profile-video-preview-fallback"
                      >
                        <ExternalLink size={16} />
                        Open video
                      </a>
                    )
                  })()}
                </div>
              </div>
            )}

            <label>
              Intro Message
              <textarea
                className="settings-profile-textarea"
                value={profileIntroMessage}
                onChange={(e) => setProfileIntroMessage(e.target.value)}
                rows={3}
                placeholder="A short bio students will see…"
              />
            </label>

            <div className="settings-profile-info-block settings-profile-info-block-subjects">
              <GraduationCap className="settings-profile-info-watermark" size={56} strokeWidth={1.5} />
              <div className="settings-profile-field-group">
                <span className="settings-profile-field-label">
                  Subjects
                  {profileSelectedSubjects.length + profileCustomSubjects.length > 0 && (
                    <span className="settings-profile-field-count">
                      {profileSelectedSubjects.length + profileCustomSubjects.length} selected
                    </span>
                  )}
                </span>
                <div className="settings-profile-search-box">
                  <Search size={14} />
                  <input
                    form="teacher-profile-form"
                    type="text"
                    className="settings-profile-search-input"
                    value={profileSubjectSearch}
                    onChange={(e) => setProfileSubjectSearch(e.target.value)}
                    placeholder="Search subjects…"
                  />
                </div>
                <div className="settings-profile-checkbox-grid">
                  {filteredProfileSubjects.length === 0 ? (
                    <p className="settings-profile-field-help">No subjects match "{profileSubjectSearch}".</p>
                  ) : (
                    filteredProfileSubjects.map((s) => (
                      <label key={s} className="settings-profile-checkbox-chip">
                        <input
                          form="teacher-profile-form"
                          type="checkbox"
                          checked={profileSelectedSubjects.includes(s)}
                          onChange={() => toggleProfileSubject(s)}
                        />
                        {s}
                        <Check size={12} className="settings-profile-chip-check" />
                      </label>
                    ))
                  )}
                </div>
                {profileSelectedSubjects.includes('Other') && (
                  <div className="settings-profile-tag-input-group">
                    <div className="settings-profile-tag-input-row">
                      <input
                        form="teacher-profile-form"
                        type="text"
                        className="settings-profile-custom-input"
                        value={profileCustomSubject}
                        onChange={(e) => setProfileCustomSubject(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            addProfileCustomSubject()
                          }
                        }}
                        placeholder="Type a subject and press Enter"
                      />
                      <button type="button" className="settings-profile-tag-add-btn" onClick={addProfileCustomSubject}>
                        Add
                      </button>
                    </div>
                    {profileCustomSubjects.length > 0 && (
                      <div className="settings-profile-tag-list">
                        {profileCustomSubjects.map((s) => (
                          <span key={s} className="settings-profile-tag-chip">
                            {s}
                            <button type="button" onClick={() => removeProfileCustomSubject(s)} aria-label={`Remove ${s}`}>
                              <X size={11} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="settings-profile-info-block settings-profile-info-block-contacts">
              <Phone className="settings-profile-info-watermark" size={56} strokeWidth={1.5} />
              <div className="settings-profile-field-group">
                <span className="settings-profile-field-label">
                  Contacts
                  {profileContactRows.filter((r) => (r.platform === 'Other' ? r.customPlatform.trim() : r.platform) && r.handle.trim())
                    .length > 0 && (
                    <span className="settings-profile-field-count">
                      {
                        profileContactRows.filter(
                          (r) => (r.platform === 'Other' ? r.customPlatform.trim() : r.platform) && r.handle.trim(),
                        ).length
                      }{' '}
                      added
                    </span>
                  )}
                </span>

                <div className="settings-profile-contact-rows">
                  {profileContactRows.map((row, index) => (
                    <div key={index} className="settings-profile-contact-row-edit">
                      <div className="settings-profile-contact-composer">
                        <select
                          form="teacher-profile-form"
                          className="settings-profile-contact-platform-select"
                          aria-label="Platform"
                          value={row.platform}
                          onChange={(e) => updateContactRow(index, { platform: e.target.value })}
                        >
                          {COMM_PLATFORMS.map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>

                        <input
                          form="teacher-profile-form"
                          type="text"
                          className="settings-profile-contact-handle-input"
                          aria-label="ID or link"
                          value={row.handle}
                          onChange={(e) => updateContactRow(index, { handle: e.target.value })}
                          placeholder="Meeting link, ID, or username"
                        />

                        <button
                          type="button"
                          className="settings-profile-contact-remove-btn"
                          onClick={() => removeContactRow(index)}
                          aria-label="Remove this contact field"
                        >
                          <X size={14} />
                        </button>
                      </div>

                      {row.platform === 'Other' && (
                        <input
                          form="teacher-profile-form"
                          type="text"
                          className="settings-profile-custom-input"
                          value={row.customPlatform}
                          onChange={(e) => updateContactRow(index, { customPlatform: e.target.value })}
                          placeholder="Enter a platform name"
                        />
                      )}
                    </div>
                  ))}
                </div>

                <button type="button" className="settings-profile-contact-add-btn" onClick={addContactRow}>
                  <Plus size={14} />
                  Add Another Contact Field
                </button>
              </div>
            </div>

            <div className="settings-profile-info-footer">
              <Info size={13} />
              <span>Photos and videos are links you paste in (e.g. a Google Drive, YouTube, or direct file URL) — not file uploads.</span>
            </div>

            <div className="settings-save-row">
              {profileMessage && <span className={`settings-save-message is-${profileMessage.type}`}>{profileMessage.text}</span>}
              <button className="btn btn-primary" type="submit" disabled={profileSaving}>
                {profileSaving ? 'Saving…' : 'Save Profile'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

export default Settings