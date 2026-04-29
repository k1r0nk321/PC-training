'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const CATEGORY_COLORS = {
  '循環器': '#fee2e2',
  '代謝・内分泌': '#fef9c3',
  '呼吸器': '#dbeafe',
  '消化器': '#dcfce7',
  '精神・神経': '#f3e8ff',
  '筋骨格': '#ffedd5',
  '腎・泌尿器': '#cffafe',
  '皮膚': '#fce7f3',
  '予防医学': '#f0fdf4',
}

const DIFFICULTY_LABEL = {
  1: '基本',
  2: '中級',
  3: '上級',
}

const DIFFICULTY_COLOR = {
  1: '#16a34a',
  2: '#d97706',
  3: '#dc2626',
}

export default function CasesPage() {
  const [user, setUser] = useState(null)
  const [diseases, setDiseases] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState('すべて')
  const [starting, setStarting] = useState(false)

  useEffect(function() {
    supabase.auth.getSession().then(function({ data: { session } }) {
      if (!session) {
        window.location.href = '/'
        return
      }
      setUser(session.user)
    })
  }, [])

  useEffect(function() {
    async function fetchDiseases() {
      try {
        const res = await fetch('/api/diseases')
        const data = await res.json()
        if (data.diseases) {
          setDiseases(data.diseases)
        }
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    fetchDiseases()
  }, [])

  const categories = ['すべて', ...Array.from(new Set(diseases.map(function(d) { return d.category })))]

  const filteredDiseases = selectedCategory === 'すべて'
    ? diseases
    : diseases.filter(function(d) { return d.category === selectedCategory })

  async function handleStart(disease) {
    setStarting(true)
    try {
      const res = await fetch('/api/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          diseaseId: disease.id,
          diseaseName: disease.name_ja,
          userId: user.id,
        }),
      })
      const data = await res.json()
      if (data.caseId) {
        window.location.href = '/cases/' + data.caseId
      } else {
        alert('症例の作成に失敗しました。')
        setStarting(false)
      }
    } catch (e) {
      alert('エラーが発生しました。')
      setStarting(false)
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
        <p style={{ color: '#0369a1', fontSize: '18px' }}>読み込み中...</p>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f0f9ff',
      padding: '24px'
    }}>
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>

        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px'
        }}>
          <div>
            <h1 style={{
              fontSize: '24px',
              fontWeight: 'bold',
              color: '#0369a1'
            }}>症例トレーニング</h1>
            <p style={{ color: '#64748b', fontSize: '14px' }}>
              学習したい疾患を選んでください
            </p>
          </div>
          <button
            onClick={function() { window.location.href = '/' }}
            style={{
              padding: '8px 16px',
              backgroundColor: 'white',
              color: '#64748b',
              border: '1px solid #cbd5e1',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '13px'
            }}
          >
            トップに戻る
          </button>
        </div>

        <div style={{
          display: 'flex',
          gap: '8px',
          flexWrap: 'wrap',
          marginBottom: '24px'
        }}>
          {categories.map(function(cat) {
            return (
              <button
                key={cat}
                onClick={function() { setSelectedCategory(cat) }}
                style={{
                  padding: '6px 16px',
                  borderRadius: '20px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: selectedCategory === cat ? '#0369a1' : 'white',
                  color: selectedCategory === cat ? 'white' : '#64748b',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: selectedCategory === cat ? 'bold' : 'normal'
                }}
              >
                {cat}
              </button>
            )
          })}
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: '16px'
        }}>
          {filteredDiseases.map(function(disease) {
            return (
              <div
                key={disease.id}
                style={{
                  backgroundColor: CATEGORY_COLORS[disease.category] || '#f8fafc',
                  borderRadius: '12px',
                  padding: '20px',
                  border: '1px solid #e2e8f0'
                }}
              >
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: '12px'
                }}>
                  <span style={{
                    fontSize: '11px',
                    color: '#64748b',
                    backgroundColor: 'rgba(255,255,255,0.7)',
                    padding: '2px 8px',
                    borderRadius: '10px'
                  }}>
                    {disease.category}
                  </span>
                  <span style={{
                    fontSize: '11px',
                    color: DIFFICULTY_COLOR[disease.difficulty_level],
                    fontWeight: 'bold'
                  }}>
                    {DIFFICULTY_LABEL[disease.difficulty_level]}
                  </span>
                </div>

                <h3 style={{
                  fontSize: '17px',
                  fontWeight: 'bold',
                  color: '#1e293b',
                  marginBottom: '4px'
                }}>
                  {disease.name_ja}
                </h3>
                <p style={{
                  fontSize: '12px',
                  color: '#64748b',
                  marginBottom: '16px'
                }}>
                  {disease.name_en}
                </p>

                <button
                  onClick={function() { handleStart(disease) }}
                  disabled={starting}
                  style={{
                    width: '100%',
                    padding: '10px',
                    backgroundColor: starting ? '#93c5fd' : '#0369a1',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: starting ? 'not-allowed' : 'pointer',
                    fontSize: '14px',
                    fontWeight: 'bold'
                  }}
                >
                  {starting ? '準備中...' : 'トレーニング開始'}
                </button>
              </div>
            )
          })}
        </div>

        {filteredDiseases.length === 0 && (
          <div style={{
            textAlign: 'center',
            padding: '48px',
            color: '#94a3b8'
          }}>
            <p>該当する疾患がありません</p>
          </div>
        )}
      </div>

      {starting && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '16px',
            padding: '32px',
            textAlign: 'center'
          }}>
            <p style={{
              fontSize: '18px',
              color: '#0369a1',
              fontWeight: 'bold'
            }}>症例を生成中...</p>
            <p style={{
              fontSize: '14px',
              color: '#64748b',
              marginTop: '8px'
            }}>しばらくお待ちください</p>
          </div>
        </div>
      )}
    </div>
  )
}
