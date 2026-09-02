import { useEffect, useState, type FormEvent } from 'react'
import { Backpack, BookOpen, Check, ExternalLink, Eye, EyeOff, Info, Pencil, Search, Trash2, UserPlus, X } from 'lucide-react'
import bcrypt from 'bcryptjs'
import { supabase, createIsolatedAuthClient } from '../../lib/supabaseClient'
import { useAuth } from '../../context/useAuth'
import { generateStudentCode } from '../../lib/studentCode'
import { ESL_SUBJECTS } from '../../data/eslSubjects'
import { COMM_PLATFORMS } from '../../data/commPlatforms'
import { ENGLISH_LEVELS } from '../../data/englishLevels'
import { ROLE } from '../../data/roleAccess'
import './Students.css'

type StudentContact = { platform: string; handle: string }
type ContactField = { platform: string; customPlatform: string; handle: string }

const blankContactField = (): ContactField => ({ platform: COMM_PLATFORMS[0], customPlatform: '', handle: '' })

const toContactField = (c: StudentContact): ContactField =>
  COMM_PLATFORMS.includes(c.platform)
    ? { platform: c.platform, customPlatform: '', handle: c.handle }
    : { platform: 'Other', customPlatform: c.platform, handle: c.handle }

type StudentRow = {
  id: string
  name: string
  gender: string | null
  email: string | null
  subject: string[] | null
  contact: { phone?: string; contacts?: StudentContact[] } | null
  books: string[] | null
  student_code: string
  english_level: string | null
  description: string | null
  Credits: number | null
  created_at: string
}

type BookOption = {
  id: string
  subject: string
  category: string
  company_code: string
}

type Message = { type: 'success' | 'error'; text: string }

type EditTarget = { id: string; email: string | null; student_code: string }

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

function Students() {
  const { session } = useAuth()
  const [company, setCompany] = useState<{ code: string } | null>(null)

  const [students, setStudents] = useState<StudentRow[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [reloadToken, setReloadToken] = useState(0)

  const [availableBooks, setAvailableBooks] = useState<BookOption[]>([])

  const [showModal, setShowModal] = useState(false)
  const [name, setName] = useState('')
  const [gender, setGender] = useState('')
  const [englishLevel, setEnglishLevel] = useState('')
  const [description, setDescription] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [contactRows, setContactRows] = useState<ContactField[]>([blankContactField()])
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([])
  const [customSubject, setCustomSubject] = useState('')
  const [customSubjects, setCustomSubjects] = useState<string[]>([])
  const [subjectSearch, setSubjectSearch] = useState('')
  const [selectedBookIds, setSelectedBookIds] = useState<string[]>([])
  const [bookSearch, setBookSearch] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<Message | null>(null)

  const [editTarget, setEditTarget] = useState<EditTarget | null>(null)
  const [editName, setEditName] = useState('')
  const [editGender, setEditGender] = useState('')
  const [editEnglishLevel, setEditEnglishLevel] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editContactRows, setEditContactRows] = useState<ContactField[]>([blankContactField()])
  const [editSelectedSubjects, setEditSelectedSubjects] = useState<string[]>([])
  const [editCustomSubject, setEditCustomSubject] = useState('')
  const [editCustomSubjects, setEditCustomSubjects] = useState<string[]>([])
  const [editSubjectSearch, setEditSubjectSearch] = useState('')
  const [editSelectedBookIds, setEditSelectedBookIds] = useState<string[]>([])
  const [editBookSearch, setEditBookSearch] = useState('')
  const [editCredits, setEditCredits] = useState('')
  const [editLoading, setEditLoading] = useState(false)
  const [editMessage, setEditMessage] = useState<Message | null>(null)

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [listMessage, setListMessage] = useState<Message | null>(null)

  useEffect(() => {
    const adminEmail = session?.user.email
    if (!adminEmail) return

    supabase
      .from('company_registration')
      .select('CompanyCode')
      .eq('email', adminEmail)
      .single()
      .then(({ data }) => {
        if (data) setCompany({ code: data.CompanyCode })
      })
  }, [session])

  useEffect(() => {
    const companyCode = company?.code
    if (!companyCode) return

    supabase
      .from('student_lists')
      .select('id, name, gender, email, subject, contact, books, student_code, english_level, description, "Credits", created_at')
      .eq('company_code', companyCode)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setStudents((data as StudentRow[]) ?? [])
        setListLoading(false)
      })
  }, [company?.code, reloadToken])

  useEffect(() => {
    const companyCode = company?.code
    if (!companyCode) return

    supabase
      .from('books')
      .select('id, subject, category, company_code')
      .or(`company_code.eq.${companyCode},PublicAvailability.eq.true`)
      .order('subject', { ascending: true })
      .then(({ data }) => {
        setAvailableBooks((data as BookOption[]) ?? [])
      })
  }, [company?.code])

  const filteredSubjects = ESL_SUBJECTS.filter((s) =>
    s.toLowerCase().includes(subjectSearch.trim().toLowerCase()),
  )
  const filteredBooks = availableBooks.filter((b) =>
    `${b.subject} ${b.category}`.toLowerCase().includes(bookSearch.trim().toLowerCase()),
  )
  const filteredEditSubjects = ESL_SUBJECTS.filter((s) =>
    s.toLowerCase().includes(editSubjectSearch.trim().toLowerCase()),
  )
  const filteredEditBooks = availableBooks.filter((b) =>
    `${b.subject} ${b.category}`.toLowerCase().includes(editBookSearch.trim().toLowerCase()),
  )

  const toggleSubject = (s: string) => {
    setSelectedSubjects((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))
  }

  const addCustomSubject = () => {
    const trimmed = customSubject.trim()
    if (!trimmed || customSubjects.includes(trimmed) || ESL_SUBJECTS.includes(trimmed)) {
      setCustomSubject('')
      return
    }
    setCustomSubjects((prev) => [...prev, trimmed])
    setCustomSubject('')
  }

  const removeCustomSubject = (s: string) => {
    setCustomSubjects((prev) => prev.filter((x) => x !== s))
  }

  const addContactRow = () => {
    setContactRows((prev) => [...prev, blankContactField()])
  }

  const removeContactRow = (index: number) => {
    setContactRows((prev) => prev.filter((_, i) => i !== index))
  }

  const updateContactRow = (index: number, patch: Partial<ContactField>) => {
    setContactRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  const toggleBook = (id: string) => {
    setSelectedBookIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

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

  const addEditContactRow = () => {
    setEditContactRows((prev) => [...prev, blankContactField()])
  }

  const removeEditContactRow = (index: number) => {
    setEditContactRows((prev) => prev.filter((_, i) => i !== index))
  }

  const updateEditContactRow = (index: number, patch: Partial<ContactField>) => {
    setEditContactRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  const toggleEditBook = (id: string) => {
    setEditSelectedBookIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const openEditModal = (row: StudentRow) => {
    setEditMessage(null)
    setEditCustomSubject('')
    setEditSubjectSearch('')
    setEditBookSearch('')

    setEditTarget({ id: row.id, email: row.email, student_code: row.student_code })
    setEditName(row.name)
    setEditGender(row.gender ?? '')
    setEditEnglishLevel(row.english_level ?? '')
    setEditDescription(row.description ?? '')
    setEditEmail(row.email ?? '')
    setEditPhone(row.contact?.phone ?? '')
    const existingContacts = row.contact?.contacts ?? []
    setEditContactRows(existingContacts.length > 0 ? existingContacts.map(toContactField) : [blankContactField()])
    const subjects = row.subject ?? []
    setEditSelectedSubjects(subjects.filter((s) => ESL_SUBJECTS.includes(s)))
    setEditCustomSubjects(subjects.filter((s) => !ESL_SUBJECTS.includes(s)))
    setEditSelectedBookIds(row.books ?? [])
    setEditCredits(row.Credits != null ? String(row.Credits) : '')
  }

  const handleEditSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!editTarget) return

    setEditMessage(null)
    setEditLoading(true)

    const finalEditContacts: StudentContact[] = editContactRows
      .map((row) => ({
        platform: (row.platform === 'Other' ? row.customPlatform : row.platform).trim(),
        handle: row.handle.trim(),
      }))
      .filter((c) => c.platform && c.handle)

    const contact: { phone: string; contacts?: StudentContact[] } = { phone: editPhone }
    if (finalEditContacts.length > 0) {
      contact.contacts = finalEditContacts
    }

    const finalSubjects = [...editSelectedSubjects, ...editCustomSubjects]

    const { data, error } = await supabase
      .from('student_lists')
      .update({
        name: editName,
        gender: editGender || null,
        english_level: editEnglishLevel || null,
        description: editDescription.trim() || null,
        email: editEmail || null,
        subject: finalSubjects.length > 0 ? finalSubjects : null,
        contact,
        books: editSelectedBookIds.length > 0 ? editSelectedBookIds : null,
        Credits: editCredits.trim() === '' ? null : Number(editCredits),
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

  const handleDeleteStudent = async (id: string) => {
    setDeletingId(id)
    setListMessage(null)

    const { data, error } = await supabase.functions.invoke('delete-student', {
      body: { id },
    })

    setDeletingId(null)
    setConfirmDeleteId(null)

    if (error || !data?.success) {
      setListMessage({
        type: 'error',
        text: data?.error || 'Could not delete the student. Please try again.',
      })
      return
    }

    setReloadToken((n) => n + 1)
  }

  const resetForm = () => {
    setName('')
    setGender('')
    setEnglishLevel('')
    setDescription('')
    setEmail('')
    setPhone('')
    setContactRows([blankContactField()])
    setSelectedSubjects([])
    setCustomSubject('')
    setCustomSubjects([])
    setSubjectSearch('')
    setSelectedBookIds([])
    setBookSearch('')
    setPassword('')
    setConfirmPassword('')
  }

  const openModal = () => {
    resetForm()
    setMessage(null)
    setShowModal(true)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setMessage(null)

    if (!company) {
      setMessage({ type: 'error', text: 'Could not determine your company. Please try again.' })
      return
    }

    const finalSubjects = [...selectedSubjects.filter((s) => s !== 'Other'), ...customSubjects]

    if (!email.trim()) {
      setMessage({ type: 'error', text: 'Email is required to create the student login.' })
      return
    }
    if (password !== confirmPassword) {
      setMessage({ type: 'error', text: 'Passwords do not match.' })
      return
    }
    if (password.length < 6) {
      setMessage({ type: 'error', text: 'Password must be at least 6 characters.' })
      return
    }

    setLoading(true)

    // Use an isolated client so creating this account never touches the
    // admin's own session or the app-wide auth listener (see createIsolatedAuthClient).
    const isolatedAuth = createIsolatedAuthClient()
    const { data: signUpData, error: signUpError } = await isolatedAuth.auth.signUp({
      email,
      password,
      options: { data: { role: ROLE.STUDENT } },
    })

    if (signUpError || !signUpData.user) {
      setLoading(false)
      setMessage({ type: 'error', text: signUpError?.message || 'Could not create the student login. Please try again.' })
      return
    }

    const passwordHash = await bcrypt.hash(password, 10)

    const finalContacts: StudentContact[] = contactRows
      .map((row) => ({
        platform: (row.platform === 'Other' ? row.customPlatform : row.platform).trim(),
        handle: row.handle.trim(),
      }))
      .filter((c) => c.platform && c.handle)

    const contact: { phone: string; contacts?: StudentContact[] } = { phone }
    if (finalContacts.length > 0) {
      contact.contacts = finalContacts
    }

    const { error: insertError } = await supabase.from('student_lists').insert({
      company_code: company.code,
      name,
      gender: gender || null,
      english_level: englishLevel || null,
      description: description.trim() || null,
      email,
      subject: finalSubjects.length > 0 ? finalSubjects : null,
      contact,
      books: selectedBookIds.length > 0 ? selectedBookIds : null,
      student_code: generateStudentCode(),
      password: passwordHash,
    })

    setLoading(false)

    if (insertError) {
      setMessage({
        type: 'error',
        text: `Login created, but saving the student record failed: ${insertError.message} (company_code sent: "${company.code}", signed in as: "${session?.user.email}")`,
      })
      return
    }

    setMessage({ type: 'success', text: 'Student added.' })
    resetForm()
    setReloadToken((n) => n + 1)
  }

  return (
    <div className="students-page">
      <div className="students-page-header">
        <h1>Students</h1>
        <button className="btn btn-primary" onClick={openModal}>
          <UserPlus size={16} /> Add Student
        </button>
      </div>

      <div className="students-list-panel">
        {listLoading ? (
          <p className="students-loading">Loading…</p>
        ) : students.length === 0 ? (
          <div className="students-empty">
            <Backpack size={22} />
            <p>No students yet. Add one to get started.</p>
          </div>
        ) : (
          <div className="students-table-wrap">
            {listMessage && <p className={`students-message is-${listMessage.type}`}>{listMessage.text}</p>}
            <table className="students-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Gender</th>
                  <th>Level</th>
                  <th>Contact</th>
                  <th>Platform</th>
                  <th>Subjects</th>
                  <th>Books</th>
                  <th>Code</th>
                  <th>Joined</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.id} className="students-row-clickable" onClick={() => openEditModal(s)}>
                    <td>
                      <span className="students-row-avatar">
                        <Backpack size={14} />
                      </span>
                      {s.name}
                    </td>
                    <td>{s.gender || '—'}</td>
                    <td>{s.english_level || '—'}</td>
                    <td>
                      {s.email && <div>{s.email}</div>}
                      {s.contact?.phone && <div className="students-row-phone">{s.contact.phone}</div>}
                      {!s.email && !s.contact?.phone && '—'}
                    </td>
                    <td>
                      {s.contact?.contacts && s.contact.contacts.length > 0 ? (
                        <div className="students-contact-cell">
                          {s.contact.contacts.map((c, i) => (
                            <div key={i}>
                              <strong>{c.platform}:</strong>{' '}
                              {/^https?:\/\//i.test(c.handle) ? (
                                <a
                                  href={c.handle}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="students-platform-link"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  Open <ExternalLink size={12} />
                                </a>
                              ) : (
                                c.handle
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{s.subject && s.subject.length > 0 ? s.subject.join(', ') : '—'}</td>
                    <td>{s.books && s.books.length > 0 ? `${s.books.length} book${s.books.length > 1 ? 's' : ''}` : '—'}</td>
                    <td>{s.student_code}</td>
                    <td>{formatDate(s.created_at)}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {confirmDeleteId === s.id ? (
                        <span className="students-confirm-delete">
                          <button
                            type="button"
                            className="students-confirm-yes"
                            onClick={() => handleDeleteStudent(s.id)}
                            disabled={deletingId === s.id}
                          >
                            {deletingId === s.id ? 'Deleting…' : 'Confirm'}
                          </button>
                          <button type="button" className="students-confirm-no" onClick={() => setConfirmDeleteId(null)}>
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="students-delete-btn"
                          onClick={() => setConfirmDeleteId(s.id)}
                          aria-label={`Delete ${s.name}`}
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
        )}
      </div>

      {showModal && (
        <div className="students-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="students-modal" onClick={(e) => e.stopPropagation()}>
            <button className="students-modal-close" aria-label="Close" onClick={() => setShowModal(false)}>
              <X size={18} />
            </button>

            <div className="students-modal-scroll">
            <div className="students-modal-grid">
              <div className="students-panel students-panel-fill students-panel-decor">
                <div className="students-panel-header">
                  <span className="students-panel-icon">
                    <UserPlus size={18} />
                  </span>
                  <div>
                    <h2>Add New Student</h2>
                    <p className="students-panel-subtitle">Add a student to your roster.</p>
                  </div>
                </div>

                <form id="add-student-form" className="students-form" onSubmit={handleSubmit} autoComplete="off">
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

                  <div className="students-form-row">
                    <label>
                      Gender
                      <select value={gender} onChange={(e) => setGender(e.target.value)}>
                        <option value="">Select…</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </select>
                    </label>

                    <label>
                      English Level
                      <select value={englishLevel} onChange={(e) => setEnglishLevel(e.target.value)}>
                        <option value="">Select…</option>
                        {ENGLISH_LEVELS.map((l) => (
                          <option key={l} value={l}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="students-form-row">
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

                    <label>
                      Phone Number
                      <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="off" />
                    </label>
                  </div>

                  <div className="students-field-group">
                    <span className="students-field-label">Contacts</span>

                    <div className="students-contact-fields-list">
                      {contactRows.map((row, i) => (
                        <div key={i} className="students-contact-field-row">
                          <div className="students-form-row">
                            <label>
                              Platform
                              <select
                                value={row.platform}
                                onChange={(e) => updateContactRow(i, { platform: e.target.value })}
                              >
                                {COMM_PLATFORMS.map((p) => (
                                  <option key={p} value={p}>
                                    {p}
                                  </option>
                                ))}
                              </select>
                            </label>

                            <label>
                              ID / Link
                              <input
                                type="text"
                                value={row.handle}
                                onChange={(e) => updateContactRow(i, { handle: e.target.value })}
                                placeholder="Meeting link, ID, or username"
                                autoComplete="off"
                              />
                            </label>
                          </div>

                          {row.platform === 'Other' && (
                            <input
                              type="text"
                              className="students-custom-input"
                              value={row.customPlatform}
                              onChange={(e) => updateContactRow(i, { customPlatform: e.target.value })}
                              placeholder="Enter a platform name"
                              autoComplete="off"
                            />
                          )}

                          <button
                            type="button"
                            className="students-contact-remove-row-btn"
                            onClick={() => removeContactRow(i)}
                            aria-label="Remove this contact field"
                          >
                            <X size={12} /> Remove
                          </button>
                        </div>
                      ))}
                    </div>

                    <button type="button" className="students-tag-add-btn students-contact-add-btn" onClick={addContactRow}>
                      Add Another Platform
                    </button>
                  </div>

                  <label>
                    Description
                    <textarea
                      className="students-textarea"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={3}
                      placeholder="A short note about this student…"
                    />
                  </label>

                  <div className="students-form-row">
                    <label>
                      Password
                      <div className="students-password-field">
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
                      <div className="students-password-field">
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
                  <p className="students-field-help">
                    This creates the student's own login to the Student Dashboard.
                  </p>

                  {message && <p className={`students-message is-${message.type}`}>{message.text}</p>}

                  <button className="btn btn-primary" type="submit" disabled={loading || !company}>
                    {loading ? 'Adding…' : 'Add Student'}
                  </button>
                </form>
              </div>

              <div className="students-panel students-panel-fill students-info-panel">
                <div className="students-panel-header">
                  <span className="students-panel-icon students-panel-icon-alt">
                    <BookOpen size={18} />
                  </span>
                  <div>
                    <h2>Subjects & Books</h2>
                    <p className="students-panel-subtitle">Match this student to classes and materials.</p>
                  </div>
                </div>

                <div className="students-field-group">
                  <span className="students-field-label">
                    Subjects
                    {selectedSubjects.filter((s) => s !== 'Other').length + customSubjects.length > 0 && (
                      <span className="students-field-count">
                        {selectedSubjects.filter((s) => s !== 'Other').length + customSubjects.length} selected
                      </span>
                    )}
                  </span>
                  <div className="students-search-box">
                    <Search size={14} />
                    <input
                      form="add-student-form"
                      type="text"
                      className="students-search-input"
                      value={subjectSearch}
                      onChange={(e) => setSubjectSearch(e.target.value)}
                      placeholder="Search subjects…"
                      autoComplete="off"
                    />
                  </div>
                  <div className="students-checkbox-grid">
                    {filteredSubjects.length === 0 ? (
                      <p className="students-field-help">No subjects match “{subjectSearch}”.</p>
                    ) : (
                      filteredSubjects.map((s) => (
                        <label key={s} className="students-checkbox-chip">
                          <input
                            form="add-student-form"
                            type="checkbox"
                            checked={selectedSubjects.includes(s)}
                            onChange={() => toggleSubject(s)}
                          />
                          {s}
                          <Check size={12} className="students-chip-check" />
                        </label>
                      ))
                    )}
                  </div>
                  {selectedSubjects.includes('Other') && (
                    <div className="students-tag-input-group">
                      <div className="students-tag-input-row">
                        <input
                          form="add-student-form"
                          type="text"
                          className="students-custom-input"
                          value={customSubject}
                          onChange={(e) => setCustomSubject(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              addCustomSubject()
                            }
                          }}
                          placeholder="Type a subject and press Enter"
                          autoComplete="off"
                        />
                        <button type="button" className="students-tag-add-btn" onClick={addCustomSubject}>
                          Add
                        </button>
                      </div>
                      {customSubjects.length > 0 && (
                        <div className="students-tag-list">
                          {customSubjects.map((s) => (
                            <span key={s} className="students-tag-chip">
                              {s}
                              <button type="button" onClick={() => removeCustomSubject(s)} aria-label={`Remove ${s}`}>
                                <X size={11} />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="students-field-group">
                  <span className="students-field-label">
                    Books
                    {selectedBookIds.length > 0 && (
                      <span className="students-field-count">{selectedBookIds.length} selected</span>
                    )}
                  </span>
                  {availableBooks.length === 0 ? (
                    <p className="students-field-help">No books available yet.</p>
                  ) : (
                    <>
                      <div className="students-search-box">
                        <Search size={14} />
                        <input
                          form="add-student-form"
                          type="text"
                          className="students-search-input"
                          value={bookSearch}
                          onChange={(e) => setBookSearch(e.target.value)}
                          placeholder="Search books…"
                          autoComplete="off"
                        />
                      </div>
                      <div className="students-checkbox-grid">
                        {filteredBooks.length === 0 ? (
                          <p className="students-field-help">No books match “{bookSearch}”.</p>
                        ) : (
                          filteredBooks.map((b) => (
                            <label key={b.id} className="students-checkbox-chip">
                              <input
                                form="add-student-form"
                                type="checkbox"
                                checked={selectedBookIds.includes(b.id)}
                                onChange={() => toggleBook(b.id)}
                              />
                              <BookOpen size={13} />
                              {b.subject} — {b.category}
                              {company && b.company_code !== company.code && (
                                <span className="students-book-public-tag">Public</span>
                              )}
                              <Check size={12} className="students-chip-check" />
                            </label>
                          ))
                        )}
                      </div>
                    </>
                  )}
                </div>

                <div className="students-info-footer">
                  <Info size={13} />
                  <span>Optional — you can also add these later from the roster.</span>
                </div>
              </div>
            </div>
            </div>
          </div>
        </div>
      )}

      {editTarget && (
        <div className="students-modal-overlay" onClick={() => setEditTarget(null)}>
          <div className="students-edit-modal" onClick={(e) => e.stopPropagation()}>
            <button className="students-modal-close" aria-label="Close" onClick={() => setEditTarget(null)}>
              <X size={18} />
            </button>

            <div className="students-modal-scroll">
            <div className="students-modal-grid">
              <div className="students-panel students-panel-fill students-panel-decor">
                <div className="students-panel-header">
                  <span className="students-panel-icon">
                    <Pencil size={18} />
                  </span>
                  <div>
                    <h2>Edit Student</h2>
                    <p className="students-panel-subtitle">Code: {editTarget.student_code}</p>
                  </div>
                </div>

                <form id="edit-student-form" className="students-form" onSubmit={handleEditSubmit} autoComplete="off">
                  <label>
                    Full Name
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      autoComplete="off"
                      required
                    />
                  </label>

                  <div className="students-form-row">
                    <label>
                      Gender
                      <select value={editGender} onChange={(e) => setEditGender(e.target.value)}>
                        <option value="">Select…</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </select>
                    </label>

                    <label>
                      English Level
                      <select value={editEnglishLevel} onChange={(e) => setEditEnglishLevel(e.target.value)}>
                        <option value="">Select…</option>
                        {ENGLISH_LEVELS.map((l) => (
                          <option key={l} value={l}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="students-form-row">
                    <label>
                      Email
                      <input
                        type="email"
                        value={editEmail}
                        onChange={(e) => setEditEmail(e.target.value)}
                        autoComplete="off"
                      />
                    </label>

                    <label>
                      Phone Number
                      <input type="tel" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} autoComplete="off" />
                    </label>
                  </div>

                  <div className="students-field-group">
                    <span className="students-field-label">Contacts</span>

                    <div className="students-contact-fields-list">
                      {editContactRows.map((row, i) => (
                        <div key={i} className="students-contact-field-row">
                          <div className="students-form-row">
                            <label>
                              Platform
                              <select
                                value={row.platform}
                                onChange={(e) => updateEditContactRow(i, { platform: e.target.value })}
                              >
                                {COMM_PLATFORMS.map((p) => (
                                  <option key={p} value={p}>
                                    {p}
                                  </option>
                                ))}
                              </select>
                            </label>

                            <label>
                              ID / Link
                              <input
                                type="text"
                                value={row.handle}
                                onChange={(e) => updateEditContactRow(i, { handle: e.target.value })}
                                placeholder="Meeting link, ID, or username"
                                autoComplete="off"
                              />
                            </label>
                          </div>

                          {row.platform === 'Other' && (
                            <input
                              type="text"
                              className="students-custom-input"
                              value={row.customPlatform}
                              onChange={(e) => updateEditContactRow(i, { customPlatform: e.target.value })}
                              placeholder="Enter a platform name"
                              autoComplete="off"
                            />
                          )}

                          <button
                            type="button"
                            className="students-contact-remove-row-btn"
                            onClick={() => removeEditContactRow(i)}
                            aria-label="Remove this contact field"
                          >
                            <X size={12} /> Remove
                          </button>
                        </div>
                      ))}
                    </div>

                    <button type="button" className="students-tag-add-btn students-contact-add-btn" onClick={addEditContactRow}>
                      Add Another Platform
                    </button>
                  </div>

                  <label>
                    Description
                    <textarea
                      className="students-textarea"
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      rows={3}
                      placeholder="A short note about this student…"
                    />
                  </label>
                </form>
              </div>

              <div className="students-panel students-panel-fill students-info-panel">
                <div className="students-panel-header">
                  <span className="students-panel-icon students-panel-icon-alt">
                    <BookOpen size={18} />
                  </span>
                  <div>
                    <h2>Subjects & Books</h2>
                    <p className="students-panel-subtitle">Match this student to classes and materials.</p>
                  </div>
                </div>

                <div className="students-field-group">
                  <span className="students-field-label">
                    Subjects
                    {editSelectedSubjects.filter((s) => s !== 'Other').length + editCustomSubjects.length > 0 && (
                      <span className="students-field-count">
                        {editSelectedSubjects.filter((s) => s !== 'Other').length + editCustomSubjects.length} selected
                      </span>
                    )}
                  </span>
                  <div className="students-search-box">
                    <Search size={14} />
                    <input
                      form="edit-student-form"
                      type="text"
                      className="students-search-input"
                      value={editSubjectSearch}
                      onChange={(e) => setEditSubjectSearch(e.target.value)}
                      placeholder="Search subjects…"
                      autoComplete="off"
                    />
                  </div>
                  <div className="students-checkbox-grid">
                    {filteredEditSubjects.length === 0 ? (
                      <p className="students-field-help">No subjects match “{editSubjectSearch}”.</p>
                    ) : (
                      filteredEditSubjects.map((s) => (
                        <label key={s} className="students-checkbox-chip">
                          <input
                            form="edit-student-form"
                            type="checkbox"
                            checked={editSelectedSubjects.includes(s)}
                            onChange={() => toggleEditSubject(s)}
                          />
                          {s}
                          <Check size={12} className="students-chip-check" />
                        </label>
                      ))
                    )}
                  </div>
                  {editSelectedSubjects.includes('Other') && (
                    <div className="students-tag-input-group">
                      <div className="students-tag-input-row">
                        <input
                          form="edit-student-form"
                          type="text"
                          className="students-custom-input"
                          value={editCustomSubject}
                          onChange={(e) => setEditCustomSubject(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              addEditCustomSubject()
                            }
                          }}
                          placeholder="Type a subject and press Enter"
                          autoComplete="off"
                        />
                        <button type="button" className="students-tag-add-btn" onClick={addEditCustomSubject}>
                          Add
                        </button>
                      </div>
                      {editCustomSubjects.length > 0 && (
                        <div className="students-tag-list">
                          {editCustomSubjects.map((s) => (
                            <span key={s} className="students-tag-chip">
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

                <div className="students-field-group">
                  <span className="students-field-label">
                    Books
                    {editSelectedBookIds.length > 0 && (
                      <span className="students-field-count">{editSelectedBookIds.length} selected</span>
                    )}
                  </span>
                  {availableBooks.length === 0 ? (
                    <p className="students-field-help">No books available yet.</p>
                  ) : (
                    <>
                      <div className="students-search-box">
                        <Search size={14} />
                        <input
                          form="edit-student-form"
                          type="text"
                          className="students-search-input"
                          value={editBookSearch}
                          onChange={(e) => setEditBookSearch(e.target.value)}
                          placeholder="Search books…"
                          autoComplete="off"
                        />
                      </div>
                      <div className="students-checkbox-grid">
                        {filteredEditBooks.length === 0 ? (
                          <p className="students-field-help">No books match “{editBookSearch}”.</p>
                        ) : (
                          filteredEditBooks.map((b) => (
                            <label key={b.id} className="students-checkbox-chip">
                              <input
                                form="edit-student-form"
                                type="checkbox"
                                checked={editSelectedBookIds.includes(b.id)}
                                onChange={() => toggleEditBook(b.id)}
                              />
                              <BookOpen size={13} />
                              {b.subject} — {b.category}
                              {company && b.company_code !== company.code && (
                                <span className="students-book-public-tag">Public</span>
                              )}
                              <Check size={12} className="students-chip-check" />
                            </label>
                          ))
                        )}
                      </div>
                    </>
                  )}
                </div>

                <div className="students-field-group">
                  <span className="students-field-label">Class Credit</span>
                  <input
                    form="edit-student-form"
                    type="number"
                    min="0"
                    step="1"
                    className="students-custom-input"
                    value={editCredits}
                    onChange={(e) => setEditCredits(e.target.value)}
                    placeholder="0"
                  />
                  <p className="students-field-help">Class credit this student can spend to book classes.</p>
                </div>

                <div className="students-info-footer">
                  <Info size={13} />
                  <span>Changes save immediately and update their profile.</span>
                </div>

                {editMessage && <p className={`students-message is-${editMessage.type}`}>{editMessage.text}</p>}

                <button
                  form="edit-student-form"
                  className="btn btn-primary students-edit-save-btn"
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

export default Students
