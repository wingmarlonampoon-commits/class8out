// Deletes a student: removes their student_lists row AND their Supabase Auth
// account (if they were given a login). Both steps need the service_role key
// (Admin API for the auth user, and to bypass RLS for the authorization check
// redone manually below) — that key must never reach client code, so this
// runs as an Edge Function instead of a direct client-side call.
//
// Mirrors delete-employee's teacher-deletion path: any admin of the
// student's company may delete them.
//
// Deploy: npx supabase functions deploy delete-student

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

  const { id } = await req.json().catch(() => ({ id: null }))
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

  const { data: student, error: studentLookupError } = await admin
    .from('student_lists')
    .select('id, email, company_code')
    .eq('id', id)
    .single()

  if (studentLookupError || !student) return json({ error: 'Student not found.' }, 404)
  if (!ownedCodes.has(student.company_code)) return json({ error: 'Not authorized to delete this student.' }, 403)

  const { error: deleteRowError } = await admin.from('student_lists').delete().eq('id', id)
  if (deleteRowError) return json({ error: 'Could not delete the student record.' }, 500)

  if (student.email) await deleteAuthUserByEmail(student.email)
  return json({ success: true })
})
