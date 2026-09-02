import { useEffect, useState, type FormEvent } from 'react'
import {
  Building2,
  Check,
  ExternalLink,
  Eye,
  EyeOff,
  GraduationCap,
  Info,
  Mail,
  Pencil,
  Phone,
  Play,
  Plus,
  Search,
  Star,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import bcrypt from 'bcryptjs'
import { supabase, createIsolatedAuthClient } from '../../lib/supabaseClient'
import { useAuth } from '../../context/useAuth'
import { ROLE } from '../../data/roleAccess'
import { ESL_SUBJECTS } from '../../data/eslSubjects'
import { COMM_PLATFORMS } from '../../data/commPlatforms'
import type { CompanySettings } from '../../data/companySettings'
import { toDirectImageUrl, getVideoEmbed } from '../../lib/mediaEmbeds'
import './Employees.css'

type Subscription = { plan: string; price: string; period: string; subscribed_at?: string }

type CompanyInfo = {
  code: string
  name: string
  address: string | null
  subscription: Subscription | null
  settings: Partial<CompanySettings> | null
}

type EmployeeType = 'teacher' | 'admin'
type Message = { type: 'success' | 'error'; text: string }
type ContactEntry = { platform: string; handle: string }

type TeacherRow = {
  id: string
  name: string
  email: string
  phone: string
  subjects: string[] | null
  photo: string | null
  intro_video: string | null
  intro_message: string | null
  contact: { contacts?: ContactEntry[] } | null
  Rating: number | null
  created_at: string
}

type AdminRow = {
  id: string
  email: string
  phone_number: string
  Contacts: ContactEntry[] | null
  created_at: string
}

type EditTarget = { type: EmployeeType; id: string; email: string }

const teacherPerks = ['Own dashboard login', 'Manage their bookings & students', 'View and manage their schedule']
const adminPerks = ['Full Company Dashboard access', 'Shares your Company Code', 'Co-manage the account with you']

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

function Employees() {
  const { session } = useAuth()
  const [company, setCompany] = useState<CompanyInfo | null>(null)

  const [activeTab, setActiveTab] = useState<EmployeeType>('teacher')
  const [teachers, setTeachers] = useState<TeacherRow[]>([])
  const [admins, setAdmins] = useState<AdminRow[]>([])
  const [listLoading, setListLoading] = useState(true)

  const [reloadToken, setReloadToken] = useState(0)

  const [showModal, setShowModal] = useState(false)
  const [employeeType, setEmployeeType] = useState<EmployeeType>('teacher')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<Message | null>(null)

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [listMessage, setListMessage] = useState<Message | null>(null)

  const [editTarget, setEditTarget] = useState<EditTarget | null>(null)
  const [editName, setEditName] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editRating, setEditRating] = useState<number | null>(null)
  const [editPhoto, setEditPhoto] = useState('')
  const [editPhotoError, setEditPhotoError] = useState(false)
  const [editIntroVideo, setEditIntroVideo] = useState('')
  const [videoPlaying, setVideoPlaying] = useState(false)
  const [editIntroMessage, setEditIntroMessage] = useState('')
  const [editSelectedSubjects, setEditSelectedSubjects] = useState<string[]>([])
  const [editCustomSubject, setEditCustomSubject] = useState('')
  const [editCustomSubjects, setEditCustomSubjects] = useState<string[]>([])
  const [editSubjectSearch, setEditSubjectSearch] = useState('')
  const [editCommPlatform, setEditCommPlatform] = useState(COMM_PLATFORMS[0])
  const [editCustomCommPlatform, setEditCustomCommPlatform] = useState('')
  const [editCommHandle, setEditCommHandle] = useState('')
  const [editContacts, setEditContacts] = useState<ContactEntry[]>([])
  const [editLoading, setEditLoading] = useState(false)
  const [editMessage, setEditMessage] = useState<Message | null>(null)

  useEffect(() => {
    const adminEmail = session?.user.email
    if (!adminEmail) return

    supabase
      .from('company_registration')
      .select('CompanyCode, company_name, address, subscription, company_settings')
      .eq('email', adminEmail)
      .single()
      .then(({ data }) => {
        if (data) {
          setCompany({
            code: data.CompanyCode,
            name: data.company_name,
            address: data.address,
            subscription: data.subscription,
            settings: data.company_settings,
          })
        }
      })
  }, [session])

  useEffect(() => {
    const companyCode = company?.code
    if (!companyCode) return

    Promise.all([
      supabase
        .from('company_organizational_chart')
        .select('id, name, email, phone, subjects, photo, intro_video, intro_message, contact, "Rating", created_at')
        .eq('company_code', companyCode)
        .eq('employee_type', 'Teacher')
        .order('created_at', { ascending: false }),
      supabase
        .from('company_registration')
        .select('id, email, phone_number, "Contacts", created_at')
        .eq('CompanyCode', companyCode)
        .order('created_at', { ascending: false }),
    ]).then(([{ data: teacherData }, { data: adminData }]) => {
      setTeachers((teacherData as TeacherRow[]) ?? [])
      setAdmins((adminData as AdminRow[]) ?? [])
      setListLoading(false)
    })
  }, [company?.code, reloadToken])

  const resetForm = () => {
    setName('')
    setEmail('')
    setPhone('')
    setPassword('')
    setConfirmPassword('')
  }

  const openModal = () => {
    setEmployeeType(activeTab)
    resetForm()
    setMessage(null)
    setShowModal(true)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setMessage(null)

    if (password !== confirmPassword) {
      setMessage({ type: 'error', text: 'Passwords do not match.' })
      return
    }
    if (!company) {
      setMessage({ type: 'error', text: 'Could not determine your company. Please try again.' })
      return
    }

    setLoading(true)

    // Use an isolated client so creating this account never touches the
    // admin's own session or the app-wide auth listener (see createIsolatedAuthClient).
    const isolatedAuth = createIsolatedAuthClient()
    const { data: signUpData, error: signUpError } = await isolatedAuth.auth.signUp({
      email,
      password,
      options: { data: { role: employeeType === 'teacher' ? ROLE.TEACHER : ROLE.COMPANY } },
    })

    if (signUpError || !signUpData.user) {
      setLoading(false)
      setMessage({ type: 'error', text: signUpError?.message || 'Could not create the account. Please try again.' })
      return
    }

    const passwordHash = await bcrypt.hash(password, 10)

    const { error: insertError } =
      employeeType === 'teacher'
        ? await supabase.from('company_organizational_chart').insert({
            company_code: company.code,
            employee_type: 'Teacher',
            name,
            email,
            phone,
            password: passwordHash,
            Role: ROLE.TEACHER,
            Settings: company.settings,
            Subscription: company.subscription,
          })
        : await supabase.from('company_registration').insert({
            company_name: company.name,
            address: company.address,
            email,
            phone_number: phone,
            password: passwordHash,
            CompanyCode: company.code,
            subscription: company.subscription,
            company_settings: company.settings,
            Role: ROLE.COMPANY,
          })

    setLoading(false)

    if (insertError) {
      setMessage({ type: 'error', text: 'Account created, but saving the record failed. Please contact support.' })
      return
    }

    setMessage({
      type: 'success',
      text: `${employeeType === 'teacher' ? 'Teacher' : 'Admin'} account created.`,
    })
    resetForm()
    setActiveTab(employeeType)
    setReloadToken((n) => n + 1)
  }

  const handleDeleteEmployee = async (type: EmployeeType, id: string) => {
    setDeletingId(id)
    setListMessage(null)

    const { data, error } = await supabase.functions.invoke('delete-employee', {
      body: { type, id },
    })

    setDeletingId(null)
    setConfirmDeleteId(null)

    if (error || !data?.success) {
      setListMessage({
        type: 'error',
        text: data?.error || `Could not delete the ${type}. Please try again.`,
      })
      return
    }

    setReloadToken((n) => n + 1)
  }

  // Only the founding admin — the earliest-created company_registration row
  // for this CompanyCode, i.e. whoever signed up on the home page — may
  // delete other admins. Co-admins created later via this page cannot.
  const motherAdmin = admins.reduce<AdminRow | null>(
    (earliest, a) => (!earliest || a.created_at < earliest.created_at ? a : earliest),
    null,
  )
  const isMotherAdmin = !!motherAdmin && motherAdmin.email === session?.user.email

  const filteredEditSubjects = ESL_SUBJECTS.filter((s) =>
    s.toLowerCase().includes(editSubjectSearch.trim().toLowerCase()),
  )

  const toggleEditSubject = (s: string) => {
    setEditSelectedSubjects((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))
  }

  const addEditCustomSubject = () => {
    const trimmed = editCustomSubject.trim()
    if (!trimmed || editCustomSubjects.includes(trimmed) || ESL_SUBJECTS.includes(trimmed)) {
      setEditCustomSubject('')
      return
    }
    setEditCustomSubjects((prev) => [...prev, trimmed])
    setEditCustomSubject('')
  }

  const removeEditCustomSubject = (s: string) => {
    setEditCustomSubjects((prev) => prev.filter((x) => x !== s))
  }

  const addEditContact = () => {
    const handle = editCommHandle.trim()
    if (!handle) return
    const platform = editCommPlatform === 'Other' ? editCustomCommPlatform.trim() : editCommPlatform
    if (!platform) return
    setEditContacts((prev) => [...prev, { platform, handle }])
    setEditCommPlatform(COMM_PLATFORMS[0])
    setEditCustomCommPlatform('')
    setEditCommHandle('')
  }

  const removeEditContact = (index: number) => {
    setEditContacts((prev) => prev.filter((_, i) => i !== index))
  }

  const openEditModal = (type: EmployeeType, row: TeacherRow | AdminRow) => {
    setEditMessage(null)
    setEditCustomSubject('')
    setEditSubjectSearch('')
    setEditCommPlatform(COMM_PLATFORMS[0])
    setEditCustomCommPlatform('')
    setEditCommHandle('')
    setEditPhotoError(false)
    setVideoPlaying(false)

    if (type === 'teacher') {
      const t = row as TeacherRow
      setEditTarget({ type, id: t.id, email: t.email })
      setEditName(t.name)
      setEditPhone(t.phone)
      setEditRating(t.Rating)
      setEditPhoto(t.photo ?? '')
      setEditIntroVideo(t.intro_video ?? '')
      setEditIntroMessage(t.intro_message ?? '')
      const subjects = t.subjects ?? []
      setEditSelectedSubjects(subjects.filter((s) => ESL_SUBJECTS.includes(s)))
      setEditCustomSubjects(subjects.filter((s) => !ESL_SUBJECTS.includes(s)))
      setEditContacts(t.contact?.contacts ?? [])
    } else {
      const a = row as AdminRow
      setEditTarget({ type, id: a.id, email: a.email })
      setEditRating(null)
      setEditPhoto('')
      setEditPhone(a.phone_number)
      setEditContacts(a.Contacts ?? [])
    }
  }

  const handleEditSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!editTarget) return

    setEditMessage(null)
    setEditLoading(true)

    const { data, error } =
      editTarget.type === 'teacher'
        ? await supabase
            .from('company_organizational_chart')
            .update({
              name: editName,
              phone: editPhone,
              subjects: [...editSelectedSubjects, ...editCustomSubjects].length > 0
                ? [...editSelectedSubjects, ...editCustomSubjects]
                : null,
              photo: editPhoto.trim() || null,
              intro_video: editIntroVideo.trim() || null,
              intro_message: editIntroMessage.trim() || null,
              contact: editContacts.length > 0 ? { contacts: editContacts } : null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', editTarget.id)
            .select('id')
        : await supabase
            .from('company_registration')
            .update({
              phone_number: editPhone,
              Contacts: editContacts.length > 0 ? editContacts : null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', editTarget.id)
            .select('id')

    setEditLoading(false)

    // RLS silently filters out rows the caller isn't allowed to touch rather
    // than raising an error, so a successful call with zero rows back means
    // the update didn't actually happen (missing UPDATE policy) — treat that
    // the same as a real error instead of pretending it worked.
    if (error || !data || data.length === 0) {
      setEditMessage({ type: 'error', text: 'Could not save changes. Please try again.' })
      return
    }

    setEditTarget(null)
    setReloadToken((n) => n + 1)
  }

  return (
    <div className="employees-page">
      <div className="employees-page-header">
        <h1>Employees</h1>
        <button className="btn btn-primary" onClick={openModal}>
          <UserPlus size={16} /> Add Teacher / Admin
        </button>
      </div>

      <div className="employees-list-panel">
        <div className="employees-tab-toggle">
          <button
            className={`employees-tab ${activeTab === 'teacher' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('teacher')}
          >
            <GraduationCap size={16} /> Teachers
            <span className="employees-tab-count">{teachers.length}</span>
          </button>
          <button
            className={`employees-tab ${activeTab === 'admin' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('admin')}
          >
            <Building2 size={16} /> Admins
            <span className="employees-tab-count">{admins.length}</span>
          </button>
        </div>

        {listLoading ? (
          <p className="employees-loading">Loading…</p>
        ) : activeTab === 'teacher' ? (
          teachers.length === 0 ? (
            <div className="employees-empty">
              <GraduationCap size={22} />
              <p>No teachers yet. Add one to get started.</p>
            </div>
          ) : (
            <div className="employees-table-wrap">
              {listMessage && <p className={`employees-message is-${listMessage.type}`}>{listMessage.text}</p>}
              <table className="employees-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Joined</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {teachers.map((t) => (
                    <tr key={t.id} className="employees-row-clickable" onClick={() => openEditModal('teacher', t)}>
                      <td>
                        <span className="employees-row-avatar employees-row-avatar-teacher">
                          <GraduationCap size={14} />
                        </span>
                        {t.name}
                      </td>
                      <td>{t.email}</td>
                      <td>{t.phone}</td>
                      <td>{formatDate(t.created_at)}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {confirmDeleteId === t.id ? (
                          <span className="employees-confirm-delete">
                            <button
                              type="button"
                              className="employees-confirm-yes"
                              onClick={() => handleDeleteEmployee('teacher', t.id)}
                              disabled={deletingId === t.id}
                            >
                              {deletingId === t.id ? 'Deleting…' : 'Confirm'}
                            </button>
                            <button type="button" className="employees-confirm-no" onClick={() => setConfirmDeleteId(null)}>
                              Cancel
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="employees-delete-btn"
                            onClick={() => setConfirmDeleteId(t.id)}
                            aria-label={`Delete ${t.name}`}
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : admins.length === 0 ? (
          <div className="employees-empty">
            <Building2 size={22} />
            <p>No admins yet.</p>
          </div>
        ) : (
          <div className="employees-table-wrap">
            {listMessage && <p className={`employees-message is-${listMessage.type}`}>{listMessage.text}</p>}
            <table className="employees-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Joined</th>
                  {isMotherAdmin && <th></th>}
                </tr>
              </thead>
              <tbody>
                {admins.map((a) => (
                  <tr key={a.id} className="employees-row-clickable" onClick={() => openEditModal('admin', a)}>
                    <td>
                      <span className="employees-row-avatar employees-row-avatar-admin">
                        <Building2 size={14} />
                      </span>
                      {a.email}
                      {a.email === session?.user.email && <span className="employees-you-badge">You</span>}
                      {motherAdmin?.id === a.id && <span className="employees-founder-badge">Founder</span>}
                    </td>
                    <td>{a.phone_number}</td>
                    <td>{formatDate(a.created_at)}</td>
                    {isMotherAdmin && (
                      <td onClick={(e) => e.stopPropagation()}>
                        {motherAdmin?.id === a.id ? null : confirmDeleteId === a.id ? (
                          <span className="employees-confirm-delete">
                            <button
                              type="button"
                              className="employees-confirm-yes"
                              onClick={() => handleDeleteEmployee('admin', a.id)}
                              disabled={deletingId === a.id}
                            >
                              {deletingId === a.id ? 'Deleting…' : 'Confirm'}
                            </button>
                            <button type="button" className="employees-confirm-no" onClick={() => setConfirmDeleteId(null)}>
                              Cancel
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="employees-delete-btn"
                            onClick={() => setConfirmDeleteId(a.id)}
                            aria-label={`Delete ${a.email}`}
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="employees-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="employees-modal" onClick={(e) => e.stopPropagation()}>
            <button className="employees-modal-close" aria-label="Close" onClick={() => setShowModal(false)}>
              <X size={18} />
            </button>

            <div className="employees-modal-scroll">
            <div className="employees-modal-grid">
              <div className="employees-panel employees-panel-fill employees-panel-decor">
                <div className="employees-panel-header">
                  <span className="employees-panel-icon">
                    <UserPlus size={18} />
                  </span>
                  <div>
                    <h2>Add New Employee</h2>
                    <p className="employees-panel-subtitle">Create a login for a teacher or a co-admin.</p>
                  </div>
                </div>

                <div className="employees-type-toggle">
                  <label className={`employees-type-pill ${employeeType === 'teacher' ? 'is-active' : ''}`}>
                    <input
                      type="radio"
                      name="employeeType"
                      checked={employeeType === 'teacher'}
                      onChange={() => setEmployeeType('teacher')}
                    />
                    <GraduationCap size={16} />
                    Teacher
                  </label>
                  <label className={`employees-type-pill ${employeeType === 'admin' ? 'is-active' : ''}`}>
                    <input
                      type="radio"
                      name="employeeType"
                      checked={employeeType === 'admin'}
                      onChange={() => setEmployeeType('admin')}
                    />
                    <Building2 size={16} />
                    Admin
                  </label>
                </div>

                {company && (
                  <p className="employees-company-note">
                    Adding to <strong>{company.name}</strong> (Code: {company.code})
                  </p>
                )}

                <form className="employees-form" onSubmit={handleSubmit} autoComplete="off">
                  <div className="employees-form-row">
                    {employeeType === 'teacher' && (
                      <label>
                        Full Name
                        <input
                          type="text"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          autoComplete="off"
                          required
                        />
                      </label>
                    )}

                    <label>
                      Email
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="off"
                        required
                      />
                    </label>
                  </div>

                  <div className="employees-form-row">
                    <label>
                      Phone Number
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        autoComplete="off"
                        required
                      />
                    </label>
                  </div>

                  <div className="employees-form-row">
                    <label>
                      Password
                      <div className="employees-password-field">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          autoComplete="new-password"
                          minLength={6}
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                        >
                          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </label>

                    <label>
                      Confirm Password
                      <div className="employees-password-field">
                        <input
                          type={showConfirmPassword ? 'text' : 'password'}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          autoComplete="new-password"
                          minLength={6}
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword((v) => !v)}
                          aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                        >
                          {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </label>
                  </div>

                  {message && <p className={`employees-message is-${message.type}`}>{message.text}</p>}

                  <button className="btn btn-primary" type="submit" disabled={loading || !company}>
                    {loading ? 'Creating…' : `Create ${employeeType === 'teacher' ? 'Teacher' : 'Admin'} Account`}
                  </button>
                </form>
              </div>

              <div className="employees-panel employees-panel-fill employees-info-panel">
                <div className="employees-panel-header">
                  <span className="employees-panel-icon employees-panel-icon-alt">
                    <Users size={18} />
                  </span>
                  <div>
                    <h2>About These Roles</h2>
                    <p className="employees-panel-subtitle">What each account type can do.</p>
                  </div>
                </div>

                <div className="employees-info-block employees-info-block-teacher">
                  <GraduationCap className="employees-info-watermark" size={64} strokeWidth={1.5} />
                  <div className="employees-info-block-heading">
                    <span className="employees-info-icon employees-info-icon-teacher">
                      <GraduationCap size={16} />
                    </span>
                    <h3>Teacher</h3>
                  </div>
                  <ul className="employees-info-list">
                    {teacherPerks.map((perk) => (
                      <li key={perk}>
                        <Check size={14} /> {perk}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="employees-info-block employees-info-block-admin">
                  <Building2 className="employees-info-watermark" size={64} strokeWidth={1.5} />
                  <div className="employees-info-block-heading">
                    <span className="employees-info-icon employees-info-icon-admin">
                      <Building2 size={16} />
                    </span>
                    <h3>Admin</h3>
                  </div>
                  <ul className="employees-info-list">
                    {adminPerks.map((perk) => (
                      <li key={perk}>
                        <Check size={14} /> {perk}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="employees-info-footer">
                  <Mail size={13} />
                  <Phone size={13} />
                  <span>Both roles get their own login and can update their own password anytime.</span>
                </div>
              </div>
            </div>
            </div>
          </div>
        </div>
      )}

      {editTarget && (
        <div className="employees-modal-overlay" onClick={() => setEditTarget(null)}>
          <div className="employees-edit-modal" onClick={(e) => e.stopPropagation()}>
            <button className="employees-modal-close" aria-label="Close" onClick={() => setEditTarget(null)}>
              <X size={18} />
            </button>

            <div className="employees-modal-scroll">
            <div className="employees-modal-grid">
              <div className="employees-panel employees-panel-fill employees-panel-decor">
                <div className="employees-panel-header">
                  <span className={`employees-panel-icon ${editPhoto && !editPhotoError ? 'employees-avatar-badge' : ''}`}>
                    {editPhoto && !editPhotoError ? (
                      <img src={toDirectImageUrl(editPhoto)} alt="" onError={() => setEditPhotoError(true)} />
                    ) : (
                      <Pencil size={18} />
                    )}
                  </span>
                  <div>
                    <h2>Edit {editTarget.type === 'teacher' ? 'Teacher' : 'Admin'}</h2>
                    <p className="employees-panel-subtitle">
                      {editTarget.email}
                      {editTarget.type === 'teacher' && editRating != null && (
                        <span className="employees-rating-badge">
                          <Star size={11} fill="currentColor" /> {editRating.toFixed(1)}
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                <form id="edit-employee-form" className="employees-form" onSubmit={handleEditSubmit} autoComplete="off">
                  {editTarget.type === 'teacher' && (
                    <label>
                      Full Name
                      <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} required />
                    </label>
                  )}

                  <label>
                    Phone Number
                    <input type="tel" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} required />
                  </label>

                  {editTarget.type === 'teacher' && (
                    <>
                      <div className="employees-form-row">
                        <label>
                          Photo URL
                          <input
                            type="url"
                            value={editPhoto}
                            onChange={(e) => {
                              setEditPhoto(e.target.value)
                              setEditPhotoError(false)
                            }}
                            placeholder="https://…"
                          />
                        </label>

                        <label>
                          Intro Video URL
                          <input
                            type="url"
                            value={editIntroVideo}
                            onChange={(e) => {
                              setEditIntroVideo(e.target.value)
                              setVideoPlaying(false)
                            }}
                            placeholder="https://…"
                          />
                        </label>
                      </div>

                      {editIntroVideo && (
                        <div className="employees-media-preview-row">
                          <div className="employees-media-preview">
                            <span className="employees-media-preview-label">Video</span>
                              {(() => {
                                const embed = getVideoEmbed(editIntroVideo)

                                if (embed && videoPlaying) {
                                  if (embed.provider === 'file') {
                                    return <video className="employees-video-preview-player" src={embed.embedUrl} controls autoPlay />
                                  }
                                  return (
                                    <iframe
                                      className="employees-video-preview-player"
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
                                      className="employees-video-preview"
                                      onClick={() => setVideoPlaying(true)}
                                      aria-label="Play video"
                                    >
                                      {embed.thumbnail ? (
                                        <img src={embed.thumbnail} alt="" />
                                      ) : (
                                        <div className="employees-video-preview-placeholder" />
                                      )}
                                      <span className="employees-video-preview-play">
                                        <Play size={18} fill="currentColor" />
                                      </span>
                                    </button>
                                  )
                                }

                                return (
                                  <a
                                    href={editIntroVideo}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="employees-video-preview employees-video-preview-fallback"
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
                          className="employees-textarea"
                          value={editIntroMessage}
                          onChange={(e) => setEditIntroMessage(e.target.value)}
                          rows={3}
                          placeholder="A short bio students will see…"
                        />
                      </label>
                    </>
                  )}

                </form>
              </div>

              <div className="employees-panel employees-panel-fill employees-info-panel">
                <div className="employees-panel-header">
                  <span className="employees-panel-icon employees-panel-icon-alt">
                    {editTarget.type === 'teacher' ? <GraduationCap size={18} /> : <Building2 size={18} />}
                  </span>
                  <div>
                    <h2>{editTarget.type === 'teacher' ? 'Subjects & Contacts' : 'Contacts'}</h2>
                    <p className="employees-panel-subtitle">
                      {editTarget.type === 'teacher' ? 'What they teach and how to reach them.' : 'How to reach this admin.'}
                    </p>
                  </div>
                </div>

                {editTarget.type === 'teacher' && (
                  <div className="employees-info-block employees-info-block-subjects">
                    <GraduationCap className="employees-info-watermark" size={56} strokeWidth={1.5} />
                    <div className="employees-field-group">
                      <span className="employees-field-label">
                        Subjects
                        {editSelectedSubjects.length + editCustomSubjects.length > 0 && (
                          <span className="employees-field-count">
                            {editSelectedSubjects.length + editCustomSubjects.length} selected
                          </span>
                        )}
                      </span>
                      <div className="employees-search-box">
                        <Search size={14} />
                      <input
                        form="edit-employee-form"
                        type="text"
                        className="employees-search-input"
                        value={editSubjectSearch}
                        onChange={(e) => setEditSubjectSearch(e.target.value)}
                        placeholder="Search subjects…"
                      />
                    </div>
                    <div className="employees-checkbox-grid">
                      {filteredEditSubjects.length === 0 ? (
                        <p className="employees-field-help">No subjects match “{editSubjectSearch}”.</p>
                      ) : (
                        filteredEditSubjects.map((s) => (
                          <label key={s} className="employees-checkbox-chip">
                            <input
                              form="edit-employee-form"
                              type="checkbox"
                              checked={editSelectedSubjects.includes(s)}
                              onChange={() => toggleEditSubject(s)}
                            />
                            {s}
                            <Check size={12} className="employees-chip-check" />
                          </label>
                        ))
                      )}
                    </div>
                    {editSelectedSubjects.includes('Other') && (
                      <div className="employees-tag-input-group">
                        <div className="employees-tag-input-row">
                          <input
                            form="edit-employee-form"
                            type="text"
                            className="employees-custom-input"
                            value={editCustomSubject}
                            onChange={(e) => setEditCustomSubject(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                addEditCustomSubject()
                              }
                            }}
                            placeholder="Type a subject and press Enter"
                          />
                          <button type="button" className="employees-tag-add-btn" onClick={addEditCustomSubject}>
                            Add
                          </button>
                        </div>
                        {editCustomSubjects.length > 0 && (
                          <div className="employees-tag-list">
                            {editCustomSubjects.map((s) => (
                              <span key={s} className="employees-tag-chip">
                                {s}
                                <button type="button" onClick={() => removeEditCustomSubject(s)} aria-label={`Remove ${s}`}>
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
                )}

                <div className="employees-info-block employees-info-block-contacts">
                  <Phone className="employees-info-watermark" size={56} strokeWidth={1.5} />
                  <div className="employees-field-group">
                  <span className="employees-field-label">
                    Contacts
                    {editContacts.length > 0 && <span className="employees-field-count">{editContacts.length} added</span>}
                  </span>

                  <div className="employees-contact-composer">
                    <select
                      form="edit-employee-form"
                      className="employees-contact-platform-select"
                      aria-label="Platform"
                      value={editCommPlatform}
                      onChange={(e) => setEditCommPlatform(e.target.value)}
                    >
                      {COMM_PLATFORMS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>

                    <input
                      form="edit-employee-form"
                      type="text"
                      className="employees-contact-handle-input"
                      aria-label="ID or link"
                      value={editCommHandle}
                      onChange={(e) => setEditCommHandle(e.target.value)}
                      placeholder="Meeting link, ID, or username"
                    />

                    <button
                      type="button"
                      className="employees-contact-add-icon-btn"
                      onClick={addEditContact}
                      aria-label="Add contact"
                    >
                      <Plus size={16} />
                    </button>
                  </div>

                  {editCommPlatform === 'Other' && (
                    <input
                      form="edit-employee-form"
                      type="text"
                      className="employees-custom-input"
                      value={editCustomCommPlatform}
                      onChange={(e) => setEditCustomCommPlatform(e.target.value)}
                      placeholder="Enter a platform name"
                    />
                  )}

                  {editContacts.length > 0 && (
                    <div className="employees-contact-list">
                      {editContacts.map((c, i) => (
                        <div key={i} className="employees-contact-row">
                          <span className="employees-contact-platform">{c.platform}</span>
                          <span className="employees-contact-handle">{c.handle}</span>
                          <button type="button" onClick={() => removeEditContact(i)} aria-label={`Remove ${c.platform} contact`}>
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  </div>
                </div>

                <div className="employees-info-footer">
                  <Info size={13} />
                  <span>Changes save immediately and update their profile.</span>
                </div>

                {editMessage && <p className={`employees-message is-${editMessage.type}`}>{editMessage.text}</p>}

                <button
                  form="edit-employee-form"
                  className="btn btn-primary employees-edit-save-btn"
                  type="submit"
                  disabled={editLoading}
                >
                  {editLoading ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Employees
