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
    const { caseId } = await req.json()
    const supabase = getAdminClient()

    const { data: caseData, error } = await supabase
      .from('cases').select('*').eq('id', caseId).single()
    if (error || !caseData) {
      return Response.json({ error: 'Case not found' }, { status: 404 })
    }

    const patient = caseData.patient_data
    const hidden = patient.hidden_params
    const visit1 = caseData.visit1_data || {}

    const selectedMeds = visit1.selectedMedications || []
    const selectedEdu = visit1.selectedEducation || []
    const selectedSubs = visit1.selectedSubOptions || []
    const reactionLog = visit1.reactionLog || []

    // ===== 元の生活習慣の「悪さ」を評価（改善余地の大きさ） =====
    const lifestyleBadness = [
      hidden.eating_habit === 'eating_out' ? 2 : 0,
      hidden.eating_habit === 'night_eating' ? 2 : 0,
      hidden.eating_habit === 'irregular' ? 1 : 0,
      hidden.stress_level === 'high' ? 1 : 0,
      hidden.work_busyness === 'high' ? 1 : 0,
      parseFloat(patient.vitals.bmi) >= 28 ? 2 : parseFloat(patient.vitals.bmi) >= 25 ? 1 : 0,
    ].reduce(function(a, b) { return a + b }, 0)
    // lifestyleBadness: 0〜9（高いほど改善余地が大きい）

    // ===== 介入の強度を評価 =====
    const interventionCount = selectedSubs.length + selectedEdu.length + selectedMeds.length
    const strictnessScore = selectedSubs.reduce(function(sum, s) {
      const scores = { very_strict: 3, strict: 2, moderate: 1, mild: 0.5, very_mild: 0.2, none: 0 }
      return sum + (scores[s.strictness] || 0)
    }, 0)

    // ===== 患者の性格・抵抗性による過負荷リスク =====
    const resistanceLevel = {
      cooperative: 0, anxious: 0.5, lazy: 1, resistant: 1.5, angry: 1.5
    }[hidden.personality_type] || 0.5

    // 多介入 × 抵抗的性格 → アドヒアランス低下リスク
    const overloadPenalty = Math.max(0, (interventionCount - 3) * resistanceLevel * 0.15)

    // ===== 患者の説得成功率（Visit 1のreactionLog） =====
    const acceptedCount = reactionLog.filter(function(r) {
      return r.reaction && (r.reaction.acceptance_level === 'accepted' || r.reaction.acceptance_level === 'partial')
    }).length
    const totalReactions = reactionLog.length
    const persuasionSuccessRate = totalReactions > 0 ? acceptedCount / totalReactions : 0.5

    // ===== Visit 1成功によるアドヒアランス向上 =====
    // 説得成功率が高いほど、Visit 2以降の意欲が上がる
    const motivationBoost = persuasionSuccessRate >= 0.7 ? 0.2
      : persuasionSuccessRate >= 0.5 ? 0.1 : 0

    // ===== 基本アドヒアランス係数 =====
    const baseAdherence = { high: 0.85, medium: 0.6, low: 0.35 }[hidden.adherence_level] || 0.6
    const effectiveAdherence = Math.min(1.0, Math.max(0.1,
      baseAdherence + motivationBoost - overloadPenalty
    ))

    // ===== 降圧効果の計算 =====
    // 投薬効果（第一選択薬かどうかに関わらず一定の効果）
    const hasMedication = selectedMeds.length > 0
    const medEffect = hasMedication ? (10 + Math.floor(Math.random() * 8)) : 0

    // 生活指導の効果
    // 食生活が悪い患者は緩やかな制限でも効果大
    const saltSubs = selectedSubs.filter(function(s) { return s.category === 'salt' })
    const calorieSubs = selectedSubs.filter(function(s) { return s.category === 'calorie' })
    const lifestyleSubs = selectedSubs.filter(function(s) {
      return ['eating_out', 'night_eating', 'alcohol', 'aerobic', 'resistance'].includes(s.category)
    })

    // 塩分制限の効果（元の生活が悪いほど効果大）
    const saltEffect = saltSubs.length > 0
      ? (saltSubs[0].strictness === 'none' ? 0 : 3 + lifestyleBadness * 0.8) : 0

    // カロリー制限・生活習慣改善の効果
    const lifestyleEffect = lifestyleSubs.length > 0
      ? (4 + lifestyleBadness * 0.6) : 0

    // 全体の生活指導効果
    const totalLifestyleEffect = (saltEffect + lifestyleEffect) * effectiveAdherence

    // 総降圧効果
    const bpStr = patient.vitals.bp || '158/96 mmHg'
    const bpMatch = bpStr.match(/(\d+)\/(\d+)/)
    const systolic1 = bpMatch ? parseInt(bpMatch[1]) : 158
    const diastolic1 = bpMatch ? parseInt(bpMatch[2]) : 96

    const totalBpReduction = Math.round(
      (medEffect + totalLifestyleEffect) * (0.85 + Math.random() * 0.3)
    )

    const systolic2 = Math.max(115, systolic1 - totalBpReduction + Math.floor(Math.random() * 6) - 3)
    const diastolic2 = Math.max(68, diastolic1 - Math.round(totalBpReduction * 0.5) + Math.floor(Math.random() * 4) - 2)

// ===== 体重変化 =====
    const weight1 = parseFloat(patient.vitals.weight) || 70
    const height = parseFloat(patient.vitals.height) || 165
    const bmi1 = parseFloat(patient.vitals.bmi) || 25

    const hm = height / 100
    const idealWeight = Math.round(hm * hm * 22 * 10) / 10
    const age = patient.age
    const actCoef = age >= 75 ? 27.5 : age >= 65 ? 30 : 32.5
    const recCal = Math.round(idealWeight * actCoef / 200) * 200

    const calSub = selectedSubs.find(function(s) { return s.category === 'calorie' })
    const selectedCal = calSub ? parseInt(calSub.id.replace('cal_', '')) : null

    const bmiExcess = Math.max(0, bmi1 - 22)
    const lenientThreshold = recCal + 400
    const calDeficit = selectedCal ? Math.max(0, lenientThreshold - selectedCal) : 0

    const hasWeightIntervention = calSub !== null || lifestyleSubs.length > 0
    const weightLossBase = hasWeightIntervention && bmi1 >= 25
      ? (0.5 + bmiExcess * 0.15 + calDeficit * 0.0003 + lifestyleBadness * 0.15)
      : hasWeightIntervention && bmi1 >= 23
      ? (0.2 + lifestyleBadness * 0.05)
      : 0.1 + Math.random() * 0.2

    const weightReduction = Math.round(
      Math.max(0, weightLossBase * effectiveAdherence * (0.8 + Math.random() * 0.4)) * 10
    ) / 10

    const visit2Vitals = {
      bp: systolic2 + '/' + diastolic2 + ' mmHg',
      hr: patient.vitals.hr,
      temp: patient.vitals.temp,
      spo2: patient.vitals.spo2,
      height: patient.vitals.height,
      weight: weight2,
      bmi: bmi2,
      weight_change: -weightReduction,
      bp_change: systolic1 - systolic2,
    }

    // ===== 血液検査結果 =====
    const visit2Labs = {
      na: 140 + Math.floor(Math.random() * 5),
      k: Math.round((3.8 + Math.random() * 0.6) * 10) / 10,
      cr: Math.round((0.7 + Math.random() * 0.4) * 10) / 10,
      bun: 14 + Math.floor(Math.random() * 6),
      egfr: 65 + Math.floor(Math.random() * 25),
      ldl: Math.round(120 + Math.random() * 30 - totalLifestyleEffect * 0.5),
      hdl: Math.round(55 + Math.random() * 15),
      tg: Math.round(130 + Math.random() * 40 - totalLifestyleEffect * 0.8),
      hba1c: Math.round((5.8 + Math.random() * 0.6) * 10) / 10,
      ua: Math.round((5.0 + Math.random() * 2.0) * 10) / 10,
    }

    // ===== 患者の4週間コメント生成 =====
    // 治療成功により意欲が向上した場合の反映
    const motivationChange = motivationBoost > 0.15
      ? '治療がうまくいっているので、少し前向きになっている。'
      : motivationBoost > 0 ? '少しずつ前向きになっている。' : ''

    const prompt = `あなたは外来診療シミュレーションの患者AIです。
高血圧症で4週間前に初診し治療を開始した患者の再診時の第一声を生成してください。

【患者情報】
名前：${patient.name}（${patient.age}歳・${patient.gender}）
性格：${hidden.personality_type}
服薬意欲：${hidden.adherence_level}
生活改善意欲：${hidden.lifestyle_motivation}
食習慣：${hidden.eating_habit}
仕事の忙しさ：${hidden.work_busyness}
${motivationChange}

【Visit 1の治療】
投薬：${selectedMeds.length > 0 ? selectedMeds.map(function(m) { return m.drug_name_generic }).join('・') : 'なし'}
主な生活指導：${selectedSubs.length > 0 ? selectedSubs.map(function(s) { return s.label }).slice(0, 3).join('・') : '特になし'}

【4週間の経過】
血圧変化：${systolic1}/${diastolic1} → ${systolic2}/${diastolic2} mmHg
体重変化：${weight1}kg → ${weight2}kg
実効アドヒアランス：${Math.round(effectiveAdherence * 100)}%

【応答ルール】
・患者として自然な日本語で再診時の第一声（100〜150文字）
・服薬・生活指導を守れた/守れなかったことを正直に述べる
・高アドヒアランスなら前向きな報告、低なら困難さや言い訳
・治療成功で意欲が上がった場合はそれを反映する
・性格（${hidden.personality_type}）に合った発言をする`

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    })

    const patientOpeningComment = message.content[0].text.trim()

    // DBを更新
    await supabase.from('cases').update({
      current_visit: 2,
      status: 'visit2',
    }).eq('id', caseId)

    return Response.json({
      visit2Vitals,
      visit2Labs,
      patientOpeningComment,
      bpReduction: systolic1 - systolic2,
      weightReduction,
      bpControlled: systolic2 < 140,
      effectiveAdherence: Math.round(effectiveAdherence * 100),
      lifestyleBadness,
      motivationBoost: Math.round(motivationBoost * 100),
    })

  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
