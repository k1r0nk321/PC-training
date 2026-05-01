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
      caseId, visitNumber, diseaseId, diseaseName,
      patientData, selectedMedications, selectedEducation,
      selectedSubOptions, selectedDevices, reactionLog,
      interviewMessages, visit2Vitals,
    } = await req.json()

    const supabase = getAdminClient()

    // ガイドラインを取得
    const { data: guidelines } = await supabase
      .from('guideline_items')
      .select('item_type, content, guideline_name, page_ref')
      .eq('disease_id', diseaseId)
      .eq('is_active', true)
      .limit(8)

    const guidelineText = (guidelines || [])
      .map(function(g) { return '[' + g.item_type + '] ' + g.content })
      .join('\n')

    const hidden = patientData.hidden_params

    // 問診の質を評価
    const interviewCount = interviewMessages.filter(function(m) { return m.role === 'user' }).length

    // 説得成功率
    const acceptedCount = (reactionLog || []).filter(function(r) {
      return r.reaction && (r.reaction.acceptance_level === 'accepted' || r.reaction.acceptance_level === 'partial')
    }).length
    const totalReactions = (reactionLog || []).length
    const persuasionRate = totalReactions > 0 ? Math.round(acceptedCount / totalReactions * 100) : 0

    const visit2Summary = visit2Vitals
      ? '\n【Visit 2の結果】\n血圧：' + visit2Vitals.bp + '（変化：' + visit2Vitals.bp_change + 'mmHg）\n体重：' + visit2Vitals.weight + 'kg（変化：' + visit2Vitals.weight_change + 'kg）'
      : ''

    const prompt = `あなたはプライマリケア研修医の指導医AIです。
研修医のVisit ${visitNumber}の診療を評価して、文章でフィードバックと次回への注意点を伝えてください。

【症例情報】
疾患名：${diseaseName}
患者：${patientData.name}（${patientData.age}歳・${patientData.gender}）
主訴：${patientData.chief_complaint}
バイタル：${patientData.vitals.bp}、BMI ${patientData.vitals.bmi}
患者特性：性格=${hidden.personality_type}、服薬意欲=${hidden.adherence_level}、生活改善意欲=${hidden.lifestyle_motivation}

【研修医の選択】
投薬：${selectedMedications && selectedMedications.length > 0 ? selectedMedications.map(function(m) { return m.drug_name_generic }).join('・') : 'なし'}
生活指導：${selectedEducation && selectedEducation.length > 0 ? selectedEducation.map(function(e) { return e.instruction_key }).join('・') : 'なし'}
詳細指導：${selectedSubOptions && selectedSubOptions.length > 0 ? selectedSubOptions.map(function(s) { return s.label }).join('・') : 'なし'}
医療機器：${selectedDevices && selectedDevices.length > 0 ? selectedDevices.map(function(d) { return d.device_name }).join('・') : 'なし'}
問診回数：${interviewCount}回
患者説得成功率：${persuasionRate}%（${acceptedCount}/${totalReactions}件）
${visit2Summary}

【参考ガイドライン】
${guidelineText}

以下の形式で日本語のフィードバックを生成してください：

## Visit ${visitNumber} フィードバック

**良かった点：**
（2〜3点、具体的に）

**改善が必要な点：**
（2〜3点、具体的に。ガイドラインに基づいて）

**次のVisitで注意すべきポイント：**
（2〜3点、具体的なアドバイス）

全体で400〜500文字程度にまとめてください。`

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })

    const feedbackText = message.content[0].text.trim()

    // フィードバックをDBに保存
    const updateData = {}
    if (visitNumber === 1) {
      updateData.visit1_feedback = feedbackText
      updateData.visit1_data = {
        selectedMedications,
        selectedEducation,
        selectedSubOptions,
        selectedDevices,
        reactionLog,
        interviewMessages,
      }
    } else if (visitNumber === 2) {
      updateData.visit2_feedback = feedbackText
      updateData.visit2_data = {
        selectedMedications,
        selectedEducation,
        selectedSubOptions,
        selectedDevices,
        reactionLog,
        interviewMessages,
        vitals: visit2Vitals,
      }
    }

    await supabase.from('cases').update(updateData).eq('id', caseId)

    return Response.json({ feedback: feedbackText })

  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
