import { Fragment, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, ExternalLink, GraduationCap, Info, Play, Star, X } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useStudentIdentity } from '../../hooks/useStudentIdentity'
import { toDirectImageUrl, getVideoEmbed } from '../../lib/mediaEmbeds'
import { getZonedNow } from '../../lib/companyTime'
import './Teachers.css'

type ContactEntry = { platform: string; handle: string }

type TeacherOption = {
  id: string
  name: string
  email: string
  photo: string | null
  subjects: string[] | null
  Rating: number | null
  intro_video: string | null
  intro_message: string | null
}

type BookOption = { id: string; subject: string; category: string }

type ClassDetails = { subject: string | null; book_id: string | null; book_label: string | null }

type ClassCell = {
  id: string
  student_id: string | null
  date: string
  start_time: string
  Status: 'Booked' | 'Completed'
  class_details: ClassDetails | null
}

type CellState = 'closed' | 'open' | 'mine' | 'other'

type Message = { type: 'success' | 'error'; text: string }

const RPC_ERROR_MESSAGES: Record<string, string> = {
  TEACHER_NOT_FOUND: 'Could not find that teacher.',
  NOT_AUTHORIZED: 'Not authorized.',
  STUDENT_NOT_FOUND: 'Could not find your student record.',
  STUDENT_WRONG_COMPANY: 'That teacher belongs to a different company.',
  STUDENT_NOT_YOURS: "You aren't this teacher's student.",
  INSUFFICIENT_CREDITS: 'You have no class credits left.',
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

function Teachers() {
  const { identity, loading: identityLoading } = useStudentIdentity()

  const [teachers, setTeachers] = useState<TeacherOption[]>([])
  const [teachersLoading, setTeachersLoading] = useState(true)
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null)

  const [availableBooks, setAvailableBooks] = useState<BookOption[]>([])
  const [credits, setCredits] = useState<number | null>(null)

  const [weekStart, setWeekStart] = useState(() => getStartOfWeek(new Date()))
  const [weekCells, setWeekCells] = useState<Map<string, ClassCell>>(new Map())
  const [weekLoading, setWeekLoading] = useState(false)
  const [cellsReloadToken, setCellsReloadToken] = useState(0)

  const [selectedCell, setSelectedCell] = useState<{ date: string; startTime: string } | null>(null)
  const [cellActionLoading, setCellActionLoading] = useState(false)
  const [cellMessage, setCellMessage] = useState<Message | null>(null)
  const [cellSubject, setCellSubject] = useState('')
  const [cellBookId, setCellBookId] = useState('')
  const [videoPlaying, setVideoPlaying] = useState(false)

  const classesTable = identity?.kind === 'freelance' ? 'freelance_classes' : 'classes'
  const activeTeacherId = identity?.kind === 'freelance' ? identity.teacherId : selectedTeacherId

  useEffect(() => {
    if (identity?.Credits !== undefined) setCredits(identity?.Credits ?? null)
  }, [identity])

  useEffect(() => {
    if (!identity || identity.kind !== 'company') return

    setTeachersLoading(true)
    supabase
      .from('company_organizational_chart')
      .select('id, name, email, photo, subjects, "Rating", intro_video, intro_message')
      .eq('company_code', identity.companyCode)
      .eq('employee_type', 'Teacher')
      .order('name', { ascending: true })
      .then(({ data }) => {
        setTeachers((data as TeacherOption[]) ?? [])
        setTeachersLoading(false)
      })
  }, [identity])

  useEffect(() => {
    if (!identity) return

    if (identity.kind === 'freelance') {
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
    if (!identity || !activeTeacherId) {
      setWeekCells(new Map())
      return
    }

    setWeekLoading(true)
    const days = getWeekDays(weekStart)
    const startKey = toDateKey(days[0])
    const endKey = toDateKey(days[6])

    supabase
      .from(classesTable)
      .select('id, student_id, date, start_time, "Status", class_details')
      .eq('teacher_id', activeTeacherId)
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
  }, [identity, activeTeacherId, weekStart, cellsReloadToken, classesTable])

  // Drives the "now" line: re-evaluate the current time once a minute.
  const [nowTick, setNowTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setNowTick((n) => n + 1), 60000)
    return () => clearInterval(id)
  }, [])

  const intervalMinutes = identity
    ? (identity.kind === 'company' ? identity.companySettings.time_interval : identity.teacherSettings.time_interval) === '60'
      ? 60
      : 30
    : 30
  const timeSlots = useMemo(() => getTimeSlots(intervalMinutes), [intervalMinutes])
  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart])

  const timezone = identity ? (identity.kind === 'company' ? identity.companySettings.timezone : identity.teacherSettings.timezone) : 'Asia/Manila'
  // nowTick (bumped every 60s) forces this render to recompute — the value itself isn't read here.
  void nowTick
  const today = getZonedNow(timezone)
  const todayIndexInWeek = weekDays.findIndex((d) => isSameDay(d, today))
  const nowMinutesOfDay = today.getHours() * 60 + today.getMinutes()
  const nowSlotIndex = Math.floor(nowMinutesOfDay / intervalMinutes)
  const nowFraction = (nowMinutesOfDay % intervalMinutes) / intervalMinutes

  const weekLabel =
    weekDays[0].getMonth() === weekDays[6].getMonth()
      ? `${weekDays[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${weekDays[6].toLocaleDateString('en-US', { day: 'numeric', year: 'numeric' })}`
      : `${weekDays[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${weekDays[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`

  const selectedTeacher = teachers.find((t) => t.id === selectedTeacherId) ?? null

  // Contact details (platform-based, e.g. Skype/Zoom) are only shown for a
  // freelance student viewing their own teacher — a company student never
  // sees an individual teacher's personal contact info, only their
  // company's own official contact (shown on the Credit page instead).
  const profile =
    identity?.kind === 'freelance'
      ? {
          name: identity.teacherName,
          photo: identity.teacherPhoto ?? null,
          Rating: identity.teacherRating,
          subjects: identity.teacherSubjects,
          contacts: identity.teacherContact?.contacts ?? ([] as ContactEntry[]),
          intro_message: identity.teacherIntroMessage,
          intro_video: identity.teacherIntroVideo,
        }
      : selectedTeacher
        ? {
            name: selectedTeacher.name,
            photo: selectedTeacher.photo,
            Rating: selectedTeacher.Rating,
            subjects: selectedTeacher.subjects,
            contacts: [] as ContactEntry[],
            intro_message: selectedTeacher.intro_message,
            intro_video: selectedTeacher.intro_video,
          }
        : null

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

  const selectTeacher = (id: string) => {
    setSelectedTeacherId(id)
    setWeekStart(getStartOfWeek(new Date()))
    setVideoPlaying(false)
  }

  const getCellState = (dateKey: string, startTime: string): { state: CellState; row: ClassCell | null } => {
    const row = weekCells.get(`${dateKey}_${startTime}`) ?? null
    if (!row) return { state: 'closed', row: null }
    if (!row.student_id) return { state: 'open', row }
    if (identity && row.student_id === identity.studentId) return { state: 'mine', row }
    return { state: 'other', row }
  }

  const openCellPopup = (dateKey: string, startTime: string) => {
    setSelectedCell({ date: dateKey, startTime })
    setCellMessage(null)
    const subjects = identity?.subject ?? []
    setCellSubject(subjects.length === 1 ? subjects[0] : '')
    const bookIds = (identity?.books ?? []).filter((id) => availableBooks.some((b) => b.id === id))
    setCellBookId(bookIds.length === 1 ? bookIds[0] : '')
  }

  const closeCellPopup = () => setSelectedCell(null)

  const handleBookSlot = async () => {
    if (!selectedCell || !identity || !activeTeacherId) return
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
            p_student_id: identity.studentId,
            p_class_details: classDetails,
          })
        : await supabase.rpc('book_schedule_slot', {
            p_teacher_id: activeTeacherId,
            p_date: selectedCell.date,
            p_start_time: selectedCell.startTime,
            p_student_id: identity.studentId,
            p_class_details: classDetails,
          })

    setCellActionLoading(false)

    if (error) {
      setCellMessage({ type: 'error', text: RPC_ERROR_MESSAGES[error.message] ?? 'Could not book this slot. Please try again.' })
      return
    }

    setCredits((c) => (c ?? 0) - 1)
    setCellMessage({ type: 'success', text: 'Class booked.' })
    setCellsReloadToken((n) => n + 1)
  }

  const handleCancelBooking = async (rowId: string) => {
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

    setCredits((c) => (c ?? 0) + 1)
    setCellMessage({ type: 'success', text: 'Booking cancelled.' })
    setCellsReloadToken((n) => n + 1)
  }

  const selectedCellInfo = selectedCell ? getCellState(selectedCell.date, selectedCell.startTime) : null

  const subjectOptions = identity?.subject ?? []
  const bookOptions = (identity?.books ?? [])
    .map((id) => availableBooks.find((b) => b.id === id))
    .filter((b): b is BookOption => Boolean(b))
  const needsSubject = subjectOptions.length > 0 && !cellSubject
  const needsBook = bookOptions.length > 0 && !cellBookId
  const noCredits = (credits ?? 0) < 1

  return (
    <div className="student-teachers-page">
      <div className="student-teachers-page-header">
        <h1>Teachers</h1>
      </div>

      {identityLoading || !identity ? (
        <p className="student-teachers-loading">Loading…</p>
      ) : (
        <>
          {identity.kind === 'company' && (
            <div className="student-teachers-picker-panel">
              <h2 className="student-teachers-picker-heading">Select a Teacher</h2>

              {teachersLoading ? (
                <p className="student-teachers-picker-loading">Loading…</p>
              ) : teachers.length === 0 ? (
                <div className="student-teachers-picker-empty">
                  <GraduationCap size={22} />
                  <p>No teachers available yet.</p>
                </div>
              ) : (
                <div className="student-teachers-picker-grid">
                  {teachers.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={`student-teachers-picker-card ${t.id === selectedTeacherId ? 'is-selected' : ''}`}
                      onClick={() => selectTeacher(t.id)}
                    >
                      <span className="student-teachers-picker-avatar">
                        {t.photo ? (
                          <img src={toDirectImageUrl(t.photo)} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} />
                        ) : (
                          <GraduationCap size={20} />
                        )}
                      </span>
                      <span className="student-teachers-picker-name">{t.name}</span>
                      {t.subjects && t.subjects.length > 0 && (
                        <span className="student-teachers-picker-subjects">
                          {t.subjects.slice(0, 2).join(', ')}
                          {t.subjects.length > 2 && ` +${t.subjects.length - 2}`}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTeacherId && profile && (
            <div className="student-teachers-detail-panel">
              <div className="student-teachers-detail-header">
                <span className="student-teachers-detail-avatar">
                  {profile.photo ? (
                    <img src={toDirectImageUrl(profile.photo)} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} />
                  ) : (
                    <GraduationCap size={24} />
                  )}
                </span>
                <div>
                  <h2>{profile.name}</h2>
                  <p className="student-teachers-detail-subtitle">
                    {profile.Rating != null && (
                      <span className="student-teachers-rating-badge">
                        <Star size={11} fill="currentColor" /> {profile.Rating.toFixed(1)}
                      </span>
                    )}
                  </p>
                </div>
              </div>

              <div className="student-teachers-detail-body">
                <div className="student-teachers-detail-col">
                  {profile.subjects && profile.subjects.length > 0 && (
                    <div className="student-teachers-detail-block">
                      <span className="student-teachers-field-label">Subjects</span>
                      <div className="student-teachers-chip-row">
                        {profile.subjects.map((s) => (
                          <span key={s} className="student-teachers-chip">
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {identity?.kind === 'freelance' && profile.contacts.length > 0 && (
                    <div className="student-teachers-detail-block">
                      <span className="student-teachers-field-label">Contact</span>
                      {profile.contacts.map((c, i) => (
                        <p key={i} className="student-teachers-contact-line">
                          <strong>{c.platform}:</strong>{' '}
                          {/^https?:\/\//i.test(c.handle) ? (
                            <a href={c.handle} target="_blank" rel="noreferrer" className="student-teachers-contact-link">
                              Open <ExternalLink size={11} />
                            </a>
                          ) : (
                            c.handle
                          )}
                        </p>
                      ))}
                    </div>
                  )}

                  {profile.intro_message && (
                    <div className="student-teachers-detail-block">
                      <span className="student-teachers-field-label">Intro</span>
                      <p className="student-teachers-intro-message">{profile.intro_message}</p>
                    </div>
                  )}
                </div>

                {profile.intro_video && (
                  <div className="student-teachers-detail-col">
                    <span className="student-teachers-field-label">Video</span>
                    {(() => {
                      const embed = getVideoEmbed(profile.intro_video)

                      if (embed && videoPlaying) {
                        if (embed.provider === 'file') {
                          return <video className="student-teachers-video-player" src={embed.embedUrl} controls autoPlay />
                        }
                        return (
                          <iframe
                            className="student-teachers-video-player"
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
                            className="student-teachers-video-preview"
                            onClick={() => setVideoPlaying(true)}
                            aria-label="Play video"
                          >
                            {embed.thumbnail ? (
                              <img src={embed.thumbnail} alt="" />
                            ) : (
                              <div className="student-teachers-video-placeholder" />
                            )}
                            <span className="student-teachers-video-play">
                              <Play size={18} fill="currentColor" />
                            </span>
                          </button>
                        )
                      }

                      return (
                        <a
                          href={profile.intro_video}
                          target="_blank"
                          rel="noreferrer"
                          className="student-teachers-video-preview student-teachers-video-fallback"
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

          {activeTeacherId && (
            <div className="student-teachers-week-panel">
              <div className="student-teachers-week-nav">
                <button type="button" className="student-teachers-week-nav-btn" onClick={prevWeek} aria-label="Previous week">
                  <ChevronLeft size={16} />
                </button>
                <div className="student-teachers-week-nav-center">
                  <span className="student-teachers-week-label">{weekLabel}</span>
                  <button type="button" className="student-teachers-today-btn" onClick={goToToday}>
                    Today
                  </button>
                </div>
                <button type="button" className="student-teachers-week-nav-btn" onClick={nextWeek} aria-label="Next week">
                  <ChevronRight size={16} />
                </button>
              </div>

              <div className="student-teachers-grid-wrap">
                {weekLoading && <p className="student-teachers-grid-loading">Loading…</p>}
                <div className="student-teachers-grid" style={{ gridTemplateColumns: `80px repeat(7, minmax(110px, 1fr))` }}>
                  <div className="student-teachers-grid-corner" />
                  {weekDays.map((d) => (
                    <div key={d.toISOString()} className={`student-teachers-grid-day-header ${isSameDay(d, today) ? 'is-today' : ''}`}>
                      <span className="student-teachers-grid-day-name">{d.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                      <span className="student-teachers-grid-day-num">{d.getDate()}</span>
                    </div>
                  ))}

                  {timeSlots.map((slot, slotIndex) => (
                    <Fragment key={slot.value}>
                      <div className="student-teachers-grid-time-label">{slot.label}</div>
                      {weekDays.map((d, dayIndex) => {
                        const dateKey = toDateKey(d)
                        const { state } = getCellState(dateKey, slot.value)
                        const showNowLine = dayIndex === todayIndexInWeek && slotIndex === nowSlotIndex
                        return (
                          <button
                            key={`${dateKey}_${slot.value}`}
                            type="button"
                            className={`student-teachers-cell is-${state === 'mine' || state === 'other' ? 'booked' : state}`}
                            onClick={() => openCellPopup(dateKey, slot.value)}
                          >
                            {state === 'mine' && 'My Class'}
                            {state === 'other' && 'Booked'}
                            {showNowLine && (
                              <span className="student-teachers-now-line" style={{ top: `${nowFraction * 100}%` }}>
                                <span className="student-teachers-now-dot" />
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
          )}
        </>
      )}

      {selectedCell && selectedCellInfo && (
        <div className="student-teachers-modal-overlay" onClick={closeCellPopup}>
          <div className="student-teachers-cell-modal" onClick={(e) => e.stopPropagation()}>
            <button className="student-teachers-modal-close" aria-label="Close" onClick={closeCellPopup}>
              <X size={18} />
            </button>

            <div className="student-teachers-cell-modal-header">
              <h2>{formatCellDate(selectedCell.date)}</h2>
              <p className="student-teachers-cell-modal-time">{formatTimeLabel(selectedCell.startTime)}</p>
              <span
                className={`student-teachers-cell-status-badge is-${
                  selectedCellInfo.state === 'mine' && selectedCellInfo.row?.Status === 'Completed' ? 'completed' : selectedCellInfo.state
                }`}
              >
                {selectedCellInfo.state === 'closed'
                  ? 'Not Available'
                  : selectedCellInfo.state === 'open'
                    ? 'Open'
                    : selectedCellInfo.state === 'other'
                      ? 'Booked'
                      : selectedCellInfo.row?.Status === 'Completed'
                        ? 'Completed'
                        : 'Booked'}
              </span>
            </div>

            {selectedCellInfo.state === 'closed' && <p className="student-teachers-field-help">This teacher hasn't opened this time slot yet.</p>}

            {selectedCellInfo.state === 'other' && <p className="student-teachers-field-help">This slot is already booked by another student.</p>}

            {selectedCellInfo.state === 'mine' && selectedCellInfo.row && (
              <div className="student-teachers-booked-info">
                {selectedCellInfo.row.class_details && (selectedCellInfo.row.class_details.subject || selectedCellInfo.row.class_details.book_label) && (
                  <div className="student-teachers-class-details">
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

                {selectedCellInfo.row.Status !== 'Completed' && (
                  <button
                    type="button"
                    className="btn btn-primary student-teachers-cancel-btn"
                    onClick={() => handleCancelBooking(selectedCellInfo.row!.id)}
                    disabled={cellActionLoading}
                  >
                    {cellActionLoading ? 'Cancelling…' : 'Cancel Booking'}
                  </button>
                )}
              </div>
            )}

            {selectedCellInfo.state === 'open' && (
              <div className="student-teachers-book-section">
                {(subjectOptions.length > 0 || bookOptions.length > 0) && (
                  <div className="student-teachers-booking-choice">
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

                <p className="student-teachers-field-help">You have {credits ?? 0} class credit{(credits ?? 0) === 1 ? '' : 's'} left.</p>

                <button
                  type="button"
                  className="btn btn-primary student-teachers-book-confirm-btn"
                  disabled={noCredits || cellActionLoading || needsSubject || needsBook}
                  onClick={handleBookSlot}
                >
                  {noCredits
                    ? 'No Credits Left'
                    : cellActionLoading
                      ? 'Booking…'
                      : needsSubject || needsBook
                        ? 'Select Subject & Book'
                        : 'Book This Slot'}
                </button>
              </div>
            )}

            {cellMessage && <p className={`student-teachers-message is-${cellMessage.type}`}>{cellMessage.text}</p>}

            <div className="student-teachers-modal-footer">
              <Info size={12} />
              <span>Booking spends 1 class credit; canceling refunds it.</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Teachers