import { Fragment, useEffect, useMemo, useState } from 'react'
import {
  Backpack,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  GraduationCap,
  Info,
  Phone,
  Play,
  Search,
  Star,
  X,
} from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/useAuth'
import { DEFAULT_COMPANY_SETTINGS, type CompanySettings } from '../../data/companySettings'
import { toDirectImageUrl, getVideoEmbed } from '../../lib/mediaEmbeds'
import { getZonedNow } from '../../lib/companyTime'
import './Schedule.css'

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

type StudentOption = {
  id: string
  name: string
  email: string | null
  student_code: string
  Credits: number | null
  subject: string[] | null
  english_level: string | null
  description: string | null
  contact: { phone?: string; contacts?: ContactEntry[] } | null
  books: string[] | null
}

type BookOption = {
  id: string
  subject: string
  category: string
}

type ClassDetails = { subject: string | null; book_id: string | null; book_label: string | null }

type ClassCell = {
  id: string
  teacher_id: string
  student_id: string | null
  date: string
  start_time: string
  Status: 'Booked' | 'Completed'
  class_details: ClassDetails | null
}

type CellState = 'closed' | 'open' | 'booked'

type Message = { type: 'success' | 'error'; text: string }

type CompanyInfo = { code: string; settings: Partial<CompanySettings> | null }

const RPC_ERROR_MESSAGES: Record<string, string> = {
  TEACHER_NOT_FOUND: 'Could not find that teacher.',
  NOT_AUTHORIZED: 'Not authorized for this teacher.',
  STUDENT_NOT_FOUND: 'Could not find that student.',
  STUDENT_WRONG_COMPANY: 'That student belongs to a different company.',
  INSUFFICIENT_CREDITS: 'This student has no class credits left.',
  SLOT_ALREADY_BOOKED: 'This slot was just booked by someone else.',
}

const pad2 = (n: number) => String(n).padStart(2, '0')

const getStartOfWeek = (d: Date) => {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  copy.setDate(copy.getDate() - copy.getDay())
  return copy
}

const getWeekDays = (start: Date) =>
  Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    return d
  })

const toDateKey = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

const getTimeSlots = (intervalMinutes: number) => {
  const slots: { value: string; label: string }[] = []
  for (let mins = 0; mins < 24 * 60; mins += intervalMinutes) {
    const h24 = Math.floor(mins / 60)
    const m = mins % 60
    const value = `${pad2(h24)}:${pad2(m)}:00`
    const period = h24 < 12 ? 'AM' : 'PM'
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12
    const label = `${h12}:${pad2(m)} ${period}`
    slots.push({ value, label })
  }
  return slots
}

const formatTimeLabel = (startTime: string) => {
  const [hStr, mStr] = startTime.split(':')
  const h24 = Number(hStr)
  const period = h24 < 12 ? 'AM' : 'PM'
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${mStr} ${period}`
}

const formatCellDate = (dateKey: string) => {
  const [y, m, d] = dateKey.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}

function StudentDetailLines({ student }: { student: StudentOption }) {
  return (
    <div className="schedule-student-detail">
      <p>
        <strong>Email:</strong> {student.email ?? '—'}
      </p>
      <p>
        <strong>English Level:</strong> {student.english_level ?? '—'}
      </p>
      <p>
        <strong>Subjects:</strong> {student.subject && student.subject.length > 0 ? student.subject.join(', ') : '—'}
      </p>
      <p>
        <strong>Credits:</strong> {student.Credits ?? 0}
      </p>
      {student.contact?.phone && (
        <p>
          <strong>Phone:</strong> {student.contact.phone}
        </p>
      )}
      {student.contact?.contacts?.map((c, i) => (
        <p key={i}>
          <strong>{c.platform}:</strong>{' '}
          {/^https?:\/\//i.test(c.handle) ? (
            <a href={c.handle} target="_blank" rel="noreferrer" className="schedule-contact-link">
              Open <ExternalLink size={11} />
            </a>
          ) : (
            c.handle
          )}
        </p>
      ))}
      {student.description && <p className="schedule-student-detail-desc">{student.description}</p>}
    </div>
  )
}

function Schedule() {
  const { session } = useAuth()
  const [company, setCompany] = useState<CompanyInfo | null>(null)

  const [teachers, setTeachers] = useState<TeacherRow[]>([])
  const [teachersLoading, setTeachersLoading] = useState(true)
  const [teacherSearch, setTeacherSearch] = useState('')
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null)

  const [students, setStudents] = useState<StudentOption[]>([])
  const [availableBooks, setAvailableBooks] = useState<BookOption[]>([])

  const [weekStart, setWeekStart] = useState(() => getStartOfWeek(new Date()))
  const [weekCells, setWeekCells] = useState<Map<string, ClassCell>>(new Map())
  const [weekLoading, setWeekLoading] = useState(false)
  const [cellsReloadToken, setCellsReloadToken] = useState(0)

  const [selectedCell, setSelectedCell] = useState<{ date: string; startTime: string } | null>(null)
  const [cellStudentSearch, setCellStudentSearch] = useState('')
  const [cellActionLoading, setCellActionLoading] = useState(false)
  const [cellMessage, setCellMessage] = useState<Message | null>(null)
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null)
  const [cellSubject, setCellSubject] = useState('')
  const [cellBookId, setCellBookId] = useState('')
  const [videoPlaying, setVideoPlaying] = useState(false)

  useEffect(() => {
    const adminEmail = session?.user.email
    if (!adminEmail) return

    supabase
      .from('company_registration')
      .select('CompanyCode, company_settings')
      .eq('email', adminEmail)
      .single()
      .then(({ data }) => {
        if (data) setCompany({ code: data.CompanyCode, settings: data.company_settings })
      })
  }, [session])

  useEffect(() => {
    const companyCode = company?.code
    if (!companyCode) return

    supabase
      .from('company_organizational_chart')
      .select('id, name, email, phone, subjects, photo, intro_video, intro_message, contact, "Rating", created_at')
      .eq('company_code', companyCode)
      .eq('employee_type', 'Teacher')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setTeachers((data as TeacherRow[]) ?? [])
        setTeachersLoading(false)
      })
  }, [company?.code])

  useEffect(() => {
    const companyCode = company?.code
    if (!companyCode) return

    supabase
      .from('student_lists')
      .select('id, name, email, student_code, "Credits", subject, english_level, description, contact, books')
      .eq('company_code', companyCode)
      .order('name', { ascending: true })
      .then(({ data }) => {
        setStudents((data as StudentOption[]) ?? [])
      })
  }, [company?.code])

  useEffect(() => {
    const companyCode = company?.code
    if (!companyCode) return

    supabase
      .from('books')
      .select('id, subject, category')
      .or(`company_code.eq.${companyCode},PublicAvailability.eq.true`)
      .order('subject', { ascending: true })
      .then(({ data }) => {
        setAvailableBooks((data as BookOption[]) ?? [])
      })
  }, [company?.code])

  useEffect(() => {
    const teacherId = selectedTeacherId
    if (!teacherId) return

    setWeekLoading(true)
    const days = getWeekDays(weekStart)
    const startKey = toDateKey(days[0])
    const endKey = toDateKey(days[6])

    supabase
      .from('classes')
      .select('id, teacher_id, student_id, date, start_time, "Status", class_details')
      .eq('teacher_id', teacherId)
      .gte('date', startKey)
      .lte('date', endKey)
      .then(({ data }) => {
        const map = new Map<string, ClassCell>()
        ;((data as ClassCell[]) ?? []).forEach((row) => {
          map.set(`${row.date}_${row.start_time}`, row)
        })
        setWeekCells(map)
        setWeekLoading(false)
      })
  }, [selectedTeacherId, weekStart, cellsReloadToken])

  // Drives the "now" line: re-evaluate the current time once a minute so the
  // line advances without requiring any user interaction.
  const [nowTick, setNowTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setNowTick((n) => n + 1), 60000)
    return () => clearInterval(id)
  }, [])

  const intervalMinutes = company?.settings?.time_interval === '60' ? 60 : 30
  const timeSlots = useMemo(() => getTimeSlots(intervalMinutes), [intervalMinutes])
  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart])

  const companyTimezone = company?.settings?.timezone ?? DEFAULT_COMPANY_SETTINGS.timezone
  // nowTick (bumped every 60s) forces this render to recompute — the value itself isn't read here.
  void nowTick
  const today = getZonedNow(companyTimezone)
  const todayIndexInWeek = weekDays.findIndex((d) => isSameDay(d, today))
  const nowMinutesOfDay = today.getHours() * 60 + today.getMinutes()
  const nowSlotIndex = Math.floor(nowMinutesOfDay / intervalMinutes)
  const nowFraction = (nowMinutesOfDay % intervalMinutes) / intervalMinutes

  const weekLabel =
    weekDays[0].getMonth() === weekDays[6].getMonth()
      ? `${weekDays[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${weekDays[6].toLocaleDateString('en-US', { day: 'numeric', year: 'numeric' })}`
      : `${weekDays[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${weekDays[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`

  const selectedTeacher = teachers.find((t) => t.id === selectedTeacherId) ?? null

  const selectTeacher = (id: string) => {
    setSelectedTeacherId(id)
    setSelectedCell(null)
    setVideoPlaying(false)
  }

  const prevWeek = () =>
    setWeekStart((d) => {
      const n = new Date(d)
      n.setDate(n.getDate() - 7)
      return n
    })

  const nextWeek = () =>
    setWeekStart((d) => {
      const n = new Date(d)
      n.setDate(n.getDate() + 7)
      return n
    })

  const goToToday = () => setWeekStart(getStartOfWeek(new Date()))

  const getCellState = (dateKey: string, startTime: string): { state: CellState; row: ClassCell | null } => {
    const row = weekCells.get(`${dateKey}_${startTime}`) ?? null
    if (!row) return { state: 'closed', row: null }
    if (row.student_id) return { state: 'booked', row }
    return { state: 'open', row }
  }

  const openCellPopup = (dateKey: string, startTime: string) => {
    setSelectedCell({ date: dateKey, startTime })
    setCellStudentSearch('')
    setCellMessage(null)
    setExpandedStudentId(null)
    setCellSubject('')
    setCellBookId('')
  }

  const expandStudent = (student: StudentOption) => {
    setExpandedStudentId((id) => (id === student.id ? null : student.id))
    const subjects = student.subject ?? []
    setCellSubject(subjects.length === 1 ? subjects[0] : '')
    const bookIds = (student.books ?? []).filter((id) => availableBooks.some((b) => b.id === id))
    setCellBookId(bookIds.length === 1 ? bookIds[0] : '')
  }

  const closeCellPopup = () => setSelectedCell(null)

  const handleMarkOpen = async () => {
    if (!selectedCell || !company || !selectedTeacherId) return
    setCellActionLoading(true)
    setCellMessage(null)

    const { error } = await supabase.from('classes').insert({
      company_code: company.code,
      teacher_id: selectedTeacherId,
      date: selectedCell.date,
      start_time: selectedCell.startTime,
    })

    setCellActionLoading(false)

    if (error) {
      setCellMessage({ type: 'error', text: 'Could not open this slot. Please try again.' })
      return
    }

    setCellsReloadToken((n) => n + 1)
  }

  const handleMarkClosed = async (rowId: string) => {
    setCellActionLoading(true)
    setCellMessage(null)

    const { data, error } = await supabase.from('classes').delete().eq('id', rowId).is('student_id', null).select('id')

    setCellActionLoading(false)

    if (error || !data || data.length === 0) {
      setCellMessage({ type: 'error', text: 'Could not close this slot. It may have just been booked.' })
      return
    }

    setCellsReloadToken((n) => n + 1)
  }

  const handleBookStudent = async (studentId: string) => {
    if (!selectedCell || !selectedTeacherId) return
    setCellActionLoading(true)
    setCellMessage(null)

    const selectedBook = availableBooks.find((b) => b.id === cellBookId) ?? null
    const classDetails: ClassDetails | null =
      cellSubject || selectedBook
        ? {
            subject: cellSubject || null,
            book_id: selectedBook?.id ?? null,
            book_label: selectedBook ? `${selectedBook.subject} — ${selectedBook.category}` : null,
          }
        : null

    const { error } = await supabase.rpc('book_schedule_slot', {
      p_teacher_id: selectedTeacherId,
      p_date: selectedCell.date,
      p_start_time: selectedCell.startTime,
      p_student_id: studentId,
      p_class_details: classDetails,
    })

    setCellActionLoading(false)

    if (error) {
      setCellMessage({ type: 'error', text: RPC_ERROR_MESSAGES[error.message] ?? 'Could not book this student. Please try again.' })
      return
    }

    setStudents((prev) => prev.map((s) => (s.id === studentId ? { ...s, Credits: (s.Credits ?? 0) - 1 } : s)))
    setCellStudentSearch('')
    setCellMessage({ type: 'success', text: 'Student booked.' })
    setCellsReloadToken((n) => n + 1)
  }

  const handleMarkCompleted = async (rowId: string) => {
    setCellActionLoading(true)
    setCellMessage(null)

    const { data, error } = await supabase.from('classes').update({ Status: 'Completed' }).eq('id', rowId).select('id')

    setCellActionLoading(false)

    if (error || !data || data.length === 0) {
      setCellMessage({ type: 'error', text: 'Could not mark this class completed. Please try again.' })
      return
    }

    setCellMessage({ type: 'success', text: 'Class marked completed.' })
    setCellsReloadToken((n) => n + 1)
  }

  const handleCancelBooking = async (rowId: string, studentId: string) => {
    setCellActionLoading(true)
    setCellMessage(null)

    const { error } = await supabase.rpc('cancel_schedule_booking', { p_class_id: rowId })

    setCellActionLoading(false)

    if (error) {
      setCellMessage({ type: 'error', text: 'Could not cancel this booking. Please try again.' })
      return
    }

    setStudents((prev) => prev.map((s) => (s.id === studentId ? { ...s, Credits: (s.Credits ?? 0) + 1 } : s)))
    setCellMessage({ type: 'success', text: 'Booking cancelled.' })
    setCellsReloadToken((n) => n + 1)
  }

  const filteredTeachers = (() => {
    const q = teacherSearch.trim().toLowerCase()
    if (!q) return teachers
    return teachers.filter((t) => t.name.toLowerCase().includes(q) || t.email.toLowerCase().includes(q))
  })()

  const filteredStudents = (() => {
    const q = cellStudentSearch.trim().toLowerCase()
    const base = !q
      ? students
      : students.filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            (s.email ?? '').toLowerCase().includes(q) ||
            s.student_code.toLowerCase().includes(q),
        )
    return base.slice(0, 30)
  })()

  const selectedCellInfo = selectedCell ? getCellState(selectedCell.date, selectedCell.startTime) : null
  const bookedStudent =
    selectedCellInfo?.state === 'booked' && selectedCellInfo.row
      ? students.find((s) => s.id === selectedCellInfo.row!.student_id) ?? null
      : null

  return (
    <div className="schedule-page">
      <div className="schedule-page-header">
        <h1>Schedule</h1>
      </div>

      <div className="schedule-teachers-panel">
        <h2 className="schedule-section-heading">Teachers</h2>

        {teachers.length > 0 && (
          <div className="schedule-search-box schedule-teacher-search-box">
            <Search size={14} />
            <input
              type="text"
              className="schedule-search-input"
              value={teacherSearch}
              onChange={(e) => setTeacherSearch(e.target.value)}
              placeholder="Search by name or email…"
              autoComplete="off"
            />
          </div>
        )}

        {teachersLoading ? (
          <p className="schedule-loading">Loading…</p>
        ) : teachers.length === 0 ? (
          <div className="schedule-empty">
            <GraduationCap size={22} />
            <p>No teachers yet. Add one from Employees first.</p>
          </div>
        ) : filteredTeachers.length === 0 ? (
          <p className="schedule-field-help">No teachers match “{teacherSearch}”.</p>
        ) : (
          <div className="schedule-teacher-grid">
            {filteredTeachers.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`schedule-teacher-card ${t.id === selectedTeacherId ? 'is-selected' : ''}`}
                onClick={() => selectTeacher(t.id)}
              >
                <span className="schedule-teacher-avatar">
                  {t.photo ? (
                    <img src={toDirectImageUrl(t.photo)} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} />
                  ) : (
                    <GraduationCap size={20} />
                  )}
                </span>
                <span className="schedule-teacher-name">{t.name}</span>
                {t.subjects && t.subjects.length > 0 && (
                  <span className="schedule-teacher-subjects">
                    {t.subjects.slice(0, 2).join(', ')}
                    {t.subjects.length > 2 && ` +${t.subjects.length - 2}`}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedTeacher && (
        <>
          <div className="schedule-detail-panel">
            <div className="schedule-detail-header">
              <span className="schedule-detail-avatar">
                {selectedTeacher.photo ? (
                  <img src={toDirectImageUrl(selectedTeacher.photo)} alt="" />
                ) : (
                  <GraduationCap size={24} />
                )}
              </span>
              <div>
                <h2>{selectedTeacher.name}</h2>
                <p className="schedule-detail-subtitle">
                  {selectedTeacher.email}
                  {selectedTeacher.Rating != null && (
                    <span className="schedule-rating-badge">
                      <Star size={11} fill="currentColor" /> {selectedTeacher.Rating.toFixed(1)}
                    </span>
                  )}
                </p>
              </div>
            </div>

            <div className="schedule-detail-body">
              <div className="schedule-detail-col">
                {selectedTeacher.subjects && selectedTeacher.subjects.length > 0 && (
                  <div className="schedule-detail-block">
                    <span className="schedule-field-label">Subjects</span>
                    <div className="schedule-chip-row">
                      {selectedTeacher.subjects.map((s) => (
                        <span key={s} className="schedule-chip">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="schedule-detail-block">
                  <span className="schedule-field-label">Contact</span>
                  <p className="schedule-contact-line">
                    <Phone size={13} /> {selectedTeacher.phone}
                  </p>
                  {selectedTeacher.contact?.contacts?.map((c, i) => (
                    <p key={i} className="schedule-contact-line">
                      <strong>{c.platform}:</strong>{' '}
                      {/^https?:\/\//i.test(c.handle) ? (
                        <a href={c.handle} target="_blank" rel="noreferrer" className="schedule-contact-link">
                          Open <ExternalLink size={11} />
                        </a>
                      ) : (
                        c.handle
                      )}
                    </p>
                  ))}
                </div>

                {selectedTeacher.intro_message && (
                  <div className="schedule-detail-block">
                    <span className="schedule-field-label">Intro</span>
                    <p className="schedule-intro-message">{selectedTeacher.intro_message}</p>
                  </div>
                )}
              </div>

              {selectedTeacher.intro_video && (
                <div className="schedule-detail-col">
                  <span className="schedule-field-label">Video</span>
                  {(() => {
                    const embed = getVideoEmbed(selectedTeacher.intro_video)

                    if (embed && videoPlaying) {
                      if (embed.provider === 'file') {
                        return <video className="schedule-video-player" src={embed.embedUrl} controls autoPlay />
                      }
                      return (
                        <iframe
                          className="schedule-video-player"
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
                          className="schedule-video-preview"
                          onClick={() => setVideoPlaying(true)}
                          aria-label="Play video"
                        >
                          {embed.thumbnail ? <img src={embed.thumbnail} alt="" /> : <div className="schedule-video-placeholder" />}
                          <span className="schedule-video-play">
                            <Play size={18} fill="currentColor" />
                          </span>
                        </button>
                      )
                    }

                    return (
                      <a
                        href={selectedTeacher.intro_video}
                        target="_blank"
                        rel="noreferrer"
                        className="schedule-video-preview schedule-video-fallback"
                      >
                        <ExternalLink size={16} />
                        Open video
                      </a>
                    )
                  })()}
                </div>
              )}
            </div>
          </div>

          <div className="schedule-week-panel">
            <div className="schedule-week-nav">
              <button type="button" className="schedule-week-nav-btn" onClick={prevWeek} aria-label="Previous week">
                <ChevronLeft size={16} />
              </button>
              <div className="schedule-week-nav-center">
                <span className="schedule-week-label">{weekLabel}</span>
                <button type="button" className="schedule-today-btn" onClick={goToToday}>
                  Today
                </button>
              </div>
              <button type="button" className="schedule-week-nav-btn" onClick={nextWeek} aria-label="Next week">
                <ChevronRight size={16} />
              </button>
            </div>

            <div className="schedule-grid-wrap">
              {weekLoading && <p className="schedule-grid-loading">Loading…</p>}
              <div
                className="schedule-grid"
                style={{ gridTemplateColumns: `80px repeat(7, minmax(110px, 1fr))` }}
              >
                <div className="schedule-grid-corner" />
                {weekDays.map((d) => (
                  <div key={d.toISOString()} className={`schedule-grid-day-header ${isSameDay(d, today) ? 'is-today' : ''}`}>
                    <span className="schedule-grid-day-name">{d.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                    <span className="schedule-grid-day-num">{d.getDate()}</span>
                  </div>
                ))}

                {timeSlots.map((slot, slotIndex) => (
                  <Fragment key={slot.value}>
                    <div className="schedule-grid-time-label">{slot.label}</div>
                    {weekDays.map((d, dayIndex) => {
                      const dateKey = toDateKey(d)
                      const { state, row } = getCellState(dateKey, slot.value)
                      const student = state === 'booked' && row ? students.find((s) => s.id === row.student_id) : null
                      const showNowLine = dayIndex === todayIndexInWeek && slotIndex === nowSlotIndex
                      return (
                        <button
                          key={`${dateKey}_${slot.value}`}
                          type="button"
                          className={`schedule-cell is-${state}`}
                          onClick={() => openCellPopup(dateKey, slot.value)}
                        >
                          {state === 'booked' && (student?.name.split(' ')[0] ?? 'Booked')}
                          {showNowLine && (
                            <span className="schedule-now-line" style={{ top: `${nowFraction * 100}%` }}>
                              <span className="schedule-now-dot" />
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </Fragment>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {selectedCell && selectedCellInfo && (
        <div className="schedule-modal-overlay" onClick={closeCellPopup}>
          <div className="schedule-cell-modal" onClick={(e) => e.stopPropagation()}>
            <button className="schedule-modal-close" aria-label="Close" onClick={closeCellPopup}>
              <X size={18} />
            </button>

            <div className="schedule-cell-modal-header">
              <h2>{formatCellDate(selectedCell.date)}</h2>
              <p className="schedule-cell-modal-time">{formatTimeLabel(selectedCell.startTime)}</p>
              <span
                className={`schedule-cell-status-badge is-${
                  selectedCellInfo.state === 'booked' && selectedCellInfo.row?.Status === 'Completed' ? 'completed' : selectedCellInfo.state
                }`}
              >
                {selectedCellInfo.state === 'closed'
                  ? 'Closed'
                  : selectedCellInfo.state === 'open'
                    ? 'Open'
                    : selectedCellInfo.row?.Status === 'Completed'
                      ? 'Completed'
                      : 'Booked'}
              </span>
            </div>

            {selectedCellInfo.state === 'booked' && bookedStudent && selectedCellInfo.row ? (
              <div className="schedule-booked-info">
                <button
                  type="button"
                  className="schedule-student-row"
                  onClick={() => setExpandedStudentId((id) => (id === bookedStudent.id ? null : bookedStudent.id))}
                >
                  <span className="schedule-student-name">
                    <Backpack size={14} /> {bookedStudent.name}
                  </span>
                  <span className="schedule-student-meta">{bookedStudent.student_code}</span>
                </button>

                {expandedStudentId === bookedStudent.id && <StudentDetailLines student={bookedStudent} />}

                {selectedCellInfo.row.class_details &&
                  (selectedCellInfo.row.class_details.subject || selectedCellInfo.row.class_details.book_label) && (
                    <div className="schedule-class-details">
                      {selectedCellInfo.row.class_details.subject && (
                        <p>
                          <strong>Subject:</strong> {selectedCellInfo.row.class_details.subject}
                        </p>
                      )}
                      {selectedCellInfo.row.class_details.book_label && (
                        <p>
                          <strong>Book:</strong> {selectedCellInfo.row.class_details.book_label}
                        </p>
                      )}
                    </div>
                  )}

                <div className="schedule-booked-actions">
                  {selectedCellInfo.row.Status !== 'Completed' && (
                    <button
                      type="button"
                      className="schedule-toggle-btn"
                      onClick={() => handleMarkCompleted(selectedCellInfo.row!.id)}
                      disabled={cellActionLoading}
                    >
                      {cellActionLoading ? 'Saving…' : 'Mark as Completed'}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-primary schedule-cancel-btn"
                    onClick={() => handleCancelBooking(selectedCellInfo.row!.id, bookedStudent.id)}
                    disabled={cellActionLoading}
                  >
                    {cellActionLoading ? 'Cancelling…' : 'Cancel Booking'}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  className="schedule-toggle-btn"
                  onClick={() =>
                    selectedCellInfo.state === 'closed' ? handleMarkOpen() : handleMarkClosed(selectedCellInfo.row!.id)
                  }
                  disabled={cellActionLoading}
                >
                  {selectedCellInfo.state === 'closed' ? 'Mark as Open' : 'Mark as Closed'}
                </button>

                <div className="schedule-book-section">
                  <span className="schedule-field-label">Book a Student</span>
                  <div className="schedule-search-box">
                    <Search size={14} />
                    <input
                      type="text"
                      className="schedule-search-input"
                      value={cellStudentSearch}
                      onChange={(e) => setCellStudentSearch(e.target.value)}
                      placeholder="Search by name, email, or code…"
                      autoComplete="off"
                    />
                  </div>
                  <div className="schedule-student-list">
                    {filteredStudents.length === 0 ? (
                      <p className="schedule-field-help">No students match.</p>
                    ) : (
                      filteredStudents.map((s) => {
                        const credits = s.Credits ?? 0
                        const noCredits = credits < 1
                        const expanded = expandedStudentId === s.id
                        const subjectOptions = s.subject ?? []
                        const bookOptions = (s.books ?? [])
                          .map((id) => availableBooks.find((b) => b.id === id))
                          .filter((b): b is BookOption => Boolean(b))
                        const needsSubject = subjectOptions.length > 0 && !cellSubject
                        const needsBook = bookOptions.length > 0 && !cellBookId
                        return (
                          <div key={s.id} className="schedule-student-item">
                            <button type="button" className="schedule-student-row" onClick={() => expandStudent(s)}>
                              <span className="schedule-student-name">{s.name}</span>
                              <span className="schedule-student-meta">
                                {s.student_code} · {credits} credit{credits === 1 ? '' : 's'}
                              </span>
                            </button>

                            {expanded && (
                              <>
                                <StudentDetailLines student={s} />

                                {(subjectOptions.length > 0 || bookOptions.length > 0) && (
                                  <div className="schedule-booking-choice">
                                    {subjectOptions.length > 0 && (
                                      <label>
                                        Subject
                                        <select value={cellSubject} onChange={(e) => setCellSubject(e.target.value)}>
                                          <option value="">Select…</option>
                                          {subjectOptions.map((subj) => (
                                            <option key={subj} value={subj}>
                                              {subj}
                                            </option>
                                          ))}
                                        </select>
                                      </label>
                                    )}
                                    {bookOptions.length > 0 && (
                                      <label>
                                        Book
                                        <select value={cellBookId} onChange={(e) => setCellBookId(e.target.value)}>
                                          <option value="">Select…</option>
                                          {bookOptions.map((b) => (
                                            <option key={b.id} value={b.id}>
                                              {b.subject} — {b.category}
                                            </option>
                                          ))}
                                        </select>
                                      </label>
                                    )}
                                  </div>
                                )}

                                <button
                                  type="button"
                                  className="btn btn-primary schedule-book-confirm-btn"
                                  disabled={noCredits || cellActionLoading || needsSubject || needsBook}
                                  onClick={() => handleBookStudent(s.id)}
                                >
                                  {noCredits
                                    ? 'No Credits Left'
                                    : cellActionLoading
                                      ? 'Booking…'
                                      : needsSubject || needsBook
                                        ? 'Select Subject & Book'
                                        : 'Book This Student'}
                                </button>
                              </>
                            )}
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              </>
            )}

            {cellMessage && <p className={`schedule-message is-${cellMessage.type}`}>{cellMessage.text}</p>}

            <div className="schedule-modal-footer">
              <Info size={12} />
              <span>Booking spends 1 class credit; canceling refunds it.</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Schedule
