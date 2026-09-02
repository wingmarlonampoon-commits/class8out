import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/useAuth'
import { DEFAULT_COMPANY_SETTINGS } from '../../data/companySettings'
import { getZonedNow } from '../../lib/companyTime'
import './CompanyTableOverview.css'

type TodayClass = {
  id: string
  start_time: string
  Status: 'Booked' | 'Completed'
  teacher: { name: string } | null
  student: { name: string } | null
}

type Status = 'In Progress' | 'Upcoming' | 'Completed'

const statusClass: Record<Status, string> = {
  'In Progress': 'is-progress',
  Upcoming: 'is-upcoming',
  Completed: 'is-scheduled',
}

const pad2 = (n: number) => String(n).padStart(2, '0')
const toDateKey = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`

const formatTimeLabel = (startTime: string) => {
  const [hStr, mStr] = startTime.split(':')
  const h24 = Number(hStr)
  const period = h24 < 12 ? 'AM' : 'PM'
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${mStr} ${period}`
}

function CompanyTableOverview() {
  const { session } = useAuth()
  const [companyCode, setCompanyCode] = useState<string | null>(null)
  const [timezone, setTimezone] = useState(DEFAULT_COMPANY_SETTINGS.timezone)
  const [items, setItems] = useState<TodayClass[]>([])
  const [loading, setLoading] = useState(true)

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
    if (!companyCode) return

    const todayKey = toDateKey(getZonedNow(timezone))

    supabase
      .from('classes')
      .select('id, start_time, "Status", teacher:company_organizational_chart(name), student:student_lists(name)')
      .eq('company_code', companyCode)
      .eq('date', todayKey)
      .not('student_id', 'is', null)
      .order('start_time', { ascending: true })
      .then(({ data }) => {
        setItems((data as unknown as TodayClass[]) ?? [])
        setLoading(false)
      })
  }, [companyCode, timezone])

  const now = getZonedNow(timezone)
  const nowMinutes = now.getHours() * 60 + now.getMinutes()

  // "Completed" only ever reflects the class's own status field — a class
  // isn't assumed finished just because its scheduled time has passed
  // (no-shows, run-over sessions, etc.), only once someone marks it done.
  const getStatus = (item: TodayClass): Status => {
    if (item.Status === 'Completed') return 'Completed'
    const [h, m] = item.start_time.split(':').map(Number)
    const startMinutes = h * 60 + m
    if (nowMinutes < startMinutes) return 'Upcoming'
    return 'In Progress'
  }

  return (
    <div className="schedule-panel">
      <div className="schedule-header">
        <h2>Today's Schedule</h2>
        <Link to="/company-dashboard/schedule" className="schedule-view-link">
          View Calendar
        </Link>
      </div>

      {loading ? (
        <p className="schedule-empty-msg">Loading…</p>
      ) : items.length === 0 ? (
        <p className="schedule-empty-msg">No classes booked for today.</p>
      ) : (
        <ul className="schedule-list">
          {items.map((item) => {
            const status = getStatus(item)
            return (
              <li className="schedule-item" key={item.id}>
                <div className="schedule-time">
                  <span className={`schedule-time-dot ${statusClass[status]}`} />
                  {formatTimeLabel(item.start_time)}
                </div>
                <div className="schedule-info">
                  <p className="schedule-title">{item.student?.name ?? 'Student'}'s Class</p>
                  <p className="schedule-subtitle">with {item.teacher?.name ?? 'Teacher'}</p>
                </div>
                <span className={`schedule-status ${statusClass[status]}`}>{status}</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export default CompanyTableOverview
