'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'

export default function CaseDetailPage({ params }) {
  const [user, setUser] = useState(null)
  const [caseData, setCaseData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [step, setStep] = useState('interview') // interview | treatment | scoring
  const [medications, setMedications] = useState([])
  const [educationItems, setEducationItems] = useState([])
  const [selectedMeds, setSelectedMeds] = useState([])
  const [selectedEducation, setSelectedEducation] = useState([])
  const [scoring, setScoring] = useState(null)
  const [scoringLoading, setScoringLoading] = useState(false)
  const messagesEndRef = useRef(null)

  useEffect(function() {
    supabase.auth.getSession().then(function({ data: { session } }) {
      if (!session) { window.location.href = '/'; return }
      setUser(session.user)
      fetchCase(session.user.id)
    })
  }, [])

  useEffect(function() {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  async function fetchCase(userId) {
    try {
      const { data, error } = await supabase
        .from('cases')
        .select('*')
        .eq('id', params.id)
        .eq('user_id', userId)
        .single()

      if (error || !data) { window.location.href = '/cases'; return }

      setCaseData(data)
      setMessages([{
        role: 'assistant',
        content: data.patient_data.name + 'さん（' +
          data.patient_data.age + '歳・' +
          data.patient_data.gender + '）が来院されました。\n\n' +
          '主訴：「' + data.patient_data.chief_complaint + '」\n\n' +
          '問診・診察を始めてください。'
      }])

      // 投薬・教育マスタを取得
      const medsRes = await fetch('/api/medications?diseaseId=' + data.disease_id)
      const medsData = await medsRes.json()
      if (medsData.medications) setMedications(medsData.medications)

      const eduRes = await fetch('/api/education?diseaseId=' + data.disease_id)
      const eduData = await eduRes.json()
      if (eduData.items) setEducationItems(eduData.items)

    } catch (e) {
      console.error(e)
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
      const system = `あなたは外来診療シミュレーションの患者AIです。
【患者情報】
名前：${patient.name}、年齢：${patient.age}歳、性別：${patient.gender}
職業：${patient.occupation}
主訴：${patient.chief_complaint}
現病歴：${patient.history}
既往歴：${patient.past_history}、家族歴：${patient.family_history}
生活歴：${patient.social_history}
バイタル：血圧${patient.vitals.bp}、脈拍${patient.vitals.hr}、体温${patient.vitals.temp}、SpO2${patient.vitals.spo2}、BMI${patient.vitals.bmi}

【応答ルール】
・患者として自然な日本語で応答する（医療用語は使わない）
・服薬意欲：${patient.hidden_params.adherence_level}、生活改善意欲：${patient.hidden_params.lifestyle_motivation}を反映した反応をする
・「診察」「検査」を指示された場合は具体的な結果を提示する
・1回の応答は150文字以内`

      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system,
          prompt: userMessage,
          history: messages.map(function(m) { return { role: m.role, content: m.content } }),
        }),
      })
      const data = await res.json()
      setMessages(function(prev) { return [...prev, { role: 'assistant', content: data.text }] })
    } catch (e) {
      setMessages(function(prev) { return [...prev, { role: 'assistant', content: 'エラーが発生しました。' }] })
    } finally {
      setAiLoading(false)
    }
  }

  function toggleMed(medId) {
    setSelectedMeds(function(prev) {
      return prev.includes(medId)
        ? prev.filter(function(id) { return id !== medId })
        : [...prev, medId]
    })
  }

  function toggleEdu(eduId) {
    setSelectedEducation(function(prev) {
      return prev.includes(eduId)
        ? prev.filter(function(id) { return id !== eduId })
        : [...prev, eduId]
    })
  }

  async function handleScoring() {
    setScoringLoading(true)
    try {
      const selectedMedData = medications.filter(function(m) { return selectedMeds.includes(m.id) })
      const selectedEduData = educationItems.filter(function(e) { return selectedEducation.includes(e.id) })

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
          interviewMessages: messages,
        }),
      })
      const data = await res.json()
      setScoring(data)
      setStep('scoring')
    } catch (e) {
      alert('採点中にエラーが発生しました。')
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

  // ===== 採点結果画面 =====
  if (step === 'scoring' && scoring && !scoring.error) {
    if (step === 'scoring' && scoring && scoring.error) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0f9ff' }}>
      <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '32px', maxWidth: '500px', textAlign: 'center' }}>
        <p style={{ color: '#dc2626', fontSize: '16px', marginBottom: '16px' }}>採点エラー：{scoring.error}</p>
        <button onClick={function() { setStep('treatment') }}
          style={{ padding: '10px 24px', backgroundColor: '#0369a1', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
          治療方針に戻る
        </button>
      </div>
    </div>
  )
}

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

          {/* 総合スコア */}
          <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '32px', border: '1px solid #e2e8f0', marginBottom: '16px', textAlign: 'center' }}>
            <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '8px' }}>総合スコア</p>
            <p style={{ fontSize: '64px', fontWeight: 'bold', color: scoring.totalScore >= 80 ? '#16a34a' : scoring.totalScore >= 60 ? '#d97706' : '#dc2626' }}>
              {scoring.totalScore}
            </p>
            <p style={{ fontSize: '16px', color: '#64748b' }}>/ 100点</p>
            <p style={{ fontSize: '18px', fontWeight: 'bold', color: '#1e293b', marginTop: '12px' }}>{scoring.overallComment}</p>
          </div>

          {/* 項目別スコア */}
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

          {/* ガイドライン引用 */}
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
      </div>
    )
  }

  // ===== 治療方針決定画面 =====
  if (step === 'treatment') {
    const medsByCategory = medications.reduce(function(acc, med) {
      if (!acc[med.drug_category]) acc[med.drug_category] = []
      acc[med.drug_category].push(med)
      return acc
    }, {})

    const eduByCategory = educationItems.reduce(function(acc, edu) {
      if (!acc[edu.category]) acc[edu.category] = []
      acc[edu.category].push(edu)
      return acc
    }, {})

    const categoryLabel = { diet: '食事', exercise: '運動', medication: '服薬', monitoring: 'モニタリング', lifestyle: '生活習慣', psychosocial: '心理・社会的支援', emergency: '緊急時対応', prevention: '予防' }

    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f0f9ff', padding: '16px' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h1 style={{ fontSize: '20px', fontWeight: 'bold', color: '#0369a1' }}>治療方針の決定</h1>
              <p style={{ color: '#64748b', fontSize: '13px' }}>{caseData.disease_name}　{patient.name}さん</p>
            </div>
            <button onClick={function() { setStep('interview') }}
              style={{ padding: '6px 16px', backgroundColor: 'white', color: '#64748b', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>
              ← 問診に戻る
            </button>
          </div>

          {/* 投薬選択 */}
          <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: '#1e293b', marginBottom: '16px', paddingBottom: '8px', borderBottom: '1px solid #e2e8f0' }}>
              💊 投薬選択（複数選択可）
            </h2>
            {Object.entries(medsByCategory).map(function([category, meds]) {
              return (
                <div key={category} style={{ marginBottom: '16px' }}>
                  <p style={{ fontSize: '13px', fontWeight: 'bold', color: '#475569', marginBottom: '8px' }}>{category}</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '8px' }}>
                    {meds.map(function(med) {
                      const isSelected = selectedMeds.includes(med.id)
                      return (
                        <div key={med.id}
                          onClick={function() { toggleMed(med.id) }}
                          style={{
                            padding: '12px',
                            borderRadius: '8px',
                            border: isSelected ? '2px solid #0369a1' : '1px solid #e2e8f0',
                            backgroundColor: isSelected ? '#eff6ff' : 'white',
                            cursor: 'pointer'
                          }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                              <p style={{ fontSize: '13px', fontWeight: 'bold', color: '#1e293b' }}>{med.drug_name_generic}</p>
                              <p style={{ fontSize: '11px', color: '#64748b' }}>{med.typical_dose}　{med.frequency}</p>
                            </div>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              {med.first_line && <span style={{ fontSize: '10px', backgroundColor: '#dcfce7', color: '#16a34a', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>第一選択</span>}
                              {isSelected && <span style={{ fontSize: '16px' }}>✓</span>}
                            </div>
                          </div>
                          {med.indication_notes && <p style={{ fontSize: '11px', color: '#0369a1', marginTop: '4px' }}>{med.indication_notes}</p>}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          {/* 患者指導選択 */}
          <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: '#1e293b', marginBottom: '16px', paddingBottom: '8px', borderBottom: '1px solid #e2e8f0' }}>
              📋 患者指導の選択（複数選択可）
            </h2>
            {Object.entries(eduByCategory).map(function([category, items]) {
              return (
                <div key={category} style={{ marginBottom: '16px' }}>
                  <p style={{ fontSize: '13px', fontWeight: 'bold', color: '#475569', marginBottom: '8px' }}>
                    {categoryLabel[category] || category}
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '8px' }}>
                    {items.map(function(item) {
                      const isSelected = selectedEducation.includes(item.id)
                      return (
                        <div key={item.id}
                          onClick={function() { toggleEdu(item.id) }}
                          style={{
                            padding: '12px',
                            borderRadius: '8px',
                            border: isSelected ? '2px solid #0369a1' : '1px solid #e2e8f0',
                            backgroundColor: isSelected ? '#eff6ff' : 'white',
                            cursor: 'pointer'
                          }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <p style={{ fontSize: '13px', fontWeight: 'bold', color: '#1e293b', flex: 1 }}>{item.instruction_key}</p>
                            {isSelected && <span style={{ fontSize: '16px' }}>✓</span>}
                          </div>
                          <p style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', lineHeight: '1.5' }}>
                            {item.instruction_detail.substring(0, 60)}...
                          </p>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          {/* 採点ボタン */}
          <div style={{ textAlign: 'center', padding: '16px' }}>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '12px' }}>
              投薬：{selectedMeds.length}件選択　指導：{selectedEducation.length}件選択
            </p>
            <button
              onClick={handleScoring}
              disabled={scoringLoading || (selectedMeds.length === 0 && selectedEducation.length === 0)}
              style={{
                padding: '14px 48px',
                backgroundColor: scoringLoading || (selectedMeds.length === 0 && selectedEducation.length === 0) ? '#93c5fd' : '#0369a1',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                cursor: scoringLoading || (selectedMeds.length === 0 && selectedEducation.length === 0) ? 'not-allowed' : 'pointer',
                fontSize: '16px',
                fontWeight: 'bold'
              }}>
              {scoringLoading ? '採点中...' : '採点する'}
            </button>
          </div>
        </div>
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
          {/* 左カラム：患者情報 */}
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

          {/* 右カラム：対話 */}
          <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', height: '620px' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc', borderRadius: '12px 12px 0 0' }}>
              <p style={{ fontSize: '13px', fontWeight: 'bold', color: '#0369a1' }}>患者との対話</p>
              <p style={{ fontSize: '11px', color: '#94a3b8' }}>問診・診察・検査指示を入力してください</p>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {messages.map(function(msg, i) {
                return (
                  <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                    <div style={{
                      maxWidth: '80%',
                      padding: '10px 14px',
                      borderRadius: msg.role === 'user' ? '12px 12px 0 12px' : '12px 12px 12px 0',
                      backgroundColor: msg.role === 'user' ? '#0369a1' : '#f1f5f9',
                      color: msg.role === 'user' ? 'white' : '#1e293b',
                      fontSize: '13px',
                      lineHeight: '1.6',
                      whiteSpace: 'pre-wrap'
                    }}>
                      {msg.content}
                    </div>
                  </div>
                )
              })}
              {aiLoading && (
                <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                  <div style={{ padding: '10px 14px', borderRadius: '12px 12px 12px 0', backgroundColor: '#f1f5f9', color: '#94a3b8', fontSize: '13px' }}>
                    入力中...
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div style={{ padding: '12px 16px', borderTop: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <input
                  type="text"
                  value={input}
                  onChange={function(e) { setInput(e.target.value) }}
                  onKeyDown={function(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                  placeholder="患者への質問や診察・検査の指示を入力（Enterで送信）"
                  style={{ flex: 1, padding: '10px 14px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', outline: 'none' }}
                />
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
