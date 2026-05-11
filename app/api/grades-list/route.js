import { createClient } from '@supabase/supabase-js'

export const maxDuration = 10

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

export async function GET(req) {
  try {
    const url = new URL(req.url)
    const userId = url.searchParams.get('userId')
    if (!userId) return Response.json({ error: 'userId required' }, { status: 400 })
    const supabase = getAdminClient()

    // 完遂した症例（final_score がある or 過去の visit3_data にある）を取得
    const { data: cases, error } = await supabase
      .from('cases')
      .select('id, disease_id, disease_name, model_case_id, patient_data, visit3_feedback, visit3_data, final_score, final_score_breakdown, completed_at, created_at')
      .eq('user_id', userId)
      .or('final_score.not.is.null,visit3_feedback.not.is.null')
      .order('completed_at', { ascending: false, nullsFirst: false })

    if (error) return Response.json({ error: error.message }, { status: 500 })

    // diseases.category を結合（軽量に）
    const diseaseIds = [...new Set((cases || []).map(function(c) { return c.disease_id }).filter(Boolean))]
    let categoryMap = {}
    if (diseaseIds.length > 0) {
      const { data: diseases } = await supabase
        .from('diseases').select('id, name_ja, category')
        .in('id', diseaseIds)
      if (diseases) {
        diseases.forEach(function(d) { categoryMap[d.id] = { name: d.name_ja, category: d.category } })
      }
    }

    // 形式: 各 case に category を付与し、新旧両形式の score をまとめる
    const result = (cases || []).map(function(c) {
      const dInfo = categoryMap[c.disease_id] || { name: c.disease_name, category: '未分類' }
      const score = c.final_score != null ? c.final_score : (c.visit3_data?.finalScore || null)
      const breakdown = c.final_score_breakdown || c.visit3_data?.breakdown || null
      return {
        id: c.id,
        disease_id: c.disease_id,
        disease_name: c.disease_name || dInfo.name,
        category: dInfo.category,
        model_case_id: c.model_case_id,
        patient: c.patient_data ? {
          name: c.patient_data.name,
          age: c.patient_data.age,
          gender: c.patient_data.gender,
          chief_complaint: c.patient_data.chief_complaint,
        } : null,
        score: score,
        breakdown: breakdown,
        feedback: c.visit3_feedback,
        completed_at: c.completed_at || c.created_at,
        archived: c.final_score != null,
      }
    })
    return Response.json({ cases: result })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
