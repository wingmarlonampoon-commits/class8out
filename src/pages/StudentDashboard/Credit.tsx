import { Mail, Phone, Wallet } from 'lucide-react'
import { useStudentIdentity } from '../../hooks/useStudentIdentity'
import '../../styles/settingsPanel.css'
import './Credit.css'

function Credit() {
  const { identity, loading } = useStudentIdentity()

  const contactName = identity?.kind === 'company' ? identity.companyName : identity?.kind === 'freelance' ? identity.teacherName : ''
  const contactEmail = identity?.kind === 'company' ? identity.companyEmail : identity?.kind === 'freelance' ? identity.teacherEmail : null
  const contactPhone = identity?.kind === 'company' ? identity.companyPhone : identity?.kind === 'freelance' ? identity.teacherPhone : null

  return (
    <div className="settings-page">
      <div className="settings-grid">
        <div className="settings-col">
          <div className="settings-panel">
            <div className="settings-panel-header-icon">
              <span className="settings-icon-badge">
                <Wallet size={18} />
              </span>
              <div>
                <h2>Your Credits</h2>
                <p className="settings-panel-subtitle">Class credits available to book with.</p>
              </div>
            </div>

            {loading ? (
              <p className="settings-loading">Loading…</p>
            ) : (
              <>
                <p className="student-credit-balance-value">{identity?.Credits ?? 0}</p>
                <p className="student-credit-balance-label">
                  credit{(identity?.Credits ?? 0) === 1 ? '' : 's'} remaining
                </p>
              </>
            )}
          </div>

          <div className="settings-panel">
            <div className="settings-panel-header-icon">
              <span className="settings-icon-badge">
                <Wallet size={18} />
              </span>
              <div>
                <h2>How Credits Work</h2>
              </div>
            </div>

            <ul className="student-credit-explain-list">
              <li>Each class credit lets you book one class with a teacher.</li>
              <li>Booking a slot on the Teachers page spends 1 credit.</li>
              <li>Cancelling a booking before it happens refunds that credit.</li>
              <li>
                Running low? Reach out to {contactName || 'your admin'} using the contact details below to have more added to
                your account.
              </li>
            </ul>
          </div>
        </div>

        <div className="settings-panel settings-panel-fill">
          <div className="settings-panel-header-icon">
            <span className="settings-icon-badge">
              <Mail size={18} />
            </span>
            <div>
              <h2>Contact {contactName || (identity?.kind === 'company' ? 'Your School' : 'Your Teacher')}</h2>
              <p className="settings-panel-subtitle">Request more class credits or ask a question.</p>
            </div>
          </div>

          {loading ? (
            <p className="settings-loading">Loading…</p>
          ) : (
            <>
              {contactEmail && (
                <div className="student-credit-contact-row">
                  <span className="student-credit-contact-icon">
                    <Mail size={15} />
                  </span>
                  <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
                </div>
              )}
              {contactPhone && (
                <div className="student-credit-contact-row">
                  <span className="student-credit-contact-icon">
                    <Phone size={15} />
                  </span>
                  <a href={`tel:${contactPhone}`}>{contactPhone}</a>
                </div>
              )}
              {!contactEmail && !contactPhone && <p className="settings-loading">No contact details on file yet.</p>}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default Credit
