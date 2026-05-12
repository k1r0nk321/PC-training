'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../lib/supabase'

const DIFFICULTY_STAR = { 1: '★☆☆', 2: '★★☆', 3: '★★★' }
const DIFFICULTY_COLOR = { 1: '#16a34a', 2: '#d97706', 3: '#dc2626' }
const DIFFICULTY_LABEL = { 1: '初級', 2: '中級', 3: '上級' }

const PERSONALITY_LABEL = {
  cooperative: '従順', anxious: '不安が強い',
  resistant: '抵抗的', lazy: '面倒嫌い', angry: '怒りっぽい'
}
const PERSONALITY_COLOR = {
  cooperative: '#16a34a', anxious: '#d97706',
  resistant: '#dc2626', lazy: '#64748b', angry: '#dc2626'
}
const ADL_LABEL = {
  independent: '自立', partially_dependent: '一部介助', dependent: '要介助'
}
const COGNITIVE_LABEL = {
  normal: '正常', mild_decline: '軽度低下', moderate_decline: '中等度低下'
}

export default function CasesPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [diseases, setDiseases] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedDisease, setSelectedDisease] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [modelCases, setModelCases] = useState([])
  const [modelLoading, setModelLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [mode, setMode] = useState(null) // 'model' | 'random'
  const [selectedModelCase, setSelectedModelCase] = useState(null)
  const [inProgressCases, setInProgressCases] = useState([])
  const [demoInfo, setDemoInfo] = useState(null)
  const [showDemoLimitModal, setShowDemoLimitModal] = useState(false)

  useEffect(function() {
    supabase.auth.getSession().then(function({ data: { session } }) {
      if (!session) { window.location.href = '/'; return }
      setUser(session.user)
      fetchDiseases()
      fetchInProgressCases(session.user.id)
      // デモ情報取得（匿名ユーザーのみ実質的に意味がある）
      fetch('/api/user-progress?userId=' + session.user.id)
        .then(function(r) { return r.json() })
        .then(function(d) { if (!d.error) setDemoInfo(d) })
        .catch(function() {})
    })
  }, [])

  async function fetchInProgressCases(userId) {
    try {
      // saved_state IS NOT NULL のフィルタはクライアント側で行う（PostgREST .not() の挙動が DB バージョン依存のため）
      // saved_state が NOT NULL の行のみ取得（サーバ側フィルタ）
      // PostgreSQL DESC のデフォルトは NULLS FIRST なので nullsFirst:false を明示
      const { data, error } = await supabase
        .from('cases')
        .select('id, disease_name, saved_state, record_saved_at, patient_data')
        .eq('user_id', userId)
        .not('saved_state', 'is', null)
        .order('record_saved_at', { ascending: false, nullsFirst: false })
        .limit(50)
      if (error) {
        console.error('[in-progress] fetch error:', error)
        return
      }
      const filtered = (data || []).filter(function(c) {
        return c.saved_state && typeof c.saved_state === 'object' && c.saved_state.current_visit
      })
      console.log('[in-progress] total fetched:', (data || []).length, '/ with saved_state:', filtered.length)
      setInProgressCases(filtered)
    } catch (e) {
      console.error('[in-progress] exception:', e)
    }
  }

  async function resumeCase(c) {
    // 他の中断中症例を削除してから再開
    try {
      await fetch('/api/activate-case', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseId: c.id })
      })
    } catch (e) {}
    const visit = (c.saved_state && c.saved_state.current_visit) || 1
    if (visit === 3) {
      window.location.href = '/cases/' + c.id + '/visit3'
    } else if (visit === 2) {
      window.location.href = '/cases/' + c.id + '/visit2'
    } else {
      window.location.href = '/cases/' + c.id
    }
  }

  async function discardCase(c) {
    if (!window.confirm('この中断症例を削除しますか？\n（症例自体は残りますが、中断状態は破棄されます）')) return
    try {
      await fetch('/api/save-record?caseId=' + c.id, { method: 'DELETE' })
      setInProgressCases(function(prev) { return prev.filter(function(x) { return x.id !== c.id }) })
    } catch (e) { alert('削除に失敗しました：' + e.message) }
  }

  async function fetchDiseases() {
    try {
      const res = await fetch('/api/diseases')
      const data = await res.json()
      if (data.diseases) setDiseases(data.diseases)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  async function handleDiseaseSelect(disease) {
    setSelectedDisease(disease)
    setMode(null)
    setSelectedModelCase(null)
    setShowModal(true)

    // モデル症例を取得
    setModelLoading(true)
    try {
      const res = await fetch('/api/model-cases?diseaseId=' + disease.id)
      const data = await res.json()
      setModelCases(data.modelCases || [])
    } catch (e) {
      console.error(e)
      setModelCases([])
    } finally {
      setModelLoading(false)
    }
  }

  async function handleStartRandom() {
    if (!selectedDisease || generating) return
    setGenerating(true)
    try {
      const res = await fetch('/api/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ diseaseId: selectedDisease.id, diseaseName: selectedDisease.name_ja, userId: user.id }),
      })
      const data = await res.json()
      if (data.error) { alert('症例生成エラー：' + data.error); return }
      window.location.href = '/cases/' + data.caseId
    } catch (e) {
      alert('エラー：' + e.message)
    } finally {
      setGenerating(false)
    }
  }

  async function handleStartModel() {
    if (!selectedModelCase || generating) return
    // デモ限界チェック (フロント側、API でも防ぐ)
    if (user && user.is_anonymous && demoInfo && demoInfo.demo_reached) {
      setShowModal(false)
      setShowDemoLimitModal(true)
      return
    }
    setGenerating(true)
    try {
      const res = await fetch('/api/model-cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelCaseId: selectedModelCase.id, userId: user.id }),
      })
      const data = await res.json()
      if (data.isDemoLimit) {
        setShowModal(false)
        setShowDemoLimitModal(true)
        return
      }
      if (data.error) { alert('エラー：' + data.error); return }
      window.location.href = '/cases/' + data.case.id
    } catch (e) {
      alert('エラー：' + e.message)
    } finally {
      setGenerating(false)
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0f9ff' }}>
        <p style={{ color: '#0369a1', fontSize: '18px' }}>読み込み中...</p>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f9ff', padding: '16px' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>

        {/* ヘッダー */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 'bold', color: '#0369a1', margin: 0 }}>PC Training</h1>
            <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>プライマリケア外来研修シミュレーター</p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={function() { router.push('/') }}
              style={{ padding: '6px 14px', backgroundColor: 'white', color: '#0369a1', border: '1px solid #0369a1', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
              ← トップへ戻る
            </button>
            <button onClick={handleSignOut}
              style={{ padding: '6px 14px', backgroundColor: 'white', color: '#64748b', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', fontSize: '12px' }}>
              ログアウト
            </button>
          </div>
        </div>

        {user && user.is_anonymous && (
          <div style={{
            backgroundColor: '#ecfdf5',
            border: '1px solid #86efac',
            borderRadius: '10px',
            padding: '12px 16px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}>
            <span style={{ fontSize: '20px' }}>🎯</span>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: '13px', fontWeight: 'bold', color: '#065f46', margin: '0 0 2px' }}>
                デモモード
                {demoInfo && demoInfo.is_demo && (
                  <span style={{ marginLeft: '8px', fontSize: '11px', backgroundColor: '#fff', color: '#065f46', padding: '1px 8px', borderRadius: '10px', border: '1px solid #6ee7b7' }}>
                    残り {demoInfo.demo_remaining} 例
                  </span>
                )}
              </p>
              <p style={{ fontSize: '11px', color: '#047857', margin: 0 }}>
                モデル症例のみ体験できます（最大 3 例）。ログアウトすると進行状況はリセットされます。
              </p>
            </div>
          </div>
        )}

        {/* 中断症例の再開 */}
        {inProgressCases.length > 0 && (
          <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '20px', border: '2px solid #fde047', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: 'bold', color: '#713f12', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              📂 中断中の症例
              <span style={{ fontSize: '10px', backgroundColor: '#fef9c3', color: '#713f12', padding: '2px 8px', borderRadius: '10px', fontWeight: 'bold', border: '1px solid #fde047' }}>{inProgressCases.length}件</span>
            </h2>
            <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '12px' }}>前回の続きから再開するか、削除して新しく開始するか選択してください</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {inProgressCases.map(function(c) {
                const ss = c.saved_state || {}
                const visit = ss.current_visit || 1
                const visitData = visit === 2 ? ss.visit2 : ss.visit1
                const step = (visitData && visitData.step) || 'interview'
                const stepLabel = step === 'interview' ? '問診中'
                  : step === 'treatment' ? '治療方針決定中'
                  : step === 'scoring' ? 'フィードバック表示中'
                  : step === 'feedback' ? 'フィードバック表示中'
                  : step
                const msgCount = (visitData && Array.isArray(visitData.messages))
                  ? visitData.messages.filter(function(m) { return m.role === 'user' }).length : 0
                const medCount = (visitData && Array.isArray(visitData.selected_meds)) ? visitData.selected_meds.length : 0
                const eduCount = (visitData && Array.isArray(visitData.selected_education)) ? visitData.selected_education.length : 0
                const savedAt = c.record_saved_at ? new Date(c.record_saved_at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'
                const pd = c.patient_data || {}
                return (
                  <div key={c.id} style={{ padding: '12px', borderRadius: '10px', border: '1px solid #fde047', backgroundColor: '#fefce8' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '6px' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '4px' }}>
                          <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#713f12' }}>{c.disease_name || '症例'}</span>
                          <span style={{ fontSize: '11px', backgroundColor: visit === 2 ? '#dbeafe' : '#dcfce7', color: visit === 2 ? '#1e40af' : '#14532d', padding: '1px 8px', borderRadius: '8px', fontWeight: 'bold' }}>Visit {visit}</span>
                          <span style={{ fontSize: '11px', backgroundColor: '#f1f5f9', color: '#475569', padding: '1px 8px', borderRadius: '8px' }}>{stepLabel}</span>
                        </div>
                        <p style={{ fontSize: '12px', color: '#475569', margin: '0 0 2px' }}>
                          {pd.name || '?'}（{pd.age || '?'}歳・{pd.gender || '?'}）
                          {pd.chief_complaint ? '　主訴：「' + pd.chief_complaint + '」' : ''}
                        </p>
                        <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0 }}>
                          問診 {msgCount}回・投薬 {medCount}件・指導 {eduCount}件　／　保存: {savedAt}
                        </p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                      <button onClick={function() { resumeCase(c) }}
                        style={{ flex: 1, padding: '8px', backgroundColor: '#0369a1', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                        ▶ 再開する
                      </button>
                      <button onClick={function() { discardCase(c) }}
                        style={{ padding: '8px 14px', backgroundColor: 'white', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>
                        🗑 削除
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* 疾患選択 */}
        <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 'bold', color: '#1e293b', marginBottom: '4px' }}>疾患を選択してトレーニングを開始</h2>
          <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '16px' }}>
            {user && user.is_anonymous ? '疾患を選ぶとモデル症例を体験できます' : '疾患を選ぶと、モデル症例またはランダム生成を選択できます'}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '8px' }}>
            {diseases.map(function(disease) {
              return (
                <div key={disease.id}
                  onClick={function() { handleDiseaseSelect(disease) }}
                  style={{ padding: '12px 14px', borderRadius: '10px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', cursor: 'pointer', transition: 'all 0.15s' }}
                  onMouseEnter={function(e) { e.currentTarget.style.borderColor = '#0369a1'; e.currentTarget.style.backgroundColor = '#eff6ff' }}
                  onMouseLeave={function(e) { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.backgroundColor = '#f8fafc' }}>
                  <p style={{ fontSize: '14px', fontWeight: 'bold', color: '#1e293b', margin: '0 0 2px' }}>{disease.name_ja}</p>
                  {disease.name_en && <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0 }}>{disease.name_en}</p>}
                </div>
              )
            })}
          </div>
        </div>

        <div style={{ backgroundColor: '#f0f9ff', borderRadius: '10px', padding: '14px', border: '1px solid #bae6fd', fontSize: '12px', color: '#0369a1' }}>
          <strong>📌 使い方：</strong>
          {user && user.is_anonymous
            ? '疾患を選ぶ → モデル症例を選択 → 問診・治療方針の決定 → フィードバック → Visit 2・3へ進む'
            : '疾患を選ぶ → モデル症例またはランダム生成を選択 → 問診・治療方針の決定 → フィードバック → Visit 2・3へ進む'
          }
        </div>
      </div>

      {/* 症例選択モーダル */}
      {showModal && selectedDisease && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: 'white', borderRadius: '16px 16px 0 0', width: '100%', maxWidth: '800px', maxHeight: '90vh', overflowY: 'auto' }}>

            {/* モーダルヘッダー */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, backgroundColor: 'white', zIndex: 10 }}>
              <div>
                <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: '#0369a1', margin: 0 }}>{selectedDisease.name_ja}</h2>
                <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>症例タイプを選択してください</p>
              </div>
              <button onClick={function() { setShowModal(false); setMode(null); setSelectedModelCase(null) }}
                style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#64748b', padding: '4px' }}>✕</button>
            </div>

            <div style={{ padding: '16px 20px' }}>

              {/* モード選択タブ */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <button onClick={function() { setMode('model'); setSelectedModelCase(null) }}
                  style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '2px solid ' + (mode === 'model' ? '#0369a1' : '#e2e8f0'), backgroundColor: mode === 'model' ? '#eff6ff' : 'white', cursor: 'pointer', fontSize: '13px', fontWeight: mode === 'model' ? 'bold' : 'normal', color: mode === 'model' ? '#0369a1' : '#475569' }}>
                  📋 モデル症例から選ぶ
                </button>
                {!(user && user.is_anonymous) && (
                  <button onClick={function() { setMode('random'); setSelectedModelCase(null) }}
                    style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '2px solid ' + (mode === 'random' ? '#0369a1' : '#e2e8f0'), backgroundColor: mode === 'random' ? '#eff6ff' : 'white', cursor: 'pointer', fontSize: '13px', fontWeight: mode === 'random' ? 'bold' : 'normal', color: mode === 'random' ? '#0369a1' : '#475569' }}>
                    🎲 ランダム生成
                  </button>
                )}
              </div>

              {/* モデル症例リスト */}
              {mode === 'model' && (
                <div>
                  {modelLoading ? (
                    <div style={{ textAlign: 'center', padding: '32px', color: '#94a3b8' }}>
                      <p>モデル症例を読み込み中...</p>
                    </div>
                  ) : modelCases.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '32px', color: '#94a3b8' }}>
                      <p>この疾患のモデル症例はまだ登録されていません</p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
                      {modelCases.map(function(mc) {
                        const isSelected = selectedModelCase && selectedModelCase.id === mc.id
                        const hidden = mc.patient_data.hidden_params
                        const difficulty = mc.scenario_data?.difficulty || 1
                        return (
                          <div key={mc.id}
                            onClick={function() { setSelectedModelCase(mc) }}
                            style={{ padding: '14px', borderRadius: '10px', border: '2px solid ' + (isSelected ? '#0369a1' : '#e2e8f0'), backgroundColor: isSelected ? '#eff6ff' : 'white', cursor: 'pointer' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                                  <div style={{ width: '18px', height: '18px', borderRadius: '50%', border: isSelected ? '5px solid #0369a1' : '2px solid #cbd5e1', flexShrink: 0 }} />
                                  <p style={{ fontSize: '14px', fontWeight: 'bold', color: '#1e293b', margin: 0 }}>{mc.title}</p>
                                </div>
                                <p style={{ fontSize: '12px', color: '#475569', margin: '0 0 0 26px' }}>{mc.description}</p>
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0, marginLeft: '10px' }}>
                                <span style={{ fontSize: '12px', color: DIFFICULTY_COLOR[difficulty], fontWeight: 'bold' }}>
                                  {DIFFICULTY_STAR[difficulty]}
                                </span>
                                <span style={{ fontSize: '10px', backgroundColor: DIFFICULTY_COLOR[difficulty] + '20', color: DIFFICULTY_COLOR[difficulty], padding: '1px 6px', borderRadius: '8px', fontWeight: 'bold' }}>
                                  {DIFFICULTY_LABEL[difficulty]}
                                </span>
                              </div>
                            </div>

                            {/* 患者詳細タグ */}
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginLeft: '26px' }}>
                              <span style={{ fontSize: '10px', backgroundColor: '#f1f5f9', color: '#475569', padding: '1px 6px', borderRadius: '8px' }}>
                                {mc.patient_data.age}歳・{mc.patient_data.gender}
                              </span>
                              <span style={{ fontSize: '10px', backgroundColor: '#f1f5f9', color: '#475569', padding: '1px 6px', borderRadius: '8px' }}>
                                BMI {mc.patient_data.vitals.bmi}
                              </span>
                              <span style={{ fontSize: '10px', backgroundColor: PERSONALITY_COLOR[hidden.personality_type] + '15', color: PERSONALITY_COLOR[hidden.personality_type], padding: '1px 6px', borderRadius: '8px' }}>
                                性格：{PERSONALITY_LABEL[hidden.personality_type] || hidden.personality_type}
                              </span>
                              {hidden.cognitive_level !== 'normal' && (
                                <span style={{ fontSize: '10px', backgroundColor: '#fef9c3', color: '#713f12', padding: '1px 6px', borderRadius: '8px' }}>
                                  認知：{COGNITIVE_LABEL[hidden.cognitive_level]}
                                </span>
                              )}
                              {hidden.adl_level !== 'independent' && (
                                <span style={{ fontSize: '10px', backgroundColor: '#fef2f2', color: '#dc2626', padding: '1px 6px', borderRadius: '8px' }}>
                                  ADL：{ADL_LABEL[hidden.adl_level]}
                                </span>
                              )}
                              {hidden.needs_social_support === 'true' && (
                                <span style={{ fontSize: '10px', backgroundColor: '#f0fdf4', color: '#16a34a', padding: '1px 6px', borderRadius: '8px' }}>
                                  社会的支援要
                                </span>
                              )}
                              <span style={{ fontSize: '10px', backgroundColor: '#f1f5f9', color: '#475569', padding: '1px 6px', borderRadius: '8px' }}>
                                {hidden.medication_attitude === 'very_negative' ? '薬：強く拒否' : hidden.medication_attitude === 'negative' ? '薬：否定的' : hidden.medication_attitude === 'positive' ? '薬：前向き' : '薬：普通'}
                              </span>
                            </div>

                            {/* 学習ポイント（選択時のみ表示） */}
                            {isSelected && mc.scenario_data?.key_points && (
                              <div style={{ marginTop: '10px', marginLeft: '26px', padding: '8px', backgroundColor: '#f0f9ff', borderRadius: '8px', border: '1px solid #bae6fd' }}>
                                <p style={{ fontSize: '11px', fontWeight: 'bold', color: '#0369a1', margin: '0 0 4px' }}>📚 この症例の学習ポイント</p>
                                {mc.scenario_data.key_points.map(function(pt, i) {
                                  return <p key={i} style={{ fontSize: '11px', color: '#475569', margin: '1px 0' }}>• {pt}</p>
                                })}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  <button
                    onClick={handleStartModel}
                    disabled={!selectedModelCase || generating}
                    style={{ width: '100%', padding: '13px', backgroundColor: !selectedModelCase || generating ? '#93c5fd' : '#0369a1', color: 'white', border: 'none', borderRadius: '10px', cursor: !selectedModelCase || generating ? 'not-allowed' : 'pointer', fontSize: '15px', fontWeight: 'bold' }}>
                    {generating ? '症例を準備中...' : selectedModelCase ? selectedModelCase.title + ' でトレーニング開始 →' : 'モデル症例を選択してください'}
                  </button>
                </div>
              )}

              {/* ランダム生成 */}
              {mode === 'random' && (
                <div>
                  <div style={{ backgroundColor: '#f8fafc', borderRadius: '10px', padding: '16px', marginBottom: '16px', border: '1px solid #e2e8f0' }}>
                    <p style={{ fontSize: '14px', fontWeight: 'bold', color: '#1e293b', marginBottom: '8px' }}>🎲 ランダム症例生成</p>
                    <p style={{ fontSize: '13px', color: '#475569', marginBottom: '4px' }}>AIが毎回異なる患者像を生成します。</p>
                    <div style={{ fontSize: '12px', color: '#64748b', lineHeight: '1.8' }}>
                      <p style={{ margin: 0 }}>• 年齢：35〜80歳からランダム</p>
                      <p style={{ margin: 0 }}>• 性別・職業・BMI・性格がランダムに変化</p>
                      <p style={{ margin: 0 }}>• 毎回異なる隠しパラメータ（アドヒアランス・薬への態度等）</p>
                      <p style={{ margin: 0 }}>• 生成に15〜30秒かかります</p>
                    </div>
                  </div>
                  <button
                    onClick={handleStartRandom}
                    disabled={generating}
                    style={{ width: '100%', padding: '13px', backgroundColor: generating ? '#93c5fd' : '#059669', color: 'white', border: 'none', borderRadius: '10px', cursor: generating ? 'not-allowed' : 'pointer', fontSize: '15px', fontWeight: 'bold' }}>
                    {generating ? '症例を生成中...（15〜30秒）' : 'ランダム症例でトレーニング開始 →'}
                  </button>
                </div>
              )}

              {/* 未選択時のガイド */}
              {!mode && (
                <div style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                  <p style={{ fontSize: '14px', margin: '0 0 8px' }}>上のボタンから症例タイプを選んでください</p>
                  <p style={{ fontSize: '12px', margin: 0 }}>モデル症例：特定の患者像を繰り返し練習できます<br />ランダム生成：毎回新しい患者と対話できます</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showDemoLimitModal && (
        <div onClick={function() { setShowDemoLimitModal(false) }}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}>
          <div onClick={function(e) { e.stopPropagation() }}
            style={{ backgroundColor: 'white', borderRadius: '14px', maxWidth: '460px', width: '100%', padding: '28px', textAlign: 'center' }}>
            <p style={{ fontSize: '48px', margin: '0 0 12px' }}>🎉</p>
            <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#0369a1', margin: '0 0 8px' }}>
              デモ体験は 3 例まで完了しました！
            </h2>
            <p style={{ fontSize: '13px', color: '#475569', lineHeight: 1.8, margin: '0 0 20px' }}>
              本登録すると、以下がご利用いただけます:
            </p>
            <ul style={{ textAlign: 'left', fontSize: '12px', color: '#475569', lineHeight: 1.9, padding: '0 0 0 20px', margin: '0 0 20px' }}>
              <li>📊 すべての疾患・モデル症例の体験</li>
              <li>🎲 患者ランダム生成（多様なパターン）</li>
              <li>🔄 同じ症例のリトライ機能</li>
              <li>🏆 ランキング・成績の永続保存</li>
              <li>👥 グループ機能（仲間と研修状況を共有）</li>
              <li>📝 中断したカルテからの再開</li>
            </ul>
            <button onClick={async function() {
                await supabase.auth.signOut()
                window.location.href = '/'
              }}
              style={{ width: '100%', padding: '12px', backgroundColor: '#0369a1', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer', marginBottom: '8px' }}>
              本登録するためにログアウト
            </button>
            <button onClick={function() { setShowDemoLimitModal(false) }}
              style={{ width: '100%', padding: '10px', backgroundColor: 'transparent', color: '#64748b', border: 'none', fontSize: '12px', cursor: 'pointer' }}>
              閉じる（成績ページは引き続き閲覧可能）
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
