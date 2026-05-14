export const maxDuration = 30

import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

const ENUM_TO_STARS = { high: 4, medium: 3, low: 2 }
const PERSONALITY_MAP = {
  cooperative: '楽観的',
  anxious: '心配性',
  resistant: '頑固',
  lazy: 'ルーズ',
  angry: '短気'
}
const EATING_HABIT_MAP = {
  home_cooking: '自炊中心',
  eating_out: '外食中心',
  night_eating: '夜食習慣あり',
  irregular: '不規則な食生活'
}
const MEDICATION_ATTITUDE_MAP = {
  positive: 5,
  neutral: 3,
  negative: 2,
  very_negative: 1
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v))
}

// 喫煙状態の進行ルール
function progressSmokingLabel(currentLabel, intervention, lifestyleMotivation) {
  if (!currentLabel || currentLabel === '非喫煙者') {
    return { label: currentLabel || '非喫煙者', comment: null }
  }

  const noIntervention = !intervention || !intervention.given
  const accepted = intervention && intervention.accepted

  // 介入なしの場合
  if (noIntervention) {
    if (currentLabel === '禁煙挑戦中') {
      // フォローアップなしで意欲低い場合は再開リスク
      if ((lifestyleMotivation || 3) < 3) {
        return { label: '再開', comment: 'フォローなしで再喫煙' }
      }
      // 50% 確率（lifestyle_motivation で判定）
      return { label: '禁煙挑戦中', comment: null }
    }
    return { label: currentLabel, comment: null }
  }

  // 介入あり + 拒否
  if (!accepted) {
    return { label: currentLabel, comment: null }
  }

  // 介入あり + 受容
  if (currentLabel === '喫煙継続') {
    if (intervention.strength === 'strong' && (lifestyleMotivation || 3) >= 4) {
      return { label: '禁煙挑戦中', comment: '禁煙開始、たまに吸う' }
    }
    if (intervention.strength === 'strong' || intervention.strength === 'moderate') {
      return { label: '減量中', comment: '本数を半減' }
    }
    return { label: '喫煙継続', comment: null }
  }

  if (currentLabel === '減量中') {
    if (intervention.strength === 'strong' || intervention.strength === 'moderate') {
      return { label: '禁煙挑戦中', comment: '禁煙開始' }
    }
    return { label: '減量中', comment: '減量継続中' }
  }

  if (currentLabel === '禁煙挑戦中') {
    return { label: '禁煙成功', comment: '禁煙継続中' }
  }

  if (currentLabel === '禁煙成功') {
    return { label: '禁煙成功', comment: '禁煙継続中' }
  }

  if (currentLabel === '再開') {
    if (intervention.strength === 'strong') {
      return { label: '減量中', comment: '再度減量に取り組み中' }
    }
    return { label: '再開', comment: null }
  }

  return { label: currentLabel, comment: null }
}

// 飲酒状態の進行ルール
function progressDrinkingLabel(currentLabel, intervention, lifestyleMotivation) {
  if (!currentLabel || currentLabel === '非飲酒者') {
    return { label: currentLabel || '非飲酒者', comment: null }
  }

  const noIntervention = !intervention || !intervention.given
  const accepted = intervention && intervention.accepted

  if (noIntervention) {
    return { label: currentLabel, comment: null }
  }

  if (!accepted) {
    return { label: currentLabel, comment: null }
  }

  // 受容の場合: 段階的に減少
  if (currentLabel === '過量') {
    if (intervention.strength === 'strong' && (lifestyleMotivation || 3) >= 4) {
      return { label: '適量', comment: '節酒に成功（適量へ）' }
    }
    return { label: 'やや過量', comment: '減らしているが目標未達' }
  }

  if (currentLabel === 'やや過量') {
    if (intervention.strength === 'strong' || intervention.strength === 'moderate') {
      return { label: '適量', comment: '節酒成功' }
    }
    return { label: 'やや過量', comment: '減量努力中' }
  }

  if (currentLabel === '適量') {
    if (intervention.strength === 'strong' && (lifestyleMotivation || 3) >= 4) {
      return { label: '禁酒', comment: '禁酒継続中' }
    }
    return { label: '適量', comment: null }
  }

  if (currentLabel === '禁酒') {
    return { label: '禁酒', comment: null }
  }

  return { label: currentLabel, comment: null }
}

function convertHiddenParams(hidden, visitNumber) {
  const adherenceStar = ENUM_TO_STARS[hidden.adherence_level] || 3
  const medAttitude = hidden.medication_attitude
  // 薄薬への態度を優先して初期服薬意欲を計算
  // very_negative / negative の患者は初期是ˇ0-2（薄薬への抵抗感を反映）
  let medMotivation
  if (medAttitude === 'very_negative') {
    medMotivation = adherenceStar >= 4 ? 1 : 1
  } else if (medAttitude === 'negative') {
    medMotivation = adherenceStar >= 4 ? 2 : 1
  } else if (medAttitude === 'neutral') {
    medMotivation = adherenceStar
  } else if (medAttitude === 'positive') {
    medMotivation = Math.min(5, adherenceStar + 1)
  } else {
    medMotivation = 3
  }
  // CHECK 制約 (1-5) に確実に収める
  medMotivation = clamp(medMotivation, 1, 5)
  const lifestyleMot = ENUM_TO_STARS[hidden.lifestyle_motivation] || 3

  return {
    visit_number: visitNumber,
    personality: PERSONALITY_MAP[hidden.personality_type] || '内向的',
    eating_habit_label: EATING_HABIT_MAP[hidden.eating_habit] || '不規則な食生活',
    eating_habit_comment: hidden.eating_habit_comment || '',
    exercise_habit_label: hidden.exercise_habit_label || 'ほとんど運動しない',
    exercise_habit_comment: hidden.exercise_habit_comment || '',
    stress: ENUM_TO_STARS[hidden.stress_level] || 3,
    busyness: ENUM_TO_STARS[hidden.work_busyness] || 3,
    lifestyle_motivation: lifestyleMot,
    medication_motivation: medMotivation,
    smoking_label: hidden.smoking_initial || null,
    smoking_comment: hidden.smoking_detail || null,
    drinking_label: hidden.drinking_initial || null,
    drinking_comment: hidden.drinking_detail || null,
    trust_level: 0,
    initial_lifestyle_motivation: lifestyleMot,
    initial_medication_motivation: medMotivation,
    initial_trust_level: 0
  }
}

function buildFromPreviousVisit(prev, visitNumber) {
  // Apply treatment effects from previous visit
  const pendingChanges = {}
  let newStress = prev.stress
  let newBusyness = prev.busyness
  let newEatingLabel = prev.eating_habit_label
  let newEatingComment = prev.eating_habit_comment
  let newExerciseLabel = prev.exercise_habit_label
  let newExerciseComment = prev.exercise_habit_comment

  // Social support given in Visit 1 → reduce stress and busyness by 1
  if (prev.social_support_given) {
    if (newStress > 1) {
      newStress = clamp(newStress - 1, 1, 5)
      pendingChanges.stress = '↓'
    }
    if (newBusyness > 1) {
      newBusyness = clamp(newBusyness - 1, 1, 5)
      pendingChanges.busyness = '↓'
    }
  }

  // Mark exercise/diet as pending change source if treatments were given
  // (actual label changes happen during interview based on patient reports)
  if (prev.exercise_treatment_given) {
    pendingChanges.exercise_treatment = true
  }
  if (prev.diet_treatment_given) {
    pendingChanges.diet_treatment = true
  }

  // 喫煙・飲酒の進行ルールを適用
  const smokingResult = progressSmokingLabel(prev.smoking_label, prev.smoking_intervention, prev.lifestyle_motivation)
  const drinkingResult = progressDrinkingLabel(prev.drinking_label, prev.drinking_intervention, prev.lifestyle_motivation)

  // 状態変化があれば pending_treatment_changes に記録
  if (smokingResult.label !== prev.smoking_label) {
    pendingChanges.smoking_change = prev.smoking_label + ' → ' + smokingResult.label
  }
  if (drinkingResult.label !== prev.drinking_label) {
    pendingChanges.drinking_change = prev.drinking_label + ' → ' + drinkingResult.label
  }

  return {
    visit_number: visitNumber,
    personality: prev.personality,
    eating_habit_label: newEatingLabel,
    eating_habit_comment: newEatingComment,
    exercise_habit_label: newExerciseLabel,
    exercise_habit_comment: newExerciseComment,
    stress: newStress,
    busyness: newBusyness,
    lifestyle_motivation: prev.lifestyle_motivation,
    medication_motivation: prev.medication_motivation,
    trust_level: prev.trust_level || 0,
    initial_lifestyle_motivation: prev.lifestyle_motivation,
    initial_medication_motivation: prev.medication_motivation,
    initial_trust_level: prev.trust_level || 0,
    smoking_label: smokingResult.label,
    smoking_comment: smokingResult.comment !== null ? smokingResult.comment : (prev.smoking_comment || null),
    drinking_label: drinkingResult.label,
    drinking_comment: drinkingResult.comment !== null ? drinkingResult.comment : (prev.drinking_comment || null),
    lifestyle_agreements: {},
    pending_treatment_changes: Object.keys(pendingChanges).length > 0 ? pendingChanges : null
  }
}

export async function GET(req) {
  try {
    const url = new URL(req.url)
    const caseId = url.searchParams.get('caseId')
    const visitNumber = parseInt(url.searchParams.get('visit') || '1')

    if (!caseId) {
      return Response.json({ error: 'caseId required' }, { status: 400 })
    }

    const supabase = getAdminClient()

    const { data: existing } = await supabase
      .from('visit_parameters')
      .select('*')
      .eq('case_id', caseId)
      .eq('visit_number', visitNumber)
      .maybeSingle()

    if (existing) {
      return Response.json({ params: existing })
    }

    let newParams = null

    if (visitNumber >= 2) {
      const { data: prevVisit } = await supabase
        .from('visit_parameters')
        .select('*')
        .eq('case_id', caseId)
        .eq('visit_number', visitNumber - 1)
        .maybeSingle()
      if (prevVisit) {
        newParams = buildFromPreviousVisit(prevVisit, visitNumber)
      }
    }

    if (!newParams) {
      const { data: caseData, error: caseErr } = await supabase
        .from('cases')
        .select('patient_data')
        .eq('id', caseId)
        .single()

      if (caseErr || !caseData) {
        return Response.json({ error: 'case not found' }, { status: 404 })
      }

      const hidden = caseData.patient_data?.hidden_params || {}
      // top-level smoking/drinking を hidden に merge して渡す
      hidden.smoking_initial = caseData.patient_data?.smoking_initial
      hidden.smoking_detail = caseData.patient_data?.smoking_detail
      hidden.drinking_initial = caseData.patient_data?.drinking_initial
      hidden.drinking_detail = caseData.patient_data?.drinking_detail
      newParams = convertHiddenParams(hidden, visitNumber)
    }

    const { data: inserted, error: insErr } = await supabase
      .from('visit_parameters')
      .insert({ case_id: caseId, ...newParams })
      .select()
      .single()

    if (insErr) {
      return Response.json({ error: insErr.message }, { status: 500 })
    }

    return Response.json({ params: inserted })

  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}

export async function PATCH(req) {
  try {
    const { caseId, visitNumber, updates } = await req.json()

    if (!caseId || !visitNumber) {
      return Response.json({ error: 'caseId and visitNumber required' }, { status: 400 })
    }

    const supabase = getAdminClient()

    const { data, error } = await supabase
      .from('visit_parameters')
      .update(updates)
      .eq('case_id', caseId)
      .eq('visit_number', visitNumber)
      .select()
      .single()

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ params: data })

  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req) {
  try {
    const { caseId, visitNumber, params } = await req.json()

    if (!caseId || !visitNumber) {
      return Response.json({ error: 'caseId and visitNumber required' }, { status: 400 })
    }

    const supabase = getAdminClient()

    const { data, error } = await supabase
      .from('visit_parameters')
      .insert({ case_id: caseId, visit_number: visitNumber, ...params })
      .select()
      .single()

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ params: data })

  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
