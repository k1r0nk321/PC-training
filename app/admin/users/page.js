'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'

function timeAgo(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'たった今'
  if (m < 60) return m + '分前'
  const h = Math.floor(m / 60)
  if (h < 24) return h + '時間前'
  const days = Math.floor(h / 24)
  if (days < 30) return days + '日前'
  return d.toLocaleDateString('ja-JP')
}

const SORT_OPTIONS = [
  { value: 'last_active_at', label: '最終ログイン日 (新→古)' },
  { value: 'pass_count', label: '合格症例数 (多→少)' },
  { value: 'completed_diseases', label: '達成疾患数 (多→少)' },
  { value: 'created_at', label: '登録日 (新→古)' },
  { value: 'real_name', label: '本名 (あ→ん)' },
]

export default function AdminUsersPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState(false)
  const [users, setUsers] = useState([])
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('last_active_at')
  const [showAnonymous, setShowAnonymous] = useState(false)

  useEffect(function() {
    async function init() {
      const session = await supabase.auth.getSession()
      const u = session?.data?.session?.user
      if (!u) { router.push('/'); return }
      const r = await fetch('/api/user-profile?userId=' + u.id)
      const d = await r.json()
      if (!(d.profile && d.profile.role === 'admin')) {
        setLoading(false); return
      }
      setAuthorized(true)
      try {
        const res = await fetch('/api/admin/users?userId=' + u.id)
        const d2 = await res.json()
        if (!d2.error) setUsers(d2.users || [])
      } catch (e) {}
      setLoading(false)
    }
    init()
  }, [])

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>読み込み中…</div>
  if (!authorized) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <p style={{ color: '#dc2626' }}>管理者権限が必要です</p>
        <button onClick={function() { router.push('/') }} style={{ padding: '8px 14px', marginTop: '12px' }}>トップへ</button>
      </div>
    )
  }

  const filtered = users.filter(function(u) {
    if (!showAnonymous && u.is_anonymous) return false
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (u.real_name || '').toLowerCase().includes(q)
      || (u.email || '').toLowerCase().includes(q)
      || (u.affiliation || '').toLowerCase().includes(q)
      || (u.handle_name || '').toLowerCase().includes(q)
  })

  const sorted = [...filtered].sort(function(a, b) {
    if (sortBy === 'real_name') return (a.real_name || '').localeCompare(b.real_name || '', 'ja')
    if (sortBy === 'last_active_at' || sortBy === 'created_at') {
      const av = a[sortBy] ? new Date(a[sortBy]).getTime() : 0
      const bv = b[sortBy] ? new Date(b[sortBy]).getTime() : 0
      return bv - av
    }
    return (b[sortBy] || 0) - (a[sortBy] || 0)
  })

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f9ff', padding: '24px' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: 'bold', color: '#0369a1', margin: 0 }}>
            👥 利用者一覧
            <span style={{ fontSize: '13px', color: '#64748b', marginLeft: '10px' }}>({filtered.length} / {users.length} 件)</span>
          </h1>
          <button onClick={function() { router.push('/admin') }}
            style={{ padding: '8px 14px', backgroundColor: 'white', color: '#64748b', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>
            ← 管理者
          </button>
        </div>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={search} onChange={function(e) { setSearch(e.target.value) }}
            placeholder="🔍 本名・メール・所属で検索"
            style={{ flex: '1 0 200px', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px' }} />
          <select value={sortBy} onChange={function(e) { setSortBy(e.target.value) }}
            style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', backgroundColor: 'white' }}>
            {SORT_OPTIONS.map(function(o) { return <option key={o.value} value={o.value}>{o.label}</option> })}
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#475569' }}>
            <input type="checkbox" checked={showAnonymous} onChange={function(e) { setShowAnonymous(e.target.checked) }} />
            デモユーザーも表示
          </label>
        </div>

        <div style={{ backgroundColor: 'white', borderRadius: '10px', overflow: 'auto', border: '1px solid #e2e8f0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', minWidth: '900px' }}>
            <thead style={{ backgroundColor: '#f8fafc' }}>
              <tr>
                <th style={thStyle}>本名 / ハンドル</th>
                <th style={thStyle}>身分</th>
                <th style={thStyle}>所属</th>
                <th style={thStyle}>メール</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>権限</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>合格数</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>達成疾患数</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>挑戦数</th>
                <th style={thStyle}>最終ログイン</th>
                <th style={thStyle}>登録日</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(function(u) {
                return (
                  <tr key={u.user_id} style={{ borderTop: '1px solid #e2e8f0' }}>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 'bold', color: '#1e293b' }}>
                        {u.real_name || '—'}
                        {u.is_anonymous && <span style={{ marginLeft: '4px', fontSize: '9px', padding: '1px 5px', backgroundColor: '#fef3c7', color: '#92400e', borderRadius: '4px' }}>デモ</span>}
                      </div>
                      {u.handle_name && <div style={{ fontSize: '10px', color: '#94a3b8' }}>@{u.handle_name}</div>}
                    </td>
                    <td style={tdStyle}>{u.position || '—'}</td>
                    <td style={tdStyle}>{u.affiliation || '—'}</td>
                    <td style={tdStyle}>{u.email}</td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      {u.role === 'admin' ? <span style={{ padding: '2px 6px', backgroundColor: '#fef3c7', color: '#92400e', borderRadius: '4px', fontWeight: 'bold', fontSize: '10px' }}>admin</span> : <span style={{ color: '#94a3b8', fontSize: '10px' }}>user</span>}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 'bold', color: '#059669' }}>{u.pass_count}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: '#0369a1' }}>{u.completed_diseases}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: '#64748b' }}>{u.total_completed}</td>
                    <td style={tdStyle}>{timeAgo(u.last_active_at)}</td>
                    <td style={tdStyle}>{u.created_at ? new Date(u.created_at).toLocaleDateString('ja-JP') : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {sorted.length === 0 && (
            <p style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', fontSize: '13px' }}>該当ユーザーがいません</p>
          )}
        </div>
      </div>
    </div>
  )
}

const thStyle = { padding: '10px 12px', textAlign: 'left', fontWeight: 'bold', color: '#475569', fontSize: '11px', whiteSpace: 'nowrap' }
const tdStyle = { padding: '10px 12px', color: '#334155', whiteSpace: 'nowrap' }
