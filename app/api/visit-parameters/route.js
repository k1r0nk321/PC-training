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

function convertHiddenParams(hidden, visitNumber) {
  const adherenceStar = ENUM_TO_STARS[hidden.adherence_level] || 3
  const medAttitudeStar = MEDICATION_ATTITUDE_MAP[hidden.medication_attitude] || 3
  const medMotivation = Math.round((adherenceStar + medAttitudeStar) / 2)
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
    trust_level: 0,
    initial_lifestyle_motivation: lifestyleMot,
    initial_medication_motivation: medMotivation,
    initial_trust_level: 0
  }
}

function buildFromPreviousVisit(prev, visitNumber) {
  return {
    visit_number: visitNumber,
    personality: prev.personality,
    eating_habit_label: prev.eating_habit_label,
    eating_habit_comment: prev.eating_habit_comment,
    exercise_habit_label: prev.exercise_habit_label,
    exercise_habit_comment: prev.exercise_habit_comment,
    stress: prev.stress,
    busyness: prev.busyness,
    lifestyle_motivation: prev.lifestyle_motivation,
    medication_motivation: prev.medication_motivation,
    trust_level: prev.trust_level || 0,
    initial_lifestyle_motivation: prev.lifestyle_motivation,
    initial_medication_motivation: prev.medication_motivation,
    initial_trust_level: prev.trust_level || 0
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

    // Try to fetch existing visit_parameters row
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

    // For Visit 2+, try to inherit from previous visit
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

    // Fallback: convert from hidden_params
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
