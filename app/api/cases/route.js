export const maxDuration = 60

import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req) {
  try {
    const { diseaseId, diseaseName, userId } = await req.json()
    const supabase = getAdminClient()

    const { data: medications } = await supabase
      .from('medications')
      .select('drug_category, drug_name_generic, first_line')
      .eq('disease_id', diseaseId)
      .eq('first_line', true)
      .limit(3)

    const medText = medications
      ? medications.map(function(m) { return m.drug_name_generic }).join('・')
      : ''

    const prompt = `プライマリケア研修医向け外来シミュレーションの${diseaseName}初診患者の症例をJSONで生成。JSON以外不要。

{
  "patient": {
    "name": "架空の日本人名",
    "age": 40から75の整数,
    "gender": "男性"または"女性",
    "occupation": "職業",
    "chief_complaint": "主訴（患者の言葉で）",
    "history": "現病歴（2〜3文）",
    "past_history": "既往歴",
    "family_history": "家族歴",
    "social_history": "生活歴（飲酒・喫煙・運動・食事習慣・外食頻度・夜食習慣）",
    "vitals": {
      "bp": "血圧（例：158/96 mmHg）",
      "hr": "脈拍（例：78 bpm）",
      "temp": "体温（例：36.5℃）",
      "spo2": "SpO2（例：98%）",
      "height": "身長（数値のみ）",
      "weight": "体重（数値のみ）",
      "bmi": "BMI（小数点1桁）"
    },
    "hidden_params": {
      "adherence_level": "high"または"medium"または"low",
      "lifestyle_motivation": "high"または"medium"または"low",
      "social_background": "独居"または"家族同居"または"その他",
      "stress_level": "high"または"medium"または"low",
      "work_busyness": "high"または"medium"または"low",
      "personality_type": "cooperative"または"anxious"または"resistant"または"lazy"または"angry",
      "eating_habit": "home_cooking"または"eating_out"または"night_eating"または"irregular",
      "medication_attitude": "positive"または"neutral"または"negative"または"very_negative"
    }
  },
  "scenario": {
    "difficulty": 1または2または3,
    "key_points": ["学習ポイント1", "学習ポイント2", "学習ポイント3"],
    "expected_diagnosis": "${diseaseName}",
    "expected_medications": ["${medText}"],
    "expected_lifestyle_guidance": ["推奨される生活指導1", "推奨される生活指導2"]
  }
}`

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    })

    const responseText = message.content[0].text
    const cleanText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const caseData = JSON.parse(cleanText)

    const { data: newCase, error } = await supabase
      .from('cases')
      .insert({
        user_id: userId,
        disease_id: diseaseId,
        disease_name: diseaseName,
        patient_data: caseData.patient,
        scenario_data: caseData.scenario,
        current_visit: 1,
        status: 'in_progress',
      })
      .select('id')
      .single()

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ caseId: newCase.id })

  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
