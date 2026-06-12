// ============================================================
// 到達目標（達成度評価）の共通判定ロジック
// ------------------------------------------------------------
// すべての疾患に共通の「4つの到達目標」を判定する。
//   1. 適切な生活指導の実施（食事・運動。喫煙者は禁煙、過量飲酒者は節酒）
//   2. 適切な投薬の選択（AI判定。学習者モードでは自動達成）
//   3. 適切な合併症の評価と管理（検査オーダー＋必要時コンサルト。学習者モードでは自動達成）
//   4. 信頼度が Visit 3 終了時に 5 に到達
//
// 判定方針：4項目すべて達成で「合格」、1つでも未達成で「不合格」。
//
// サーバー（visit3-feedback API）でもクライアント（到達目標ボタン）でも
// 使えるよう、依存のない純関数として実装する。
// ============================================================

// 生活指導カテゴリ（patient_education.category の実値に対応）
export const LIFESTYLE_CATEGORY = {
  DIET: 'diet',       // 食事指導
  EXERCISE: 'exercise', // 運動指導
  SMOKING: 'smoking',  // 禁煙指導
  DRINKING: 'drinking', // 節酒指導
}

// --- 患者が現在喫煙者か ---
export function isCurrentSmoker(patient) {
  if (!patient) return false
  const hp = patient.hidden_params || {}
  if (hp.smoking_status) {
    return String(hp.smoking_status).toLowerCase() === 'current'
  }
  // フォールバック：ラベル文字列から推定
  const label = String(patient.smoking_initial || hp.smoking_label || '')
  if (!label) return false
  if (label.indexOf('非喫煙') >= 0 || label.indexOf('禁煙') >= 0) return false
  return label.indexOf('喫煙') >= 0 || label.indexOf('現在') >= 0
}

// --- 患者の飲酒量が多い（節酒指導が必要）か ---
export function isHeavyDrinker(patient) {
  if (!patient) return false
  const hp = patient.hidden_params || {}
  // ラベル（適量 / やや過量 / 過量 など）を優先
  const label = String(patient.drinking_initial || '')
  if (label) {
    if (label.indexOf('過量') >= 0 || label.indexOf('多') >= 0) return true
    if (label.indexOf('適量') >= 0 || label.indexOf('機会') >= 0 || label.indexOf('なし') >= 0) return false
  }
  // 量の記述から推定（ビール換算でおおよそ 500ml/日 超を「多い」とみなす簡易判定）
  const amount = String(hp.drinking_amount || patient.drinking_detail || '')
  if (!amount) return false
  if (amount.indexOf('禁酒') >= 0 || amount.indexOf('飲まない') >= 0) return false
  const ml = amount.match(/(\d+)\s*ml/i)
  const go = amount.match(/(\d+)\s*合/) // 日本酒・焼酎の「合」
  const cans = amount.match(/(\d+)\s*(本|缶)/)
  if (go && Number(go[1]) >= 2) return true
  if (cans && Number(cans[1]) >= 2) return true
  if (ml && Number(ml[1]) >= 700) return true
  if (amount.indexOf('毎日') >= 0 && (cans || ml || go)) return true
  return false
}

// --- この症例でコンサルト（合併症管理の連携）が推奨されているか ---
export function consultationRecommended(scenarioData) {
  const rec = scenarioData && scenarioData.consultation_recommendation
  if (!rec) return false
  if (rec.necessity === 'recommended' || rec.necessity === 'required') return true
  if (Array.isArray(rec.appropriate_specialties) && rec.appropriate_specialties.length > 0) return true
  if (rec.recommended_specialty) return true
  return false
}

// 配列の中に指定カテゴリの生活指導が含まれるか
function hasEduCategory(eduList, category) {
  return (eduList || []).some(function (e) { return e && e.category === category })
}

// ============================================================
// メイン：到達目標の達成判定
// ------------------------------------------------------------
// input:
//   patient            患者データ（hidden_params 等）
//   scenarioData       症例の模範解答（expected_* / consultation_recommendation）
//   eduCategories      実施した生活指導カテゴリの配列（全Visit集約済み, 例 ['diet','exercise']）
//   examOrdered        検査オーダーを実施したか（boolean, 全Visit集約済み）
//   consultationDone   コンサルト依頼を実施したか（boolean, 全Visit集約済み）
//   trustLevel         Visit 3 終了時の信頼度（0〜5, 数値）
//   autoTreatmentUsed  学習者モード（担当医任せ）か
//   medAppropriate     投薬が適切か（AI判定の真偽。未指定なら 'pending'）
// returns:
//   { items: [{key,label,achieved,applicable,detail}], passed, autoTreatmentUsed }
// ============================================================
export function evaluateGoals(input) {
  const {
    patient,
    scenarioData,
    eduCategories,
    examOrdered,
    consultationDone,
    trustLevel,
    autoTreatmentUsed,
    medAppropriate,
  } = input || {}

  const cats = eduCategories || []
  const smoker = isCurrentSmoker(patient)
  const heavyDrinker = isHeavyDrinker(patient)

  // --- 項目1：適切な生活指導 ---
  const subDiet = cats.indexOf(LIFESTYLE_CATEGORY.DIET) >= 0
  const subExercise = cats.indexOf(LIFESTYLE_CATEGORY.EXERCISE) >= 0
  const subSmoking = cats.indexOf(LIFESTYLE_CATEGORY.SMOKING) >= 0
  const subDrinking = cats.indexOf(LIFESTYLE_CATEGORY.DRINKING) >= 0
  const lifestyleSubs = [
    { key: 'diet', label: '食事指導', required: true, done: subDiet },
    { key: 'exercise', label: '運動指導', required: true, done: subExercise },
    { key: 'smoking', label: '禁煙指導', required: smoker, done: subSmoking },
    { key: 'drinking', label: '節酒指導', required: heavyDrinker, done: subDrinking },
  ]
  const lifestyleAchieved = lifestyleSubs.every(function (s) { return !s.required || s.done })

  // --- 項目2：適切な投薬 ---
  let medAchieved, medDetail
  if (autoTreatmentUsed) {
    medAchieved = true
    medDetail = '学習者モードのため対象外（自動達成）'
  } else if (medAppropriate === true) {
    medAchieved = true; medDetail = '適切な投薬を選択'
  } else if (medAppropriate === false) {
    medAchieved = false; medDetail = '投薬選択が不適切'
  } else {
    medAchieved = null; medDetail = '最終評価（Visit 3）でAIが判定' // pending
  }

  // --- 項目3：適切な合併症の評価と管理 ---
  let complicationAchieved, complicationDetail
  if (autoTreatmentUsed) {
    complicationAchieved = true
    complicationDetail = '学習者モードのため対象外（自動達成）'
  } else {
    const needConsult = consultationRecommended(scenarioData)
    const consultOk = needConsult ? !!consultationDone : true
    complicationAchieved = !!examOrdered && consultOk
    const parts = []
    parts.push(examOrdered ? '検査オーダー済' : '検査オーダーなし')
    if (needConsult) parts.push(consultationDone ? 'コンサルト依頼済' : 'コンサルト依頼なし')
    else parts.push('コンサルトは不要な症例')
    complicationDetail = parts.join(' / ')
  }

  // --- 項目4：信頼度 ---
  const trust = Number(trustLevel)
  const trustAchieved = !isNaN(trust) && trust >= 5
  const trustDetail = isNaN(trust)
    ? '信頼度の記録なし'
    : 'Visit 3 終了時の信頼度：' + trust + ' / 5'

  const items = [
    {
      key: 'lifestyle',
      label: '適切な生活指導の実施',
      achieved: lifestyleAchieved,
      applicable: true,
      detail: lifestyleSubs
        .filter(function (s) { return s.required })
        .map(function (s) { return s.label + (s.done ? '✓' : '✗') })
        .join('・'),
      subs: lifestyleSubs,
    },
    {
      key: 'medication',
      label: '適切な投薬の選択',
      achieved: medAchieved,
      applicable: !autoTreatmentUsed,
      detail: medDetail,
    },
    {
      key: 'complication',
      label: '適切な合併症の評価と管理',
      achieved: complicationAchieved,
      applicable: !autoTreatmentUsed,
      detail: complicationDetail,
    },
    {
      key: 'trust',
      label: '信頼度が 5 に到達（Visit 3）',
      achieved: trustAchieved,
      applicable: true,
      detail: trustDetail,
    },
  ]

  // 合否：pending(null) は未確定として「不合格扱いにはしない」が passed=false にする
  const passed = items.every(function (it) { return it.achieved === true })
  const hasPending = items.some(function (it) { return it.achieved === null })

  return { items: items, passed: passed, hasPending: hasPending, autoTreatmentUsed: !!autoTreatmentUsed }
}
