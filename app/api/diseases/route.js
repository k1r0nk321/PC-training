import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

export async function GET(req) {
  try {
    const supabase = getAdminClient()

    // 疾患マスタを取得
    const { data: diseases, error: dErr } = await supabase
      .from('diseases')
      .select('id, name_ja, name_en, category, difficulty_level')
      .eq('is_active', true)
      .order('sort_order')

    if (dErr) {
      return Response.json({ error: dErr.message }, { status: 500 })
    }

    // 全 model_cases を取得して疾患ごとに件数を集計
    const { data: cases, error: cErr } = await supabase
      .from('model_cases')
      .select('disease_id')
      .eq('is_active', true)

    if (cErr) {
      return Response.json({ error: cErr.message }, { status: 500 })
    }

    const countByDisease = {}
    ;(cases || []).forEach(function(c) {
      if (c.disease_id) {
        countByDisease[c.disease_id] = (countByDisease[c.disease_id] || 0) + 1
      }
    })

    const enrichedDiseases = (diseases || []).map(function(d) {
      return Object.assign({}, d, { case_count: countByDisease[d.id] || 0 })
    })

    return Response.json({ diseases: enrichedDiseases })

  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
