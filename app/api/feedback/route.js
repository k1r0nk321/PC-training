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
    const hidden = patientData.hidden_params

    // ガイドライン取得
    const { data: guidelines } = await supabase
      .from('guideline_items')
      .select('item_type, content, guideline_name, page_ref')
      .eq('disease_id', diseaseId)
      .eq('is_active', true)
      .limit(8)

    const guidelineText = (guidelines || [])
      .map(function(g) { return '[' + g.item_type + '] ' + g.content })
      .join('\n')

    // ===== 患者特性の評価 =====
    // 元の生活習慣の悪さ（改善余地の大きさ）
    const lifestyleBadness = [
      hidden.eating_habit === 'eating_out' ? 2 : 0,
      hidden.eating_habit === 'night_eating' ? 2 : 0,
      hidden.eating_habit === 'irregular' ? 1 : 0,
      hidden.stress_level === 'high' ? 1 : 0,
      hidden.work_busyness === 'high' ? 1 : 0,
      parseFloat(patientData.vitals?.bmi || 25) >= 28 ? 2 : parseFloat(patientData.vitals?.bmi || 25) >= 25 ? 1 : 0,
    ].reduce(function(a, b) { return a + b }, 0)

    // 抵抗性の強さ
    const resistanceLevel = {
      cooperative: '低い（従順）',
      anxious: '中程度（不安が強い）',
      lazy: '高い（面倒嫌い）',
      resistant: '非常に高い（抵抗的）',
      angry: '非常に高い（怒りっぽい）',
    }[hidden.personality_type] || '中程度'

    const adherenceLevel = {
      high: '高い', medium: '中程度', low: '低い'
    }[hidden.adherence_level]

    // ===== 介入の分析 =====
    const interventionCount = (selectedSubOptions || []).length + (selectedEducation || []).length + (selectedMedications || []).length
    const hasStrictIntervention = (selectedSubOptions || []).some(function(s) {
      return s.strictness === 'very_strict' || s.strictness === 'strict'
    })
    const hasMildIntervention = (selectedSubOptions || []).some(function(s) {
      return s.strictness === 'mild' || s.strictness === 'very_mild'
    })

    // 説得成功率
    const acceptedCount = (reactionLog || []).filter(function(r) {
      return r.reaction && (r.reaction.acceptance_level === 'accepted' || r.reaction.acceptance_level === 'partial')
    }).length
    const totalReactions = (reactionLog || []).length
    const persuasionRate = totalReactions > 0 ? Math.round(acceptedCount / totalReactions * 100) : 0

    // 問診回数
    const interviewCount = (interviewMessages || []).filter(function(m) { return m.role === 'user' }).length

    const visit2Summary = visit2Vitals
      ? '\n【Visit 2の結果】\n血圧：' + visit2Vitals.bp + '（変化：-' + visit2Vitals.bp_change + 'mmHg）\n体重：' + visit2Vitals.weight + 'kg（変化：' + visit2Vitals.weight_change + 'kg）'
      : ''

    // ===== 介入の適切さを判定するための情報 =====
    const interventionFitAnalysis = `
【患者の元の生活習慣と治療への抵抗性】
- 生活習慣の問題の大きさ（0〜9）：${lifestyleBadness}（高いほど改善余地が大きい）
- 食習慣：${hidden.eating_habit === 'eating_out' ? '外食中心（塩分・カロリー過多のリスク大）' : hidden.eating_habit === 'night_eating' ? '夜食習慣あり（体重増加リスク大）' : hidden.eating_habit === 'irregular' ? '食事不規則' : '自炊中心（比較的良好）'}
- 治療への抵抗性：${resistanceLevel}
- アドヒアランス：${adherenceLevel}
- 服薬意欲：${hidden.medication_attitude === 'positive' ? '前向き' : hidden.medication_attitude === 'negative' ? '否定的' : hidden.medication_attitude === 'very_negative' ? '強く否定的' : '普通'}

【研修医の介入の特徴】
- 総介入数：${interventionCount}件
- 厳格な指導を含む：${hasStrictIntervention ? 'あり' : 'なし'}
- 緩やかな指導中心：${hasMildIntervention && !hasStrictIntervention ? 'はい' : 'いいえ'}
- 患者の同意率：${persuasionRate}%（${acceptedCount}/${totalReactions}件）
- 問診回数：${interviewCount}回

【重要な評価ポイント】
${lifestyleBadness >= 4 ? '- この患者は生活習慣が非常に悪く改善余地が大きいため、緩やかな指導でも効果が出やすい。緩やかな指導を選択したことは適切な可能性がある。' : ''}
${resistanceLevel.includes('非常に高い') || resistanceLevel.includes('高い') ? '- この患者は治療への抵抗性が強いため、多くの介入より患者が受け入れられる範囲での指導が重要。少数の指導で同意を得られた場合は高評価。' : ''}
${persuasionRate >= 70 ? '- 患者の同意率が高く、説得が上手くいっている。' : persuasionRate < 40 ? '- 患者の同意率が低い。説得が不十分か介入が患者に合っていない可能性がある。' : ''}
`

    const prompt = `あなたはプライマリケア研修医の指導医AIです。
研修医のVisit ${visitNumber}の診療を評価して文章でフィードバックと次回への注意点を伝えてください。

【症例情報】
疾患名：${diseaseName}
患者：${patientData.name}（${patientData.age}歳・${patientData.gender}）
主訴：${patientData.chief_complaint}
バイタル：${patientData.vitals?.bp}、BMI ${patientData.vitals?.bmi}

【研修医の選択】
投薬：${selectedMedications && selectedMedications.length > 0 ? selectedMedications.map(function(m) { return m.drug_name_generic }).join('・') : 'なし'}
生活指導：${selectedEducation && selectedEducation.length > 0 ? selectedEducation.map(function(e) { return e.instruction_key }).join('・') : 'なし'}
詳細指導：${selectedSubOptions && selectedSubOptions.length > 0 ? selectedSubOptions.map(function(s) { return s.label }).join('・') : 'なし'}
医療機器：${selectedDevices && selectedDevices.length > 0 ? selectedDevices.map(function(d) { return d.device_name }).join('・') : 'なし'}
${interventionFitAnalysis}
${visit2Summary}

【参考ガイドライン】
${guidelineText}

以下の点を特に重視して評価してください：
1. 患者の生活習慣の問題の大きさに対して、指導の強度が適切だったか（生活習慣が悪い患者への緩やかな指導も効果的な場合がある）
2. 患者の性格・抵抗性に対して、介入数と説得の仕方が適切だったか（抵抗的な患者への多介入はドロップアウトリスクを高める）
3. 患者が受け入れた治療の質（少ない介入でも高い同意率を得られた場合は高評価）
4. 問診・診察の質

以下の形式で日本語のフィードバックを生成してください：

## Visit ${visitNumber} フィードバック

**良かった点：**
（2〜3点、具体的に。患者特性への配慮を評価する）

**改善が必要な点：**
（2〜3点、具体的に）

**次のVisitで注意すべきポイント：**
（2〜3点、具体的なアドバイス）

全体で400〜500文字程度にまとめてください。`

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })

    const feedbackText = message.content[0].text.trim()

    // DBに保存
    const updateData = {}
    if (visitNumber === 1) {
      updateData.visit1_feedback = feedbackText
      updateData.visit1_data = {
        selectedMedications: selectedMedications || [],
        selectedEducation: selectedEducation || [],
        selectedSubOptions: selectedSubOptions || [],
        selectedDevices: selectedDevices || [],
        reactionLog: reactionLog || [],
        interviewMessages: interviewMessages || [],
      }
    } else if (visitNumber === 2) {
      updateData.visit2_feedback = feedbackText
      updateData.visit2_data = {
        selectedMedications: selectedMedications || [],
        selectedEducation: selectedEducation || [],
        selectedSubOptions: selectedSubOptions || [],
        selectedDevices: selectedDevices || [],
        reactionLog: reactionLog || [],
        interviewMessages: interviewMessages || [],
        vitals: visit2Vitals,
      }
    }

    await supabase.from('cases').update(updateData).eq('id', caseId)

    return Response.json({ feedback: feedbackText })

  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
