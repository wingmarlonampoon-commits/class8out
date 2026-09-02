import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/useAuth'
import { DEFAULT_COMPANY_SETTINGS, type CompanySettings } from '../data/companySettings'

type Subscription = { plan: string; price: string; period: string; subscribed_at?: string }

export type CompanyTeacherIdentity = {
  kind: 'company'
  teacherId: string
  name: string
  email: string
  companyCode: string
  companyName: string
  companySettings: CompanySettings
  companySubscription: Subscription | null
  selfBookingAllowed: boolean
}

export type FreelanceTeacherIdentity = {
  kind: 'freelance'
  teacherId: string
  name: string
  email: string
  settings: { timezone: string; time_interval: '30' | '60' }
  subscription: Subscription | null
}

export type TeacherIdentity = CompanyTeacherIdentity | FreelanceTeacherIdentity

// Both kinds of teacher sign up under the same ROLE.TEACHER (role is pure
// JWT-trust in this app, never re-derived from a table) — so every Teacher
// page needs to resolve which kind it's dealing with itself. Tries the
// company org chart first, falls back to the freelance_teachers table.
export function useTeacherIdentity(): { identity: TeacherIdentity | null; loading: boolean } {
  const { session } = useAuth()
  const [identity, setIdentity] = useState<TeacherIdentity | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const email = session?.user.email
    if (!email) return

    let cancelled = false

    async function resolve() {
      const { data: orgRow } = await supabase
        .from('company_organizational_chart')
        .select('id, name, email, company_code')
        .eq('email', email as string)
        .eq('employee_type', 'Teacher')
        .maybeSingle()

      if (orgRow) {
        const { data: companyRows } = await supabase
          .from('company_registration')
          .select('company_name, company_settings, subscription, created_at')
          .eq('CompanyCode', orgRow.company_code)
          .order('created_at', { ascending: true })
          .limit(1)

        if (cancelled) return

        const company = companyRows?.[0]
        const settings: CompanySettings = { ...DEFAULT_COMPANY_SETTINGS, ...(company?.company_settings ?? {}) }

        setIdentity({
          kind: 'company',
          teacherId: orgRow.id,
          name: orgRow.name,
          email: orgRow.email,
          companyCode: orgRow.company_code,
          companyName: company?.company_name ?? '',
          companySettings: settings,
          companySubscription: company?.subscription ?? null,
          selfBookingAllowed: settings.teacher_self_booking,
        })
        setLoading(false)
        return
      }

      const { data: freelanceRow } = await supabase
        .from('freelance_teachers')
        .select('id, names, email, settings, subscription')
        .eq('email', email as string)
        .maybeSingle()

      if (cancelled) return

      if (freelanceRow) {
        setIdentity({
          kind: 'freelance',
          teacherId: freelanceRow.id,
          name: freelanceRow.names,
          email: freelanceRow.email,
          settings: {
            timezone: freelanceRow.settings?.timezone ?? DEFAULT_COMPANY_SETTINGS.timezone,
            time_interval: freelanceRow.settings?.time_interval ?? DEFAULT_COMPANY_SETTINGS.time_interval,
          },
          subscription: freelanceRow.subscription ?? null,
        })
      } else {
        setIdentity(null)
      }
      setLoading(false)
    }

    resolve()

    return () => {
      cancelled = true
    }
  }, [session])

  return { identity, loading }
}
