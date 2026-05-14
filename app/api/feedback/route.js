export const maxDuration = 60

import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
// 喫煙・飲酒介入の判定ヘルパー
const SMOKING_STRONG = ['smoke_5A', 'smoke_motivational', 'smoke_quit_date', 'smoke_clinic_referral']
const SMOKING_MODERATE = ['smoke_brief', 'smoke_nicotine_assess', 'smoke_relapse_prep']
const DRINKING_STRONG = ['drink_target_reduction', 'drink_abstinence', 'drink_specialty_referral']
const DRINKING_MODERATE = ['drink_amount_education', 'drink_audit', 'drink_rest_days']

function computeIntervention(category, selectedEducation, selectedSubOptions, reactionLog, strongList, moderateList) {
  const edu = (selectedEducation || []).find(function(e) { return e && e.category === category })
  if (!edu) return { given: false, strength: 'none', accepted: false, sub_options: [] }

  const subIds = (selectedSubOptions || {})[edu.id] || []
  const subIdArray = Array.isArray(subIds) ? subIds : []
  const hasStrong = subIdArray.some(function(s) { return strongList.indexOf(s) >= 0 })
  const hasModerate = subIdArray.some(function(s) { return moderateList.indexOf(s) >= 0 })
  const strength = hasStrong ? 'strong' : (hasModerate ? 'moderate' : 'weak')

  // edu_ または sub_<edu.id>_ で始まる reaction を抽出
  const eduReactions = (reactionLog || []).filter(function(r) {
    return r && r.id && (r.id === 'edu_' + edu.id || (typeof r.id === 'string' && r.id.indexOf('sub_' + edu.id) === 0))
  })
  const accepted = eduReactions.some(function(r) {
    const al = r.reaction && r.reaction.acceptance_level
    return al === 'accepted' || al === 'partial'
  })

  return { given: true, strength: strength, accepted: accepted, sub_options: subIdArray }
}


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
      patientData, scenarioData, selectedMedications, selectedEducation,
      selectedSubOptions, selectedDevices, reactionLog,
      interviewMessages, visit2Vitals,
      consultation, discontinuedExistingMeds,
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
    // selectedSubOptions は { eduId: { subId: true, ... } } 形式
    // sub_option オブジェクト（label, strictness 等）を抽出
    const subOptionObjects = []
    Object.entries(selectedSubOptions || {}).forEach(function(entry) {
      const eduId = entry[0]
      const subMap = entry[1] || {}
      const edu = (selectedEducation || []).find(function(e) { return e && e.id === eduId })
      if (!edu || !Array.isArray(edu.sub_options)) return
      Object.entries(subMap).forEach(function(se) {
        if (se[1]) {
          const sub = edu.sub_options.find(function(s) { return s.id === se[0] })
          if (sub) subOptionObjects.push(sub)
        }
      })
    })
    const interventionCount = subOptionObjects.length + (selectedEducation || []).length + (selectedMedications || []).length
    const hasStrictIntervention = subOptionObjects.some(function(s) {
      return s.strictness === 'very_strict' || s.strictness === 'strict'
    })
    const hasMildIntervention = subOptionObjects.some(function(s) {
      return s.strictness === 'mild' || s.strictness === 'very_mild'
    })

    // 説得成功率
    const acceptedCount = (reactionLog || []).filter(function(r) {
      return r.reaction && (r.reaction.acceptance_level === 'accepted' || r.reaction.acceptance_level === 'partial')
    }).length
    const totalReactions = (reactionLog || []).length
    const persuasionRate = totalReactions > 0 ? Math.round(acceptedCount / totalReactions * 100) : 0

    // 問診合意による治療決定の集計
    const fromAgreementCount = (reactionLog || []).filter(function(r) { return r.fromInterviewAgreement === true }).length
    const fromAgreementCategories = (reactionLog || []).filter(function(r) { return r.fromInterviewAgreement === true }).map(function(r) {
      return (r.item && r.item.instruction_key) || (r.item && r.item.category) || ''
    }).filter(Boolean).join('、')

    // 問診回数
    const interviewCount = (interviewMessages || []).filter(function(m) { return m.role === 'user' }).length

    // 疾患別のバイタル/検査値変化サマリー（高血圧症のみ BP を含む、他疾患は体重のみ）
    function buildVisit2Summary(disease, vitals) {
      if (!vitals) return ''
      const wStr = vitals.weight != null ? (String(vitals.weight).match(/kg/) ? String(vitals.weight) : vitals.weight + 'kg') : null
      const wChangeStr = vitals.weight_change != null ? '（変化：' + (vitals.weight_change > 0 ? '+' : '') + vitals.weight_change + 'kg）' : ''
      const lines = ['【Visit 2の結果】']
      if (disease === '高血圧症' && vitals.bp) {
        const bpChangeStr = vitals.bp_change != null ? '（変化：-' + vitals.bp_change + 'mmHg）' : ''
        lines.push('血圧：' + vitals.bp + bpChangeStr)
      }
      if (wStr) lines.push('体重：' + wStr + wChangeStr)
      return '\n' + lines.join('\n')
    }
    const visit2Summary = buildVisit2Summary(diseaseName, visit2Vitals)

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
- 問診合意による治療決定数：${fromAgreementCount}件${fromAgreementCount > 0 ? '（' + fromAgreementCategories + '）' : ''}

【重要な評価ポイント】
${lifestyleBadness >= 4 ? '- この患者は生活習慣が非常に悪く改善余地が大きいため、緩やかな指導でも効果が出やすい。緩やかな指導を選択したことは適切な可能性がある。' : ''}
${resistanceLevel.includes('非常に高い') || resistanceLevel.includes('高い') ? '- この患者は治療への抵抗性が強いため、多くの介入より患者が受け入れられる範囲での指導が重要。少数の指導で同意を得られた場合は高評価。' : ''}
${persuasionRate >= 70 ? '- 患者の同意率が高く、説得が上手くいっている。' : persuasionRate < 40 ? '- 患者の同意率が低い。説得が不十分か介入が患者に合っていない可能性がある。' : ''}
${fromAgreementCount > 0 ? '- 問診の段階で生活指導の合意を得て治療方針を確定した：' + fromAgreementCategories + '。これは患者中心アプローチとして高く評価される。仮にガイドライン的にはやや控えめな介入であっても、患者の自発的な変化意欲を引き出して同意を得た上での初期介入として「適切」と判定する。次回 Visit で段階的に強化していく方針が妥当。' : ''}
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
詳細指導：${subOptionObjects.length > 0 ? subOptionObjects.map(function(s) { return s.label }).join('・') : 'なし'}
医療機器：${selectedDevices && selectedDevices.length > 0 ? selectedDevices.map(function(d) { return d.device_name }).join('・') : 'なし'}
${interventionFitAnalysis}

【専門医コンサルトの推奨】
${(() => {
  const rec = scenarioData?.consultation_recommendation
  if (!rec) return '- 本症例ではコンサルト推奨情報なし'
  const necJa = rec.necessity === 'required' ? '必須' : rec.necessity === 'recommended' ? '推奨' : '不要'
  return '- 推奨レベル：' + necJa + '\n- 推奨科：' + (rec.recommended_specialty || 'なし') + '\n- 推奨理由：' + (rec.reason || 'なし')
})()}

【研修医のコンサルト判断】
${consultation && consultation.performed
  ? '- 紹介あり\n- 紹介先：' + (consultation.specialty || '未選択') + '\n- 紹介理由：' + (consultation.reason || '未記入')
  : '- 紹介なし'}

【既存薬の継続/中止判断】
${(() => {
  const existingMeds = (patientData.current_medications || [])
  if (existingMeds.length === 0) return '- 来院前服用薬なし'
  const discontinued = discontinuedExistingMeds || []
  const lines = existingMeds.map((m, idx) => {
    const key = (m.name || '') + '_' + idx
    const status = discontinued.includes(key) ? '中止' : '継続'
    return '- ' + m.name + (m.dose ? '（' + m.dose + '）' : '') + '：' + status
  })
  return lines.join('\n')
})()}

${visit2Summary}

【参考ガイドライン】
${guidelineText}

以下の点を特に重視して評価してください：
1. 患者の生活習慣の問題の大きさに対して、指導の強度が適切だったか（生活習慣が悪い患者への緩やかな指導も効果的な場合がある）
2. 患者の性格・抵抗性に対して、介入数と説得の仕方が適切だったか（抵抗的な患者への多介入はドロップアウトリスクを高める）
3. 患者が受け入れた治療の質（少ない介入でも高い同意率を得られた場合は高評価）
4. 問診・診察の質（**問診回数の多さは丁寧で十分な情報収集として必ずプラス評価とする。回数自体を批判材料にしてはならない。重要項目の問診漏れがある場合のみマイナス評価とする**）
5. **専門医コンサルトの判断**：
   - 推奨レベル「必須」でコンサルトなし → 重大な問題（必ずマイナス評価）
   - 推奨レベル「推奨」でコンサルトなし → 中程度の問題
   - 推奨レベル「不要」でコンサルトあり → 不要なコンサルト（軽度マイナス）
   - 必要時のコンサルト、不要時の見送り → 適切（プラス評価）
   - 適切な紹介科の選択（推奨科とのマッチ）も評価
   - **注意**：適切な治療が選択されている場合、コンサルトの有無は治療の質評価とは独立。「コンサルトなしでも良い治療」は減点しない
6. **既存薬の継続/中止判断**：
   - 中止した既存薬がある場合、その理由が医学的に妥当か（例：痛風頓服薬コルヒチンは中止不要、骨粗鬆症のアレンドロン酸は中止判断に骨密度評価が必要）
   - 不適切な中止は安全性の問題としてマイナス評価
   - 適切な継続/中止判断はプラス評価

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
        selectedSubOptions: selectedSubOptions || {},
        selectedDevices: selectedDevices || [],
        reactionLog: reactionLog || [],
        interviewMessages: interviewMessages || [],
        consultation: consultation || null,
        discontinuedExistingMeds: discontinuedExistingMeds || [],
      }
      updateData.visit1_consultation = consultation || null
    } else if (visitNumber === 2) {
      updateData.visit2_feedback = feedbackText
      updateData.visit2_data = {
        selectedMedications: selectedMedications || [],
        selectedEducation: selectedEducation || [],
        selectedSubOptions: selectedSubOptions || {},
        selectedDevices: selectedDevices || [],
        reactionLog: reactionLog || [],
        interviewMessages: interviewMessages || [],
        vitals: visit2Vitals,
        consultation: consultation || null,
        discontinuedExistingMeds: discontinuedExistingMeds || [],
      }
      updateData.visit2_consultation = consultation || null
    }

    // 喫煙・飲酒介入を計算して visit_parameters に保存
    const smokingIntervention = computeIntervention('smoking', selectedEducation, selectedSubOptions, reactionLog, SMOKING_STRONG, SMOKING_MODERATE)
    const drinkingIntervention = computeIntervention('drinking', selectedEducation, selectedSubOptions, reactionLog, DRINKING_STRONG, DRINKING_MODERATE)
    try {
      await supabase
        .from('visit_parameters')
        .update({
          smoking_intervention: smokingIntervention,
          drinking_intervention: drinkingIntervention,
        })
        .eq('case_id', caseId)
        .eq('visit_number', visitNumber)
    } catch (e) {
      console.error('Failed to update visit_parameters intervention:', e)
    }

    await supabase.from('cases').update(updateData).eq('id', caseId)

    // Detect treatment categories from selected items and update visit_parameters flags
    let flags = null
    try {
      const allItems = []
      if (Array.isArray(selectedEducation)) allItems.push(...selectedEducation)
      if (Array.isArray(selectedSubOptions)) allItems.push(...selectedSubOptions)
      else if (selectedSubOptions && typeof selectedSubOptions === 'object') {
        Object.values(selectedSubOptions).forEach(function(v) {
          if (Array.isArray(v)) allItems.push(...v)
          else if (v) allItems.push(v)
        })
      }
      const hasCategory = function(cat) {
        return allItems.some(function(i) {
          if (!i) return false
          if (i.category === cat) return true
          if (typeof i.instruction_key === 'string' && i.instruction_key.indexOf(cat) === 0) return true
          if (i.category_key === cat) return true
          return false
        })
      }
      flags = {
        social_support_given: hasCategory('psychosocial'),
        exercise_treatment_given: hasCategory('exercise'),
        diet_treatment_given: hasCategory('diet')
      }
      await supabase
        .from('visit_parameters')
        .update(flags)
        .eq('case_id', caseId)
        .eq('visit_number', visitNumber)
    } catch (flagErr) {
      // Non-blocking: don't fail the feedback if flag update fails
    }

    // For existing cases: if Visit 1 has social support, directly update Visit 2's stress/busyness
    if (visitNumber === 1 && flags && flags.social_support_given) {
      try {
        const { data: v2Params } = await supabase
          .from('visit_parameters')
          .select('*')
          .eq('case_id', caseId)
          .eq('visit_number', 2)
          .maybeSingle()
        if (v2Params) {
          const newStress = Math.max(1, v2Params.stress - 1)
          const newBusyness = Math.max(1, v2Params.busyness - 1)
          const pendingChanges = {}
          if (newStress < v2Params.stress) pendingChanges.stress = '↓'
          if (newBusyness < v2Params.busyness) pendingChanges.busyness = '↓'
          if (Object.keys(pendingChanges).length > 0) {
            const existingPending = v2Params.pending_treatment_changes || {}
            await supabase
              .from('visit_parameters')
              .update({
                stress: newStress,
                busyness: newBusyness,
                pending_treatment_changes: Object.assign({}, existingPending, pendingChanges)
              })
              .eq('case_id', caseId)
              .eq('visit_number', 2)
          }
        }
      } catch (v2Err) {}
    }

    return Response.json({ feedback: feedbackText })

  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
