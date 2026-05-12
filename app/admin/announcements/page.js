'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'

const PRIORITIES = [
  { value: 'low', label: '参考', icon: '📌' },
  { value: 'normal', label: '通常', icon: '📢' },
  { value: 'high', label: '重要', icon: '⚠️' },
  { value: 'urgent', label: '緊急', icon: '🚨' },
]

export default function AdminAnnouncementsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState(false)
  const [userId, setUserId] = useState(null)
  const [items, setItems] = useState([])
  const [editing, setEditing] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)

  // form state
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [priority, setPriority] = useState('normal')
  const [published, setPublished] = useState(true)
  const [endsAt, setEndsAt] = useState('')
  const [error, setError] = useState(null)

  useEffect(function() {
    async function init() {
      const session = await supabase.auth.getSession()
      const u = session?.data?.session?.user
      if (!u) { router.push('/'); return }
      setUserId(u.id)
      const r = await fetch('/api/user-profile?userId=' + u.id)
      const d = await r.json()
      if (d.profile && d.profile.role === 'admin') {
        setAuthorized(true)
        await loadItems(u.id)
      }
      setLoading(false)
    }
    init()
  }, [])

  async function loadItems(uid) {
    try {
      const r = await fetch('/api/announcements?admin=1&userId=' + uid + '&limit=100')
      const d = await r.json()
      if (!d.error) setItems(d.announcements || [])
    } catch (e) {}
  }

  function openCreate() {
    setEditing(null)
    setTitle(''); setContent(''); setPriority('normal'); setPublished(true); setEndsAt('')
    setError(null); setShowForm(true)
  }
  function openEdit(item) {
    setEditing(item)
    setTitle(item.title); setContent(item.body); setPriority(item.priority)
    setPublished(item.published); setEndsAt(item.ends_at ? item.ends_at.slice(0, 16) : '')
    setError(null); setShowForm(true)
  }

  async function handleSave() {
    if (!title.trim() || !content.trim()) { setError('タイトルと本文は必須です'); return }
    setSaving(true); setError(null)
    try {
      const body = {
        userId: userId, title: title, content: content, priority: priority,
        published: published, ends_at: endsAt ? new Date(endsAt).toISOString() : null,
      }
      const r = editing
        ? await fetch('/api/announcements/' + editing.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        : await fetch('/api/announcements', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await r.json()
      if (d.error) { setError(d.error); setSaving(false); return }
      setShowForm(false)
      await loadItems(userId)
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  async function handleDelete(id) {
    if (!window.confirm('このお知らせを削除しますか？')) return
    try {
      const r = await fetch('/api/announcements/' + id + '?userId=' + userId, { method: 'DELETE' })
      const d = await r.json()
      if (d.error) { alert('削除失敗: ' + d.error); return }
      await loadItems(userId)
    } catch (e) { alert('エラー: ' + e.message) }
  }

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>読み込み中…</div>
  if (!authorized) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <p style={{ color: '#dc2626' }}>管理者権限が必要です</p>
        <button onClick={function() { router.push('/') }} style={{ padding: '8px 14px', marginTop: '12px' }}>トップへ</button>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f9ff', padding: '24px' }}>
      <div style={{ maxWidth: '880px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '8px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: 'bold', color: '#0369a1', margin: 0 }}>📢 お知らせ管理</h1>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={openCreate}
              style={{ padding: '8px 16px', backgroundColor: '#0369a1', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>
              + 新規作成
            </button>
            <button onClick={function() { router.push('/admin') }}
              style={{ padding: '8px 14px', backgroundColor: 'white', color: '#64748b', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>
              ← 管理者
            </button>
          </div>
        </div>

        {items.length === 0 && (
          <div style={{ backgroundColor: 'white', borderRadius: '10px', padding: '40px', textAlign: 'center', border: '1px solid #e2e8f0' }}>
            <p style={{ fontSize: '40px', margin: '0 0 12px' }}>📭</p>
            <p style={{ fontSize: '13px', color: '#64748b' }}>お知らせはまだありません。「+ 新規作成」から追加できます。</p>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {items.map(function(a) {
            const p = PRIORITIES.find(function(x) { return x.value === a.priority }) || PRIORITIES[1]
            return (
              <div key={a.id} style={{ backgroundColor: 'white', borderRadius: '10px', padding: '14px 16px', border: '1px solid ' + (a.published ? '#e2e8f0' : '#fcd34d'), opacity: a.published ? 1 : 0.7 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                  <span>{p.icon}</span>
                  <span style={{ fontSize: '10px', padding: '1px 8px', backgroundColor: '#eff6ff', borderRadius: '999px', color: '#1e40af', fontWeight: 'bold' }}>{p.label}</span>
                  {!a.published && <span style={{ fontSize: '10px', padding: '1px 8px', backgroundColor: '#fef3c7', borderRadius: '999px', color: '#92400e', fontWeight: 'bold' }}>非公開</span>}
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>{new Date(a.starts_at).toLocaleDateString('ja-JP')}</span>
                </div>
                <h3 style={{ fontSize: '14px', fontWeight: 'bold', margin: '0 0 4px', color: '#1e293b' }}>{a.title}</h3>
                <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 8px', whiteSpace: 'pre-wrap' }}>
                  {a.body.length > 150 ? a.body.substring(0, 150) + '…' : a.body}
                </p>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button onClick={function() { openEdit(a) }}
                    style={{ padding: '5px 10px', backgroundColor: 'white', color: '#0369a1', border: '1px solid #0369a1', borderRadius: '5px', cursor: 'pointer', fontSize: '11px' }}>
                    編集
                  </button>
                  <button onClick={function() { handleDelete(a.id) }}
                    style={{ padding: '5px 10px', backgroundColor: 'white', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: '5px', cursor: 'pointer', fontSize: '11px' }}>
                    削除
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {showForm && (
          <div onClick={function() { if (!saving) setShowForm(false) }}
            style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}>
            <div onClick={function(e) { e.stopPropagation() }}
              style={{ backgroundColor: 'white', borderRadius: '14px', maxWidth: '560px', width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: '24px' }}>
              <h2 style={{ fontSize: '17px', fontWeight: 'bold', color: '#0369a1', margin: '0 0 16px' }}>
                {editing ? '✏️ お知らせ編集' : '➕ お知らせ作成'}
              </h2>

              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#1e293b', marginBottom: '4px' }}>タイトル *</label>
              <input value={title} onChange={function(e) { setTitle(e.target.value) }} maxLength={100}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', marginBottom: '12px', boxSizing: 'border-box' }} />

              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#1e293b', marginBottom: '4px' }}>本文 *</label>
              <textarea value={content} onChange={function(e) { setContent(e.target.value) }} rows={6} maxLength={2000}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', marginBottom: '12px', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }} />

              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#1e293b', marginBottom: '4px' }}>重要度</label>
              <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
                {PRIORITIES.map(function(p) {
                  const sel = priority === p.value
                  return (
                    <label key={p.value} style={{ flex: '1 0 100px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', padding: '6px 8px', border: '1px solid ' + (sel ? '#0369a1' : '#cbd5e1'), borderRadius: '6px', backgroundColor: sel ? '#eff6ff' : 'white', cursor: 'pointer', fontSize: '11px', fontWeight: sel ? 'bold' : 'normal' }}>
                      <input type="radio" name="prio" checked={sel} onChange={function() { setPriority(p.value) }} style={{ display: 'none' }} />
                      {p.icon} {p.label}
                    </label>
                  )
                })}
              </div>

              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#1e293b', marginBottom: '4px' }}>掲載終了日時 (省略時は無期限)</label>
              <input type="datetime-local" value={endsAt} onChange={function(e) { setEndsAt(e.target.value) }}
                style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', marginBottom: '12px' }} />

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', cursor: 'pointer', fontSize: '13px' }}>
                <input type="checkbox" checked={published} onChange={function(e) { setPublished(e.target.checked) }} />
                公開する（OFF にすると下書きとして保存）
              </label>

              {error && <p style={{ fontSize: '12px', color: '#dc2626', marginBottom: '8px' }}>{error}</p>}

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button onClick={function() { setShowForm(false) }} disabled={saving}
                  style={{ padding: '8px 16px', backgroundColor: 'white', color: '#64748b', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>
                  キャンセル
                </button>
                <button onClick={handleSave} disabled={saving}
                  style={{ padding: '8px 16px', backgroundColor: '#0369a1', color: 'white', border: 'none', borderRadius: '6px', cursor: saving ? 'wait' : 'pointer', fontSize: '13px', fontWeight: 'bold' }}>
                  {saving ? '保存中…' : (editing ? '更新' : '作成')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
