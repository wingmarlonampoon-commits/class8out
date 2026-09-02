import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Backpack,
  BookOpen,
  Calendar,
  CalendarCheck,
  CalendarClock,
  ExternalLink,
  FileText,
  Search,
  Star,
  Video,
  X,
} from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useTeacherIdentity } from '../../hooks/useTeacherIdentity'
import './Bookings.css'

type BookingStatus = 'booked' | 'open'
type StatusFilter = 'all' | BookingStatus

type ClassDetails = { subject: string | null; book_id: string | null; book_label: string | null }

type BookingRow = {
  id: string
  date: string
  start_time: string
  Status: 'Booked' | 'Completed'
  class_details: ClassDetails | null
  class_notes: string | null
  class_recording: string | null
  teacher_rating: number | null
  student: { id: string; name: string; student_code: string; email: string | null } | null
}

const pad2 = (n: number) => String(n).padStart(2, '0')

const toDateKey = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`

const getMonthRange = (d: Date) => {
  const start = new Date(d.getFullYear(), d.getMonth(), 1)
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  return { from: toDateKey(start), to: toDateKey(end) }
}

const formatDateLabel = (dateKey: string) => {
  const [y, m, d] = dateKey.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

const formatTimeLabel = (startTime: string) => {
  const [hStr, mStr] = startTime.split(':')
  const h24 = Number(hStr)
  const period = h24 < 12 ? 'AM' : 'PM'
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${mStr} ${period}`
}

const getDisplayStatus = (b: BookingRow): 'Open' | 'Booked' | 'Completed' => {
  if (!b.student) return 'Open'
  return b.Status === 'Completed' ? 'Completed' : 'Booked'
}

function Bookings() {
  const { identity } = useTeacherIdentity()

  const [bookings, setBookings] = useState<BookingRow[]>([])
  const [loading, setLoading] = useState(true)

  const [searchParams] = useSearchParams()
  const defaultRange = useMemo(() => getMonthRange(new Date()), [])
  const [dateFrom, setDateFrom] = useState(() => searchParams.get('from') ?? defaultRange.from)
  const [dateTo, setDateTo] = useState(() => searchParams.get('to') ?? defaultRange.to)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() => {
    const s = searchParams.get('status')
    return s === 'booked' || s === 'open' ? s : 'all'
  })
  const [studentSearch, setStudentSearch] = useState('')
  const [selectedBooking, setSelectedBooking] = useState<BookingRow | null>(null)

  useEffect(() => {
    if (!identity) return

    setLoading(true)

    let query =
      identity.kind === 'freelance'
        ? supabase
            .from('freelance_classes')
            .select(
              'id, date, start_time, "Status", class_details, class_notes, class_recording, teacher_rating, student:freelance_students(id, name, student_code, email)',
            )
            .eq('teacher_id', identity.teacherId)
        : supabase
            .from('classes')
            .select(
              'id, date, start_time, "Status", class_details, class_notes, class_recording, teacher_rating, student:student_lists(id, name, student_code, email)',
            )
            .eq('teacher_id', identity.teacherId)

    query = query.order('date', { ascending: true }).order('start_time', { ascending: true })

    if (dateFrom) query = query.gte('date', dateFrom)
    if (dateTo) query = query.lte('date', dateTo)

    query.then(({ data }) => {
      setBookings((data as unknown as BookingRow[]) ?? [])
      setLoading(false)
    })
  }, [identity, dateFrom, dateTo])

  const filteredBookings = bookings.filter((b) => {
    if (statusFilter !== 'all') {
      const status: BookingStatus = b.student ? 'booked' : 'open'
      if (status !== statusFilter) return false
    }

    const q = studentSearch.trim().toLowerCase()
    if (q) {
      const matches = b.student && (b.student.name.toLowerCase().includes(q) || (b.student.email ?? '').toLowerCase().includes(q))
      if (!matches) return false
    }

    return true
  })

  const bookedCount = bookings.filter((b) => b.student).length
  const openCount = bookings.length - bookedCount

  const clearDateRange = () => {
    setDateFrom('')
    setDateTo('')
  }

  const resetToThisMonth = () => {
    const range = getMonthRange(new Date())
    setDateFrom(range.from)
    setDateTo(range.to)
  }

  return (
    <div className="teacher-bookings-page">
      <div className="teacher-bookings-page-header">
        <h1>My Bookings</h1>
      </div>

      <div className="teacher-bookings-stats-grid">
        <div className="teacher-bookings-stat-card" style={{ '--accent': '#1447e6' } as CSSProperties}>
          <Calendar className="teacher-bookings-stat-watermark" size={64} strokeWidth={1.5} />
          <span className="teacher-bookings-stat-icon">
            <Calendar size={16} />
          </span>
          <p className="teacher-bookings-stat-value">{loading ? '—' : bookings.length}</p>
          <span className="teacher-bookings-stat-label">Total Classes</span>
        </div>

        <div className="teacher-bookings-stat-card" style={{ '--accent': '#1fa971' } as CSSProperties}>
          <CalendarCheck className="teacher-bookings-stat-watermark" size={64} strokeWidth={1.5} />
          <span className="teacher-bookings-stat-icon">
            <CalendarCheck size={16} />
          </span>
          <p className="teacher-bookings-stat-value">{loading ? '—' : bookedCount}</p>
          <span className="teacher-bookings-stat-label">Booked</span>
        </div>

        <div className="teacher-bookings-stat-card" style={{ '--accent': '#f5a524' } as CSSProperties}>
          <CalendarClock className="teacher-bookings-stat-watermark" size={64} strokeWidth={1.5} />
          <span className="teacher-bookings-stat-icon">
            <CalendarClock size={16} />
          </span>
          <p className="teacher-bookings-stat-value">{loading ? '—' : openCount}</p>
          <span className="teacher-bookings-stat-label">Open (Not Yet Booked)</span>
        </div>
      </div>

      <div className="teacher-bookings-list-panel">
        <div className="teacher-bookings-filters">
          <div className="teacher-bookings-filters-left">
            <div className="teacher-bookings-tab-toggle">
              <button
                type="button"
                className={`teacher-bookings-tab ${statusFilter === 'all' ? 'is-active' : ''}`}
                onClick={() => setStatusFilter('all')}
              >
                All
              </button>
              <button
                type="button"
                className={`teacher-bookings-tab ${statusFilter === 'booked' ? 'is-active' : ''}`}
                onClick={() => setStatusFilter('booked')}
              >
                Booked
              </button>
              <button
                type="button"
                className={`teacher-bookings-tab ${statusFilter === 'open' ? 'is-active' : ''}`}
                onClick={() => setStatusFilter('open')}
              >
                Open
              </button>
            </div>

            <div className="teacher-bookings-search-box">
              <Search size={14} />
              <input
                type="text"
                className="teacher-bookings-search-input"
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                placeholder="Search student by name or email…"
                autoComplete="off"
              />
            </div>
          </div>

          <div className="teacher-bookings-date-range">
            <label>
              From
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </label>
            <label>
              To
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </label>
            <button type="button" className="teacher-bookings-range-btn" onClick={resetToThisMonth}>
              This Month
            </button>
            {(dateFrom || dateTo) && (
              <button type="button" className="teacher-bookings-range-clear" onClick={clearDateRange} aria-label="Clear date range">
                <X size={14} /> Clear
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <p className="teacher-bookings-loading">Loading…</p>
        ) : filteredBookings.length === 0 ? (
          <div className="teacher-bookings-empty">
            <Calendar size={22} />
            <p>No classes match these filters.</p>
          </div>
        ) : (
          <div className="teacher-bookings-table-wrap">
            <table className="teacher-bookings-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Student</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredBookings.map((b) => (
                  <tr key={b.id} className="teacher-bookings-row-clickable" onClick={() => setSelectedBooking(b)}>
                    <td>{formatDateLabel(b.date)}</td>
                    <td>{formatTimeLabel(b.start_time)}</td>
                    <td>
                      {b.student ? (
                        <>
                          <span className="teacher-bookings-row-avatar teacher-bookings-row-avatar-student">
                            <Backpack size={13} />
                          </span>
                          {b.student.name}
                          <span className="teacher-bookings-row-sub"> · {b.student.student_code}</span>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <span className={`teacher-bookings-status-badge is-${getDisplayStatus(b).toLowerCase()}`}>
                        {getDisplayStatus(b)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedBooking && (
        <div className="teacher-bookings-modal-overlay" onClick={() => setSelectedBooking(null)}>
          <div className="teacher-bookings-detail-modal" onClick={(e) => e.stopPropagation()}>
            <button className="teacher-bookings-modal-close" aria-label="Close" onClick={() => setSelectedBooking(null)}>
              <X size={18} />
            </button>

            <div className="teacher-bookings-detail-header">
              <h2>{formatDateLabel(selectedBooking.date)}</h2>
              <p className="teacher-bookings-detail-time">{formatTimeLabel(selectedBooking.start_time)}</p>
              <span className={`teacher-bookings-status-badge is-${getDisplayStatus(selectedBooking).toLowerCase()}`}>
                {getDisplayStatus(selectedBooking)}
              </span>
            </div>

            <div className="teacher-bookings-detail-grid">
              <div className="teacher-bookings-detail-block">
                <span className="teacher-bookings-detail-label">
                  <Backpack size={13} /> Student
                </span>
                {selectedBooking.student ? (
                  <>
                    <p>{selectedBooking.student.name}</p>
                    <p className="teacher-bookings-detail-sub">
                      {selectedBooking.student.email ?? '—'} · {selectedBooking.student.student_code}
                    </p>
                  </>
                ) : (
                  <p className="teacher-bookings-detail-empty">Not booked yet</p>
                )}
              </div>

              <div className="teacher-bookings-detail-block">
                <span className="teacher-bookings-detail-label">
                  <BookOpen size={13} /> Subject
                </span>
                <p>{selectedBooking.class_details?.subject ?? '—'}</p>
              </div>

              <div className="teacher-bookings-detail-block">
                <span className="teacher-bookings-detail-label">
                  <BookOpen size={13} /> Book
                </span>
                <p>{selectedBooking.class_details?.book_label ?? '—'}</p>
              </div>

              {selectedBooking.teacher_rating != null && (
                <div className="teacher-bookings-detail-block">
                  <span className="teacher-bookings-detail-label">
                    <Star size={13} /> Rating
                  </span>
                  <p>{selectedBooking.teacher_rating.toFixed(1)} / 5</p>
                </div>
              )}
            </div>

            <div className="teacher-bookings-detail-block">
              <span className="teacher-bookings-detail-label">
                <FileText size={13} /> Class Notes
              </span>
              {selectedBooking.class_notes ? (
                <p className="teacher-bookings-detail-notes">{selectedBooking.class_notes}</p>
              ) : (
                <p className="teacher-bookings-detail-empty">No notes yet.</p>
              )}
            </div>

            <div className="teacher-bookings-detail-block">
              <span className="teacher-bookings-detail-label">
                <Video size={13} /> Class Recording
              </span>
              {selectedBooking.class_recording ? (
                /^https?:\/\//i.test(selectedBooking.class_recording) ? (
                  <a href={selectedBooking.class_recording} target="_blank" rel="noreferrer" className="teacher-bookings-detail-link">
                    Open Recording <ExternalLink size={12} />
                  </a>
                ) : (
                  <p>{selectedBooking.class_recording}</p>
                )
              ) : (
                <p className="teacher-bookings-detail-empty">No recording yet.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Bookings
