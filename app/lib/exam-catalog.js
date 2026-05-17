// app/lib/exam-catalog.js
//
// 診察・検査メニューの定義(共通 + 疾患固有)。
// ExamOrderModal がこの定義を読んで UI を描画する。
//
// 使い方:
//   import { getCatalogForDisease, getBaselinePanel } from '../../lib/exam-catalog'
//   const catalog = getCatalogForDisease('2型糖尿病')
//   // → { physical: [...], lab: [...], imaging: [...], physiology: [...] }

// ──────────────────────────────────────────────
// 1. 共通項目(3疾患すべてで表示)
// ──────────────────────────────────────────────
export const COMMON_ITEMS = {
  physical: [
    { id: 'general', label: '全身観察' },
    { id: 'head_neck', label: '頭頸部' },
    { id: 'chest_auscultation', label: '胸部聴診' },
    { id: 'lung_auscultation', label: '肺聴診' },
    { id: 'abdomen_palpation', label: '腹部触診' },
    { id: 'leg_edema', label: '下肢浮腫' },
    { id: 'peripheral_pulse', label: '末梢動脈拍動' },
    { id: 'neuro_general', label: '神経学的所見' },
  ],
  lab: [
    // 内分泌
    { id: 'TSH', label: 'TSH', subcategory: '内分泌', unit: 'μIU/mL' },
    { id: 'FT3', label: 'FT3', subcategory: '内分泌', unit: 'pg/mL' },
    { id: 'FT4', label: 'FT4', subcategory: '内分泌', unit: 'ng/dL' },
    { id: 'cortisol', label: 'コルチゾール', subcategory: '内分泌', unit: 'μg/dL' },
    { id: 'ACTH', label: 'ACTH', subcategory: '内分泌', unit: 'pg/mL' },
    // 心血管
    { id: 'BNP', label: 'BNP', subcategory: '心血管', unit: 'pg/mL' },
    { id: 'NT-proBNP', label: 'NT-proBNP', subcategory: '心血管', unit: 'pg/mL' },
    { id: 'troponin', label: 'トロポニン', subcategory: '心血管', unit: 'ng/mL' },
    { id: 'D-dimer', label: 'Dダイマー', subcategory: '心血管', unit: 'μg/mL' },
    // 電解質・炎症・血算ほか
    { id: 'Ca', label: 'Ca', subcategory: '電解質・炎症・血算ほか', unit: 'mg/dL' },
    { id: 'P', label: 'P(リン)', subcategory: '電解質・炎症・血算ほか', unit: 'mg/dL' },
    { id: 'Mg', label: 'Mg', subcategory: '電解質・炎症・血算ほか', unit: 'mg/dL' },
    { id: 'CRP', label: 'CRP', subcategory: '電解質・炎症・血算ほか', unit: 'mg/dL' },
    { id: 'CBC', label: '血算(WBC/RBC/PLT)', subcategory: '電解質・炎症・血算ほか', unit: '' },
    { id: 'PT-INR', label: 'PT-INR / APTT', subcategory: '電解質・炎症・血算ほか', unit: '' },
    { id: 'ferritin', label: 'フェリチン', subcategory: '電解質・炎症・血算ほか', unit: 'ng/mL' },
    { id: 'B12_folate', label: 'ビタミンB12 / 葉酸', subcategory: '電解質・炎症・血算ほか', unit: '' },
  ],
  imaging: [
    { id: 'chest_xray', label: '胸部X線' },
    { id: 'echo_heart', label: '心エコー' },
    { id: 'echo_abdomen', label: '腹部エコー' },
  ],
  physiology: [
    { id: 'ECG', label: '心電図' },
  ],
}

// ──────────────────────────────────────────────
// 2. 疾患固有項目
// ──────────────────────────────────────────────
export const DISEASE_ITEMS = {
  '2型糖尿病': {
    physical: [
      { id: 'achilles_reflex', label: 'アキレス腱反射' },
      { id: 'vibration_sense', label: '振動覚' },
      { id: 'foot_care', label: 'フットケア' },
    ],
    lab: [
      { id: '1_5_AG', label: '1,5-AG', subcategory: '代謝・糖代謝', unit: 'μg/mL' },
      { id: 'glycoalbumin', label: 'グリコアルブミン', subcategory: '代謝・糖代謝', unit: '%' },
      { id: 'C_peptide', label: 'Cペプチド', subcategory: '代謝・糖代謝', unit: 'ng/mL' },
      { id: 'insulin_secretion', label: 'インスリン分泌能', subcategory: '代謝・糖代謝', unit: '' },
      { id: 'anti_GAD', label: '抗GAD抗体', subcategory: '代謝・糖代謝', unit: 'U/mL' },
      { id: 'urine_ketone', label: '尿ケトン', subcategory: '代謝・糖代謝', unit: '' },
    ],
    imaging: [
      { id: 'carotid_us_IMT', label: '頸動脈エコー(IMT)' },
      { id: 'CCS', label: '冠動脈カルシウムスコア' },
      { id: 'CCTA', label: '冠動脈造影CT' },
    ],
    physiology: [
      { id: 'ABI_CAVI', label: 'ABI / CAVI' },
      { id: 'PWV', label: 'PWV' },
    ],
  },
  '高血圧症': {
    physical: [],
    lab: [
      { id: 'aldosterone', label: 'アルドステロン', subcategory: '二次性HT精査', unit: 'pg/mL' },
      { id: 'renin_activity', label: 'レニン活性', subcategory: '二次性HT精査', unit: 'ng/mL/hr' },
      { id: 'catecholamine', label: 'カテコラミン', subcategory: '二次性HT精査', unit: '' },
      { id: 'metanephrine', label: 'メタネフリン', subcategory: '二次性HT精査', unit: 'mg/day' },
      { id: 'normetanephrine', label: 'ノルメタネフリン', subcategory: '二次性HT精査', unit: 'mg/day' },
    ],
    imaging: [
      { id: 'carotid_us_IMT', label: '頸動脈エコー(IMT)' },
      { id: 'renal_artery_us', label: '腎動脈エコー' },
      { id: 'adrenal_CT', label: '副腎CT' },
    ],
    physiology: [
      { id: 'ABI_CAVI', label: 'ABI / CAVI' },
      { id: 'PWV', label: 'PWV' },
      { id: 'ABPM_24h', label: '24時間血圧計' },
      { id: 'overnight_SpO2', label: '終夜SpO2テスト' },
    ],
  },
  '脂質異常症': {
    physical: [
      { id: 'achilles_xanthoma', label: 'アキレス腱黄色腫' },
      { id: 'eyelid_xanthoma', label: '眼瞼黄色腫' },
      { id: 'corneal_arcus', label: '角膜輪' },
    ],
    lab: [
      { id: 'ApoB', label: 'ApoB', subcategory: '脂質精査', unit: 'mg/dL' },
      { id: 'ApoA1', label: 'ApoA1', subcategory: '脂質精査', unit: 'mg/dL' },
      { id: 'Lp_a', label: 'Lp(a)', subcategory: '脂質精査', unit: 'mg/dL' },
      { id: 'sdLDL', label: 'small dense LDL', subcategory: '脂質精査', unit: 'mg/dL' },
      { id: 'RLP_C', label: 'レムナント(RLP-C)', subcategory: '脂質精査', unit: 'mg/dL' },
      { id: 'hsCRP', label: 'hsCRP', subcategory: '脂質精査', unit: 'mg/L' },
    ],
    imaging: [
      { id: 'carotid_us_IMT', label: '頸動脈エコー(IMT)' },
      { id: 'CCS', label: '冠動脈カルシウムスコア' },
      { id: 'CCTA', label: '冠動脈造影CT' },
    ],
    physiology: [
      { id: 'ABI_CAVI', label: 'ABI / CAVI' },
      { id: 'PWV', label: 'PWV' },
    ],
  },
}

// ──────────────────────────────────────────────
// 3. ベースライン採血パネル(疾患別)
// ──────────────────────────────────────────────
export const BASELINE_PANELS = {
  '2型糖尿病': {
    label: 'ベースライン採血セット',
    description: 'HbA1c, 血糖, LDL, HDL, TG, Cr, eGFR, UA, AST, ALT, 尿Alb 等',
  },
  '高血圧症': {
    label: 'ベースライン採血セット',
    description: 'Na, K, Cr, BUN, eGFR, UA, LDL, HDL, TG, HbA1c, 血糖, AST, ALT, 尿一般 等',
  },
  '脂質異常症': {
    label: 'ベースライン採血セット',
    description: 'LDL, HDL, TG, TC, non-HDL-C, AST, ALT, CK, HbA1c, 血糖, Cr, eGFR 等',
  },
}

// ──────────────────────────────────────────────
// 4. 疾患別カラーテーマ
// ──────────────────────────────────────────────
export const DISEASE_THEMES = {
  '2型糖尿病': {
    primary: '#16a34a',
    primaryDark: '#15803d',
    accentBg: '#fef3c7',
    accentText: '#92400e',
    accentBorder: '#f59e0b',
    baselineBg: '#ecfdf5',
    baselineText: '#064e3b',
    badgeLabel: 'DM',
  },
  '高血圧症': {
    primary: '#2563eb',
    primaryDark: '#1d4ed8',
    accentBg: '#dbeafe',
    accentText: '#1e3a8a',
    accentBorder: '#3b82f6',
    baselineBg: '#eff6ff',
    baselineText: '#1e3a8a',
    badgeLabel: 'HT',
  },
  '脂質異常症': {
    primary: '#be185d',
    primaryDark: '#9d174d',
    accentBg: '#fce7f3',
    accentText: '#831843',
    accentBorder: '#ec4899',
    baselineBg: '#fdf2f8',
    baselineText: '#831843',
    badgeLabel: 'HL',
  },
}

// ──────────────────────────────────────────────
// 5. カタログ取得(共通 + 疾患固有のマージ)
// ──────────────────────────────────────────────
export function getCatalogForDisease(diseaseName) {
  const ds = DISEASE_ITEMS[diseaseName] || { physical: [], lab: [], imaging: [], physiology: [] }
  return {
    physical: { common: COMMON_ITEMS.physical, specific: ds.physical },
    lab: { common: COMMON_ITEMS.lab, specific: ds.lab },
    imaging: { common: COMMON_ITEMS.imaging, specific: ds.imaging },
    physiology: { common: COMMON_ITEMS.physiology, specific: ds.physiology },
  }
}

export function getBaselinePanel(diseaseName) {
  return BASELINE_PANELS[diseaseName] || { label: 'ベースライン採血セット', description: '基本的な血液・尿検査' }
}

export function getTheme(diseaseName) {
  return DISEASE_THEMES[diseaseName] || DISEASE_THEMES['2型糖尿病']
}

// ──────────────────────────────────────────────
// 6. 全項目のフラット辞書(API側で id → label/unit を引くため)
// ──────────────────────────────────────────────
export function getAllItemsFlat(diseaseName) {
  const cat = getCatalogForDisease(diseaseName)
  const result = {}
  function add(arr, type, subcategory) {
    for (const it of arr) {
      result[it.id] = {
        id: it.id,
        label: it.label,
        type: type,
        unit: it.unit || '',
        subcategory: subcategory || it.subcategory || '',
      }
    }
  }
  add(cat.physical.common, 'physical')
  add(cat.physical.specific, 'physical')
  add(cat.lab.common, 'lab')
  add(cat.lab.specific, 'lab')
  add(cat.imaging.common, 'imaging')
  add(cat.imaging.specific, 'imaging')
  add(cat.physiology.common, 'physiology')
  add(cat.physiology.specific, 'physiology')
  return result
}
