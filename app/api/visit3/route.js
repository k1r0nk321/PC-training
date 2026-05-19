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
    const { caseId, userPosition: bodyUserPosition, userDisplayName: bodyUserDisplayName } = await req.json()
    const supabase = getAdminClient()

    const { data: caseData, error } = await supabase
      .from('cases').select('*').eq('id', caseId).single()
    if (error || !caseData) {
      return Response.json({ error: 'Case not found' }, { status: 404 })
    }

    // 学習モード呼称: ユーザー身分と表示名を取得
    // 優先: DB の user_profiles → 取得失敗または匿名なら body の値にフォールバック
    let userPosition = null
    let userDisplayName = ''
    if (caseData.user_id) {
      try {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('position, real_name, handle_name, display_preference')
          .eq('user_id', caseData.user_id)
          .maybeSingle()
        if (profile) {
          userPosition = profile.position || null
          const pref = profile.display_preference
          if (pref === 'handle_name' && profile.handle_name) {
            userDisplayName = profile.handle_name
          } else if (profile.real_name) {
            userDisplayName = profile.real_name.split(/[\s\u3000]+/)[0] || profile.real_name
          }
        }
      } catch (e) {
        // ignore
      }
    }
    // フォールバック: profile が無い(=匿名/デモ利用者)場合は body の値を使う
    if (!userPosition && bodyUserPosition) userPosition = bodyUserPosition
    if (!userDisplayName && bodyUserDisplayName) userDisplayName = bodyUserDisplayName

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

    const lifestyleWeightReduction = Math.round(
      Math.max(0, weightLossBase * effectiveAdherence * (0.8 + Math.random() * 0.4)) * 10
    ) / 10

    // ===== 薬剤による体重減少効果（先生指定）=====
    const consentedMedNames_wr = consentedMeds.map(function(m) { return (m.drug_name_generic || '') + '|' + (m.drug_name_brand || '') + '|' + (m.medication_class || '') }).join(' ')
    const hasMetformin_wr = /メトホルミン/.test(consentedMedNames_wr)
    const hasSGLT2_wr = /エンパグリフロジン|ダパグリフロジン|カナグリフロジン|イプラグリフロジン|トホグリフロジン|SGLT2/.test(consentedMedNames_wr)
    const hasGLP1Liraglutide_wr = /リラグルチド|ビクトーザ/.test(consentedMedNames_wr)
    const hasGLP1Semaglutide_wr = /セマグルチド|オゼンピック|リベルサス/.test(consentedMedNames_wr)
    const hasGLP1Tirzepatide_wr = /チルゼパチド|マンジャロ/.test(consentedMedNames_wr)
    const hasAnyWeightLossDrug = hasSGLT2_wr || hasGLP1Liraglutide_wr || hasGLP1Semaglutide_wr || hasGLP1Tirzepatide_wr
    let drugWeightLossPct = 0
    if (hasSGLT2_wr) drugWeightLossPct += 3
    if (hasGLP1Liraglutide_wr) drugWeightLossPct += 4
    if (hasGLP1Semaglutide_wr) drugWeightLossPct += 5
    if (hasGLP1Tirzepatide_wr) drugWeightLossPct += 7
    if (hasMetformin_wr && !hasAnyWeightLossDrug) drugWeightLossPct += 1
    drugWeightLossPct = Math.min(drugWeightLossPct, 7)
    const drugWeightLoss = Math.round(startWeight * drugWeightLossPct / 100 * effectiveAdherence * 10) / 10

    const weightReduction = Math.round((lifestyleWeightReduction + drugWeightLoss) * 10) / 10
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
      const hasXOI = /フェブキソスタット|フェブリク|フェブリック|アロプリノール|ザイロリック|サロベール|トピロキソスタット|トピロリック/.test(v3MedNames)
      const hasUricosuric = /プロベネシド|ベネシッド|ベンズブロマロン|ユリノーム|ドチヌラド|ユリス/.test(v3MedNames)
      const hasTZD = /ピオグリタゾン|アクトス/.test(v3MedNames)
      const hasAGI = /アカルボース|グルコバイ|ボグリボース|ベイスン|ミグリトール|セイブル/.test(v3MedNames)
      const hasGlinide = /ナテグリニド|スターシス|ファスティック|レパグリニド|シュアポスト|ミチグリニド|グルファスト/.test(v3MedNames)
      const hasPCSK9 = /エボロクマブ|レパーサ|アリロクマブ|プラルエント|PCSK9/.test(v3MedNames)
      const hasEPA = /イコサペント酸|エパデール|ロトリガ|エイコサペンタエン|オメガ3|オメガ-3/.test(v3MedNames)
      const dmDrugCount = [hasMetformin, hasSGLT2, hasGLP1, hasDPP4, hasSU, hasInsulin].filter(function(b) { return b }).length
      const lifestyleFactor = totalLE * 0.01

      // === 包括的 lab 計算（先生指定式、全疾患共通）===
      const wKg = (typeof weightReduction === 'number' && weightReduction > 0) ? weightReduction : 0
      const adherenceFactor = Math.max(0.5, Math.min(1.0, effectiveAdherence || 0.7))
      const baseLabs = baselineForV3 || {}
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
      const hasGLP1Dulaglutide = /デュラグルチド|トルリシティ/.test(v3MedNames)
      const weightEffH = -(wKg * 0.20)
      const lifestyleEffH = -Math.min(lifestyleFactor * 1.0, 0.5)
      const oralCount = [hasMetformin, hasDPP4, hasSU, hasTZD, hasAGI, hasGlinide].filter(function(b) { return b }).length
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
        if (hasEPA) tgDelta -= baseTG * 0.20
        tgDelta *= adherenceFactor
        newTG = baseTG + tgDelta
      } else if (baseTG >= 150) {
        let tgPct = (wKg * 0.04 + lifestyleFactor * 0.10 + (hasFibrate ? 0.30 : 0) + (hasStatin ? 0.10 : 0) + (hasEPA ? 0.20 : 0)) * adherenceFactor
        newTG = baseTG * (1 - tgPct)
      } else {
        newTG = baseTG
      }

      let ldlDelta = -(wKg * 1.5 + lifestyleFactor * 5)
      if (hasStatin) ldlDelta -= baseLDL * 0.35
      if (hasEzetimibe) ldlDelta -= baseLDL * 0.18
      if (hasPCSK9) ldlDelta -= baseLDL * 0.50
      if (hasEzetimibe && !hasStatin) ldlDelta -= baseLDL * 0.20
      if (hasEzetimibe && hasStatin) ldlDelta -= baseLDL * 0.15
      ldlDelta *= adherenceFactor

      let uaDelta = -(wKg * 0.05 + lifestyleFactor * 0.2 + (hasSGLT2 ? 0.3 : 0) + (hasXOI ? 2.5 : 0) + (hasUricosuric ? 1.7 : 0)) + (hasDiuretic ? 0.5 : 0)
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

      visit3Labs = {
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
      if (baseBNP != null) visit3Labs.bnp = rI(Math.max(0, baseBNP * bnpFactor))
      if (baseK != null) visit3Labs.k = r1(baseK + kDelta)
      if (baseNa != null) visit3Labs.na = rI(baseNa + naDelta)
      if (baseCK != null) visit3Labs.ck = rI(baseCK + ckDelta)
      if (baseLabs.total_cholesterol != null) visit3Labs.total_cholesterol = rI(baseLabs.total_cholesterol + ldlDelta * 0.7)
      if (baseLabs.non_hdl_c != null) visit3Labs.non_hdl_c = rI(baseLabs.non_hdl_c + ldlDelta * 0.9)
      if (baseLabs.alb != null) visit3Labs.alb = r1(baseLabs.alb)

      // === 臨床的妥当性 floor / cap ===
      if (visit3Labs.hba1c != null && visit3Labs.hba1c < 5.0) visit3Labs.hba1c = 5.0
      if (visit3Labs.ldl != null && visit3Labs.ldl < 50) visit3Labs.ldl = 50
      if (visit3Labs.hdl != null) {
        if (visit3Labs.hdl < 30) visit3Labs.hdl = 30
        if (visit3Labs.hdl > 100) visit3Labs.hdl = 100
      }
      if (visit3Labs.tg != null && visit3Labs.tg < 50) visit3Labs.tg = 50
      if (visit3Labs.ua != null && visit3Labs.ua < 2.0) visit3Labs.ua = 2.0
      if (visit3Labs.ast != null && visit3Labs.ast < 10) visit3Labs.ast = 10
      if (visit3Labs.alt != null && visit3Labs.alt < 10) visit3Labs.alt = 10
      if (visit3Labs.glucose != null && visit3Labs.glucose < 70) visit3Labs.glucose = 70
      if (visit3Labs.urine_alb != null && visit3Labs.urine_alb < 0) visit3Labs.urine_alb = 0
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

    const NON_PHYSICIAN_LIST = ['医学生', '医療従事者', 'その他']
    const isNonPhysician = userPosition && NON_PHYSICIAN_LIST.indexOf(userPosition) >= 0
    const addressInstruction = (isNonPhysician && userDisplayName)
      ? '\n\n【重要 - 呼称】対面しているのは医師ではなく' + userPosition + 'です。「先生」と呼ばずに「' + userDisplayName + 'さん」と呼びかけてください。'
      : ''

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
${addressInstruction}

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
    const { caseId, userPosition: bodyUserPosition, userDisplayName: bodyUserDisplayName } = await req.json()
    const supabase = getAdminClient()

    const { data: caseData, error } = await supabase
      .from('cases').select('*').eq('id', caseId).single()
    if (error || !caseData) {
      return Response.json({ error: 'Case not found' }, { status: 404 })
    }

    // 学習モード呼称: ユーザー身分と表示名を取得
    // 優先: DB の user_profiles → 取得失敗または匿名なら body の値にフォールバック
    let userPosition = null
    let userDisplayName = ''
    if (caseData.user_id) {
      try {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('position, real_name, handle_name, display_preference')
          .eq('user_id', caseData.user_id)
          .maybeSingle()
        if (profile) {
          userPosition = profile.position || null
          const pref = profile.display_preference
          if (pref === 'handle_name' && profile.handle_name) {
            userDisplayName = profile.handle_name
          } else if (profile.real_name) {
            userDisplayName = profile.real_name.split(/[\s\u3000]+/)[0] || profile.real_name
          }
        }
      } catch (e) {
        // ignore
      }
    }
    // フォールバック: profile が無い(=匿名/デモ利用者)場合は body の値を使う
    if (!userPosition && bodyUserPosition) userPosition = bodyUserPosition
    if (!userDisplayName && bodyUserDisplayName) userDisplayName = bodyUserDisplayName

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

    const lifestyleWeightReduction = Math.round(
      Math.max(0, weightLossBase * effectiveAdherence * (0.8 + Math.random() * 0.4)) * 10
    ) / 10

    // ===== 薬剤による体重減少効果（先生指定）=====
    const consentedMedNames_wr = consentedMeds.map(function(m) { return (m.drug_name_generic || '') + '|' + (m.drug_name_brand || '') + '|' + (m.medication_class || '') }).join(' ')
    const hasMetformin_wr = /メトホルミン/.test(consentedMedNames_wr)
    const hasSGLT2_wr = /エンパグリフロジン|ダパグリフロジン|カナグリフロジン|イプラグリフロジン|トホグリフロジン|SGLT2/.test(consentedMedNames_wr)
    const hasGLP1Liraglutide_wr = /リラグルチド|ビクトーザ/.test(consentedMedNames_wr)
    const hasGLP1Semaglutide_wr = /セマグルチド|オゼンピック|リベルサス/.test(consentedMedNames_wr)
    const hasGLP1Tirzepatide_wr = /チルゼパチド|マンジャロ/.test(consentedMedNames_wr)
    const hasAnyWeightLossDrug = hasSGLT2_wr || hasGLP1Liraglutide_wr || hasGLP1Semaglutide_wr || hasGLP1Tirzepatide_wr
    let drugWeightLossPct = 0
    if (hasSGLT2_wr) drugWeightLossPct += 3
    if (hasGLP1Liraglutide_wr) drugWeightLossPct += 4
    if (hasGLP1Semaglutide_wr) drugWeightLossPct += 5
    if (hasGLP1Tirzepatide_wr) drugWeightLossPct += 7
    if (hasMetformin_wr && !hasAnyWeightLossDrug) drugWeightLossPct += 1
    drugWeightLossPct = Math.min(drugWeightLossPct, 7)
    const drugWeightLoss = Math.round(startWeight * drugWeightLossPct / 100 * effectiveAdherence * 10) / 10

    const weightReduction = Math.round((lifestyleWeightReduction + drugWeightLoss) * 10) / 10
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

      // === 包括的 lab 計算（先生指定式、全疾患共通）===
      const wKg = (typeof weightReduction === 'number' && weightReduction > 0) ? weightReduction : 0
      const adherenceFactor = Math.max(0.5, Math.min(1.0, effectiveAdherence || 0.7))
      const baseLabs = baselineForV3 || {}
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
      const hasGLP1Dulaglutide = /デュラグルチド|トルリシティ/.test(v3MedNames)
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

      visit3Labs = {
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
      if (baseBNP != null) visit3Labs.bnp = rI(Math.max(0, baseBNP * bnpFactor))
      if (baseK != null) visit3Labs.k = r1(baseK + kDelta)
      if (baseNa != null) visit3Labs.na = rI(baseNa + naDelta)
      if (baseCK != null) visit3Labs.ck = rI(baseCK + ckDelta)
      if (baseLabs.total_cholesterol != null) visit3Labs.total_cholesterol = rI(baseLabs.total_cholesterol + ldlDelta * 0.7)
      if (baseLabs.non_hdl_c != null) visit3Labs.non_hdl_c = rI(baseLabs.non_hdl_c + ldlDelta * 0.9)
      if (baseLabs.alb != null) visit3Labs.alb = r1(baseLabs.alb)

      // === 臨床的妥当性 floor / cap ===
      if (visit3Labs.hba1c != null && visit3Labs.hba1c < 5.0) visit3Labs.hba1c = 5.0
      if (visit3Labs.ldl != null && visit3Labs.ldl < 50) visit3Labs.ldl = 50
      if (visit3Labs.hdl != null) {
        if (visit3Labs.hdl < 30) visit3Labs.hdl = 30
        if (visit3Labs.hdl > 100) visit3Labs.hdl = 100
      }
      if (visit3Labs.tg != null && visit3Labs.tg < 50) visit3Labs.tg = 50
      if (visit3Labs.ua != null && visit3Labs.ua < 2.0) visit3Labs.ua = 2.0
      if (visit3Labs.ast != null && visit3Labs.ast < 10) visit3Labs.ast = 10
      if (visit3Labs.alt != null && visit3Labs.alt < 10) visit3Labs.alt = 10
      if (visit3Labs.glucose != null && visit3Labs.glucose < 70) visit3Labs.glucose = 70
      if (visit3Labs.urine_alb != null && visit3Labs.urine_alb < 0) visit3Labs.urine_alb = 0
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

    const NON_PHYSICIAN_LIST = ['医学生', '医療従事者', 'その他']
    const isNonPhysician = userPosition && NON_PHYSICIAN_LIST.indexOf(userPosition) >= 0
    const addressInstruction = (isNonPhysician && userDisplayName)
      ? '\n\n【重要 - 呼称】対面しているのは医師ではなく' + userPosition + 'です。「先生」と呼ばずに「' + userDisplayName + 'さん」と呼びかけてください。'
      : ''

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
${addressInstruction}

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
