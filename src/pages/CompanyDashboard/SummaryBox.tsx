import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { Calendar, ChevronDown, TrendingUp, UserCog, UserPlus } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/useAuth'
import { DEFAULT_COMPANY_SETTINGS } from '../../data/companySettings'
import { getZonedNow } from '../../lib/companyTime'
import './SummaryBox.css'

type RangeMode = 'week' | 'month'
type Stat = { icon: typeof Calendar; tint: string; color: string; label: string; value: number | null; href: string }

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

function SummaryBox() {
  const { session } = useAuth()
  const rawName = session?.user.email?.split('@')[0] ?? 'there'
  const displayName = rawName.charAt(0).toUpperCase() + rawName.slice(1)

  const [companyCode, setCompanyCode] = useState<string | null>(null)
  const [timezone, setTimezone] = useState(DEFAULT_COMPANY_SETTINGS.timezone)

  const [rangeMode, setRangeMode] = useState<RangeMode>('week')
  const [showRangeMenu, setShowRangeMenu] = useState(false)
  const rangeMenuRef = useRef<HTMLDivElement>(null)

  const [totalBookings, setTotalBookings] = useState<number | null>(null)
  const [activeStudents, setActiveStudents] = useState<number | null>(null)
  const [totalTeachers, setTotalTeachers] = useState<number | null>(null)
  const [classesCompleted, setClassesCompleted] = useState<number | null>(null)

  useEffect(() => {
    const email = session?.user.email
    if (!email) return

    supabase
      .from('company_registration')
      .select('CompanyCode, company_settings')
      .eq('email', email)
      .single()
      .then(({ data }) => {
        if (data) {
          setCompanyCode(data.CompanyCode)
          setTimezone(data.company_settings?.timezone ?? DEFAULT_COMPANY_SETTINGS.timezone)
        }
      })
  }, [session])

  useEffect(() => {
    if (!showRangeMenu) return
    const handleClickOutside = (e: MouseEvent) => {
      if (rangeMenuRef.current && !rangeMenuRef.current.contains(e.target as Node)) setShowRangeMenu(false)
    }
    window.addEventListener('mousedown', handleClickOutside)
    return () => window.removeEventListener('mousedown', handleClickOutside)
  }, [showRangeMenu])

  useEffect(() => {
    if (!companyCode) return

    const now = getZonedNow(timezone)
    const { start, end } = getRange(rangeMode, now)
    const rangeStartKey = toDateKey(start)
    const rangeEndKey = toDateKey(end)

    Promise.all([
      supabase
        .from('classes')
        .select('id', { count: 'exact', head: true })
        .eq('company_code', companyCode)
        .not('student_id', 'is', null)
        .gte('date', rangeStartKey)
        .lte('date', rangeEndKey),
      supabase.from('student_lists').select('id', { count: 'exact', head: true }).eq('company_code', companyCode),
      supabase
        .from('company_organizational_chart')
        .select('id', { count: 'exact', head: true })
        .eq('company_code', companyCode)
        .eq('employee_type', 'Teacher'),
      supabase
        .from('classes')
        .select('id', { count: 'exact', head: true })
        .eq('company_code', companyCode)
        .eq('Status', 'Completed')
        .gte('date', rangeStartKey)
        .lte('date', rangeEndKey),
    ]).then(([bookings, students, teachers, completed]) => {
      setTotalBookings(bookings.count ?? 0)
      setActiveStudents(students.count ?? 0)
      setTotalTeachers(teachers.count ?? 0)
      setClassesCompleted(completed.count ?? 0)
    })
  }, [companyCode, timezone, rangeMode])

  const now = getZonedNow(timezone)
  const range = getRange(rangeMode, now)
  const periodLabel = rangeMode === 'week' ? 'This Week' : 'This Month'
  const bookingsHref = `/company-dashboard/bookings?from=${toDateKey(range.start)}&to=${toDateKey(range.end)}&status=booked`

  const stats: Stat[] = [
    { icon: Calendar, tint: '#e6f0ff', color: '#2f6bff', label: `Bookings ${periodLabel}`, value: totalBookings, href: bookingsHref },
    { icon: UserPlus, tint: '#e3f7ec', color: '#1fa971', label: 'Active Students', value: activeStudents, href: '/company-dashboard/students' },
    { icon: UserCog, tint: '#f1e9fb', color: '#8b5cf6', label: 'Total Teachers', value: totalTeachers, href: '/company-dashboard/employees' },
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
    <div className="dash-overview">
      <div className="dash-overview-header">
        <div>
          <h1>Welcome back, {displayName}! 👋</h1>
          <p>Here's what's happening with your ESL school today.</p>
        </div>

        <div className="dash-daterange-wrap" ref={rangeMenuRef}>
          <button className="dash-daterange" type="button" onClick={() => setShowRangeMenu((v) => !v)}>
            {range.label}
            <ChevronDown size={16} />
          </button>

          {showRangeMenu && (
            <div className="dash-daterange-menu">
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

      <div className="dash-stats-grid">
        {stats.map((stat) => (
          <Link
            to={stat.href}
            className="dash-stat-card"
            key={stat.label}
            style={{ '--accent': stat.color } as CSSProperties}
          >
            <stat.icon className="dash-stat-watermark" size={72} strokeWidth={1.5} />
            <div className="dash-stat-top">
              <span className="dash-stat-icon" style={{ background: stat.tint, color: stat.color }}>
                <stat.icon size={18} />
              </span>
              <span className="dash-stat-label">{stat.label}</span>
            </div>
            <p className="dash-stat-value">{stat.value ?? '—'}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}

export default SummaryBox
