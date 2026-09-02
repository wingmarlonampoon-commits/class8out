import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/useAuth'
import { DEFAULT_COMPANY_SETTINGS, type CompanySettings } from '../data/companySettings'

type StudentContact = { platform: string; handle: string }
type TeacherContact = { contacts?: StudentContact[] }

export type CompanyStudentIdentity = {
  kind: 'company'
  studentId: string
  name: string
  email: string
  Credits: number | null
  subject: string[] | null
  books: string[] | null
  contact: { phone?: string; contacts?: StudentContact[] } | null
  companyCode: string
  companyName: string
  companyEmail: string | null
  companyPhone: string | null
  companySettings: CompanySettings
}

export type FreelanceStudentIdentity = {
  kind: 'freelance'
  studentId: string
  name: string
  email: string
  Credits: number | null
  subject: string[] | null
  books: string[] | null
  contact: { phone?: string; contacts?: StudentContact[] } | null
  teacherId: string
  teacherName: string
  teacherEmail: string
  teacherPhone: string | null
  teacherPhoto: string | null
  teacherContact: TeacherContact | null
  teacherIntroVideo: string | null
  teacherIntroMessage: string | null
  teacherSubjects: string[] | null
  teacherRating: number | null
  teacherSettings: { timezone: string; time_interval: '30' | '60' }
}

export type StudentIdentity = CompanyStudentIdentity | FreelanceStudentIdentity

// Mirrors useTeacherIdentity.ts: a student's role is pure JWT-trust (ROLE.STUDENT),
// so every Student page resolves which kind of student it's dealing with itself.
// Tries student_lists (company) first, falls back to freelance_students.
export function useStudentIdentity(): { identity: StudentIdentity | null; loading: boolean } {
  const { session } = useAuth()
  const [identity, setIdentity] = useState<StudentIdentity | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const email = session?.user.email
    if (!email) return

    let cancelled = false

    async function resolve() {
      const { data: studentRow } = await supabase
        .from('student_lists')
        .select('id, name, email, "Credits", subject, books, contact, company_code')
        .eq('email', email as string)
        .maybeSingle()

      if (studentRow) {
        const { data: companyRows } = await supabase
          .from('company_registration')
          .select('company_name, email, phone_number, company_settings, created_at')
          .eq('CompanyCode', studentRow.company_code)
          .order('created_at', { ascending: true })
          .limit(1)

        if (cancelled) return

        const company = companyRows?.[0]
        const settings: CompanySettings = { ...DEFAULT_COMPANY_SETTINGS, ...(company?.company_settings ?? {}) }

        setIdentity({
          kind: 'company',
          studentId: studentRow.id,
          name: studentRow.name,
          email: studentRow.email ?? (email as string),
          Credits: studentRow.Credits,
          subject: studentRow.subject,
          books: studentRow.books,
          contact: studentRow.contact,
          companyCode: studentRow.company_code,
          companyName: company?.company_name ?? '',
          companyEmail: company?.email ?? null,
          companyPhone: company?.phone_number ?? null,
          companySettings: settings,
        })
        setLoading(false)
        return
      }

      const { data: freelanceRow } = await supabase
        .from('freelance_students')
        .select('id, name, email, "Credits", subject, books, contact, teacher_id')
        .eq('email', email as string)
        .maybeSingle()

      if (cancelled) return

      if (freelanceRow) {
        const { data: teacherRow } = await supabase
          .from('freelance_teachers')
          .select('id, names, email, phone, photo, "Contact", intro_video, intro_message, subject, rating, settings')
          .eq('id', freelanceRow.teacher_id)
          .maybeSingle()

        if (cancelled) return

        setIdentity({
          kind: 'freelance',
          studentId: freelanceRow.id,
          name: freelanceRow.name,
          email: freelanceRow.email ?? (email as string),
          Credits: freelanceRow.Credits,
          subject: freelanceRow.subject,
          books: freelanceRow.books,
          contact: freelanceRow.contact,
          teacherId: freelanceRow.teacher_id,
          teacherName: teacherRow?.names ?? '',
          teacherEmail: teacherRow?.email ?? '',
          teacherPhone: teacherRow?.phone ?? null,
          teacherPhoto: teacherRow?.photo ?? null,
          teacherContact: teacherRow?.Contact ?? null,
          teacherIntroVideo: teacherRow?.intro_video ?? null,
          teacherIntroMessage: teacherRow?.intro_message ?? null,
          teacherSubjects: teacherRow?.subject ?? null,
          teacherRating: teacherRow?.rating ?? null,
          teacherSettings: {
            timezone: teacherRow?.settings?.timezone ?? DEFAULT_COMPANY_SETTINGS.timezone,
            time_interval: teacherRow?.settings?.time_interval ?? DEFAULT_COMPANY_SETTINGS.time_interval,
          },
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