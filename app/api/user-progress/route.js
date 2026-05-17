import { createClient } from '@supabase/supabase-js'

export const maxDuration = 15

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

const TITLES = {
  1: '新米研修医', 2: '駆け出し研修医', 3: '独り立ち研修医', 4: '中堅研修医', 5: '研修修了者',
  6: '新米専攻医', 7: '若手専攻医', 8: '中堅専攻医', 9: '精鋭専攻医', 10: 'ベテラン専攻医',
  11: '新米指導医', 12: '若手指導医', 13: '中堅指導医', 14: '熟練指導医', 15: 'ベテラン指導医',
  16: '鉄壁のジェネラリスト', 17: '不朽のジェネラリスト', 18: '無双のジェネラリスト', 19: '至高のジェネラリスト', 20: '伝説のジェネラリスト',
}

const PHASE_INFO = {
  '初期研修医': { ranks: [1, 5], inc: 5, baseCount: 0, nextPhaseRequirement: { diseases: 5, label: '専攻医', minCount: 25 } },
  '専攻医': { ranks: [6, 10], inc: 7, baseCount: 25, nextPhaseRequirement: { diseases: 10, label: '指導医', minCount: 60 } },
  '指導医': { ranks: [11, 15], inc: 10, baseCount: 60, nextPhaseRequirement: { diseases: 15, label: 'ジェネラリスト', minCount: 110 } },
  'ジェネラリスト': { ranks: [16, 20], inc: 10, baseCount: 110, nextPhaseRequirement: null },
}

function computeRank(passCount, completedDiseases) {
  // 初期研修医 phase
  if (passCount < 25) {
    const rank = Math.min(5, Math.floor(passCount / 5) + 1)
    const phaseEnd = 25
    return {
      rank: rank, phase: '初期研修医', title: TITLES[rank],
      passCount: passCount, completedDiseases: completedDiseases,
      nextRankCount: rank < 5 ? rank * 5 : phaseEnd,
      requirementMet: true, blocker: null,
    }
  }
  if (completedDiseases < 5) {
    return {
      rank: 5, phase: '初期研修医', title: TITLES[5],
      passCount: passCount, completedDiseases: completedDiseases,
      nextRankCount: null,
      requirementMet: false,
      blocker: { type: 'disease_coverage', current: completedDiseases, required: 5, nextPhase: '専攻医' }
    }
  }
  // 専攻医 phase
  if (passCount < 60) {
    const rank = Math.min(10, 6 + Math.floor((passCount - 25) / 7))
    const phaseEnd = 60
    return {
      rank: rank, phase: '専攻医', title: TITLES[rank],
      passCount: passCount, completedDiseases: completedDiseases,
      nextRankCount: rank < 10 ? 25 + (rank - 5) * 7 : phaseEnd,
      requirementMet: true, blocker: null,
    }
  }
  if (completedDiseases < 10) {
    return {
      rank: 10, phase: '専攻医', title: TITLES[10],
      passCount: passCount, completedDiseases: completedDiseases,
      nextRankCount: null,
      requirementMet: false,
      blocker: { type: 'disease_coverage', current: completedDiseases, required: 10, nextPhase: '指導医' }
    }
  }
  // 指導医 phase
  if (passCount < 110) {
    const rank = Math.min(15, 11 + Math.floor((passCount - 60) / 10))
    const phaseEnd = 110
    return {
      rank: rank, phase: '指導医', title: TITLES[rank],
      passCount: passCount, completedDiseases: completedDiseases,
      nextRankCount: rank < 15 ? 60 + (rank - 10) * 10 : phaseEnd,
      requirementMet: true, blocker: null,
    }
  }
  if (completedDiseases < 15) {
    return {
      rank: 15, phase: '指導医', title: TITLES[15],
      passCount: passCount, completedDiseases: completedDiseases,
      nextRankCount: null,
      requirementMet: false,
      blocker: { type: 'disease_coverage', current: completedDiseases, required: 15, nextPhase: 'ジェネラリスト' }
    }
  }
  // ジェネラリスト phase
  const rank = Math.min(20, 16 + Math.floor((passCount - 110) / 10))
  return {
    rank: rank, phase: 'ジェネラリスト', title: TITLES[rank],
    passCount: passCount, completedDiseases: completedDiseases,
    nextRankCount: rank < 20 ? 110 + (rank - 15) * 10 : null,
    requirementMet: true, blocker: null,
  }
}

export async function GET(req) {
  try {
    const url = new URL(req.url)
    const userId = url.searchParams.get('userId')
    if (!userId) return Response.json({ error: 'userId required' }, { status: 400 })
    const supabase = getAdminClient()

    // ユーザーの完遂症例を取得
    const { data: completed, error: cErr } = await supabase
      .from('cases')
      .select('id, disease_id, disease_name, model_case_id, final_score, completed_at')
      .eq('user_id', userId)
      .not('completed_at', 'is', null)

    if (cErr) return Response.json({ error: cErr.message }, { status: 500 })

    const allCompleted = completed || []

    // 合格 = final_score >= 70（モデル症例 + ランダム症例 すべて含む）
    const passedCases = allCompleted.filter(function(c) { return c.final_score !== null && c.final_score >= 70 })
    const passCount = passedCases.length

    // 領域達成度計算: モデル症例のみが対象
    // 各疾患について、その疾患の全 model_cases が合格しているか判定
    const passedModelCases = passedCases.filter(function(c) { return c.model_case_id !== null })
    const passedModelCaseIds = new Set(passedModelCases.map(function(c) { return c.model_case_id }))

    // 全疾患の全 model_cases を取得
    const { data: allModelCases } = await supabase
      .from('model_cases')
      .select('id, disease_id')

    // 疾患ごとの model_cases リスト
    const byDisease = {}
    ;(allModelCases || []).forEach(function(mc) {
      if (!byDisease[mc.disease_id]) byDisease[mc.disease_id] = []
      byDisease[mc.disease_id].push(mc.id)
    })

    // 各疾患について、全 model_cases が合格しているか
    const diseaseIds = Object.keys(byDisease)
    const fullyCompletedDiseaseIds = diseaseIds.filter(function(did) {
      const required = byDisease[did]
      return required.every(function(mcid) { return passedModelCaseIds.has(mcid) })
    })
    const completedDiseases = fullyCompletedDiseaseIds.length

    // 疾患情報も取得（表示用）
    let diseaseInfo = []
    if (diseaseIds.length > 0) {
      const { data: diseases } = await supabase
        .from('diseases')
        .select('id, name_ja, category')
        .in('id', diseaseIds)
      if (diseases) {
        diseaseInfo = diseases.map(function(d) {
          const requiredIds = byDisease[d.id]
          const passedCount = requiredIds.filter(function(mcid) { return passedModelCaseIds.has(mcid) }).length
          return {
            id: d.id,
            name: d.name_ja,
            category: d.category,
            total_model_cases: requiredIds.length,
            passed_model_cases: passedCount,
            complete: passedCount === requiredIds.length,
          }
        }).sort(function(a, b) {
          if (a.category !== b.category) return a.category.localeCompare(b.category)
          return a.name.localeCompare(b.name)
        })
      }
    }

    // ランク計算
    const rankInfo = computeRank(passCount, completedDiseases)

    // 匿名ユーザー判定（デモ表示用）
    let isAnonymous = false
    try {
      const { data: { user: u } } = await supabase.auth.admin.getUserById(userId)
      if (u && u.is_anonymous) isAnonymous = true
    } catch (e) {}

    const DEMO_LIMIT = 10
    const demoInfo = isAnonymous ? {
      is_demo: true,
      demo_limit: DEMO_LIMIT,
      demo_completed: passedCases.length,  // 厳密には全完遂数ベース
      demo_total_completed: allCompleted.length,
      demo_remaining: Math.max(0, DEMO_LIMIT - allCompleted.length),
      demo_reached: allCompleted.length >= DEMO_LIMIT,
    } : { is_demo: false }

    return Response.json({
      ...rankInfo,
      totalCompleted: allCompleted.length,
      diseaseCoverage: diseaseInfo,
      ...demoInfo,
    })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
