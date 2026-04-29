'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

export default function CaseDetailPage({ params }) {
  const [user, setUser] = useState(null)
  const [caseData, setCaseData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [step, setStep] = useState('interview')

  useEffect(function() {
    supabase.auth.getSession().then(function({ data: { session } }) {
      if (!session) {
        window.location.href = '/'
        return
      }
      setUser(session.user)
      fetchCase(session.user.id)
    })
  }, [])

  async function fetchCase(userId) {
    try {
      const { data, error } = await supabase
        .from('cases')
        .select('*')
        .eq('id', params.id)
        .eq('user_id', userId)
        .single()

      if (error || !data) {
        window.location.href = '/cases'
        return
      }

      setCaseData(data)
      setMessages([{
        role: 'assistant',
        content: data.patient_data.name + 'さん（' +
          data.patient_data.age + '歳・' +
          data.patient_data.gender + '）が来院されました。\n\n' +
          '主訴：「' + data.patient_data.chief_complaint + '」\n\n' +
          '問診を始めてください。患者さんに質問するか、診察・検査を指示してください。'
      }])
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
    setMessages(function(prev) {
      return [...prev, { role: 'user', content: userMessage }]
    })
    setAiLoading(true)

    try {
      const patient = caseData.patient_data
      const system = `あなたは外来診療シミュレーションの患者AIです。
以下の患者設定で応答してください。

【患者情報】
名前：${patient.name}
年齢：${patient.age}歳
性別：${patient.gender}
職業：${patient.occupation}
主訴：${patient.chief_complaint}
現病歴：${patient.history}
既往歴：${patient.past_history}
家族歴：${patient.family_history}
生活歴：${patient.social_history}
バイタル：血圧${patient.vitals.bp}、脈拍${patient.vitals.hr}、体温${patient.vitals.temp}、SpO2${patient.vitals.spo2}、身長${patient.vitals.height}cm、体重${patient.vitals.weight}kg

【応答ルール】
- 患者として自然な日本語で応答する
- 医療用語は使わず、一般的な言葉で話す
- 聞かれたことに正直に答える
- 隠しパラメータ（服薬意欲：${patient.hidden_params.adherence_level}、生活改善意欲：${patient.hidden_params.lifestyle_motivation}）を反映した反応をする
- 研修医が「身体診察」「検査」を指示した場合は結果を提示する
- 1回の応答は100文字以内で簡潔に`

      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system,
          prompt: userMessage,
          history: messages.map(function(m) {
            return { role: m.role, content: m.content }
          }),
        }),
      })

      const data = await res.json()
      setMessages(function(prev) {
        return [...prev, { role: 'assistant', content: data.text }]
      })
    } catch (e) {
      setMessages(function(prev) {
        return [...prev, { role: 'assistant', content: 'エラーが発生しました。' }]
      })
    } finally {
      setAiLoading(false)
    }
  }

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f0f9ff'
      }}>
        <p style={{ color: '#0369a1', fontSize: '18px' }}>症例を読み込み中...</p>
      </div>
    )
  }

  if (!caseData) return null

  const patient = caseData.patient_data

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f0f9ff',
      padding: '16px'
    }}>
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>

        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px'
        }}>
          <div>
            <h1 style={{
              fontSize: '20px',
              fontWeight: 'bold',
              color: '#0369a1'
            }}>
              Visit 1｜初診
            </h1>
            <p style={{ color: '#64748b', fontSize: '13px' }}>
              {caseData.disease_name}
            </p>
          </div>
          <button
            onClick={function() { window.location.href = '/cases' }}
            style={{
              padding: '6px 16px',
              backgroundColor: 'white',
              color: '#64748b',
              border: '1px solid #cbd5e1',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '13px'
            }}
          >
            症例選択に戻る
          </button>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 2fr',
          gap: '16px'
        }}>
          <div>
            <div style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '16px',
              border: '1px solid #e2e8f0',
              marginBottom: '12px'
            }}>
              <h2 style={{
                fontSize: '14px',
                fontWeight: 'bold',
                color: '#0369a1',
                marginBottom: '12px',
                paddingBottom: '8px',
                borderBottom: '1px solid #e2e8f0'
              }}>患者基本情報</h2>

              <div style={{ fontSize: '13px', lineHeight: '1.8' }}>
                <p><span style={{ color: '#64748b' }}>氏名：</span>
                  <strong>{patient.name}</strong></p>
                <p><span style={{ color: '#64748b' }}>年齢：</span>
                  {patient.age}歳・{patient.gender}</p>
                <p><span style={{ color: '#64748b' }}>職業：</span>
                  {patient.occupation}</p>
                <p style={{ marginTop: '8px', color: '#dc2626', fontWeight: 'bold' }}>
                  主訴：「{patient.chief_complaint}」</p>
              </div>
            </div>

            <div style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '16px',
              border: '1px solid #e2e8f0',
              marginBottom: '12px'
            }}>
              <h2 style={{
                fontSize: '14px',
                fontWeight: 'bold',
                color: '#0369a1',
                marginBottom: '12px',
                paddingBottom: '8px',
                borderBottom: '1px solid #e2e8f0'
              }}>バイタルサイン</h2>

              <div style={{ fontSize: '13px', lineHeight: '2' }}>
                <p><span style={{ color: '#64748b' }}>血圧：</span>
                  <strong style={{ color: '#dc2626' }}>{patient.vitals.bp}</strong></p>
                <p><span style={{ color: '#64748b' }}>脈拍：</span>{patient.vitals.hr}</p>
                <p><span style={{ color: '#64748b' }}>体温：</span>{patient.vitals.temp}</p>
                <p><span style={{ color: '#64748b' }}>SpO2：</span>{patient.vitals.spo2}</p>
                <p><span style={{ color: '#64748b' }}>身長：</span>{patient.vitals.height}cm</p>
                <p><span style={{ color: '#64748b' }}>体重：</span>{patient.vitals.weight}kg</p>
                <p><span style={{ color: '#64748b' }}>BMI：</span>{patient.vitals.bmi}</p>
              </div>
            </div>

            <div style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '16px',
              border: '1px solid #e2e8f0'
            }}>
              <h2 style={{
                fontSize: '14px',
                fontWeight: 'bold',
                color: '#0369a1',
                marginBottom: '12px',
                paddingBottom: '8px',
                borderBottom: '1px solid #e2e8f0'
              }}>既往・生活歴</h2>

              <div style={{ fontSize: '12px', lineHeight: '1.8', color: '#475569' }}>
                <p><span style={{ color: '#64748b' }}>既往歴：</span>
                  {patient.past_history}</p>
                <p><span style={{ color: '#64748b' }}>家族歴：</span>
                  {patient.family_history}</p>
                <p><span style={{ color: '#64748b' }}>生活歴：</span>
                  {patient.social_history}</p>
              </div>
            </div>
          </div>

          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            display: 'flex',
            flexDirection: 'column',
            height: '600px'
          }}>
            <div style={{
              padding: '12px 16px',
              borderBottom: '1px solid #e2e8f0',
              backgroundColor: '#f8fafc',
              borderRadius: '12px 12px 0 0'
            }}>
              <p style={{
                fontSize: '13px',
                fontWeight: 'bold',
                color: '#0369a1'
              }}>患者との対話</p>
              <p style={{ fontSize: '11px', color: '#94a3b8' }}>
                患者に質問するか、診察・検査を指示してください
              </p>
            </div>

            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}>
              {messages.map(function(msg, i) {
                return (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start'
                    }}
                  >
                    <div style={{
                      maxWidth: '80%',
                      padding: '10px 14px',
                      borderRadius: msg.role === 'user'
                        ? '12px 12px 0 12px'
                        : '12px 12px 12px 0',
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
                  <div style={{
                    padding: '10px 14px',
                    borderRadius: '12px 12px 12px 0',
                    backgroundColor: '#f1f5f9',
                    color: '#94a3b8',
                    fontSize: '13px'
                  }}>
                    入力中...
                  </div>
                </div>
              )}
            </div>

            <div style={{
              padding: '12px 16px',
              borderTop: '1px solid #e2e8f0',
              display: 'flex',
              gap: '8px'
            }}>
              <input
                type="text"
                value={input}
                onChange={function(e) { setInput(e.target.value) }}
                onKeyDown={function(e) {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
                placeholder="患者への質問や指示を入力（Enterで送信）"
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  fontSize: '13px',
                  outline: 'none'
                }}
              />
              <button
                onClick={handleSend}
                disabled={aiLoading || !input.trim()}
                style={{
                  padding: '10px 20px',
                  backgroundColor: aiLoading || !input.trim() ? '#93c5fd' : '#0369a1',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: aiLoading || !input.trim() ? 'not-allowed' : 'pointer',
                  fontSize: '13px',
                  fontWeight: 'bold'
                }}
              >
                送信
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
