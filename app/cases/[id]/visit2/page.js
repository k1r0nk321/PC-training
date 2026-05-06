'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../../lib/supabase'

const EMOTION_ICON = { relieved: '😌', anxious: '😟', resistant: '😤', neutral: '😐', angry: '😠', convinced: '🙂' }
const ACCEPTANCE_COLOR = { accepted: '#16a34a', partial: '#d97706', rejected: '#dc2626', negotiating: '#0369a1' }
const ACCEPTANCE_LABEL = { accepted: '同意', partial: '一部同意', rejected: '拒否', negotiating: '交渉中' }
const CATEGORY_LABEL = {
  diet: '食事指導', exercise: '運動指導', medication: '服薬指導',
  monitoring: 'モニタリング', lifestyle: '生活習慣',
  psychosocial: '心理・社会的支援', emergency: '緊急時対応', prevention: '予防'
}
const STRICTNESS_COLOR = { very_strict: '#dc2626', strict: '#d97706', moderate: '#0369a1', mild: '#16a34a', very_mild: '#10b981', none: '#94a3b8' }
const STRICTNESS_LABEL = { very_strict: '非常に厳格', strict: '厳格', moderate: '標準', mild: '緩やか', very_mild: '最小限', none: 'なし' }

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

function PatientInfoCard({ patient, diseaseName, visit2Vitals, visit1Data, collapsed, onToggle }) {
  const bpChange = visit2Vitals?.bp_change
  const weightChange = visit2Vitals?.weight_change
  const v1Meds = visit1Data?.selectedMedications || []
  const v1Edu = visit1Data?.selectedEducation || []
  const v1Subs = visit1Data?.selectedSubOptions || []
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
              <p style={{ fontSize: '12px', color: '#1e293b' }}>体重：{visit2Vitals ? visit2Vitals.weight : patient.vitals.weight}kg　BMI：{visit2Vitals ? visit2Vitals.bmi : patient.vitals.bmi}</p>
              {weightChange !== undefined && (
                <p style={{ fontSize: '11px', color: weightChange < 0 ? '#16a34a' : '#64748b' }}>
                  {weightChange < 0 ? '↓' : '→'} {Math.abs(weightChange)}kg {weightChange < 0 ? '減少' : '変化なし'}
                </p>
              )}
            </div>
            <div style={{ backgroundColor: '#f8fafc', borderRadius: '8px', padding: '8px' }}>
              <p style={{ fontSize: '11px', color: '#64748b', marginBottom: '2px' }}>初診時バイタル</p>
              <p style={{ fontSize: '12px', color: '#475569' }}>血圧：{patient.vitals.bp}</p>
              <p style={{ fontSize: '12px', color: '#475569' }}>体重：{patient.vitals.weight}kg　BMI：{patient.vitals.bmi}</p>
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
        </div>
      )}
    </div>
  )
}

export default function Visit2Page({ params }) {
  const [caseData, setCaseData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [visit2Data, setVisit2Data] = useState(null)
  const [step, setStep] = useState('interview') // interview | treatment | feedback
  const [patientCardCollapsed, setPatientCardCollapsed] = useState(false)

  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [labsRevealed, setLabsRevealed] = useState(false)

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

  const [activeEduModal, setActiveEduModal] = useState(null)
  const [activeSubGroupModal, setActiveSubGroupModal] = useState(null)
  const [activeDeviceModal, setActiveDeviceModal] = useState(null)

  const [feedback, setFeedback] = useState(null)
  const [feedbackLoading, setFeedbackLoading] = useState(false)

  const messagesEndRef = useRef(null)
  const showDebug = process.env.NEXT_PUBLIC_SHOW_DEBUG === 'true'

  useEffect(function() {
    supabase.auth.getSession().then(function({ data: { session } }) {
      if (!session) { window.location.href = '/'; return }
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
      if (v1.selectedMedications) setSelectedMeds(v1.selectedMedications.map(function(m) { return m.id }))

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

    } catch (e) {
      console.error('fetchCase error:', e)
    } finally {
      setLoading(false)
      setGenerating(false)
    }
  }

  async function handleSend() {
    if (!input.trim() || aiLoading) return
    const userMessage = input.trim()
    setInput('')

    // 検査結果確認の特別処理
    if (userMessage.includes('検査') && visit2Data?.visit2Labs && !labsRevealed) {
      setLabsRevealed(true)
      const labs = visit2Data.visit2Labs
      const labText = `【血液検査結果（4週後）】\n\nNa ${labs.na} mEq/L　K ${labs.k} mEq/L\nCr ${labs.cr} mg/dL　BUN ${labs.bun} mg/dL　eGFR ${labs.egfr} mL/min\nLDL ${labs.ldl} mg/dL　HDL ${labs.hdl} mg/dL　TG ${labs.tg} mg/dL\nHbA1c ${labs.hba1c}%　UA ${labs.ua} mg/dL`
      setMessages(function(prev) { return [...prev, { role: 'user', content: userMessage }, { role: 'system', content: labText }] })
      return
    }

    setMessages(function(prev) { return [...prev, { role: 'user', content: userMessage }] })
    setAiLoading(true)
    try {
      const patient = caseData.patient_data
      const v2 = visit2Data
      const system = 'あなたは外来診療シミュレーションの患者AIです。4週間前に' + caseData.disease_name + 'で初診し治療を開始した患者として応答してください。' +
        '名前：' + patient.name + '（' + patient.age + '歳・' + patient.gender + '）。性格：' + (patient.hidden_params.personality_type || 'cooperative') + '。' +
        '服薬意欲：' + patient.hidden_params.adherence_level + '。' +
        '現在の血圧：' + (v2?.visit2Vitals?.bp || patient.vitals.bp) + '。' +
        '体重：' + (v2?.visit2Vitals?.weight || patient.vitals.weight) + 'kg。' +
        '患者として自然な日本語で150文字以内で応答する。診察・検査を指示された場合は結果を提示する。'
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
          patientData: caseData.patient_data, selectionType, selectedItem: item,
          previousReactions: [], persuasionMessage: null, extraContext: extraContext || null,
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
        body: JSON.stringify({ patientData: caseData.patient_data, selectionType: entry.selectionType, selectedItem: entry.item, previousReactions: newHistory, persuasionMessage: persuasionInput }),
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
      const allSubOptions = []
      Object.entries(selectedSubOptions).forEach(function([eduId, groups]) {
        Object.values(groups).forEach(function(sub) { if (sub) allSubOptions.push(sub) })
      })
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseId: params.id, visitNumber: 2,
          diseaseId: caseData.disease_id, diseaseName: caseData.disease_name,
          patientData: caseData.patient_data,
          selectedMedications: selectedMedData,
          selectedEducation: selectedEduData,
          selectedSubOptions: allSubOptions,
          selectedDevices: selectedDeviceData,
          reactionLog, interviewMessages: messages,
          visit2Vitals: visit2Data?.visit2Vitals,
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
              onClick={function() { window.location.href = '/cases/' + params.id + '/visit3' }}
              style={{ flex: 1, padding: '14px', backgroundColor: '#0369a1', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '15px', fontWeight: 'bold' }}>
              Visit 3（8週後）へ進む →
            </button>
            <button
              onClick={function() { window.location.href = '/cases' }}
              style={{ padding: '14px 20px', backgroundColor: 'white', color: '#64748b', border: '1px solid #cbd5e1', borderRadius: '10px', cursor: 'pointer', fontSize: '14px' }}>
              症例選択へ
            </button>
          </div>
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
              
            </div>
          </div>

          <PatientInfoCard
            patient={patient}
            diseaseName={caseData.disease_name}
            visit2Vitals={visit2Data.visit2Vitals}
            visit1Data={caseData.visit1_data}
            collapsed={patientCardCollapsed}
            onToggle={function() { setPatientCardCollapsed(!patientCardCollapsed) }}
          />

          {showDebug && (
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
        </div>      </div>
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
          <button onClick={function() { window.location.href = '/cases' }}
            style={{ padding: '6px 14px', backgroundColor: 'white', color: '#64748b', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', fontSize: '12px' }}>
            症例選択へ
          </button>
        </div>

        <PatientInfoCard
          patient={patient}
          diseaseName={caseData.disease_name}
          visit2Vitals={visit2Data.visit2Vitals}
          visit1Data={caseData.visit1_data}
          collapsed={patientCardCollapsed}
          onToggle={function() { setPatientCardCollapsed(!patientCardCollapsed) }}
        />

        {!labsRevealed && (
          <div style={{ backgroundColor: '#fef9c3', borderRadius: '8px', padding: '8px 14px', marginBottom: '10px', border: '1px solid #fde047', fontSize: '12px', color: '#713f12' }}>
            💡 「検査結果を確認する」と入力すると血液検査結果が表示されます
          </div>
        )}

        <div style={{ backgroundColor: 'white', borderRadius: '10px', border: '1px solid #e2e8f0', marginBottom: '140px' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc', borderRadius: '10px 10px 0 0' }}>
            <p style={{ fontSize: '13px', fontWeight: 'bold', color: '#0369a1', margin: 0 }}>患者との対話（Visit 2）</p>
            <p style={{ fontSize: '10px', color: '#94a3b8', margin: 0 }}>経過確認・診察・検査指示を入力してください</p>
          </div>
          <div style={{ overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: 'calc(100vh - 320px)', minHeight: '300px' }}>
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
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <input type="text" value={input}
                onChange={function(e) { setInput(e.target.value) }}
                onKeyDown={function(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                placeholder="💬 経過確認・診察・検査指示を入力してください..."
                style={{ flex: 1, padding: '12px 16px', border: '2px solid #0369a1', borderRadius: '10px', fontSize: '14px', outline: 'none', backgroundColor: '#f0f9ff', boxShadow: '0 2px 8px rgba(3,105,161,0.15)' }} />
              <button onClick={handleSend} disabled={aiLoading || !input.trim()}
                style={{ padding: '12px 24px', backgroundColor: aiLoading || !input.trim() ? '#93c5fd' : '#0369a1', color: 'white', border: 'none', borderRadius: '10px', cursor: aiLoading || !input.trim() ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: 'bold', boxShadow: aiLoading || !input.trim() ? 'none' : '0 2px 8px rgba(3,105,161,0.3)' }}>
                送信
              </button>
            </div>
            <button onClick={function() { setStep('treatment') }}
              style={{ width: '100%', padding: '10px', backgroundColor: '#059669', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', boxShadow: '0 2px 8px rgba(5,150,105,0.3)' }}>
              治療方針を決定する →
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
