import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const diseaseId = searchParams.get('diseaseId')
    const supabase = getAdminClient()

    let query = supabase
      .from('model_cases')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')

    if (diseaseId) {
      query = query.eq('disease_id', diseaseId)
    }

    const { data, error } = await query
    if (error) return Response.json({ error: error.message }, { status: 500 })

    return Response.json({ modelCases: data || [] })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req) {
  try {
    const { modelCaseId, userId } = await req.json()
    const supabase = getAdminClient()

    // モデル症例を取得
    const { data: modelCase, error: mcError } = await supabase
      .from('model_cases')
      .select('*')
      .eq('id', modelCaseId)
      .single()

    if (mcError || !modelCase) {
      return Response.json({ error: 'Model case not found' }, { status: 404 })
    }

    // casesテーブルに登録
    const { data: newCase, error: insertError } = await supabase
      .from('cases')
      .insert({
        user_id: userId,
        disease_id: modelCase.disease_id,
        disease_name: modelCase.disease_name,
        patient_data: modelCase.patient_data,
        scenario_data: modelCase.scenario_data,
        status: 'in_progress',
        model_case_id: modelCaseId,
      })
      .select()
      .single()

    if (insertError) {
      return Response.json({ error: insertError.message }, { status: 500 })
    }

    return Response.json({ case: newCase })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
