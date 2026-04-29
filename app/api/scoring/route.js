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
    const {
      caseId, diseaseId, diseaseName,
      patientData, scenarioData,
      selectedMedications, selectedEducation,
      interviewMessages,
    } = await req.json()

    const supabase = getAdminClient()

    // ガイドライン引用を取得
    const { data: guidelines } = await supabase
      .from('guideline_items')
      .select('item_type, content, guideline_name, page_ref')
      .eq('disease_id', diseaseId)
      .eq('is_active', true)

    // 第一選択薬を取得
    const { data: firstLineMeds } = await supabase
      .from('medications')
      .select('drug_name_generic, drug_category, contraindications')
      .eq('disease_id', diseaseId)
      .eq('first_line', true)

    const guidelineText = guidelines
      .map(function(g) { return '[' + g.item_type + '] ' + g.content + '（' + g.guideline_name + ' ' + g.page_ref + '）' })
      .join('\n')

    const firstLineMedText = firstLineMeds
      .map(function(m) { return m.drug_category + '：' + m.drug_name_generic })
      .join('、')

    const selectedMedText = selectedMedications.length > 0
      ? selectedMedications.map(function(m) { return m.drug_name_generic + '（' + m.typical_dose + '）' }).join('、')
      : 'なし'

    const selectedEduText = selectedEducation.length > 0
      ? selectedEducation.map(function(e) { return e.instruction_key }).join('、')
      : 'なし'

    const interviewSummary = interviewMessages
      .slice(1)
      .map(function(m) { return (m.role === 'user' ? '研修医：' : '患者：') + m.content })
      .join('\n')

    const prompt = `あなたはプライマリ・ケア研修医の外来診療シミュレーション採点AIです。
以下の情報を基に採点し、JSONで返してください。JSON以外のテキストは不要です。

【症例情報】
疾患名：${diseaseName}
患者：${patientData.name}（${patientData.age}歳・${patientData.gender}）
主訴：${patientData.chief_complaint}
バイタル：血圧${patientData.vitals.bp}、BMI${patientData.vitals.bmi}

【ガイドライン情報】
${guidelineText}

【第一選択薬】
${firstLineMedText}

【研修医の選択】
投薬：${selectedMedText}
患者指導：${selectedEduText}

【問診内容】
${interviewSummary}

以下のJSONで採点結果を返してください：
{
  "totalScore": 0から100の整数,
  "overallComment": "全体的な評価コメント（1〜2文）",
  "details": [
    {
      "category": "問診・診察",
      "score": 0から25の整数,
      "maxScore": 25,
      "comment": "評価コメント"
    },
    {
      "category": "検査選択",
      "score": 0から15の整数,
      "maxScore": 15,
      "comment": "評価コメント"
    },
    {
      "category": "投薬選択",
      "score": 0から25の整数,
      "maxScore": 25,
      "comment": "評価コメント"
    },
    {
      "category": "患者教育・生活指導",
      "score": 0から20の整数,
      "maxScore": 20,
      "comment": "評価コメント"
    },
    {
      "category": "社会・心理的支援",
      "score": 0から15の整数,
      "maxScore": 15,
      "comment": "評価コメント"
    }
  ],
  "guidelineReferences": [
    {
      "guideline": "ガイドライン名",
      "page": "ページ参照",
      "content": "関連するガイドライン内容の要約"
    }
  ]
}`

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    })

    const responseText = message.content[0].text
    const cleanText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const scoringResult = JSON.parse(cleanText)

    // casesテーブルに採点結果を保存
    await supabase
      .from('cases')
      .update({
        visit1_data: {
          selectedMedications,
          selectedEducation,
          interviewMessages,
        },
        total_score: scoringResult.totalScore,
        status: 'completed',
      })
      .eq('id', caseId)

    return Response.json(scoringResult)

  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
