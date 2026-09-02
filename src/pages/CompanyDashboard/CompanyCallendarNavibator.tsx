import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/useAuth'
import { DEFAULT_COMPANY_SETTINGS } from '../../data/companySettings'
import { getZonedNow } from '../../lib/companyTime'
import './CompanyCallendarNavibator.css'

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

const eventColor = '#1fa971'

const pad2 = (n: number) => String(n).padStart(2, '0')

function buildCalendarGrid(year: number, month: number) {
  const firstDay = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const startOffset = firstDay.getDay()
  const cells: (number | null)[] = []
  for (let i = 0; i < startOffset; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

function getNextBookingDay(year: number, month: number, today: Date, bookingDays: Set<number>) {
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth()
  const startDay = isCurrentMonth ? today.getDate() : 1

  for (let d = startDay; d <= daysInMonth; d++) {
    if (bookingDays.has(d)) return d
  }
  return null
}

function CompanyCallendarNavibator() {
  const { session } = useAuth()
  const [companyCode, setCompanyCode] = useState<string | null>(null)
  const [timezone, setTimezone] = useState(DEFAULT_COMPANY_SETTINGS.timezone)
  const [bookingDays, setBookingDays] = useState<Set<number>>(new Set())

  const today = getZonedNow(timezone)
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1))

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const cells = buildCalendarGrid(year, month)
  const monthLabel = viewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

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

    const monthStart = `${year}-${pad2(month + 1)}-01`
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const monthEnd = `${year}-${pad2(month + 1)}-${pad2(daysInMonth)}`

    supabase
      .from('classes')
      .select('date')
      .eq('company_code', companyCode)
      .not('student_id', 'is', null)
      .gte('date', monthStart)
      .lte('date', monthEnd)
      .then(({ data }) => {
        const days = new Set<number>()
        ;((data as { date: string }[]) ?? []).forEach((row) => {
          days.add(Number(row.date.split('-')[2]))
        })
        setBookingDays(days)
      })
  }, [companyCode, year, month])

  const isToday = (day: number) => day === today.getDate() && month === today.getMonth() && year === today.getFullYear()

  const goToMonth = (offset: number) => setViewDate(new Date(year, month + offset, 1))

  const nextBookingDay = getNextBookingDay(year, month, today, bookingDays)
  const monthShort = viewDate.toLocaleDateString('en-US', { month: 'short' })

  return (
    <div className="mini-cal-panel">
      <div className="mini-cal-header">
        <button className="mini-cal-nav" onClick={() => goToMonth(-1)} aria-label="Previous month" type="button">
          <ChevronLeft size={16} />
        </button>
        <h2>{monthLabel}</h2>
        <button className="mini-cal-nav" onClick={() => goToMonth(1)} aria-label="Next month" type="button">
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="mini-cal-weekdays">
        {WEEKDAYS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>

      <div className="mini-cal-grid">
        {cells.map((day, i) => {
          if (day === null) return <span className="mini-cal-cell is-empty" key={i} />
          const hasBooking = bookingDays.has(day)
          return (
            <span className={`mini-cal-cell ${isToday(day) ? 'is-today' : ''}`} key={i}>
              {day}
              {hasBooking && (
                <span className="mini-cal-dots">
                  <span className="mini-cal-dot" style={{ background: eventColor }} />
                </span>
              )}
            </span>
          )
        })}
      </div>

      <div className="mini-cal-footer">
        {nextBookingDay && (
          <p className="mini-cal-next">
            <span className="mini-cal-dot" style={{ background: eventColor }} />
            Next: {monthShort} {nextBookingDay} &middot; Bookings
          </p>
        )}

        <div className="mini-cal-legend">
          <span className="mini-cal-legend-item">
            <span className="mini-cal-dot" style={{ background: eventColor }} />
            Bookings
          </span>
        </div>
      </div>
    </div>
  )
}

export default CompanyCallendarNavibator
