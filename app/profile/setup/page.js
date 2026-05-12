'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '../../lib/supabase'

export default function ProfileSetupPage() {
  const router = useRouter()
  const sp = useSearchParams()
  const next = sp.get('next') || '/groups'

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [userId, setUserId] = useState(null)
  const [realName, setRealName] = useState('')
  const [handleName, setHandleName] = useState('')
  const [displayPref, setDisplayPref] = useState('real_name')
  const [error, setError] = useState(null)

  useEffect(function() {
    async function load() {
      const session = await supabase.auth.getSession()
      const uid = session?.data?.session?.user?.id
      if (!uid) {
        router.push('/')
        return
      }
      setUserId(uid)
      // 既存プロフィール読込
      try {
        const res = await fetch('/api/user-profile?userId=' + uid)
        const d = await res.json()
        if (d.profile) {
          setRealName(d.profile.real_name || '')
          setHandleName(d.profile.handle_name || '')
          setDisplayPref(d.profile.display_preference || 'real_name')
        }
      } catch (e) {}
      setLoading(false)
    }
    load()
  }, [])

  async function handleSave() {
    if (!realName.trim()) {
      setError('本名は必須です')
      return
    }
    setError(null)
    setSaving(true)
    try {
      const res = await fetch('/api/user-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userId,
          real_name: realName,
          handle_name: handleName || null,
          display_preference: displayPref,
        })
      })
      const d = await res.json()
      if (d.error) {
        setError(d.error)
        setSaving(false)
        return
      }
      router.push(next)
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0f9ff' }}>
        <p style={{ color: '#64748b' }}>読み込み中…</p>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f9ff', padding: '20px' }}>
      <div style={{ maxWidth: '500px', margin: '40px auto', backgroundColor: 'white', borderRadius: '14px', padding: '28px', border: '1px solid #e2e8f0' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 'bold', color: '#0369a1', margin: '0 0 8px' }}>👤 プロフィール設定</h1>
        <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 24px' }}>
          グループ機能を利用するために必要な情報を入力してください。<br />
          ※ 所属・身分は今後の機能拡張で追加予定です。
        </p>

        <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#1e293b', marginBottom: '4px' }}>
          本名 <span style={{ color: '#dc2626' }}>*</span>
        </label>
        <input type="text" value={realName} onChange={function(e) { setRealName(e.target.value) }}
          placeholder="例: 中前 太郎"
          maxLength={50}
          style={{ width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px', marginBottom: '16px', boxSizing: 'border-box' }} />

        <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#1e293b', marginBottom: '4px' }}>
          ハンドル名 <span style={{ color: '#94a3b8', fontWeight: 'normal', fontSize: '11px' }}>(任意)</span>
        </label>
        <input type="text" value={handleName} onChange={function(e) { setHandleName(e.target.value) }}
          placeholder="例: Dr.T"
          maxLength={30}
          style={{ width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px', marginBottom: '16px', boxSizing: 'border-box' }} />

        <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#1e293b', marginBottom: '8px' }}>
          グループ内表示名
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', backgroundColor: displayPref === 'real_name' ? '#eff6ff' : 'white' }}>
            <input type="radio" name="display_pref" value="real_name"
              checked={displayPref === 'real_name'}
              onChange={function() { setDisplayPref('real_name') }} />
            <span style={{ fontSize: '13px' }}>本名で表示</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: handleName ? 'pointer' : 'not-allowed', backgroundColor: displayPref === 'handle_name' ? '#eff6ff' : 'white', opacity: handleName ? 1 : 0.5 }}>
            <input type="radio" name="display_pref" value="handle_name"
              checked={displayPref === 'handle_name'}
              onChange={function() { setDisplayPref('handle_name') }}
              disabled={!handleName} />
            <span style={{ fontSize: '13px' }}>ハンドル名で表示 {!handleName ? '(ハンドル名未設定)' : ''}</span>
          </label>
        </div>

        {error && (
          <p style={{ fontSize: '12px', color: '#dc2626', marginBottom: '12px' }}>{error}</p>
        )}

        <button onClick={handleSave} disabled={saving || !realName.trim()}
          style={{
            width: '100%', padding: '12px', backgroundColor: '#0369a1', color: 'white',
            border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 'bold',
            cursor: saving || !realName.trim() ? 'wait' : 'pointer',
            opacity: !realName.trim() ? 0.6 : 1
          }}>
          {saving ? '保存中…' : '保存して進む'}
        </button>

        <button onClick={function() { router.push('/') }}
          style={{
            width: '100%', padding: '10px', backgroundColor: 'transparent', color: '#64748b',
            border: 'none', fontSize: '12px', cursor: 'pointer', marginTop: '8px'
          }}>
          トップへ戻る
        </button>
      </div>
    </div>
  )
}
