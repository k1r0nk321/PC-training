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
毎回異なる患者背景・年齢・性別・職業・主訴・生活歴を生成すること。

{
  "patient": {
    "name": "架空の日本人名",
    "age": 35から80の間でランダムな整数,
    "gender": "男性"または"女性"をランダムに選択,
    "occupation": "会社員・自営業・主婦・農業・教師・医療職・無職・パート・管理職など多様な職業からランダムに選択",
    "chief_complaint": "主訴（健診指摘・頭痛・めまい・肩こり・動悸・息切れ・無症状の定期受診など多様なパターンからランダムに選択）",
    "history": "現病歴（2〜3文。発症時期・経緯・症状の特徴を多様に）",
    "past_history": "既往歴（なし・糖尿病・脂質異常症・痛風・喘息など多様に）",
    "family_history": "家族歴（高血圧・脳卒中・心筋梗塞・糖尿病など多様に）",
    "social_history": "生活歴（飲酒習慣・喫煙歴・運動習慣・食事習慣・外食頻度・夜食習慣を具体的に記載）",
    "vitals": {
      "bp": "血圧（140〜180/80〜110の範囲でランダム。例：152/94 mmHg）",
      "hr": "脈拍（60〜90 bpmの範囲でランダム）",
      "temp": "体温（36.2〜36.8℃の範囲でランダム）",
      "spo2": "SpO2（96〜99%の範囲でランダム）",
      "height": "身長（150〜180の範囲でランダム、数値のみ）",
      "weight": "体重（50〜95の範囲でランダム、数値のみ）",
      "bmi": "BMI（小数点1桁、身長と体重から計算）"
    },
    "hidden_params": {
      "adherence_level": "high・medium・lowからランダムに選択",
      "lifestyle_motivation": "high・medium・lowからランダムに選択",
      "social_background": "独居・家族同居・その他からランダムに選択",
      "stress_level": "high・medium・lowからランダムに選択",
      "work_busyness": "high・medium・lowからランダムに選択",
      "personality_type": "cooperative・anxious・resistant・lazy・angryからランダムに選択",
      "eating_habit": "home_cooking・eating_out・night_eating・irregularからランダムに選択",
      "medication_attitude": "positive・neutral・negative・very_negativeからランダムに選択"
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
