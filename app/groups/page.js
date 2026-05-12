'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../lib/supabase'

export default function GroupsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState(null)
  const [groups, setGroups] = useState([])
  const [error, setError] = useState(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [joinOpen, setJoinOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  // Create form
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  // Join form
  const [joinCode, setJoinCode] = useState('')

  useEffect(function() {
    async function load() {
      const session = await supabase.auth.getSession()
      const uid = session?.data?.session?.user?.id
      if (!uid) { router.push('/'); return }
      setUserId(uid)

      // プロフィール確認
      try {
        const pRes = await fetch('/api/user-profile?userId=' + uid)
        const pData = await pRes.json()
        if (!pData.profile) {
          router.push('/profile/setup?next=/groups')
          return
        }
        // last_active を更新
        fetch('/api/user-profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: uid, touch_only: true })
        }).catch(function() {})
      } catch (e) {}

      // グループ一覧取得
      try {
        const res = await fetch('/api/groups?userId=' + uid)
        const d = await res.json()
        if (d.error) { setError(d.error); return }
        setGroups(d.groups || [])
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function handleCreate() {
    if (!newName.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userId, name: newName, description: newDesc })
      })
      const d = await res.json()
      if (d.error) { alert('作成失敗: ' + d.error); setSubmitting(false); return }
      router.push('/groups/' + d.group.id)
    } catch (e) {
      alert('エラー: ' + e.message)
      setSubmitting(false)
    }
  }

  async function handleJoin() {
    if (!joinCode.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/groups/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userId, inviteCode: joinCode })
      })
      const d = await res.json()
      if (d.error && !d.alreadyMember) {
        alert(d.error)
        setSubmitting(false)
        return
      }
      if (d.alreadyMember) {
        alert('既にこのグループに参加しています')
      }
      router.push('/groups/' + d.group.id)
    } catch (e) {
      alert('エラー: ' + e.message)
      setSubmitting(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f9ff' }}>
      <div style={{ maxWidth: '880px', margin: '0 auto', padding: '24px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '8px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: 'bold', color: '#0369a1', margin: 0 }}>👥 グループ</h1>
          <button onClick={function() { router.push('/') }}
            style={{ padding: '8px 14px', backgroundColor: 'white', color: '#64748b', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>
            ← トップへ
          </button>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <button onClick={function() { setCreateOpen(true) }}
            style={{ padding: '10px 18px', backgroundColor: '#0369a1', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>
            ➕ 新しいグループを作成
          </button>
          <button onClick={function() { setJoinOpen(true) }}
            style={{ padding: '10px 18px', backgroundColor: 'white', color: '#0369a1', border: '1px solid #0369a1', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>
            🔑 招待コードで参加
          </button>
        </div>

        {loading && <p style={{ color: '#64748b' }}>読み込み中…</p>}
        {error && <p style={{ color: '#dc2626' }}>エラー: {error}</p>}

        {!loading && !error && groups.length === 0 && (
          <div style={{ backgroundColor: 'white', borderRadius: '10px', padding: '40px', textAlign: 'center', border: '1px solid #e2e8f0' }}>
            <p style={{ fontSize: '40px', margin: '0 0 12px' }}>👥</p>
            <p style={{ fontSize: '14px', color: '#64748b', margin: '0 0 8px' }}>まだグループに参加していません。</p>
            <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>新規作成または招待コードで参加してみましょう。</p>
          </div>
        )}

        {!loading && !error && groups.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {groups.map(function(g) {
              return (
                <div key={g.id} onClick={function() { router.push('/groups/' + g.id) }}
                  style={{ backgroundColor: 'white', borderRadius: '10px', padding: '16px', border: '1px solid #e2e8f0', cursor: 'pointer', transition: 'all 0.15s' }}
                  onMouseEnter={function(e) { e.currentTarget.style.borderColor = '#0369a1'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(3,105,161,0.12)' }}
                  onMouseLeave={function(e) { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = 'none' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                    <div style={{ flex: 1 }}>
                      <h3 style={{ fontSize: '15px', fontWeight: 'bold', color: '#1e293b', margin: '0 0 4px' }}>
                        {g.name}
                        {g.my_role === 'admin' && (
                          <span style={{ fontSize: '10px', backgroundColor: '#fef3c7', color: '#92400e', padding: '1px 6px', borderRadius: '4px', marginLeft: '6px', fontWeight: 'normal' }}>管理者</span>
                        )}
                      </h3>
                      {g.description && (
                        <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 4px' }}>{g.description}</p>
                      )}
                      <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0 }}>
                        メンバー {g.member_count} 名 ・ 参加 {new Date(g.joined_at).toLocaleDateString('ja-JP')}
                      </p>
                    </div>
                    <span style={{ color: '#94a3b8' }}>→</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* 新規作成モーダル */}
        {createOpen && (
          <div onClick={function() { if (!submitting) setCreateOpen(false) }}
            style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}>
            <div onClick={function(e) { e.stopPropagation() }}
              style={{ backgroundColor: 'white', borderRadius: '12px', maxWidth: '440px', width: '100%', padding: '20px' }}>
              <h2 style={{ fontSize: '17px', fontWeight: 'bold', color: '#0369a1', margin: '0 0 12px' }}>➕ 新しいグループを作成</h2>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#1e293b', marginBottom: '4px' }}>グループ名 *</label>
              <input type="text" value={newName} onChange={function(e) { setNewName(e.target.value) }}
                placeholder="例: 京都プライマリケア研修会"
                maxLength={30}
                style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '14px', marginBottom: '12px', boxSizing: 'border-box' }} />
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#1e293b', marginBottom: '4px' }}>説明（任意）</label>
              <textarea value={newDesc} onChange={function(e) { setNewDesc(e.target.value) }}
                placeholder="例: 当院の専攻医・指導医による研修記録共有"
                rows={3}
                maxLength={200}
                style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', marginBottom: '16px', boxSizing: 'border-box', resize: 'vertical' }} />
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button onClick={function() { setCreateOpen(false) }} disabled={submitting}
                  style={{ padding: '8px 14px', backgroundColor: 'white', color: '#64748b', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>
                  キャンセル
                </button>
                <button onClick={handleCreate} disabled={!newName.trim() || submitting}
                  style={{ padding: '8px 14px', backgroundColor: '#0369a1', color: 'white', border: 'none', borderRadius: '6px', cursor: submitting ? 'wait' : 'pointer', fontSize: '13px', fontWeight: 'bold', opacity: !newName.trim() ? 0.5 : 1 }}>
                  {submitting ? '作成中…' : '作成'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 招待コード参加モーダル */}
        {joinOpen && (
          <div onClick={function() { if (!submitting) setJoinOpen(false) }}
            style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}>
            <div onClick={function(e) { e.stopPropagation() }}
              style={{ backgroundColor: 'white', borderRadius: '12px', maxWidth: '400px', width: '100%', padding: '20px' }}>
              <h2 style={{ fontSize: '17px', fontWeight: 'bold', color: '#0369a1', margin: '0 0 12px' }}>🔑 招待コードで参加</h2>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#1e293b', marginBottom: '4px' }}>招待コード (8文字)</label>
              <input type="text" value={joinCode}
                onChange={function(e) { setJoinCode(e.target.value.toUpperCase()) }}
                placeholder="例: ABCD1234"
                maxLength={8}
                style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '15px', marginBottom: '16px', boxSizing: 'border-box', letterSpacing: '2px', fontFamily: 'monospace' }} />
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button onClick={function() { setJoinOpen(false) }} disabled={submitting}
                  style={{ padding: '8px 14px', backgroundColor: 'white', color: '#64748b', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>
                  キャンセル
                </button>
                <button onClick={handleJoin} disabled={!joinCode.trim() || submitting}
                  style={{ padding: '8px 14px', backgroundColor: '#0369a1', color: 'white', border: 'none', borderRadius: '6px', cursor: submitting ? 'wait' : 'pointer', fontSize: '13px', fontWeight: 'bold', opacity: !joinCode.trim() ? 0.5 : 1 }}>
                  {submitting ? '参加中…' : '参加'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
