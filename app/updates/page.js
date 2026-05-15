'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const CATEGORY_STYLES = {
  feature: { bg: '#ecfdf5', accent: '#16a34a', label: '新機能' },
  improvement: { bg: '#eff6ff', accent: '#2563eb', label: '改善' },
  fix: { bg: '#fefce8', accent: '#ca8a04', label: 'バグ修正' },
  notice: { bg: '#f8fafc', accent: '#64748b', label: 'お知らせ' },
}

export default function UpdatesListPage() {
  const router = useRouter()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(function() {
    (async function() {
      try {
        const res = await fetch('/api/updates?limit=100')
        const d = await res.json()
        if (d.error) { setError(d.error); return }
        setItems(d.updates || [])
      } catch (e) {
        setError('アップデート情報の取得に失敗しました')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', paddingBottom: '40px' }}>
      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <button onClick={function() { router.push('/') }}
            style={{ padding: '6px 12px', fontSize: '13px', backgroundColor: 'white', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', color: '#475569' }}>
            ← トップに戻る
          </button>
          <h1 style={{ fontSize: '22px', fontWeight: 'bold', color: '#0369a1', margin: 0 }}>📰 アップデート情報</h1>
        </div>

        {loading && (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748b', fontSize: '14px' }}>
            読み込み中...
          </div>
        )}

        {error && (
          <div style={{ padding: '14px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#991b1b', fontSize: '13px', marginBottom: '12px' }}>
            {error}
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <div style={{ padding: '40px', textAlign: 'center', backgroundColor: 'white', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
            <p style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>アップデート情報はまだありません。</p>
          </div>
        )}

        {!loading && items.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {items.map(function(u) {
              const style = CATEGORY_STYLES[u.category] || CATEGORY_STYLES.notice
              return (
                <div key={u.id} style={{ backgroundColor: style.bg, border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                    <span style={{ padding: '2px 10px', backgroundColor: '#0369a1', color: 'white', borderRadius: '999px', fontSize: '10px', fontWeight: 'bold', fontFamily: 'monospace' }}>
                      {u.version}
                    </span>
                    {u.category && (
                      <span style={{ padding: '2px 10px', backgroundColor: style.accent, color: 'white', borderRadius: '999px', fontSize: '10px', fontWeight: 'bold' }}>
                        {style.label}
                      </span>
                    )}
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                      {new Date(u.released_at).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })}
                    </span>
                  </div>
                  <h3 style={{ fontSize: '15px', fontWeight: 'bold', margin: '0 0 6px', color: '#1e293b' }}>{u.title}</h3>
                  <p style={{ fontSize: '13px', color: '#475569', margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{u.body}</p>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
