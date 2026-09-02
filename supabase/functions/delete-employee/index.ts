// Deletes a Teacher or Admin: removes their row (company_organizational_chart
// or company_registration) AND their Supabase Auth account. Both steps need
// the service_role key (Admin API for the auth user, and to bypass RLS for
// the authorization checks redone manually below) — that key must never
// reach client code, so this runs as an Edge Function instead of a direct
// client-side call.
//
// Admin deletion is restricted to the "Mother Admin" — the company_registration
// row with the earliest created_at for that CompanyCode, i.e. whoever went
// through the original signup on the home page. Co-admins created later
// (Employees.tsx) cannot delete other admins, and the Mother Admin can't be
// deleted at all (a company must always keep its founding admin).
//
// Deploy: npx supabase functions deploy delete-employee

import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function deleteAuthUserByEmail(email: string) {
  const lookupRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(email)}`, {
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
  })
  const lookupJson = await lookupRes.json()
  const authUser = (lookupJson.users ?? []).find((u: { email?: string }) => u.email === email)
  if (!authUser) return

  await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${authUser.id}`, {
    method: 'DELETE',
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Missing Authorization header.' }, 401)

  const { type, id } = await req.json().catch(() => ({ type: null, id: null }))
  if (type !== 'teacher' && type !== 'admin') return json({ error: 'type must be "teacher" or "admin".' }, 400)
  if (!id) return json({ error: 'id is required.' }, 400)

  // Identify the caller from their own JWT (anon key + their token, not service role).
  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const {
    data: { user: caller },
  } = await callerClient.auth.getUser()

  if (!caller?.email) return json({ error: 'Could not verify the signed-in admin.' }, 401)

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  const { data: ownedCompanies } = await admin
    .from('company_registration')
    .select('CompanyCode')
    .eq('email', caller.email)

  const ownedCodes = new Set((ownedCompanies ?? []).map((c) => c.CompanyCode))
  if (ownedCodes.size === 0) return json({ error: 'You are not a company admin.' }, 403)

  if (type === 'teacher') {
    const { data: teacher, error: teacherLookupError } = await admin
      .from('company_organizational_chart')
      .select('id, email, company_code, employee_type')
      .eq('id', id)
      .single()

    if (teacherLookupError || !teacher) return json({ error: 'Teacher not found.' }, 404)
    if (teacher.employee_type !== 'Teacher') return json({ error: 'That record is not a teacher.' }, 400)
    if (!ownedCodes.has(teacher.company_code)) return json({ error: 'Not authorized to delete this teacher.' }, 403)

    const { error: deleteRowError } = await admin.from('company_organizational_chart').delete().eq('id', id)
    if (deleteRowError) return json({ error: 'Could not delete the teacher record.' }, 500)

    if (teacher.email) await deleteAuthUserByEmail(teacher.email)
    return json({ success: true })
  }

  // type === 'admin'
  const { data: target, error: targetLookupError } = await admin
    .from('company_registration')
    .select('id, email, CompanyCode')
    .eq('id', id)
    .single()

  if (targetLookupError || !target) return json({ error: 'Admin not found.' }, 404)
  if (!ownedCodes.has(target.CompanyCode)) return json({ error: 'Not authorized to delete this admin.' }, 403)

  const { data: companyAdmins } = await admin
    .from('company_registration')
    .select('id, email, created_at')
    .eq('CompanyCode', target.CompanyCode)
    .order('created_at', { ascending: true })

  const motherAdmin = companyAdmins?.[0]
  if (!motherAdmin || motherAdmin.email !== caller.email) {
    return json({ error: 'Only the founding admin can delete other admins.' }, 403)
  }
  if (target.id === motherAdmin.id) {
    return json({ error: 'The founding admin cannot be deleted.' }, 400)
  }

  const { error: deleteRowError } = await admin.from('company_registration').delete().eq('id', id)
  if (deleteRowError) return json({ error: 'Could not delete the admin record.' }, 500)

  if (target.email) await deleteAuthUserByEmail(target.email)
  return json({ success: true })
})
