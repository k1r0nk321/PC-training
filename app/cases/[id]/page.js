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

// サブ選択肢をカテゴリごとに分割する
function groupSubOptions(subOptions) {
  const groups = {}
  const categoryLabels = {
    calorie: 'カロリー制限', salt: '塩分制限', eating_out: '外食制限',
    night_eating: '夜食・間食', alcohol: '飲酒制限', diet_type: '食事スタイル',
    aerobic: '有酸素運動', resistance: '筋力トレーニング',
    flexibility: 'ストレッチ', lifestyle: '日常活動',
    education: '服薬説明', strategy: '服薬戦略', tool: '服薬ツール', social: '社会的支援',
    monitoring: 'モニタリング方法',
    mental: '心理的ケア', referral: '専門機関紹介',
    weight_goal: '体重目標',
    none: 'その他',
  }
  if (!subOptions) return groups
  subOptions.forEach(function(sub) {
    const cat = sub.category || 'none'
    if (!groups[cat]) groups[cat] = { label: categoryLabels[cat] || cat, items: [] }
    groups[cat].items.push(sub)
  })
  return groups
}

export default function CaseDetailPage({ params }) {
  const [user, setUser] = useState(null)
  const [caseData, setCaseData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [step, setStep] = useState('interview')

  const [medications, setMedications] = useState([])
  const [educationItems, setEducationItems] = useState([])
  const [devices, setDevices] = useState([])

  const [selectedMeds, setSelectedMeds] = useState([])
  const [selectedEducation, setSelectedEducation] = useState([])
  const [selectedDevices, setSelectedDevices] = useState([])
  // サブ選択肢：eduId → { groupCategory: selectedSubOption }（グループ内単一選択）
  const [selectedSubOptions, setSelectedSubOptions] = useState({})

  // 患者反応ログ：reactionKey → logEntry
  const [reactionLog, setReactionLog] = useState([])
  const [reactionLoading, setReactionLoading] = useState(false)
  const [persuasionInput, setPersuasionInput] = useState('')
  const [activePersuasionId, setActivePersuasionId] = useState(null)

  // モーダル
  const [activeEduModal, setActiveEduModal] = useState(null)
  const [activeSubGroupModal, setActiveSubGroupModal] = useState(null) // { edu, groupKey, groupLabel, items }
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
        body: JSON.stringify({ system, prompt: userMessage, history: messages.map(function(m) { return { role: m.role, content: m.content } }) }),
      })
      const data = await res.json()
      setMessages(function(prev) { return [...prev, { role: 'assistant', content: data.text }] })
    } catch (e) {
      setMessages(function(prev) { return [...prev, { role: 'assistant', content: 'エラーが発生しました。' }] })
    } finally {
      setAiLoading(false)
    }
  }

  // 患者反応を取得して共通ログに追加（同じkeyの古いエントリを置換）
  async function addOrReplaceReaction(reactionKey, selectionType, item, labelText, extraContext) {
    setReactionLoading(true)
    try {
      const res = await fetch('/api/patient-reaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientData: caseData.patient_data,
          selectionType,
          selectedItem: item,
          previousReactions: [],
          persuasionMessage: null,
          extraContext: extraContext || null,
        }),
      })
      const data = await res.json()
      const logEntry = {
        id: reactionKey,
        selectionType,
        item,
        labelText,
        reaction: data,
        persuasionHistory: [{ role: 'patient', content: data.reaction }],
        timestamp: new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
      }
      // 同じkeyは置換、なければ追加
      setReactionLog(function(prev) {
        const exists = prev.find(function(e) { return e.id === reactionKey })
        if (exists) {
          return prev.map(function(e) { return e.id === reactionKey ? logEntry : e })
        }
        return [...prev, logEntry]
      })
    } catch (e) {
      console.error('reaction error:', e)
    } finally {
      setReactionLoading(false)
    }
  }

  // 説得メッセージ
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
          patientData: caseData.patient_data,
          selectionType: entry.selectionType,
          selectedItem: entry.item,
          previousReactions: newHistory,
          persuasionMessage: persuasionInput,
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
    } catch (e) {
      console.error('persuasion error:', e)
    } finally {
      setReactionLoading(false)
    }
  }

  // 投薬選択（薬剤数に応じて反応が変化）
  async function handleMedSelect(med) {
    const isSelected = selectedMeds.includes(med.id)
    if (isSelected) {
      setSelectedMeds(function(prev) { return prev.filter(function(id) { return id !== med.id }) })
      setReactionLog(function(prev) { return prev.filter(function(e) { return e.id !== 'med_' + med.id }) })
      return
    }
    const newMedCount = selectedMeds.length + 1
    setSelectedMeds(function(prev) { return [...prev, med.id] })
    const extraContext = newMedCount >= 2
      ? '今回で処方薬が' + newMedCount + '種類になる。薬剤数が増えることへの反応も含める。'
      : null
    await addOrReplaceReaction(
      'med_' + med.id,
      'medication',
      med,
      '💊 ' + med.drug_name_generic + '（' + med.typical_dose + '）',
      extraContext
    )
  }

  // 生活指導カテゴリタグをクリック→グループ選択モーダルへ
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

  // サブグループモーダルを開く（カテゴリ内の詳細選択）
  function openSubGroupModal(edu, groupKey, groupLabel, items) {
    setActiveEduModal(null)
    setActiveSubGroupModal({ edu, groupKey, groupLabel, items })
  }

  // サブ選択肢を単一選択（同グループ内は1つのみ）
  async function handleSubOptionSelect(edu, groupKey, subOption) {
    const currentSubs = selectedSubOptions[edu.id] || {}
    const prevSelected = currentSubs[groupKey]
    const isSameItem = prevSelected && prevSelected.id === subOption.id

    // 同じ項目をクリック→解除
    if (isSameItem) {
      setSelectedSubOptions(function(prev) {
        const updated = Object.assign({}, prev)
        const groupUpdated = Object.assign({}, updated[edu.id] || {})
        delete groupUpdated[groupKey]
        updated[edu.id] = groupUpdated
        return updated
      })
      setReactionLog(function(prev) {
        return prev.filter(function(e) { return e.id !== 'sub_' + edu.id + '_' + groupKey })
      })
      return
    }

    // 新規選択（同グループの古い選択を置換）
    setSelectedSubOptions(function(prev) {
      const updated = Object.assign({}, prev)
      const groupUpdated = Object.assign({}, updated[edu.id] || {})
      groupUpdated[groupKey] = subOption
      updated[edu.id] = groupUpdated
      return updated
    })
    setSelectedEducation(function(prev) {
      return prev.includes(edu.id) ? prev : [...prev, edu.id]
    })

    // 反応ログ：同グループの古い反応を置換（addOrReplaceReactionのkey設計）
    const reactionKey = 'sub_' + edu.id + '_' + groupKey
    await addOrReplaceReaction(
      reactionKey,
      'education_sub',
      Object.assign({}, subOption, { eduKey: edu.instruction_key }),
      '📋 ' + edu.instruction_key + '：' + subOption.label,
      null
    )
  }

  // 医療機器
  async function handleDeviceSelect(device) {
    setActiveDeviceModal(device)
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

  // 採点
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
      const res = await fetch('/api/scoring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseId: params.id,
          diseaseId: caseData.disease_id,
          diseaseName: caseData.disease_name,
          patientData: caseData.patient_data,
          scenarioData: caseData.scenario_data,
          selectedMedications: selectedMedData,
          selectedEducation: selectedEduData,
          selectedDevices: selectedDeviceData,
          selectedSubOptions: allSubOptions,
          reactionLog,
          interviewMessages: messages,
        }),
      })
      const data = await res.json()
      if (data.error) { alert('採点エラー：' + data.error); return }
      setScoring(data)
      setStep('scoring')
    } catch (e) {
      alert('採点中にエラーが発生しました：' + e.message)
    } finally {
      setScoringLoading(false)
    }
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
      <div style={{ minHeight: '100vh', backgroundColor: '#f0f9ff', padding: '24px' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <h1 style={{ fontSize: '22px', fontWeight: 'bold', color: '#0369a1' }}>採点結果</h1>
            <button onClick={function() { window.location.href = '/cases' }}
              style={{ padding: '8px 16px', backgroundColor: '#0369a1', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>
              別の症例へ
            </button>
          </div>
          {!scoring ? <p style={{ textAlign: 'center', color: '#64748b' }}>読み込み中...</p> : (
            <div>
              <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '32px', border: '1px solid #e2e8f0', marginBottom: '16px', textAlign: 'center' }}>
                <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '8px' }}>総合スコア</p>
                <p style={{ fontSize: '64px', fontWeight: 'bold', color: scoring.totalScore >= 80 ? '#16a34a' : scoring.totalScore >= 60 ? '#d97706' : '#dc2626' }}>{scoring.totalScore}</p>
                <p style={{ fontSize: '16px', color: '#64748b' }}>/ 100点</p>
                <p style={{ fontSize: '16px', fontWeight: 'bold', color: '#1e293b', marginTop: '12px' }}>{scoring.overallComment}</p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                {scoring.details && scoring.details.map(function(detail, i) {
                  return (
                    <div key={i} style={{ backgroundColor: 'white', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <p style={{ fontSize: '13px', fontWeight: 'bold', color: '#1e293b' }}>{detail.category}</p>
                        <p style={{ fontSize: '20px', fontWeight: 'bold', color: '#0369a1' }}>{detail.score}<span style={{ fontSize: '12px', color: '#64748b' }}>/{detail.maxScore}</span></p>
                      </div>
                      <p style={{ fontSize: '12px', color: '#64748b', lineHeight: '1.6' }}>{detail.comment}</p>
                    </div>
                  )
                })}
              </div>
              {scoring.guidelineReferences && scoring.guidelineReferences.length > 0 && (
                <div style={{ backgroundColor: '#f0f9ff', borderRadius: '12px', padding: '20px', border: '1px solid #bae6fd' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: 'bold', color: '#0369a1', marginBottom: '12px' }}>📚 ガイドライン参照</h3>
                  {scoring.guidelineReferences.map(function(ref, i) {
                    return (
                      <div key={i} style={{ marginBottom: '8px', paddingBottom: '8px', borderBottom: i < scoring.guidelineReferences.length - 1 ? '1px solid #e0f2fe' : 'none' }}>
                        <p style={{ fontSize: '12px', fontWeight: 'bold', color: '#0369a1' }}>{ref.guideline}　{ref.page}</p>
                        <p style={{ fontSize: '12px', color: '#475569', lineHeight: '1.6' }}>{ref.content}</p>
                      </div>
                    )
                  })}
                </div>
              )}
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
      <div style={{ minHeight: '100vh', backgroundColor: '#f0f9ff', padding: '16px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div>
              <h1 style={{ fontSize: '20px', fontWeight: 'bold', color: '#0369a1' }}>治療方針の決定</h1>
              <p style={{ color: '#64748b', fontSize: '13px' }}>{caseData.disease_name}　{patient.name}さん（{patient.age}歳・{patient.gender}　BMI {patient.vitals.bmi}）</p>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={function() { setStep('interview') }}
                style={{ padding: '6px 16px', backgroundColor: 'white', color: '#64748b', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>
                ← 問診に戻る
              </button>
              <button onClick={handleScoring} disabled={scoringLoading || totalSelected === 0}
                style={{ padding: '8px 24px', backgroundColor: scoringLoading || totalSelected === 0 ? '#93c5fd' : '#059669', color: 'white', border: 'none', borderRadius: '8px', cursor: scoringLoading || totalSelected === 0 ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: 'bold' }}>
                {scoringLoading ? '採点中...' : '採点する'}
              </button>
            </div>
          </div>

          {showDebug && (
            <div style={{ backgroundColor: '#fef9c3', borderRadius: '8px', padding: '8px 12px', marginBottom: '10px', border: '1px solid #fde047', fontSize: '11px', color: '#713f12' }}>
              <strong>【DEV】</strong>
              服薬意欲:{patient.hidden_params.adherence_level} ／
              生活改善:{patient.hidden_params.lifestyle_motivation} ／
              ストレス:{patient.hidden_params.stress_level} ／
              忙しさ:{patient.hidden_params.work_busyness} ／
              食習慣:{patient.hidden_params.eating_habit} ／
              性格:{patient.hidden_params.personality_type} ／
              薬の態度:{patient.hidden_params.medication_attitude}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '16px', alignItems: 'start' }}>

            {/* 左：治療選択パネル */}
            <div>

              {/* ① 生活指導・患者教育 */}
              <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0', marginBottom: '12px' }}>
                <h2 style={{ fontSize: '15px', fontWeight: 'bold', color: '#1e293b', marginBottom: '4px', paddingBottom: '8px', borderBottom: '1px solid #e2e8f0' }}>
                  📋 生活指導・患者教育
                </h2>
                <p style={{ fontSize: '11px', color: '#64748b', marginBottom: '10px' }}>
                  タグをクリック→指導内容を選択。▼マークのある項目は詳細なサブ選択肢があります。
                </p>
                {Object.entries(eduByCategory).map(function([category, items]) {
                  return (
                    <div key={category} style={{ marginBottom: '10px' }}>
                      <p style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '6px' }}>{CATEGORY_LABEL[category] || category}</p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {items.map(function(item) {
                          const hasSubOptions = item.sub_options && Array.isArray(item.sub_options) && item.sub_options.length > 0
                          const currentSubs = selectedSubOptions[item.id] || {}
                          const subCount = Object.values(currentSubs).filter(Boolean).length
                          const isSelected = selectedEducation.includes(item.id)
                          return (
                            <div key={item.id}
                              onClick={function() { handleEduCategorySelect(item) }}
                              style={{
                                padding: '5px 11px', borderRadius: '20px', fontSize: '12px',
                                border: isSelected ? '2px solid #0369a1' : '1px solid #e2e8f0',
                                backgroundColor: isSelected ? '#eff6ff' : 'white',
                                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
                              }}>
                              <span style={{ color: isSelected ? '#0369a1' : '#374151' }}>{item.instruction_key}</span>
                              {hasSubOptions && <span style={{ fontSize: '10px', color: '#0369a1' }}>▼</span>}
                              {subCount > 0 && (
                                <span style={{ fontSize: '10px', backgroundColor: '#0369a1', color: 'white', borderRadius: '8px', padding: '0 5px' }}>
                                  {subCount}
                                </span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* ② 投薬 */}
              <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0', marginBottom: '12px' }}>
                <h2 style={{ fontSize: '15px', fontWeight: 'bold', color: '#1e293b', marginBottom: '4px', paddingBottom: '8px', borderBottom: '1px solid #e2e8f0' }}>
                  💊 投薬選択
                </h2>
                <p style={{ fontSize: '11px', color: '#64748b', marginBottom: '10px' }}>
                  薬剤をクリックすると右パネルに患者の反応が表示されます。薬剤数が増えると患者の反応が変化します。
                </p>
                {Object.entries(medsByCategory).map(function([category, meds]) {
                  return (
                    <div key={category} style={{ marginBottom: '10px' }}>
                      <p style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '6px' }}>{category}</p>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '6px' }}>
                        {meds.map(function(med) {
                          const isSelected = selectedMeds.includes(med.id)
                          return (
                            <div key={med.id} onClick={function() { handleMedSelect(med) }}
                              style={{ padding: '10px', borderRadius: '8px', border: isSelected ? '2px solid #0369a1' : '1px solid #e2e8f0', backgroundColor: isSelected ? '#eff6ff' : 'white', cursor: 'pointer' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                  <p style={{ fontSize: '13px', fontWeight: 'bold', color: '#1e293b' }}>{med.drug_name_generic}</p>
                                  <p style={{ fontSize: '11px', color: '#64748b' }}>{med.typical_dose}</p>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                                  {med.first_line && <span style={{ fontSize: '10px', backgroundColor: '#dcfce7', color: '#16a34a', padding: '1px 5px', borderRadius: '4px', fontWeight: 'bold' }}>第一選択</span>}
                                  {isSelected && <span style={{ fontSize: '14px' }}>✓</span>}
                                </div>
                              </div>
                              {med.indication_notes && <p style={{ fontSize: '10px', color: '#0369a1', marginTop: '3px' }}>{med.indication_notes.substring(0, 35)}...</p>}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* ③ 医療機器 */}
              {devices.length > 0 && (
                <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0', marginBottom: '12px' }}>
                  <h2 style={{ fontSize: '15px', fontWeight: 'bold', color: '#1e293b', marginBottom: '4px', paddingBottom: '8px', borderBottom: '1px solid #e2e8f0' }}>
                    🔧 医療機器・検査
                  </h2>
                  <p style={{ fontSize: '11px', color: '#64748b', marginBottom: '10px' }}>クリックすると詳細と患者の反応が確認できます。</p>
                  {Object.entries(devicesByCategory).map(function([category, devs]) {
                    return (
                      <div key={category} style={{ marginBottom: '10px' }}>
                        <p style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '6px' }}>{category}</p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {devs.map(function(device) {
                            const isSelected = selectedDevices.includes(device.id)
                            const barrierColor = { very_high: '#dc2626', high: '#d97706', moderate: '#0369a1', low: '#16a34a' }
                            return (
                              <div key={device.id} onClick={function() { handleDeviceSelect(device) }}
                                style={{ padding: '5px 11px', borderRadius: '20px', fontSize: '12px', border: isSelected ? '2px solid #0369a1' : '1px solid #e2e8f0', backgroundColor: isSelected ? '#eff6ff' : 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span>{device.device_name}</span>
                                <span style={{ fontSize: '10px', color: barrierColor[device.psychological_barrier] }}>
                                  ●{device.psychological_barrier === 'very_high' ? '非常に高' : device.psychological_barrier === 'high' ? '高' : device.psychological_barrier === 'moderate' ? '中' : '低'}
                                </span>
                                {isSelected && <span>✓</span>}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* 右：患者反応ログ */}
            <div style={{ position: 'sticky', top: '16px' }}>
              <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <p style={{ fontSize: '14px', fontWeight: 'bold', color: '#0369a1' }}>患者の反応</p>
                  <p style={{ fontSize: '11px', color: '#94a3b8' }}>治療の選択ごとに患者が反応します</p>
                </div>
                <div style={{ maxHeight: '72vh', overflowY: 'auto', padding: '12px' }}>
                  {reactionLog.length === 0 && !reactionLoading && (
                    <div style={{ textAlign: 'center', padding: '32px', color: '#94a3b8', fontSize: '13px' }}>
                      <p>治療内容を選択すると</p>
                      <p>患者の反応がここに表示されます</p>
                    </div>
                  )}
                  {reactionLog.map(function(entry) {
                    const isRejected = entry.reaction.acceptance_level === 'rejected' || entry.reaction.acceptance_level === 'negotiating'
                    const isActive = activePersuasionId === entry.id
                    return (
                      <div key={entry.id} style={{ marginBottom: '12px', paddingBottom: '12px', borderBottom: '1px solid #f1f5f9' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                          <p style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569' }}>{entry.labelText}</p>
                          <p style={{ fontSize: '10px', color: '#94a3b8' }}>{entry.timestamp}</p>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', marginBottom: '5px' }}>
                          <span style={{ fontSize: '16px' }}>{EMOTION_ICON[entry.reaction.emotion] || '😐'}</span>
                          <div style={{ flex: 1 }}>
                            <p style={{ fontSize: '12px', color: '#1e293b', fontStyle: 'italic', lineHeight: '1.5' }}>「{entry.reaction.reaction}」</p>
                            <div style={{ display: 'flex', gap: '6px', marginTop: '3px', alignItems: 'center', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '8px', backgroundColor: ACCEPTANCE_COLOR[entry.reaction.acceptance_level] + '20', color: ACCEPTANCE_COLOR[entry.reaction.acceptance_level], fontWeight: 'bold' }}>
                                {ACCEPTANCE_LABEL[entry.reaction.acceptance_level]}
                              </span>
                              {entry.reaction.key_concern && (
                                <span style={{ fontSize: '10px', color: '#64748b' }}>→{entry.reaction.key_concern}</span>
                              )}
                            </div>
                          </div>
                        </div>
                        {entry.persuasionHistory.length > 1 && (
                          <div style={{ marginLeft: '22px', marginBottom: '5px' }}>
                            {entry.persuasionHistory.slice(1).map(function(h, i) {
                              return (
                                <p key={i} style={{ fontSize: '11px', color: h.role === 'doctor' ? '#0369a1' : '#475569', marginBottom: '2px', lineHeight: '1.4' }}>
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
                                  placeholder="患者への説明を入力..."
                                  autoFocus
                                  style={{ flex: 1, padding: '4px 8px', border: '1px solid #0369a1', borderRadius: '6px', fontSize: '11px', outline: 'none' }} />
                                <button onClick={function() { handlePersuasion(entry.id) }} disabled={reactionLoading}
                                  style={{ padding: '4px 8px', backgroundColor: '#0369a1', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '11px' }}>
                                  {reactionLoading ? '...' : '説明'}
                                </button>
                                <button onClick={function() { setActivePersuasionId(null); setPersuasionInput('') }}
                                  style={{ padding: '4px 6px', backgroundColor: 'white', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer', fontSize: '11px' }}>✕</button>
                              </div>
                            ) : (
                              <button onClick={function() { setActivePersuasionId(entry.id); setPersuasionInput('') }}
                                style={{ fontSize: '11px', padding: '3px 8px', backgroundColor: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '6px', cursor: 'pointer' }}>
                                💬 患者を説得する
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {reactionLoading && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', backgroundColor: '#f8fafc', borderRadius: '8px' }}>
                      <span style={{ fontSize: '16px' }}>💭</span>
                      <p style={{ fontSize: '12px', color: '#94a3b8' }}>患者が反応中...</p>
                    </div>
                  )}
                  <div ref={reactionLogEndRef} />
                </div>
                <div style={{ padding: '8px 16px', backgroundColor: '#f8fafc', borderTop: '1px solid #e2e8f0', fontSize: '11px', color: '#475569' }}>
                  選択済：指導 {selectedEducation.length}件　投薬 {selectedMeds.length}件　機器 {selectedDevices.length}件
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ① 生活指導カテゴリ一覧モーダル（グループ選択） */}
        {activeEduModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}>
            <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '24px', maxWidth: '520px', width: '100%', maxHeight: '80vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: '#0369a1' }}>{activeEduModal.instruction_key}</h2>
                <button onClick={function() { setActiveEduModal(null) }}
                  style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#64748b' }}>✕</button>
              </div>
              <p style={{ fontSize: '13px', color: '#475569', marginBottom: '16px' }}>
                指導したい項目をカテゴリから選択してください。各カテゴリで1つ選択できます。
              </p>
              {Object.entries(groupSubOptions(activeEduModal.sub_options)).map(function([groupKey, group]) {
                const currentSubs = selectedSubOptions[activeEduModal.id] || {}
                const selected = currentSubs[groupKey]
                return (
                  <div key={groupKey} style={{ marginBottom: '12px', padding: '12px', backgroundColor: selected ? '#eff6ff' : '#f8fafc', borderRadius: '10px', border: selected ? '1px solid #bfdbfe' : '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <p style={{ fontSize: '13px', fontWeight: 'bold', color: '#1e293b' }}>{group.label}</p>
                      {selected && <span style={{ fontSize: '11px', color: '#0369a1', backgroundColor: '#dbeafe', padding: '1px 6px', borderRadius: '8px' }}>選択中：{selected.label}</span>}
                    </div>
                    <button
                      onClick={function() { openSubGroupModal(activeEduModal, groupKey, group.label, group.items) }}
                      style={{ width: '100%', padding: '8px', backgroundColor: selected ? '#0369a1' : 'white', color: selected ? 'white' : '#0369a1', border: '1px solid #0369a1', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
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

        {/* ② サブグループ詳細選択モーダル（単一選択・ラジオ式） */}
        {activeSubGroupModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '16px' }}>
            <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '24px', maxWidth: '480px', width: '100%', maxHeight: '80vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div>
                  <p style={{ fontSize: '12px', color: '#64748b' }}>{activeSubGroupModal.edu.instruction_key}</p>
                  <h2 style={{ fontSize: '15px', fontWeight: 'bold', color: '#0369a1' }}>{activeSubGroupModal.groupLabel}</h2>
                </div>
                <button onClick={function() { setActiveSubGroupModal(null) }}
                  style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#64748b' }}>✕</button>
              </div>
              <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '12px' }}>1つ選択してください（選択ごとに患者の反応が更新されます）</p>
              {activeSubGroupModal.items.map(function(sub) {
                const currentSubs = selectedSubOptions[activeSubGroupModal.edu.id] || {}
                const isSelected = currentSubs[activeSubGroupModal.groupKey] && currentSubs[activeSubGroupModal.groupKey].id === sub.id
                return (
                  <div key={sub.id}
                    onClick={function() { handleSubOptionSelect(activeSubGroupModal.edu, activeSubGroupModal.groupKey, sub) }}
                    style={{ marginBottom: '8px', padding: '12px', borderRadius: '8px', border: isSelected ? '2px solid #0369a1' : '1px solid #e2e8f0', backgroundColor: isSelected ? '#eff6ff' : 'white', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                        <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: isSelected ? '5px solid #0369a1' : '2px solid #cbd5e1', flexShrink: 0 }} />
                        <p style={{ fontSize: '13px', fontWeight: isSelected ? 'bold' : 'normal', color: '#1e293b' }}>{sub.label}</p>
                      </div>
                      {sub.description && <p style={{ fontSize: '11px', color: '#64748b', marginLeft: '24px' }}>{sub.description}</p>}
                    </div>
                    <span style={{ fontSize: '10px', color: STRICTNESS_COLOR[sub.strictness] || '#64748b', fontWeight: 'bold', marginLeft: '8px', whiteSpace: 'nowrap' }}>
                      {STRICTNESS_LABEL[sub.strictness] || sub.strictness}
                    </span>
                  </div>
                )
              })}
              <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                <button onClick={function() { setActiveSubGroupModal(null); setActiveEduModal(activeSubGroupModal.edu) }}
                  style={{ flex: 1, padding: '10px', backgroundColor: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>
                  ← カテゴリ一覧に戻る
                </button>
                <button onClick={function() { setActiveSubGroupModal(null) }}
                  style={{ flex: 1, padding: '10px', backgroundColor: '#0369a1', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>
                  確定
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ③ 医療機器モーダル */}
        {activeDeviceModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}>
            <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '24px', maxWidth: '500px', width: '100%', maxHeight: '80vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: '#0369a1' }}>{activeDeviceModal.device_name}</h2>
                <button onClick={function() { setActiveDeviceModal(null) }}
                  style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#64748b' }}>✕</button>
              </div>
              <div style={{ fontSize: '13px', color: '#475569', marginBottom: '12px' }}>
                <p style={{ marginBottom: '4px' }}><strong>適応：</strong>{activeDeviceModal.indication}</p>
                <p style={{ marginBottom: '4px' }}><strong>使用方法：</strong>{activeDeviceModal.how_to_use}</p>
                <p style={{ marginBottom: '4px' }}><strong>保険：</strong>{activeDeviceModal.insurance_coverage}</p>
              </div>
              {activeDeviceModal.key_benefits && activeDeviceModal.key_benefits.length > 0 && (
                <div style={{ marginBottom: '12px', padding: '10px', backgroundColor: '#f0fdf4', borderRadius: '8px' }}>
                  <p style={{ fontSize: '12px', fontWeight: 'bold', color: '#16a34a', marginBottom: '4px' }}>導入のメリット：</p>
                  {activeDeviceModal.key_benefits.map(function(b, i) { return <p key={i} style={{ fontSize: '12px', color: '#15803d' }}>✓ {b}</p> })}
                </div>
              )}
              {activeDeviceModal.common_objections && activeDeviceModal.common_objections.length > 0 && (
                <div style={{ marginBottom: '12px', padding: '10px', backgroundColor: '#fef2f2', borderRadius: '8px' }}>
                  <p style={{ fontSize: '12px', fontWeight: 'bold', color: '#dc2626', marginBottom: '4px' }}>患者からよくある反応：</p>
                  {activeDeviceModal.common_objections.map(function(o, i) { return <p key={i} style={{ fontSize: '12px', color: '#991b1b' }}>「{o}」</p> })}
                </div>
              )}
              <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '12px' }}>導入を決定すると右パネルに患者の反応が表示されます。</p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={function() { confirmDeviceSelect(activeDeviceModal) }}
                  style={{ flex: 1, padding: '12px', backgroundColor: selectedDevices.includes(activeDeviceModal.id) ? '#dc2626' : '#0369a1', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}>
                  {selectedDevices.includes(activeDeviceModal.id) ? '選択を解除する' : '導入を決定する'}
                </button>
                <button onClick={function() { setActiveDeviceModal(null) }}
                  style={{ padding: '12px 16px', backgroundColor: 'white', color: '#64748b', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>
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
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f9ff', padding: '16px' }}>
      <div style={{ maxWidth: '960px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: 'bold', color: '#0369a1' }}>Visit 1｜初診</h1>
            <p style={{ color: '#64748b', fontSize: '13px' }}>{caseData.disease_name}</p>
          </div>
          <button onClick={function() { window.location.href = '/cases' }}
            style={{ padding: '6px 16px', backgroundColor: 'white', color: '#64748b', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>
            症例選択に戻る
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '16px' }}>
          <div>
            <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0', marginBottom: '12px' }}>
              <h2 style={{ fontSize: '13px', fontWeight: 'bold', color: '#0369a1', marginBottom: '10px', paddingBottom: '6px', borderBottom: '1px solid #e2e8f0' }}>患者基本情報</h2>
              <div style={{ fontSize: '13px', lineHeight: '1.8' }}>
                <p><span style={{ color: '#64748b' }}>氏名：</span><strong>{patient.name}</strong></p>
                <p><span style={{ color: '#64748b' }}>年齢：</span>{patient.age}歳・{patient.gender}</p>
                <p><span style={{ color: '#64748b' }}>職業：</span>{patient.occupation}</p>
                <p style={{ marginTop: '8px', color: '#dc2626', fontWeight: 'bold' }}>「{patient.chief_complaint}」</p>
              </div>
            </div>
            <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0', marginBottom: '12px' }}>
              <h2 style={{ fontSize: '13px', fontWeight: 'bold', color: '#0369a1', marginBottom: '10px', paddingBottom: '6px', borderBottom: '1px solid #e2e8f0' }}>バイタルサイン</h2>
              <div style={{ fontSize: '13px', lineHeight: '2' }}>
                <p><span style={{ color: '#64748b' }}>血圧：</span><strong style={{ color: '#dc2626' }}>{patient.vitals.bp}</strong></p>
                <p><span style={{ color: '#64748b' }}>脈拍：</span>{patient.vitals.hr}</p>
                <p><span style={{ color: '#64748b' }}>体温：</span>{patient.vitals.temp}</p>
                <p><span style={{ color: '#64748b' }}>SpO2：</span>{patient.vitals.spo2}</p>
                <p><span style={{ color: '#64748b' }}>身長：</span>{patient.vitals.height}cm</p>
                <p><span style={{ color: '#64748b' }}>体重：</span>{patient.vitals.weight}kg</p>
                <p><span style={{ color: '#64748b' }}>BMI：</span>{patient.vitals.bmi}</p>
              </div>
            </div>
            <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0' }}>
              <h2 style={{ fontSize: '13px', fontWeight: 'bold', color: '#0369a1', marginBottom: '10px', paddingBottom: '6px', borderBottom: '1px solid #e2e8f0' }}>既往・生活歴</h2>
              <div style={{ fontSize: '12px', lineHeight: '1.8', color: '#475569' }}>
                <p><span style={{ color: '#64748b' }}>既往歴：</span>{patient.past_history}</p>
                <p><span style={{ color: '#64748b' }}>家族歴：</span>{patient.family_history}</p>
                <p><span style={{ color: '#64748b' }}>生活歴：</span>{patient.social_history}</p>
              </div>
            </div>
          </div>
          <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', height: '620px' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc', borderRadius: '12px 12px 0 0' }}>
              <p style={{ fontSize: '13px', fontWeight: 'bold', color: '#0369a1' }}>患者との対話</p>
              <p style={{ fontSize: '11px', color: '#94a3b8' }}>問診・診察・検査指示を入力してください</p>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {messages.map(function(msg, i) {
                return (
                  <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                    <div style={{ maxWidth: '80%', padding: '10px 14px', borderRadius: msg.role === 'user' ? '12px 12px 0 12px' : '12px 12px 12px 0', backgroundColor: msg.role === 'user' ? '#0369a1' : '#f1f5f9', color: msg.role === 'user' ? 'white' : '#1e293b', fontSize: '13px', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
                      {msg.content}
                    </div>
                  </div>
                )
              })}
              {aiLoading && (
                <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                  <div style={{ padding: '10px 14px', borderRadius: '12px 12px 12px 0', backgroundColor: '#f1f5f9', color: '#94a3b8', fontSize: '13px' }}>入力中...</div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
            <div style={{ padding: '12px 16px', borderTop: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <input type="text" value={input}
                  onChange={function(e) { setInput(e.target.value) }}
                  onKeyDown={function(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                  placeholder="患者への質問や診察・検査の指示を入力（Enterで送信）"
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
    </div>
  )
}
