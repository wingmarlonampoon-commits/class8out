import { useEffect, useState, type CSSProperties } from 'react'
import { NavLink } from 'react-router-dom'
import { ChevronLeft, LifeBuoy, Mail, MapPin, Phone, X } from 'lucide-react'
import { roleAccess, roleBasePath, menuMeta, ROLE, type Role } from '../../data/roleAccess'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/useAuth'
import './DashboardSidebar.css'

type DashboardSidebarProps = {
  role: Role
  open: boolean
  onNavigate: () => void
  collapsed: boolean
  onToggleCollapse: () => void
}

type ContactDetail = {
  icon: typeof Mail
  label: string
  value: string
  href?: string
  color: string
}

const platformContactDetails: ContactDetail[] = [
  {
    icon: Mail,
    label: 'Email',
    value: 'servicesjmseptember@gmail.com',
    href: 'mailto:servicesjmseptember@gmail.com',
    color: '#2f6bff',
  },
  {
    icon: Phone,
    label: 'Phone',
    value: '+63 935 254 1057',
    href: 'tel:+639352541057',
    color: '#1fa971',
  },
  {
    icon: MapPin,
    label: 'Location',
    value: 'Baguio City, Philippines',
    href: undefined,
    color: '#f5a524',
  },
]

const accentStyle = (color: string) => ({ '--accent': color }) as CSSProperties

type SchoolContact = {
  companyName: string
  email: string
  phone: string | null
  address: string | null
}

type FreelanceContact = {
  teacherName: string
  email: string
  phone: string | null
}

function DashboardSidebar({
  role,
  open,
  onNavigate,
  collapsed,
  onToggleCollapse,
}: DashboardSidebarProps) {
  const items = roleAccess[role]
  const base = roleBasePath[role]

  const [showContact, setShowContact] = useState(false)

  const { session } = useAuth()

  const [schoolContact, setSchoolContact] = useState<SchoolContact | null>(null)
  const [freelanceContact, setFreelanceContact] = useState<FreelanceContact | null>(null)

  // Teachers and Students work for an ESL company — their "Contact Support"
  // should reach that company's own founding admin, not Class8out itself.
  // Only the Company Admin (who has no school "above" them) sees the
  // platform's own contact info.
  const isEmployee = role === ROLE.TEACHER || role === ROLE.STUDENT

  useEffect(() => {
    if (!isEmployee) return

    const myEmail = session?.user.email
    if (!myEmail) return

    let cancelled = false

    async function resolve() {
      const sourceTable =
        role === ROLE.TEACHER
          ? 'company_organizational_chart'
          : 'student_lists'

      const { data } = await supabase
        .from(sourceTable)
        .select('company_code')
        .eq('email', myEmail)
        .limit(1)

      const companyCode = data?.[0]?.company_code

      if (companyCode) {
        const { data: companyRows } = await supabase
          .from('company_registration')
          .select('company_name, email, phone_number, address, created_at')
          .eq('CompanyCode', companyCode)
          .order('created_at', { ascending: true })
          .limit(1)

        if (cancelled) return

        const row = companyRows?.[0]

        if (row) {
          setSchoolContact({
            companyName: row.company_name,
            email: row.email,
            phone: row.phone_number,
            address: row.address,
          })
        }

        return
      }

      // Not found in student_lists — a student who wasn't found there is a
      // freelance student instead, whose "Contact Support" should reach
      // their own freelance teacher.
      if (role !== ROLE.STUDENT) return

      const { data: freelanceStudentRows } = await supabase
        .from('freelance_students')
        .select('teacher_id')
        .eq('email', myEmail)
        .limit(1)

      const teacherId = freelanceStudentRows?.[0]?.teacher_id

      if (!teacherId) return

      const { data: teacherRows } = await supabase
        .from('freelance_teachers')
        .select('names, email, phone')
        .eq('id', teacherId)
        .limit(1)

      if (cancelled) return

      const teacherRow = teacherRows?.[0]

      if (teacherRow) {
        setFreelanceContact({
          teacherName: teacherRow.names,
          email: teacherRow.email,
          phone: teacherRow.phone,
        })
      }
    }

    resolve()

    return () => {
      cancelled = true
    }
  }, [isEmployee, role, session])

  const contactDetails: ContactDetail[] =
    isEmployee && schoolContact
      ? [
          {
            icon: Mail,
            label: 'Email',
            value: schoolContact.email,
            href: `mailto:${schoolContact.email}`,
            color: '#2f6bff',
          },
          ...(schoolContact.phone
            ? [
                {
                  icon: Phone,
                  label: 'Phone',
                  value: schoolContact.phone,
                  href: `tel:${schoolContact.phone}`,
                  color: '#1fa971',
                },
              ]
            : []),
          ...(schoolContact.address
            ? [
                {
                  icon: MapPin,
                  label: 'Location',
                  value: schoolContact.address,
                  href: undefined,
                  color: '#f5a524',
                },
              ]
            : []),
        ]
      : isEmployee && freelanceContact
        ? [
            {
              icon: Mail,
              label: 'Email',
              value: freelanceContact.email,
              href: `mailto:${freelanceContact.email}`,
              color: '#2f6bff',
            },
            ...(freelanceContact.phone
              ? [
                  {
                    icon: Phone,
                    label: 'Phone',
                    value: freelanceContact.phone,
                    href: `tel:${freelanceContact.phone}`,
                    color: '#1fa971',
                  },
                ]
              : []),
          ]
        : platformContactDetails

  const supportTitle =
    isEmployee && schoolContact
      ? `Contact ${schoolContact.companyName}`
      : isEmployee && freelanceContact
        ? `Contact ${freelanceContact.teacherName}`
        : 'Contact Support'

  const supportSubtitle =
    isEmployee && (schoolContact || freelanceContact)
      ? schoolContact
        ? 'Reach out to your school directly.'
        : 'Reach out to your teacher directly.'
      : 'Reach out and our team will get back to you shortly.'

  const supportDesc =
    isEmployee && schoolContact
      ? `Reach out to ${schoolContact.companyName}.`
      : isEmployee && freelanceContact
        ? `Reach out to ${freelanceContact.teacherName}.`
        : 'Our support team is here to help you.'

  return (
    <>
      {open && (
        <div
          className="dash-sidebar-overlay"
          onClick={onNavigate}
          aria-hidden="true"
        />
      )}

      <aside
        className={`dash-sidebar ${open ? 'is-open' : ''} ${
          collapsed ? 'is-collapsed' : ''
        }`}
      >
        <button
          className="dash-sidebar-collapse-btn"
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <ChevronLeft
            size={14}
            className={collapsed ? 'is-flipped' : ''}
          />
        </button>

        <div className="dash-sidebar-scroll">
          <nav className="dash-nav">
            {items.map((label) => {
              const meta = menuMeta[label]

              if (!meta) return null

              const Icon = meta.icon

              return (
                <NavLink
                  key={label}
                  to={`${base}/${meta.path}`}
                  className={({ isActive }) =>
                    `dash-nav-item ${isActive ? 'is-active' : ''}`
                  }
                  onClick={onNavigate}
                  title={label}
                >
                  <Icon size={18} />
                  <span className="dash-nav-label">{label}</span>
                </NavLink>
              )
            })}
          </nav>

          <div className="dash-support-card">
            <span
              className="dash-support-icon"
              onClick={() => setShowContact(true)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  setShowContact(true)
                }
              }}
            >
              <LifeBuoy size={22} />
            </span>

            <p className="dash-support-title">Need Help?</p>

            <p className="dash-support-desc">{supportDesc}</p>

            <button
              className="dash-support-btn"
              onClick={() => setShowContact(true)}
            >
              Contact Support
            </button>
          </div>
        </div>
      </aside>

      {showContact && (
        <div
          className="dash-support-overlay"
          onClick={() => setShowContact(false)}
        >
          <div
            className="dash-support-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dash-support-modal-banner">
              <button
                className="dash-support-modal-close"
                aria-label="Close"
                onClick={() => setShowContact(false)}
              >
                <X size={18} />
              </button>

              <span className="dash-support-modal-icon">
                <LifeBuoy size={24} />
              </span>

              <h3>{supportTitle}</h3>

              <p>{supportSubtitle}</p>
            </div>

            <div className="dash-support-rows">
              {contactDetails.map((item) => {
                const Icon = item.icon

                const rowContent = (
                  <>
                    <span className="dash-support-row-icon">
                      <Icon size={16} />
                    </span>

                    <div>
                      <span className="dash-support-row-label">
                        {item.label}
                      </span>

                      <span className="dash-support-row-value">
                        {item.value}
                      </span>
                    </div>
                  </>
                )

                return item.href ? (
                  <a
                    key={item.label}
                    className="dash-support-row"
                    href={item.href}
                    style={accentStyle(item.color)}
                  >
                    {rowContent}
                  </a>
                ) : (
                  <div
                    key={item.label}
                    className="dash-support-row"
                    style={accentStyle(item.color)}
                  >
                    {rowContent}
                  </div>
                )
              })}
            </div>

            <p className="dash-support-modal-note">
              We typically respond within 24 hours.
            </p>
          </div>
        </div>
      )}
    </>
  )
}

export default DashboardSidebar