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
      .from('cases')
      .select('*')
      .eq('id', caseId)
      .single()

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

    // ===== 降圧効果の計算 =====
    // 投薬効果
    const hasMedication = selectedMeds.length > 0
    const medEffect = hasMedication ? (12 + Math.floor(Math.random() * 8)) : 0

    // 生活指導効果
    const hasLifestyleGuidance = selectedSubs.length > 0 || selectedEdu.length > 0
    const lifestyleQuality = selectedSubs.filter(function(s) {
      return ['salt','calorie','aerobic','resistance','alcohol'].includes(s.category)
    }).length

    // アドヒアランスによる係数
    const adherenceCoef = { high: 1.0, medium: 0.65, low: 0.3 }[hidden.adherence_level] || 0.65

    // 性格による係数
    const personalityCoef = {
      cooperative: 1.0, anxious: 0.8, resistant: 0.5, lazy: 0.6, angry: 0.55
    }[hidden.personality_type] || 0.7

    // 説得成功率（reactionLogのacceptance_levelから計算）
    const acceptedCount = reactionLog.filter(function(r) {
      return r.reaction && (r.reaction.acceptance_level === 'accepted' || r.reaction.acceptance_level === 'partial')
    }).length
    const totalReactions = reactionLog.length
    const persuasionRate = totalReactions > 0 ? acceptedCount / totalReactions : 0.5

    // 生活習慣の問題の大きさ（改善余地）
    const lifestyleProblem = [
      hidden.eating_habit !== 'home_cooking' ? 1 : 0,
      hidden.stress_level === 'high' ? 1 : 0,
      hidden.work_busyness === 'high' ? 1 : 0,
    ].reduce(function(a, b) { return a + b }, 0)

    // 生活指導効果（改善余地が大きいほど効果が出やすい）
    const lifestyleBaseEffect = lifestyleQuality >= 3 ? 10 : lifestyleQuality >= 2 ? 7 : lifestyleQuality >= 1 ? 4 : 0
    const lifestyleEffect = Math.round(lifestyleBaseEffect * adherenceCoef * personalityCoef * persuasionRate * (1 + lifestyleProblem * 0.2))

    // 総降圧効果
    const totalBpReduction = Math.round((medEffect + lifestyleEffect) * (0.85 + Math.random() * 0.3))

    // Visit 1の血圧をパース
    const bpStr = patient.vitals.bp || '158/96 mmHg'
    const bpMatch = bpStr.match(/(\d+)\/(\d+)/)
    const systolic1 = bpMatch ? parseInt(bpMatch[1]) : 158
    const diastolic1 = bpMatch ? parseInt(bpMatch[2]) : 96

    // Visit 2の血圧
    const systolic2 = Math.max(115, systolic1 - totalBpReduction + Math.floor(Math.random() * 6) - 3)
    const diastolic2 = Math.max(70, diastolic1 - Math.round(totalBpReduction * 0.5) + Math.floor(Math.random() * 4) - 2)

    // 体重変化
    const weight1 = parseFloat(patient.vitals.weight) || 70
    const height = parseFloat(patient.vitals.height) || 165
    const weightReduction = hasLifestyleGuidance && lifestyleQuality >= 2
      ? Math.round((1.5 + Math.random() * 1.5) * adherenceCoef * personalityCoef * 10) / 10
      : Math.round(Math.random() * 0.8 * 10) / 10
    const weight2 = Math.round((weight1 - weightReduction) * 10) / 10
    const bmi2 = Math.round(weight2 / ((height / 100) * (height / 100)) * 10) / 10

    // Visit 2のバイタル
    const visit2Vitals = {
      bp: systolic2 + '/' + diastolic2 + ' mmHg',
      hr: patient.vitals.hr,
      temp: patient.vitals.temp,
      spo2: patient.vitals.spo2,
      height: patient.vitals.height,
      weight: weight2,
      bmi: bmi2,
      weight_change: -weightReduction,
      bp_change: -(systolic1 - systolic2),
    }

    // 血液検査結果（Visit 2）
    const bpControlled = systolic2 < 140
    const visit2Labs = {
      na: 140 + Math.floor(Math.random() * 5),
      k: Math.round((3.8 + Math.random() * 0.6) * 10) / 10,
      cr: Math.round((0.7 + Math.random() * 0.4) * 10) / 10,
      bun: 14 + Math.floor(Math.random() * 6),
      egfr: 65 + Math.floor(Math.random() * 25),
      ldl: Math.round(120 + Math.random() * 30 - lifestyleEffect * 0.8),
      hdl: Math.round(55 + Math.random() * 15),
      tg: Math.round(130 + Math.random() * 40 - lifestyleEffect * 1.2),
      hba1c: Math.round((5.8 + Math.random() * 0.6) * 10) / 10,
      ua: Math.round((5.0 + Math.random() * 2.0) * 10) / 10,
    }

    // 患者の4週間コメント生成
    const prompt = `あなたは外来診療シミュレーションの患者AIです。
高血圧症で4週間前に初診し、治療を開始した患者の再診時の第一声を生成してください。

【患者情報】
名前：${patient.name}（${patient.age}歳・${patient.gender}）
性格：${hidden.personality_type}
服薬意欲：${hidden.adherence_level}
生活改善意欲：${hidden.lifestyle_motivation}
食習慣：${hidden.eating_habit}
仕事の忙しさ：${hidden.work_busyness}
ストレス：${hidden.stress_level}

【Visit 1で選択された治療】
投薬：${selectedMeds.length > 0 ? selectedMeds.map(function(m) { return m.drug_name_generic }).join('・') : 'なし（生活指導のみ）'}
主な生活指導：${selectedSubs.length > 0 ? selectedSubs.map(function(s) { return s.label }).slice(0, 3).join('・') : '特になし'}

【4週間の経過】
血圧変化：${systolic1}/${diastolic1} → ${systolic2}/${diastolic2} mmHg（${systolic1 - systolic2 > 0 ? '低下' : '変化なし'}）
体重変化：${weight1}kg → ${weight2}kg（${weightReduction > 0 ? weightReduction + 'kg減少' : '変化なし'}）
アドヒアランス：${hidden.adherence_level}

【応答ルール】
・患者として自然な日本語で再診時の第一声を話す（100〜150文字）
・4週間の治療経過について正直に報告する
・服薬できた/できなかった、生活指導を守れた/守れなかったことを性格に応じて述べる
・高アドヒアランスなら前向きな報告、低なら言い訳や困難さを述べる
・次の診察への期待や不安も含める`

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    })

    const patientOpeningComment = message.content[0].text.trim()

    // Visit 2データをcasesテーブルに保存
    const { error: updateError } = await supabase
      .from('cases')
      .update({
        visit1_data: {
          ...visit1,
          vitals: patient.vitals,
          labs: null,
        },
        current_visit: 2,
        status: 'visit2',
      })
      .eq('id', caseId)

    if (updateError) {
      return Response.json({ error: updateError.message }, { status: 500 })
    }

    return Response.json({
      visit2Vitals,
      visit2Labs,
      patientOpeningComment,
      bpReduction: systolic1 - systolic2,
      weightReduction,
      bpControlled,
    })

  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
