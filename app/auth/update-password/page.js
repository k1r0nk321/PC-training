'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'

export default function UpdatePasswordPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)

  useEffect(function() {
    // Supabase の reset フローでアクセスされたら session が立つはず
    const { data: { subscription } } = supabase.auth.onAuthStateChange(function(event, session) {
      if (event === 'PASSWORD_RECOVERY' || (session && session.user)) {
        setAuthorized(true)
        setLoading(false)
      }
    })
    // 既にセッションがあるかも
    supabase.auth.getSession().then(function(res) {
      if (res?.data?.session?.user) setAuthorized(true)
      setLoading(false)
    })
    return function() { subscription.unsubscribe() }
  }, [])

  async function handleSubmit() {
    if (password.length < 6) {
      setError('パスワードは6文字以上にしてください')
      return
    }
    if (password !== confirmPassword) {
      setError('パスワードが一致しません')
      return
    }
    setError(null)
    setSaving(true)
    try {
      const { error: err } = await supabase.auth.updateUser({ password: password })
      if (err) {
        setError(err.message)
        setSaving(false)
        return
      }
      setSuccess(true)
      setTimeout(function() { router.push('/profile/edit') }, 2000)
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

  if (!authorized) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0f9ff', padding: '20px' }}>
        <div style={{ maxWidth: '440px', backgroundColor: 'white', borderRadius: '14px', padding: '28px', textAlign: 'center', border: '1px solid #fecaca' }}>
          <p style={{ fontSize: '40px', margin: '0 0 12px' }}>🔒</p>
          <h1 style={{ fontSize: '18px', fontWeight: 'bold', color: '#dc2626', margin: '0 0 12px' }}>パスワード再設定リンクが必要です</h1>
          <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 16px' }}>
            このページは、パスワード再設定メールに記載されたリンクからアクセスしてください。
          </p>
          <button onClick={function() { router.push('/') }}
            style={{ padding: '10px 18px', backgroundColor: '#0369a1', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>
            トップへ戻る
          </button>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0f9ff', padding: '20px' }}>
        <div style={{ maxWidth: '440px', backgroundColor: 'white', borderRadius: '14px', padding: '28px', textAlign: 'center', border: '1px solid #bbf7d0' }}>
          <p style={{ fontSize: '40px', margin: '0 0 12px' }}>✅</p>
          <h1 style={{ fontSize: '18px', fontWeight: 'bold', color: '#059669', margin: '0 0 8px' }}>パスワードを更新しました</h1>
          <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
            プロフィール編集画面に戻ります…
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f9ff', padding: '20px' }}>
      <div style={{ maxWidth: '440px', margin: '60px auto', backgroundColor: 'white', borderRadius: '14px', padding: '28px', border: '1px solid #e2e8f0' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 'bold', color: '#0369a1', margin: '0 0 8px' }}>🔐 新しいパスワードを設定</h1>
        <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 24px' }}>
          新しいパスワードを入力してください（6文字以上）。
        </p>

        <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#1e293b', marginBottom: '4px' }}>
          新しいパスワード
        </label>
        <div style={{ position: 'relative', marginBottom: '12px' }}>
          <input type={showPassword ? 'text' : 'password'} value={password}
            onChange={function(e) { setPassword(e.target.value) }}
            style={{ width: '100%', padding: '10px 40px 10px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }} />
          <button type="button" onClick={function() { setShowPassword(!showPassword) }}
            style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '16px', padding: '4px' }}>
            {showPassword ? '🙈' : '👁'}
          </button>
        </div>

        <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#1e293b', marginBottom: '4px' }}>
          新しいパスワード（確認）
        </label>
        <input type={showPassword ? 'text' : 'password'} value={confirmPassword}
          onChange={function(e) { setConfirmPassword(e.target.value) }}
          style={{ width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px', marginBottom: '16px', boxSizing: 'border-box' }} />

        {error && <p style={{ fontSize: '12px', color: '#dc2626', marginBottom: '12px' }}>{error}</p>}

        <button onClick={handleSubmit} disabled={saving}
          style={{ width: '100%', padding: '12px', backgroundColor: '#0369a1', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 'bold', cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1 }}>
          {saving ? '更新中…' : 'パスワードを更新'}
        </button>
      </div>
    </div>
  )
}
