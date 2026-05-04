'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'

const EMOTION_ICON = {
  relieved: '😌', anxious: '😟', resistant: '😤',
  neutral: '😐', angry: '😠', convinced: '🙂'
}
const ACCEPTANCE_COLOR = {
  accepted: '#16a34a', partial: '#d97706',
  rejected: '#dc2626', negotiating: '#0369a1'
}
const ACCEPTANCE_LABEL = {
  accepted: '同意', partial: '一部同意',
  rejected: '拒否', negotiating: '交渉中'
}
const CATEGORY_LABEL = {
  diet: '食事指導', exercise: '運動指導', medication: '服薬指導',
  monitoring: 'モニタリング', lifestyle: '生活習慣',
  psychosocial: '心理・社会的支援', emergency: '緊急時対応', prevention: '予防'
}
const STRICTNESS_COLOR = {
  very_strict: '#dc2626', strict: '#d97706',
  moderate: '#0369a1', mild: '#16a34a',
  very_mild: '#10b981', none: '#94a3b8'
}
const STRICTNESS_LABEL = {
  very_strict: '非常に厳格', strict: '厳格',
  moderate: '標準', mild: '緩やか',
  very_mild: '最小限', none: 'なし'
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
    calorie: 'カロリー制限の目標', salt: '塩分制限の目標',
    eating_out: '外食の制限', night_eating: '夜食・間食の制限',
    alcohol: '飲酒制限の目標', aerobic: '有酸素運動',
    resistance: '筋力トレーニング', flexibility: 'ストレッチ・柔軟',
    lifestyle: '生活習慣', education: '服薬指導の説明',
    strategy: '服薬の工夫・戦略', tool: '服薬サポートツール',
    social: '周囲のサポート', monitoring: 'モニタリング方法',
    mental: '心理的ケア', referral: '専門機関紹介',
    weight_goal: '体重目標',
    emergency_education: '緊急時の説明',
    emergency_tool: '緊急時ツール',
    emergency_social: '家族への説明',
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
    if (!groups[cat]) {
      groups[cat] = {
        label: categoryLabels[cat] || cat,
        items: [],
        order: categoryOrder.indexOf(cat) >= 0 ? categoryOrder.indexOf(cat) : 99
      }
    }
    groups[cat].items.push(sub)
  })
  const sorted = {}
  Object.keys(groups)
    .sort(function(a, b) { return groups[a].order - groups[b].order })
    .forEach(function(k) { sorted[k] = groups[k] })
  return sorted
}

// 患者情報コンパクトカード（治療方針画面用）
function PatientInfoCard({ patient, diseaseName, collapsed, onToggle }) {
  const h = parseFloat(patient.vitals?.height) / 100
  const age = patient.age
  const idealWeight = h && age ? Math.round(h * h * 22 * 10) / 10 : null
  const actCoef = age >= 75 ? 27.5 : age >= 65 ? 30 : 32.5
  const recCal = idealWeight ? Math.round(idealWeight * actCoef / 200) * 200 : null
  const currentBmi = parseFloat(patient.vitals?.bmi || 22)
  const lenientCal = idealWeight && currentBmi >= 25
    ? Math.round((idealWeight * actCoef + 300) / 200) * 200 : null

  return (
    <div style={{ backgroundColor: 'white', borderRadius: '10px', border: '1px solid #bae6fd', marginBottom: '12px', overflow: 'hidden' }}>
      <div onClick={onToggle}
        style={{ padding: '10px 14px', backgroundColor: '#e0f2fe', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
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
          {/* 主訴 */}
          <div style={{ backgroundColor: '#fef2f2', borderRadius: '8px', padding: '8px', marginBottom: '8px' }}>
            <p style={{ fontSize: '11px', color: '#64748b', margin: '0 0 2px' }}>主訴</p>
            <p style={{ fontSize: '13px', fontWeight: 'bold', color: '#dc2626', margin: 0 }}>「{patient.chief_complaint}」</p>
          </div>
          {/* バイタル2列 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
            <div style={{ backgroundColor: '#f0f9ff', borderRadius: '8px', padding: '8px' }}>
              <p style={{ fontSize: '11px', color: '#64748b', margin: '0 0 2px' }}>バイタルサイン</p>
              <p style={{ fontSize: '13px', fontWeight: 'bold', color: '#dc2626', margin: '0 0 2px' }}>血圧：{patient.vitals.bp}</p>
              <p style={{ fontSize: '12px', color: '#1e293b', margin: '0 0 1px' }}>脈拍：{patient.vitals.hr}</p>
              <p style={{ fontSize: '12px', color: '#1e293b', margin: '0 0 1px' }}>体温：{patient.vitals.temp}　SpO2：{patient.vitals.spo2}</p>
            </div>
            <div style={{ backgroundColor: '#f0f9ff', borderRadius: '8px', padding: '8px' }}>
              <p style={{ fontSize: '11px', color: '#64748b', margin: '0 0 2px' }}>身体測定</p>
              <p style={{ fontSize: '12px', color: '#1e293b', margin: '0 0 1px' }}>身長：{patient.vitals.height}cm</p>
              <p style={{ fontSize: '12px', color: '#1e293b', margin: '0 0 1px' }}>体重：{patient.vitals.weight}kg</p>
              <p style={{ fontSize: '12px', color: '#1e293b', margin: 0 }}>
                BMI：{patient.vitals.bmi}
                {currentBmi >= 30 && <span style={{ fontSize: '10px', marginLeft: '4px', backgroundColor: '#fecaca', color: '#dc2626', padding: '0 4px', borderRadius: '4px' }}>高度肥満</span>}
                {currentBmi >= 25 && currentBmi < 30 && <span style={{ fontSize: '10px', marginLeft: '4px', backgroundColor: '#fed7aa', color: '#d97706', padding: '0 4px', borderRadius: '4px' }}>肥満</span>}
                {currentBmi < 18.5 && <span style={{ fontSize: '10px', marginLeft: '4px', backgroundColor: '#e0f2fe', color: '#0369a1', padding: '0 4px', borderRadius: '4px' }}>低体重</span>}
              </p>
            </div>
          </div>
          {/* 推奨カロリー */}
          {idealWeight && recCal && (
            <div style={{ backgroundColor: '#f0f9ff', borderRadius: '8px', padding: '8px', marginBottom: '8px', border: '1px solid #bae6fd' }}>
              <p style={{ fontSize: '11px', color: '#64748b', margin: '0 0 3px' }}>📊 標準体重・推奨摂取カロリー</p>
              <p style={{ fontSize: '12px', color: '#1e293b', margin: '0 0 1px' }}>
                標準体重（BMI 22）：<strong>{idealWeight}kg</strong>
                　活動係数：{actCoef}kcal/kg
              </p>
              <p style={{ fontSize: '12px', color: '#0369a1', fontWeight: 'bold', margin: 0 }}>
                推奨摂取カロリー：{recCal}kcal/日
              </p>
              {lenientCal && (
                <p style={{ fontSize: '11px', color: '#d97706', margin: '2px 0 0' }}>
                  ※BMI高値のため緩め目標：{lenientCal}kcal/日も有効
                </p>
              )}
            </div>
          )}
          {/* 既往・生活歴2列 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div style={{ backgroundColor: '#f8fafc', borderRadius: '8px', padding: '8px' }}>
              <p style={{ fontSize: '11px', color: '#64748b', margin: '0 0 2px' }}>既往・家族歴</p>
              <p style={{ fontSize: '11px', color: '#475569', margin: '0 0 2px' }}>{patient.past_history}</p>
              <p style={{ fontSize: '11px', color: '#475569', margin: 0 }}>{patient.family_history}</p>
            </div>
            <div style={{ backgroundColor: '#f8fafc', borderRadius: '8px', padding: '8px' }}>
              <p style={{ fontSize: '11px', color: '#64748b', margin: '0 0 2px' }}>生活歴・職業</p>
              <p style={{ fontSize: '11px', color: '#475569', margin: '0 0 2px' }}>{patient.occupation}</p>
              <p style={{ fontSize: '11px', color: '#475569', margin: 0 }}>{patient.social_history}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function CaseDetailPage({ params }) {
  const [user, setUser] = useState(null)
  const [caseData, setCaseData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [step, setStep] = useState('interview')
  const [patientCardCollapsed, setPatientCardCollapsed] = useState(false)

  const [medications, setMedications] = useState([])
  const [educationItems, setEducationItems] = useState([])
  const [devices, setDevices] = useState([])

  const [selectedMeds, setSelectedMeds] = useState([])
  const [selectedEducation, setSelectedEducation] = useState([])
  const [selectedDevices, setSelectedDevices] = useState([])
  const [selectedSubOptions, setSelectedSubOptions] = useState({})

  const [reactionLog, setReactionLog] = useState([])
  const [reactionLoading, setReactionLoading] = useState(false)
  const [persuasionInput, setPersuasionInput] = useState('')
  const [activePersuasionId, setActivePersuasionId] = useState(null)
  const [reactionPanelOpen, setReactionPanelOpen] = useState(true)

  const [activeEduModal, setActiveEduModal] = useState(null)
  const [activeSubGroupModal, setActiveSubGroupModal] = useState(null)
  const [activeDeviceModal, setActiveDeviceModal] = useState(null)

  const [scoring, setScoring] = useState(null)
  const [scoringLoading, setScoringLoading] = useState(false)

  const messagesEndRef = useRef(null)
  const reactionLogEndRef = useRef(null)
  const showDebug = process.env.NEXT_PUBLIC_SHOW_DEBUG === 'true'

  useEffect(function() {
    supabase.auth.getSession().then(function({ data: { session } }) {
      if (!session) { window.location.href = '/'; return }
      setUser(session.user)
      fetchCase(session.user.id)
    })
  }, [])

  useEffect(function() {
    if (messagesEndRef.current) messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(function() {
    if (reactionLogEndRef.current) reactionLogEndRef.current.scrollIntoView({ behavior: 'smooth' })
  }, [reactionLog])

  async function fetchCase(userId) {
    try {
      const { data, error } = await supabase
        .from('cases').select('*')
        .eq('id', params.id).eq('user_id', userId).single()
      if (error || !data) { console.error('fetch error', error); setLoading(false); return }
      setCaseData(data)
      setMessages([{
        role: 'assistant',
        content: data.patient_data.name + 'さん（' + data.patient_data.age + '歳・' +
          data.patient_data.gender + '）が来院されました。\n\n主訴：「' +
          data.patient_data.chief_complaint + '」\n\n問診・診察を始めてください。'
      }])
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
    } catch (e) {
      console.error('fetchCase error:', e)
    } finally {
      setLoading(false)
    }
  }

async function handleSend() {
    if (!input.trim() || aiLoading) return
    const userMessage = input.trim()
    setInput('')
    setMessages(function(prev) { return [...prev, { role: 'user', content: userMessage }] })

    // 紹介状確認の特別処理
    if (userMessage.includes('紹介状')) {
      setAiLoading(true)
      try {
        const res = await fetch('/api/referral-letter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ patientData: caseData.patient_data }),
        })
        const data = await res.json()
        if (data.letter) {
          setMessages(function(prev) { return [...prev, {
            role: 'system',
            content: '【前医からの紹介状】\n\n' + data.letter
          }] })
        } else {
          setMessages(function(prev) { return [...prev, { role: 'assistant', content: '紹介状の取得に失敗しました。' }] })
        }
      } catch (e) {
        setMessages(function(prev) { return [...prev, { role: 'assistant', content: 'エラーが発生しました。' }] })
      } finally {
        setAiLoading(false)
      }
      return
    }

    setAiLoading(true)
    try {
      const patient = caseData.patient_data
      const system = 'あなたは外来診療シミュレーションの患者AIです。名前：' + patient.name +
        '、年齢：' + patient.age + '歳。主訴：' + patient.chief_complaint +
        '。服薬意欲：' + patient.hidden_params.adherence_level +
        '。性格：' + (patient.hidden_params.personality_type || 'cooperative') +
        '。患者として自然な日本語で150文字以内で応答する。診察・検査を指示された場合は結果を提示する。'
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ system, prompt: userMessage, history: messages.map(function(m) { return { role: m.role === 'system' ? 'assistant' : m.role, content: m.content } }) }),
      })
      const data = await res.json()
      setMessages(function(prev) { return [...prev, { role: 'assistant', content: data.text }] })
    } catch (e) {
      setMessages(function(prev) { return [...prev, { role: 'assistant', content: 'エラーが発生しました。' }] })
    } finally {
      setAiLoading(false)
    }
  }

  async function addOrReplaceReaction(reactionKey, selectionType, item, labelText, extraContext) {
    setReactionLoading(true)
    try {
      const res = await fetch('/api/patient-reaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientData: caseData.patient_data,
          selectionType, selectedItem: item,
          previousReactions: [], persuasionMessage: null,
          extraContext: extraContext || null,
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
      setReactionPanelOpen(true)
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
        body: JSON.stringify({
          patientData: caseData.patient_data, selectionType: entry.selectionType,
          selectedItem: entry.item, previousReactions: newHistory, persuasionMessage: persuasionInput,
        }),
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
    await addOrReplaceReaction('med_' + med.id, 'medication', med,
      '💊 ' + med.drug_name_generic + '（' + med.typical_dose + '）',
      newMedCount >= 2 ? '今回で処方薬が' + newMedCount + '種類になる。' : null)
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
        const g = Object.assign({}, updated[edu.id] || {})
        delete g[groupKey]
        updated[edu.id] = g
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
    await addOrReplaceReaction(
      'sub_' + edu.id + '_' + groupKey, 'education_sub',
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

  async function handleScoring() {
    setScoringLoading(true)
    try {
      const selectedMedData = medications.filter(function(m) { return selectedMeds.includes(m.id) })
      const selectedEduData = educationItems.filter(function(e) { return selectedEducation.includes(e.id) })
      const selectedDeviceData = devices.filter(function(d) { return selectedDevices.includes(d.id) })
      const allSubOptions = []
      Object.entries(selectedSubOptions).forEach(function([eduId, groups]) {
        Object.values(groups).forEach(function(sub) { if (sub) allSubOptions.push(sub) })
      })
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseId: params.id, visitNumber: 1,
          diseaseId: caseData.disease_id,
          diseaseName: caseData.disease_name, patientData: caseData.patient_data,
          selectedMedications: selectedMedData,
          selectedEducation: selectedEduData, selectedDevices: selectedDeviceData,
          selectedSubOptions: allSubOptions, reactionLog, interviewMessages: messages,
        }),
      })
      const data = await res.json()
      if (data.error) { alert('採点エラー：' + data.error); return }
      setScoring(data.feedback)
      setStep('scoring')
    } catch (e) { alert('採点中にエラーが発生しました：' + e.message) }
    finally { setScoringLoading(false) }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0f9ff' }}>
        <p style={{ color: '#0369a1', fontSize: '18px' }}>症例を読み込み中...</p>
      </div>
    )
  }
  if (!caseData) return null
  const patient = caseData.patient_data

  // ===== 採点結果 =====
  if (step === 'scoring') {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f0f9ff', padding: '16px' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h1 style={{ fontSize: '20px', fontWeight: 'bold', color: '#0369a1' }}>Visit 1 フィードバック</h1>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={function() { window.location.href = '/cases/' + params.id + '/visit2' }}
                style={{ padding: '8px 18px', backgroundColor: '#059669', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>
                Visit 2へ進む →
              </button>
              <button onClick={function() { window.location.href = '/cases' }}
                style={{ padding: '8px 14px', backgroundColor: 'white', color: '#64748b', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>
                別の症例へ
              </button>
            </div>
          </div>
          {!scoring ? <p style={{ textAlign: 'center', color: '#64748b' }}>読み込み中...</p> : (
            <div>
              <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '24px', border: '1px solid #e2e8f0', marginBottom: '16px' }}>
                <div style={{ whiteSpace: 'pre-wrap', fontSize: '14px', color: '#1e293b', lineHeight: '1.8' }}>
                  {scoring}
                </div>
              </div>
              <div style={{ backgroundColor: '#f0f9ff', borderRadius: '10px', padding: '14px', border: '1px solid #bae6fd' }}>
                <p style={{ fontSize: '13px', color: '#0369a1', fontWeight: 'bold', margin: '0 0 6px' }}>📋 次のステップ</p>
                <p style={{ fontSize: '13px', color: '#475569', margin: 0 }}>「Visit 2へ進む」をクリックして4週後の再診をシミュレーションしてください。</p>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ===== 治療方針決定画面 =====
  if (step === 'treatment') {
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
    const devicesByCategory = devices.reduce(function(acc, dev) {
      if (!acc[dev.device_category]) acc[dev.device_category] = []
      acc[dev.device_category].push(dev)
      return acc
    }, {})
    const totalSelected = selectedMeds.length + selectedEducation.length + selectedDevices.length

    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f0f9ff', padding: '12px' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>

          {/* ヘッダー */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <h1 style={{ fontSize: '18px', fontWeight: 'bold', color: '#0369a1', margin: 0 }}>治療方針の決定</h1>
              <p style={{ color: '#64748b', fontSize: '12px', margin: 0 }}>Visit 1｜{caseData.disease_name}</p>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button onClick={function() { setStep('interview') }}
                style={{ padding: '7px 14px', backgroundColor: 'white', color: '#64748b', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', fontSize: '12px' }}>
                ← 問診に戻る
              </button>
              <button onClick={handleScoring} disabled={scoringLoading || totalSelected === 0}
                style={{ padding: '7px 18px', backgroundColor: scoringLoading || totalSelected === 0 ? '#93c5fd' : '#059669', color: 'white', border: 'none', borderRadius: '8px', cursor: scoringLoading || totalSelected === 0 ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: 'bold' }}>
                {scoringLoading ? 'フィードバック生成中...' : 'フィードバックを受ける'}
              </button>
            </div>
          </div>

          {/* 患者情報カード */}
          <PatientInfoCard
            patient={patient}
            diseaseName={caseData.disease_name}
            collapsed={patientCardCollapsed}
            onToggle={function() { setPatientCardCollapsed(!patientCardCollapsed) }}
          />

          {/* DEVモード */}
          {showDebug && (
            <div style={{ backgroundColor: '#fef9c3', borderRadius: '8px', padding: '6px 10px', marginBottom: '8px', border: '1px solid #fde047', fontSize: '11px', color: '#713f12' }}>
              <strong>【DEV】</strong> 服薬意欲:{patient.hidden_params.adherence_level} 生活改善:{patient.hidden_params.lifestyle_motivation} ストレス:{patient.hidden_params.stress_level} 忙しさ:{patient.hidden_params.work_busyness} 食習慣:{patient.hidden_params.eating_habit} 性格:{patient.hidden_params.personality_type} 薬の態度:{patient.hidden_params.medication_attitude}
            </div>
          )}

          {/* 選択サマリーバー */}
          <div style={{ backgroundColor: '#0369a1', borderRadius: '8px', padding: '8px 14px', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{ fontSize: '12px', color: 'white', margin: 0 }}>
              選択済：指導 <strong>{selectedEducation.length}</strong>件　投薬 <strong>{selectedMeds.length}</strong>件　機器 <strong>{selectedDevices.length}</strong>件
            </p>
            {totalSelected > 0 && (
              <button onClick={handleScoring} disabled={scoringLoading}
                style={{ padding: '5px 14px', backgroundColor: '#059669', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                {scoringLoading ? '生成中...' : 'フィードバックを受ける →'}
              </button>
            )}
          </div>

          {/* ① 患者の反応ログ（defaultOpen=false） */}
          <AccordionSection
            title="💬 患者の反応"
            badge={reactionLog.length > 0 ? reactionLog.length + '件' : null}
            badgeColor="#dc2626"
            defaultOpen={false}>
            {reactionLog.length === 0 && !reactionLoading && (
              <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8', fontSize: '12px' }}>
                <p style={{ margin: 0 }}>治療内容を選択すると患者の反応がここに表示されます</p>
              </div>
            )}
            {reactionLog.map(function(entry) {
              const isRejected = entry.reaction.acceptance_level === 'rejected' || entry.reaction.acceptance_level === 'negotiating'
              const isActive = activePersuasionId === entry.id
              return (
                <div key={entry.id} style={{ marginBottom: '10px', padding: '10px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                    <p style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569', margin: 0 }}>{entry.labelText}</p>
                    <p style={{ fontSize: '10px', color: '#94a3b8', margin: 0 }}>{entry.timestamp}</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', marginBottom: '5px' }}>
                    <span style={{ fontSize: '16px' }}>{EMOTION_ICON[entry.reaction.emotion] || '😐'}</span>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: '13px', color: '#1e293b', fontStyle: 'italic', lineHeight: '1.5', margin: 0 }}>「{entry.reaction.reaction}」</p>
                      <div style={{ display: 'flex', gap: '6px', marginTop: '4px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '8px', backgroundColor: ACCEPTANCE_COLOR[entry.reaction.acceptance_level] + '20', color: ACCEPTANCE_COLOR[entry.reaction.acceptance_level], fontWeight: 'bold' }}>
                          {ACCEPTANCE_LABEL[entry.reaction.acceptance_level]}
                        </span>
                        {entry.reaction.key_concern && <span style={{ fontSize: '11px', color: '#64748b' }}>→ {entry.reaction.key_concern}</span>}
                      </div>
                    </div>
                  </div>
                  {entry.persuasionHistory.length > 1 && (
                    <div style={{ marginLeft: '22px', marginBottom: '5px', padding: '6px 8px', backgroundColor: 'white', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                      {entry.persuasionHistory.slice(1).map(function(h, i) {
                        return (
                          <p key={i} style={{ fontSize: '11px', color: h.role === 'doctor' ? '#0369a1' : '#475569', margin: '1px 0', lineHeight: '1.5' }}>
                            {h.role === 'doctor' ? '研修医：' : '患者：'}{h.content}
                          </p>
                        )
                      })}
                    </div>
                  )}
                  {isRejected && (
                    <div style={{ marginLeft: '22px' }}>
                      {isActive ? (
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <input type="text" value={persuasionInput}
                            onChange={function(e) { setPersuasionInput(e.target.value) }}
                            onKeyDown={function(e) { if (e.key === 'Enter') handlePersuasion(entry.id) }}
                            placeholder="患者への説明を入力..." autoFocus
                            style={{ flex: 1, padding: '6px 10px', border: '1px solid #0369a1', borderRadius: '6px', fontSize: '12px', outline: 'none' }} />
                          <button onClick={function() { handlePersuasion(entry.id) }} disabled={reactionLoading}
                            style={{ padding: '6px 10px', backgroundColor: '#0369a1', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>
                            {reactionLoading ? '...' : '説明'}
                          </button>
                          <button onClick={function() { setActivePersuasionId(null); setPersuasionInput('') }}
                            style={{ padding: '6px 8px', backgroundColor: 'white', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>✕</button>
                        </div>
) : (
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          <button onClick={function() { setActivePersuasionId(entry.id); setPersuasionInput('') }}
                            style={{ fontSize: '12px', padding: '5px 10px', backgroundColor: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '6px', cursor: 'pointer' }}>
                            💬 患者を説得する
                          </button>
                          <button onClick={function() {
                            setReactionLog(function(prev) { return prev.filter(function(e) { return e.id !== entry.id }) })
                            if (entry.selectionType === 'medication') {
                              const medId = entry.id.replace('med_', '')
                              setSelectedMeds(function(prev) { return prev.filter(function(id) { return id !== medId }) })
                            } else if (entry.selectionType === 'education' || entry.selectionType === 'education_sub') {
                              const parts = entry.id.split('_')
                              const eduId = parts[1]
                              setSelectedEducation(function(prev) { return prev.filter(function(id) { return id !== eduId }) })
                              setSelectedSubOptions(function(prev) {
                                const updated = Object.assign({}, prev)
                                delete updated[eduId]
                                return updated
                              })
                            } else if (entry.selectionType === 'device') {
                              const devId = entry.id.replace('dev_', '')
                              setSelectedDevices(function(prev) { return prev.filter(function(id) { return id !== devId }) })
                            }
                          }}
                            style={{ fontSize: '12px', padding: '5px 10px', backgroundColor: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer' }}>
                            ✕ 選択を取りやめる
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
            {reactionLoading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px', backgroundColor: '#f8fafc', borderRadius: '8px' }}>
                <span style={{ fontSize: '16px' }}>💭</span>
                <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>患者が反応中...</p>
              </div>
            )}
            <div ref={reactionLogEndRef} />
          </AccordionSection>

          {/* ② 生活指導・患者教育（defaultOpen=false） */}
          <AccordionSection
            title="📋 生活指導・患者教育"
            badge={selectedEducation.length > 0 ? selectedEducation.length + '件選択中' : null}
            defaultOpen={false}>
            <p style={{ fontSize: '11px', color: '#64748b', marginBottom: '8px' }}>タグをクリック→指導内容を選択。▼のある項目は詳細な選択肢があります。</p>
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

          {/* ③ 投薬選択（defaultOpen=false） */}
          <AccordionSection
            title="💊 投薬選択"
            badge={selectedMeds.length > 0 ? selectedMeds.length + '剤選択中' : null}
            defaultOpen={false}>
            <p style={{ fontSize: '11px', color: '#64748b', marginBottom: '8px' }}>薬剤をクリックすると患者の反応が上の反応ログに表示されます。</p>
            {Object.entries(medsByCategory).map(function([category, meds]) {
              return (
                <div key={category} style={{ marginBottom: '10px' }}>
                  <p style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569', marginBottom: '5px' }}>{category}</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '6px' }}>
                    {meds.map(function(med) {
                      const isSelected = selectedMeds.includes(med.id)
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

          {/* ④ 医療機器（defaultOpen=false） */}
          {devices.length > 0 && (
            <AccordionSection
              title="🔧 医療機器・検査"
              badge={selectedDevices.length > 0 ? selectedDevices.length + '件選択中' : null}
              defaultOpen={false}>
              {Object.entries(devicesByCategory).map(function([category, devs]) {
                return (
                  <div key={category} style={{ marginBottom: '8px' }}>
                    <p style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569', marginBottom: '5px' }}>{category}</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                      {devs.map(function(device) {
                        const isSelected = selectedDevices.includes(device.id)
                        return (
                          <div key={device.id} onClick={function() { setActiveDeviceModal(device) }}
                            style={{ padding: '5px 12px', borderRadius: '16px', fontSize: '12px', border: isSelected ? '2px solid #0369a1' : '1px solid #e2e8f0', backgroundColor: isSelected ? '#eff6ff' : 'white', cursor: 'pointer' }}>
                            {device.device_name} {isSelected && '✓'}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </AccordionSection>
          )}

        </div>

        {/* 生活指導カテゴリ一覧モーダル */}
        {activeEduModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ backgroundColor: 'white', borderRadius: '16px 16px 0 0', padding: '20px', width: '100%', maxWidth: '560px', maxHeight: '80vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h2 style={{ fontSize: '15px', fontWeight: 'bold', color: '#0369a1', margin: 0 }}>{activeEduModal.instruction_key}</h2>
                <button onClick={function() { setActiveEduModal(null) }}
                  style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#64748b' }}>✕</button>
              </div>
              <p style={{ fontSize: '12px', color: '#475569', marginBottom: '12px' }}>指導したい項目をカテゴリから選択してください。</p>
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
              <button onClick={function() { setActiveEduModal(null) }}
                style={{ width: '100%', padding: '10px', backgroundColor: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', marginTop: '8px' }}>
                閉じる
              </button>
            </div>
          </div>
        )}

        {/* サブグループ詳細選択モーダル */}
        {activeSubGroupModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1100 }}>
            <div style={{ backgroundColor: 'white', borderRadius: '16px 16px 0 0', padding: '20px', width: '100%', maxWidth: '480px', maxHeight: '80vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <div>
                  <p style={{ fontSize: '11px', color: '#64748b', margin: 0 }}>{activeSubGroupModal.edu.instruction_key}</p>
                  <h2 style={{ fontSize: '14px', fontWeight: 'bold', color: '#0369a1', margin: 0 }}>{activeSubGroupModal.groupLabel}</h2>
                </div>
                <button onClick={function() { setActiveSubGroupModal(null) }}
                  style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#64748b' }}>✕</button>
              </div>
              <p style={{ fontSize: '11px', color: '#64748b', marginBottom: '10px' }}>1つ選択してください（選択ごとに患者反応が更新されます）</p>
              {activeSubGroupModal.items.map(function(sub) {
                const currentSubs = selectedSubOptions[activeSubGroupModal.edu.id] || {}
                const isSelected = currentSubs[activeSubGroupModal.groupKey] && currentSubs[activeSubGroupModal.groupKey].id === sub.id
                return (
                  <div key={sub.id}
                    onClick={function() { handleSubOptionSelect(activeSubGroupModal.edu, activeSubGroupModal.groupKey, sub) }}
                    style={{ marginBottom: '6px', padding: '10px', borderRadius: '8px', border: isSelected ? '2px solid #0369a1' : '1px solid #e2e8f0', backgroundColor: isSelected ? '#eff6ff' : 'white', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                        <div style={{ width: '14px', height: '14px', borderRadius: '50%', border: isSelected ? '4px solid #0369a1' : '2px solid #cbd5e1', flexShrink: 0 }} />
                        <p style={{ fontSize: '12px', fontWeight: isSelected ? 'bold' : 'normal', color: '#1e293b', margin: 0 }}>{sub.label}</p>
                      </div>
                      {sub.category === 'calorie' && caseData && (function() {
                        const calc = calcRecommendedCalories(caseData.patient_data)
                        if (!calc) return null
                        const calNum = parseInt(sub.id.replace('cal_', '')) || 0
                        if (calNum === 0) return null
                        const isRecommended = calNum === calc.recCal
                        const isLenient = calc.lenientCal && calNum === calc.lenientCal
                        const diff = calNum - calc.recCal
                        return (
                          <div style={{ marginLeft: '20px', marginTop: '3px' }}>
                            {isRecommended && (
                              <span style={{ fontSize: '11px', backgroundColor: '#dcfce7', color: '#16a34a', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                                ✓ この患者の推奨値（{calc.idealWeight}kg × {calc.actCoef}kcal）
                              </span>
                            )}
                            {isLenient && !isRecommended && (
                              <span style={{ fontSize: '11px', backgroundColor: '#fef9c3', color: '#713f12', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                                ◎ 緩め目標（BMI{calc.currentBmi}向け推奨値+300kcal）
                              </span>
                            )}
                            {!isRecommended && !isLenient && diff !== 0 && (
                              <span style={{ fontSize: '11px', color: diff > 200 ? '#16a34a' : diff < -200 ? '#dc2626' : '#d97706', backgroundColor: diff > 200 ? '#dcfce7' : diff < -200 ? '#fef2f2' : '#fef9c3', padding: '2px 6px', borderRadius: '4px' }}>
                                推奨値（{calc.recCal}kcal）より{Math.abs(diff)}kcal{diff > 0 ? '多い' : '少ない'}
                              </span>
                            )}
                          </div>
                        )
                      })()}
                      {sub.description && <p style={{ fontSize: '10px', color: '#64748b', marginLeft: '20px', margin: '0 0 0 20px' }}>{sub.description}</p>}
                    </div>
                    <span style={{ fontSize: '10px', color: STRICTNESS_COLOR[sub.strictness] || '#64748b', fontWeight: 'bold', marginLeft: '6px', whiteSpace: 'nowrap' }}>
                      {STRICTNESS_LABEL[sub.strictness] || sub.strictness}
                    </span>
                  </div>
                )
              })}
              <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                <button onClick={function() { setActiveSubGroupModal(null); setActiveEduModal(activeSubGroupModal.edu) }}
                  style={{ flex: 1, padding: '10px', backgroundColor: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '12px' }}>
                  ← 戻る
                </button>
                <button onClick={function() { setActiveSubGroupModal(null) }}
                  style={{ flex: 1, padding: '10px', backgroundColor: '#0369a1', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                  確定
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 医療機器モーダル */}
        {activeDeviceModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ backgroundColor: 'white', borderRadius: '16px 16px 0 0', padding: '20px', width: '100%', maxWidth: '500px', maxHeight: '80vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h2 style={{ fontSize: '15px', fontWeight: 'bold', color: '#0369a1', margin: 0 }}>{activeDeviceModal.device_name}</h2>
                <button onClick={function() { setActiveDeviceModal(null) }}
                  style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#64748b' }}>✕</button>
              </div>
              <div style={{ fontSize: '12px', color: '#475569', marginBottom: '10px' }}>
                <p style={{ margin: '0 0 3px' }}><strong>適応：</strong>{activeDeviceModal.indication}</p>
                <p style={{ margin: '0 0 3px' }}><strong>使用方法：</strong>{activeDeviceModal.how_to_use}</p>
                <p style={{ margin: 0 }}><strong>保険：</strong>{activeDeviceModal.insurance_coverage}</p>
              </div>
              {activeDeviceModal.key_benefits && activeDeviceModal.key_benefits.length > 0 && (
                <div style={{ marginBottom: '10px', padding: '8px', backgroundColor: '#f0fdf4', borderRadius: '8px' }}>
                  <p style={{ fontSize: '11px', fontWeight: 'bold', color: '#16a34a', margin: '0 0 3px' }}>導入のメリット：</p>
                  {activeDeviceModal.key_benefits.map(function(b, i) { return <p key={i} style={{ fontSize: '11px', color: '#15803d', margin: '1px 0' }}>✓ {b}</p> })}
                </div>
              )}
              {activeDeviceModal.common_objections && activeDeviceModal.common_objections.length > 0 && (
                <div style={{ marginBottom: '10px', padding: '8px', backgroundColor: '#fef2f2', borderRadius: '8px' }}>
                  <p style={{ fontSize: '11px', fontWeight: 'bold', color: '#dc2626', margin: '0 0 3px' }}>患者からよくある反応：</p>
                  {activeDeviceModal.common_objections.map(function(o, i) { return <p key={i} style={{ fontSize: '11px', color: '#991b1b', margin: '1px 0' }}>「{o}」</p> })}
                </div>
              )}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={function() { confirmDeviceSelect(activeDeviceModal) }}
                  style={{ flex: 1, padding: '11px', backgroundColor: selectedDevices.includes(activeDeviceModal.id) ? '#dc2626' : '#0369a1', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>
                  {selectedDevices.includes(activeDeviceModal.id) ? '選択を解除する' : '導入を決定する'}
                </button>
                <button onClick={function() { setActiveDeviceModal(null) }}
                  style={{ padding: '11px 14px', backgroundColor: 'white', color: '#64748b', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', fontSize: '12px' }}>
                  閉じる
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }


  // ===== 問診・診察画面 =====
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f9ff', padding: '12px' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: 'bold', color: '#0369a1', margin: 0 }}>Visit 1｜初診</h1>
            <p style={{ color: '#64748b', fontSize: '12px', margin: 0 }}>{caseData.disease_name}</p>
          </div>
          <button onClick={function() { window.location.href = '/cases' }}
            style={{ padding: '6px 14px', backgroundColor: 'white', color: '#64748b', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', fontSize: '12px' }}>
            症例選択へ
          </button>
        </div>

        {/* 患者情報カード（折りたたみ式） */}
        <PatientInfoCard
          patient={patient}
          diseaseName={caseData.disease_name}
          collapsed={patientCardCollapsed}
          onToggle={function() { setPatientCardCollapsed(!patientCardCollapsed) }}
        />

        {/* 対話エリア（1列・全幅） */}
        <div style={{ backgroundColor: 'white', borderRadius: '10px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', height: '65vh', minHeight: '400px' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc', borderRadius: '10px 10px 0 0' }}>
            <p style={{ fontSize: '13px', fontWeight: 'bold', color: '#0369a1', margin: 0 }}>患者との対話</p>
            <p style={{ fontSize: '10px', color: '#94a3b8', margin: 0 }}>
  問診・診察・検査指示を入力してください（Enterで送信）
  {(function() {
    const c = (caseData.patient_data.chief_complaint || '') + (caseData.patient_data.history || '')
    const hasReferral = c.includes('紹介') || c.includes('かかりつけ') || c.includes('前医') || c.includes('閉院') || c.includes('転医') || c.includes('引き継ぎ')
    return hasReferral ? '。「紹介状」と入力すると前医の紹介状を表示します' : ''
  })()}
</p>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {messages.map(function(msg, i) {
              return (
                <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div style={{ maxWidth: '75%', padding: '10px 14px', borderRadius: msg.role === 'user' ? '14px 14px 0 14px' : '14px 14px 14px 0', backgroundColor: msg.role === 'user' ? '#0369a1' : '#f1f5f9', color: msg.role === 'user' ? 'white' : '#1e293b', fontSize: '13px', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
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
          <div style={{ padding: '12px', borderTop: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <input type="text" value={input}
                onChange={function(e) { setInput(e.target.value) }}
                onKeyDown={function(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                placeholder="患者への質問や診察・検査の指示を入力..."
                style={{ flex: 1, padding: '10px 14px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', outline: 'none' }} />
              <button onClick={handleSend} disabled={aiLoading || !input.trim()}
                style={{ padding: '10px 20px', backgroundColor: aiLoading || !input.trim() ? '#93c5fd' : '#0369a1', color: 'white', border: 'none', borderRadius: '8px', cursor: aiLoading || !input.trim() ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: 'bold' }}>
                送信
              </button>
            </div>
            <button onClick={function() { setStep('treatment') }}
              style={{ width: '100%', padding: '10px', backgroundColor: '#059669', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}>
              治療方針を決定する →
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
