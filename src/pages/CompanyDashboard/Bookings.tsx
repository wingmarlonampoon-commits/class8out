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
  GraduationCap,
  Search,
  Star,
  Video,
  X,
} from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/useAuth'
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
  teacher: { id: string; name: string; email: string } | null
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
  const { session } = useAuth()
  const [companyCode, setCompanyCode] = useState<string | null>(null)

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
  const [teacherSearch, setTeacherSearch] = useState('')
  const [selectedBooking, setSelectedBooking] = useState<BookingRow | null>(null)

  useEffect(() => {
    const adminEmail = session?.user.email
    if (!adminEmail) return

    supabase
      .from('company_registration')
      .select('CompanyCode')
      .eq('email', adminEmail)
      .single()
      .then(({ data }) => {
        if (data) setCompanyCode(data.CompanyCode)
      })
  }, [session])

  useEffect(() => {
    if (!companyCode) return

    setLoading(true)
    let query = supabase
      .from('classes')
      .select(
        'id, date, start_time, "Status", class_details, class_notes, class_recording, teacher_rating, teacher:company_organizational_chart(id, name, email), student:student_lists(id, name, student_code, email)',
      )
      .eq('company_code', companyCode)
      .order('date', { ascending: true })
      .order('start_time', { ascending: true })

    if (dateFrom) query = query.gte('date', dateFrom)
    if (dateTo) query = query.lte('date', dateTo)

    query.then(({ data }) => {
      setBookings((data as unknown as BookingRow[]) ?? [])
      setLoading(false)
    })
  }, [companyCode, dateFrom, dateTo])

  const filteredBookings = bookings.filter((b) => {
    if (statusFilter !== 'all') {
      const status: BookingStatus = b.student ? 'booked' : 'open'
      if (status !== statusFilter) return false
    }

    const q = teacherSearch.trim().toLowerCase()
    if (q) {
      const matches = b.teacher && (b.teacher.name.toLowerCase().includes(q) || b.teacher.email.toLowerCase().includes(q))
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
    <div className="bookings-page">
      <div className="bookings-page-header">
        <h1>Bookings</h1>
      </div>

      <div className="bookings-stats-grid">
        <div className="bookings-stat-card" style={{ '--accent': '#1447e6' } as CSSProperties}>
          <Calendar className="bookings-stat-watermark" size={64} strokeWidth={1.5} />
          <span className="bookings-stat-icon">
            <Calendar size={16} />
          </span>
          <p className="bookings-stat-value">{loading ? '—' : bookings.length}</p>
          <span className="bookings-stat-label">Total Classes</span>
        </div>

        <div className="bookings-stat-card" style={{ '--accent': '#1fa971' } as CSSProperties}>
          <CalendarCheck className="bookings-stat-watermark" size={64} strokeWidth={1.5} />
          <span className="bookings-stat-icon">
            <CalendarCheck size={16} />
          </span>
          <p className="bookings-stat-value">{loading ? '—' : bookedCount}</p>
          <span className="bookings-stat-label">Booked</span>
        </div>

        <div className="bookings-stat-card" style={{ '--accent': '#f5a524' } as CSSProperties}>
          <CalendarClock className="bookings-stat-watermark" size={64} strokeWidth={1.5} />
          <span className="bookings-stat-icon">
            <CalendarClock size={16} />
          </span>
          <p className="bookings-stat-value">{loading ? '—' : openCount}</p>
          <span className="bookings-stat-label">Open (Not Yet Booked)</span>
        </div>
      </div>

      <div className="bookings-list-panel">
        <div className="bookings-filters">
          <div className="bookings-filters-left">
            <div className="bookings-tab-toggle">
              <button
                type="button"
                className={`bookings-tab ${statusFilter === 'all' ? 'is-active' : ''}`}
                onClick={() => setStatusFilter('all')}
              >
                All
              </button>
              <button
                type="button"
                className={`bookings-tab ${statusFilter === 'booked' ? 'is-active' : ''}`}
                onClick={() => setStatusFilter('booked')}
              >
                Booked
              </button>
              <button
                type="button"
                className={`bookings-tab ${statusFilter === 'open' ? 'is-active' : ''}`}
                onClick={() => setStatusFilter('open')}
              >
                Open
              </button>
            </div>

            <div className="bookings-search-box">
              <Search size={14} />
              <input
                type="text"
                className="bookings-search-input"
                value={teacherSearch}
                onChange={(e) => setTeacherSearch(e.target.value)}
                placeholder="Search teacher by name or email…"
                autoComplete="off"
              />
            </div>
          </div>

          <div className="bookings-date-range">
            <label>
              From
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </label>
            <label>
              To
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </label>
            <button type="button" className="bookings-range-btn" onClick={resetToThisMonth}>
              This Month
            </button>
            {(dateFrom || dateTo) && (
              <button type="button" className="bookings-range-clear" onClick={clearDateRange} aria-label="Clear date range">
                <X size={14} /> Clear
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <p className="bookings-loading">Loading…</p>
        ) : filteredBookings.length === 0 ? (
          <div className="bookings-empty">
            <Calendar size={22} />
            <p>No classes match these filters.</p>
          </div>
        ) : (
          <div className="bookings-table-wrap">
            <table className="bookings-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Teacher</th>
                  <th>Student</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredBookings.map((b) => (
                  <tr key={b.id} className="bookings-row-clickable" onClick={() => setSelectedBooking(b)}>
                    <td>{formatDateLabel(b.date)}</td>
                    <td>{formatTimeLabel(b.start_time)}</td>
                    <td>
                      <span className="bookings-row-avatar bookings-row-avatar-teacher">
                        <GraduationCap size={13} />
                      </span>
                      {b.teacher?.name ?? '—'}
                    </td>
                    <td>
                      {b.student ? (
                        <>
                          <span className="bookings-row-avatar bookings-row-avatar-student">
                            <Backpack size={13} />
                          </span>
                          {b.student.name}
                          <span className="bookings-row-sub"> · {b.student.student_code}</span>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <span className={`bookings-status-badge is-${getDisplayStatus(b).toLowerCase()}`}>{getDisplayStatus(b)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedBooking && (
        <div className="bookings-modal-overlay" onClick={() => setSelectedBooking(null)}>
          <div className="bookings-detail-modal" onClick={(e) => e.stopPropagation()}>
            <button className="bookings-modal-close" aria-label="Close" onClick={() => setSelectedBooking(null)}>
              <X size={18} />
            </button>

            <div className="bookings-detail-header">
              <h2>{formatDateLabel(selectedBooking.date)}</h2>
              <p className="bookings-detail-time">{formatTimeLabel(selectedBooking.start_time)}</p>
              <span className={`bookings-status-badge is-${getDisplayStatus(selectedBooking).toLowerCase()}`}>
                {getDisplayStatus(selectedBooking)}
              </span>
            </div>

            <div className="bookings-detail-grid">
              <div className="bookings-detail-block">
                <span className="bookings-detail-label">
                  <GraduationCap size={13} /> Teacher
                </span>
                <p>{selectedBooking.teacher?.name ?? '—'}</p>
                {selectedBooking.teacher?.email && <p className="bookings-detail-sub">{selectedBooking.teacher.email}</p>}
              </div>

              <div className="bookings-detail-block">
                <span className="bookings-detail-label">
                  <Backpack size={13} /> Student
                </span>
                {selectedBooking.student ? (
                  <>
                    <p>{selectedBooking.student.name}</p>
                    <p className="bookings-detail-sub">
                      {selectedBooking.student.email ?? '—'} · {selectedBooking.student.student_code}
                    </p>
                  </>
                ) : (
                  <p className="bookings-detail-empty">Not booked yet</p>
                )}
              </div>

              <div className="bookings-detail-block">
                <span className="bookings-detail-label">
                  <BookOpen size={13} /> Subject
                </span>
                <p>{selectedBooking.class_details?.subject ?? '—'}</p>
              </div>

              <div className="bookings-detail-block">
                <span className="bookings-detail-label">
                  <BookOpen size={13} /> Book
                </span>
                <p>{selectedBooking.class_details?.book_label ?? '—'}</p>
              </div>

              {selectedBooking.teacher_rating != null && (
                <div className="bookings-detail-block">
                  <span className="bookings-detail-label">
                    <Star size={13} /> Teacher Rating
                  </span>
                  <p>{selectedBooking.teacher_rating.toFixed(1)} / 5</p>
                </div>
              )}
            </div>

            <div className="bookings-detail-block">
              <span className="bookings-detail-label">
                <FileText size={13} /> Class Notes
              </span>
              {selectedBooking.class_notes ? (
                <p className="bookings-detail-notes">{selectedBooking.class_notes}</p>
              ) : (
                <p className="bookings-detail-empty">No notes yet.</p>
              )}
            </div>

            <div className="bookings-detail-block">
              <span className="bookings-detail-label">
                <Video size={13} /> Class Recording
              </span>
              {selectedBooking.class_recording ? (
                /^https?:\/\//i.test(selectedBooking.class_recording) ? (
                  <a href={selectedBooking.class_recording} target="_blank" rel="noreferrer" className="bookings-detail-link">
                    Open Recording <ExternalLink size={12} />
                  </a>
                ) : (
                  <p>{selectedBooking.class_recording}</p>
                )
              ) : (
                <p className="bookings-detail-empty">No recording yet.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Bookings
