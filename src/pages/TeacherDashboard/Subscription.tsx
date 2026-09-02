import { useState } from 'react'
import { Info } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useTeacherIdentity } from '../../hooks/useTeacherIdentity'
import { teacherPlans } from '../../data/pricing'
import '../../styles/settingsPanel.css'
import './Subscription.css'

type Message = { type: 'success' | 'error'; text: string }

function Subscription() {
  const { identity, loading } = useTeacherIdentity()
  const [switching, setSwitching] = useState<string | null>(null)
  const [message, setMessage] = useState<Message | null>(null)
  const [currentPlanName, setCurrentPlanName] = useState<string | null>(null)

  if (loading || !identity) {
    return (
      <div className="subscription-page">
        <div className="subscription-page-header">
          <h1>Subscription</h1>
        </div>
        <p className="settings-loading">Loading…</p>
      </div>
    )
  }

  const subscription = identity.kind === 'company' ? identity.companySubscription : identity.subscription
  const activePlanName = currentPlanName ?? subscription?.plan ?? 'Free'

  const handleSwitchPlan = async (plan: (typeof teacherPlans)[number]) => {
    if (identity.kind !== 'freelance') return

    setSwitching(plan.name)
    setMessage(null)

    const { error } = await supabase
      .from('freelance_teachers')
      .update({
        subscription: {
          plan: plan.name,
          price: plan.price,
          period: plan.period,
          subscribed_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', identity.teacherId)

    setSwitching(null)

    if (error) {
      setMessage({ type: 'error', text: 'Could not switch plans. Please try again.' })
      return
    }

    setCurrentPlanName(plan.name)
    setMessage({ type: 'success', text: `Switched to the ${plan.name} plan.` })
  }

  return (
    <div className="subscription-page">
      <div className="subscription-page-header">
        <h1>Subscription</h1>
      </div>

      <div className="subscription-current-panel">
        <div>
          <p className="subscription-current-label">Current Plan</p>
          <p className="subscription-current-plan">{activePlanName}</p>
          {subscription?.subscribed_at && (
            <p className="subscription-current-meta">
              Since {new Date(subscription.subscribed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          )}
        </div>
        {identity.kind === 'company' && (
          <p className="subscription-managed-note">Your subscription is managed by your company admin.</p>
        )}
      </div>

      {identity.kind === 'freelance' && (
        <>
          <div className="subscription-plan-grid">
            {teacherPlans.map((plan) => {
              const isCurrent = plan.name === activePlanName
              return (
                <div key={plan.name} className={`subscription-plan-card ${isCurrent ? 'is-current' : ''}`}>
                  <h3>{plan.name}</h3>
                  <p className="subscription-plan-price">
                    {plan.price}
                    {plan.period && <span>{plan.period}</span>}
                  </p>
                  <p className="subscription-plan-desc">{plan.desc}</p>
                  <ul className="subscription-plan-features">
                    {plan.features.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                  {isCurrent ? (
                    <span className="subscription-current-badge">Current Plan</span>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-primary subscription-switch-btn"
                      onClick={() => handleSwitchPlan(plan)}
                      disabled={switching !== null}
                    >
                      {switching === plan.name ? 'Switching…' : 'Switch to this plan'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          {message && <p className={`subscription-message is-${message.type}`}>{message.text}</p>}

          <p className="subscription-disclaimer">
            <Info size={13} />
            <span>This changes your plan immediately — no payment is processed by this page.</span>
          </p>
        </>
      )}
    </div>
  )
}

export default Subscription
