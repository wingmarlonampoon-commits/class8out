import { useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/useAuth'
import './SummaryGraph.css'

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const WIDTH = 640
const HEIGHT = 220
const PADDING = { top: 16, right: 16, bottom: 40, left: 34 }

const pad2 = (n: number) => String(n).padStart(2, '0')
const toDateKey = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`

function getCurrentWeekDates() {
  const now = new Date()
  const diffToMonday = (now.getDay() + 6) % 7
  const monday = new Date(now)
  monday.setDate(now.getDate() - diffToMonday)
  return DAY_LABELS.map((label, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return { label, dateKey: toDateKey(d), sublabel: d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }) }
  })
}

// Round the axis max up to a "nice" step (5, 10, 20, 25, 50, 100…) so the
// gridlines/ticks read cleanly regardless of how small or large real counts are.
function getNiceMax(rawMax: number) {
  if (rawMax <= 5) return 5
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawMax)))
  const steps = [1, 2, 2.5, 5, 10]
  for (const step of steps) {
    const candidate = step * magnitude
    if (candidate >= rawMax) return candidate
  }
  return Math.ceil(rawMax / magnitude) * magnitude
}

function toPoint(index: number, value: number, count: number, maxValue: number) {
  const innerWidth = WIDTH - PADDING.left - PADDING.right
  const innerHeight = HEIGHT - PADDING.top - PADDING.bottom
  const x = PADDING.left + (index / (count - 1)) * innerWidth
  const y = PADDING.top + (1 - value / maxValue) * innerHeight
  return { x, y }
}

function buildSmoothPath(points: { x: number; y: number }[]) {
  if (points.length === 0) return ''
  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i]
    const p1 = points[i + 1]
    const midX = (p0.x + p1.x) / 2
    d += ` C ${midX} ${p0.y}, ${midX} ${p1.y}, ${p1.x} ${p1.y}`
  }
  return d
}

function SummaryGraph() {
  const { session } = useAuth()
  const [companyCode, setCompanyCode] = useState<string | null>(null)
  const [bookingCounts, setBookingCounts] = useState<number[]>(new Array(7).fill(0))
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  const weekDates = getCurrentWeekDates()

  useEffect(() => {
    const email = session?.user.email
    if (!email) return

    supabase
      .from('company_registration')
      .select('CompanyCode')
      .eq('email', email)
      .single()
      .then(({ data }) => {
        if (data) setCompanyCode(data.CompanyCode)
      })
  }, [session])

  useEffect(() => {
    if (!companyCode) return

    const days = getCurrentWeekDates()

    supabase
      .from('classes')
      .select('date')
      .eq('company_code', companyCode)
      .not('student_id', 'is', null)
      .gte('date', days[0].dateKey)
      .lte('date', days[6].dateKey)
      .then(({ data }) => {
        const counts = new Array(7).fill(0)
        ;((data as { date: string }[]) ?? []).forEach((row) => {
          const i = days.findIndex((w) => w.dateKey === row.date)
          if (i !== -1) counts[i] += 1
        })
        setBookingCounts(counts)
      })
  }, [companyCode])

  const maxValue = getNiceMax(Math.max(...bookingCounts, 1))
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(maxValue * f))
  const points = bookingCounts.map((v, i) => toPoint(i, v, bookingCounts.length, maxValue))
  const linePath = buildSmoothPath(points)
  const baseline = HEIGHT - PADDING.bottom
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${baseline} L ${points[0].x} ${baseline} Z`
  const active = hoverIndex !== null ? points[hoverIndex] : null

  const total = bookingCounts.reduce((sum, v) => sum + v, 0)
  const average = Math.round((total / bookingCounts.length) * 10) / 10
  const peakIndex = bookingCounts.indexOf(Math.max(...bookingCounts))

  return (
    <div className="graph-panel">
      <div className="graph-header">
        <h2>Bookings Overview</h2>
        <button className="graph-range" type="button">
          This Week <ChevronDown size={14} />
        </button>
      </div>

      <div className="graph-chart-wrap">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="graph-svg" preserveAspectRatio="none">
          <defs>
            <linearGradient id="graphFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {yTicks.map((tick) => {
            const y = toPoint(0, tick, bookingCounts.length, maxValue).y
            return (
              <g key={tick}>
                <line x1={PADDING.left} x2={WIDTH - PADDING.right} y1={y} y2={y} className="graph-grid-line" />
                <text x={PADDING.left - 10} y={y + 4} className="graph-tick-label" textAnchor="end">
                  {tick}
                </text>
              </g>
            )
          })}

          <path d={areaPath} fill="url(#graphFill)" stroke="none" />
          <path d={linePath} className="graph-line" fill="none" />

          {points.map((p, i) => (
            <g key={i}>
              {hoverIndex === i && (
                <line x1={p.x} x2={p.x} y1={PADDING.top} y2={baseline} className="graph-hover-guide" />
              )}
              <circle cx={p.x} cy={p.y} r={hoverIndex === i ? 5 : 3.5} className="graph-point" />
              <circle
                cx={p.x}
                cy={p.y}
                r={16}
                fill="transparent"
                onMouseEnter={() => setHoverIndex(i)}
                onMouseLeave={() => setHoverIndex(null)}
              />
              <text x={p.x} y={HEIGHT - 22} className="graph-x-label" textAnchor="middle">
                {weekDates[i].label}
              </text>
              <text x={p.x} y={HEIGHT - 8} className="graph-x-sublabel" textAnchor="middle">
                {weekDates[i].sublabel}
              </text>
            </g>
          ))}
        </svg>

        {active && hoverIndex !== null && (
          <div
            className="graph-tooltip"
            style={{ left: `${(active.x / WIDTH) * 100}%`, top: `${(active.y / HEIGHT) * 100}%` }}
          >
            <strong>
              {weekDates[hoverIndex].label}, {weekDates[hoverIndex].sublabel}
            </strong>
            <span>Bookings: {bookingCounts[hoverIndex]}</span>
          </div>
        )}
      </div>

      <div className="graph-stats-strip">
        <div className="graph-stat">
          <span className="graph-stat-label">Total</span>
          <span className="graph-stat-value">{total}</span>
        </div>
        <span className="graph-stats-divider" />
        <div className="graph-stat">
          <span className="graph-stat-label">Avg / day</span>
          <span className="graph-stat-value">{average}</span>
        </div>
        <span className="graph-stats-divider" />
        <div className="graph-stat">
          <span className="graph-stat-label">Peak day</span>
          <span className="graph-stat-value">{total === 0 ? '—' : weekDates[peakIndex].label}</span>
        </div>
      </div>
    </div>
  )
}

export default SummaryGraph
