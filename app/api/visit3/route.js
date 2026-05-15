export const maxDuration = 60

import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { claudeCreate } from '../../lib/claude-client'

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

    // ===== キャッシュチェック: 既に生成済みなら同じ値を返す（冪等化）=====
    const existingV3 = caseData.visit3_data || {}
    if (existingV3.visit3Vitals && existingV3.visit3Labs && existingV3.patientOpeningComment) {
      return Response.json({
        visit3Vitals: existingV3.visit3Vitals,
        visit3Labs: existingV3.visit3Labs,
        patientOpeningComment: existingV3.patientOpeningComment,
        bpReduction: existingV3.bpReduction || 0,
        weightReduction: existingV3.weightReduction || 0,
        bpControlled: existingV3.bpControlled || false,
        effectiveAdherence: existingV3.effectiveAdherence || 50,
        cached: true,
      })
    }

    const patient = caseData.patient_data
    const hidden = patient.hidden_params
    const visit1 = caseData.visit1_data || {}
    const visit2 = caseData.visit2_data || {}

    // Visit 2 の治療内容（直近4週間で患者に処方・指導されていた内容）
    const v2SelectedMeds = visit2.selectedMedications || []
    const v2SelectedEdu = visit2.selectedEducation || []
    const v2ReactionLog = visit2.reactionLog || []

    // selectedSubOptions オブジェクト形式 { eduId: { subId: true } } を sub_option 配列に変換するヘルパー
    function flattenSubOptions(raw, eduList) {
      const arr = []
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        Object.entries(raw).forEach(function(entry) {
          const edu = (eduList || []).find(function(e) { return e && e.id === entry[0] })
          if (!edu || !Array.isArray(edu.sub_options)) return
          Object.entries(entry[1] || {}).forEach(function(se) {
            if (se[1]) {
              const sub = edu.sub_options.find(function(s) { return s.id === se[0] })
              if (sub) arr.push(sub)
            }
          })
        })
      } else if (Array.isArray(raw)) {
        raw.forEach(function(s) { if (s && typeof s === 'object') arr.push(s) })
      }
      return arr
    }
    const v2SelectedSubs = flattenSubOptions(visit2.selectedSubOptions, v2SelectedEdu)

    // ===== 患者の同意が得られた介入のみを有効とする（Visit 2 の reactionLog 基準） =====
    function isConsentedItem(item, expectedType) {
      if (!item || item.id == null) return false
      const match = v2ReactionLog.find(function(r) {
        if (!r || !r.reaction || !r.item) return false
        if (expectedType && r.selectionType !== expectedType) return false
        return r.item.id === item.id
      })
      if (!match) return false
      const acc = match.reaction.acceptance_level
      return acc === 'accepted' || acc === 'partial'
    }
    const consentedMeds = v2SelectedMeds.filter(function(m) { return isConsentedItem(m, 'medication') })
    const consentedEdu = v2SelectedEdu.filter(function(e) { return isConsentedItem(e, 'education') })
    const consentedSubs = v2SelectedSubs.filter(function(s) { return isConsentedItem(s, 'education_sub') })
    const rejectedMedNames = v2SelectedMeds.filter(function(m) { return !isConsentedItem(m, 'medication') }).map(function(m) { return m.drug_name_generic })
    const rejectedSubLabels = v2SelectedSubs.filter(function(s) { return !isConsentedItem(s, 'education_sub') }).map(function(s) { return s.label || s.id })

    // ===== Visit 1 と Visit 2 の比較：V2 で新しく追加された治療を抽出 =====
    const v1MedIds = new Set((visit1.selectedMedications || []).map(function(m) { return m.id }))
    const v1SelectedEduForSubs = visit1.selectedEducation || []
    const v1Subs = flattenSubOptions(visit1.selectedSubOptions, v1SelectedEduForSubs)
    const v1SubIds = new Set(v1Subs.map(function(s) { return s.id }))
    const newlyAddedMeds = consentedMeds.filter(function(m) { return !v1MedIds.has(m.id) })
    const newlyAddedSubs = consentedSubs.filter(function(s) { return !v1SubIds.has(s.id) })

    // ===== 元の生活習慣の「悪さ」 =====
    const lifestyleBadness = [
      hidden.eating_habit === 'eating_out' ? 2 : 0,
      hidden.eating_habit === 'night_eating' ? 2 : 0,
      hidden.eating_habit === 'irregular' ? 1 : 0,
      hidden.stress_level === 'high' ? 1 : 0,
      hidden.work_busyness === 'high' ? 1 : 0,
      parseFloat(patient.vitals.bmi) >= 28 ? 2 : parseFloat(patient.vitals.bmi) >= 25 ? 1 : 0,
    ].reduce(function(a, b) { return a + b }, 0)

    // ===== 介入の強度評価 =====
    const interventionCount = consentedSubs.length + consentedEdu.length + consentedMeds.length
    const strictnessScore = consentedSubs.reduce(function(sum, s) {
      const scores = { very_strict: 3, strict: 2, moderate: 1, mild: 0.5, very_mild: 0.2, none: 0 }
      return sum + (scores[s.strictness] || 0)
    }, 0)

    // ===== 過負荷リスク =====
    const resistanceLevel = {
      cooperative: 0, anxious: 0.5, lazy: 1, resistant: 1.5, angry: 1.5
    }[hidden.personality_type] || 0.5
    const overloadPenalty = Math.max(0, (interventionCount - 3) * resistanceLevel * 0.15)

    // ===== Visit 2 説得成功率 =====
    const acceptedCount = v2ReactionLog.filter(function(r) {
      return r.reaction && (r.reaction.acceptance_level === 'accepted' || r.reaction.acceptance_level === 'partial')
    }).length
    const totalReactions = v2ReactionLog.length
    const persuasionSuccessRate = totalReactions > 0 ? acceptedCount / totalReactions : 0.5

    // ===== Visit 1+2 累積治療成功による意欲向上 =====
    const motivationBoost = persuasionSuccessRate >= 0.7 ? 0.25
      : persuasionSuccessRate >= 0.5 ? 0.15 : 0.05

    // ===== 実効アドヒアランス =====
    const baseAdherence = { high: 0.85, medium: 0.6, low: 0.35 }[hidden.adherence_level] || 0.6
    const effectiveAdherence = Math.min(1.0, Math.max(0.1,
      baseAdherence + motivationBoost - overloadPenalty
    ))

    // ===== Visit 3 の出発点：Visit 2 のバイタル =====
    const v2Vitals = visit2.vitals || {}
    const v2BpStr = v2Vitals.bp || patient.vitals.bp || '158/96 mmHg'
    const v2BpMatch = v2BpStr.match(/(\d+)\/(\d+)/)
    const startSystolic = v2BpMatch ? parseInt(v2BpMatch[1]) : 158
    const startDiastolic = v2BpMatch ? parseInt(v2BpMatch[2]) : 96
    const startWeight = parseFloat(v2Vitals.weight) || parseFloat(patient.vitals.weight) || 70
    const startBmi = parseFloat(v2Vitals.bmi) || parseFloat(patient.vitals.bmi) || 25

    // ===== 降圧効果の計算（V2のときの式 × 逓減係数） =====
    // V2 で既に効果が出ているため、継続治療では追加効果は小さい
    // ただし V2 で新規追加された治療は「初効果」なので強い効果
    const continuedMeds = consentedMeds.length - newlyAddedMeds.length
    const continuedSubs = consentedSubs.length - newlyAddedSubs.length

    // 投薬効果：継続分は逓減（30%）、新規追加分は通常効果（80%）
    const continuedMedEffect = continuedMeds > 0 ? (10 + Math.floor(Math.random() * 5)) * 0.3 : 0
    const newMedEffect = newlyAddedMeds.length > 0 ? newlyAddedMeds.length * (8 + Math.floor(Math.random() * 6)) * 0.8 : 0
    const medEffect = continuedMedEffect + newMedEffect

    // 生活指導効果（同様に継続/新規で差をつける）
    const saltSubs = consentedSubs.filter(function(s) { return s.category === 'salt' })
    const calorieSubs = consentedSubs.filter(function(s) { return s.category === 'calorie' })
    const lifestyleSubs = consentedSubs.filter(function(s) {
      return ['eating_out', 'night_eating', 'alcohol', 'aerobic', 'resistance'].includes(s.category)
    })

    const newSaltSub = newlyAddedSubs.find(function(s) { return s.category === 'salt' })
    const newLifestyleSubsCount = newlyAddedSubs.filter(function(s) {
      return ['eating_out', 'night_eating', 'alcohol', 'aerobic', 'resistance', 'calorie'].includes(s.category)
    }).length

    const saltEffect = saltSubs.length > 0
      ? (saltSubs[0].strictness === 'none' ? 0
         : (newSaltSub ? 3 + lifestyleBadness * 0.7 : (3 + lifestyleBadness * 0.7) * 0.4))
      : 0

    const lifestyleEffect = lifestyleSubs.length > 0
      ? (newLifestyleSubsCount > 0 ? (4 + lifestyleBadness * 0.5)
         : (4 + lifestyleBadness * 0.5) * 0.4)
      : 0

    const totalLifestyleEffect = (saltEffect + lifestyleEffect) * effectiveAdherence

    // 降圧効果合算
    const totalBpReduction = Math.round(
      (medEffect + totalLifestyleEffect) * (0.85 + Math.random() * 0.3)
    )

    const v3Systolic = Math.max(110, startSystolic - totalBpReduction + Math.floor(Math.random() * 6) - 3)
    const v3Diastolic = Math.max(65, startDiastolic - Math.round(totalBpReduction * 0.5) + Math.floor(Math.random() * 4) - 2)

    // ===== 体重変化 =====
    // 身長: 明示指定 > V2 vitals または初期 BMI と体重から逆算 > 165cm
    let height = parseFloat(patient.vitals.height)
    if (!height || isNaN(height)) {
      const refWeight = parseFloat(patient.vitals.weight) || startWeight || 70
      const refBmi = parseFloat(patient.vitals.bmi) || startBmi || 25
      if (refWeight > 0 && refBmi > 0) {
        height = Math.round(Math.sqrt(refWeight / refBmi) * 100 * 10) / 10
      } else {
        height = 165
      }
    }
    const hm = height / 100
    const idealWeight = Math.round(hm * hm * 22 * 10) / 10
    const age = patient.age
    const actCoef = age >= 75 ? 27.5 : age >= 65 ? 30 : 32.5
    const recCal = Math.round(idealWeight * actCoef / 200) * 200

    const calSub = consentedSubs.find(function(s) { return s.category === 'calorie' })
    const newCalSub = newlyAddedSubs.find(function(s) { return s.category === 'calorie' })
    const selectedCal = calSub ? parseInt(calSub.id.replace('cal_', '')) : null

    const bmiExcess = Math.max(0, startBmi - 22)
    const lenientThreshold = recCal + 400
    const calDeficit = selectedCal ? Math.max(0, lenientThreshold - selectedCal) : 0

    const hasWeightIntervention = calSub !== null || lifestyleSubs.length > 0
    // 継続なら逓減、新規追加 or 強化なら通常効果
    const weightIntensity = newCalSub || newLifestyleSubsCount > 0 ? 1.0 : 0.4
    const weightLossBase = hasWeightIntervention && startBmi >= 25
      ? (0.5 + bmiExcess * 0.12 + calDeficit * 0.0003 + lifestyleBadness * 0.12) * weightIntensity
      : hasWeightIntervention && startBmi >= 23
      ? (0.2 + lifestyleBadness * 0.04) * weightIntensity
      : 0.05 + Math.random() * 0.15

    const weightReduction = Math.round(
      Math.max(0, weightLossBase * effectiveAdherence * (0.8 + Math.random() * 0.4)) * 10
    ) / 10

    const v3Weight = Math.round((startWeight - weightReduction) * 10) / 10
    const v3Bmi = Math.round(v3Weight / ((height / 100) * (height / 100)) * 10) / 10

    const visit3Vitals = {
      bp: v3Systolic + '/' + v3Diastolic + ' mmHg',
      hr: patient.vitals.hr,
      temp: patient.vitals.temp,
      spo2: patient.vitals.spo2,
      height: height,
      weight: v3Weight,
      bmi: v3Bmi,
      weight_change: -weightReduction,
      bp_change: startSystolic - v3Systolic,
    }

    // ===== 血液検査結果（Visit 2 から少し改善 or 維持） =====
    // ===== Visit 3 検査結果（Visit 2 labs を baseline に追加 4 週間の効果を加味）=====
    // Visit 2 で生成・保存された labs を baseline とする。Visit 2 が無ければ patient.labs。
    const v2Labs = (visit2.visit2Labs && typeof visit2.visit2Labs === 'object') ? visit2.visit2Labs : null
    const baselineForV3 = v2Labs || (patient.labs && typeof patient.labs === 'object' ? patient.labs : null)
    const disease = caseData.disease_name
    const r1 = function(v) { return v == null ? null : Math.round(v * 10) / 10 }
    const rI = function(v) { return v == null ? null : Math.round(v) }
    let visit3Labs

    if (baselineForV3) {
      const totalLE = totalLifestyleEffect || 0
      const v3MedNames = consentedMeds.map(function(m) { return (m.drug_name_generic || '') + '|' + (m.drug_name_brand || '') + '|' + (m.medication_class || '') }).join(' ')
      const hasDiuretic = /thiazide|diuretic|フロセミド|ヒドロクロロチアジド|スピロノラクトン|トリクロル|インダパミド|利尿/.test(v3MedNames)
      const hasARB_ACE = /ARB|ACE|RAS|バルサルタン|オルメサルタン|アジルサルタン|テルミサルタン|ロサルタン|カンデサルタン|イルベサルタン|エナラプリル|ペリンドプリル/.test(v3MedNames)
      const hasStatin = /スタチン|statin|ロスバスタチン|アトルバスタチン|プラバスタチン|ピタバスタチン|シンバスタチン/.test(v3MedNames)
      const hasEzetimibe = /エゼチミブ|ゼチーア/.test(v3MedNames)
      const hasFibrate = /フィブラート|フェノフィブラート|ベザフィブラート/.test(v3MedNames)
      const hasMetformin = /メトホルミン/.test(v3MedNames)
      const hasSGLT2 = /エンパグリフロジン|ダパグリフロジン|カナグリフロジン|イプラグリフロジン|トホグリフロジン|SGLT2/.test(v3MedNames)
      const hasGLP1 = /セマグルチド|デュラグルチド|リラグルチド|オゼンピック|リベルサス|マンジャロ|チルゼパチド|GLP/.test(v3MedNames)
      const hasDPP4 = /シタグリプチン|リナグリプチン|テネリグリプチン|ビルダグリプチン|アログリプチン|アナグリプチン|オマリグリプチン/.test(v3MedNames)
      const hasSU = /グリメピリド|グリクラジド|グリベンクラミド/.test(v3MedNames)
      const hasInsulin = /インスリン|グラルギン|デグルデク|トレシーバ|アスパルト|リスプロ/.test(v3MedNames)
      const dmDrugCount = [hasMetformin, hasSGLT2, hasGLP1, hasDPP4, hasSU, hasInsulin].filter(function(b) { return b }).length
      const lifestyleFactor = totalLE * 0.01

      if (disease === '高血圧症') {
        visit3Labs = {
          na: rI(baselineForV3.na),
          k: r1((baselineForV3.k || 4.0) + (hasDiuretic ? -0.2 : 0) + (hasARB_ACE ? 0.1 : 0)),
          cr: r1(baselineForV3.cr),
          bun: rI(baselineForV3.bun),
          egfr: rI(baselineForV3.egfr),
          ldl: rI((baselineForV3.ldl || 120) * (1 - lifestyleFactor * 0.03) + (hasStatin && !v2Labs ? -(baselineForV3.ldl || 120) * 0.25 : 0)),
          hdl: rI(baselineForV3.hdl),
          tg: rI((baselineForV3.tg || 130) * (1 - lifestyleFactor * 0.08)),
          hba1c: r1(baselineForV3.hba1c),
          glucose: rI(baselineForV3.glucose),
          ua: r1((baselineForV3.ua || 5.0) + (hasDiuretic ? 0.3 : 0)),
          ast: rI(baselineForV3.ast),
          alt: rI(baselineForV3.alt),
        }
      } else if (disease === '2型糖尿病') {
        // === 1 Visit (4 週間) あたりの HbA1c 変化（先生指定値、V2→V3 にも同じ式を適用）===
        // 体重 1kg減 → -0.2%、生活習慣 → 最大 -0.5%
        // 経口薬: 1剤目 -0.7%、2剤目追加 -0.6%、3剤目追加 -0.5%
        // BOT → -1.0%、アドヒアランス補正のみ、総 cap なし
        // weightReduction は V2→V3 の追加 kg
        const wKg3 = (typeof weightReduction === 'number' && weightReduction > 0) ? weightReduction : 0
        const v3WeightEffect = -(wKg3 * 0.20)
        const v3LifestyleEffect = -Math.min(lifestyleFactor * 1.0, 0.5)
        const oralCount3 = [hasMetformin, hasSGLT2, hasGLP1 && !hasInsulin, hasDPP4, hasSU].filter(function(b) { return b }).length
        let oralEffect3 = 0
        if (oralCount3 >= 1) oralEffect3 -= 0.7
        if (oralCount3 >= 2) oralEffect3 -= 0.6
        if (oralCount3 >= 3) oralEffect3 -= 0.5
        const insulinEffect3 = hasInsulin ? -1.0 : 0
        const adherenceFactor3 = Math.max(0.5, Math.min(1.0, effectiveAdherence || 0.7))
        const hba1cDelta = (v3WeightEffect + v3LifestyleEffect + oralEffect3 + insulinEffect3) * adherenceFactor3
        const glucoseDelta = hba1cDelta * 30
        visit3Labs = {
          hba1c: r1((baselineForV3.hba1c || 7.0) + hba1cDelta),
          glucose: rI((baselineForV3.glucose || 130) + glucoseDelta),
          ldl: rI((baselineForV3.ldl || 120) * (1 - lifestyleFactor * 0.05) + (hasStatin && !v2Labs ? -(baselineForV3.ldl || 120) * 0.25 : 0)),
          hdl: rI(baselineForV3.hdl),
          tg: rI((baselineForV3.tg || 130) * (1 - lifestyleFactor * 0.1)),
          cr: r1(baselineForV3.cr),
          egfr: rI(baselineForV3.egfr),
          bun: rI(baselineForV3.bun),
          ua: r1(baselineForV3.ua),
          ast: rI(baselineForV3.ast),
          alt: rI(baselineForV3.alt),
          urine_alb: baselineForV3.urine_alb != null ? rI((baselineForV3.urine_alb || 20) * (hasSGLT2 || hasARB_ACE ? 0.9 : 1)) : null,
          urine_protein: baselineForV3.urine_protein,
        }
        if (baselineForV3.bnp != null) visit3Labs.bnp = rI(baselineForV3.bnp * (hasSGLT2 ? 0.85 : 1))
        if (baselineForV3.k != null) visit3Labs.k = r1(baselineForV3.k)
        if (baselineForV3.na != null) visit3Labs.na = rI(baselineForV3.na)
      } else if (disease === '脂質異常症') {
        // Visit 3 までにスタチン効果定常化
        const ldlReductionPct = !v2Labs ? ((hasStatin ? 0.40 : 0) + (hasEzetimibe ? 0.18 : 0) + (lifestyleFactor * 0.04)) : (lifestyleFactor * 0.03 + (hasStatin ? 0.05 : 0))
        const tgReductionPct = !v2Labs ? ((hasFibrate ? 0.35 : 0) + (hasStatin ? 0.12 : 0) + (lifestyleFactor * 0.05)) : (lifestyleFactor * 0.04)
        visit3Labs = {
          ldl: rI((baselineForV3.ldl || 130) * (1 - ldlReductionPct)),
          hdl: rI((baselineForV3.hdl || 50) + (hasStatin ? 1 : 0)),
          tg: rI((baselineForV3.tg || 130) * (1 - tgReductionPct)),
          total_cholesterol: baselineForV3.total_cholesterol != null ? rI((baselineForV3.total_cholesterol || 220) * (1 - ldlReductionPct * 0.7)) : null,
          non_hdl_c: baselineForV3.non_hdl_c != null ? rI((baselineForV3.non_hdl_c || 180) * (1 - ldlReductionPct * 0.9)) : null,
          hba1c: r1(baselineForV3.hba1c),
          glucose: rI(baselineForV3.glucose),
          ast: rI((baselineForV3.ast || 22) + (hasStatin && !v2Labs ? 2 : 0)),
          alt: rI((baselineForV3.alt || 24) + (hasStatin && !v2Labs ? 2 : 0)),
          ck: rI((baselineForV3.ck || 110) + (hasStatin && !v2Labs ? 12 : 0)),
          cr: r1(baselineForV3.cr),
          egfr: rI(baselineForV3.egfr),
          bun: rI(baselineForV3.bun),
          ua: r1(baselineForV3.ua),
        }
      } else {
        visit3Labs = Object.assign({}, baselineForV3)
      }
    } else {
      // patient.labs / v2Labs どちらも未定義: 旧ランダム生成
      visit3Labs = {
        na: 140 + Math.floor(Math.random() * 5),
        k: Math.round((3.8 + Math.random() * 0.6) * 10) / 10,
        cr: Math.round((0.7 + Math.random() * 0.4) * 10) / 10,
        bun: 14 + Math.floor(Math.random() * 6),
        egfr: 65 + Math.floor(Math.random() * 25),
        ldl: Math.round(115 + Math.random() * 25 - totalLifestyleEffect * 0.6),
        hdl: Math.round(57 + Math.random() * 15),
        tg: Math.round(125 + Math.random() * 35 - totalLifestyleEffect * 1.0),
        hba1c: Math.round((5.7 + Math.random() * 0.6) * 10) / 10,
        ua: Math.round((4.8 + Math.random() * 2.0) * 10) / 10,
      }
    }

    // ===== 患者の第一声生成 =====
    const motivationChange = motivationBoost > 0.2
      ? '治療がうまくいっており、前向きな気持ちが続いている。'
      : motivationBoost > 0.1 ? '少しずつ前向きになっている。' : ''

    const v2MedNames = v2SelectedMeds.map(function(m) { return m.drug_name_generic })
    const newMedNames = newlyAddedMeds.map(function(m) { return m.drug_name_generic })
    const v2SubLabels = v2SelectedSubs.map(function(s) { return s.label }).slice(0, 5)

    const prompt = `あなたは外来診療シミュレーションの患者AIです。
${caseData.disease_name}で初診から8週間が経過した患者の、Visit 3（再診）時の第一声を生成してください。
（前回 Visit 2 の診察から4週間後、初診からは8週間後）

【患者情報】
名前：${patient.name}（${patient.age}歳・${patient.gender}）
性格：${hidden.personality_type}
服薬意欲：${hidden.adherence_level}
生活改善意欲：${hidden.lifestyle_motivation}
食習慣：${hidden.eating_habit}
仕事の忙しさ：${hidden.work_busyness}
${motivationChange}

【Visit 2（前回・4週間前）の治療内容】
投薬：${v2MedNames.length > 0 ? v2MedNames.join('・') : 'なし'}
${newMedNames.length > 0 ? '※Visit 2で新たに追加された薬：' + newMedNames.join('・') : ''}
${rejectedMedNames.length > 0 ? '※同意を得ずに処方された薬：' + rejectedMedNames.join('・') + '（副作用への不安や不同意で服用していない）' : ''}
主な生活指導：${v2SubLabels.length > 0 ? v2SubLabels.join('・') : '特になし'}
${rejectedSubLabels.length > 0 ? '※同意を得ずに指導された生活指導：' + rejectedSubLabels.slice(0, 3).join('・') + '（守れていない）' : ''}

【Visit 2 → Visit 3 の経過（直近4週間）】
血圧変化：${startSystolic}/${startDiastolic} → ${v3Systolic}/${v3Diastolic} mmHg
体重変化：${startWeight}kg → ${v3Weight}kg
実効アドヒアランス：${Math.round(effectiveAdherence * 100)}%

【応答ルール】
・患者として自然な日本語で再診時の第一声（100〜150文字）
・「初診から2ヶ月（8週間）経って」など期間に触れてもよい
・以下の「言及ルール」を厳守すること：
　・「投薬：なし」の場合は薬について一切言及しない
　・「主な生活指導：特になし」の場合は生活指導について一切言及しない
　・「※同意を得ずに処方された薬」がある場合はその薬は飲んでいないことを述べる
　・「※同意を得ずに指導された生活指導」がある場合は守れていないことを述べる
・上記以外の、実際に処方・指導されて同意した項目については、守れた/守れなかったことを正直に述べる
・高アドヒアランスなら前向きな報告、低なら困難さや言い訳
・治療成功で意欲が上がった場合はそれを反映する
・性格（${hidden.personality_type}）に合った発言をする`

    const message = await claudeCreate({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    })

    const patientOpeningComment = message.content[0].text.trim()

    // DB を更新
    const generatedData = {
      visit3Vitals,
      visit3Labs,
      patientOpeningComment,
      bpReduction: startSystolic - v3Systolic,
      weightReduction,
      bpControlled: v3Systolic < 140,
      effectiveAdherence: Math.round(effectiveAdherence * 100),
      lifestyleBadness,
      motivationBoost: Math.round(motivationBoost * 100),
      newlyAddedMedsCount: newlyAddedMeds.length,
      newlyAddedSubsCount: newlyAddedSubs.length,
    }

    const mergedV3Data = Object.assign({}, existingV3, generatedData)
    await supabase.from('cases').update({
      current_visit: 3,
      status: 'visit3',
      visit3_data: mergedV3Data,
    }).eq('id', caseId)

    return Response.json(generatedData)

  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
