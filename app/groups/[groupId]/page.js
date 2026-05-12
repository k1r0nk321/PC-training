'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'

const SORT_OPTIONS = [
  { key: 'rank', label: 'ランク順' },
  { key: 'pass_count', label: '合格症例数' },
  { key: 'completed_diseases', label: '達成疾患数' },
  { key: 'last_active_at', label: '直近活動' },
]

function formatRelative(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now - d
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return '今日'
  if (diffDays === 1) return '昨日'
  if (diffDays < 7) return diffDays + '日前'
  if (diffDays < 30) return Math.floor(diffDays / 7) + '週間前'
  return d.toLocaleDateString('ja-JP')
}

export default function GroupDetailPage({ params }) {
  const router = useRouter()
  const [groupId, setGroupId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState(null)
  const [group, setGroup] = useState(null)
  const [members, setMembers] = useState([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [error, setError] = useState(null)
  const [sortKey, setSortKey] = useState('rank')
  const [showInvite, setShowInvite] = useState(false)
  const [showLeave, setShowLeave] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(function() {
    async function load() {
      const resolved = await params
      const gid = resolved.groupId
      setGroupId(gid)

      const session = await supabase.auth.getSession()
      const uid = session?.data?.session?.user?.id
      if (!uid) { router.push('/'); return }
      setUserId(uid)

      try {
        const res = await fetch('/api/groups/' + gid + '?userId=' + uid)
        const d = await res.json()
        if (d.error) { setError(d.error); return }
        setGroup(d.group)
        setMembers(d.members || [])
        setIsAdmin(!!d.isAdmin)
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  function sortedMembers() {
    const sorted = [...members]
    if (sortKey === 'rank') {
      sorted.sort(function(a, b) {
        if (b.rank !== a.rank) return b.rank - a.rank
        return b.pass_count - a.pass_count
      })
    } else if (sortKey === 'pass_count') {
      sorted.sort(function(a, b) { return b.pass_count - a.pass_count })
    } else if (sortKey === 'completed_diseases') {
      sorted.sort(function(a, b) { return b.completed_diseases - a.completed_diseases })
    } else if (sortKey === 'last_active_at') {
      sorted.sort(function(a, b) {
        const ad = a.last_active_at ? new Date(a.last_active_at).getTime() : 0
        const bd = b.last_active_at ? new Date(b.last_active_at).getTime() : 0
        return bd - ad
      })
    }
    return sorted
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(group.invite_code)
      setCopied(true)
      setTimeout(function() { setCopied(false) }, 2000)
    } catch (e) {}
  }

  async function handleLeave() {
    try {
      const res = await fetch('/api/groups/' + groupId + '/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userId })
      })
      const d = await res.json()
      if (d.error) { alert(d.error); return }
      router.push('/groups')
    } catch (e) { alert('エラー: ' + e.message) }
  }

  async function handleDelete() {
    try {
      const res = await fetch('/api/groups/' + groupId + '?userId=' + userId, {
        method: 'DELETE'
      })
      const d = await res.json()
      if (d.error) { alert(d.error); return }
      router.push('/groups')
    } catch (e) { alert('エラー: ' + e.message) }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0f9ff' }}>
        <p style={{ color: '#64748b' }}>読み込み中…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', padding: '24px', backgroundColor: '#f0f9ff' }}>
        <p style={{ color: '#dc2626' }}>エラー: {error}</p>
        <button onClick={function() { router.push('/groups') }}>← グループ一覧へ</button>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f9ff' }}>
      <div style={{ maxWidth: '880px', margin: '0 auto', padding: '24px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', gap: '8px' }}>
          <button onClick={function() { router.push('/groups') }}
            style={{ padding: '8px 14px', backgroundColor: 'white', color: '#64748b', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>
            ← グループ一覧
          </button>
        </div>

        <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0', marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1 }}>
              <h1 style={{ fontSize: '20px', fontWeight: 'bold', color: '#0369a1', margin: '0 0 4px' }}>👥 {group.name}</h1>
              {group.description && (
                <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 8px' }}>{group.description}</p>
              )}
              <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0 }}>
                メンバー {members.length} 名
              </p>
            </div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <button onClick={function() { setShowInvite(true) }}
                style={{ padding: '6px 12px', backgroundColor: '#0369a1', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                🔑 招待コードを見る
              </button>
              <button onClick={function() { setShowLeave(true) }}
                style={{ padding: '6px 12px', backgroundColor: 'white', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>
                脱退
              </button>
              {isAdmin && (
                <button onClick={function() { setShowDelete(true) }}
                  style={{ padding: '6px 12px', backgroundColor: 'white', color: '#dc2626', border: '1px solid #dc2626', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                  🗑 解散
                </button>
              )}
            </div>
          </div>
        </div>

        <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '14px', border: '1px solid #e2e8f0', marginBottom: '8px' }}>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold' }}>並び順:</span>
            {SORT_OPTIONS.map(function(opt) {
              return (
                <button key={opt.key} onClick={function() { setSortKey(opt.key) }}
                  style={{
                    padding: '4px 10px', fontSize: '11px',
                    border: '1px solid ' + (sortKey === opt.key ? '#0369a1' : '#cbd5e1'),
                    backgroundColor: sortKey === opt.key ? '#0369a1' : 'white',
                    color: sortKey === opt.key ? 'white' : '#475569',
                    borderRadius: '999px', cursor: 'pointer', fontWeight: sortKey === opt.key ? 'bold' : 'normal'
                  }}>
                  {opt.label}
                </button>
              )
            })}
          </div>
        </div>

        <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr 100px 80px 80px 80px', alignItems: 'center', gap: '10px', padding: '10px 14px', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc', fontSize: '11px', fontWeight: 'bold', color: '#64748b' }}>
            <div></div>
            <div>名前 / 称号</div>
            <div style={{ textAlign: 'center' }}>挑戦</div>
            <div style={{ textAlign: 'center' }}>合格</div>
            <div style={{ textAlign: 'center' }}>達成疾患</div>
            <div style={{ textAlign: 'center' }}>直近活動</div>
          </div>
          {sortedMembers().map(function(m, idx) {
            const isMe = m.user_id === userId
            return (
              <div key={m.user_id} style={{
                display: 'grid', gridTemplateColumns: '40px 1fr 100px 80px 80px 80px',
                alignItems: 'center', gap: '10px', padding: '12px 14px',
                borderBottom: '1px solid #f1f5f9',
                backgroundColor: isMe ? '#eff6ff' : 'white',
                fontSize: '13px',
              }}>
                <div style={{ textAlign: 'center', fontSize: '13px', fontWeight: 'bold', color: idx < 3 ? '#0369a1' : '#94a3b8' }}>
                  {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '#' + (idx + 1)}
                </div>
                <div>
                  <div style={{ fontWeight: isMe ? 'bold' : 'normal', color: '#1e293b' }}>
                    {m.display_name}
                    {isMe && <span style={{ fontSize: '10px', color: '#0369a1', marginLeft: '6px' }}>(あなた)</span>}
                    {m.role === 'admin' && <span style={{ fontSize: '10px', backgroundColor: '#fef3c7', color: '#92400e', padding: '1px 6px', borderRadius: '4px', marginLeft: '6px', fontWeight: 'normal' }}>管理者</span>}
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>🏆 {m.title} (Rank {m.rank})</div>
                </div>
                <div style={{ textAlign: 'center', color: '#64748b' }}>{m.challenge_count} 例</div>
                <div style={{ textAlign: 'center', color: '#059669', fontWeight: 'bold' }}>{m.pass_count} 例</div>
                <div style={{ textAlign: 'center', color: '#0369a1', fontWeight: 'bold' }}>{m.completed_diseases} 疾患</div>
                <div style={{ textAlign: 'center', fontSize: '11px', color: '#94a3b8' }}>{formatRelative(m.last_active_at)}</div>
              </div>
            )
          })}
        </div>

        {/* 招待コード表示モーダル */}
        {showInvite && (
          <div onClick={function() { setShowInvite(false) }}
            style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}>
            <div onClick={function(e) { e.stopPropagation() }}
              style={{ backgroundColor: 'white', borderRadius: '12px', maxWidth: '400px', width: '100%', padding: '24px', textAlign: 'center' }}>
              <h2 style={{ fontSize: '17px', fontWeight: 'bold', color: '#0369a1', margin: '0 0 12px' }}>🔑 招待コード</h2>
              <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 16px' }}>このコードを共有して仲間を招待しましょう。</p>
              <div style={{
                fontSize: '28px', fontWeight: 'bold', fontFamily: 'monospace',
                letterSpacing: '4px', color: '#0369a1', padding: '14px',
                backgroundColor: '#eff6ff', borderRadius: '8px', marginBottom: '12px'
              }}>
                {group.invite_code}
              </div>
              <button onClick={handleCopy}
                style={{ padding: '8px 16px', backgroundColor: '#0369a1', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>
                {copied ? '✓ コピーしました' : '📋 クリップボードにコピー'}
              </button>
            </div>
          </div>
        )}

        {/* 脱退確認 */}
        {showLeave && (
          <div onClick={function() { setShowLeave(false) }}
            style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}>
            <div onClick={function(e) { e.stopPropagation() }}
              style={{ backgroundColor: 'white', borderRadius: '12px', maxWidth: '380px', width: '100%', padding: '20px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: '#1e293b', margin: '0 0 10px' }}>グループから脱退しますか？</h2>
              <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 16px' }}>「{group.name}」から脱退します。再度参加するには招待コードが必要です。</p>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button onClick={function() { setShowLeave(false) }}
                  style={{ padding: '8px 14px', backgroundColor: 'white', color: '#64748b', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>キャンセル</button>
                <button onClick={handleLeave}
                  style={{ padding: '8px 14px', backgroundColor: '#dc2626', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>脱退する</button>
              </div>
            </div>
          </div>
        )}

        {/* 解散確認（管理者のみ） */}
        {showDelete && (
          <div onClick={function() { setShowDelete(false) }}
            style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}>
            <div onClick={function(e) { e.stopPropagation() }}
              style={{ backgroundColor: 'white', borderRadius: '12px', maxWidth: '380px', width: '100%', padding: '20px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: '#dc2626', margin: '0 0 10px' }}>⚠️ グループを解散しますか？</h2>
              <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 16px' }}>
                「{group.name}」を完全に解散します。<br />
                全メンバーがグループから外され、招待コードも無効になります。<br />
                <b style={{ color: '#dc2626' }}>この操作は取り消せません。</b>
              </p>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button onClick={function() { setShowDelete(false) }}
                  style={{ padding: '8px 14px', backgroundColor: 'white', color: '#64748b', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>キャンセル</button>
                <button onClick={handleDelete}
                  style={{ padding: '8px 14px', backgroundColor: '#dc2626', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>解散する</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
