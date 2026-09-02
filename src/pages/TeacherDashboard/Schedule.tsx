import { Fragment, useEffect, useMemo, useState } from 'react'
import { Backpack, ChevronLeft, ChevronRight, ExternalLink, GraduationCap, Info, Play, Search, Star, X } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useTeacherIdentity } from '../../hooks/useTeacherIdentity'
import { toDirectImageUrl, getVideoEmbed } from '../../lib/mediaEmbeds'
import { getZonedNow } from '../../lib/companyTime'
import './Schedule.css'

type ContactEntry = { platform: string; handle: string }

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
  class_notes: string | null
}

type CellState = 'closed' | 'open' | 'booked'

type Message = { type: 'success' | 'error'; text: string }

// Only meaningful for a company-employed teacher's own detail panel — a
// freelance teacher has none of these columns (no profile card is shown).
type SelfProfile = {
  photo: string | null
  intro_video: string | null
  intro_message: string | null
  contact: { contacts?: ContactEntry[] } | null
  subjects: string[] | null
  Rating: number | null
  phone: string
}

const RPC_ERROR_MESSAGES: Record<string, string> = {
  TEACHER_NOT_FOUND: 'Could not find that teacher.',
  NOT_AUTHORIZED: 'Not authorized. Your school may have turned off self-booking.',
  STUDENT_NOT_FOUND: 'Could not find that student.',
  STUDENT_WRONG_COMPANY: 'That student belongs to a different company.',
  STUDENT_NOT_YOURS: "That student isn't on your roster.",
  INSUFFICIENT_CREDITS: 'This student has no class credits left.',
  SLOT_ALREADY_BOOKED: 'This slot was just booked by someone else.',
  CLASS_NOT_STARTED: "You can mark this completed once the class's scheduled time has passed.",
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
    <div className="teacher-schedule-student-detail">
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
            <a href={c.handle} target="_blank" rel="noreferrer" className="teacher-schedule-contact-link">
              Open <ExternalLink size={11} />
            </a>
          ) : (
            c.handle
          )}
        </p>
      ))}
      {student.description && <p className="teacher-schedule-student-detail-desc">{student.description}</p>}
    </div>
  )
}

function Schedule() {
  const { identity, loading: identityLoading } = useTeacherIdentity()

  const [selfProfile, setSelfProfile] = useState<SelfProfile | null>(null)
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
  const [cellNotesDraft, setCellNotesDraft] = useState('')
  const [cellNotesSaving, setCellNotesSaving] = useState(false)
  const [videoPlaying, setVideoPlaying] = useState(false)

  const classesTable = identity?.kind === 'freelance' ? 'freelance_classes' : 'classes'

  useEffect(() => {
    if (!identity || identity.kind !== 'company') return

    supabase
      .from('company_organizational_chart')
      .select('photo, intro_video, intro_message, contact, subjects, "Rating", phone')
      .eq('id', identity.teacherId)
      .single()
      .then(({ data }) => setSelfProfile((data as SelfProfile) ?? null))
  }, [identity])

  useEffect(() => {
    if (!identity) return

    const query =
      identity.kind === 'freelance'
        ? supabase
            .from('freelance_students')
            .select('id, name, email, student_code, "Credits", subject, english_level, description, contact, books')
            .eq('teacher_id', identity.teacherId)
        : supabase
            .from('student_lists')
            .select('id, name, email, student_code, "Credits", subject, english_level, description, contact, books')
            .eq('company_code', identity.companyCode)

    query.order('name', { ascending: true }).then(({ data }) => {
      setStudents((data as StudentOption[]) ?? [])
    })
  }, [identity])

  useEffect(() => {
    if (!identity) return

    if (identity.kind === 'freelance') {
      // Own freelance_books plus any book a company has marked public — two
      // separate tables, merged client-side.
      Promise.all([
        supabase.from('freelance_books').select('id, subject, category').eq('teacher_id', identity.teacherId),
        supabase.from('books').select('id, subject, category').eq('PublicAvailability', true),
      ]).then(([own, pub]) => {
        setAvailableBooks([...((own.data as BookOption[]) ?? []), ...((pub.data as BookOption[]) ?? [])])
      })
      return
    }

    supabase
      .from('books')
      .select('id, subject, category')
      .or(`company_code.eq.${identity.companyCode},PublicAvailability.eq.true`)
      .order('subject', { ascending: true })
      .then(({ data }) => {
        setAvailableBooks((data as BookOption[]) ?? [])
      })
  }, [identity])

  useEffect(() => {
    if (!identity) return

    setWeekLoading(true)
    const days = getWeekDays(weekStart)
    const startKey = toDateKey(days[0])
    const endKey = toDateKey(days[6])

    supabase
      .from(classesTable)
      .select('id, teacher_id, student_id, date, start_time, "Status", class_details, class_notes')
      .eq('teacher_id', identity.teacherId)
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
  }, [identity, weekStart, cellsReloadToken, classesTable])

  // Drives the "now" line: re-evaluate the current time once a minute so the
  // line advances without requiring any user interaction.
  const [nowTick, setNowTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setNowTick((n) => n + 1), 60000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!selectedCell) return
    const row = weekCells.get(`${selectedCell.date}_${selectedCell.startTime}`)
    setCellNotesDraft(row?.class_notes ?? '')
  }, [selectedCell, weekCells])

  const intervalMinutes = identity
    ? (identity.kind === 'company' ? identity.companySettings.time_interval : identity.settings.time_interval) === '60'
      ? 60
      : 30
    : 30
  const timeSlots = useMemo(() => getTimeSlots(intervalMinutes), [intervalMinutes])
  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart])

  const teacherTimezone = identity ? (identity.kind === 'company' ? identity.companySettings.timezone : identity.settings.timezone) : 'Asia/Manila'
  // nowTick (bumped every 60s) forces this render to recompute — the value itself isn't read here.
  void nowTick
  const today = getZonedNow(teacherTimezone)
  const todayIndexInWeek = weekDays.findIndex((d) => isSameDay(d, today))
  const nowMinutesOfDay = today.getHours() * 60 + today.getMinutes()
  const nowSlotIndex = Math.floor(nowMinutesOfDay / intervalMinutes)
  const nowFraction = (nowMinutesOfDay % intervalMinutes) / intervalMinutes

  const weekLabel =
    weekDays[0].getMonth() === weekDays[6].getMonth()
      ? `${weekDays[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${weekDays[6].toLocaleDateString('en-US', { day: 'numeric', year: 'numeric' })}`
      : `${weekDays[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${weekDays[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`

  // Opening/closing a slot and marking a class completed never touch
  // credits or assign a student, so they're always available to the
  // teacher — only actually booking or canceling a specific student is
  // gated by teacher_self_booking.
  const canBookOrCancel = identity ? identity.kind === 'freelance' || identity.selfBookingAllowed : false

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
    if (!selectedCell || !identity) return
    setCellActionLoading(true)
    setCellMessage(null)

    const payload =
      identity.kind === 'freelance'
        ? { teacher_id: identity.teacherId, date: selectedCell.date, start_time: selectedCell.startTime }
        : {
            company_code: identity.companyCode,
            teacher_id: identity.teacherId,
            date: selectedCell.date,
            start_time: selectedCell.startTime,
          }

    const { error } = await supabase.from(classesTable).insert(payload)

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

    const { data, error } = await supabase.from(classesTable).delete().eq('id', rowId).is('student_id', null).select('id')

    setCellActionLoading(false)

    if (error || !data || data.length === 0) {
      setCellMessage({ type: 'error', text: 'Could not close this slot. It may have just been booked.' })
      return
    }

    setCellsReloadToken((n) => n + 1)
  }

  const handleBookStudent = async (studentId: string) => {
    if (!selectedCell || !identity) return
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

    const { error } =
      identity.kind === 'freelance'
        ? await supabase.rpc('book_freelance_slot', {
            p_date: selectedCell.date,
            p_start_time: selectedCell.startTime,
            p_student_id: studentId,
            p_class_details: classDetails,
          })
        : await supabase.rpc('book_schedule_slot', {
            p_teacher_id: identity.teacherId,
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

    // Both modes go through a narrow RPC — neither a company teacher nor a
    // freelance teacher has a plain UPDATE grant that could complete a
    // class before its scheduled time, or rewrite student_id/Status freely.
    const { error } =
      identity?.kind === 'freelance'
        ? await supabase.rpc('mark_freelance_class_completed', { p_class_id: rowId })
        : await supabase.rpc('mark_class_completed', { p_class_id: rowId })

    setCellActionLoading(false)

    if (error) {
      setCellMessage({
        type: 'error',
        text: RPC_ERROR_MESSAGES[error.message] ?? 'Could not mark this class completed. Please try again.',
      })
      return
    }

    setCellMessage({ type: 'success', text: 'Class marked completed.' })
    setCellsReloadToken((n) => n + 1)
  }

  const handleSaveNotes = async (rowId: string) => {
    setCellNotesSaving(true)
    setCellMessage(null)

    // Same reasoning as handleMarkCompleted: no plain UPDATE grant exists
    // for a company teacher, so notes go through a narrow RPC that can only
    // ever touch class_notes.
    const { error } =
      identity?.kind === 'freelance'
        ? await supabase.from('freelance_classes').update({ class_notes: cellNotesDraft }).eq('id', rowId)
        : await supabase.rpc('update_class_notes', { p_class_id: rowId, p_notes: cellNotesDraft })

    setCellNotesSaving(false)

    if (error) {
      setCellMessage({ type: 'error', text: 'Could not save notes. Please try again.' })
      return
    }

    setCellMessage({ type: 'success', text: 'Notes saved.' })
    setCellsReloadToken((n) => n + 1)
  }

  const handleCancelBooking = async (rowId: string, studentId: string) => {
    setCellActionLoading(true)
    setCellMessage(null)

    const { error } =
      identity?.kind === 'freelance'
        ? await supabase.rpc('cancel_freelance_booking', { p_class_id: rowId })
        : await supabase.rpc('cancel_schedule_booking', { p_class_id: rowId })

    setCellActionLoading(false)

    if (error) {
      setCellMessage({ type: 'error', text: 'Could not cancel this booking. Please try again.' })
      return
    }

    setStudents((prev) => prev.map((s) => (s.id === studentId ? { ...s, Credits: (s.Credits ?? 0) + 1 } : s)))
    setCellMessage({ type: 'success', text: 'Booking cancelled.' })
    setCellsReloadToken((n) => n + 1)
  }

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

  // A teacher without self-booking can still mark their own class completed
  // once its scheduled time has passed (compared against "now" in the
  // company's configured timezone) — self-booking always allows it.
  const isClassTimeOver = (row: ClassCell) => {
    const todayKey = toDateKey(today)
    if (row.date < todayKey) return true
    if (row.date > todayKey) return false
    const [h, m] = row.start_time.split(':').map(Number)
    return h * 60 + m <= nowMinutesOfDay
  }

  return (
    <div className="teacher-schedule-page">
      <div className="teacher-schedule-page-header">
        <h1>My Schedule</h1>
      </div>

      {identityLoading || !identity ? (
        <p className="teacher-schedule-loading">Loading…</p>
      ) : (
        <>
          {identity.kind === 'company' && selfProfile && (
            <div className="teacher-schedule-detail-panel">
              <div className="teacher-schedule-detail-header">
                <span className="teacher-schedule-detail-avatar">
                  {selfProfile.photo ? <img src={toDirectImageUrl(selfProfile.photo)} alt="" /> : <GraduationCap size={24} />}
                </span>
                <div>
                  <h2>{identity.name}</h2>
                  <p className="teacher-schedule-detail-subtitle">
                    {identity.email}
                    {selfProfile.Rating != null && (
                      <span className="teacher-schedule-rating-badge">
                        <Star size={11} fill="currentColor" /> {selfProfile.Rating.toFixed(1)}
                      </span>
                    )}
                  </p>
                </div>
              </div>

              <div className="teacher-schedule-detail-body">
                <div className="teacher-schedule-detail-col">
                  {selfProfile.subjects && selfProfile.subjects.length > 0 && (
                    <div className="teacher-schedule-detail-block">
                      <span className="teacher-schedule-field-label">Subjects</span>
                      <div className="teacher-schedule-chip-row">
                        {selfProfile.subjects.map((s) => (
                          <span key={s} className="teacher-schedule-chip">
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="teacher-schedule-detail-block">
                    <span className="teacher-schedule-field-label">Contact</span>
                    <p className="teacher-schedule-contact-line">{selfProfile.phone}</p>
                    {selfProfile.contact?.contacts?.map((c, i) => (
                      <p key={i} className="teacher-schedule-contact-line">
                        <strong>{c.platform}:</strong>{' '}
                        {/^https?:\/\//i.test(c.handle) ? (
                          <a href={c.handle} target="_blank" rel="noreferrer" className="teacher-schedule-contact-link">
                            Open <ExternalLink size={11} />
                          </a>
                        ) : (
                          c.handle
                        )}
                      </p>
                    ))}
                  </div>

                  {selfProfile.intro_message && (
                    <div className="teacher-schedule-detail-block">
                      <span className="teacher-schedule-field-label">Intro</span>
                      <p className="teacher-schedule-intro-message">{selfProfile.intro_message}</p>
                    </div>
                  )}
                </div>

                {selfProfile.intro_video && (
                  <div className="teacher-schedule-detail-col">
                    <span className="teacher-schedule-field-label">Video</span>
                    {(() => {
                      const embed = getVideoEmbed(selfProfile.intro_video)

                      if (embed && videoPlaying) {
                        if (embed.provider === 'file') {
                          return <video className="teacher-schedule-video-player" src={embed.embedUrl} controls autoPlay />
                        }
                        return (
                          <iframe
                            className="teacher-schedule-video-player"
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
                            className="teacher-schedule-video-preview"
                            onClick={() => setVideoPlaying(true)}
                            aria-label="Play video"
                          >
                            {embed.thumbnail ? (
                              <img src={embed.thumbnail} alt="" />
                            ) : (
                              <div className="teacher-schedule-video-placeholder" />
                            )}
                            <span className="teacher-schedule-video-play">
                              <Play size={18} fill="currentColor" />
                            </span>
                          </button>
                        )
                      }

                      return (
                        <a
                          href={selfProfile.intro_video}
                          target="_blank"
                          rel="noreferrer"
                          className="teacher-schedule-video-preview teacher-schedule-video-fallback"
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
          )}

          {identity.kind === 'company' && !identity.selfBookingAllowed && (
            <p className="teacher-schedule-field-help">
              Your school has turned off self-booking. You can view your schedule, but booking changes must go through your admin.
            </p>
          )}

          <div className="teacher-schedule-week-panel">
            <div className="teacher-schedule-week-nav">
              <button type="button" className="teacher-schedule-week-nav-btn" onClick={prevWeek} aria-label="Previous week">
                <ChevronLeft size={16} />
              </button>
              <div className="teacher-schedule-week-nav-center">
                <span className="teacher-schedule-week-label">{weekLabel}</span>
                <button type="button" className="teacher-schedule-today-btn" onClick={goToToday}>
                  Today
                </button>
              </div>
              <button type="button" className="teacher-schedule-week-nav-btn" onClick={nextWeek} aria-label="Next week">
                <ChevronRight size={16} />
              </button>
            </div>

            <div className="teacher-schedule-grid-wrap">
              {weekLoading && <p className="teacher-schedule-grid-loading">Loading…</p>}
              <div className="teacher-schedule-grid" style={{ gridTemplateColumns: `80px repeat(7, minmax(110px, 1fr))` }}>
                <div className="teacher-schedule-grid-corner" />
                {weekDays.map((d) => (
                  <div key={d.toISOString()} className={`teacher-schedule-grid-day-header ${isSameDay(d, today) ? 'is-today' : ''}`}>
                    <span className="teacher-schedule-grid-day-name">{d.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                    <span className="teacher-schedule-grid-day-num">{d.getDate()}</span>
                  </div>
                ))}

                {timeSlots.map((slot, slotIndex) => (
                  <Fragment key={slot.value}>
                    <div className="teacher-schedule-grid-time-label">{slot.label}</div>
                    {weekDays.map((d, dayIndex) => {
                      const dateKey = toDateKey(d)
                      const { state, row } = getCellState(dateKey, slot.value)
                      const student = state === 'booked' && row ? students.find((s) => s.id === row.student_id) : null
                      const showNowLine = dayIndex === todayIndexInWeek && slotIndex === nowSlotIndex
                      return (
                        <button
                          key={`${dateKey}_${slot.value}`}
                          type="button"
                          className={`teacher-schedule-cell is-${state}`}
                          onClick={() => openCellPopup(dateKey, slot.value)}
                        >
                          {state === 'booked' && (student?.name.split(' ')[0] ?? 'Booked')}
                          {showNowLine && (
                            <span className="teacher-schedule-now-line" style={{ top: `${nowFraction * 100}%` }}>
                              <span className="teacher-schedule-now-dot" />
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
        <div className="teacher-schedule-modal-overlay" onClick={closeCellPopup}>
          <div className="teacher-schedule-cell-modal" onClick={(e) => e.stopPropagation()}>
            <button className="teacher-schedule-modal-close" aria-label="Close" onClick={closeCellPopup}>
              <X size={18} />
            </button>

            <div className="teacher-schedule-cell-modal-header">
              <h2>{formatCellDate(selectedCell.date)}</h2>
              <p className="teacher-schedule-cell-modal-time">{formatTimeLabel(selectedCell.startTime)}</p>
              <span
                className={`teacher-schedule-cell-status-badge is-${
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
              <div className="teacher-schedule-booked-info">
                <button
                  type="button"
                  className="teacher-schedule-student-row"
                  onClick={() => setExpandedStudentId((id) => (id === bookedStudent.id ? null : bookedStudent.id))}
                >
                  <span className="teacher-schedule-student-name">
                    <Backpack size={14} /> {bookedStudent.name}
                  </span>
                  <span className="teacher-schedule-student-meta">{bookedStudent.student_code}</span>
                </button>

                {expandedStudentId === bookedStudent.id && <StudentDetailLines student={bookedStudent} />}

                {selectedCellInfo.row.class_details &&
                  (selectedCellInfo.row.class_details.subject || selectedCellInfo.row.class_details.book_label) && (
                    <div className="teacher-schedule-class-details">
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

                <div className="teacher-schedule-notes-section">
                  <span className="teacher-schedule-field-label">Class Notes</span>
                  <textarea
                    className="teacher-schedule-notes-input"
                    value={cellNotesDraft}
                    onChange={(e) => setCellNotesDraft(e.target.value)}
                    rows={5}
                    placeholder="Add notes about this class…"
                  />
                  <button
                    type="button"
                    className="teacher-schedule-toggle-btn"
                    onClick={() => handleSaveNotes(selectedCellInfo.row!.id)}
                    disabled={cellNotesSaving || cellNotesDraft === (selectedCellInfo.row.class_notes ?? '')}
                  >
                    {cellNotesSaving ? 'Saving…' : 'Save Notes'}
                  </button>
                </div>

                <div className="teacher-schedule-booked-actions">
                  {selectedCellInfo.row.Status !== 'Completed' && isClassTimeOver(selectedCellInfo.row) && (
                    <button
                      type="button"
                      className="teacher-schedule-toggle-btn"
                      onClick={() => handleMarkCompleted(selectedCellInfo.row!.id)}
                      disabled={cellActionLoading}
                    >
                      {cellActionLoading ? 'Saving…' : 'Mark as Completed'}
                    </button>
                  )}
                  {selectedCellInfo.row.Status !== 'Completed' && !isClassTimeOver(selectedCellInfo.row) && (
                    <p className="teacher-schedule-field-help">
                      You can mark this completed once its scheduled time has passed.
                    </p>
                  )}
                  {canBookOrCancel ? (
                    <button
                      type="button"
                      className="btn btn-primary teacher-schedule-cancel-btn"
                      onClick={() => handleCancelBooking(selectedCellInfo.row!.id, bookedStudent.id)}
                      disabled={cellActionLoading}
                    >
                      {cellActionLoading ? 'Cancelling…' : 'Cancel Booking'}
                    </button>
                  ) : (
                    <p className="teacher-schedule-field-help">Canceling a booking requires your admin.</p>
                  )}
                </div>
              </div>
            ) : (
              <>
                {selectedCellInfo.state === 'closed' || canBookOrCancel ? (
                  <button
                    type="button"
                    className="teacher-schedule-toggle-btn"
                    onClick={() =>
                      selectedCellInfo.state === 'closed' ? handleMarkOpen() : handleMarkClosed(selectedCellInfo.row!.id)
                    }
                    disabled={cellActionLoading}
                  >
                    {selectedCellInfo.state === 'closed' ? 'Mark as Open' : 'Mark as Closed'}
                  </button>
                ) : (
                  <p className="teacher-schedule-field-help">Closing this slot requires your admin.</p>
                )}

                {!canBookOrCancel && (
                  <p className="teacher-schedule-field-help">
                    Booking a student requires your admin — but you can still open your free slots.
                  </p>
                )}

                {canBookOrCancel && (
                <div className="teacher-schedule-book-section">
                  <span className="teacher-schedule-field-label">Book a Student</span>
                  <div className="teacher-schedule-search-box">
                    <Search size={14} />
                    <input
                      type="text"
                      className="teacher-schedule-search-input"
                      value={cellStudentSearch}
                      onChange={(e) => setCellStudentSearch(e.target.value)}
                      placeholder="Search by name, email, or code…"
                      autoComplete="off"
                    />
                  </div>
                  <div className="teacher-schedule-student-list">
                    {filteredStudents.length === 0 ? (
                      <p className="teacher-schedule-field-help">No students match.</p>
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
                          <div key={s.id} className="teacher-schedule-student-item">
                            <button type="button" className="teacher-schedule-student-row" onClick={() => expandStudent(s)}>
                              <span className="teacher-schedule-student-name">{s.name}</span>
                              <span className="teacher-schedule-student-meta">
                                {s.student_code} · {credits} credit{credits === 1 ? '' : 's'}
                              </span>
                            </button>

                            {expanded && (
                              <>
                                <StudentDetailLines student={s} />

                                {(subjectOptions.length > 0 || bookOptions.length > 0) && (
                                  <div className="teacher-schedule-booking-choice">
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
                                  className="btn btn-primary teacher-schedule-book-confirm-btn"
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
                )}
              </>
            )}

            {cellMessage && <p className={`teacher-schedule-message is-${cellMessage.type}`}>{cellMessage.text}</p>}

            <div className="teacher-schedule-modal-footer">
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
