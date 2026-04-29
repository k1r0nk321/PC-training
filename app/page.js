'use client'

import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'

export default function Home() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [message, setMessage] = useState('')
  const [authLoading, setAuthLoading] = useState(false)

  useEffect(function() {
    supabase.auth.getSession().then(function({ data: { session } }) {
      setUser(session?.user ?? null)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      function(_event, session) {
        setUser(session?.user ?? null)
      }
    )
    return function() { subscription.unsubscribe() }
  }, [])

  async function handleAuth() {
    setAuthLoading(true)
    setMessage('')
    if (isSignUp) {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) {
        setMessage('エラー：' + error.message)
      } else {
        setMessage('確認メールを送信しました。メールをご確認ください。')
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setMessage('エラー：メールアドレスまたはパスワードが正しくありません。')
      }
    }
    setAuthLoading(false)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
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

  if (user) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#f0f9ff',
        padding: '24px'
      }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '32px'
          }}>
            <div>
              <h1 style={{
                fontSize: '28px',
                fontWeight: 'bold',
                color: '#0369a1'
              }}>PC Training</h1>
              <p style={{ color: '#64748b', fontSize: '14px' }}>
                プライマリケア外来研修シミュレーター
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ color: '#64748b', fontSize: '13px', marginBottom: '8px' }}>
                {user.email}
              </p>
              <button
                onClick={handleSignOut}
                style={{
                  padding: '6px 16px',
                  backgroundColor: 'white',
                  color: '#64748b',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '13px'
                }}
              >
                ログアウト
              </button>
            </div>
          </div>

          <div style={{
            backgroundColor: '#dbeafe',
            borderRadius: '12px',
            padding: '24px',
            marginBottom: '24px'
          }}>
            <h2 style={{
              fontSize: '18px',
              fontWeight: 'bold',
              color: '#1e40af',
              marginBottom: '8px'
            }}>外来シミュレーションへようこそ</h2>
            <p style={{ color: '#1e40af', fontSize: '14px' }}>
              実際の外来診療を想定した3回受診シミュレーションで、
              プライマリケアの診療スキルを磨きましょう。
            </p>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '16px'
          }}>
<div
  onClick={function() { window.location.href = '/cases' }}
  style={{
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '24px',
    border: '2px solid #0369a1',
    cursor: 'pointer'
  }}
>
  <div style={{
    fontSize: '32px',
    marginBottom: '12px'
  }}>🏥</div>
  <h3 style={{
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: '8px'
  }}>症例トレーニング</h3>
  <p style={{
    fontSize: '13px',
    color: '#64748b'
  }}>
    高血圧・糖尿病・脂質異常症など、
    プライマリケアの代表疾患を学ぶ
  </p>
  <p style={{
    fontSize: '12px',
    color: '#0369a1',
    fontWeight: 'bold',
    marginTop: '12px'
  }}>クリックして開始 →</p>
</div>

            <div style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '24px',
              border: '1px solid #e2e8f0',
              opacity: '0.6'
            }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>📊</div>
              <h3 style={{
                fontSize: '16px',
                fontWeight: 'bold',
                color: '#1e293b',
                marginBottom: '8px'
              }}>成績確認</h3>
              <p style={{ fontSize: '13px', color: '#64748b' }}>
                これまでのトレーニング結果と
                フィードバックを確認する
              </p>
              <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '12px' }}>
                準備中
              </p>
            </div>

            <div style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '24px',
              border: '1px solid #e2e8f0',
              opacity: '0.6'
            }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>👥</div>
              <h3 style={{
                fontSize: '16px',
                fontWeight: 'bold',
                color: '#1e293b',
                marginBottom: '8px'
              }}>グループ</h3>
              <p style={{ fontSize: '13px', color: '#64748b' }}>
                研修グループを作成・参加して
                メンバーの成績を比較する
              </p>
              <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '12px' }}>
                準備中
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f0f9ff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px'
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '16px',
        padding: '40px',
        width: '100%',
        maxWidth: '400px',
        border: '1px solid #e2e8f0',
        boxShadow: '0 4px 6px rgba(0,0,0,0.05)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h1 style={{
            fontSize: '28px',
            fontWeight: 'bold',
            color: '#0369a1',
            marginBottom: '8px'
          }}>PC Training</h1>
          <p style={{ color: '#64748b', fontSize: '14px' }}>
            プライマリケア外来研修シミュレーター
          </p>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{
            display: 'block',
            fontSize: '13px',
            color: '#475569',
            marginBottom: '6px',
            fontWeight: '500'
          }}>
            メールアドレス
          </label>
          <input
            type="email"
            value={email}
            onChange={function(e) { setEmail(e.target.value) }}
            placeholder="example@email.com"
            style={{
              width: '100%',
              padding: '10px 14px',
              border: '1px solid #cbd5e1',
              borderRadius: '8px',
              fontSize: '14px',
              outline: 'none'
            }}
          />
        </div>

        <div style={{ marginBottom: '24px' }}>
          <label style={{
            display: 'block',
            fontSize: '13px',
            color: '#475569',
            marginBottom: '6px',
            fontWeight: '500'
          }}>
            パスワード
          </label>
          <input
            type="password"
            value={password}
            onChange={function(e) { setPassword(e.target.value) }}
            placeholder="パスワードを入力"
            style={{
              width: '100%',
              padding: '10px 14px',
              border: '1px solid #cbd5e1',
              borderRadius: '8px',
              fontSize: '14px',
              outline: 'none'
            }}
          />
        </div>

        {message && (
          <div style={{
            padding: '12px',
            borderRadius: '8px',
            marginBottom: '16px',
            backgroundColor: message.includes('エラー') ? '#fef2f2' : '#f0fdf4',
            color: message.includes('エラー') ? '#dc2626' : '#16a34a',
            fontSize: '13px'
          }}>
            {message}
          </div>
        )}

        <button
          onClick={handleAuth}
          disabled={authLoading}
          style={{
            width: '100%',
            padding: '12px',
            backgroundColor: authLoading ? '#93c5fd' : '#0369a1',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '15px',
            fontWeight: 'bold',
            cursor: authLoading ? 'not-allowed' : 'pointer',
            marginBottom: '16px'
          }}
        >
          {authLoading ? '処理中...' : (isSignUp ? '新規登録' : 'ログイン')}
        </button>

        <p style={{ textAlign: 'center', fontSize: '13px', color: '#64748b' }}>
          {isSignUp ? 'すでにアカウントをお持ちの方は' : 'アカウントをお持ちでない方は'}
          <button
            onClick={function() {
              setIsSignUp(!isSignUp)
              setMessage('')
            }}
            style={{
              background: 'none',
              border: 'none',
              color: '#0369a1',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 'bold',
              marginLeft: '4px'
            }}
          >
            {isSignUp ? 'ログイン' : '新規登録'}
          </button>
        </p>
      </div>
    </div>
  )
}
