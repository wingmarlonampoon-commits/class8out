import { useEffect, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { CalendarCheck, CalendarClock, GraduationCap, Wallet } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useStudentIdentity } from '../../hooks/useStudentIdentity'
import { getZonedNow } from '../../lib/companyTime'
import './Dashboard.css'

type Stat = { icon: typeof Wallet; tint: string; color: string; label: string; value: number | null; href: string }

type NextClass = {
  id: string
  date: string
  start_time: string
  class_details: { subject?: string } | null
  teacher?: { name: string } | null
}

const pad2 = (n: number) => String(n).padStart(2, '0')
const toDateKey = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`

const formatDateLabel = (dateKey: string) => {
  const [y, m, d] = dateKey.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

const formatTimeLabel = (startTime: string) => {
  const [hStr, mStr] = startTime.split(':')
  const h24 = Number(hStr)
  const period = h24 < 12 ? 'AM' : 'PM'
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${mStr} ${period}`
}

function Dashboard() {
  const { identity, loading: identityLoading } = useStudentIdentity()
  const rawName = identity?.name.split(' ')[0] ?? 'there'
  const displayName = rawName.charAt(0).toUpperCase() + rawName.slice(1)

  const [upcomingCount, setUpcomingCount] = useState<number | null>(null)
  const [completedCount, setCompletedCount] = useState<number | null>(null)
  const [nextClass, setNextClass] = useState<NextClass | null>(null)
  const [nextClassLoading, setNextClassLoading] = useState(true)

  useEffect(() => {
    if (!identity) return

    const classesTable = identity.kind === 'freelance' ? 'freelance_classes' : 'classes'

    const upcomingQuery = supabase
      .from(classesTable)
      .select('id', { count: 'exact', head: true })
      .eq('student_id', identity.studentId)
      .neq('Status', 'Completed')

    const completedQuery = supabase
      .from(classesTable)
      .select('id', { count: 'exact', head: true })
      .eq('student_id', identity.studentId)
      .eq('Status', 'Completed')

    Promise.all([upcomingQuery, completedQuery]).then(([upcoming, completed]) => {
      setUpcomingCount(upcoming.count ?? 0)
      setCompletedCount(completed.count ?? 0)
    })
  }, [identity])

  useEffect(() => {
    if (!identity) return

    setNextClassLoading(true)
    const timezone = identity.kind === 'company' ? identity.companySettings.timezone : identity.teacherSettings.timezone
    const todayKey = toDateKey(getZonedNow(timezone))
    const classesTable = identity.kind === 'freelance' ? 'freelance_classes' : 'classes'
    const select =
      identity.kind === 'freelance'
        ? 'id, date, start_time, class_details'
        : 'id, date, start_time, class_details, teacher:company_organizational_chart(name)'

    supabase
      .from(classesTable)
      .select(select)
      .eq('student_id', identity.studentId)
      .neq('Status', 'Completed')
      .gte('date', todayKey)
      .order('date', { ascending: true })
      .order('start_time', { ascending: true })
      .limit(1)
      .then(({ data }) => {
        const rows = (data as unknown as NextClass[]) ?? []
        setNextClass(rows[0] ?? null)
        setNextClassLoading(false)
      })
  }, [identity])

  if (identityLoading || !identity) {
    return (
      <div className="student-dash-overview">
        <p className="student-dash-loading">Loading…</p>
      </div>
    )
  }

  const stats: Stat[] = [
    { icon: Wallet, tint: '#e6f0ff', color: '#2f6bff', label: 'Class Credits', value: identity.Credits, href: '/student-dashboard/credit' },
    {
      icon: CalendarClock,
      tint: '#fdf2d0',
      color: '#f5a524',
      label: 'Upcoming Classes',
      value: upcomingCount,
      href: '/student-dashboard/classes',
    },
    {
      icon: CalendarCheck,
      tint: '#e3f7ec',
      color: '#1fa971',
      label: 'Classes Completed',
      value: completedCount,
      href: '/student-dashboard/classes',
    },
  ]

  const nextClassTeacherName = identity.kind === 'freelance' ? identity.teacherName : nextClass?.teacher?.name

  return (
    <div className="student-dash-overview">
      <div className="student-dash-overview-header">
        <div>
          <h1>Welcome back, {displayName}! 👋</h1>
          <p>Here's a look at your classes and credits.</p>
        </div>
      </div>

      <div className="student-dash-stats-grid">
        {stats.map((stat) => (
          <Link to={stat.href} className="student-dash-stat-card" key={stat.label} style={{ '--accent': stat.color } as CSSProperties}>
            <stat.icon className="student-dash-stat-watermark" size={72} strokeWidth={1.5} />
            <div className="student-dash-stat-top">
              <span className="student-dash-stat-icon" style={{ background: stat.tint, color: stat.color }}>
                <stat.icon size={18} />
              </span>
              <span className="student-dash-stat-label">{stat.label}</span>
            </div>
            <p className="student-dash-stat-value">{stat.value ?? '—'}</p>
          </Link>
        ))}
      </div>

      <div className="student-dash-next-panel">
        <div className="student-dash-next-header">
          <h2>Next Class</h2>
          <Link to="/student-dashboard/teachers" className="student-dash-next-view-link">
            Book a Class
          </Link>
        </div>

        {nextClassLoading ? (
          <p className="student-dash-next-empty-msg">Loading…</p>
        ) : !nextClass ? (
          <p className="student-dash-next-empty-msg">No upcoming classes booked. Head to Teachers to book one.</p>
        ) : (
          <ul className="student-dash-next-list">
            <li className="student-dash-next-item">
              <div className="student-dash-next-time">
                <span className="student-dash-next-time-dot is-upcoming" />
                {formatDateLabel(nextClass.date)}
              </div>
              <div className="student-dash-next-info">
                <p className="student-dash-next-title">
                  {formatTimeLabel(nextClass.start_time)} with {nextClassTeacherName ?? 'your teacher'}
                </p>
                <p className="student-dash-next-subtitle">{nextClass.class_details?.subject ?? 'General Class'}</p>
              </div>
              <span className="student-dash-next-status is-upcoming">
                <GraduationCap size={13} />
              </span>
            </li>
          </ul>
        )}
      </div>
    </div>
  )
}

export default Dashboard
