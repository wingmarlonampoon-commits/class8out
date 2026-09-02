import { useEffect, useState, type CSSProperties } from 'react'
import { BookOpen, Calendar, CalendarCheck, CalendarClock, ExternalLink, FileText, GraduationCap, Star, Video, X } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useStudentIdentity } from '../../hooks/useStudentIdentity'
import './Classes.css'

type StatusFilter = 'all' | 'booked' | 'completed'

type ClassDetails = { subject: string | null; book_id: string | null; book_label: string | null }

type ClassRow = {
  id: string
  date: string
  start_time: string
  Status: 'Booked' | 'Completed'
  class_details: ClassDetails | null
  class_notes: string | null
  class_recording: string | null
  teacher_rating: number | null
  teacher?: { id: string; name: string } | null
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

function Classes() {
  const { identity } = useStudentIdentity()

  const [classes, setClasses] = useState<ClassRow[]>([])
  const [loading, setLoading] = useState(true)

  const defaultRange = getMonthRange(new Date())
  const [dateFrom, setDateFrom] = useState(defaultRange.from)
  const [dateTo, setDateTo] = useState(defaultRange.to)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [selectedClass, setSelectedClass] = useState<ClassRow | null>(null)

  useEffect(() => {
    if (!identity) return

    setLoading(true)

    let query =
      identity.kind === 'freelance'
        ? supabase
            .from('freelance_classes')
            .select('id, date, start_time, "Status", class_details, class_notes, class_recording, teacher_rating')
            .eq('student_id', identity.studentId)
        : supabase
            .from('classes')
            .select(
              'id, date, start_time, "Status", class_details, class_notes, class_recording, teacher_rating, teacher:company_organizational_chart(id, name)',
            )
            .eq('student_id', identity.studentId)

    query = query.order('date', { ascending: false }).order('start_time', { ascending: false })

    if (dateFrom) query = query.gte('date', dateFrom)
    if (dateTo) query = query.lte('date', dateTo)

    query.then(({ data }) => {
      setClasses((data as unknown as ClassRow[]) ?? [])
      setLoading(false)
    })
  }, [identity, dateFrom, dateTo])

  const teacherNameFor = (row: ClassRow) =>
    row.teacher?.name ?? (identity?.kind === 'freelance' ? identity.teacherName : '—')

  const filteredClasses = classes.filter((c) => {
    if (statusFilter === 'booked') return c.Status !== 'Completed'
    if (statusFilter === 'completed') return c.Status === 'Completed'
    return true
  })

  const completedCount = classes.filter((c) => c.Status === 'Completed').length
  const upcomingCount = classes.length - completedCount

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
    <div className="student-classes-page">
      <div className="student-classes-page-header">
        <h1>My Classes</h1>
      </div>

      <div className="student-classes-stats-grid">
        <div className="student-classes-stat-card" style={{ '--accent': '#1447e6' } as CSSProperties}>
          <Calendar className="student-classes-stat-watermark" size={64} strokeWidth={1.5} />
          <span className="student-classes-stat-icon">
            <Calendar size={16} />
          </span>
          <p className="student-classes-stat-value">{loading ? '—' : classes.length}</p>
          <span className="student-classes-stat-label">Total Classes</span>
        </div>

        <div className="student-classes-stat-card" style={{ '--accent': '#f5a524' } as CSSProperties}>
          <CalendarClock className="student-classes-stat-watermark" size={64} strokeWidth={1.5} />
          <span className="student-classes-stat-icon">
            <CalendarClock size={16} />
          </span>
          <p className="student-classes-stat-value">{loading ? '—' : upcomingCount}</p>
          <span className="student-classes-stat-label">Upcoming / Booked</span>
        </div>

        <div className="student-classes-stat-card" style={{ '--accent': '#1fa971' } as CSSProperties}>
          <CalendarCheck className="student-classes-stat-watermark" size={64} strokeWidth={1.5} />
          <span className="student-classes-stat-icon">
            <CalendarCheck size={16} />
          </span>
          <p className="student-classes-stat-value">{loading ? '—' : completedCount}</p>
          <span className="student-classes-stat-label">Completed</span>
        </div>
      </div>

      <div className="student-classes-list-panel">
        <div className="student-classes-filters">
          <div className="student-classes-filters-left">
            <div className="student-classes-tab-toggle">
              <button
                type="button"
                className={`student-classes-tab ${statusFilter === 'all' ? 'is-active' : ''}`}
                onClick={() => setStatusFilter('all')}
              >
                All
              </button>
              <button
                type="button"
                className={`student-classes-tab ${statusFilter === 'booked' ? 'is-active' : ''}`}
                onClick={() => setStatusFilter('booked')}
              >
                Upcoming
              </button>
              <button
                type="button"
                className={`student-classes-tab ${statusFilter === 'completed' ? 'is-active' : ''}`}
                onClick={() => setStatusFilter('completed')}
              >
                Completed
              </button>
            </div>
          </div>

          <div className="student-classes-date-range">
            <label>
              From
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </label>
            <label>
              To
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </label>
            <button type="button" className="student-classes-range-btn" onClick={resetToThisMonth}>
              This Month
            </button>
            {(dateFrom || dateTo) && (
              <button type="button" className="student-classes-range-clear" onClick={clearDateRange} aria-label="Clear date range">
                <X size={14} /> Clear
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <p className="student-classes-loading">Loading…</p>
        ) : filteredClasses.length === 0 ? (
          <div className="student-classes-empty">
            <Calendar size={22} />
            <p>No classes match these filters.</p>
          </div>
        ) : (
          <div className="student-classes-table-wrap">
            <table className="student-classes-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Teacher</th>
                  <th>Subject</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredClasses.map((c) => (
                  <tr key={c.id} className="student-classes-row-clickable" onClick={() => setSelectedClass(c)}>
                    <td>{formatDateLabel(c.date)}</td>
                    <td>{formatTimeLabel(c.start_time)}</td>
                    <td>
                      <span className="student-classes-row-avatar">
                        <GraduationCap size={13} />
                      </span>
                      {teacherNameFor(c)}
                    </td>
                    <td>{c.class_details?.subject ?? '—'}</td>
                    <td>
                      <span className={`student-classes-status-badge is-${c.Status === 'Completed' ? 'completed' : 'booked'}`}>
                        {c.Status === 'Completed' ? 'Completed' : 'Upcoming'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedClass && (
        <div className="student-classes-modal-overlay" onClick={() => setSelectedClass(null)}>
          <div className="student-classes-detail-modal" onClick={(e) => e.stopPropagation()}>
            <button className="student-classes-modal-close" aria-label="Close" onClick={() => setSelectedClass(null)}>
              <X size={18} />
            </button>

            <div className="student-classes-detail-header">
              <h2>{formatDateLabel(selectedClass.date)}</h2>
              <p className="student-classes-detail-time">{formatTimeLabel(selectedClass.start_time)}</p>
              <span className={`student-classes-status-badge is-${selectedClass.Status === 'Completed' ? 'completed' : 'booked'}`}>
                {selectedClass.Status === 'Completed' ? 'Completed' : 'Upcoming'}
              </span>
            </div>

            <div className="student-classes-detail-grid">
              <div className="student-classes-detail-block">
                <span className="student-classes-detail-label">
                  <GraduationCap size={13} /> Teacher
                </span>
                <p>{teacherNameFor(selectedClass)}</p>
              </div>

              <div className="student-classes-detail-block">
                <span className="student-classes-detail-label">
                  <BookOpen size={13} /> Subject
                </span>
                <p>{selectedClass.class_details?.subject ?? '—'}</p>
              </div>

              <div className="student-classes-detail-block">
                <span className="student-classes-detail-label">
                  <BookOpen size={13} /> Book
                </span>
                <p>{selectedClass.class_details?.book_label ?? '—'}</p>
              </div>

              {selectedClass.teacher_rating != null && (
                <div className="student-classes-detail-block">
                  <span className="student-classes-detail-label">
                    <Star size={13} /> Rating
                  </span>
                  <p>{selectedClass.teacher_rating.toFixed(1)} / 5</p>
                </div>
              )}
            </div>

            <div className="student-classes-detail-block">
              <span className="student-classes-detail-label">
                <FileText size={13} /> Class Notes
              </span>
              {selectedClass.class_notes ? (
                <p className="student-classes-detail-notes">{selectedClass.class_notes}</p>
              ) : (
                <p className="student-classes-detail-empty">No notes yet.</p>
              )}
            </div>

            <div className="student-classes-detail-block">
              <span className="student-classes-detail-label">
                <Video size={13} /> Class Recording
              </span>
              {selectedClass.class_recording ? (
                /^https?:\/\//i.test(selectedClass.class_recording) ? (
                  <a href={selectedClass.class_recording} target="_blank" rel="noreferrer" className="student-classes-detail-link">
                    Open Recording <ExternalLink size={12} />
                  </a>
                ) : (
                  <p>{selectedClass.class_recording}</p>
                )
              ) : (
                <p className="student-classes-detail-empty">No recording yet.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Classes
