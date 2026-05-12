'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '../../lib/supabase'

const POSITIONS = [
  '医学生', '1年目研修医', '2年目研修医', '専攻医', '指導医', '医療従事者', 'その他'
]

const TERMS_VERSION = '1.0'

function ProfileSetupForm() {
  const router = useRouter()
  const sp = useSearchParams()
  const next = sp.get('next') || '/groups'

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [userId, setUserId] = useState(null)
  const [realName, setRealName] = useState('')
  const [handleName, setHandleName] = useState('')
  const [displayPref, setDisplayPref] = useState('real_name')
  const [affiliation, setAffiliation] = useState('')
  const [position, setPosition] = useState('')
  const [agreeTerms, setAgreeTerms] = useState(false)
  const [existingAgreed, setExistingAgreed] = useState(null)
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
      try {
        const res = await fetch('/api/user-profile?userId=' + uid)
        const d = await res.json()
        if (d.profile) {
          setRealName(d.profile.real_name || '')
          setHandleName(d.profile.handle_name || '')
          setDisplayPref(d.profile.display_preference || 'real_name')
          setAffiliation(d.profile.affiliation || '')
          setPosition(d.profile.position || '')
          if (d.profile.terms_agreed_at) {
            setExistingAgreed({
              version: d.profile.terms_version || '(不明)',
              date: d.profile.terms_agreed_at,
              isCurrent: d.profile.terms_version === TERMS_VERSION,
            })
            // 既に最新版に同意済みなら、チェック済み状態に
            if (d.profile.terms_version === TERMS_VERSION) setAgreeTerms(true)
          }
        }
      } catch (e) {}
      setLoading(false)
    }
    load()
  }, [])

  async function handleSave() {
    if (!realName.trim()) { setError('本名は必須です'); return }
    if (!affiliation.trim()) { setError('所属は必須です'); return }
    if (!position) { setError('身分を選択してください'); return }
    if (!agreeTerms) { setError('利用規約への同意が必要です'); return }
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
          affiliation: affiliation,
          position: position,
          agree_terms: true,
          terms_version: TERMS_VERSION,
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
    return <p style={{ color: '#64748b', textAlign: 'center', padding: '40px' }}>読み込み中…</p>
  }

  const labelStyle = { display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#1e293b', marginBottom: '4px' }
  const inputStyle = { width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px', marginBottom: '16px', boxSizing: 'border-box' }
  const requiredMark = <span style={{ color: '#dc2626' }}>*</span>
  const optionalMark = <span style={{ color: '#94a3b8', fontWeight: 'normal', fontSize: '11px' }}>(任意)</span>

  return (
    <div style={{ maxWidth: '540px', margin: '40px auto', backgroundColor: 'white', borderRadius: '14px', padding: '28px', border: '1px solid #e2e8f0' }}>
      <h1 style={{ fontSize: '20px', fontWeight: 'bold', color: '#0369a1', margin: '0 0 8px' }}>👤 プロフィール設定</h1>
      <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 24px' }}>
        本サービスを利用するために必要な情報を入力してください。
      </p>

      <label style={labelStyle}>本名 {requiredMark}</label>
      <input type="text" value={realName} onChange={function(e) { setRealName(e.target.value) }}
        placeholder="例: 中前 太郎" maxLength={50} style={inputStyle} />

      <label style={labelStyle}>所属 {requiredMark}</label>
      <input type="text" value={affiliation} onChange={function(e) { setAffiliation(e.target.value) }}
        placeholder="医仁会武田総合病院" maxLength={100} style={inputStyle} />

      <label style={labelStyle}>身分 {requiredMark}</label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '6px', marginBottom: '16px' }}>
        {POSITIONS.map(function(p) {
          const checked = position === p
          return (
            <label key={p} style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 10px',
              border: '1px solid ' + (checked ? '#0369a1' : '#cbd5e1'),
              borderRadius: '6px', cursor: 'pointer',
              backgroundColor: checked ? '#eff6ff' : 'white',
              fontSize: '12px',
              fontWeight: checked ? 'bold' : 'normal',
              color: checked ? '#0369a1' : '#475569',
            }}>
              <input type="radio" name="position" value={p}
                checked={checked}
                onChange={function() { setPosition(p) }}
                style={{ cursor: 'pointer' }} />
              {p}
            </label>
          )
        })}
      </div>

      <label style={labelStyle}>ハンドル名 {optionalMark}</label>
      <input type="text" value={handleName} onChange={function(e) { setHandleName(e.target.value) }}
        placeholder="例: Dr.T" maxLength={30} style={inputStyle} />

      <label style={labelStyle}>グループ内表示名</label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '20px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', backgroundColor: displayPref === 'real_name' ? '#eff6ff' : 'white', fontSize: '13px' }}>
          <input type="radio" name="display_pref" checked={displayPref === 'real_name'} onChange={function() { setDisplayPref('real_name') }} />
          本名で表示
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: handleName ? 'pointer' : 'not-allowed', backgroundColor: displayPref === 'handle_name' ? '#eff6ff' : 'white', opacity: handleName ? 1 : 0.5, fontSize: '13px' }}>
          <input type="radio" name="display_pref" checked={displayPref === 'handle_name'} onChange={function() { setDisplayPref('handle_name') }} disabled={!handleName} />
          ハンドル名で表示 {!handleName ? '(ハンドル名未設定)' : ''}
        </label>
      </div>

      {/* 利用規約同意 */}
      <div style={{
        marginTop: '8px', marginBottom: '16px',
        padding: '14px', backgroundColor: '#f8fafc',
        border: '1px solid #e2e8f0', borderRadius: '8px',
      }}>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
          <input type="checkbox" checked={agreeTerms}
            onChange={function(e) { setAgreeTerms(e.target.checked) }}
            style={{ marginTop: '3px', cursor: 'pointer', width: '16px', height: '16px' }} />
          <span style={{ fontSize: '13px', color: '#334155', lineHeight: 1.6 }}>
            <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: '#0369a1', textDecoration: 'underline', fontWeight: 'bold' }}>
              利用規約
            </a>
            (Version {TERMS_VERSION}) を読み、内容に同意します。{requiredMark}
          </span>
        </label>
        {existingAgreed && existingAgreed.isCurrent && (
          <p style={{ fontSize: '11px', color: '#059669', margin: '8px 0 0 26px' }}>
            ✓ 既に同意済み ({new Date(existingAgreed.date).toLocaleDateString('ja-JP')})
          </p>
        )}
        {existingAgreed && !existingAgreed.isCurrent && (
          <p style={{ fontSize: '11px', color: '#d97706', margin: '8px 0 0 26px' }}>
            ⚠ 旧バージョン (v{existingAgreed.version}) に同意済み。改定された最新版への再同意をお願いします。
          </p>
        )}
      </div>

      {error && (
        <p style={{ fontSize: '12px', color: '#dc2626', marginBottom: '12px' }}>{error}</p>
      )}

      <button onClick={handleSave} disabled={saving}
        style={{
          width: '100%', padding: '12px', backgroundColor: '#0369a1', color: 'white',
          border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 'bold',
          cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1
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
  )
}

export default function ProfileSetupPage() {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f9ff', padding: '20px' }}>
      <Suspense fallback={<p style={{ color: '#64748b', textAlign: 'center', padding: '40px' }}>読み込み中…</p>}>
        <ProfileSetupForm />
      </Suspense>
    </div>
  )
}
