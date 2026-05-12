'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../lib/supabase'

// 次ランクの称号（表示用）
const TITLES_NEXT = {
  1: '駆け出し研修医', 2: '独り立ち研修医', 3: '中堅研修医', 4: '研修修了者',
  5: '新米専攻医', 6: '若手専攻医', 7: '中堅専攻医', 8: '精鋭専攻医', 9: 'ベテラン専攻医',
  10: '新米指導医', 11: '若手指導医', 12: '中堅指導医', 13: '熟練指導医', 14: 'ベテラン指導医',
  15: '鉄壁のジェネラリスト', 16: '不朽のジェネラリスト', 17: '無双のジェネラリスト', 18: '至高のジェネラリスト', 19: '伝説のジェネラリスト',
}

const CATEGORY_COLORS = {
  '循環器': '#dc2626',
  '内分泌': '#0369a1',
  '呼吸器': '#059669',
  '消化器': '#d97706',
  '神経': '#7c3aed',
  '腎・泌尿器': '#0891b2',
  '血液': '#be123c',
  '感染症': '#65a30d',
  '皮膚': '#db2777',
  '精神': '#9333ea',
  '整形': '#475569',
  '小児': '#ec4899',
  '高齢者': '#78716c',
  '未分類': '#94a3b8',
}

function getCategoryColor(c) {
  return CATEGORY_COLORS[c] || '#64748b'
}

function GradeRow({ c, onRetry, onShowDetail, retrying }) {
  return (
    <div style={{
      backgroundColor: 'white', borderRadius: '10px', padding: '14px 16px',
      border: '1px solid #e2e8f0', marginBottom: '8px',
      display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap'
    }}>
      <div style={{ flex: 1, minWidth: '200px' }}>
        <p style={{ fontSize: '14px', fontWeight: 'bold', margin: '0 0 4px', color: '#1e293b' }}>
          {c.patient?.name || '—'}
          <span style={{ fontSize: '11px', fontWeight: 'normal', color: '#64748b', marginLeft: '6px' }}>
            ({c.patient?.age || '—'}歳・{c.patient?.gender || '—'})
          </span>
        </p>
        <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>
          {c.disease_name}
          {c.patient?.chief_complaint ? ' — ' + c.patient.chief_complaint.substring(0, 30) : ''}
        </p>
      </div>
      <div style={{ textAlign: 'center', minWidth: '80px' }}>
        <span style={{
          display: 'inline-block', padding: '4px 12px', borderRadius: '999px',
          background: c.score >= 80 ? 'linear-gradient(135deg, #059669, #047857)'
                    : c.score >= 60 ? 'linear-gradient(135deg, #0369a1, #075985)'
                    : 'linear-gradient(135deg, #d97706, #b45309)',
          color: 'white', fontWeight: 'bold', fontSize: '14px'
        }}>
          {c.score != null ? c.score + '点' : '—'}
        </span>
      </div>
      <div style={{ fontSize: '11px', color: '#94a3b8', minWidth: '90px' }}>
        {c.completed_at ? new Date(c.completed_at).toLocaleDateString('ja-JP') : '—'}
      </div>
      <div style={{ display: 'flex', gap: '6px' }}>
        <button onClick={function() { onShowDetail(c) }}
          style={{
            padding: '6px 12px', backgroundColor: 'white', color: '#0369a1',
            border: '1px solid #0369a1', borderRadius: '6px', fontSize: '12px',
            cursor: 'pointer', fontWeight: 'bold'
          }}>📋 詳細</button>
        <button onClick={function() { onRetry(c) }} disabled={retrying}
          style={{
            padding: '6px 12px', backgroundColor: '#059669', color: 'white',
            border: 'none', borderRadius: '6px', fontSize: '12px',
            cursor: retrying ? 'wait' : 'pointer', fontWeight: 'bold', opacity: retrying ? 0.7 : 1
          }}>🔄 リトライ</button>
      </div>
    </div>
  )
}

export default function GradesPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [cases, setCases] = useState([])
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState(null)
  const [retrying, setRetrying] = useState(false)
  const [detail, setDetail] = useState(null)
  const [showCoverage, setShowCoverage] = useState(false)

  useEffect(function() {
    async function load() {
      try {
        const session = await supabase.auth.getSession()
        const uid = session?.data?.session?.user?.id
        if (!uid) {
          router.push('/')
          return
        }
        const [resGrades, resProg] = await Promise.all([
          fetch('/api/grades-list?userId=' + uid),
          fetch('/api/user-progress?userId=' + uid),
        ])
        const d = await resGrades.json()
        const p = await resProg.json()
        if (d.error) { setError(d.error); return }
        setCases(d.cases || [])
        if (!p.error) setProgress(p)
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function handleRetry(c) {
    if (retrying) return
    const ok = window.confirm('「' + (c.patient?.name || c.disease_name) + '」の症例をリトライしますか？\n\n※ 現在中断中の症例があれば、その進行状況は自動的に削除されます。')
    if (!ok) return
    setRetrying(true)
    try {
      const res = await fetch('/api/retry-case', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceCaseId: c.id })
      })
      const d = await res.json()
      if (d.error || !d.newCaseId) {
        alert('リトライに失敗しました: ' + (d.error || '不明なエラー'))
        setRetrying(false)
        return
      }
      router.push('/cases/' + d.newCaseId)
    } catch (e) {
      alert('エラー: ' + e.message)
      setRetrying(false)
    }
  }

  // カテゴリ別グループ化
  const grouped = {}
  cases.forEach(function(c) {
    const cat = c.category || '未分類'
    if (!grouped[cat]) grouped[cat] = []
    grouped[cat].push(c)
  })
  const categories = Object.keys(grouped).sort()

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '24px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: 'bold', color: '#0369a1', margin: 0 }}>📊 成績一覧</h1>
          <button onClick={function() { router.push('/') }}
            style={{ padding: '8px 14px', backgroundColor: 'white', color: '#64748b', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>
            ← トップへ
          </button>
        </div>

        {loading && <p style={{ color: '#64748b' }}>読み込み中…</p>}
        {error && <p style={{ color: '#dc2626' }}>エラー: {error}</p>}

        {!loading && !error && cases.length === 0 && (
          <div style={{ backgroundColor: 'white', borderRadius: '10px', padding: '40px', textAlign: 'center', border: '1px solid #e2e8f0' }}>
            <p style={{ fontSize: '40px', margin: '0 0 12px' }}>📭</p>
            <p style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>まだ完遂した症例がありません。</p>
            <button onClick={function() { router.push('/cases') }}
              style={{ marginTop: '16px', padding: '10px 18px', backgroundColor: '#0369a1', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>
              症例トレーニングへ
            </button>
          </div>
        )}

        {progress && (
          <div style={{
            background: 'linear-gradient(135deg, #0369a1 0%, #1e40af 100%)',
            borderRadius: '14px', padding: '20px', marginBottom: '20px', color: 'white',
            boxShadow: '0 4px 12px rgba(3,105,161,0.25)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <p style={{ fontSize: '11px', opacity: 0.9, margin: '0 0 4px' }}>{progress.phase}フェーズ Rank {progress.rank}</p>
                <h2 style={{ fontSize: '24px', fontWeight: 'bold', margin: '0 0 6px' }}>🏆 {progress.title}</h2>
                <p style={{ fontSize: '12px', opacity: 0.9, margin: 0 }}>
                  合格 <b style={{ fontSize: '14px' }}>{progress.passCount}</b> 例 ・ 達成疾患 <b style={{ fontSize: '14px' }}>{progress.completedDiseases}</b> 疾患
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                {progress.requirementMet && progress.nextRankCount != null && (
                  <p style={{ fontSize: '11px', opacity: 0.9, margin: '0 0 4px' }}>
                    次ランク {TITLES_NEXT[progress.rank] || ''} まで
                  </p>
                )}
                {progress.requirementMet && progress.nextRankCount != null && (
                  <p style={{ fontSize: '18px', fontWeight: 'bold', margin: 0 }}>
                    あと {progress.nextRankCount - progress.passCount} 例
                  </p>
                )}
                {!progress.requirementMet && progress.blocker && (
                  <p style={{ fontSize: '11px', opacity: 0.95, margin: 0, maxWidth: '240px' }}>
                    {progress.blocker.nextPhase}フェーズに進むには
                    <b style={{ fontSize: '14px', display: 'block' }}>
                      {progress.blocker.required - progress.blocker.current} 疾患の追加カバーが必要
                    </b>
                  </p>
                )}
                {progress.requirementMet && progress.nextRankCount == null && (
                  <p style={{ fontSize: '14px', fontWeight: 'bold', margin: 0 }}>
                    最高ランク達成 ✨
                  </p>
                )}
              </div>
            </div>
            {progress.diseaseCoverage && progress.diseaseCoverage.length > 0 && (
              <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.25)' }}>
                <button onClick={function() { setShowCoverage(!showCoverage) }}
                  style={{ background: 'transparent', border: 'none', color: 'white', fontSize: '11px', cursor: 'pointer', padding: 0, opacity: 0.95 }}>
                  {showCoverage ? '▲ 疾患カバー状況を隠す' : '▼ 疾患カバー状況を表示'}
                </button>
                {showCoverage && (
                  <div style={{ marginTop: '10px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '6px' }}>
                    {progress.diseaseCoverage.map(function(d) {
                      return (
                        <div key={d.id} style={{
                          padding: '6px 10px', borderRadius: '6px',
                          backgroundColor: d.complete ? 'rgba(34,197,94,0.25)' : 'rgba(255,255,255,0.12)',
                          fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px'
                        }}>
                          <span style={{ fontSize: '13px' }}>{d.complete ? '✅' : '⚪'}</span>
                          <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</span>
                          <span style={{ opacity: 0.85 }}>{d.passed_model_cases}/{d.total_model_cases}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {!loading && !error && cases.length > 0 && (
          <div>
            <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '14px' }}>
              これまでに完遂した症例：合計 <b>{cases.length}</b> 件、領域 <b>{categories.length}</b> 分野
            </p>
            {categories.map(function(cat) {
              return (
                <div key={cat} style={{ marginBottom: '24px' }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '8px 14px', borderRadius: '8px',
                    backgroundColor: getCategoryColor(cat), color: 'white',
                    marginBottom: '10px', fontSize: '14px', fontWeight: 'bold'
                  }}>
                    {cat}
                    <span style={{ fontSize: '11px', opacity: 0.9, marginLeft: 'auto' }}>
                      {grouped[cat].length} 件
                    </span>
                  </div>
                  {grouped[cat].map(function(c) {
                    return <GradeRow key={c.id} c={c} onRetry={handleRetry} onShowDetail={setDetail} retrying={retrying} />
                  })}
                </div>
              )
            })}
          </div>
        )}

        {detail && (
          <div onClick={function() { setDetail(null) }}
            style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}>
            <div onClick={function(e) { e.stopPropagation() }}
              style={{ backgroundColor: 'white', borderRadius: '12px', maxWidth: '640px', width: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ fontSize: '17px', fontWeight: 'bold', color: '#0369a1', margin: 0 }}>📋 症例詳細</h2>
                <button onClick={function() { setDetail(null) }}
                  style={{ width: '32px', height: '32px', borderRadius: '50%', border: 'none', backgroundColor: '#f1f5f9', cursor: 'pointer', fontSize: '18px' }}>×</button>
              </div>
              <div style={{ overflowY: 'auto', padding: '16px 20px' }}>
                <h3 style={{ fontSize: '14px', color: '#0369a1', margin: '0 0 4px' }}>患者情報</h3>
                <p style={{ fontSize: '13px', margin: '0 0 12px' }}>
                  {detail.patient?.name} ({detail.patient?.age}歳・{detail.patient?.gender}) — {detail.disease_name}<br />
                  主訴: {detail.patient?.chief_complaint || '—'}
                </p>
                {detail.breakdown && (
                  <div>
                    <h3 style={{ fontSize: '14px', color: '#0369a1', margin: '12px 0 4px' }}>スコア内訳</h3>
                    <p style={{ fontSize: '13px', margin: '0 0 12px' }}>
                      Visit 1: {detail.breakdown.v1 || 0} / Visit 2: {detail.breakdown.v2 || 0} / Visit 3: {detail.breakdown.v3 || 0} → 合計: <b>{detail.score}/100</b>
                    </p>
                  </div>
                )}
                <h3 style={{ fontSize: '14px', color: '#0369a1', margin: '12px 0 4px' }}>指導医のコメント</h3>
                <div style={{ fontSize: '13px', whiteSpace: 'pre-wrap', lineHeight: 1.7, color: '#334155' }}>
                  {detail.feedback || '—'}
                </div>
              </div>
              <div style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button onClick={function() { handleRetry(detail) }} disabled={retrying}
                  style={{ padding: '8px 16px', backgroundColor: '#059669', color: 'white', border: 'none', borderRadius: '6px', cursor: retrying ? 'wait' : 'pointer', fontSize: '13px', fontWeight: 'bold' }}>
                  🔄 リトライ
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
