'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'

const POSITIONS = [
  '医学生', '1年目研修医', '2年目研修医', '専攻医', '指導医', '医療従事者', 'その他'
]

const TERMS_VERSION = '1.0'

export default function ProfileEditPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [userId, setUserId] = useState(null)
  const [userEmail, setUserEmail] = useState('')

  const [realName, setRealName] = useState('')
  const [handleName, setHandleName] = useState('')
  const [displayPref, setDisplayPref] = useState('real_name')
  const [affiliation, setAffiliation] = useState('')
  const [position, setPosition] = useState('')
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  const [pwResetSending, setPwResetSending] = useState(false)
  const [pwResetSent, setPwResetSent] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteText, setDeleteText] = useState('')
  const [deleting, setDeleting] = useState(false)

  useEffect(function() {
    async function load() {
      const session = await supabase.auth.getSession()
      const u = session?.data?.session?.user
      if (!u) { router.push('/'); return }
      setUserId(u.id)
      setUserEmail(u.email || '')

      try {
        const res = await fetch('/api/user-profile?userId=' + u.id)
        const d = await res.json()
        if (d.profile) {
          setRealName(d.profile.real_name || '')
          setHandleName(d.profile.handle_name || '')
          setDisplayPref(d.profile.display_preference || 'real_name')
          setAffiliation(d.profile.affiliation || '')
          setPosition(d.profile.position || '')
        } else {
          // プロフィール未登録なら setup へ
          router.push('/profile/setup')
          return
        }
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function handleSave() {
    if (!realName.trim()) { setError('本名は必須です'); return }
    if (!affiliation.trim()) { setError('所属は必須です'); return }
    if (!position) { setError('身分を選択してください'); return }
    setError(null)
    setSuccess(null)
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
      setSuccess('プロフィールを更新しました')
      setSaving(false)
      setTimeout(function() { setSuccess(null) }, 3000)
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  async function handlePasswordReset() {
    if (!userEmail) return
    if (!window.confirm(userEmail + ' 宛にパスワード再設定メールを送信します。よろしいですか？')) return
    setPwResetSending(true)
    try {
      const redirectTo = typeof window !== 'undefined'
        ? window.location.origin + '/auth/update-password'
        : '/auth/update-password'
      const { error } = await supabase.auth.resetPasswordForEmail(userEmail, { redirectTo: redirectTo })
      if (error) {
        alert('送信失敗: ' + error.message)
      } else {
        setPwResetSent(true)
      }
    } catch (e) {
      alert('エラー: ' + e.message)
    } finally {
      setPwResetSending(false)
    }
  }

  async function handleDelete() {
    if (deleteText !== 'DELETE') return
    setDeleting(true)
    try {
      const res = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userId })
      })
      const d = await res.json()
      if (d.error) {
        alert('削除失敗: ' + d.error)
        setDeleting(false)
        return
      }
      await supabase.auth.signOut()
      alert('アカウントを削除しました。ご利用ありがとうございました。')
      router.push('/')
    } catch (e) {
      alert('エラー: ' + e.message)
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0f9ff' }}>
        <p style={{ color: '#64748b' }}>読み込み中…</p>
      </div>
    )
  }

  const labelStyle = { display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#1e293b', marginBottom: '4px' }
  const inputStyle = { width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px', marginBottom: '16px', boxSizing: 'border-box' }
  const requiredMark = <span style={{ color: '#dc2626' }}>*</span>

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f9ff', padding: '20px' }}>
      <div style={{ maxWidth: '560px', margin: '20px auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: 'bold', color: '#0369a1', margin: 0 }}>⚙ プロフィール編集</h1>
          <button onClick={function() { router.push('/') }}
            style={{ padding: '8px 14px', backgroundColor: 'white', color: '#64748b', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>
            ← トップへ
          </button>
        </div>

        {/* プロフィール編集セクション */}
        <div style={{ backgroundColor: 'white', borderRadius: '14px', padding: '24px', border: '1px solid #e2e8f0', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 'bold', color: '#1e293b', margin: '0 0 16px', paddingBottom: '8px', borderBottom: '1px solid #e2e8f0' }}>基本情報</h2>

          <label style={labelStyle}>メールアドレス</label>
          <input type="text" value={userEmail} disabled
            style={{ ...inputStyle, backgroundColor: '#f1f5f9', color: '#64748b' }} />

          <label style={labelStyle}>本名 {requiredMark}</label>
          <input type="text" value={realName} onChange={function(e) { setRealName(e.target.value) }}
            maxLength={50} style={inputStyle} />

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
                  <input type="radio" name="position" checked={checked} onChange={function() { setPosition(p) }} />
                  {p}
                </label>
              )
            })}
          </div>

          <label style={labelStyle}>ハンドル名（任意）</label>
          <input type="text" value={handleName} onChange={function(e) { setHandleName(e.target.value) }}
            maxLength={30} style={inputStyle} />

          <label style={labelStyle}>グループ内表示名</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', backgroundColor: displayPref === 'real_name' ? '#eff6ff' : 'white', fontSize: '13px' }}>
              <input type="radio" name="display_pref" checked={displayPref === 'real_name'} onChange={function() { setDisplayPref('real_name') }} />
              本名で表示
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: handleName ? 'pointer' : 'not-allowed', backgroundColor: displayPref === 'handle_name' ? '#eff6ff' : 'white', opacity: handleName ? 1 : 0.5, fontSize: '13px' }}>
              <input type="radio" name="display_pref" checked={displayPref === 'handle_name'} onChange={function() { setDisplayPref('handle_name') }} disabled={!handleName} />
              ハンドル名で表示 {!handleName ? '(ハンドル名未設定)' : ''}
            </label>
          </div>

          {error && <p style={{ fontSize: '12px', color: '#dc2626', marginBottom: '12px' }}>{error}</p>}
          {success && <p style={{ fontSize: '12px', color: '#059669', marginBottom: '12px' }}>✓ {success}</p>}

          <button onClick={handleSave} disabled={saving}
            style={{ width: '100%', padding: '12px', backgroundColor: '#0369a1', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 'bold', cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? '保存中…' : '保存'}
          </button>
        </div>

        {/* パスワード変更セクション */}
        <div style={{ backgroundColor: 'white', borderRadius: '14px', padding: '24px', border: '1px solid #e2e8f0', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 'bold', color: '#1e293b', margin: '0 0 8px' }}>🔐 パスワード変更</h2>
          <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 12px' }}>
            登録メールアドレス宛にパスワード再設定リンクを送信します。リンクをクリックすると、新しいパスワードを設定できます。
          </p>
          {!pwResetSent ? (
            <button onClick={handlePasswordReset} disabled={pwResetSending}
              style={{ padding: '10px 18px', backgroundColor: 'white', color: '#0369a1', border: '1px solid #0369a1', borderRadius: '8px', fontSize: '13px', fontWeight: 'bold', cursor: pwResetSending ? 'wait' : 'pointer' }}>
              {pwResetSending ? '送信中…' : '🔐 パスワード再設定メールを送信'}
            </button>
          ) : (
            <p style={{ fontSize: '12px', color: '#059669', margin: 0 }}>
              ✓ メールを送信しました（{userEmail}）。受信トレイをご確認ください。
            </p>
          )}
        </div>

        {/* アカウント削除セクション */}
        <div style={{ backgroundColor: '#fef2f2', borderRadius: '14px', padding: '24px', border: '1px solid #fecaca' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 'bold', color: '#dc2626', margin: '0 0 8px' }}>⚠️ アカウント削除</h2>
          <p style={{ fontSize: '12px', color: '#7f1d1d', margin: '0 0 12px', lineHeight: 1.7 }}>
            アカウントを削除すると、以下のデータがすべて完全に削除され、復元できません。
            <br />・プロフィール情報（本名・所属・身分など）
            <br />・症例記録（完遂・中断問わず全件）
            <br />・成績・ランキング情報
            <br />・参加中のグループメンバーシップ
            <br />・あなたが作成したグループ（他メンバーごと解散）
            <br />・ログイン認証情報（メール・パスワード）
          </p>
          <button onClick={function() { setShowDeleteConfirm(true) }}
            style={{ padding: '10px 18px', backgroundColor: 'white', color: '#dc2626', border: '1px solid #dc2626', borderRadius: '8px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer' }}>
            🗑 アカウントを削除する
          </button>
        </div>

        {/* 削除確認モーダル */}
        {showDeleteConfirm && (
          <div onClick={function() { if (!deleting) setShowDeleteConfirm(false) }}
            style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}>
            <div onClick={function(e) { e.stopPropagation() }}
              style={{ backgroundColor: 'white', borderRadius: '14px', maxWidth: '440px', width: '100%', padding: '24px' }}>
              <h2 style={{ fontSize: '17px', fontWeight: 'bold', color: '#dc2626', margin: '0 0 12px' }}>⚠️ 最終確認</h2>
              <p style={{ fontSize: '13px', color: '#334155', margin: '0 0 16px', lineHeight: 1.7 }}>
                本当にアカウントを削除しますか？<br />
                <b style={{ color: '#dc2626' }}>この操作は取り消せません。</b>
              </p>
              <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 8px' }}>
                削除を確定するには、下のテキストボックスに <b style={{ color: '#dc2626' }}>DELETE</b> と入力してください。
              </p>
              <input type="text" value={deleteText} onChange={function(e) { setDeleteText(e.target.value) }}
                placeholder="DELETE"
                style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '14px', marginBottom: '16px', boxSizing: 'border-box', fontFamily: 'monospace' }} />
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button onClick={function() { setShowDeleteConfirm(false); setDeleteText('') }} disabled={deleting}
                  style={{ padding: '8px 16px', backgroundColor: 'white', color: '#64748b', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>
                  キャンセル
                </button>
                <button onClick={handleDelete} disabled={deleting || deleteText !== 'DELETE'}
                  style={{ padding: '8px 16px', backgroundColor: '#dc2626', color: 'white', border: 'none', borderRadius: '6px', cursor: (deleting || deleteText !== 'DELETE') ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: 'bold', opacity: (deleteText !== 'DELETE') ? 0.5 : 1 }}>
                  {deleting ? '削除中…' : '完全に削除する'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
