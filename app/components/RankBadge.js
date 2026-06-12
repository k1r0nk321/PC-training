'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// 小型のランク表示（アバター＋称号＋★）。自分でセッションと進捗を取得する自己完結型。
// トップ画面・各診療画面の左上などに <RankBadge /> として差し込む。
const AVATAR_EXT = 'png'
const PHASE_NUM = { '初期研修医': 1, '専攻医': 2, '指導医': 3, 'ジェネラリスト': 4 }
const PHASE_COLOR = { 1: '#0369a1', 2: '#059669', 3: '#d97706', 4: '#7c3aed' }
const PHASE_BG = { 1: '#e0f2fe', 2: '#dcfce7', 3: '#fef3c7', 4: '#ede9fe' }

export default function RankBadge({ size = 40, showTitle = true }) {
  const [progress, setProgress] = useState(null)
  const [gender, setGender] = useState('male')
  const [imgError, setImgError] = useState(false)

  useEffect(function () {
    try {
      const g = window.localStorage.getItem('pc_avatar_gender')
      if (g === 'male' || g === 'female') setGender(g)
    } catch (e) {}
    supabase.auth.getSession().then(function ({ data: { session } }) {
      if (!session) return
      fetch('/api/user-progress?userId=' + session.user.id)
        .then(function (r) { return r.json() })
        .then(function (d) { if (d && !d.error) setProgress(d) })
        .catch(function () {})
    })
  }, [])

  if (!progress || !progress.rank) return null

  const rank = progress.rank
  const phaseNum = PHASE_NUM[progress.phase] || 1
  const color = PHASE_COLOR[phaseNum]
  const bg = PHASE_BG[phaseNum]
  const starsInPhase = ((rank - 1) % 5) + 1
  const stars = '★★★★★'.slice(0, starsInPhase) + '☆☆☆☆☆'.slice(0, 5 - starsInPhase)
  const g = gender === 'female' ? 'female' : 'male'
  const src = '/avatars/trainee-p' + phaseNum + '-' + g + '.' + AVATAR_EXT
  const fallback = g === 'female' ? '👩‍⚕️' : '👨‍⚕️'

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
      <div style={{
        width: size + 'px', height: size + 'px', borderRadius: '10px',
        backgroundColor: bg, border: '2px solid ' + color, overflow: 'hidden',
        flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {!imgError ? (
          <img src={src} alt="研修医アバター" onError={function () { setImgError(true) }}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <span style={{ fontSize: Math.round(size * 0.55) + 'px' }}>{fallback}</span>
        )}
      </div>
      {showTitle && (
        <div style={{ lineHeight: 1.25 }}>
          <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#1e293b' }}>{progress.title}</div>
          <div style={{ fontSize: '12px', color: color, letterSpacing: '1px' }}>{stars}</div>
        </div>
      )}
    </div>
  )
}
