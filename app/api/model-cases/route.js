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
    // デモ制限チェック: 匿名ユーザーは 3 例まで
    try {
      const { data: { user: u } } = await supabase.auth.admin.getUserById(userId)
      if (u && u.is_anonymous) {
        const { count } = await supabase
          .from('cases').select('id', { count: 'exact', head: true })
          .eq('user_id', userId).not('completed_at', 'is', null)
        if ((count || 0) >= 3) {
          return Response.json({
            error: 'demo_limit_reached',
            message: 'デモ体験は 3 例までです。本登録すると無制限に体験できます。',
            isDemoLimit: true,
          }, { status: 403 })
        }
      }
    } catch (e) {}

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

    // Phase F+: 他の中断中症例（未完遂）を全て削除
    try {
      await supabase
        .from('cases')
        .delete()
        .eq('user_id', userId)
        .is('completed_at', null)
        .neq('id', newCase.id)
    } catch (e) {}

    return Response.json({ case: newCase })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
