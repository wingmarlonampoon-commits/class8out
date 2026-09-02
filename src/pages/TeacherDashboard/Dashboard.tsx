import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { Calendar, CalendarClock, ChevronDown, TrendingUp, UserPlus } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useTeacherIdentity } from '../../hooks/useTeacherIdentity'
import { getZonedNow } from '../../lib/companyTime'
import BookingsGraph from './BookingsGraph'
import MiniCalendar from './MiniCalendar'
import './Dashboard.css'

type RangeMode = 'week' | 'month'
type Stat = { icon: typeof Calendar; tint: string; color: string; label: string; value: number | null; href: string }

type TodayClass = {
  id: string
  start_time: string
  Status: 'Booked' | 'Completed'
  class_details: { subject?: string } | null
  student: { name: string } | null
}

type TodayStatus = 'In Progress' | 'Upcoming' | 'Completed'

const todayStatusClass: Record<TodayStatus, string> = {
  'In Progress': 'is-progress',
  Upcoming: 'is-upcoming',
  Completed: 'is-scheduled',
}

const formatTimeLabel = (startTime: string) => {
  const [hStr, mStr] = startTime.split(':')
  const h24 = Number(hStr)
  const period = h24 < 12 ? 'AM' : 'PM'
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${mStr} ${period}`
}

const pad2 = (n: number) => String(n).padStart(2, '0')
const toDateKey = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`

const getWeekRange = (d: Date) => {
  const diffToMonday = (d.getDay() + 6) % 7
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - diffToMonday)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return { start: monday, end: sunday }
}

const getMonthRange = (d: Date) => {
  const start = new Date(d.getFullYear(), d.getMonth(), 1)
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  return { start, end }
}

function getRange(mode: RangeMode, now: Date) {
  const { start, end } = mode === 'week' ? getWeekRange(now) : getMonthRange(now)
  const label =
    mode === 'week'
      ? `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${end.getFullYear()}`
      : start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  return { start, end, label }
}

function Dashboard() {
  const { identity } = useTeacherIdentity()
  const rawName = identity?.name.split(' ')[0] ?? 'there'
  const displayName = rawName.charAt(0).toUpperCase() + rawName.slice(1)

  const [rangeMode, setRangeMode] = useState<RangeMode>('week')
  const [showRangeMenu, setShowRangeMenu] = useState(false)
  const rangeMenuRef = useRef<HTMLDivElement>(null)

  const [totalBookings, setTotalBookings] = useState<number | null>(null)
  const [openSlots, setOpenSlots] = useState<number | null>(null)
  const [myStudents, setMyStudents] = useState<number | null>(null)
  const [classesCompleted, setClassesCompleted] = useState<number | null>(null)

  const [todayItems, setTodayItems] = useState<TodayClass[]>([])
  const [todayLoading, setTodayLoading] = useState(true)

  useEffect(() => {
    if (!showRangeMenu) return
    const handleClickOutside = (e: MouseEvent) => {
      if (rangeMenuRef.current && !rangeMenuRef.current.contains(e.target as Node)) setShowRangeMenu(false)
    }
    window.addEventListener('mousedown', handleClickOutside)
    return () => window.removeEventListener('mousedown', handleClickOutside)
  }, [showRangeMenu])

  useEffect(() => {
    if (!identity) return

    const timezone = identity.kind === 'company' ? identity.companySettings.timezone : identity.settings.timezone
    const now = getZonedNow(timezone)
    const { start, end } = getRange(rangeMode, now)
    const rangeStartKey = toDateKey(start)
    const rangeEndKey = toDateKey(end)

    const classesTable = identity.kind === 'freelance' ? 'freelance_classes' : 'classes'
    const studentsTable = identity.kind === 'freelance' ? 'freelance_students' : 'student_lists'

    const bookingsQuery = supabase
      .from(classesTable)
      .select('id', { count: 'exact', head: true })
      .eq('teacher_id', identity.teacherId)
      .not('student_id', 'is', null)
      .gte('date', rangeStartKey)
      .lte('date', rangeEndKey)

    const openQuery = supabase
      .from(classesTable)
      .select('id', { count: 'exact', head: true })
      .eq('teacher_id', identity.teacherId)
      .is('student_id', null)
      .gte('date', rangeStartKey)
      .lte('date', rangeEndKey)

    const completedQuery = supabase
      .from(classesTable)
      .select('id', { count: 'exact', head: true })
      .eq('teacher_id', identity.teacherId)
      .eq('Status', 'Completed')
      .gte('date', rangeStartKey)
      .lte('date', rangeEndKey)

    const studentsQuery =
      identity.kind === 'freelance'
        ? supabase.from(studentsTable).select('id', { count: 'exact', head: true }).eq('teacher_id', identity.teacherId)
        : supabase.from(studentsTable).select('id', { count: 'exact', head: true }).eq('company_code', identity.companyCode)

    Promise.all([bookingsQuery, openQuery, completedQuery, studentsQuery]).then(([bookings, open, completed, students]) => {
      setTotalBookings(bookings.count ?? 0)
      setOpenSlots(open.count ?? 0)
      setClassesCompleted(completed.count ?? 0)
      setMyStudents(students.count ?? 0)
    })
  }, [identity, rangeMode])

  useEffect(() => {
    if (!identity) return

    setTodayLoading(true)
    const timezone = identity.kind === 'company' ? identity.companySettings.timezone : identity.settings.timezone
    const todayKey = toDateKey(getZonedNow(timezone))
    const classesTable = identity.kind === 'freelance' ? 'freelance_classes' : 'classes'
    const studentEmbed = identity.kind === 'freelance' ? 'student:freelance_students(name)' : 'student:student_lists(name)'

    supabase
      .from(classesTable)
      .select(`id, start_time, "Status", class_details, ${studentEmbed}`)
      .eq('teacher_id', identity.teacherId)
      .eq('date', todayKey)
      .not('student_id', 'is', null)
      .order('start_time', { ascending: true })
      .then(({ data }) => {
        setTodayItems((data as unknown as TodayClass[]) ?? [])
        setTodayLoading(false)
      })
  }, [identity])

  if (!identity) {
    return (
      <div className="teacher-dash-overview">
        <p className="teacher-dash-loading">Loading…</p>
      </div>
    )
  }

  const timezone = identity.kind === 'company' ? identity.companySettings.timezone : identity.settings.timezone
  const now = getZonedNow(timezone)
  const range = getRange(rangeMode, now)
  const periodLabel = rangeMode === 'week' ? 'This Week' : 'This Month'
  const bookingsHref = `/teacher-dashboard/bookings?from=${toDateKey(range.start)}&to=${toDateKey(range.end)}&status=booked`
  const openHref = `/teacher-dashboard/bookings?from=${toDateKey(range.start)}&to=${toDateKey(range.end)}&status=open`

  const nowMinutes = now.getHours() * 60 + now.getMinutes()

  const getTodayStatus = (item: TodayClass): TodayStatus => {
    if (item.Status === 'Completed') return 'Completed'
    const [h, m] = item.start_time.split(':').map(Number)
    const startMinutes = h * 60 + m
    if (nowMinutes < startMinutes) return 'Upcoming'
    return 'In Progress'
  }

  const stats: Stat[] = [
    { icon: Calendar, tint: '#e6f0ff', color: '#2f6bff', label: `Bookings ${periodLabel}`, value: totalBookings, href: bookingsHref },
    { icon: UserPlus, tint: '#e3f7ec', color: '#1fa971', label: 'My Students', value: myStudents, href: '/teacher-dashboard/students' },
    { icon: CalendarClock, tint: '#fdf2d0', color: '#f5a524', label: `Open Slots ${periodLabel}`, value: openSlots, href: openHref },
    {
      icon: TrendingUp,
      tint: '#dff5f7',
      color: '#14b8c4',
      label: `Classes Completed ${periodLabel}`,
      value: classesCompleted,
      href: bookingsHref,
    },
  ]

  return (
    <div className="teacher-dash-overview">
      <div className="teacher-dash-overview-header">
        <div>
          <h1>Welcome back, {displayName}! 👋</h1>
          <p>Here's what's happening with your classes today.</p>
        </div>

        <div className="teacher-dash-daterange-wrap" ref={rangeMenuRef}>
          <button className="teacher-dash-daterange" type="button" onClick={() => setShowRangeMenu((v) => !v)}>
            {range.label}
            <ChevronDown size={16} />
          </button>

          {showRangeMenu && (
            <div className="teacher-dash-daterange-menu">
              <button
                type="button"
                className={rangeMode === 'week' ? 'is-active' : ''}
                onClick={() => {
                  setRangeMode('week')
                  setShowRangeMenu(false)
                }}
              >
                This Week
              </button>
              <button
                type="button"
                className={rangeMode === 'month' ? 'is-active' : ''}
                onClick={() => {
                  setRangeMode('month')
                  setShowRangeMenu(false)
                }}
              >
                This Month
              </button>
            </div>
          )}
        </div>
      </div>

      {identity.kind === 'company' && !identity.selfBookingAllowed && (
        <p className="teacher-dash-notice">
          Your school has turned off self-booking — you can view your schedule and bookings, but new bookings must go through your admin.
        </p>
      )}

      <div className="teacher-dash-stats-grid">
        {stats.map((stat) => (
          <Link to={stat.href} className="teacher-dash-stat-card" key={stat.label} style={{ '--accent': stat.color } as CSSProperties}>
            <stat.icon className="teacher-dash-stat-watermark" size={72} strokeWidth={1.5} />
            <div className="teacher-dash-stat-top">
              <span className="teacher-dash-stat-icon" style={{ background: stat.tint, color: stat.color }}>
                <stat.icon size={18} />
              </span>
              <span className="teacher-dash-stat-label">{stat.label}</span>
            </div>
            <p className="teacher-dash-stat-value">{stat.value ?? '—'}</p>
          </Link>
        ))}
      </div>

      <div className="teacher-dash-secondary-row">
        <BookingsGraph />

        <div className="teacher-dash-today-panel">
          <div className="teacher-dash-today-header">
            <h2>Today's Schedule</h2>
          </div>

          {todayLoading ? (
            <p className="teacher-dash-today-empty-msg">Loading…</p>
          ) : todayItems.length === 0 ? (
            <p className="teacher-dash-today-empty-msg">No classes booked for today.</p>
          ) : (
            <ul className="teacher-dash-today-list">
              {todayItems.map((item) => {
                const status = getTodayStatus(item)
                return (
                  <li className="teacher-dash-today-item" key={item.id}>
                    <div className="teacher-dash-today-time">
                      <span className={`teacher-dash-today-time-dot ${todayStatusClass[status]}`} />
                      {formatTimeLabel(item.start_time)}
                    </div>
                    <div className="teacher-dash-today-info">
                      <p className="teacher-dash-today-title">{item.student?.name ?? 'Student'}'s Class</p>
                      <p className="teacher-dash-today-subtitle">{item.class_details?.subject ?? 'General Class'}</p>
                    </div>
                    <span className={`teacher-dash-today-status ${todayStatusClass[status]}`}>{status}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <MiniCalendar />
      </div>
    </div>
  )
}

export default Dashboard
