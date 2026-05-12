'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'

export default function AdminUpdatesPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState(false)
  const [userId, setUserId] = useState(null)
  const [items, setItems] = useState([])
  const [editing, setEditing] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)

  const [version, setVersion] = useState('')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [releasedAt, setReleasedAt] = useState('')
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
        await loadItems()
      }
      setLoading(false)
    }
    init()
  }, [])

  async function loadItems() {
    try {
      const r = await fetch('/api/updates?limit=200')
      const d = await r.json()
      if (!d.error) setItems(d.updates || [])
    } catch (e) {}
  }

  function openCreate() {
    setEditing(null)
    setVersion(''); setTitle(''); setContent('')
    const now = new Date()
    setReleasedAt(now.toISOString().slice(0, 16))
    setError(null); setShowForm(true)
  }
  function openEdit(item) {
    setEditing(item)
    setVersion(item.version); setTitle(item.title); setContent(item.body)
    setReleasedAt(item.released_at ? item.released_at.slice(0, 16) : '')
    setError(null); setShowForm(true)
  }

  async function handleSave() {
    if (!version.trim() || !title.trim() || !content.trim()) {
      setError('バージョン、タイトル、本文は必須です'); return
    }
    setSaving(true); setError(null)
    try {
      const body = {
        userId: userId, version: version, title: title, content: content,
        released_at: releasedAt ? new Date(releasedAt).toISOString() : new Date().toISOString(),
      }
      const r = editing
        ? await fetch('/api/updates/' + editing.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        : await fetch('/api/updates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await r.json()
      if (d.error) { setError(d.error); setSaving(false); return }
      setShowForm(false)
      await loadItems()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  async function handleDelete(id) {
    if (!window.confirm('このアップデート情報を削除しますか？')) return
    try {
      const r = await fetch('/api/updates/' + id + '?userId=' + userId, { method: 'DELETE' })
      const d = await r.json()
      if (d.error) { alert('削除失敗: ' + d.error); return }
      await loadItems()
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
          <h1 style={{ fontSize: '22px', fontWeight: 'bold', color: '#0369a1', margin: 0 }}>📰 アップデート管理</h1>
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
            <p style={{ fontSize: '13px', color: '#64748b' }}>アップデート情報はまだありません。</p>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {items.map(function(u) {
            return (
              <div key={u.id} style={{ backgroundColor: 'white', borderRadius: '10px', padding: '14px 16px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                  <span style={{ padding: '2px 10px', backgroundColor: '#0369a1', color: 'white', borderRadius: '999px', fontSize: '10px', fontWeight: 'bold', fontFamily: 'monospace' }}>{u.version}</span>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>{new Date(u.released_at).toLocaleDateString('ja-JP')}</span>
                </div>
                <h3 style={{ fontSize: '14px', fontWeight: 'bold', margin: '0 0 4px', color: '#1e293b' }}>{u.title}</h3>
                <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 8px', whiteSpace: 'pre-wrap' }}>
                  {u.body.length > 150 ? u.body.substring(0, 150) + '…' : u.body}
                </p>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button onClick={function() { openEdit(u) }}
                    style={{ padding: '5px 10px', backgroundColor: 'white', color: '#0369a1', border: '1px solid #0369a1', borderRadius: '5px', cursor: 'pointer', fontSize: '11px' }}>
                    編集
                  </button>
                  <button onClick={function() { handleDelete(u.id) }}
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
                {editing ? '✏️ アップデート編集' : '➕ アップデート作成'}
              </h2>

              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#1e293b', marginBottom: '4px' }}>バージョン *</label>
              <input value={version} onChange={function(e) { setVersion(e.target.value) }} placeholder="v1.0, v1.1, etc." maxLength={30}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', marginBottom: '12px', boxSizing: 'border-box', fontFamily: 'monospace' }} />

              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#1e293b', marginBottom: '4px' }}>タイトル *</label>
              <input value={title} onChange={function(e) { setTitle(e.target.value) }} maxLength={100} placeholder="新機能リリース、バグ修正など"
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', marginBottom: '12px', boxSizing: 'border-box' }} />

              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#1e293b', marginBottom: '4px' }}>本文 * (改行可、箇条書きは「- 〇〇」)</label>
              <textarea value={content} onChange={function(e) { setContent(e.target.value) }} rows={8} maxLength={3000}
                placeholder={'- グループ機能を追加\n- ランキングシステムの改善\n- パスワード再設定機能'}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', marginBottom: '12px', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }} />

              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#1e293b', marginBottom: '4px' }}>リリース日時</label>
              <input type="datetime-local" value={releasedAt} onChange={function(e) { setReleasedAt(e.target.value) }}
                style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', marginBottom: '16px' }} />

              {error && <p style={{ fontSize: '12px', color: '#dc2626', marginBottom: '8px' }}>{error}</p>}

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button onClick={function() { setShowForm(false) }} disabled={saving}
                  style={{ padding: '8px 16px', backgroundColor: 'white', color: '#64748b', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>キャンセル</button>
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
