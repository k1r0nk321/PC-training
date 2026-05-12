'use client'

import { useRouter } from 'next/navigation'

import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'

export default function Home() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [progress, setProgress] = useState(null)
  const [announcement, setAnnouncement] = useState(null)
  const [dismissedAnnouncements, setDismissedAnnouncements] = useState([])
  const [userProfile, setUserProfile] = useState(null)

  useEffect(function() {
    async function fetchProgress() {
      try {
        const session = await supabase.auth.getSession()
        const uid = session?.data?.session?.user?.id
        if (!uid) return
        const res = await fetch('/api/user-progress?userId=' + uid)
        const d = await res.json()
        if (!d.error) setProgress(d)
        // プロフィール取得（role 確認用）
        try {
          const pr = await fetch('/api/user-profile?userId=' + uid)
          const pd = await pr.json()
          if (pd.profile) setUserProfile(pd.profile)
        } catch (e) {}
      } catch (e) {}
    }
    fetchProgress()

    // Fetch latest announcement
    async function fetchAnnouncement() {
      try {
        const res = await fetch('/api/announcements?limit=1')
        const d = await res.json()
        if (d.announcements && d.announcements.length > 0) {
          setAnnouncement(d.announcements[0])
        }
      } catch (e) {}
    }
    fetchAnnouncement()

    // Load dismissed list from localStorage
    try {
      const raw = localStorage.getItem('pc_dismissed_announcements')
      if (raw) setDismissedAnnouncements(JSON.parse(raw))
    } catch (e) {}
  }, [])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
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

  function dismissAnnouncement(id) {
    const updated = [...dismissedAnnouncements, id]
    setDismissedAnnouncements(updated)
    try { localStorage.setItem('pc_dismissed_announcements', JSON.stringify(updated)) } catch (e) {}
  }

  async function handleDemo() {
    setAuthLoading(true)
    setMessage('')
    try {
      const { data, error } = await supabase.auth.signInAnonymously()
      if (error) {
        if (error.message && error.message.toLowerCase().indexOf('anonymous') >= 0) {
          setMessage('エラー：デモ機能は現在利用できません。管理者にお問い合わせください。')
        } else {
          setMessage('エラー：' + error.message)
        }
        setAuthLoading(false)
        return
      }
      // 成功時はuseEffectでuserが更新されTop画面に遷移
    } catch (e) {
      setMessage('エラー：' + e.message)
      setAuthLoading(false)
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
                {user.is_anonymous ? '🎯 デモユーザー' : user.email}
              </p>
              <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                {!user.is_anonymous && userProfile && userProfile.role === 'admin' && (
                  <button
                    onClick={function() { router.push('/admin') }}
                    style={{
                      padding: '6px 14px',
                      backgroundColor: '#fef3c7',
                      color: '#92400e',
                      border: '1px solid #d97706',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: 'bold'
                    }}
                    title="管理者モード"
                  >
                    🔧 管理者
                  </button>
                )}
                {!user.is_anonymous && (
                  <button
                    onClick={function() { router.push('/profile/edit') }}
                    style={{
                      padding: '6px 14px',
                      backgroundColor: 'white',
                      color: '#0369a1',
                      border: '1px solid #0369a1',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: 'bold'
                    }}
                    title="プロフィール編集"
                  >
                    ⚙ プロフィール
                  </button>
                )}
                <button
                  onClick={handleSignOut}
                  style={{
                    padding: '6px 14px',
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
          </div>

          {user.is_anonymous && (
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
                  デモモードで利用中
                </p>
                <p style={{ fontSize: '11px', color: '#047857', margin: 0 }}>
                  ログアウトすると進行状況はすべてリセットされます。グループ機能はご利用いただけません。
                </p>
              </div>
            </div>
          )}

          {announcement && !dismissedAnnouncements.includes(announcement.id) && (
            <div style={{
              backgroundColor: announcement.priority === 'urgent' ? '#fef2f2'
                : announcement.priority === 'high' ? '#fff7ed'
                : announcement.priority === 'low' ? '#f8fafc'
                : '#eff6ff',
              border: '1px solid ' + (
                announcement.priority === 'urgent' ? '#fecaca'
                : announcement.priority === 'high' ? '#fed7aa'
                : announcement.priority === 'low' ? '#cbd5e1'
                : '#bfdbfe'
              ),
              borderRadius: '10px',
              padding: '14px 16px',
              marginBottom: '16px',
              position: 'relative',
            }}>
              <button onClick={function() { dismissAnnouncement(announcement.id) }}
                style={{
                  position: 'absolute', top: '8px', right: '8px',
                  width: '24px', height: '24px', borderRadius: '50%',
                  border: 'none', backgroundColor: 'transparent',
                  cursor: 'pointer', fontSize: '14px',
                  color: '#94a3b8'
                }}
                title="このお知らせを閉じる">×</button>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', paddingRight: '24px' }}>
                <span style={{ fontSize: '18px' }}>
                  {announcement.priority === 'urgent' ? '🚨'
                    : announcement.priority === 'high' ? '⚠️'
                    : announcement.priority === 'low' ? '📌'
                    : '📢'}
                </span>
                <div style={{ flex: 1 }}>
                  <p style={{
                    fontSize: '14px', fontWeight: 'bold',
                    color: announcement.priority === 'urgent' ? '#991b1b'
                      : announcement.priority === 'high' ? '#9a3412'
                      : announcement.priority === 'low' ? '#475569'
                      : '#1e40af',
                    margin: '0 0 4px'
                  }}>
                    {announcement.title}
                  </p>
                  <p style={{ fontSize: '12px', color: '#475569', margin: '0 0 6px', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
                    {announcement.body.length > 200 ? announcement.body.substring(0, 200) + '…' : announcement.body}
                  </p>
                  <a href="/announcements" style={{ fontSize: '11px', color: '#0369a1', textDecoration: 'underline' }}>
                    お知らせ一覧を見る →
                  </a>
                </div>
              </div>
            </div>
          )}

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

            <div
              onClick={function() { router.push('/grades') }}
              style={{
                backgroundColor: 'white',
                borderRadius: '12px',
                padding: '24px',
                border: '1px solid #e2e8f0',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={function(e) { e.currentTarget.style.borderColor = '#0369a1'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(3,105,161,0.15)' }}
              onMouseLeave={function(e) { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = 'none' }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>📊</div>
              <h3 style={{
                fontSize: '16px',
                fontWeight: 'bold',
                color: '#1e293b',
                marginBottom: '8px'
              }}>成績確認</h3>
              {progress ? (
                <div>
                  <p style={{ fontSize: '11px', color: '#94a3b8', margin: '0 0 2px' }}>{progress.phase}フェーズ</p>
                  <p style={{ fontSize: '15px', color: '#0369a1', fontWeight: 'bold', margin: '0 0 6px' }}>
                    🏆 {progress.title}
                  </p>
                  <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>
                    合格 {progress.passCount} 例 ・ {progress.completedDiseases} 疾患達成
                  </p>
                </div>
              ) : (
                <p style={{ fontSize: '13px', color: '#64748b' }}>
                  これまでのトレーニング結果と
                  フィードバックを確認する
                </p>
              )}
              <p style={{
                fontSize: '12px',
                color: '#0369a1',
                fontWeight: 'bold',
                marginTop: '12px'
              }}>{progress ? '詳細を見る →' : 'クリックして開始 →'}</p>
            </div>

            <div
              onClick={function() {
                if (user.is_anonymous) {
                  alert('デモモードではグループ機能はご利用いただけません。本登録すると利用できます。')
                  return
                }
                router.push('/groups')
              }}
              style={{
                backgroundColor: 'white',
                borderRadius: '12px',
                padding: '24px',
                border: '1px solid #e2e8f0',
                cursor: user.is_anonymous ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                opacity: user.is_anonymous ? 0.6 : 1
              }}
              onMouseEnter={function(e) { if (!user.is_anonymous) { e.currentTarget.style.borderColor = '#0369a1'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(3,105,161,0.15)' } }}
              onMouseLeave={function(e) { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = 'none' }}>
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
              <p style={{
                fontSize: '12px',
                color: '#0369a1',
                fontWeight: 'bold',
                marginTop: '12px'
              }}>クリックして開始 →</p>
            </div>
          </div>

          <div style={{
            marginTop: '24px',
            padding: '16px',
            display: 'flex',
            justifyContent: 'center',
            gap: '12px',
            flexWrap: 'wrap',
          }}>
            <button onClick={function() { router.push('/updates') }}
              style={{
                padding: '8px 16px',
                backgroundColor: 'white',
                color: '#0369a1',
                border: '1px solid #0369a1',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}>
              📰 アップデート情報
            </button>
            <button onClick={function() { router.push('/announcements') }}
              style={{
                padding: '8px 16px',
                backgroundColor: 'white',
                color: '#475569',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}>
              📢 お知らせ一覧
            </button>
            <button onClick={function() { router.push('/terms') }}
              style={{
                padding: '8px 16px',
                backgroundColor: 'white',
                color: '#475569',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}>
              📋 利用規約
            </button>
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
          <div style={{ position: 'relative' }}>
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={function(e) { setPassword(e.target.value) }}
              placeholder="パスワードを入力"
              style={{
                width: '100%',
                padding: '10px 44px 10px 14px',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                fontSize: '14px',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
            <button
              type="button"
              onClick={function() { setShowPassword(!showPassword) }}
              title={showPassword ? 'パスワードを隠す' : 'パスワードを表示'}
              style={{
                position: 'absolute',
                right: '8px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontSize: '16px',
                padding: '4px 8px',
                color: '#64748b'
              }}
            >
              {showPassword ? '🙈' : '👁'}
            </button>
          </div>
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

        {/* デモ機能 */}
        <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #e2e8f0' }}>
          <p style={{ textAlign: 'center', fontSize: '11px', color: '#94a3b8', marginBottom: '10px' }}>
            アカウント登録せずに体験できます
          </p>
          <button
            onClick={handleDemo}
            disabled={authLoading}
            style={{
              width: '100%',
              padding: '10px',
              backgroundColor: 'white',
              color: '#059669',
              border: '1.5px solid #059669',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 'bold',
              cursor: authLoading ? 'not-allowed' : 'pointer'
            }}>
            🎯 デモを試す（データ保存なし）
          </button>
          <p style={{ textAlign: 'center', fontSize: '10px', color: '#94a3b8', marginTop: '8px', lineHeight: 1.5 }}>
            モデル症例のみ体験できます。<br />
            ログアウトすると進行状況はリセットされます。
          </p>
        </div>
      </div>
    </div>
  )
}
