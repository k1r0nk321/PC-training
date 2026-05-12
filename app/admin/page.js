'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../lib/supabase'

export default function AdminDashboard() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState(false)
  const [profile, setProfile] = useState(null)

  useEffect(function() {
    async function check() {
      const session = await supabase.auth.getSession()
      const u = session?.data?.session?.user
      if (!u) { router.push('/'); return }
      try {
        const res = await fetch('/api/user-profile?userId=' + u.id)
        const d = await res.json()
        if (d.profile && d.profile.role === 'admin') {
          setProfile(d.profile)
          setAuthorized(true)
        } else {
          setLoading(false)
          return
        }
      } catch (e) {}
      setLoading(false)
    }
    check()
  }, [])

  if (loading) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0f9ff' }}><p style={{ color: '#64748b' }}>読み込み中…</p></div>
  }

  if (!authorized) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0f9ff', padding: '20px' }}>
        <div style={{ maxWidth: '440px', backgroundColor: 'white', borderRadius: '14px', padding: '28px', textAlign: 'center', border: '1px solid #fecaca' }}>
          <p style={{ fontSize: '40px', margin: '0 0 12px' }}>🔒</p>
          <h1 style={{ fontSize: '18px', fontWeight: 'bold', color: '#dc2626', margin: '0 0 12px' }}>管理者権限が必要です</h1>
          <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 16px' }}>このページは管理者のみアクセス可能です。</p>
          <button onClick={function() { router.push('/') }}
            style={{ padding: '10px 18px', backgroundColor: '#0369a1', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>
            トップへ戻る
          </button>
        </div>
      </div>
    )
  }

  const cardStyle = {
    backgroundColor: 'white', borderRadius: '12px', padding: '24px',
    border: '1px solid #e2e8f0', cursor: 'pointer', transition: 'all 0.2s',
    textAlign: 'center'
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f9ff', padding: '24px' }}>
      <div style={{ maxWidth: '880px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#0369a1', margin: 0 }}>🔧 管理者モード</h1>
            <p style={{ fontSize: '12px', color: '#64748b', margin: '4px 0 0' }}>
              ようこそ、{profile.real_name} さん（管理者）
            </p>
          </div>
          <button onClick={function() { router.push('/') }}
            style={{ padding: '8px 14px', backgroundColor: 'white', color: '#64748b', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>
            ← トップへ
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '14px' }}>
          <div onClick={function() { router.push('/admin/announcements') }} style={cardStyle}
            onMouseEnter={function(e) { e.currentTarget.style.borderColor = '#0369a1'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(3,105,161,0.15)' }}
            onMouseLeave={function(e) { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = 'none' }}>
            <div style={{ fontSize: '40px', marginBottom: '10px' }}>📢</div>
            <h2 style={{ fontSize: '15px', fontWeight: 'bold', color: '#1e293b', margin: '0 0 6px' }}>お知らせ管理</h2>
            <p style={{ fontSize: '11px', color: '#64748b', margin: 0 }}>トップに掲示するお知らせの作成・編集・削除</p>
          </div>

          <div onClick={function() { router.push('/admin/updates') }} style={cardStyle}
            onMouseEnter={function(e) { e.currentTarget.style.borderColor = '#0369a1'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(3,105,161,0.15)' }}
            onMouseLeave={function(e) { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = 'none' }}>
            <div style={{ fontSize: '40px', marginBottom: '10px' }}>📰</div>
            <h2 style={{ fontSize: '15px', fontWeight: 'bold', color: '#1e293b', margin: '0 0 6px' }}>アップデート管理</h2>
            <p style={{ fontSize: '11px', color: '#64748b', margin: 0 }}>アップデート履歴の追加・編集・削除</p>
          </div>

          <div onClick={function() { router.push('/admin/users') }} style={cardStyle}
            onMouseEnter={function(e) { e.currentTarget.style.borderColor = '#0369a1'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(3,105,161,0.15)' }}
            onMouseLeave={function(e) { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = 'none' }}>
            <div style={{ fontSize: '40px', marginBottom: '10px' }}>👥</div>
            <h2 style={{ fontSize: '15px', fontWeight: 'bold', color: '#1e293b', margin: '0 0 6px' }}>利用者一覧</h2>
            <p style={{ fontSize: '11px', color: '#64748b', margin: 0 }}>登録者の進捗・最終ログイン日・所属など</p>
          </div>
        </div>
      </div>
    </div>
  )
}
