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

    const { data: guidelines } = await supabase
      .from('guideline_items')
      .select('item_type, content, guideline_name, page_ref')
      .eq('disease_id', diseaseId)
      .eq('is_active', true)

    const { data: medications } = await supabase
      .from('medications')
      .select('drug_category, drug_name_generic, typical_dose, first_line, contraindications, indication_notes')
      .eq('disease_id', diseaseId)
      .eq('is_active', true)
      .order('sort_order')

    const guidelineText = guidelines
      .map(function(g) { return g.item_type + '：' + g.content })
      .join('\n')

    const medicationText = medications
      .map(function(m) {
        return m.drug_category + ' / ' + m.drug_name_generic +
          '（' + m.typical_dose + '）' +
          (m.first_line ? '【第一選択】' : '') +
          (m.indication_notes ? ' ' + m.indication_notes : '')
      })
      .join('\n')

    const prompt = `あなたはプライマリ・ケア研修医向け外来シミュレーションの症例生成AIです。

以下のガイドライン情報と投薬情報を参考に、${diseaseName}の初診患者の症例をJSON形式で生成してください。

【ガイドライン情報】
${guidelineText}

【使用可能な薬剤】
${medicationText}

以下のJSON形式で症例を生成してください。JSONのみ出力し、前後に余計なテキストや\`\`\`は含めないでください。

{
  "patient": {
    "name": "架空の日本人名（姓名）",
    "age": 40から75の間の整数,
    "gender": "男性"または"女性",
    "occupation": "職業",
    "chief_complaint": "主訴（患者の言葉で）",
    "history": "現病歴（2〜3文）",
    "past_history": "既往歴",
    "family_history": "家族歴",
    "social_history": "生活歴（飲酒・喫煙・運動習慣）",
    "vitals": {
      "bp": "血圧（例：152/94 mmHg）",
      "hr": "脈拍（例：78 bpm）",
      "temp": "体温（例：36.5℃）",
      "spo2": "SpO2（例：98%）",
      "height": "身長cm",
      "weight": "体重kg",
      "bmi": "BMI（小数点1桁）"
    },
    "hidden_params": {
      "adherence_level": "high"または"medium"または"low",
      "lifestyle_motivation": "high"または"medium"または"low",
      "social_background": "独居"または"家族同居"または"その他",
      "stress_level": "high"または"medium"または"low"
    }
  },
  "scenario": {
    "difficulty": 1または2または3,
    "key_points": ["学習ポイント1", "学習ポイント2", "学習ポイント3"],
    "expected_diagnosis": "${diseaseName}",
    "expected_medications": ["推奨される薬剤名1", "推奨される薬剤名2"],
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
