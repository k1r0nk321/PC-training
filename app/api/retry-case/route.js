import { createClient } from '@supabase/supabase-js'

export const maxDuration = 15

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

export async function POST(req) {
  try {
    const { sourceCaseId } = await req.json()
    if (!sourceCaseId) {
      return Response.json({ error: 'sourceCaseId required' }, { status: 400 })
    }
    const supabase = getAdminClient()
    const { data: src, error: sErr } = await supabase
      .from('cases')
      .select('user_id, disease_id, disease_name, model_case_id, patient_data')
      .eq('id', sourceCaseId)
      .single()
    if (sErr || !src) {
      return Response.json({ error: 'source case not found' }, { status: 404 })
    }
    if (!src.patient_data) {
      return Response.json({ error: 'source case has no patient data to retry from' }, { status: 400 })
    }
    const { data: created, error: cErr } = await supabase
      .from('cases')
      .insert({
        user_id: src.user_id,
        disease_id: src.disease_id,
        disease_name: src.disease_name,
        model_case_id: src.model_case_id,
        patient_data: src.patient_data,
        current_visit: 1,
        status: 'visit1',
      })
      .select('id')
      .single()
    if (cErr) {
      return Response.json({ error: cErr.message }, { status: 500 })
    }
    return Response.json({ newCaseId: created.id })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
