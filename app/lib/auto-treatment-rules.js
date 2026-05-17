// app/lib/auto-treatment-rules.js
//
// 「担当医に任せる」機能のための治療判定ロジック。
// 患者状態(labs, vitals, past_history)から推奨治療を決定する。
//
// 出力:
//   {
//     medications: [{ category: 'メトホルミン', match: 'メトホルミン' }, ...],
//     devices: [{ category: 'SMBG' }, ...],
//     consultations: [{ specialty: '眼科', reason: '...' }, ...],
//     lifestyleCategories: ['diet', 'exercise', ...],  // 該当する生活指導カテゴリ
//     rationale: '判定根拠の説明テキスト',
//   }
//
// medications.category, medications.match は API 側で DB の薬剤と照合する手がかり

// ──────────────────────────────────────────────
// ヘルパー
// ──────────────────────────────────────────────
function getLab(p, key) {
  const v = p && p.labs && p.labs[key]
  return v == null ? null : Number(v)
}

function hasKeyword(text, keys) {
  if (!text) return false
  const s = String(text)
  for (const k of keys) {
    if (s.indexOf(k) >= 0) return true
  }
  return false
}

function parseSystolicBP(p) {
  const bp = p && p.vitals && p.vitals.bp
  if (!bp) return 0
  const m = String(bp).match(/(\d{2,3})\s*\/\s*\d{2,3}/)
  return m ? parseInt(m[1], 10) : 0
}

function parseDiastolicBP(p) {
  const bp = p && p.vitals && p.vitals.bp
  if (!bp) return 0
  const m = String(bp).match(/\d{2,3}\s*\/\s*(\d{2,3})/)
  return m ? parseInt(m[1], 10) : 0
}

function getBMI(p) {
  const v = p && p.vitals && p.vitals.bmi
  return v == null ? null : Number(v)
}

function getAge(p) {
  return Number(p && p.age) || 0
}

function isSmoker(p) {
  return hasKeyword(p && p.social_history, ['喫煙', 'タバコ', '紙巻', 'スモーカー'])
}

function isHeavyDrinker(p) {
  return hasKeyword(p && p.social_history, ['過剰飲酒', '多量飲酒', '毎日飲酒', '毎晩飲酒'])
}

// 蛋白尿1+以上 OR 微量アルブミン尿陽性(urine_alb≥30)
function hasProteinuriaOrAlbuminuria(p) {
  const labs = p && p.labs
  if (!labs) return false
  const alb = labs.urine_alb != null ? Number(labs.urine_alb) : null
  if (alb != null && alb >= 30) return true
  const protein = labs.urine_protein
  if (protein != null) {
    const s = String(protein)
    if (s.indexOf('+') >= 0 || s.indexOf('陽性') >= 0) return true
    const n = parseFloat(s)
    if (!isNaN(n) && n >= 1) return true
  }
  return false
}

function hasCardiovascularDisease(p) {
  return hasKeyword(p && p.past_history, [
    '心不全', '冠動脈', '心筋梗塞', '狭心症', 'PCI', 'CABG',
    '脳梗塞', '脳卒中', '心房細動', '末梢動脈疾患', 'PAD',
  ])
}

// ──────────────────────────────────────────────
// 2型糖尿病
// ──────────────────────────────────────────────
function decideDM(patient) {
  const hba1c = getLab(patient, 'hba1c') || 0
  const bmi = getBMI(patient) || 0
  const age = getAge(patient)
  const hasCVD = hasCardiovascularDisease(patient)
  const hasNephropathy = hasProteinuriaOrAlbuminuria(patient)

  let meds = []
  let rationale = ''

  if (hba1c >= 10.0) {
    // 1. インスリン適応
    meds = [
      { category: 'インスリン', match: 'インスリン', rationale: 'HbA1c≥10%の高血糖' },
      { category: 'ビグアナイド', match: 'メトホルミン', rationale: '併用' },
    ]
    rationale = 'HbA1c ' + hba1c + '% (≥10%)の著明な高血糖のため、BOT(基礎インスリン)とメトホルミンの併用を選択。'
  } else if (hasCVD) {
    // 2. 心血管病既往
    meds = [
      { category: 'SGLT-2阻害薬', match: 'SGLT', rationale: '心血管病既往(心保護)' },
      { category: 'ビグアナイド', match: 'メトホルミン', rationale: '併用' },
    ]
    rationale = '心血管病既往あり。心保護効果のため SGLT-2阻害薬を第一選択とし、メトホルミンと併用。'
  } else if (hasNephropathy) {
    // 3. 腎症あり
    meds = [
      { category: 'SGLT-2阻害薬', match: 'SGLT', rationale: '微量アルブミン尿/蛋白尿陽性(腎保護)' },
      { category: 'ビグアナイド', match: 'メトホルミン', rationale: '併用' },
    ]
    rationale = '微量アルブミン尿または蛋白尿1+以上を認める。腎保護効果のため SGLT-2阻害薬を第一選択とし、メトホルミンと併用。'
  } else if (bmi >= 27 && hba1c >= 8.0) {
    // 4. 肥満+コントロール不良
    meds = [
      { category: 'GLP-1受容体作動薬', match: 'GLP', rationale: '肥満+HbA1c≥8%' },
      { category: 'ビグアナイド', match: 'メトホルミン', rationale: '併用' },
    ]
    rationale = 'BMI ' + bmi + ' (≥27)の肥満で HbA1c ' + hba1c + '% (≥8%)。体重減少効果のある GLP-1受容体作動薬とメトホルミンの併用を選択。'
  } else if (age >= 75) {
    // 5. 高齢で低血糖リスク重視
    meds = [
      { category: 'DPP-4阻害薬', match: 'DPP', rationale: '高齢(低血糖リスク回避)' },
    ]
    rationale = '75歳以上の高齢者。低血糖リスクの低い DPP-4阻害薬を単剤で開始。'
  } else {
    // 6. 標準症例
    meds = [
      { category: 'ビグアナイド', match: 'メトホルミン', rationale: '第一選択(ガイドライン2024)' },
    ]
    rationale = '標準的な2型糖尿病。糖尿病治療ガイド2024に基づき、メトホルミン単剤で開始。'
  }

  // 機器
  const devices = []
  if (meds.some(function (m) { return m.match === 'インスリン' })) {
    devices.push({ category: 'SMBG', match: 'SMBG' })
    devices.push({ category: '注射針', match: '注射針' })
  }

  // コンサルト
  const consultations = [
    { specialty: '眼科', reason: '糖尿病網膜症スクリーニング(年1回推奨)' },
    { specialty: '皮膚科', reason: '糖尿病性足病変予防のフットケア評価' },
  ]
  const egfr = getLab(patient, 'egfr')
  if ((egfr != null && egfr < 45) || (getLab(patient, 'urine_alb') || 0) > 300) {
    consultations.push({ specialty: '腎臓', reason: '進行糖尿病腎症の併診依頼' })
  }

  // 生活指導カテゴリ
  const lifestyleCategories = ['diet', 'exercise', 'medication', 'monitoring']
  if (bmi >= 25) lifestyleCategories.push('lifestyle')
  if (isSmoker(patient)) lifestyleCategories.push('smoking')
  if (isHeavyDrinker(patient)) lifestyleCategories.push('drinking')

  return { medications: meds, devices: devices, consultations: consultations, lifestyleCategories: lifestyleCategories, rationale: rationale }
}

// ──────────────────────────────────────────────
// 高血圧症
// ──────────────────────────────────────────────
function decideHT(patient) {
  const sbp = parseSystolicBP(patient)
  const dbp = parseDiastolicBP(patient)
  const age = getAge(patient)
  const egfr = getLab(patient, 'egfr')
  const hasCardiac = hasKeyword(patient && patient.past_history, ['心不全', '冠動脈', '心筋梗塞', '不整脈', '心房細動'])
  const hasNephropathy = (egfr != null && egfr < 60) || hasProteinuriaOrAlbuminuria(patient)

  let meds = []
  let rationale = ''

  if (sbp >= 180 || dbp >= 110) {
    // 1. 重症
    meds = [
      { category: 'ARB', match: 'ARB', rationale: '重症高血圧' },
      { category: 'Ca拮抗薬', match: 'Ca拮抗', rationale: '併用' },
      { category: 'サイアザイド', match: 'サイアザイド', rationale: '併用' },
    ]
    rationale = 'SBP ' + sbp + '/DBP ' + dbp + ' mmHg の重症高血圧。ARB+Ca拮抗薬+サイアザイドの3剤併用で開始。'
  } else if (sbp >= 160 || dbp >= 100) {
    // 2. 中等症
    meds = [
      { category: 'ARB', match: 'ARB', rationale: '中等症' },
      { category: 'Ca拮抗薬', match: 'Ca拮抗', rationale: '併用' },
    ]
    rationale = 'SBP ' + sbp + '/DBP ' + dbp + ' mmHg の中等症高血圧。ARB+Ca拮抗薬の2剤併用で開始。'
  } else if (hasCardiac) {
    // 3. 心病変併存
    meds = [
      { category: 'ARB', match: 'ARB', rationale: '心病変併存(RAS阻害)' },
    ]
    rationale = '心病変既往あり。RAS阻害による心保護目的に ARB を第一選択。'
  } else if (hasNephropathy) {
    // 4. 腎症
    meds = [
      { category: 'ARB', match: 'ARB', rationale: '腎症(腎保護)' },
    ]
    rationale = '腎機能低下または微量アルブミン尿/蛋白尿陽性。腎保護目的に ARB を第一選択。'
  } else if (age >= 75) {
    // 5. 高齢
    meds = [
      { category: 'Ca拮抗薬', match: 'Ca拮抗', rationale: '高齢(起立性低血圧回避)' },
    ]
    rationale = '75歳以上の高齢者。低用量Ca拮抗薬で開始し、起立性低血圧を回避。'
  } else {
    // 6. 標準症例
    meds = [
      { category: 'ARB', match: 'ARB', rationale: '第一選択(JSH2019)' },
    ]
    rationale = '標準的な高血圧症(SBP 140-159)。JSH2019 第一選択の ARB 単剤で開始。'
  }

  // 機器(全例)
  const devices = [{ category: '家庭血圧計', match: '家庭血圧' }]

  // コンサルト
  const consultations = []
  if (sbp >= 180) {
    consultations.push({ specialty: '眼科', reason: '重症高血圧の眼底評価' })
  }
  if (hasCardiac) {
    consultations.push({ specialty: '循環器', reason: '心病変併存例の併診' })
  }
  if (egfr != null && egfr < 45) {
    consultations.push({ specialty: '腎臓', reason: '腎機能低下(eGFR<45)の併診' })
  }

  // 生活指導
  const bmi = getBMI(patient) || 0
  const lifestyleCategories = ['diet', 'exercise', 'medication', 'monitoring']
  if (bmi >= 25) lifestyleCategories.push('lifestyle')
  if (isSmoker(patient)) lifestyleCategories.push('smoking')
  if (isHeavyDrinker(patient)) lifestyleCategories.push('drinking')

  return { medications: meds, devices: devices, consultations: consultations, lifestyleCategories: lifestyleCategories, rationale: rationale }
}

// ──────────────────────────────────────────────
// 脂質異常症
// ──────────────────────────────────────────────
function decideHL(patient) {
  const ldl = getLab(patient, 'ldl') || 0
  const tg = getLab(patient, 'tg') || 0
  const hba1c = getLab(patient, 'hba1c') || 0
  const age = getAge(patient)
  const past = patient && patient.past_history || ''
  const family = patient && patient.family_history || ''

  const hasCVDHistory = hasKeyword(past, ['冠動脈', '心筋梗塞', 'PCI', 'CABG', '狭心症', '脳梗塞', '脳卒中', 'PAD'])
  const fhSuspicion = (ldl >= 250) || (ldl >= 190 && hasKeyword(family, ['若年', '冠動脈', '心筋梗塞']))
  const hasDM = hba1c >= 6.5 || hasKeyword(past, ['糖尿病', 'DM'])

  let meds = []
  let rationale = ''

  if (hasCVDHistory) {
    // 1. 二次予防
    meds = [
      { category: '高強度スタチン', match: 'アトルバスタチン', rationale: '二次予防(高強度スタチン)' },
    ]
    rationale = '冠動脈疾患/脳血管疾患の既往あり(二次予防)。高強度スタチン(アトルバスタチン20mg or ロスバスタチン10mg)を選択。'
  } else if (fhSuspicion) {
    // 2. FH 疑い
    meds = [
      { category: '高強度スタチン', match: 'アトルバスタチン', rationale: 'FH疑い' },
      { category: 'エゼチミブ', match: 'エゼチミブ', rationale: '併用' },
    ]
    rationale = 'LDL ' + ldl + ' mg/dL で家族性高コレステロール血症を疑う(LDL≥250 or LDL≥190+家族歴)。高強度スタチン+エゼチミブを選択。'
  } else if (tg >= 500) {
    // 3. 高TG血症(膵炎リスク)
    meds = [
      { category: 'フィブラート', match: 'フィブラート', rationale: '高TG血症(膵炎リスク)' },
    ]
    rationale = 'TG ' + tg + ' mg/dL (≥500)の高TG血症。膵炎リスクのためフィブラートを優先。'
  } else if (hasDM) {
    // 4. 糖尿病合併
    meds = [
      { category: '中等度スタチン', match: 'プラバスタチン', rationale: '糖尿病合併' },
    ]
    rationale = '糖尿病合併症例。中等度スタチン(プラバスタチン10mg or アトルバスタチン10mg)を選択。'
  } else if (age >= 75) {
    // 5. 高齢
    meds = [
      { category: '低用量スタチン', match: 'プラバスタチン', rationale: '高齢(低用量から)' },
    ]
    rationale = '75歳以上の高齢者。低用量スタチン(プラバスタチン5-10mg)で開始。'
  } else {
    // 6. 標準症例(一次予防)
    meds = [
      { category: 'スタチン', match: 'スタチン', rationale: '一次予防(動脈硬化性疾患予防ガイドライン2022)' },
    ]
    rationale = '一次予防 LDL ' + ldl + ' mg/dL。動脈硬化性疾患予防ガイドライン2022 に基づきスタチン単剤で開始。'
  }

  const devices = []
  const consultations = []
  if (hasCVDHistory) {
    consultations.push({ specialty: '循環器', reason: '冠動脈疾患既往の二次予防併診' })
  }
  if (fhSuspicion) {
    consultations.push({ specialty: '脂質代謝専門医', reason: '家族性高コレステロール血症疑いの精査' })
  }

  // 生活指導
  const bmi = getBMI(patient) || 0
  const lifestyleCategories = ['diet', 'exercise', 'medication', 'monitoring']
  if (bmi >= 25) lifestyleCategories.push('lifestyle')
  if (isSmoker(patient)) lifestyleCategories.push('smoking')
  if (isHeavyDrinker(patient)) lifestyleCategories.push('drinking')

  return { medications: meds, devices: devices, consultations: consultations, lifestyleCategories: lifestyleCategories, rationale: rationale }
}

// ──────────────────────────────────────────────
// メイン エントリポイント
// ──────────────────────────────────────────────
export function decideAutoTreatment(diseaseName, patient) {
  if (!patient) return null
  if (diseaseName === '2型糖尿病') return decideDM(patient)
  if (diseaseName === '高血圧症') return decideHT(patient)
  if (diseaseName === '脂質異常症') return decideHL(patient)
  return null
}

// 医師(資格あり)の身分一覧
export const PHYSICIAN_POSITIONS = ['1年目研修医', '2年目研修医', '専攻医', '指導医']

// 医師以外の身分一覧(明示的)
export const NON_PHYSICIAN_POSITIONS = ['医学生', '医療従事者', 'その他', '学習者']

// 非医師(=学習モード対象)の判定。プロファイル未登録のデモユーザーも非医師扱い。
export function isNonPhysicianRole(position) {
  // 明示的に医師身分ならfalse、それ以外(null/undefined/空文字/その他リスト含む)はtrue
  if (!position) return true
  if (PHYSICIAN_POSITIONS.indexOf(position) >= 0) return false
  return true
}

// 表示用の身分ラベル。position が null/不明なら '学習者' を返す。
export function getDisplayPosition(position) {
  if (!position) return '学習者'
  return position
}
