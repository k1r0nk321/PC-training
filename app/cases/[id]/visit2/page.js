'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../../lib/supabase'
import ExamOrderModal from '../../../components/ExamOrderModal'
import { NON_PHYSICIAN_POSITIONS, isNonPhysicianRole } from '../../../lib/auto-treatment-rules'

const EMOTION_ICON = { relieved: '😌', anxious: '😟', resistant: '😤', neutral: '😐', angry: '😠', convinced: '🙂' }
const ACCEPTANCE_COLOR = { accepted: '#16a34a', partial: '#d97706', rejected: '#dc2626', negotiating: '#0369a1' }
const ACCEPTANCE_LABEL = { accepted: '同意', partial: '一部同意', rejected: '拒否', negotiating: '交渉中' }
const CATEGORY_LABEL = {
  diet: '食事指導', exercise: '運動指導', medication: '服薬指導',
  monitoring: 'モニタリング', lifestyle: '生活習慣',
  psychosocial: '心理・社会的支援', emergency: '緊急時対応', prevention: '予防',
  smoking: '禁煙指導', drinking: '飲酒指導'
}
const STRICTNESS_COLOR = { very_strict: '#dc2626', strict: '#d97706', moderate: '#0369a1', mild: '#16a34a', very_mild: '#10b981', none: '#94a3b8' }
const STRICTNESS_LABEL = { very_strict: '非常に厳格', strict: '厳格', moderate: '標準', mild: '緩やか', very_mild: '最小限', none: 'なし' }

function calcRecommendedCalories(patient) {
  if (!patient) return null
  const h = parseFloat(patient.vitals?.height) / 100
  const age = patient.age
  if (!h || !age) return null
  const idealWeight = Math.round(h * h * 22 * 10) / 10
  const actCoef = age >= 75 ? 27.5 : age >= 65 ? 30 : 32.5
  const recCalRaw = idealWeight * actCoef
  const recCal = Math.round(recCalRaw / 200) * 200
  const currentBmi = parseFloat(patient.vitals?.bmi || 22)
  const lenientCal = currentBmi >= 25 ? Math.round((recCalRaw + 300) / 200) * 200 : null
  return { idealWeight, actCoef, recCal, lenientCal, currentBmi }
}

function groupSubOptions(subOptions) {
  const categoryLabels = {
    calorie: 'カロリー制限の目標', salt: '塩分制限の目標', eating_out: '外食の制限',
    night_eating: '夜食・間食の制限', alcohol: '飲酒制限の目標', aerobic: '有酸素運動',
    resistance: '筋力トレーニング', flexibility: 'ストレッチ・柔軟', lifestyle: '生活習慣',
    education: '服薬指導の説明', strategy: '服薬の工夫・戦略', tool: '服薬サポートツール',
    social: '周囲のサポート', monitoring: 'モニタリング方法', mental: '心理的ケア',
    referral: '専門機関紹介', weight_goal: '体重目標',
    emergency_education: '緊急時の説明', emergency_tool: '緊急時ツール', emergency_social: '家族への説明',
    none: 'その他',
  }
  const categoryOrder = [
    'calorie','salt','eating_out','night_eating','alcohol',
    'aerobic','resistance','flexibility','lifestyle',
    'education','strategy','tool','social','monitoring',
    'mental','referral','weight_goal',
    'emergency_education','emergency_tool','emergency_social','none'
  ]
  const groups = {}
  if (!subOptions) return groups
  subOptions.forEach(function(sub) {
    const cat = sub.category || 'none'
    if (!groups[cat]) groups[cat] = { label: categoryLabels[cat] || cat, items: [], order: categoryOrder.indexOf(cat) >= 0 ? categoryOrder.indexOf(cat) : 99 }
    groups[cat].items.push(sub)
  })
  const sorted = {}
  Object.keys(groups).sort(function(a, b) { return groups[a].order - groups[b].order }).forEach(function(k) { sorted[k] = groups[k] })
  return sorted
}

function AccordionSection({ title, badge, badgeColor, defaultOpen, children }) {
  const [open, setOpen] = useState(defaultOpen !== false)
  return (
    <div style={{ backgroundColor: 'white', borderRadius: '10px', border: '1px solid #e2e8f0', marginBottom: '10px', overflow: 'hidden' }}>
      <div onClick={function() { setOpen(!open) }}
        style={{ padding: '11px 14px', backgroundColor: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', borderBottom: open ? '1px solid #e2e8f0' : 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#1e293b' }}>{title}</span>
          {badge && <span style={{ fontSize: '10px', backgroundColor: badgeColor || '#0369a1', color: 'white', borderRadius: '8px', padding: '1px 7px', fontWeight: 'bold' }}>{badge}</span>}
        </div>
        <span style={{ fontSize: '12px', color: '#64748b' }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && <div style={{ padding: '12px 14px' }}>{children}</div>}
    </div>
  )
}

// ===== 検査結果表示用 定数とヘルパー =====
const LAB_LABELS = {
  hba1c: { name: 'HbA1c', unit: '%' },
  glucose: { name: '空腹時血糖', unit: 'mg/dL' },
  ldl: { name: 'LDL-C', unit: 'mg/dL' },
  hdl: { name: 'HDL-C', unit: 'mg/dL' },
  tg: { name: 'TG', unit: 'mg/dL' },
  total_cholesterol: { name: 'TC', unit: 'mg/dL' },
  non_hdl_c: { name: 'Non-HDL-C', unit: 'mg/dL' },
  na: { name: 'Na', unit: 'mEq/L' },
  k: { name: 'K', unit: 'mEq/L' },
  cr: { name: 'Cr', unit: 'mg/dL' },
  bun: { name: 'BUN', unit: 'mg/dL' },
  egfr: { name: 'eGFR', unit: 'mL/min/1.73m²' },
  ua: { name: 'UA', unit: 'mg/dL' },
  ast: { name: 'AST', unit: 'U/L' },
  alt: { name: 'ALT', unit: 'U/L' },
  ck: { name: 'CK', unit: 'U/L' },
  urine_alb: { name: '尿Alb', unit: 'mg/g·Cr' },
  urine_protein: { name: '尿蛋白', unit: '' },
  bnp: { name: 'BNP', unit: 'pg/mL' },
  alb: { name: 'Alb', unit: 'g/dL' },
}
const LAB_ORDER = ['hba1c', 'glucose', 'ldl', 'hdl', 'tg', 'total_cholesterol', 'non_hdl_c', 'na', 'k', 'cr', 'bun', 'egfr', 'ua', 'ast', 'alt', 'ck', 'urine_alb', 'urine_protein', 'bnp', 'alb']

// 疾患別 baseline 表示項目（「検査」入力時に一括表示）
const DISEASE_LAB_MAP = {
  '高血圧症': ['na', 'k', 'cr', 'bun', 'egfr', 'ua', 'ldl', 'hdl', 'tg', 'hba1c', 'glucose'],
  '2型糖尿病': ['hba1c', 'glucose', 'ldl', 'hdl', 'tg', 'cr', 'bun', 'egfr', 'ua', 'urine_alb', 'urine_protein', 'ast', 'alt'],
  '脂質異常症': ['ldl', 'hdl', 'tg', 'total_cholesterol', 'non_hdl_c', 'ast', 'alt', 'ck', 'hba1c', 'glucose', 'cr', 'egfr'],
}
function diseaseLabKeys(disease) {
  return DISEASE_LAB_MAP[disease] || LAB_ORDER
}

// 追加血液検査キーワード辞書（疾患外項目・問診で個別オーダー）
// ※ msg.indexOf による前方一致のため、長い文字列を先に並べる（"BNP" が "P" にマッチするのを防ぐ）
const ADDITIONAL_LAB_KEYWORDS = [
  // 長い日本語名・複合語（優先マッチ）
  'β2ミクログロブリン', 'グリコアルブミン', 'ノルアドレナリン', 'インスリン分泌',
  'カテコラミン', 'マグネシウム', 'カルシウム', 'コルチゾール', 'ヘモグロビン',
  'アルドステロン', 'C-ペプチド', 'Cペプチド', 'ビタミンB12', 'フェリチン',
  'C peptide', 'NT-proBNP', 'NTproBNP', 'troponin', 'D-dimer', 'ferritin',
  'PT-INR', 'β2-MG', 'HbA1c以外', 'トロポニン', 'Dダイマー', 'アンモニア',
  '抗核抗体', '甲状腺', '血小板', '白血球', '赤血球', '葉酸', 'レニン',
  '1,5-AG',
  // 中長英略語（4文字以上）
  'APTT', 'ACTH', 'VB12',
  // 3 文字英略語
  'TSH', 'FT3', 'FT4', 'fT3', 'fT4', 'CPR', 'CRP', 'BNP', 'WBC', 'RBC',
  'PLT', 'ANA', 'PRA', 'NH3', 'IgG', 'IgA', 'IgM',
  // 2 文字（誤マッチが少ないもののみ）
  'Ca', 'Mg', 'PT', 'GA',
  // 1 文字キーは削除（誤マッチが多い）— 日本語名で代替
  'リン',
]
// 画像・生理検査キーワード辞書（長い順に並べる）
const IMAGING_KEYWORDS = [
  // 長い日本語名
  '心臓足首血管指数', '上部消化管', '下部消化管', '上部内視鏡', '下部内視鏡',
  '大腸ファイバー', '大腸内視鏡', '24時間心電図', '心臓超音波', '頸動脈エコー',
  '腹部エコー', '腹部超音波', '心エコー', '呼吸機能', '骨密度', '胃カメラ',
  '胸部レントゲン', '胸部単純', '単純写真', '眼底検査', 'スパイロ', '肺機能',
  '眼底', '胸写',
  // 中長英略語
  '12誘導', 'ホルター', '心電図', 'シンチ', '造影CT', '単純CT',
  // 3 文字
  'CXR', 'ECG', 'CAVI', 'ABI', 'PWV', 'TBI', 'MRI', 'MRA', 'PET', 'X-P', 'X線', 'DEXA',
  // 一般語
  '超音波', 'エコー', 'レントゲン', 'CT',
  // 2 文字（最後）
  'US',
]
// メッセージから検査キーワードを検出（最初の 1 件）
function detectTestKeyword(msg) {
  if (!msg) return null
  for (var i = 0; i < IMAGING_KEYWORDS.length; i++) {
    if (msg.indexOf(IMAGING_KEYWORDS[i]) !== -1) return { type: 'imaging', keyword: IMAGING_KEYWORDS[i] }
  }
  for (var j = 0; j < ADDITIONAL_LAB_KEYWORDS.length; j++) {
    if (msg.indexOf(ADDITIONAL_LAB_KEYWORDS[j]) !== -1) return { type: 'lab', keyword: ADDITIONAL_LAB_KEYWORDS[j] }
  }
  return null
}

function renderLabTag(key, val, prevVal, labelOverride, unitOverride) {
  const def = LAB_LABELS[key] || { name: labelOverride || key, unit: unitOverride || '' }
  let deltaText = ''
  let deltaColor = '#64748b'
  if (prevVal != null && typeof val === 'number' && typeof prevVal === 'number') {
    const delta = Math.round((val - prevVal) * 100) / 100
    if (delta !== 0) {
      const sign = delta > 0 ? '+' : ''
      deltaText = ' (' + sign + delta + ')'
      const higherIsBetter = key === 'hdl' || key === 'egfr'
      const improved = higherIsBetter ? delta > 0 : delta < 0
      deltaColor = improved ? '#16a34a' : '#dc2626'
    }
  }
  return (
    <span key={key} style={{ display: 'inline-block', padding: '4px 10px', backgroundColor: 'white', borderRadius: '999px', fontSize: '11px', border: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>
      <span style={{ color: '#64748b' }}>{def.name}:</span>{' '}
      <span style={{ fontWeight: 'bold', color: '#1e293b' }}>{val}</span>
      {def.unit ? <span style={{ color: '#94a3b8', fontSize: '10px' }}>{' ' + def.unit}</span> : null}
      {deltaText ? <span style={{ color: deltaColor, fontWeight: 'bold', marginLeft: '3px' }}>{deltaText}</span> : null}
    </span>
  )
}
// baseline 検査タグ（疾患別フィルタ）
function renderLabTags(labs, prevLabs, disease) {
  if (!labs || typeof labs !== 'object') return <p style={{ fontSize: '12px', color: '#94a3b8', margin: '4px 0' }}>検査未実施</p>
  const order = diseaseLabKeys(disease)
  const present = order.filter(function(k) { return labs[k] != null && labs[k] !== '' })
  if (present.length === 0) return <p style={{ fontSize: '12px', color: '#94a3b8', margin: '4px 0' }}>検査未実施</p>
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
      {present.map(function(k) { return renderLabTag(k, labs[k], prevLabs ? prevLabs[k] : null) })}
    </div>
  )
}
// 追加血液検査タグ（AI 生成項目）
function renderAdditionalLabTags(additionalLabs, prevAdditional) {
  if (!Array.isArray(additionalLabs) || additionalLabs.length === 0) return null
  const prevMap = {}
  if (Array.isArray(prevAdditional)) {
    prevAdditional.forEach(function(a) { if (a && a.name) prevMap[a.name] = a.value })
  }
  return (
    <div style={{ marginTop: '6px' }}>
      <p style={{ fontSize: '10px', color: '#0369a1', fontWeight: 'bold', margin: '0 0 3px' }}>＋ 追加血液検査</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        {additionalLabs.map(function(a, idx) {
          const prevVal = prevMap[a.name]
          return renderLabTag('add_' + idx, a.value, (typeof prevVal === 'number' ? prevVal : null), a.name, a.unit || '')
        })}
      </div>
    </div>
  )
}
// 画像・生理検査の所見表示（AI 生成テキスト）
function renderImagingFindings(imaging) {
  if (!Array.isArray(imaging) || imaging.length === 0) return null
  return (
    <div style={{ marginTop: '8px' }}>
      <p style={{ fontSize: '10px', color: '#7c3aed', fontWeight: 'bold', margin: '0 0 3px' }}>＋ 画像・生理検査</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {imaging.map(function(im, idx) {
          return (
            <div key={'img' + idx} style={{ backgroundColor: 'white', borderRadius: '6px', padding: '5px 9px', fontSize: '11px', border: '1px solid #e2e8f0' }}>
              <span style={{ fontWeight: 'bold', color: '#7c3aed' }}>{im.name}：</span>
              <span style={{ color: '#334155' }}>{im.finding}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PatientInfoCard({ patient, diseaseName, visit2Vitals, visit2Labs, visit1Data, labsRevealed, v1Revealed, additionalLabs, additionalImaging, v1AdditionalLabs, v1AdditionalImaging, collapsed, onToggle }) {
  const [labsStep, setLabsStep] = useState(v1Revealed ? 1 : (labsRevealed ? 2 : 1))
  const bpChange = visit2Vitals?.bp_change
  const weightChange = visit2Vitals?.weight_change
  const v1Meds = visit1Data?.selectedMedications || []
  const v1Edu = visit1Data?.selectedEducation || []
  // 旧形式 (boolean 配列) と新形式 (object キーは eduId) の両方に対応
  const v1SubsRaw = visit1Data?.selectedSubOptions
  let v1Subs = []
  if (v1SubsRaw && typeof v1SubsRaw === 'object' && !Array.isArray(v1SubsRaw)) {
    // 新形式: { eduId: { subId: true, ... } } を sub_option 情報配列に変換
    Object.entries(v1SubsRaw).forEach(function(entry) {
      const eduId = entry[0]
      const subMap = entry[1] || {}
      const edu = v1Edu.find(function(e) { return e.id === eduId })
      if (!edu || !Array.isArray(edu.sub_options)) return
      Object.entries(subMap).forEach(function(se) {
        if (se[1]) {
          const sub = edu.sub_options.find(function(s) { return s.id === se[0] })
          if (sub) v1Subs.push(sub)
        }
      })
    })
  }
  return (
    <div style={{ backgroundColor: 'white', borderRadius: '10px', border: '1px solid #bae6fd', marginBottom: '12px', overflow: 'hidden' }}>
      <div onClick={onToggle} style={{ padding: '10px 14px', backgroundColor: '#e0f2fe', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '16px' }}>👤</span>
          <div>
            <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#0369a1' }}>{patient.name}</span>
            <span style={{ fontSize: '12px', color: '#0369a1', marginLeft: '6px' }}>{patient.age}歳・{patient.gender}・{diseaseName}</span>
          </div>
        </div>
        <span style={{ fontSize: '12px', color: '#0369a1' }}>{collapsed ? '▼ 詳細' : '▲ 閉じる'}</span>
      </div>
      {!collapsed && (
        <div style={{ padding: '10px 14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
            <div style={{ backgroundColor: '#f0f9ff', borderRadius: '8px', padding: '8px' }}>
              <p style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>本日のバイタル（4週後）</p>
              <p style={{ fontSize: '13px', fontWeight: 'bold', color: visit2Vitals && parseInt(visit2Vitals.bp) < 140 ? '#16a34a' : '#dc2626' }}>
                血圧：{visit2Vitals ? visit2Vitals.bp : patient.vitals.bp}
              </p>
              {bpChange !== undefined && (
                <p style={{ fontSize: '11px', color: bpChange > 0 ? '#16a34a' : '#dc2626' }}>
                  {bpChange > 0 ? '↓' : '→'} {Math.abs(bpChange)}mmHg {bpChange > 0 ? '低下' : '変化なし'}
                </p>
              )}
              <p style={{ fontSize: '12px', color: '#1e293b' }}>脈拍：{patient.vitals.pulse || patient.vitals.hr || '—'}{(patient.vitals.pulse || patient.vitals.hr) && !String(patient.vitals.pulse || patient.vitals.hr).match(/\/分|bpm/) ? '/分' : ''}　身長：{patient.vitals.height || '—'}{patient.vitals.height && !String(patient.vitals.height).match(/cm/) ? ' cm' : ''}</p>
              <p style={{ fontSize: '12px', color: '#1e293b' }}>体重：{visit2Vitals ? visit2Vitals.weight : (patient.vitals.weight || '—')}{(visit2Vitals ? visit2Vitals.weight : patient.vitals.weight) && !String(visit2Vitals ? visit2Vitals.weight : patient.vitals.weight).match(/kg/) ? 'kg' : ''}　BMI：{visit2Vitals ? visit2Vitals.bmi : patient.vitals.bmi}</p>
              {weightChange !== undefined && (
                <p style={{ fontSize: '11px', color: weightChange < 0 ? '#16a34a' : '#64748b' }}>
                  {weightChange < 0 ? '↓' : '→'} {Math.abs(weightChange)}kg {weightChange < 0 ? '減少' : '変化なし'}
                </p>
              )}
            </div>
            <div style={{ backgroundColor: '#f8fafc', borderRadius: '8px', padding: '8px' }}>
              <p style={{ fontSize: '11px', color: '#64748b', marginBottom: '2px' }}>初診時バイタル</p>
              <p style={{ fontSize: '12px', color: '#475569' }}>血圧：{patient.vitals.bp}　脈拍：{patient.vitals.pulse || patient.vitals.hr || '—'}{(patient.vitals.pulse || patient.vitals.hr) && !String(patient.vitals.pulse || patient.vitals.hr).match(/\/分|bpm/) ? '/分' : ''}</p>
              <p style={{ fontSize: '12px', color: '#475569' }}>身長：{patient.vitals.height || '—'}{patient.vitals.height && !String(patient.vitals.height).match(/cm/) ? ' cm' : ''}　体重：{patient.vitals.weight || '—'}{patient.vitals.weight && !String(patient.vitals.weight).match(/kg/) ? 'kg' : ''}　BMI：{patient.vitals.bmi}</p>
              <p style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>主訴：{patient.chief_complaint}</p>
            </div>
          </div>
          {/* Visit 1の治療方針 */}
          <div style={{ backgroundColor: '#fefce8', borderRadius: '8px', padding: '8px', border: '1px solid #fde047' }}>
            <p style={{ fontSize: '11px', fontWeight: 'bold', color: '#713f12', marginBottom: '6px' }}>📋 前回（Visit 1）の治療方針</p>
            {v1Meds.length > 0 && (
              <div style={{ marginBottom: '4px' }}>
                <p style={{ fontSize: '11px', color: '#64748b', margin: '0 0 2px' }}>💊 投薬：</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {v1Meds.map(function(m, i) {
                    return <span key={i} style={{ fontSize: '11px', backgroundColor: '#dbeafe', color: '#1e40af', padding: '1px 6px', borderRadius: '8px' }}>{m.drug_name_generic}</span>
                  })}
                </div>
              </div>
            )}
            {v1Meds.length === 0 && (
              <p style={{ fontSize: '11px', color: '#94a3b8', margin: '0 0 4px' }}>💊 投薬：なし（生活指導のみ）</p>
            )}
            {v1Subs.length > 0 && (
              <div style={{ marginBottom: '4px' }}>
                <p style={{ fontSize: '11px', color: '#64748b', margin: '0 0 2px' }}>📋 生活指導：</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {v1Subs.map(function(s, i) {
                    return <span key={i} style={{ fontSize: '11px', backgroundColor: '#dcfce7', color: '#14532d', padding: '1px 6px', borderRadius: '8px' }}>{s.label}</span>
                  })}
                </div>
              </div>
            )}
            {v1Subs.length === 0 && v1Edu.length > 0 && (
              <div>
                <p style={{ fontSize: '11px', color: '#64748b', margin: '0 0 2px' }}>📋 生活指導：</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {v1Edu.map(function(e, i) {
                    return <span key={i} style={{ fontSize: '11px', backgroundColor: '#dcfce7', color: '#14532d', padding: '1px 6px', borderRadius: '8px' }}>{e.instruction_key}</span>
                  })}
                </div>
              </div>
            )}
            {v1Meds.length === 0 && v1Subs.length === 0 && v1Edu.length === 0 && (
              <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0 }}>前回の治療方針データがありません</p>
            )}
          </div>
          {(v1Revealed || labsRevealed) && (
          <div style={{ marginTop: '10px', backgroundColor: '#f0fdf4', borderRadius: '8px', padding: '10px', border: '1px solid #bbf7d0' }}>
            <p style={{ fontSize: '12px', fontWeight: 'bold', color: '#166534', margin: '0 0 6px' }}>💉 検査結果</p>
            <div style={{ display: 'flex', gap: '0', marginBottom: '8px', borderBottom: '1px solid #d1d5db' }}>
              {v1Revealed && (
                <button onClick={function() { setLabsStep(1) }}
                  style={{ padding: '6px 14px', fontSize: '12px', backgroundColor: 'transparent', color: labsStep === 1 ? '#16a34a' : '#64748b', border: 'none', borderBottom: labsStep === 1 ? '3px solid #16a34a' : '3px solid transparent', marginBottom: '-1px', cursor: 'pointer', fontWeight: labsStep === 1 ? 'bold' : 'normal' }}>
                  Visit 1
                </button>
              )}
              {labsRevealed && (
                <button onClick={function() { setLabsStep(2) }}
                  style={{ padding: '6px 14px', fontSize: '12px', backgroundColor: 'transparent', color: labsStep === 2 ? '#16a34a' : '#64748b', border: 'none', borderBottom: labsStep === 2 ? '3px solid #16a34a' : '3px solid transparent', marginBottom: '-1px', cursor: 'pointer', fontWeight: labsStep === 2 ? 'bold' : 'normal' }}>
                  Visit 2
                </button>
              )}
            </div>
            {labsStep === 1 && v1Revealed && renderLabTags(patient.labs, null, diseaseName)}
            {labsStep === 1 && v1Revealed && renderAdditionalLabTags(v1AdditionalLabs, null)}
            {labsStep === 1 && v1Revealed && renderImagingFindings(v1AdditionalImaging)}
            {labsStep === 2 && labsRevealed && renderLabTags(visit2Labs, patient.labs, diseaseName)}
            {labsStep === 2 && renderAdditionalLabTags(additionalLabs, v1AdditionalLabs)}
            {labsStep === 2 && renderImagingFindings(additionalImaging)}
          </div>
          )}
        </div>
      )}
    </div>
  )
}

function ParameterPanel({ data, caseId, visitNumber }) {
  const prevRef = useRef(null)
  const initialPendingRef = useRef(null)
  const initialDoneRef = useRef(false)
  const [changes, setChanges] = useState({})

  useEffect(function() {
    if (!data) return

    // Handle initial treatment changes (only on first load)
    if (!initialDoneRef.current) {
      initialDoneRef.current = true
      const ptc = data.pending_treatment_changes
      if (ptc && typeof ptc === 'object') {
        initialPendingRef.current = Object.assign({}, ptc)
        const c = {}
        if (ptc.stress) c.stress = { indicator: ptc.stress, type: 'treatment' }
        if (ptc.busyness) c.busyness = { indicator: ptc.busyness, type: 'treatment' }
        if (Object.keys(c).length > 0) {
          setChanges(c)
          const remaining = Object.assign({}, ptc)
          delete remaining.stress
          delete remaining.busyness
          const newPending = Object.keys(remaining).length > 0 ? remaining : null
          if (caseId && visitNumber) {
            fetch('/api/visit-parameters', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ caseId: caseId, visitNumber: visitNumber, updates: { pending_treatment_changes: newPending } })
            }).catch(function() {})
          }
          const t = setTimeout(function() { setChanges({}) }, 5000)
          prevRef.current = data
          return function() { clearTimeout(t) }
        }
      }
      prevRef.current = data
      return
    }

    // In-session changes
    const prev = prevRef.current
    if (prev) {
      const ptc = initialPendingRef.current || {}
      const c = {}
      const eatingChanged = data.eating_habit_label !== prev.eating_habit_label || data.eating_habit_comment !== prev.eating_habit_comment
      const exerciseChanged = data.exercise_habit_label !== prev.exercise_habit_label || data.exercise_habit_comment !== prev.exercise_habit_comment
      if (eatingChanged) c.eating = { indicator: '更新', type: ptc.diet_treatment ? 'treatment' : 'interview' }
      if (exerciseChanged) c.exercise = { indicator: '更新', type: ptc.exercise_treatment ? 'treatment' : 'interview' }
      const fields = ['lifestyle_motivation', 'medication_motivation', 'trust_level']
      for (const f of fields) {
        if (data[f] !== prev[f]) c[f] = { indicator: data[f] > prev[f] ? '↑' : '↓', type: 'interview' }
      }
      if (Object.keys(c).length > 0) {
        setChanges(c)
        let cleared = false
        const remaining = Object.assign({}, ptc)
        if (eatingChanged && remaining.diet_treatment) { delete remaining.diet_treatment; cleared = true }
        if (exerciseChanged && remaining.exercise_treatment) { delete remaining.exercise_treatment; cleared = true }
        if (cleared) {
          initialPendingRef.current = remaining
          const newPending = Object.keys(remaining).length > 0 ? remaining : null
          if (caseId && visitNumber) {
            fetch('/api/visit-parameters', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ caseId: caseId, visitNumber: visitNumber, updates: { pending_treatment_changes: newPending } })
            }).catch(function() {})
          }
        }
        const t = setTimeout(function() { setChanges({}) }, 5000)
        prevRef.current = data
        return function() { clearTimeout(t) }
      }
    }
    prevRef.current = data
  }, [data, caseId, visitNumber])

  if (!data) return null

  const stars = function(n) {
    const v = Math.max(0, Math.min(5, n || 0))
    return '★'.repeat(v) + '☆'.repeat(5 - v)
  }
  const labelStyle = { fontWeight: 600, color: '#0369a1', marginRight: '4px' }
  const baseRow = { fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap', borderRadius: '4px', padding: '3px 6px', transition: 'background-color 0.6s ease' }
  const hi = function(key) {
    if (!changes[key]) return baseRow
    const isT = changes[key].type === 'treatment'
    return Object.assign({}, baseRow, {
      backgroundColor: isT ? '#fecaca' : '#fef08a',
      boxShadow: isT ? '0 0 0 1px #dc2626' : '0 0 0 1px #facc15'
    })
  }
  const ind = function(key) { return changes[key] ? ' ' + changes[key].indicator : '' }
  const arrowStyle = function(key) {
    return { color: changes[key] && changes[key].type === 'treatment' ? '#dc2626' : '#d97706', fontWeight: 'bold' }
  }
  return (
    <div style={{ backgroundColor: 'white', borderRadius: '10px', border: '1px solid #bae6fd', marginBottom: '12px', padding: '10px 14px' }}>
      <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#0369a1', marginBottom: '8px' }}>📊 患者特性</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', rowGap: '4px', columnGap: '12px' }}>
        <div style={baseRow}><span style={labelStyle}>性格:</span>{data.personality || '-'}</div>
        <div style={hi('eating')}><span style={labelStyle}>食生活:</span>{data.eating_habit_label || '-'}{data.eating_habit_comment ? ' (' + data.eating_habit_comment + ')' : ''}<span style={arrowStyle('eating')}>{ind('eating')}</span></div>
        <div style={hi('exercise')}><span style={labelStyle}>運動:</span>{data.exercise_habit_label || '-'}{data.exercise_habit_comment ? ' (' + data.exercise_habit_comment + ')' : ''}<span style={arrowStyle('exercise')}>{ind('exercise')}</span></div>
        <div style={hi('stress')}><span style={labelStyle}>ストレス:</span><span style={{ color: '#dc2626', letterSpacing: '1px' }}>{stars(data.stress)}</span><span style={arrowStyle('stress')}>{ind('stress')}</span></div>
        <div style={hi('busyness')}><span style={labelStyle}>忙しさ:</span><span style={{ color: '#dc2626', letterSpacing: '1px' }}>{stars(data.busyness)}</span><span style={arrowStyle('busyness')}>{ind('busyness')}</span></div>
        <div style={hi('lifestyle_motivation')}><span style={labelStyle}>生活改善意欲:</span><span style={{ color: '#16a34a', letterSpacing: '1px' }}>{stars(data.lifestyle_motivation)}</span><span style={arrowStyle('lifestyle_motivation')}>{ind('lifestyle_motivation')}</span></div>
        <div style={hi('medication_motivation')}><span style={labelStyle}>服薬意欲:</span><span style={{ color: '#16a34a', letterSpacing: '1px' }}>{stars(data.medication_motivation)}</span><span style={arrowStyle('medication_motivation')}>{ind('medication_motivation')}</span></div>
        <div style={hi('trust_level')}><span style={labelStyle}>信頼度:</span><span style={{ color: '#0369a1', letterSpacing: '1px' }}>{stars(data.trust_level)}</span><span style={arrowStyle('trust_level')}>{ind('trust_level')}</span></div>
        {data.smoking_label && (
          <div style={baseRow}><span style={labelStyle}>喫煙:</span>{data.smoking_label}{data.smoking_comment ? ' (' + data.smoking_comment + ')' : ''}</div>
        )}
        {data.drinking_label && (
          <div style={baseRow}><span style={labelStyle}>飲酒:</span>{data.drinking_label}{data.drinking_comment ? ' (' + data.drinking_comment + ')' : ''}</div>
        )}
      </div>
    </div>
  )
}

export default function Visit2Page({ params }) {
  const [caseData, setCaseData] = useState(null)
  const [visitParams, setVisitParams] = useState(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [visit2Data, setVisit2Data] = useState(null)
  const [step, setStep] = useState('interview') // interview | treatment | feedback
  const [patientCardCollapsed, setPatientCardCollapsed] = useState(false)

  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [coachingMode, setCoachingMode] = useState('recommended_only')
  const [currentUserId, setCurrentUserId] = useState(null)

  // 指導医モード設定をユーザー設定から取得
  useEffect(function() {
    supabase.auth.getSession().then(function(s) {
      const uid = s && s.data && s.data.session && s.data.session.user && s.data.session.user.id
      if (uid) {
        setCurrentUserId(uid)
        fetch('/api/user-preferences?userId=' + uid)
          .then(function(r) { return r.json() })
          .then(function(d) {
            if (d && d.preceptor_coaching_mode) setCoachingMode(d.preceptor_coaching_mode)
          })
          .catch(function() {})
      }
    })
  }, [])

  // モード変更ハンドラ
  function updateCoachingMode(newMode) {
    setCoachingMode(newMode)
    if (currentUserId) {
      fetch('/api/user-preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUserId, preceptor_coaching_mode: newMode })
      }).catch(function() {})
    }
  }
  const [labsRevealed, setLabsRevealed] = useState(false)
  const [additionalLabs, setAdditionalLabs] = useState([])
  const [additionalImaging, setAdditionalImaging] = useState([])

  // ===== 自動保存（Q19-C: 節目で saved_state を更新） =====
  async function autoSaveStateV2() {
    if (!caseData || !caseData.id) return
    try {
      const savedState = {
        current_visit: 2,
        visit2: {
          step: step,
          messages: messages,
          selected_meds: selectedMeds,
          selected_education: selectedEducation,
          selected_devices: selectedDevices,
          selected_sub_options: selectedSubOptions,
          consultations: consultations,
          exam_done_ids: examDoneIds,
          auto_treatment_used: autoTreatmentUsed,
          discontinued_existing_meds: discontinuedExistingMeds,
          reaction_log: reactionLog,
          feedback: feedback,
          visit2Data: visit2Data,
          labs_revealed: labsRevealed,
          additional_labs: additionalLabs,
          additional_imaging: additionalImaging
        }
      }
      await fetch('/api/save-record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseId: caseData.id, visitNumber: 2, messages: messages, savedState: savedState })
      })
    } catch (e) {}
  }
  useEffect(function() {
    if (!caseData || !caseData.id) return
    if (step === 'interview' && messages.length <= 1 && !labsRevealed && additionalLabs.length === 0 && additionalImaging.length === 0) return
    const t = setTimeout(function() { autoSaveStateV2() }, 1500)
    return function() { clearTimeout(t) }
  }, [step, labsRevealed, additionalLabs.length, additionalImaging.length])


  const [medications, setMedications] = useState([])
  const [educationItems, setEducationItems] = useState([])
  const [devices, setDevices] = useState([])
  const [selectedMeds, setSelectedMeds] = useState([])
  const [selectedEducation, setSelectedEducation] = useState([])
  const [selectedDevices, setSelectedDevices] = useState([])
  const [selectedSubOptions, setSelectedSubOptions] = useState({})
  const [consultations, setConsultations] = useState([])
  // 診察・検査ボタン用 state
  const [showExamModal, setShowExamModal] = useState(false)
  const [examLoading, setExamLoading] = useState(false)
  const [examDoneIds, setExamDoneIds] = useState([])
  // 担当医に任せる(学習モード)用 state
  const [userPosition, setUserPosition] = useState(null)
  const [userDisplayName, setUserDisplayName] = useState('')
  const [autoTreatmentUsed, setAutoTreatmentUsed] = useState(false)
  const [autoTreatmentLoading, setAutoTreatmentLoading] = useState(false)
  // 後方互換: 旧フォーマット({performed, specialty, reason})を配列に変換するヘルパー
  function consultationsToArray(data) {
    if (!data) return []
    if (Array.isArray(data)) return data.filter(function(c) { return c && c.specialty })
    if (data.performed) return [{ specialty: data.specialty || '', reason: data.reason || '' }]
    return []
  }
  function addConsultation() {
    setConsultations(function(prev) { return prev.concat([{ specialty: '', reason: '' }]) })
  }
  function updateConsultation(idx, key, val) {
    setConsultations(function(prev) {
      return prev.map(function(c, i) {
        if (i !== idx) return c
        const next = {}
        Object.keys(c).forEach(function(k) { next[k] = c[k] })
        next[key] = val
        return next
      })
    })
  }
  function removeConsultation(idx) {
    if (typeof window !== 'undefined' && !window.confirm('このコンサルトを削除しますか？')) return
    setConsultations(function(prev) { return prev.filter(function(_, i) { return i !== idx }) })
  }
  const [discontinuedExistingMeds, setDiscontinuedExistingMeds] = useState([])

  const [reactionLog, setReactionLog] = useState([])
  const [reactionLoading, setReactionLoading] = useState(false)
  const [showKarte, setShowKarte] = useState(false)
  const [karteTab, setKarteTab] = useState(2)
  const [karteExtraData, setKarteExtraData] = useState(null)
  const [persuasionInput, setPersuasionInput] = useState('')
  const [activePersuasionId, setActivePersuasionId] = useState(null)

  const [activeEduModal, setActiveEduModal] = useState(null)
  const [activeSubGroupModal, setActiveSubGroupModal] = useState(null)
  const [activeDeviceModal, setActiveDeviceModal] = useState(null)

  const [feedback, setFeedback] = useState(null)
  const [feedbackLoading, setFeedbackLoading] = useState(false)

  const messagesEndRef = useRef(null)
  const reactionLogEndRef = useRef(null)
  const showDebug = process.env.NEXT_PUBLIC_SHOW_DEBUG === 'true'

  useEffect(function() {
    supabase.auth.getSession().then(function({ data: { session } }) {
      if (!session) { window.location.href = '/'; return }
      // 学習モード判定用に身分を取得
      fetch('/api/user-profile?userId=' + session.user.id)
        .then(function(r) { return r.json() })
        .then(function(d) {
          if (d && d.profile) {
            if (d.profile.position) setUserPosition(d.profile.position)
            // 表示名: display_preference=handle_name かつ handle_name 有 → handle_name、それ以外は real_name の苗字
            const pref = d.profile.display_preference
            const handle = d.profile.handle_name
            const real = d.profile.real_name || ''
            if (pref === 'handle_name' && handle) {
              setUserDisplayName(handle)
            } else if (real) {
              // 半角・全角スペースで分割して最初のトークン(=苗字)を取得
              const surname = real.split(/[\s\u3000]+/)[0] || real
              setUserDisplayName(surname)
            }
          }
        })
        .catch(function() {})
      fetchCase(session.user.id)
    })
  }, [])

  useEffect(function() {
    if (messagesEndRef.current) messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function fetchCase(userId) {
    try {
      const { data, error } = await supabase
        .from('cases').select('*')
        .eq('id', params.id).eq('user_id', userId).single()
      if (error || !data) { window.location.href = '/cases'; return }
      setCaseData(data)

      // ===== Phase 3: 再開ポップアップ =====
      let resumed = false
      let savedV2 = null
      try {
        const sr = await fetch('/api/save-record?caseId=' + data.id)
        if (sr.ok) {
          const sd = await sr.json()
          const savedState = sd && sd.saved_state
          if (savedState && savedState.current_visit) {
            if (savedState.current_visit === 1) {
              // Visit 1 で完了して Visit 2 ページに来た = Visit 1 の saved_state は不要
              // ポップアップを出さずに静かにクリア（無限ループ回避）
              try { await fetch('/api/save-record?caseId=' + data.id, { method: 'DELETE' }) } catch (e) {}
            } else if (savedState.current_visit === 2 && savedState.visit2) {
              const ok = window.confirm('Visit 2 の続きから再開しますか？\n\n（「キャンセル」を押すと新しく開始します）')
              if (ok) {
                savedV2 = savedState.visit2
                resumed = true
              } else {
                try { await fetch('/api/save-record?caseId=' + data.id, { method: 'DELETE' }) } catch (e) {}
              }
            }
          }
        }
      } catch (e) {}
      try {
        const pr = await fetch('/api/visit-parameters?caseId=' + data.id + '&visit=2')
        if (pr.ok) {
          const pd = await pr.json()
          setVisitParams(pd.params)
        }
      } catch (e) {}

      // Visit 2データを生成
      setGenerating(true)
      const res = await fetch('/api/visit2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseId: params.id }),
      })
      const v2 = await res.json()
      if (v2.error) { alert('Visit 2の生成に失敗しました：' + v2.error); return }
      setVisit2Data(v2)

      // Visit 1の治療を初期選択として引き継ぎ
      const v1 = data.visit1_data || {}
      if (Array.isArray(v1.selectedMedications)) setSelectedMeds(v1.selectedMedications.map(function(m) { return m.id }))
      if (Array.isArray(v1.selectedEducation)) setSelectedEducation(v1.selectedEducation.map(function(e) { return e.id }))
      if (Array.isArray(v1.selectedDevices)) setSelectedDevices(v1.selectedDevices.map(function(d) { return d.id }))
      if (v1.selectedSubOptions && typeof v1.selectedSubOptions === 'object') setSelectedSubOptions(v1.selectedSubOptions)
      if (Array.isArray(v1.consultations)) setConsultations(v1.consultations)
      else if (v1.consultation) setConsultations(consultationsToArray(v1.consultation))
      if (Array.isArray(v1.discontinuedExistingMeds)) setDiscontinuedExistingMeds(v1.discontinuedExistingMeds)

      // 患者の最初のコメントをセット
      setMessages([{
        role: 'assistant',
        content: '【4週間後の再診】\n\n' + v2.patientOpeningComment
      }])

      // マスタデータ取得
      const [medsRes, eduRes, devRes] = await Promise.all([
        fetch('/api/medications?diseaseId=' + data.disease_id),
        fetch('/api/education?diseaseId=' + data.disease_id),
        fetch('/api/devices?diseaseId=' + data.disease_id),
      ])
      const medsData = await medsRes.json()
      const eduData = await eduRes.json()
      const devData = await devRes.json()
      if (medsData.medications) setMedications(medsData.medications)
      if (eduData.items) setEducationItems(eduData.items)
      if (devData.devices) setDevices(devData.devices)

      // 再開時の状態復元
      if (resumed && savedV2) {
        if (Array.isArray(savedV2.messages)) setMessages(savedV2.messages)
        if (Array.isArray(savedV2.selected_meds)) setSelectedMeds(savedV2.selected_meds)
        if (Array.isArray(savedV2.selected_education)) setSelectedEducation(savedV2.selected_education)
        if (Array.isArray(savedV2.selected_devices)) setSelectedDevices(savedV2.selected_devices)
        if (savedV2.selected_sub_options) setSelectedSubOptions(savedV2.selected_sub_options)
        if (Array.isArray(savedV2.consultations)) setConsultations(savedV2.consultations)
              else if (savedV2.consultation) setConsultations(consultationsToArray(savedV2.consultation))
              if (Array.isArray(savedV2.exam_done_ids)) setExamDoneIds(savedV2.exam_done_ids)
              if (typeof savedV2.auto_treatment_used === 'boolean') setAutoTreatmentUsed(savedV2.auto_treatment_used)
        if (Array.isArray(savedV2.discontinued_existing_meds)) setDiscontinuedExistingMeds(savedV2.discontinued_existing_meds)
        if (Array.isArray(savedV2.reaction_log)) setReactionLog(savedV2.reaction_log)
        if (savedV2.feedback) setFeedback(savedV2.feedback)
        if (savedV2.visit2Data) setVisit2Data(savedV2.visit2Data)
        if (typeof savedV2.labs_revealed === 'boolean') setLabsRevealed(savedV2.labs_revealed)
        if (Array.isArray(savedV2.additional_labs)) setAdditionalLabs(savedV2.additional_labs)
        if (Array.isArray(savedV2.additional_imaging)) setAdditionalImaging(savedV2.additional_imaging)
        if (savedV2.step) setStep(savedV2.step)
      }

    } catch (e) {
      console.error('fetchCase error:', e)
    } finally {
      setLoading(false)
      setGenerating(false)
    }
  }

  // ===== 担当医に任せる(学習モード): 推奨治療を自動入力 =====
  async function handleAutoTreatment(scope) {
    if (!caseData || !caseData.id || autoTreatmentLoading) return
    const scopeLabel = scope === 'all' ? '投薬・機器・コンサルト' : (scope === 'medications' ? '投薬' : (scope === 'devices' ? '機器・検査' : (scope === 'consultations' ? 'コンサルト' : '治療項目')))
    if (typeof window !== 'undefined' && !window.confirm(scopeLabel + 'を担当医の推奨内容で自動入力します。よろしいですか?')) return
    setAutoTreatmentLoading(true)
    try {
      const res = await fetch('/api/auto-treatment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          diseaseId: caseData.disease_id,
          diseaseName: caseData.disease_name,
          patientData: caseData.patient_data,
        }),
      })
      const data = await res.json()
      if (data.error) { alert('エラー: ' + data.error); setAutoTreatmentLoading(false); return }

      // 投薬
      if ((scope === 'all' || scope === 'medications') && Array.isArray(data.medications)) {
        const ids = data.medications.map(function(m) { return m.id })
        setSelectedMeds(ids)
        // 患者反応は「先生にお任せします」で全承諾
        const newReactions = data.medications.map(function(m) {
          return {
            id: 'med_' + m.id,
            selectionType: 'medication',
            item: { id: m.id, drug_name_generic: m.drug_name_generic, typical_dose: m.typical_dose },
            labelText: '💊 ' + m.drug_name_generic + (m.typical_dose ? '（' + m.typical_dose + '）' : ''),
            reaction: { reaction: '先生にお任せします。', acceptance_level: 'accepted' },
            persuasionHistory: [{ role: 'patient', content: '先生にお任せします。' }],
            timestamp: new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
          }
        })
        setReactionLog(function(prev) {
          const filtered = prev.filter(function(r) { return r.id.indexOf('med_') !== 0 })
          return filtered.concat(newReactions)
        })
      }

      // 機器
      if ((scope === 'all' || scope === 'devices') && Array.isArray(data.devices)) {
        const ids = data.devices.map(function(d) { return d.id })
        setSelectedDevices(ids)
        const newReactions = data.devices.map(function(d) {
          return {
            id: 'dev_' + d.id,
            selectionType: 'device',
            item: { id: d.id, device_name: d.device_name },
            labelText: '🔧 ' + d.device_name,
            reaction: { reaction: '先生にお任せします。', acceptance_level: 'accepted' },
            persuasionHistory: [{ role: 'patient', content: '先生にお任せします。' }],
            timestamp: new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
          }
        })
        setReactionLog(function(prev) {
          const filtered = prev.filter(function(r) { return r.id.indexOf('dev_') !== 0 })
          return filtered.concat(newReactions)
        })
      }

      // コンサルト
      if ((scope === 'all' || scope === 'consultations') && Array.isArray(data.consultations)) {
        setConsultations(data.consultations.map(function(c) { return { specialty: c.specialty, reason: c.reason } }))
      }

      // 学習モードフラグを ON
      setAutoTreatmentUsed(true)

      // 担当医の判断をチャットに表示
      if (data.rationale) {
        setMessages(function(prev) {
          return prev.concat([{ role: 'system', content: '🩺 担当医の判断(学習モード)\n\n' + data.rationale }])
        })
      }
    } catch (e) {
      alert('担当医自動入力でエラーが発生しました: ' + e.message)
    } finally {
      setAutoTreatmentLoading(false)
    }
  }

    // ===== 診察・検査ボタン: モーダル送信処理 =====
  async function handleExamSubmit(payload) {
    if (!caseData || !caseData.id || examLoading) return
    setExamLoading(true)
    try {
      const res = await fetch('/api/exam-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseId: caseData.id,
          visitNumber: 2,
          diseaseName: caseData.disease_name,
          patientData: caseData.patient_data,
          items: payload.items || [],
          freeText: payload.freeText || '',
          alreadyDone: examDoneIds,
        }),
      })
      const data = await res.json()
      if (data.error) {
        alert('検査依頼エラー: ' + data.error)
        setExamLoading(false)
        return
      }
      const results = Array.isArray(data.results) ? data.results : []
      if (results.length === 0) {
        alert('結果が生成されませんでした')
        setExamLoading(false)
        return
      }
      // chat に表示する system メッセージを構築
      const groups = { physical: [], lab: [], imaging: [], physiology: [], baseline: [] }
      for (const r of results) {
        if (!groups[r.type]) groups[r.type] = []
        groups[r.type].push(r)
      }
      const lines = ['🔬 診察・検査の結果\n']
      if (groups.baseline.length > 0) {
        for (const b of groups.baseline) {
          lines.push(b.chatText || ('【' + b.label + '】'))
        }
        lines.push('')
      }
      if (groups.physical.length > 0) {
        lines.push('【身体診察】')
        for (const p of groups.physical) lines.push('▪ ' + p.label + ': ' + (p.finding || ''))
        lines.push('')
      }
      if (groups.lab.length > 0) {
        lines.push('【追加血液検査】')
        for (const l of groups.lab) {
          const v = (l.value != null && l.value !== '') ? l.value : '(値不明)'
          lines.push('▪ ' + l.label + ': ' + v + (l.unit ? ' ' + l.unit : ''))
        }
        lines.push('')
      }
      if (groups.imaging.length > 0) {
        lines.push('【画像検査】')
        for (const i of groups.imaging) lines.push('▪ ' + i.label + ': ' + (i.finding || ''))
        lines.push('')
      }
      if (groups.physiology.length > 0) {
        lines.push('【生理検査】')
        for (const p of groups.physiology) lines.push('▪ ' + p.label + ': ' + (p.finding || ''))
        lines.push('')
      }
      const sysMsg = lines.join('\n').trim()
      setMessages(function(prev) { return prev.concat([{ role: 'system', content: sysMsg }]) })

      // ベースライン採血が含まれていたら labsRevealed を立てる
      if (groups.baseline.length > 0 && !labsRevealed && caseData.patient_data && caseData.patient_data.labs) {
        setLabsRevealed(true)
      }

      // 追加血液検査を additionalLabs に追加
      if (groups.lab.length > 0) {
        const newLabs = groups.lab.map(function(l) { return { name: l.label, value: l.value, unit: l.unit || '' } })
        setAdditionalLabs(function(prev) { return prev.concat(newLabs) })
      }
      // 画像・生理検査・身体所見は additionalImaging に統合
      const newFindings = []
      for (const i of groups.imaging) newFindings.push({ name: i.label, finding: i.finding || '' })
      for (const p of groups.physiology) newFindings.push({ name: p.label, finding: p.finding || '' })
      for (const p of groups.physical) newFindings.push({ name: p.label, finding: p.finding || '' })
      if (newFindings.length > 0) {
        setAdditionalImaging(function(prev) { return prev.concat(newFindings) })
      }

      // 実施済み id を更新
      const newDoneIds = results.map(function(r) { return r.id || r.type }).filter(Boolean)
      setExamDoneIds(function(prev) {
        const set = new Set(prev)
        for (const id of newDoneIds) set.add(id)
        if (groups.baseline.length > 0) set.add('baseline')
        return Array.from(set)
      })

      setShowExamModal(false)
    } catch (e) {
      alert('検査依頼処理でエラーが発生しました: ' + e.message)
    } finally {
      setExamLoading(false)
    }
  }

  async function handleSend() {
    if (!input.trim() || aiLoading) return
    const userMessage = input.trim()
    setInput('')

    setMessages(function(prev) { return [...prev, { role: 'user', content: userMessage }] })
    setAiLoading(true)
    try {
      const patient = caseData.patient_data
      const v2 = visit2Data
      const v1 = caseData.visit1_data || {}
      const v1MedsArr = (v1.selectedMedications || []).map(function(m) { return m.drug_name_generic + '（' + (m.typical_dose || '') + '）' })
      const v1Meds = v1MedsArr.length > 0 ? v1MedsArr.join('、') : 'なし（処方なし）'
      const v1EduArr = (v1.selectedEducation || []).map(function(e) { return e.instruction_key })
      const v1Edu = v1EduArr.length > 0 ? v1EduArr.join('、') : 'なし（生活指導なし）'
      const system = 'あなたは外来診療シミュレーションの患者AIです。4週間前に' + caseData.disease_name + 'で初診し治療を開始した患者として応答してください。' +
        '名前：' + patient.name + '（' + patient.age + '歳・' + patient.gender + '）。性格：' + (patient.hidden_params.personality_type || 'cooperative') + '。' +
        '服薬意欲：' + patient.hidden_params.adherence_level + '。' +
        '現在の血圧：' + (v2?.visit2Vitals?.bp || patient.vitals.bp) + '。' +
        '体重：' + (v2?.visit2Vitals?.weight || patient.vitals.weight) + 'kg。' +
        '【前回(Visit 1)の治療内容 - 厳守すること】処方薬：' + v1Meds + '。生活指導：' + v1Edu + '。' +
        '【絶対遵守】処方されていない薬を服用していると言ってはならない。処方なしなら「お薬はもらっていません」と答える。指導されていない生活指導内容を実行していると言ってはならない。前回の治療内容と矛盾する発言をしてはならない。' +
        '患者として自然な日本語で150文字以内で応答する。検査結果や身体所見の生成はしない(別ボタンから出力される)。もし医師から検査や診察を求められたら、患者として自然に応じる(例:「はい、お願いします」「どうぞ」)のみで、結果や所見は一切返さないこと。' +
        (isNonPhysicianRole(userPosition) && userDisplayName ? '【重要】相手は医師ではなく' + userPosition + 'です。「先生」と呼ばずに「' + userDisplayName + 'さん」と呼びかけてください。医療行為を依頼される文脈であっても、「先生」「医師」という呼称は使わないこと。' : '')
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ system, prompt: userMessage, history: messages.filter(function(m) { if (m.role === 'system' && (m.content.indexOf('📚') === 0 || m.content.indexOf('💡') === 0)) return false; return true }).map(function(m) { return { role: m.role === 'system' ? 'assistant' : m.role, content: m.content } }) }),
      })
      const data = await res.json()
      setMessages(function(prev) { return [...prev, { role: 'assistant', content: data.text }] })
      // ===== 指導医コーチング（モードによって分岐） =====
      if (coachingMode !== 'none') {
        try {
          if (coachingMode === 'detailed' && caseData && caseData.disease_id) {
            // 細かく：毎ターン丁寧コーチング
            const pcRes = await fetch('/api/preceptor-coaching', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                diseaseName: caseData.disease_name,
                recentMessages: [...messages.slice(-4), { role: 'user', content: userMessage }, { role: 'assistant', content: data.text }],
                doctorMessage: userMessage,
                patientResponse: data.text,
                visitNumber: 2
              })
            })
            if (pcRes.ok) {
              const pc = await pcRes.json()
              if (pc && pc.commentary) {
                const tipText = '📚 指導医のコメント:\n' + pc.commentary
                setMessages(function(prev) { return [...prev, { role: 'system', content: tipText }] })
              }
            }
          } else if (coachingMode === 'recommended_only' && caseData && caseData.disease_id) {
            // 推奨治療のみ：患者がアドバイスを求めたときのみ
            const patternList = ['どうしたらいい', 'どうすれば', 'アドバイス', '気をつけ', 'おすすめ', '注意点', '何かいい', '教えて', 'すべきこと', 'どのよう', '何ができ', 'コツ']
            const isAdvice = patternList.some(function(p) { return data.text.indexOf(p) >= 0 })
            if (isAdvice) {
              const tpRes = await fetch('/api/teaching-points', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  diseaseId: caseData.disease_id,
                  diseaseName: caseData.disease_name,
                  patientContext: (caseData.patient_data?.name || '') + '・' + (caseData.patient_data?.age || '') + '歳・' + (caseData.disease_name || ''),
                  lastPatientStatement: data.text
                })
              })
              if (tpRes.ok) {
                const tp = await tpRes.json()
                if (tp && Array.isArray(tp.points) && tp.points.length > 0) {
                  const tipText = '💡 指導ポイント:\n• ' + tp.points.join('\n• ') + (tp.rationale ? '\n（参照: ' + tp.rationale + '）' : '')
                  setMessages(function(prev) { return [...prev, { role: 'system', content: tipText }] })
                }
              }
            }
          }
        } catch (pcErr) {}
      }
      try {
        if (caseData && caseData.id) {
          const labMsgs = messages.filter(function(m) { return m.role === 'system' && m.content.length > 20 })
          const labContent = labMsgs.length > 0 ? labMsgs.map(function(m) { return m.content }).join('\n') : null
          await fetch('/api/save-record', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ caseId: caseData.id, visitNumber: 2, messages: messages, labData: labContent })
          }).catch(function() {})
        }
      } catch (srErr) {}
      try {
        if (visitParams && caseData && caseData.id) {
          const evalRes = await fetch('/api/evaluate-params', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              caseId: caseData.id,
              visitNumber: 2,
              recentMessages: [...messages.slice(-4), { role: 'user', content: userMessage }, { role: 'assistant', content: data.text }],
              currentParams: visitParams,
              context: 'interview',
              personality: visitParams.personality
            })
          })
          if (evalRes.ok) {
            const evalData = await evalRes.json()
            if (evalData.params) setVisitParams(evalData.params)
          }
        }
      } catch (e) {}
    } catch (e) {
      setMessages(function(prev) { return [...prev, { role: 'assistant', content: 'エラーが発生しました。' }] })
    } finally {
      setAiLoading(false)
    }
  }

  async function openKarte() {
    if (caseData && caseData.id) {
      try {
        const savedState = {
          current_visit: 2,
          visit2: {
            step: step,
            messages: messages,
            selected_meds: selectedMeds,
            selected_education: selectedEducation,
            selected_devices: selectedDevices,
            selected_sub_options: selectedSubOptions,
            consultations: consultations,
            exam_done_ids: examDoneIds,
            auto_treatment_used: autoTreatmentUsed,
            discontinued_existing_meds: discontinuedExistingMeds,
            reaction_log: reactionLog,
            feedback: feedback,
            visit2Data: visit2Data,
            labs_revealed: labsRevealed,
            additional_labs: additionalLabs,
            additional_imaging: additionalImaging
          }
        }
        await fetch('/api/save-record', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ caseId: caseData.id, visitNumber: 2, messages: messages, savedState: savedState })
        }).catch(function() {})
        const res = await fetch('/api/save-record?caseId=' + caseData.id)
        if (res.ok) { const d = await res.json(); setKarteExtraData(d) }
      } catch (e) {}
    }
    setShowKarte(true)
  }

  function handleExportPDF() {
    const patient = caseData.patient_data || {}
    const v1 = caseData.visit1_data || {}
    const v1Meds = (v1.selectedMedications || []).map(function(m) { return m.drug_name_generic }).join('、') || 'なし'
    const v1Edu = (v1.selectedEducation || []).map(function(e) { return e.instruction_key }).join('、') || 'なし'
    const params = visitParams || {}
    const stars = function(n) { var v = Math.max(0, Math.min(5, n||0)); return '★'.repeat(v) + '☆'.repeat(5-v) }
    const v2Msgs = messages.filter(function(m) { return m.role !== 'system' })
    const msgHtml = v2Msgs.map(function(m) { return '<div style="margin:3px 0"><b style="color:'+(m.role==='user'?'#0369a1':'#333')+'">'+(m.role==='user'?'医師':'患者')+'：</b>'+m.content+'</div>' }).join('')
    const html = '<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>カルテ</title><style>body{font-family:sans-serif;font-size:13px;padding:20px;max-width:780px;margin:0 auto}h1{font-size:15px;color:#0369a1;border-bottom:2px solid #0369a1;padding-bottom:6px}h2{font-size:12px;background:#e0f2fe;padding:3px 8px;color:#0369a1;margin:10px 0 4px}p{margin:0 0 4px;line-height:1.7}@media print{body{font-size:11px}}</style></head><body>'
      + '<h1>📋 カルテ　' + (patient.name||'') + '（' + (patient.age||'') + '歳・' + (patient.gender||'') + '）</h1>'
      + '<p>疾患：' + (caseData.disease_name||'') + '　保存日時：' + new Date().toLocaleString('ja-JP') + '</p>'
      + '<h2>【患者基本情報】</h2><p>職業：' + (patient.occupation||'') + '</p>'
      + '<h2>【Visit 1 診察所見】</h2><p>血圧：' + (patient.vitals?.bp||'') + '　体重：' + (patient.vitals?.weight||'') + 'kg　BMI：' + (patient.vitals?.bmi||'') + '</p>'
      + '<h2>【Visit 1 治療方針】</h2><p>処方薬：' + v1Meds + '<br>生活指導：' + v1Edu + '</p>'
      + '<h2>【Visit 2 診察所見】</h2><p>血圧：' + (visit2Data?.visit2Vitals?.bp||'') + '　体重：' + (visit2Data?.visit2Vitals?.weight||'') + 'kg</p>'
      + '<h2>【検査所見】</h2><p>' + ((karteExtraData?.visit2_lab_data||'記録なし').replace(/\n/g,'<br>')) + '</p>'
      + '<h2>【患者特性（Visit 2）】</h2><p>生活改善意欲：' + stars(params.lifestyle_motivation) + '　服薬意欲：' + stars(params.medication_motivation) + '　信頼度：' + stars(params.trust_level) + '</p>'
      + '<h2>【問診内容（Visit 2）】</h2>' + msgHtml + '</body></html>'
    var win = window.open('', '_blank')
    win.document.write(html)
    win.document.close()
    setTimeout(function() { win.print() }, 500)
  }

  function handleExportJSON() {
    var data = { savedAt: new Date().toISOString(), patient: caseData.patient_data, diseaseName: caseData.disease_name, visit1: { treatment: caseData.visit1_data, messages: karteExtraData?.visit1_messages }, visit2: { vitals: visit2Data?.visit2Vitals, messages: messages, labData: karteExtraData?.visit2_lab_data, params: visitParams } }
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    var url = URL.createObjectURL(blob)
    var a = document.createElement('a'); a.href = url; a.download = 'karte_v2_' + caseData.id + '.json'
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
  }

  async function addOrReplaceReaction(reactionKey, selectionType, item, labelText, extraContext) {
    setReactionLoading(true)
    try {
      const res = await fetch('/api/patient-reaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userPosition: userPosition,
          userDisplayName: userDisplayName,
          patientData: caseData.patient_data, selectionType, selectedItem: item,
          previousReactions: [], persuasionMessage: null, extraContext: extraContext || null, interviewMessages: messages, lifestyleAgreements: visitParams ? visitParams.lifestyle_agreements : null.slice(-20),
        }),
      })
      const data = await res.json()
      const logEntry = {
        id: reactionKey, selectionType, item, labelText, reaction: data,
        persuasionHistory: [{ role: 'patient', content: data.reaction }],
        timestamp: new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
      }
      setReactionLog(function(prev) {
        const exists = prev.find(function(e) { return e.id === reactionKey })
        if (exists) return prev.map(function(e) { return e.id === reactionKey ? logEntry : e })
        return [...prev, logEntry]
      })
    } catch (e) { console.error('reaction error:', e) }
    finally { setReactionLoading(false) }
  }

  async function handlePersuasion(logEntryId) {
    if (!persuasionInput.trim()) return
    setReactionLoading(true)
    const entry = reactionLog.find(function(e) { return e.id === logEntryId })
    if (!entry) { setReactionLoading(false); return }
    const newHistory = [...entry.persuasionHistory, { role: 'doctor', content: persuasionInput }]
    try {
      const res = await fetch('/api/patient-reaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userPosition: userPosition, userDisplayName: userDisplayName, patientData: caseData.patient_data, selectionType: entry.selectionType, selectedItem: entry.item, interviewMessages: messages, lifestyleAgreements: visitParams ? visitParams.lifestyle_agreements : null.slice(-20), previousReactions: newHistory, persuasionMessage: persuasionInput }),
      })
      const data = await res.json()
      const updatedHistory = [...newHistory, { role: 'patient', content: data.reaction }]
      setReactionLog(function(prev) {
        return prev.map(function(e) {
          if (e.id !== logEntryId) return e
          return Object.assign({}, e, { reaction: data, persuasionHistory: updatedHistory })
        })
      })
      setPersuasionInput('')
      setActivePersuasionId(null)
    } catch (e) { console.error('persuasion error:', e) }
    finally { setReactionLoading(false) }
  }

  async function handleMedSelect(med) {
    const isSelected = selectedMeds.includes(med.id)
    if (isSelected) {
      setSelectedMeds(function(prev) { return prev.filter(function(id) { return id !== med.id }) })
      setReactionLog(function(prev) { return prev.filter(function(e) { return e.id !== 'med_' + med.id }) })
      return
    }
    const newMedCount = selectedMeds.length + 1
    setSelectedMeds(function(prev) { return [...prev, med.id] })
    await addOrReplaceReaction('med_' + med.id, 'medication', med, '💊 ' + med.drug_name_generic + '（' + med.typical_dose + '）',
      newMedCount >= 2 ? '今回で処方薬が' + newMedCount + '種類になる。' : null)
  }

  // ===== 問診合意による自動 sub_options 選択 =====
  function getAutoSubOptionsForAgreement(edu, info) {
    if (!edu || !edu.sub_options || !Array.isArray(edu.sub_options)) return {}
    const level = (info && info.level) || 'moderate'
    const strictnessRank = { 'very_mild': 1, 'mild': 2, 'moderate': 3, 'strict': 4, 'very_strict': 5 }
    // 合意レベルに応じた「目標とする strictness 集合」
    let targetStrictness
    if (level === 'weak') targetStrictness = ['very_mild']
    else if (level === 'strong') targetStrictness = ['very_mild', 'mild', 'moderate']
    else targetStrictness = ['very_mild', 'mild']
    // 候補抽出
    const candidates = edu.sub_options.filter(function(s) {
      return s.strictness !== 'none' && targetStrictness.indexOf(s.strictness) >= 0
    })
    // category 別にグルーピング
    const byCat = {}
    const noCat = []
    candidates.forEach(function(s) {
      const cat = s.category
      if (!cat) {
        noCat.push(s)
        return
      }
      if (!byCat[cat]) byCat[cat] = []
      byCat[cat].push(s)
    })
    // 各 category で目標 strictness 内の「最も厳しい」を 1 つ選ぶ（より厳しい制限を優先）
    const finalSelected = []
    Object.values(byCat).forEach(function(candArr) {
      candArr.sort(function(a, b) { return (strictnessRank[b.strictness] || 0) - (strictnessRank[a.strictness] || 0) })
      finalSelected.push(candArr[0])
    })
    // category 無い sub_option は全て含める（独立性のため）
    noCat.forEach(function(s) { finalSelected.push(s) })
    const obj = {}
    finalSelected.forEach(function(s) { obj[s.id] = true })
    return obj
  }

  // ===== 問診合意のクリックで治療方針を確定 =====
  function handleAgreementApply(edu, info) {
    if (!edu) return
    const isAlreadySelected = selectedEducation.includes(edu.id)
    if (isAlreadySelected) return
    setSelectedEducation(function(prev) { return [...prev, edu.id] })
    const autoSubs = getAutoSubOptionsForAgreement(edu, info)
    if (Object.keys(autoSubs).length > 0) {
      // 既に他の edu で同じ sub_option ID または同じ category が選択されていれば追加しない
      const globalSubIds = new Set()
      const globalCategories = new Set()
      Object.entries(selectedSubOptions).forEach(function(entry) {
        const otherEduId = entry[0]
        const subMap = entry[1] || {}
        const otherEdu = (educationItems || []).find(function(e) { return e && e.id === otherEduId })
        if (!otherEdu) return
        Object.entries(subMap).forEach(function(se) {
          if (!se[1]) return
          globalSubIds.add(se[0])
          const subObj = (otherEdu.sub_options || []).find(function(s) { return s && s.id === se[0] })
          if (subObj && subObj.category) globalCategories.add(subObj.category)
        })
      })
      const filteredSubs = {}
      Object.keys(autoSubs).forEach(function(subId) {
        if (globalSubIds.has(subId)) return
        const subObj = (edu.sub_options || []).find(function(s) { return s && s.id === subId })
        if (subObj && subObj.category && globalCategories.has(subObj.category)) return
        filteredSubs[subId] = true
      })
      if (Object.keys(filteredSubs).length > 0) {
        setSelectedSubOptions(function(prev) {
          const next = Object.assign({}, prev)
          next[edu.id] = filteredSubs
          return next
        })
      }
    }
    const detail = (info && info.detail) ? info.detail : '頑張ります'
    const reactionEntry = {
      id: 'edu_' + edu.id,
      selectionType: 'education',
      item: edu,
      labelText: '✅ ' + edu.instruction_key + '（問診合意で確定）',
      reaction: {
        acceptance_level: 'accepted',
        emotion: 'positive',
        reaction: '問診でもお話ししたとおり、' + detail + '。最初の一歩としてやってみます。'
      },
      persuasionHistory: [{ role: 'patient', content: '問診でもお話ししたとおり、' + detail + '。最初の一歩としてやってみます。' }],
      timestamp: new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
      fromInterviewAgreement: true,
      agreementLevel: (info && info.level) || 'moderate'
    }
    setReactionLog(function(prev) {
      const filtered = prev.filter(function(e) { return e.id !== reactionEntry.id })
      return [...filtered, reactionEntry]
    })
  }

  async function handleEduCategorySelect(edu) {
    const hasSubOptions = edu.sub_options && Array.isArray(edu.sub_options) && edu.sub_options.length > 0
    if (hasSubOptions) {
      setActiveEduModal(edu)
    } else {
      const isSelected = selectedEducation.includes(edu.id)
      if (isSelected) {
        setSelectedEducation(function(prev) { return prev.filter(function(id) { return id !== edu.id }) })
        setReactionLog(function(prev) { return prev.filter(function(e) { return e.id !== 'edu_' + edu.id }) })
      } else {
        setSelectedEducation(function(prev) { return [...prev, edu.id] })
        await addOrReplaceReaction('edu_' + edu.id, 'education', edu, '📋 ' + edu.instruction_key, null)
      }
    }
  }

  function openSubGroupModal(edu, groupKey, groupLabel, items) {
    setActiveEduModal(null)
    setActiveSubGroupModal({ edu, groupKey, groupLabel, items })
  }

  async function handleSubOptionSelect(edu, groupKey, subOption) {
    const currentSubs = selectedSubOptions[edu.id] || {}
    const prevSelected = currentSubs[groupKey]
    const isSameItem = prevSelected && prevSelected.id === subOption.id
    if (isSameItem) {
      setSelectedSubOptions(function(prev) {
        const updated = Object.assign({}, prev)
        updated[edu.id] = Object.assign({}, updated[edu.id] || {})
        delete updated[edu.id][groupKey]
        return updated
      })
      setReactionLog(function(prev) { return prev.filter(function(e) { return e.id !== 'sub_' + edu.id + '_' + groupKey }) })
      return
    }
    setSelectedSubOptions(function(prev) {
      const updated = Object.assign({}, prev)
      updated[edu.id] = Object.assign({}, updated[edu.id] || {})
      updated[edu.id][groupKey] = subOption
      return updated
    })
    setSelectedEducation(function(prev) { return prev.includes(edu.id) ? prev : [...prev, edu.id] })
    await addOrReplaceReaction('sub_' + edu.id + '_' + groupKey, 'education_sub',
      Object.assign({}, subOption, { eduKey: edu.instruction_key }),
      '📋 ' + edu.instruction_key + '：' + subOption.label, null)
  }

  async function confirmDeviceSelect(device) {
    const isSelected = selectedDevices.includes(device.id)
    if (isSelected) {
      setSelectedDevices(function(prev) { return prev.filter(function(id) { return id !== device.id }) })
      setReactionLog(function(prev) { return prev.filter(function(e) { return e.id !== 'dev_' + device.id }) })
    } else {
      setSelectedDevices(function(prev) { return [...prev, device.id] })
      await addOrReplaceReaction('dev_' + device.id, 'device', device, '🔧 ' + device.device_name, null)
    }
    setActiveDeviceModal(null)
  }

  async function handleGetFeedback() {
    setFeedbackLoading(true)
    try {
      const selectedMedData = medications.filter(function(m) { return selectedMeds.includes(m.id) })
      const selectedEduData = educationItems.filter(function(e) { return selectedEducation.includes(e.id) })
      const selectedDeviceData = devices.filter(function(d) { return selectedDevices.includes(d.id) })

      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseId: params.id, visitNumber: 2,
          diseaseId: caseData.disease_id, diseaseName: caseData.disease_name,
          patientData: caseData.patient_data,
          scenarioData: caseData.scenario_data,
          selectedMedications: selectedMedData,
          selectedEducation: selectedEduData,
          selectedSubOptions: selectedSubOptions,
          selectedDevices: selectedDeviceData,
          reactionLog, interviewMessages: messages, lifestyleAgreements: visitParams ? visitParams.lifestyle_agreements : null,
          visit2Vitals: visit2Data?.visit2Vitals,
          visit2Labs: visit2Data?.visit2Labs,
          consultations: consultations,
          autoTreatmentUsed: autoTreatmentUsed,
          discontinuedExistingMeds: discontinuedExistingMeds,
          labsRevealed: labsRevealed,
          additionalLabs: additionalLabs,
          additionalImaging: additionalImaging,
        }),
      })
      const data = await res.json()
      if (data.error) { alert('フィードバック取得エラー：' + data.error); return }
      setFeedback(data.feedback)
      setStep('feedback')
    } catch (e) {
      alert('エラーが発生しました：' + e.message)
    } finally {
      setFeedbackLoading(false)
    }
  }

  if (loading || generating) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0f9ff' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: '#0369a1', fontSize: '18px', marginBottom: '8px' }}>
            {generating ? '4週後の状態を計算中...' : '読み込み中...'}
          </p>
          <p style={{ color: '#64748b', fontSize: '13px' }}>患者の経過をシミュレーションしています</p>
        </div>
      </div>
    )
  }
  if (!caseData || !visit2Data) return null
  const patient = caseData.patient_data

  // ===== カルテ用：患者特性のレンダリング（青=初期、緑=改善、赤=悪化） =====
  function renderParamsBlock(params, prevParams) {
    if (!params) {
      return <p style={{ color: '#94a3b8', fontStyle: 'italic', margin: 0 }}>記録なし</p>
    }
    // 5マス分の星をレンダー：各マスに「stable=青、新規埋まり=方向に応じ緑/赤、新規空き=方向に応じ緑/赤の中抜き、stable empty=灰」
    // direction: 'higher_is_better'（高い方が良い、例: 意欲・信頼度）
    //            'lower_is_better'（低い方が良い、例: ストレス・忙しさ）
    const starRow = function(key, direction) {
      const cur = parseInt(params[key]) || 0
      const prev = prevParams ? (parseInt(prevParams[key]) || 0) : null
      const cells = []
      for (let i = 1; i <= 5; i++) {
        const curF = i <= cur
        const prevF = prev !== null && i <= prev
        let ch, col, deco = 'none'
        if (prev === null) {
          // Visit 1 タブ：比較対象なし → 全て青（初期値表示）
          ch = curF ? '★' : '☆'
          col = curF ? '#0369a1' : '#cbd5e1'
        } else if (curF && prevF) {
          // 安定（埋まったまま）
          ch = '★'; col = '#0369a1'
        } else if (curF && !prevF) {
          // 新規埋まり（増加）
          ch = '★'
          col = direction === 'higher_is_better' ? '#16a34a' : '#dc2626'
        } else if (!curF && prevF) {
          // 新規空き（減少）：前回は埋まっていた位置 → 取り消し線付き
          ch = '★'
          col = direction === 'higher_is_better' ? '#dc2626' : '#16a34a'
          deco = 'line-through'
        } else {
          // 安定（空きのまま）
          ch = '☆'; col = '#cbd5e1'
        }
        cells.push(<span key={i} style={{ color: col, fontWeight: 'bold', fontSize: '15px', textDecoration: deco, marginRight: '1px' }}>{ch}</span>)
      }
      return <span>{cells}</span>
    }
    const textChange = function(key) {
      if (!prevParams) return null
      if (params[key] !== prevParams[key]) {
        return <span style={{ color: '#d97706', fontSize: '10px', marginLeft: '4px', fontWeight: 'bold' }}>（変化）</span>
      }
      return null
    }
    return (
      <div style={{ fontSize: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', backgroundColor: '#f8fafc', padding: '8px 10px', borderRadius: '6px' }}>
        <div><b>性格：</b>{params.personality || '—'}{textChange('personality')}</div>
        <div><b>食生活：</b>{params.eating_habit_label || '—'}{params.eating_habit_comment ? '（' + params.eating_habit_comment + '）' : ''}{textChange('eating_habit_label')}</div>
        <div><b>運動：</b>{params.exercise_habit_label || '—'}{params.exercise_habit_comment ? '（' + params.exercise_habit_comment + '）' : ''}{textChange('exercise_habit_label')}</div>
        <div><b>ストレス：</b>{starRow('stress', 'lower_is_better')}</div>
        <div><b>忙しさ：</b>{starRow('busyness', 'lower_is_better')}</div>
        <div><b>生活改善意欲：</b>{starRow('lifestyle_motivation', 'higher_is_better')}</div>
        <div><b>服薬意欲：</b>{starRow('medication_motivation', 'higher_is_better')}</div>
        <div><b>信頼度：</b>{starRow('trust_level', 'higher_is_better')}</div>
        {params.smoking_label && (
          <div style={{ gridColumn: '1 / -1' }}><b>喫煙：</b>{params.smoking_label}{params.smoking_comment ? '（' + params.smoking_comment + '）' : ''}{textChange('smoking_label')}</div>
        )}
        {params.drinking_label && (
          <div style={{ gridColumn: '1 / -1' }}><b>飲酒：</b>{params.drinking_label}{params.drinking_comment ? '（' + params.drinking_comment + '）' : ''}{textChange('drinking_label')}</div>
        )}
      </div>
    )
  }

  // ===== カルテ用：専門医コンサルト表示 =====
  function renderConsultation(data) {
    let list = []
    if (Array.isArray(data)) {
      list = data.filter(function(c) { return c && c.specialty })
    } else if (data && data.performed) {
      list = [{ specialty: data.specialty, reason: data.reason }]
    }
    if (list.length === 0) {
      return <p style={{ margin: '0 0 12px', color: '#64748b' }}>紹介なし</p>
    }
    return (
      <div style={{ margin: '0 0 12px' }}>
        {list.map(function(c, idx) {
          return (
            <div key={idx} style={{ padding: '8px 10px', backgroundColor: '#fef3c7', borderRadius: '6px', marginBottom: idx < list.length - 1 ? '6px' : 0 }}>
              <p style={{ margin: '0 0 4px', fontSize: '12px' }}><b>紹介{list.length > 1 ? ' #' + (idx + 1) : ''}先：</b>{c.specialty || '未選択'}</p>
              <p style={{ margin: 0, fontSize: '12px' }}><b>紹介理由：</b>{c.reason || '記入なし'}</p>
            </div>
          )
        })}
      </div>
    )
  }

  // ===== カルテ用：既存薬の継続/中止判断表示 =====
  function renderDiscontinuedMeds(existingMeds, discontinuedList) {
    if (!existingMeds || existingMeds.length === 0) {
      return <p style={{ margin: '0 0 12px', color: '#64748b' }}>来院前服用薬なし</p>
    }
    const items = existingMeds.map(function(med, idx) {
      const key = (med.name || '') + '_' + idx
      const isDiscontinued = (discontinuedList || []).includes(key)
      return (
        <div key={idx} style={{ fontSize: '12px', margin: '2px 0' }}>
          {med.name}{med.dose ? '（' + med.dose + '）' : ''}：
          <span style={{ color: isDiscontinued ? '#dc2626' : '#059669', fontWeight: 'bold', marginLeft: '6px' }}>
            {isDiscontinued ? '中止' : '継続'}
          </span>
        </div>
      )
    })
    return <div style={{ margin: '0 0 12px', padding: '8px 10px', backgroundColor: '#f0f9ff', borderRadius: '6px' }}>{items}</div>
  }

  // ===== カルテモーダル（全ステップ共通・3タブ・患者特性付き） =====
  // Phase E: visit_parameters を取り出す
  const allParams = (karteExtraData && karteExtraData.visit_parameters) || []
  const v1Params = allParams.find(function(p) { return p.visit_number === 1 }) || null
  const v2Params = allParams.find(function(p) { return p.visit_number === 2 }) || null
  const v3Params = allParams.find(function(p) { return p.visit_number === 3 }) || null
  const karteNode = showKarte && (
    <div onClick={function() { setShowKarte(false) }} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}>
      <div onClick={function(e) { e.stopPropagation() }} style={{ backgroundColor: 'white', borderRadius: '12px', maxWidth: '720px', width: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #e2e8f0' }}>
          <div>
            <h2 style={{ fontSize: '17px', fontWeight: 'bold', color: '#0369a1', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              📋 カルテ
              <span style={{ fontSize: '10px', backgroundColor: '#fef9c3', color: '#713f12', padding: '2px 8px', borderRadius: '10px', fontWeight: 'bold', border: '1px solid #fde047' }}>一時保存成功</span>
            </h2>
            <p style={{ fontSize: '12px', color: '#64748b', margin: '2px 0 0' }}>{(caseData && caseData.patient_data && caseData.patient_data.name) || ''}（{(caseData && caseData.patient_data && caseData.patient_data.age) || ''}歳・{(caseData && caseData.patient_data && caseData.patient_data.gender) || ''}）／{(caseData && caseData.disease_name) || ''}</p>
            <p style={{ fontSize: '10px', color: '#64748b', margin: '4px 0 0', fontStyle: 'italic' }}>※ カルテを開くと現在の進行状況が自動的に一時保存され、次回同じ症例を開いた際に再開できます。</p>
          </div>
          <button onClick={function() { setShowKarte(false) }} style={{ width: '32px', height: '32px', borderRadius: '50%', border: 'none', backgroundColor: '#f1f5f9', color: '#64748b', cursor: 'pointer', fontSize: '18px', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0' }}>
          <button onClick={function() { setKarteTab(1) }} style={{ flex: 1, padding: '10px', backgroundColor: karteTab === 1 ? '#f0f9ff' : 'white', color: karteTab === 1 ? '#0369a1' : '#64748b', border: 'none', borderBottom: karteTab === 1 ? '2px solid #0369a1' : '2px solid transparent', cursor: 'pointer', fontSize: '12px', fontWeight: karteTab === 1 ? 'bold' : 'normal' }}>Visit 1（初診）</button>
          <button onClick={function() { setKarteTab(2) }} style={{ flex: 1, padding: '10px', backgroundColor: karteTab === 2 ? '#f0f9ff' : 'white', color: karteTab === 2 ? '#0369a1' : '#64748b', border: 'none', borderBottom: karteTab === 2 ? '2px solid #0369a1' : '2px solid transparent', cursor: 'pointer', fontSize: '12px', fontWeight: karteTab === 2 ? 'bold' : 'normal' }}>Visit 2（4週後）</button>
          <button onClick={function() { setKarteTab(3) }} style={{ flex: 1, padding: '10px', backgroundColor: karteTab === 3 ? '#f0fdf4' : 'white', color: karteTab === 3 ? '#059669' : '#64748b', border: 'none', borderBottom: karteTab === 3 ? '2px solid #059669' : '2px solid transparent', cursor: 'pointer', fontSize: '12px', fontWeight: karteTab === 3 ? 'bold' : 'normal' }}>Visit 3（8週後）</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', fontSize: '13px', lineHeight: 1.7, color: '#1e293b' }}>
          {karteTab === 1 && (
            <div>
              <h3 style={{ fontSize: '13px', fontWeight: 'bold', color: '#0369a1', borderLeft: '3px solid #0369a1', paddingLeft: '8px', margin: '0 0 8px' }}>患者基本情報</h3>
              <p style={{ margin: '0 0 12px' }}>職業：{(caseData && caseData.patient_data && caseData.patient_data.occupation) || '—'}<br />家族歴：{(caseData && caseData.patient_data && caseData.patient_data.family_history) || '—'}<br />既往歴：{(caseData && caseData.patient_data && caseData.patient_data.past_history) || '—'}</p>
              <h3 style={{ fontSize: '13px', fontWeight: 'bold', color: '#0369a1', borderLeft: '3px solid #0369a1', paddingLeft: '8px', margin: '0 0 8px' }}>初診時バイタル</h3>
              <p style={{ margin: '0 0 12px' }}>血圧：{(caseData && caseData.patient_data && caseData.patient_data.vitals && caseData.patient_data.vitals.bp) || '—'}　体重：{(caseData && caseData.patient_data && caseData.patient_data.vitals && caseData.patient_data.vitals.weight) || '—'}kg　BMI：{(caseData && caseData.patient_data && caseData.patient_data.vitals && caseData.patient_data.vitals.bmi) || '—'}</p>
              <h3 style={{ fontSize: '13px', fontWeight: 'bold', color: '#0369a1', borderLeft: '3px solid #0369a1', paddingLeft: '8px', margin: '0 0 8px' }}>Visit 1 治療方針</h3>
              <p style={{ margin: '0 0 4px' }}><b>処方：</b>{((caseData.visit1_data && caseData.visit1_data.selectedMedications) || []).map(function(m) { return m.drug_name_generic }).join('、') || 'なし'}</p>
              <p style={{ margin: '0 0 12px' }}><b>生活指導：</b>{((caseData.visit1_data && caseData.visit1_data.selectedEducation) || []).map(function(e) { return e.instruction_key }).join('、') || 'なし'}</p>
              <h3 style={{ fontSize: '13px', fontWeight: 'bold', color: '#0369a1', borderLeft: '3px solid #0369a1', paddingLeft: '8px', margin: '0 0 8px' }}>Visit 1 専門医コンサルト</h3>
              {renderConsultation((caseData && caseData.visit1_consultation) || (caseData && caseData.visit1_data && (caseData.visit1_data.consultations || caseData.visit1_data.consultation)))}
              <h3 style={{ fontSize: '13px', fontWeight: 'bold', color: '#0369a1', borderLeft: '3px solid #0369a1', paddingLeft: '8px', margin: '0 0 8px' }}>Visit 1 既存薬の継続/中止</h3>
              {renderDiscontinuedMeds((caseData && caseData.patient_data && caseData.patient_data.current_medications) || [], (caseData && caseData.visit1_data && caseData.visit1_data.discontinuedExistingMeds) || [])}
              <h3 style={{ fontSize: '13px', fontWeight: 'bold', color: '#0369a1', borderLeft: '3px solid #0369a1', paddingLeft: '8px', margin: '0 0 8px' }}>Visit 1 患者特性（初診時の見立て）</h3>
              <div style={{ marginBottom: '12px' }}>{renderParamsBlock(v1Params, null)}</div>
              <h3 style={{ fontSize: '13px', fontWeight: 'bold', color: '#0369a1', borderLeft: '3px solid #0369a1', paddingLeft: '8px', margin: '0 0 8px' }}>Visit 1 問診内容</h3>
              {(karteExtraData && karteExtraData.visit1_messages || []).filter(function(m) { return m.role !== 'system' }).length > 0 ? (
                <div style={{ backgroundColor: '#f8fafc', padding: '8px', borderRadius: '6px', maxHeight: '180px', overflowY: 'auto' }}>
                  {(karteExtraData && karteExtraData.visit1_messages || []).filter(function(m) { return m.role !== 'system' }).map(function(m, i) {
                    return <div key={i} style={{ margin: '3px 0' }}><b style={{ color: m.role === 'user' ? '#0369a1' : '#475569' }}>{m.role === 'user' ? '医師' : '患者'}：</b>{m.content}</div>
                  })}
                </div>
              ) : (<p style={{ color: '#94a3b8', fontStyle: 'italic', margin: 0 }}>記録なし</p>)}
            </div>
          )}
          {karteTab === 2 && (
            <div>
              <h3 style={{ fontSize: '13px', fontWeight: 'bold', color: '#059669', borderLeft: '3px solid #059669', paddingLeft: '8px', margin: '0 0 8px' }}>Visit 2 バイタル（4週後）</h3>
              <p style={{ margin: '0 0 12px' }}>血圧：{visit2Data?.visit2Vitals?.bp || '—'}　体重：{visit2Data?.visit2Vitals?.weight || '—'}kg　BMI：{visit2Data?.visit2Vitals?.bmi || '—'}</p>
              <h3 style={{ fontSize: '13px', fontWeight: 'bold', color: '#059669', borderLeft: '3px solid #059669', paddingLeft: '8px', margin: '0 0 8px' }}>Visit 2 治療方針（現在の選択）</h3>
              <p style={{ margin: '0 0 4px' }}><b>処方：</b>{(selectedMeds || []).map(function(mid) { const m = medications.find(function(x) { return x.id === mid }); return m ? m.drug_name_generic : '' }).filter(Boolean).join('、') || 'なし'}</p>
              <p style={{ margin: '0 0 12px' }}><b>生活指導：</b>{(selectedEducation || []).map(function(eid) { const e = educationItems.find(function(x) { return x.id === eid }); return e ? e.instruction_key : '' }).filter(Boolean).join('、') || 'なし'}</p>
              <h3 style={{ fontSize: '13px', fontWeight: 'bold', color: '#059669', borderLeft: '3px solid #059669', paddingLeft: '8px', margin: '0 0 8px' }}>Visit 2 専門医コンサルト</h3>
              {renderConsultation(consultations)}
              <h3 style={{ fontSize: '13px', fontWeight: 'bold', color: '#059669', borderLeft: '3px solid #059669', paddingLeft: '8px', margin: '0 0 8px' }}>Visit 2 既存薬の継続/中止</h3>
              {renderDiscontinuedMeds((caseData && caseData.patient_data && caseData.patient_data.current_medications) || [], discontinuedExistingMeds)}
              <h3 style={{ fontSize: '13px', fontWeight: 'bold', color: '#059669', borderLeft: '3px solid #059669', paddingLeft: '8px', margin: '0 0 8px' }}>Visit 2 患者特性（Visit 1 比）</h3>
              <div style={{ marginBottom: '12px' }}>{renderParamsBlock(visitParams || v2Params, v1Params)}</div>
              <h3 style={{ fontSize: '13px', fontWeight: 'bold', color: '#059669', borderLeft: '3px solid #059669', paddingLeft: '8px', margin: '0 0 8px' }}>Visit 2 問診内容</h3>
              {messages.filter(function(m) { return m.role !== 'system' }).length > 0 ? (
                <div style={{ backgroundColor: '#f0fdf4', padding: '8px', borderRadius: '6px', maxHeight: '180px', overflowY: 'auto' }}>
                  {messages.filter(function(m) { return m.role !== 'system' }).map(function(m, i) {
                    return <div key={i} style={{ margin: '3px 0' }}><b style={{ color: m.role === 'user' ? '#0369a1' : '#475569' }}>{m.role === 'user' ? '医師' : '患者'}：</b>{m.content}</div>
                  })}
                </div>
              ) : (<p style={{ color: '#94a3b8', fontStyle: 'italic', margin: 0 }}>記録なし</p>)}
            </div>
          )}
          {karteTab === 3 && (
            caseData.visit3_data ? (
              <div>
                <h3 style={{ fontSize: '13px', fontWeight: 'bold', color: '#059669', borderLeft: '3px solid #059669', paddingLeft: '8px', margin: '0 0 8px' }}>Visit 3 バイタル（8週後）</h3>
                <p style={{ margin: '0 0 12px' }}>血圧：{caseData.visit3_data?.vitals?.bp || '—'}　体重：{caseData.visit3_data?.vitals?.weight || '—'}kg　BMI：{caseData.visit3_data?.vitals?.bmi || '—'}</p>
                <h3 style={{ fontSize: '13px', fontWeight: 'bold', color: '#059669', borderLeft: '3px solid #059669', paddingLeft: '8px', margin: '0 0 8px' }}>Visit 3 治療方針</h3>
                <p style={{ margin: '0 0 4px' }}><b>処方：</b>{(caseData.visit3_data?.selectedMedications || []).map(function(m) { return m.drug_name_generic }).join('、') || 'なし'}</p>
                <p style={{ margin: '0 0 12px' }}><b>生活指導：</b>{(caseData.visit3_data?.selectedEducation || []).map(function(e) { return e.instruction_key }).join('、') || 'なし'}</p>
                <h3 style={{ fontSize: '13px', fontWeight: 'bold', color: '#059669', borderLeft: '3px solid #059669', paddingLeft: '8px', margin: '0 0 8px' }}>Visit 3 専門医コンサルト</h3>
                {renderConsultation((caseData && caseData.visit3_consultation) || (caseData && caseData.visit3_data && (caseData.visit3_data.consultations || caseData.visit3_data.consultation)))}
                <h3 style={{ fontSize: '13px', fontWeight: 'bold', color: '#059669', borderLeft: '3px solid #059669', paddingLeft: '8px', margin: '0 0 8px' }}>Visit 3 既存薬の継続/中止</h3>
                {renderDiscontinuedMeds((caseData && caseData.patient_data && caseData.patient_data.current_medications) || [], (caseData && caseData.visit3_data && caseData.visit3_data.discontinuedExistingMeds) || [])}
                <h3 style={{ fontSize: '13px', fontWeight: 'bold', color: '#059669', borderLeft: '3px solid #059669', paddingLeft: '8px', margin: '0 0 8px' }}>Visit 3 患者特性（Visit 2 比）</h3>
                <div style={{ marginBottom: '12px' }}>{renderParamsBlock(v3Params, v2Params)}</div>
                {typeof caseData.visit3_data?.finalScore === 'number' && (
                  <div style={{ background: 'linear-gradient(135deg, #059669 0%, #0369a1 100%)', borderRadius: '10px', padding: '14px', marginBottom: '12px', color: 'white', textAlign: 'center' }}>
                    <p style={{ fontSize: '11px', margin: '0 0 4px', opacity: 0.9 }}>🏆 最終総合評価</p>
                    <span style={{ fontSize: '32px', fontWeight: 'bold' }}>{caseData.visit3_data.finalScore}</span><span style={{ fontSize: '14px', opacity: 0.85 }}> / 100</span>
                  </div>
                )}
                <h3 style={{ fontSize: '13px', fontWeight: 'bold', color: '#059669', borderLeft: '3px solid #059669', paddingLeft: '8px', margin: '0 0 8px' }}>Visit 3 問診内容</h3>
                {((karteExtraData && karteExtraData.visit3_messages) || []).filter(function(m) { return m.role !== 'system' }).length > 0 ? (
                  <div style={{ backgroundColor: '#f0fdf4', padding: '8px', borderRadius: '6px', maxHeight: '180px', overflowY: 'auto' }}>
                    {((karteExtraData && karteExtraData.visit3_messages) || []).filter(function(m) { return m.role !== 'system' }).map(function(m, i) {
                      return <div key={i} style={{ margin: '3px 0' }}><b style={{ color: m.role === 'user' ? '#0369a1' : '#475569' }}>{m.role === 'user' ? '医師' : '患者'}：</b>{m.content}</div>
                    })}
                  </div>
                ) : (<p style={{ color: '#94a3b8', fontStyle: 'italic', margin: 0 }}>記録なし</p>)}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
                <p style={{ fontSize: '40px', margin: '0 0 12px' }}>📅</p>
                <p style={{ fontSize: '14px', fontWeight: 'bold', color: '#64748b', margin: '0 0 4px' }}>Visit 3（8週後の再診）は未実施です</p>
              </div>
            )
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px', padding: '12px 20px', borderTop: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
          <button onClick={handleExportPDF} style={{ flex: 1, padding: '8px', backgroundColor: '#0369a1', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>🖨 PDFで出力</button>
          <button onClick={handleExportJSON} style={{ flex: 1, padding: '8px', backgroundColor: 'white', color: '#0369a1', border: '1px solid #0369a1', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>💾 JSONで保存</button>
        </div>
      </div>
    </div>
  )

  // ===== フィードバック画面 =====
  if (step === 'feedback') {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f0f9ff', padding: '16px' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h1 style={{ fontSize: '20px', fontWeight: 'bold', color: '#0369a1', margin: 0 }}>Visit 2 フィードバック</h1>
              <p style={{ color: '#64748b', fontSize: '12px', margin: 0 }}>指導医からのコメント</p>
            </div>
            <button onClick={openKarte} style={{ padding: '7px 14px', backgroundColor: 'white', color: '#0369a1', border: '1px solid #0369a1', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 500 }}>📋 カルテ（一時保存）</button>
          </div>

          <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '24px', border: '1px solid #e2e8f0', marginBottom: '16px' }}>
            <div style={{ whiteSpace: 'pre-wrap', fontSize: '14px', color: '#1e293b', lineHeight: '1.8' }}>
              {feedback}
            </div>
          </div>

          <div style={{ backgroundColor: '#f0f9ff', borderRadius: '12px', padding: '16px', border: '1px solid #bae6fd', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 'bold', color: '#0369a1', marginBottom: '8px' }}>📊 Visit 2の結果サマリー</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '13px' }}>
              <div>
                <p style={{ color: '#64748b', margin: '0 0 2px' }}>血圧（4週後）</p>
                <p style={{ fontWeight: 'bold', color: visit2Data.bpControlled ? '#16a34a' : '#dc2626', margin: 0 }}>
                  {visit2Data.visit2Vitals.bp}
                  <span style={{ fontSize: '11px', marginLeft: '6px' }}>
                    （{visit2Data.bpReduction > 0 ? '↓' + visit2Data.bpReduction + 'mmHg' : '変化なし'}）
                  </span>
                </p>
              </div>
              <div>
                <p style={{ color: '#64748b', margin: '0 0 2px' }}>体重（4週後）</p>
                <p style={{ fontWeight: 'bold', color: '#1e293b', margin: 0 }}>
                  {visit2Data.visit2Vitals.weight}kg
                  <span style={{ fontSize: '11px', color: '#16a34a', marginLeft: '6px' }}>
                    （{visit2Data.weightReduction > 0 ? '↓' + visit2Data.weightReduction + 'kg' : '変化なし'}）
                  </span>
                </p>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={async function() {
                try { await fetch('/api/save-record?caseId=' + params.id, { method: 'DELETE' }) } catch (e) {}
                window.location.href = '/cases/' + params.id + '/visit3'
              }}
              style={{ flex: 1, padding: '14px', backgroundColor: '#0369a1', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '15px', fontWeight: 'bold' }}>
              Visit 3（8週後）へ進む →
            </button>
            <button
              onClick={function() { window.location.href = '/cases' }}
              style={{ padding: '14px 20px', backgroundColor: 'white', color: '#64748b', border: '1px solid #cbd5e1', borderRadius: '10px', cursor: 'pointer', fontSize: '14px' }}>
              症例選択へ
            </button>
            <button onClick={openKarte} style={{ padding: '6px 14px', backgroundColor: 'white', color: '#0369a1', border: '1px solid #0369a1', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 500 }}>📋 カルテ（一時保存）</button>
          </div>
          {karteNode}
        </div>
      </div>
    )
  }

  // ===== 治療方針決定画面 =====
  if (step === 'treatment') {
    if (!visit2Data) return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0f9ff' }}>
        <p style={{ color: '#0369a1', fontSize: '18px' }}>Visit 2データを読み込み中...</p>
      </div>
    )
    const eduByCategory = educationItems.reduce(function(acc, edu) {
      if (!acc[edu.category]) acc[edu.category] = []
      acc[edu.category].push(edu)
      return acc
    }, {})
    const medsByCategory = medications.reduce(function(acc, med) {
      if (!acc[med.drug_category]) acc[med.drug_category] = []
      acc[med.drug_category].push(med)
      return acc
    }, {})
    const totalSelected = selectedMeds.length + selectedEducation.length + selectedDevices.length

    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f0f9ff', padding: '12px', paddingBottom: '280px' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <h1 style={{ fontSize: '18px', fontWeight: 'bold', color: '#0369a1', margin: 0 }}>治療方針の決定（Visit 2）</h1>
              <p style={{ color: '#64748b', fontSize: '12px', margin: 0 }}>4週後の再診　{caseData.disease_name}</p>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button onClick={function() { setStep('interview') }}
                style={{ padding: '7px 14px', backgroundColor: 'white', color: '#64748b', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', fontSize: '12px' }}>
                ← 問診に戻る
              </button>
              <button onClick={openKarte} style={{ padding: '7px 14px', backgroundColor: 'white', color: '#0369a1', border: '1px solid #0369a1', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 500 }}>📋 カルテ（一時保存）</button>
            </div>
          </div>

          {/* 学習モード: 担当医に任せるマスターボタン */}
          {isNonPhysicianRole(userPosition) && (
            <div style={{ marginBottom: '12px', padding: '12px', backgroundColor: '#fef3c7', border: '2px solid #f59e0b', borderRadius: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap', gap: '6px' }}>
                <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#92400e' }}>🎓 学習モード({userPosition}){autoTreatmentUsed ? ' - 適用済' : ''}</span>
                <span style={{ fontSize: '10px', color: '#78350f' }}>治療選択は評価対象外。生活指導・患者対応で採点</span>
              </div>
              <button onClick={function() { handleAutoTreatment('all') }} disabled={autoTreatmentLoading}
                style={{ width: '100%', padding: '10px', backgroundColor: autoTreatmentLoading ? '#fcd34d' : '#f59e0b', color: 'white', border: 'none', borderRadius: '8px', cursor: autoTreatmentLoading ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: 'bold' }}>
                {autoTreatmentLoading ? '⏳ 担当医が判断中...' : '🩺 担当医に任せる(投薬・機器・コンサルト一括自動入力)'}
              </button>
            </div>
          )}

          {karteNode}

          <PatientInfoCard
            patient={patient}
            diseaseName={caseData.disease_name}
            visit2Vitals={visit2Data.visit2Vitals}
            visit2Labs={visit2Data.visit2Labs}
            visit1Data={caseData.visit1_data}
            labsRevealed={labsRevealed}
            v1Revealed={!!(caseData.visit1_data && caseData.visit1_data.labsRevealed)}
            additionalLabs={additionalLabs}
            additionalImaging={additionalImaging}
            v1AdditionalLabs={(caseData.visit1_data && caseData.visit1_data.additionalLabs) || []}
            v1AdditionalImaging={(caseData.visit1_data && caseData.visit1_data.additionalImaging) || []}
            collapsed={patientCardCollapsed}
            onToggle={function() { setPatientCardCollapsed(!patientCardCollapsed) }}
          />
          <ParameterPanel data={visitParams} caseId={caseData?.id} visitNumber={2} />

          {false && (
            <div style={{ backgroundColor: '#fef9c3', borderRadius: '8px', padding: '6px 10px', marginBottom: '8px', border: '1px solid #fde047', fontSize: '11px', color: '#713f12' }}>
              <strong>【DEV】</strong> 性格:{patient.hidden_params.personality_type} 服薬意欲:{patient.hidden_params.adherence_level} 降圧:{visit2Data.bpReduction}mmHg 減量:{visit2Data.weightReduction}kg
            </div>
          )}

          <div style={{ backgroundColor: '#0369a1', borderRadius: '8px', padding: '8px 14px', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{ fontSize: '12px', color: 'white', margin: 0 }}>
              選択済：投薬 <strong>{selectedMeds.length}</strong>件　指導 <strong>{selectedEducation.length}</strong>件
            </p>
            {totalSelected > 0 && (
              <button onClick={handleGetFeedback} disabled={feedbackLoading}
                style={{ padding: '5px 14px', backgroundColor: '#059669', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                {feedbackLoading ? '生成中...' : 'フィードバックを受ける →'}
              </button>
            )}
          </div>

          <AccordionSection title="📋 生活指導・患者教育" badge={selectedEducation.length > 0 ? selectedEducation.length + '件' : null} defaultOpen={true}>
            {/* ✅ 問診合意バナー - クイック選択 */}
            {visitParams && visitParams.lifestyle_agreements && Object.keys(visitParams.lifestyle_agreements).some(function(k) { return visitParams.lifestyle_agreements[k] && visitParams.lifestyle_agreements[k].agreed }) && (
              <div style={{ marginBottom: '12px', padding: '10px 12px', backgroundColor: '#f0fdf4', borderRadius: '8px', border: '1.5px solid #86efac' }}>
                <p style={{ fontSize: '12px', fontWeight: 'bold', color: '#166534', marginBottom: '4px' }}>✅ 問診で得られた合意事項</p>
                <p style={{ fontSize: '10px', color: '#15803d', marginBottom: '8px' }}>クリックで関連する指導項目を選択できます。患者が既に同意しているため受け入れがスムーズです。</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {Object.keys(visitParams.lifestyle_agreements).map(function(category) {
                    const info = visitParams.lifestyle_agreements[category]
                    if (!info || !info.agreed) return null
                    const matchingEdus = educationItems.filter(function(e) { return e.category === category })
                    return matchingEdus.map(function(edu) {
                      const isAlreadySelected = selectedEducation.includes(edu.id)
                      return (
                        <div key={edu.id} onClick={function() { if (!isAlreadySelected) handleAgreementApply(edu, info) }}
                          style={{ padding: '6px 12px', borderRadius: '14px', fontSize: '11px', border: isAlreadySelected ? '2px solid #16a34a' : '1.5px solid #86efac', backgroundColor: isAlreadySelected ? '#dcfce7' : 'white', cursor: isAlreadySelected ? 'default' : 'pointer', color: '#166534', fontWeight: 'bold' }}>
                          {isAlreadySelected ? '✓ ' : '+ '}{edu.instruction_key}
                        </div>
                      )
                    })
                  })}
                </div>
              </div>
            )}
            {Object.entries(eduByCategory).map(function([category, items]) {
              return (
                <div key={category} style={{ marginBottom: '10px' }}>
                  <p style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569', marginBottom: '5px' }}>{CATEGORY_LABEL[category] || category}</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                    {items.map(function(item) {
                      const hasSubOptions = item.sub_options && Array.isArray(item.sub_options) && item.sub_options.length > 0
                      const currentSubs = selectedSubOptions[item.id] || {}
                      const subCount = Object.values(currentSubs).filter(Boolean).length
                      const isSelected = selectedEducation.includes(item.id)
                      return (
                        <div key={item.id} onClick={function() { handleEduCategorySelect(item) }}
                          style={{ padding: '5px 12px', borderRadius: '16px', fontSize: '12px', border: isSelected ? '2px solid #0369a1' : '1px solid #e2e8f0', backgroundColor: isSelected ? '#eff6ff' : 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <span style={{ color: isSelected ? '#0369a1' : '#374151' }}>{item.instruction_key}</span>
                          {hasSubOptions && <span style={{ fontSize: '9px', color: '#0369a1' }}>▼</span>}
                          {subCount > 0 && <span style={{ fontSize: '9px', backgroundColor: '#0369a1', color: 'white', borderRadius: '8px', padding: '0 4px' }}>{subCount}</span>}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </AccordionSection>

          <AccordionSection title="💊 投薬選択" badge={selectedMeds.length > 0 ? selectedMeds.length + '剤' : null} defaultOpen={true}>
            {isNonPhysicianRole(userPosition) && (
              <div style={{ marginBottom: '10px', padding: '8px', backgroundColor: '#fef3c7', border: '1px dashed #f59e0b', borderRadius: '6px' }}>
                <button onClick={function() { handleAutoTreatment('medications') }} disabled={autoTreatmentLoading}
                  style={{ width: '100%', padding: '6px', backgroundColor: autoTreatmentLoading ? '#fcd34d' : '#f59e0b', color: 'white', border: 'none', borderRadius: '6px', cursor: autoTreatmentLoading ? 'not-allowed' : 'pointer', fontSize: '11px', fontWeight: 'bold' }}>
                  🩺 担当医の推奨投薬を入力
                </button>
              </div>
            )}
            {/* 既存薬プリチェック */}
            {caseData && caseData.patient_data && Array.isArray(caseData.patient_data.current_medications) && caseData.patient_data.current_medications.length > 0 && (
              <div style={{ marginBottom: '12px', padding: '10px 12px', backgroundColor: '#fff7ed', borderRadius: '8px', border: '1px solid #fed7aa' }}>
                <p style={{ fontSize: '11px', fontWeight: 'bold', color: '#9a3412', marginBottom: '6px' }}>📋 現在服用中の薬剤（来院前から）</p>
                {caseData.patient_data.current_medications.map(function(med, idx) {
                  const medKey = (med.name || '') + '_' + idx
                  const isDiscontinued = discontinuedExistingMeds.includes(medKey)
                  return (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', fontSize: '12px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', flex: 1 }}>
                        <input type="checkbox" checked={!isDiscontinued} onChange={function() {
                          if (isDiscontinued) {
                            // 中止 → 継続に戻す
                            setDiscontinuedExistingMeds(function(prev) { return prev.filter(function(k) { return k !== medKey }) })
                            setReactionLog(function(prev) { return prev.filter(function(e) { return e.id !== 'discontinue_' + medKey }) })
                          } else {
                            // 継続 → 中止
                            setDiscontinuedExistingMeds(function(prev) { return [...prev, medKey] })
                            addOrReplaceReaction(
                              'discontinue_' + medKey,
                              'discontinuation',
                              med,
                              '🚫 ' + (med.name || '') + ' 中止',
                              '既存薬「' + (med.name || '') + (med.dose ? '（' + med.dose + '）' : '') + '」の中止判断'
                            )
                          }
                        }} />
                        <span style={{ color: isDiscontinued ? '#94a3b8' : '#1e293b', textDecoration: isDiscontinued ? 'line-through' : 'none' }}>
                          {med.name} {med.dose ? '（' + med.dose + '）' : ''} {med.frequency ? '・' + med.frequency : ''}
                        </span>
                      </label>
                      {isDiscontinued && <span style={{ fontSize: '10px', color: '#dc2626', fontWeight: 'bold' }}>中止</span>}
                    </div>
                  )
                })}
                <p style={{ fontSize: '10px', color: '#9a3412', marginTop: '4px', marginBottom: 0 }}>※ チェックを外すと中止扱いになり、患者の反応が記録されます</p>
              </div>
            )}
            <p style={{ fontSize: '11px', color: '#64748b', marginBottom: '8px' }}>Visit 1の投薬を継続・変更・追加できます。</p>
            {Object.entries(medsByCategory).map(function([category, meds]) {
              return (
                <div key={category} style={{ marginBottom: '10px' }}>
                  <p style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569', marginBottom: '5px' }}>{category}</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '6px' }}>
                    {meds.map(function(med) {
                      const isSelected = selectedMeds.includes(med.id)
                      const wasInV1 = (caseData.visit1_data?.selectedMedications || []).find(function(m) { return m.id === med.id })
                      return (
                        <div key={med.id} onClick={function() { handleMedSelect(med) }}
                          style={{ padding: '8px 10px', borderRadius: '8px', border: isSelected ? '2px solid #0369a1' : '1px solid #e2e8f0', backgroundColor: isSelected ? '#eff6ff' : 'white', cursor: 'pointer' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                              <p style={{ fontSize: '12px', fontWeight: 'bold', color: '#1e293b', margin: 0 }}>{med.drug_name_generic}</p>
                              <p style={{ fontSize: '10px', color: '#64748b', margin: 0 }}>{med.typical_dose}</p>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                              {med.first_line && <span style={{ fontSize: '9px', backgroundColor: '#dcfce7', color: '#16a34a', padding: '1px 4px', borderRadius: '4px', fontWeight: 'bold' }}>第一選択</span>}
                              {wasInV1 && <span style={{ fontSize: '9px', backgroundColor: '#fef9c3', color: '#713f12', padding: '1px 4px', borderRadius: '4px' }}>V1継続</span>}
                              {isSelected && <span style={{ fontSize: '12px' }}>✓</span>}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </AccordionSection>

          {/* 専門医コンサルト（複数科対応） */}
          <AccordionSection
            title="🏥 専門医コンサルト"
            badge={consultations.length > 0 ? '紹介あり（' + consultations.length + '件）' : null}
            defaultOpen={false}>
            {isNonPhysicianRole(userPosition) && (
              <div style={{ marginBottom: '10px', padding: '8px', backgroundColor: '#fef3c7', border: '1px dashed #f59e0b', borderRadius: '6px' }}>
                <button onClick={function() { handleAutoTreatment('consultations') }} disabled={autoTreatmentLoading}
                  style={{ width: '100%', padding: '6px', backgroundColor: autoTreatmentLoading ? '#fcd34d' : '#f59e0b', color: 'white', border: 'none', borderRadius: '6px', cursor: autoTreatmentLoading ? 'not-allowed' : 'pointer', fontSize: '11px', fontWeight: 'bold' }}>
                  🩺 担当医の推奨コンサルトを入力
                </button>
              </div>
            )}
            <div style={{ padding: '4px 0' }}>
              {consultations.length === 0 && (
                <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 12px' }}>専門医コンサルトはありません。複数科への並行コンサルトが可能です。</p>
              )}
              {consultations.map(function(c, idx) {
                return (
                  <div key={idx} style={{ border: '1px solid #f59e0b', borderRadius: '8px', padding: '10px', marginBottom: '10px', backgroundColor: '#fef3c7' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#92400e' }}>コンサルト #{idx + 1}</span>
                      <button type="button" onClick={function() { removeConsultation(idx) }}
                        style={{ background: 'white', border: '1px solid #dc2626', color: '#dc2626', borderRadius: '4px', padding: '3px 10px', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold' }}>削除</button>
                    </div>
                    <p style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>紹介科</p>
                    <select value={c.specialty} onChange={function(e) { updateConsultation(idx, 'specialty', e.target.value) }}
                      style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid #cbd5e1', borderRadius: '6px', marginBottom: '8px', backgroundColor: 'white' }}>
                      <option value="">選択してください</option>
                      <option value="循環器">循環器</option>
                      <option value="内分泌・代謝">内分泌・代謝</option>
                      <option value="腎臓">腎臓</option>
                      <option value="眼科">眼科</option>
                      <option value="皮膚科">皮膚科</option>
                      <option value="形成外科">形成外科</option>
                      <option value="耳鼻科">耳鼻科</option>
                      <option value="神経内科">神経内科</option>
                      <option value="産婦人科">産婦人科</option>
                      <option value="精神科">精神科</option>
                      <option value="消化器">消化器</option>
                      <option value="呼吸器">呼吸器</option>
                      <option value="脂質代謝専門医">脂質代謝専門医</option>
                      <option value="禁煙外来">禁煙外来</option>
                      <option value="減酒外来">減酒外来</option>
                      <option value="地域包括支援センター">地域包括支援センター</option>
                      <option value="その他">その他</option>
                    </select>
                    <p style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>紹介理由</p>
                    <textarea value={c.reason} onChange={function(e) { updateConsultation(idx, 'reason', e.target.value) }}
                      placeholder="例: コントロール不良のため、合併症精査のため、糖尿病網膜症の評価、等"
                      rows={2}
                      style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid #cbd5e1', borderRadius: '6px', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box', backgroundColor: 'white' }} />
                  </div>
                )
              })}
              <button type="button" onClick={addConsultation}
                style={{ width: '100%', padding: '10px', fontSize: '12px', fontWeight: 'bold', backgroundColor: '#16a34a', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                + 専門医コンサルトを追加
              </button>
            </div>
          </AccordionSection>

        </div>

        {/* モーダル群 */}
        {activeEduModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ backgroundColor: 'white', borderRadius: '16px 16px 0 0', padding: '20px', width: '100%', maxWidth: '560px', maxHeight: '80vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h2 style={{ fontSize: '15px', fontWeight: 'bold', color: '#0369a1', margin: 0 }}>{activeEduModal.instruction_key}</h2>
                <button onClick={function() { setActiveEduModal(null) }} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}>✕</button>
              </div>
              {Object.entries(groupSubOptions(activeEduModal.sub_options)).map(function([groupKey, group]) {
                const currentSubs = selectedSubOptions[activeEduModal.id] || {}
                const selected = currentSubs[groupKey]
                return (
                  <div key={groupKey} style={{ marginBottom: '10px', padding: '10px', backgroundColor: selected ? '#eff6ff' : '#f8fafc', borderRadius: '10px', border: selected ? '1px solid #bfdbfe' : '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <p style={{ fontSize: '13px', fontWeight: 'bold', color: '#1e293b', margin: 0 }}>{group.label}</p>
                      {selected && <span style={{ fontSize: '10px', color: '#0369a1', backgroundColor: '#dbeafe', padding: '1px 6px', borderRadius: '8px' }}>{selected.label}</span>}
                    </div>
                    <button onClick={function() { openSubGroupModal(activeEduModal, groupKey, group.label, group.items) }}
                      style={{ width: '100%', padding: '7px', backgroundColor: selected ? '#0369a1' : 'white', color: selected ? 'white' : '#0369a1', border: '1px solid #0369a1', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                      {selected ? '変更する →' : '選択する →'}
                    </button>
                  </div>
                )
              })}
              <button onClick={function() { setActiveEduModal(null) }} style={{ width: '100%', padding: '10px', backgroundColor: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', marginTop: '8px' }}>閉じる</button>
            </div>
          </div>
        )}

        {activeSubGroupModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1100 }}>
            <div style={{ backgroundColor: 'white', borderRadius: '16px 16px 0 0', padding: '20px', width: '100%', maxWidth: '480px', maxHeight: '80vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <div>
                  <p style={{ fontSize: '11px', color: '#64748b', margin: 0 }}>{activeSubGroupModal.edu.instruction_key}</p>
                  <h2 style={{ fontSize: '14px', fontWeight: 'bold', color: '#0369a1', margin: 0 }}>{activeSubGroupModal.groupLabel}</h2>
                </div>
                <button onClick={function() { setActiveSubGroupModal(null) }} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}>✕</button>
              </div>
              <p style={{ fontSize: '11px', color: '#64748b', marginBottom: '10px' }}>1つ選択してください</p>
              {activeSubGroupModal.items.map(function(sub) {
                const currentSubs = selectedSubOptions[activeSubGroupModal.edu.id] || {}
                const isSelected = currentSubs[activeSubGroupModal.groupKey] && currentSubs[activeSubGroupModal.groupKey].id === sub.id
                return (
                  <div key={sub.id} onClick={function() { handleSubOptionSelect(activeSubGroupModal.edu, activeSubGroupModal.groupKey, sub) }}
                    style={{ marginBottom: '6px', padding: '10px', borderRadius: '8px', border: isSelected ? '2px solid #0369a1' : '1px solid #e2e8f0', backgroundColor: isSelected ? '#eff6ff' : 'white', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                        <div style={{ width: '14px', height: '14px', borderRadius: '50%', border: isSelected ? '4px solid #0369a1' : '2px solid #cbd5e1', flexShrink: 0 }} />
                        <p style={{ fontSize: '12px', fontWeight: isSelected ? 'bold' : 'normal', color: '#1e293b', margin: 0 }}>{sub.label}</p>
                      </div>
                      {sub.description && <p style={{ fontSize: '10px', color: '#64748b', marginLeft: '20px', margin: '0 0 0 20px' }}>{sub.description}</p>}
                    </div>
                    <span style={{ fontSize: '10px', color: STRICTNESS_COLOR[sub.strictness] || '#64748b', fontWeight: 'bold', marginLeft: '6px', whiteSpace: 'nowrap' }}>{STRICTNESS_LABEL[sub.strictness] || sub.strictness}</span>
                  </div>
                )
              })}
              <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                <button onClick={function() { setActiveSubGroupModal(null); setActiveEduModal(activeSubGroupModal.edu) }}
                  style={{ flex: 1, padding: '10px', backgroundColor: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '12px' }}>← 戻る</button>
                <button onClick={function() { setActiveSubGroupModal(null) }}
                  style={{ flex: 1, padding: '10px', backgroundColor: '#0369a1', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>確定</button>
              </div>
            </div>
          </div>
        )}

        {/* 患者反応・治療確定（画面下部固定） */}
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100, boxShadow: '0 -4px 12px rgba(3,105,161,0.15)' }}>
          <div style={{ backgroundColor: '#fef2f2', borderTop: '2px solid #dc2626', maxHeight: '180px', overflowY: 'auto' }}>
            <div style={{ maxWidth: '800px', margin: '0 auto', padding: '6px 16px' }}>
              <p style={{ fontSize: '12px', fontWeight: 'bold', color: '#dc2626', margin: '0 0 4px' }}>
                💬 患者の反応
                {reactionLog.length > 0 && <span style={{ fontSize: '10px', backgroundColor: '#dc2626', color: 'white', borderRadius: '8px', padding: '1px 6px', marginLeft: '6px' }}>{reactionLog.length}件</span>}
                {reactionLoading && <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: '8px' }}>💭 反応中...</span>}
              </p>
              {reactionLog.length === 0 && !reactionLoading && (
                <p style={{ fontSize: '11px', color: '#94a3b8', margin: '0 0 4px' }}>治療内容を選択すると患者の反応が表示されます</p>
              )}
              {reactionLog.map(function(entry) {
                const isRejected = entry.reaction.acceptance_level === 'rejected' || entry.reaction.acceptance_level === 'negotiating'
                const isActive = activePersuasionId === entry.id
                return (
                  <div key={entry.id} style={{ marginBottom: '5px', padding: '6px 8px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #fecaca' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                      <p style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569', margin: 0 }}>{entry.labelText}</p>
                      <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '8px', backgroundColor: ACCEPTANCE_COLOR[entry.reaction.acceptance_level] + '20', color: ACCEPTANCE_COLOR[entry.reaction.acceptance_level], fontWeight: 'bold' }}>{ACCEPTANCE_LABEL[entry.reaction.acceptance_level]}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '5px' }}>
                      <span style={{ fontSize: '13px' }}>{EMOTION_ICON[entry.reaction.emotion] || '😐'}</span>
                      <p style={{ fontSize: '12px', color: '#1e293b', fontStyle: 'italic', lineHeight: '1.4', margin: 0, flex: 1 }}>「{entry.reaction.reaction}」</p>
                    </div>
                    {isRejected && !isActive && (
                      <div style={{ display: 'flex', gap: '5px', marginTop: '3px', marginLeft: '18px' }}>
                        <button onClick={function() { setActivePersuasionId(entry.id); setPersuasionInput('') }}
                          style={{ fontSize: '10px', padding: '2px 8px', backgroundColor: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '6px', cursor: 'pointer' }}>💬 説得する</button>
                        <button onClick={function() {
                          setReactionLog(function(prev) { return prev.filter(function(e) { return e.id !== entry.id }) })
                          if (entry.selectionType === 'medication') setSelectedMeds(function(prev) { return prev.filter(function(id) { return id !== entry.id.replace('med_', '') }) })
                          else if (entry.selectionType === 'education' || entry.selectionType === 'education_sub') { const eduId = entry.id.split('_')[1]; setSelectedEducation(function(prev) { return prev.filter(function(id) { return id !== eduId }) }); setSelectedSubOptions(function(prev) { const u = Object.assign({}, prev); delete u[eduId]; return u }) }
                          else if (entry.selectionType === 'device') setSelectedDevices(function(prev) { return prev.filter(function(id) { return id !== entry.id.replace('dev_', '') }) })
                          else if (entry.selectionType === 'discontinuation') { const dk = entry.id.replace('discontinue_', ''); setDiscontinuedExistingMeds(function(prev) { return prev.filter(function(k) { return k !== dk }) }) }
                        }}
                          style={{ fontSize: '10px', padding: '2px 8px', backgroundColor: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer' }}>✕ 取りやめ</button>
                      </div>
                    )}
                    {isRejected && isActive && (
                      <div style={{ display: 'flex', gap: '4px', marginTop: '3px', marginLeft: '18px' }}>
                        <input type="text" value={persuasionInput}
                          onChange={function(e) { setPersuasionInput(e.target.value) }}
                          onKeyDown={function(e) { if (e.key === 'Enter') handlePersuasion(entry.id) }}
                          placeholder="患者への説明..." autoFocus
                          style={{ flex: 1, padding: '3px 8px', border: '1px solid #0369a1', borderRadius: '6px', fontSize: '11px', outline: 'none' }} />
                        <button onClick={function() { handlePersuasion(entry.id) }} disabled={reactionLoading}
                          style={{ padding: '3px 8px', backgroundColor: '#0369a1', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '11px' }}>{reactionLoading ? '...' : '説明'}</button>
                        <button onClick={function() { setActivePersuasionId(null); setPersuasionInput('') }}
                          style={{ padding: '3px 6px', backgroundColor: 'white', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer', fontSize: '11px' }}>✕</button>
                      </div>
                    )}
                  </div>
                )
              })}
              <div ref={reactionLogEndRef} />
            </div>
          </div>
          <div style={{ backgroundColor: '#e0f2fe', borderTop: '2px solid #0369a1', padding: '8px 16px' }}>
            <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
              <p style={{ fontSize: '12px', color: '#0369a1', margin: 0, flex: 1 }}>
                指導 <strong>{selectedEducation.length}</strong>件　投薬 <strong>{selectedMeds.length}</strong>件　機器 <strong>{selectedDevices.length}</strong>件
              </p>
              <button onClick={handleGetFeedback} disabled={feedbackLoading || totalSelected === 0}
                style={{ padding: '10px 24px', backgroundColor: feedbackLoading || totalSelected === 0 ? '#93c5fd' : '#059669', color: 'white', border: 'none', borderRadius: '8px', cursor: feedbackLoading || totalSelected === 0 ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                {feedbackLoading ? 'フィードバック生成中...' : '治療方針を確定 →'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ===== 問診・診察画面 =====
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f9ff', padding: '12px' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: 'bold', color: '#0369a1', margin: 0 }}>Visit 2｜4週後の再診</h1>
            <p style={{ color: '#64748b', fontSize: '12px', margin: 0 }}>{caseData.disease_name}</p>
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button onClick={openKarte} style={{ padding: '6px 14px', backgroundColor: 'white', color: '#0369a1', border: '1px solid #0369a1', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 500 }}>📋 カルテ（一時保存）</button>
            <button onClick={function() { window.location.href = '/cases' }}
              style={{ padding: '6px 14px', backgroundColor: 'white', color: '#64748b', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', fontSize: '12px' }}>
              症例選択へ
            </button>
          </div>
        </div>

        {karteNode}

        <PatientInfoCard
          patient={patient}
          diseaseName={caseData.disease_name}
          visit2Vitals={visit2Data.visit2Vitals}
          visit2Labs={visit2Data.visit2Labs}
          visit1Data={caseData.visit1_data}
          labsRevealed={labsRevealed}
          v1Revealed={!!(caseData.visit1_data && caseData.visit1_data.labsRevealed)}
          additionalLabs={additionalLabs}
          additionalImaging={additionalImaging}
          v1AdditionalLabs={(caseData.visit1_data && caseData.visit1_data.additionalLabs) || []}
          v1AdditionalImaging={(caseData.visit1_data && caseData.visit1_data.additionalImaging) || []}
          collapsed={patientCardCollapsed}
          onToggle={function() { setPatientCardCollapsed(!patientCardCollapsed) }}
        />
        <ParameterPanel data={visitParams} caseId={caseData?.id} visitNumber={2} />

        {!labsRevealed && (
          <div style={{ backgroundColor: '#fef9c3', borderRadius: '8px', padding: '8px 14px', marginBottom: '10px', border: '1px solid #fde047', fontSize: '12px', color: '#713f12' }}>
            💡 「検査結果を確認する」と入力すると血液検査結果が表示されます
          </div>
        )}

        <div style={{ backgroundColor: 'white', borderRadius: '10px', border: '1px solid #e2e8f0', marginBottom: '140px' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc', borderRadius: '10px 10px 0 0' }}>
            <p style={{ fontSize: '13px', fontWeight: 'bold', color: '#0369a1', margin: 0 }}>患者との対話（Visit 2）</p>
            <p style={{ fontSize: '10px', color: '#94a3b8', margin: 0 }}>患者への質問を入力(Enterで発言、検査は[診察・検査]ボタンから)</p>
          </div>
          <div style={{ padding: '8px 14px', borderBottom: '1px solid #e2e8f0', backgroundColor: '#fafafa', display: 'flex', alignItems: 'center', gap: '14px', fontSize: '11px', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 'bold', color: '#475569' }}>📚 指導医モード:</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
              <input type="radio" name="coaching-mode" checked={coachingMode === 'detailed'} onChange={function() { updateCoachingMode('detailed') }} style={{ cursor: 'pointer' }} />
              <span>細かく</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
              <input type="radio" name="coaching-mode" checked={coachingMode === 'recommended_only'} onChange={function() { updateCoachingMode('recommended_only') }} style={{ cursor: 'pointer' }} />
              <span>推奨治療のみ</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
              <input type="radio" name="coaching-mode" checked={coachingMode === 'none'} onChange={function() { updateCoachingMode('none') }} style={{ cursor: 'pointer' }} />
              <span>なし</span>
            </label>
          </div>
          <div style={{ overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '38vh', minHeight: '300px' }}>
            {messages.map(function(msg, i) {
              const isSystem = msg.role === 'system'
              return (
                <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '80%', padding: '10px 14px',
                    borderRadius: msg.role === 'user' ? '14px 14px 0 14px' : '14px 14px 14px 0',
                    backgroundColor: isSystem ? '#f0fdf4' : msg.role === 'user' ? '#0369a1' : '#f1f5f9',
                    color: msg.role === 'user' ? 'white' : '#1e293b',
                    fontSize: isSystem ? '12px' : '13px',
                    lineHeight: '1.6', whiteSpace: 'pre-wrap',
                    border: isSystem ? '1px solid #bbf7d0' : 'none',
                    fontFamily: isSystem ? 'monospace' : 'inherit'
                  }}>
                    {msg.content}
                  </div>
                </div>
              )
            })}
            {aiLoading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{ padding: '10px 14px', borderRadius: '14px 14px 14px 0', backgroundColor: '#f1f5f9', color: '#94a3b8', fontSize: '13px' }}>入力中...</div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* 入力エリア（画面下部固定） */}
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: '12px 16px', borderTop: '2px solid #0369a1', backgroundColor: '#e0f2fe', zIndex: 100, boxShadow: '0 -4px 12px rgba(3,105,161,0.15)' }}>
          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <input type="text" value={input}
              onChange={function(e) { setInput(e.target.value) }}
              onKeyDown={function(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
              placeholder="💬 患者への質問を入力してください..."
              style={{ width: '100%', padding: '12px 16px', border: '2px solid #0369a1', borderRadius: '10px', fontSize: '14px', outline: 'none', backgroundColor: '#f0f9ff', boxSizing: 'border-box', marginBottom: '8px', boxShadow: '0 2px 8px rgba(3,105,161,0.15)' }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
              <button onClick={handleSend} disabled={aiLoading || !input.trim()}
                style={{ padding: '12px', backgroundColor: aiLoading || !input.trim() ? '#93c5fd' : '#0369a1', color: 'white', border: 'none', borderRadius: '10px', cursor: aiLoading || !input.trim() ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: 'bold' }}>
                💬 発言
              </button>
              <button onClick={function() { setShowExamModal(true) }} disabled={aiLoading || examLoading}
                style={{ padding: '12px', backgroundColor: aiLoading || examLoading ? '#86efac' : '#16a34a', color: 'white', border: 'none', borderRadius: '10px', cursor: aiLoading || examLoading ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: 'bold' }}>
                🔬 診察・検査{examLoading ? '...' : ''}
              </button>
            </div>
            <button onClick={function() { setStep('treatment') }}
              style={{ width: '100%', padding: '10px', backgroundColor: '#059669', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', boxShadow: '0 2px 8px rgba(5,150,105,0.3)' }}>
              治療方針を決定する →
            </button>
          </div>
        </div>
      </div>

      {/* 診察・検査依頼モーダル */}
      <ExamOrderModal
        open={showExamModal}
        diseaseName={caseData ? caseData.disease_name : ''}
        alreadyDoneIds={examDoneIds}
        loading={examLoading}
        onClose={function() { setShowExamModal(false) }}
        onSubmit={handleExamSubmit}
      />
    </div>
  )
}
