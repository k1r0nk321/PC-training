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
    const existingV2 = caseData.visit2_data || {}
    if (existingV2.visit2Vitals && existingV2.visit2Labs && existingV2.patientOpeningComment) {
      return Response.json({
        visit2Vitals: existingV2.visit2Vitals,
        visit2Labs: existingV2.visit2Labs,
        patientOpeningComment: existingV2.patientOpeningComment,
        bpReduction: existingV2.bpReduction || 0,
        weightReduction: existingV2.weightReduction || 0,
        bpControlled: existingV2.bpControlled || false,
        effectiveAdherence: existingV2.effectiveAdherence || 50,
        lifestyleBadness: existingV2.lifestyleBadness || 0,
        motivationBoost: existingV2.motivationBoost || 0,
        cached: true,
      })
    }

    const patient = caseData.patient_data
    const hidden = patient.hidden_params
    const visit1 = caseData.visit1_data || {}

    const selectedMeds = visit1.selectedMedications || []
    const selectedEdu = visit1.selectedEducation || []
    const reactionLog = visit1.reactionLog || []

    // selectedSubOptions は { eduId: { subId: true, ... } } 形式
    // sub_option オブジェクト配列に変換（id, label, strictness 等を保持）
    const selectedSubs = []
    const rawSubs = visit1.selectedSubOptions
    if (rawSubs && typeof rawSubs === 'object' && !Array.isArray(rawSubs)) {
      Object.entries(rawSubs).forEach(function(entry) {
        const eduId = entry[0]
        const subMap = entry[1] || {}
        const edu = selectedEdu.find(function(e) { return e && e.id === eduId })
        if (!edu || !Array.isArray(edu.sub_options)) return
        Object.entries(subMap).forEach(function(se) {
          if (se[1]) {
            const sub = edu.sub_options.find(function(s) { return s.id === se[0] })
            if (sub) selectedSubs.push(sub)
          }
        })
      })
    } else if (Array.isArray(rawSubs)) {
      // 旧形式（後方互換）
      selectedSubs.push.apply(selectedSubs, rawSubs.filter(function(s) { return s && typeof s === 'object' }))
    }

    // ===== 患者の同意が得られた介入のみを有効とする =====
    function isConsentedItem(item, expectedType) {
      if (!item || item.id == null) return false
      const match = reactionLog.find(function(r) {
        if (!r || !r.reaction || !r.item) return false
        if (expectedType && r.selectionType !== expectedType) return false
        return r.item.id === item.id
      })
      if (!match) return false
      const acc = match.reaction.acceptance_level
      return acc === 'accepted' || acc === 'partial'
    }
    const consentedMeds = selectedMeds.filter(function(m) { return isConsentedItem(m, 'medication') })
    const consentedEdu = selectedEdu.filter(function(e) { return isConsentedItem(e, 'education') })
    const consentedSubs = selectedSubs.filter(function(s) { return isConsentedItem(s, 'education_sub') })
    const rejectedMedNames = selectedMeds.filter(function(m) { return !isConsentedItem(m, 'medication') }).map(function(m) { return m.drug_name_generic })
    const rejectedSubLabels = selectedSubs.filter(function(s) { return !isConsentedItem(s, 'education_sub') }).map(function(s) { return s.label || s.id })

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
    const interventionCount = consentedSubs.length + consentedEdu.length + consentedMeds.length
    const strictnessScore = consentedSubs.reduce(function(sum, s) {
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
    const hasMedication = consentedMeds.length > 0
    const medEffect = hasMedication ? (10 + Math.floor(Math.random() * 8)) : 0

    // 生活指導の効果
    // 食生活が悪い患者は緩やかな制限でも効果大
    const saltSubs = consentedSubs.filter(function(s) { return s.category === 'salt' })
    const calorieSubs = consentedSubs.filter(function(s) { return s.category === 'calorie' })
    const lifestyleSubs = consentedSubs.filter(function(s) {
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
    const bmi1 = parseFloat(patient.vitals.bmi) || 25
    // 身長: 明示指定 > BMI と体重から逆算 > 165cm のフォールバック
    let height = parseFloat(patient.vitals.height)
    if (!height || isNaN(height)) {
      if (weight1 > 0 && bmi1 > 0) {
        height = Math.round(Math.sqrt(weight1 / bmi1) * 100 * 10) / 10
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

    const lifestyleWeightReduction = Math.round(
      Math.max(0, weightLossBase * effectiveAdherence * (0.8 + Math.random() * 0.4)) * 10
    ) / 10

    // ===== 薬剤による体重減少効果（先生指定）=====
    const consentedMedNames_wr = consentedMeds.map(function(m) { return (m.drug_name_generic || '') + '|' + (m.drug_name_brand || '') + '|' + (m.medication_class || '') }).join(' ')
    const hasMetformin_wr = /メトホルミン/.test(consentedMedNames_wr)
    const hasSGLT2_wr = /エンパグリフロジン|ダパグリフロジン|カナグリフロジン|イプラグリフロジン|トホグリフロジン|SGLT2/.test(consentedMedNames_wr)
    const hasGLP1Dulaglutide_wr = /デュラグルチド|トルリシティ/.test(consentedMedNames_wr)
    const hasGLP1Liraglutide_wr = /リラグルチド|ビクトーザ/.test(consentedMedNames_wr)
    const hasGLP1Semaglutide_wr = /セマグルチド|オゼンピック|リベルサス/.test(consentedMedNames_wr)
    const hasGLP1Tirzepatide_wr = /チルゼパチド|マンジャロ/.test(consentedMedNames_wr)
    const hasAnyWeightLossDrug = hasSGLT2_wr || hasGLP1Liraglutide_wr || hasGLP1Semaglutide_wr || hasGLP1Tirzepatide_wr
    let drugWeightLossPct = 0
    if (hasSGLT2_wr) drugWeightLossPct += 3
    if (hasGLP1Liraglutide_wr) drugWeightLossPct += 4
    if (hasGLP1Semaglutide_wr) drugWeightLossPct += 5
    if (hasGLP1Tirzepatide_wr) drugWeightLossPct += 7
    // デュラグルチドは加算しない（体重減少効果なし）
    if (hasMetformin_wr && !hasAnyWeightLossDrug) drugWeightLossPct += 1
    drugWeightLossPct = Math.min(drugWeightLossPct, 7)  // 絶対上限 7%
    const drugWeightLoss = Math.round(weight1 * drugWeightLossPct / 100 * effectiveAdherence * 10) / 10

    const weightReduction = Math.round((lifestyleWeightReduction + drugWeightLoss) * 10) / 10
    const weight2 = Math.round((weight1 - weightReduction) * 10) / 10
    const bmi2 = Math.round(weight2 / ((height / 100) * (height / 100)) * 10) / 10

    const visit2Vitals = {
      bp: systolic2 + '/' + diastolic2 + ' mmHg',
      hr: patient.vitals.hr,
      temp: patient.vitals.temp,
      spo2: patient.vitals.spo2,
      height: height,
      weight: weight2,
      bmi: bmi2,
      weight_change: -weightReduction,
      bp_change: systolic1 - systolic2,
    }

    // ===== 血液検査結果（baseline labs + 疾患別 intervention delta）=====
    const baselineLabs = (patient.labs && typeof patient.labs === 'object') ? patient.labs : null
    const disease = caseData.disease_name
    const r1 = function(v) { return v == null ? null : Math.round(v * 10) / 10 }
    const rI = function(v) { return v == null ? null : Math.round(v) }
    let visit2Labs

    if (baselineLabs) {
      const totalLE = totalLifestyleEffect || 0
      const consentedMedNames = consentedMeds.map(function(m) { return (m.drug_name_generic || '') + '|' + (m.drug_name_brand || '') + '|' + (m.medication_class || '') }).join(' ')
      const hasDiuretic = /thiazide|diuretic|フロセミド|ヒドロクロロチアジド|スピロノラクトン|トリクロル|インダパミド|利尿/.test(consentedMedNames)
      const hasARB_ACE = /ARB|ACE|RAS|バルサルタン|オルメサルタン|アジルサルタン|テルミサルタン|ロサルタン|カンデサルタン|イルベサルタン|エナラプリル|ペリンドプリル/.test(consentedMedNames)
      const hasStatin = /スタチン|statin|ロスバスタチン|アトルバスタチン|プラバスタチン|ピタバスタチン|シンバスタチン/.test(consentedMedNames)
      const hasEzetimibe = /エゼチミブ|ゼチーア/.test(consentedMedNames)
      const hasFibrate = /フィブラート|フェノフィブラート|ベザフィブラート/.test(consentedMedNames)
      const hasMetformin = /メトホルミン/.test(consentedMedNames)
      const hasSGLT2 = /エンパグリフロジン|ダパグリフロジン|カナグリフロジン|イプラグリフロジン|トホグリフロジン|SGLT2/.test(consentedMedNames)
      const hasGLP1 = /セマグルチド|デュラグルチド|リラグルチド|オゼンピック|リベルサス|マンジャロ|チルゼパチド|GLP/.test(consentedMedNames)
      const hasDPP4 = /シタグリプチン|リナグリプチン|テネリグリプチン|ビルダグリプチン|アログリプチン|アナグリプチン|オマリグリプチン/.test(consentedMedNames)
      const hasSU = /グリメピリド|グリクラジド|グリベンクラミド/.test(consentedMedNames)
      const hasInsulin = /インスリン|グラルギン|デグルデク|トレシーバ|アスパルト|リスプロ/.test(consentedMedNames)
      const lifestyleFactor = Math.min(totalLE * 0.01, 1.0)

      // === 包括的 lab 計算（先生指定式、全疾患共通）===
      const wKg = (typeof weightReduction === 'number' && weightReduction > 0) ? weightReduction : 0
      const adherenceFactor = Math.max(0.5, Math.min(1.0, effectiveAdherence || 0.7))
      const baseLabs = baselineLabs || {}
      const baseLDL = baseLabs.ldl || 0
      const baseHDL = baseLabs.hdl || 0
      const baseTG = baseLabs.tg || 0
      const baseUA = baseLabs.ua || 0
      const baseAST = baseLabs.ast
      const baseALT = baseLabs.alt
      const baseCr = baseLabs.cr || 0
      const baseEGFR = baseLabs.egfr || 0
      const baseAlb = baseLabs.urine_alb || 0
      const baseBNP = baseLabs.bnp
      const baseNa = baseLabs.na
      const baseK = baseLabs.k
      const baseCK = baseLabs.ck
      const baseHbA1c = baseLabs.hba1c || 0
      const baseGlucose = baseLabs.glucose || 0

      // HbA1c (先生指定式 — SGLT2/GLP-1 は薬効でなく体重減少経由のみ)
      // デュラグルチドのみ HbA1c 直接 -1.0%（体重減少効果なし）
      // oralCount は メトホルミン/DPP4/SU のみカウント
      const hasGLP1Dulaglutide = /デュラグルチド|トルリシティ/.test(consentedMedNames)
      const weightEffH = -(wKg * 0.20)
      const lifestyleEffH = -Math.min(lifestyleFactor * 1.0, 0.5)
      const oralCount = [hasMetformin, hasDPP4, hasSU].filter(function(b) { return b }).length
      let oralEff = 0
      if (oralCount >= 1) oralEff -= 0.7
      if (oralCount >= 2) oralEff -= 0.6
      if (oralCount >= 3) oralEff -= 0.5
      const dulaEff = hasGLP1Dulaglutide ? -0.6 : 0
      const insulinEff = hasInsulin ? -1.0 : 0
      const hba1cDelta = (weightEffH + lifestyleEffH + oralEff + dulaEff + insulinEff) * adherenceFactor
      const glucoseDelta = hba1cDelta * 30

      const hdlDelta = (wKg * 0.3 + lifestyleFactor * 3 + (hasStatin ? 2 : 0) + (hasFibrate ? 3 : 0)) * adherenceFactor

      let newTG
      if (baseTG > 0 && baseTG < 150) {
        let tgDelta = -(wKg * 4 + lifestyleFactor * 15)
        if (hasFibrate) tgDelta -= baseTG * 0.30
        if (hasStatin) tgDelta -= baseTG * 0.10
        tgDelta *= adherenceFactor
        newTG = baseTG + tgDelta
      } else if (baseTG >= 150) {
        let tgPct = (wKg * 0.04 + lifestyleFactor * 0.10 + (hasFibrate ? 0.30 : 0) + (hasStatin ? 0.10 : 0)) * adherenceFactor
        newTG = baseTG * (1 - tgPct)
      } else {
        newTG = baseTG
      }

      let ldlDelta = -(wKg * 1.5 + lifestyleFactor * 5)
      if (hasStatin) ldlDelta -= baseLDL * 0.35
      if (hasEzetimibe && !hasStatin) ldlDelta -= baseLDL * 0.20
      if (hasEzetimibe && hasStatin) ldlDelta -= baseLDL * 0.15
      ldlDelta *= adherenceFactor

      let uaDelta = -(wKg * 0.05 + lifestyleFactor * 0.2 + (hasSGLT2 ? 0.3 : 0)) + (hasDiuretic ? 0.5 : 0)
      uaDelta *= adherenceFactor

      // AST/ALT (条件付き、cumulative cap V1-20)
      const v1AST = (patient.labs && typeof patient.labs.ast === 'number') ? patient.labs.ast : null
      const v1ALT = (patient.labs && typeof patient.labs.alt === 'number') ? patient.labs.alt : null
      function calcLiverEnz(baseVal, baselineV1Val, perKg) {
        if (baseVal == null) return null
        let d = 0
        if (baseVal < 35) {
          d = -(wKg * perKg + lifestyleFactor * 0.5)
          if (hasStatin) d += 2
          d *= adherenceFactor
          d = Math.max(d, -10)
        } else {
          let pct = Math.min(wKg * 0.10 + lifestyleFactor * 0.05, 0.20)
          d = -baseVal * pct
          if (hasStatin) d += 2
          d *= adherenceFactor
        }
        let newVal = baseVal + d
        if (baselineV1Val != null && newVal < baselineV1Val - 20) newVal = baselineV1Val - 20
        return newVal
      }
      const newAST = calcLiverEnz(baseAST, v1AST, 0.5)
      const newALT = calcLiverEnz(baseALT, v1ALT, 1.0)

      const crDelta = (hasSGLT2 ? 0.05 : 0) * adherenceFactor
      const egfrDelta = (hasSGLT2 ? -3 : 0) * adherenceFactor
      const kDelta = ((hasDiuretic ? -0.3 : 0) + (hasARB_ACE ? 0.2 : 0)) * adherenceFactor
      const naDelta = (hasDiuretic ? -1 : 0) * adherenceFactor

      let albDelta = -(wKg * 2 + lifestyleFactor * 3)
      if (hasSGLT2 || hasARB_ACE) albDelta -= baseAlb * 0.15
      albDelta *= adherenceFactor

      const bnpFactor = hasSGLT2 ? 0.8 : 1.0
      const ckDelta = (hasStatin ? 15 : 0) * adherenceFactor

      visit2Labs = {
        hba1c: baseHbA1c > 0 ? r1(baseHbA1c + hba1cDelta) : r1(baseHbA1c),
        glucose: baseGlucose > 0 ? rI(baseGlucose + glucoseDelta) : rI(baseGlucose),
        ldl: baseLDL > 0 ? rI(baseLDL + ldlDelta) : null,
        hdl: baseHDL > 0 ? rI(baseHDL + hdlDelta) : null,
        tg: baseTG > 0 ? rI(newTG) : null,
        cr: baseCr > 0 ? r1(baseCr + crDelta) : null,
        bun: rI(baseLabs.bun),
        egfr: baseEGFR > 0 ? rI(baseEGFR + egfrDelta) : null,
        ua: baseUA > 0 ? r1(baseUA + uaDelta) : null,
        ast: newAST != null ? rI(newAST) : null,
        alt: newALT != null ? rI(newALT) : null,
        urine_alb: baseLabs.urine_alb != null ? rI(Math.max(0, baseAlb + albDelta)) : null,
        urine_protein: baseLabs.urine_protein,
      }
      if (baseBNP != null) visit2Labs.bnp = rI(Math.max(0, baseBNP * bnpFactor))
      if (baseK != null) visit2Labs.k = r1(baseK + kDelta)
      if (baseNa != null) visit2Labs.na = rI(baseNa + naDelta)
      if (baseCK != null) visit2Labs.ck = rI(baseCK + ckDelta)
      if (baseLabs.total_cholesterol != null) visit2Labs.total_cholesterol = rI(baseLabs.total_cholesterol + ldlDelta * 0.7)
      if (baseLabs.non_hdl_c != null) visit2Labs.non_hdl_c = rI(baseLabs.non_hdl_c + ldlDelta * 0.9)
      if (baseLabs.alb != null) visit2Labs.alb = r1(baseLabs.alb)

      // === 臨床的妥当性 floor / cap ===
      if (visit2Labs.hba1c != null && visit2Labs.hba1c < 5.0) visit2Labs.hba1c = 5.0
      if (visit2Labs.ldl != null && visit2Labs.ldl < 50) visit2Labs.ldl = 50
      if (visit2Labs.hdl != null) {
        if (visit2Labs.hdl < 30) visit2Labs.hdl = 30
        if (visit2Labs.hdl > 100) visit2Labs.hdl = 100
      }
      if (visit2Labs.tg != null && visit2Labs.tg < 50) visit2Labs.tg = 50
      if (visit2Labs.ua != null && visit2Labs.ua < 2.0) visit2Labs.ua = 2.0
      if (visit2Labs.ast != null && visit2Labs.ast < 10) visit2Labs.ast = 10
      if (visit2Labs.alt != null && visit2Labs.alt < 10) visit2Labs.alt = 10
      if (visit2Labs.glucose != null && visit2Labs.glucose < 70) visit2Labs.glucose = 70
      if (visit2Labs.urine_alb != null && visit2Labs.urine_alb < 0) visit2Labs.urine_alb = 0
    } else {
      visit2Labs = {
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
    }

    // ===== 患者の4週間コメント生成 =====
    // 治療成功により意欲が向上した場合の反映
    const motivationChange = motivationBoost > 0.15
      ? '治療がうまくいっているので、少し前向きになっている。'
      : motivationBoost > 0 ? '少しずつ前向きになっている。' : ''

    const prompt = `あなたは外来診療シミュレーションの患者AIです。
${caseData.disease_name}で4週間前に初診し治療を開始した患者の再診時の第一声を生成してください。

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
${rejectedMedNames.length > 0 ? '※同意を得ずに処方された薬：' + rejectedMedNames.join('・') + '（副作用への不安や治療方針への不同意で服用していない）' : ''}
主な生活指導：${selectedSubs.length > 0 ? selectedSubs.map(function(s) { return s.label }).slice(0, 3).join('・') : '特になし'}
${rejectedSubLabels.length > 0 ? '※同意を得ずに指導された生活指導：' + rejectedSubLabels.slice(0, 3).join('・') + '（本人は守れていない）' : ''}

【4週間の経過】
${caseData.disease_name === '高血圧症' ? '血圧変化：' + systolic1 + '/' + diastolic1 + ' → ' + systolic2 + '/' + diastolic2 + ' mmHg\n' : ''}体重変化：${weight1}kg → ${weight2}kg
${caseData.disease_name === '2型糖尿病' ? 'HbA1c は次回採血で確認予定（4週間では大きな変化は出にくい）\n' : caseData.disease_name === '脂質異常症' ? 'LDL-C は次回採血で確認予定\n' : ''}実効アドヒアランス：${Math.round(effectiveAdherence * 100)}%

【応答ルール】
・患者として自然な日本語で再診時の第一声（100〜150文字）
・以下の「言及ルール」を厳守すること：
　　・「投薬：なし」の場合は、薬について一切言及しない（「飲めている」も「飲めていない」も言わない）
　　・「主な生活指導：特になし」の場合は、生活指導について一切言及しない
　　・「※同意を得ずに処方された薬」がある場合は、その薬は飲んでいないことを述べる
　　・「※同意を得ずに指導された生活指導」がある場合は、その指導は守れていないことを述べる
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

    const generatedData = {
      visit2Vitals,
      visit2Labs,
      patientOpeningComment,
      bpReduction: systolic1 - systolic2,
      weightReduction,
      bpControlled: systolic2 < 140,
      effectiveAdherence: Math.round(effectiveAdherence * 100),
      lifestyleBadness,
      motivationBoost: Math.round(motivationBoost * 100),
    }

    // DBに生成データを保存（既存の visit2_data フィールドをマージ）
    const mergedV2Data = Object.assign({}, existingV2, generatedData)
    await supabase.from('cases').update({
      current_visit: 2,
      status: 'visit2',
      visit2_data: mergedV2Data,
    }).eq('id', caseId)

    return Response.json(generatedData)

  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
