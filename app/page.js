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
  const [authTab, setAuthTab] = useState('login')
  const [recentUpdates, setRecentUpdates] = useState([])

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

    // Fetch latest updates for login screen
    async function fetchRecentUpdates() {
      try {
        const res = await fetch('/api/updates?limit=5')
        const d = await res.json()
        if (d.updates) setRecentUpdates(d.updates)
      } catch (e) {}
    }
    fetchRecentUpdates()

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
    if (authTab === 'signup') {
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
      backgroundColor: '#f8fafc',
      padding: '20px 16px 40px'
    }}>
      <div style={{ maxWidth: '440px', margin: '0 auto', paddingTop: '24px' }}>

        {/* ロゴ画像（後で /public/logo.png に差し替え可能） */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '14px' }}>
          <div style={{
            width: '180px', height: '180px',
            borderRadius: '50%',
            backgroundColor: '#eff6ff',
            border: '4px solid white',
            boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden'
          }}>
            <img
              src="/logo.png"
              alt="PC Training"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={function(e) {
                e.target.style.display = 'none'
                if (e.target.nextElementSibling) e.target.nextElementSibling.style.display = 'flex'
              }}
            />
            <div style={{ display: 'none', fontSize: '72px', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>🩺</div>
          </div>
        </div>

        {/* アプリ名 */}
        <h1 style={{ fontSize: '30px', fontWeight: 'bold', textAlign: 'center', color: '#1e293b', margin: '0 0 4px' }}>
          PC Training
        </h1>
        <p style={{ fontSize: '12px', textAlign: 'center', color: '#64748b', margin: '0 0 24px' }}>
          プライマリケア外来研修シミュレーター
        </p>

        {/* タブ切替 */}
        <div style={{ display: 'flex', gap: '0', marginBottom: '16px', backgroundColor: '#f1f5f9', borderRadius: '999px', padding: '4px' }}>
          {['login', 'signup', 'demo'].map(function(t) {
            const labels = { login: 'ログイン', signup: '新規登録', demo: 'お試し' }
            const active = authTab === t
            return (
              <button key={t} onClick={function() { setAuthTab(t); setMessage('') }}
                style={{
                  flex: 1, padding: '10px',
                  backgroundColor: active ? '#2563eb' : 'transparent',
                  color: active ? 'white' : '#64748b',
                  border: 'none', borderRadius: '999px',
                  cursor: 'pointer', fontSize: '13px', fontWeight: 'bold',
                  transition: 'all 0.15s'
                }}>
                {labels[t]}
              </button>
            )
          })}
        </div>

        {/* タブコンテンツ */}
        <div style={{ backgroundColor: 'white', borderRadius: '14px', padding: '20px', border: '1px solid #e2e8f0' }}>
          {authTab === 'demo' ? (
            <div>
              <h2 style={{ fontSize: '15px', fontWeight: 'bold', color: '#1e293b', margin: '0 0 12px' }}>アカウント登録なしで体験</h2>
              <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 14px', lineHeight: 1.7 }}>
                モデル症例 <b>3 例まで</b>体験できます。<br />
                完遂したデータは保存されず、ログアウトでリセットされます。
              </p>
              <ul style={{ fontSize: '11px', color: '#64748b', margin: '0 0 16px', padding: '0 0 0 18px', lineHeight: 1.8 }}>
                <li>ランダム生成は利用不可</li>
                <li>リトライ機能は利用不可</li>
                <li>グループ機能は利用不可</li>
              </ul>
              <button onClick={handleDemo} disabled={authLoading}
                style={{
                  width: '100%', padding: '12px',
                  backgroundColor: '#059669', color: 'white',
                  border: 'none', borderRadius: '8px',
                  fontSize: '14px', fontWeight: 'bold',
                  cursor: authLoading ? 'not-allowed' : 'pointer'
                }}>
                {authLoading ? '読み込み中...' : '🎯 デモを試す'}
              </button>
              {message && (
                <p style={{ fontSize: '12px', color: message.indexOf('エラー') >= 0 ? '#dc2626' : '#059669', marginTop: '10px', textAlign: 'center' }}>
                  {message}
                </p>
              )}
            </div>
          ) : (
            <div>
              <h2 style={{ fontSize: '15px', fontWeight: 'bold', color: '#1e293b', margin: '0 0 14px' }}>
                {authTab === 'login' ? 'アカウントでログイン' : '新規アカウント作成'}
              </h2>

              <input
                type="email"
                value={email}
                onChange={function(e) { setEmail(e.target.value) }}
                placeholder="メールアドレス"
                style={{
                  width: '100%', padding: '11px 14px',
                  border: '1px solid #cbd5e1', borderRadius: '8px',
                  fontSize: '14px', marginBottom: '10px',
                  boxSizing: 'border-box', backgroundColor: '#f8fafc',
                  outline: 'none'
                }} />

              <div style={{ position: 'relative', marginBottom: '14px' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={function(e) { setPassword(e.target.value) }}
                  placeholder="パスワード"
                  style={{
                    width: '100%', padding: '11px 60px 11px 14px',
                    border: '1px solid #cbd5e1', borderRadius: '8px',
                    fontSize: '14px',
                    boxSizing: 'border-box', backgroundColor: '#f8fafc',
                    outline: 'none'
                  }} />
                <button type="button"
                  onClick={function() { setShowPassword(!showPassword) }}
                  style={{
                    position: 'absolute', right: '8px', top: '50%',
                    transform: 'translateY(-50%)', background: 'transparent',
                    border: 'none', cursor: 'pointer', fontSize: '12px',
                    color: '#64748b', padding: '4px 8px'
                  }}>
                  {showPassword ? '隠す' : '表示'}
                </button>
              </div>

              <button onClick={handleAuth} disabled={authLoading}
                style={{
                  width: '100%', padding: '12px',
                  backgroundColor: '#2563eb', color: 'white',
                  border: 'none', borderRadius: '8px',
                  fontSize: '14px', fontWeight: 'bold',
                  cursor: authLoading ? 'not-allowed' : 'pointer'
                }}>
                {authLoading ? '処理中...' : (authTab === 'signup' ? '新規登録' : 'ログイン')}
              </button>

              {message && (
                <p style={{
                  fontSize: '12px',
                  color: message.indexOf('エラー') >= 0 ? '#dc2626' : '#059669',
                  marginTop: '10px', textAlign: 'center'
                }}>{message}</p>
              )}

              <p style={{ textAlign: 'center', fontSize: '12px', color: '#64748b', marginTop: '14px' }}>
                {authTab === 'login'
                  ? <span>アカウントをお持ちでない方は <span onClick={function() { setAuthTab('signup'); setMessage('') }} style={{ color: '#059669', fontWeight: 'bold', cursor: 'pointer' }}>新規登録</span></span>
                  : <span>すでにアカウントをお持ちの方は <span onClick={function() { setAuthTab('login'); setMessage('') }} style={{ color: '#2563eb', fontWeight: 'bold', cursor: 'pointer' }}>ログイン</span></span>
                }
              </p>
            </div>
          )}
        </div>

        {/* 最新のアップデート */}
        {recentUpdates.length > 0 && (
          <div style={{ marginTop: '18px', backgroundColor: 'white', borderRadius: '14px', padding: '16px 20px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 'bold', color: '#1e293b', margin: '0 0 10px' }}>
              📰 最新のアップデート
            </h3>
            {recentUpdates.slice(0, 5).map(function(u) {
              const catColors = {
                '機能追加': { bg: '#dbeafe', text: '#1e40af' },
                '修正': { bg: '#fed7aa', text: '#9a3412' },
                '改善': { bg: '#dcfce7', text: '#166534' },
                'その他': { bg: '#f1f5f9', text: '#475569' }
              }
              const c = catColors[u.category] || catColors['その他']
              return (
                <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                  {u.category ? (
                    <span style={{ padding: '2px 8px', backgroundColor: c.bg, color: c.text, borderRadius: '4px', fontSize: '10px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>{u.category}</span>
                  ) : (
                    <span style={{ padding: '2px 8px', backgroundColor: '#f1f5f9', color: '#64748b', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>{u.version}</span>
                  )}
                  <span style={{ fontSize: '12px', color: '#334155', flex: 1 }}>{u.title}</span>
                </div>
              )
            })}
            <div style={{ marginTop: '8px', textAlign: 'right' }}>
              <a href="/updates" style={{ fontSize: '11px', color: '#2563eb', textDecoration: 'none' }}>すべて見る →</a>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
