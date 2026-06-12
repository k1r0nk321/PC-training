'use client'

import { useState } from 'react'

// 画像の拡張子（jpg / png）。差し替え時はここを変更。
const AVATAR_EXT = 'png'

const PHASE_NUM = { '初期研修医': 1, '専攻医': 2, '指導医': 3, 'ジェネラリスト': 4 }
const PHASE_COLOR = { 1: '#0369a1', 2: '#059669', 3: '#d97706', 4: '#7c3aed' }
const PHASE_BG = { 1: '#e0f2fe', 2: '#dcfce7', 3: '#fef3c7', 4: '#ede9fe' }
// 各ランク(1〜20)に到達するのに必要な累積合格数
const RANK_THRESHOLDS = [0, 5, 10, 15, 20, 25, 32, 39, 46, 53, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150]

export default function RankCard({ progress, gender, onGenderChange }) {
  const [imgError, setImgError] = useState(false)
  if (!progress || !progress.rank) return null

  const rank = progress.rank
  const phaseNum = PHASE_NUM[progress.phase] || 1
  const color = PHASE_COLOR[phaseNum]
  const bg = PHASE_BG[phaseNum]

  // フェーズ内の段階（★1〜5）
  const starsInPhase = ((rank - 1) % 5) + 1
  const stars = '★★★★★'.slice(0, starsInPhase) + '☆☆☆☆☆'.slice(0, 5 - starsInPhase)

  const g = gender === 'female' ? 'female' : 'male'
  const avatarSrc = '/avatars/trainee-p' + phaseNum + '-' + g + '.' + AVATAR_EXT
  const fallbackEmoji = g === 'female' ? '👩‍⚕️' : '👨‍⚕️'

  const passCount = progress.passCount || 0
  const coverage = Array.isArray(progress.diseaseCoverage) ? progress.diseaseCoverage : []
  const completedDiseases = progress.completedDiseases || 0
  const blocked = progress.requirementMet === false && progress.blocker

  // 次ランクまでの進捗
  const curThreshold = RANK_THRESHOLDS[rank - 1] || 0
  const nextThreshold = progress.nextRankCount
  let barPct = 100
  if (typeof nextThreshold === 'number' && nextThreshold > curThreshold) {
    barPct = Math.max(0, Math.min(100, Math.round(((passCount - curThreshold) / (nextThreshold - curThreshold)) * 100)))
  }

  const genderBtn = function (value, label) {
    const active = g === value
    return (
      <button
        onClick={function () { if (onGenderChange) onGenderChange(value) }}
        style={{
          padding: '2px 8px', fontSize: '11px', cursor: 'pointer',
          border: '1px solid ' + (active ? color : '#cbd5e1'),
          backgroundColor: active ? color : 'white',
          color: active ? 'white' : '#64748b',
          borderRadius: '6px', fontWeight: active ? 'bold' : 'normal',
        }}
      >{label}</button>
    )
  }

  return (
    <div style={{
      backgroundColor: 'white', border: '1px solid #e2e8f0', borderLeft: '5px solid ' + color,
      borderRadius: '12px', padding: '14px 16px', marginBottom: '16px',
      display: 'flex', alignItems: 'center', gap: '16px',
    }}>
      {/* アバター */}
      <div style={{
        width: '76px', height: '76px', borderRadius: '14px', backgroundColor: bg,
        border: '3px solid ' + color, flexShrink: 0, overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
      }}>
        {!imgError ? (
          <img
            src={avatarSrc} alt="研修医アバター"
            onError={function () { setImgError(true) }}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <span style={{ fontSize: '40px' }}>{fallbackEmoji}</span>
        )}
        <span style={{
          position: 'absolute', bottom: '-2px', right: '-2px',
          backgroundColor: color, color: 'white', fontSize: '10px', fontWeight: 'bold',
          borderRadius: '8px', padding: '0 6px',
        }}>Lv.{rank}</span>
      </div>

      {/* 情報 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '17px', fontWeight: 'bold', color: '#1e293b' }}>{progress.title}</span>
          <span style={{ fontSize: '11px', fontWeight: 'bold', backgroundColor: bg, color: color, borderRadius: '8px', padding: '2px 8px' }}>
            {progress.phase}フェーズ
          </span>
        </div>
        <div style={{ color: color, fontSize: '14px', letterSpacing: '2px', margin: '2px 0 6px' }}>{stars}</div>

        {blocked ? (
          <p style={{ fontSize: '12px', color: '#b45309', margin: 0 }}>
            次の{progress.blocker.nextPhase}フェーズには {progress.blocker.required} 疾患コンプリートが必要（現在 {progress.blocker.current}）
          </p>
        ) : typeof nextThreshold !== 'number' ? (
          <p style={{ fontSize: '12px', color: color, fontWeight: 'bold', margin: 0 }}>🏆 最高ランクに到達しました！</p>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ flex: 1, height: '8px', backgroundColor: bg, borderRadius: '6px', overflow: 'hidden' }}>
              <div style={{ width: barPct + '%', height: '100%', backgroundColor: color }}></div>
            </div>
            <span style={{ fontSize: '12px', color: '#64748b', whiteSpace: 'nowrap' }}>
              次のランクまで あと {Math.max(0, nextThreshold - passCount)} 例
            </span>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
          <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>
            合格 {passCount} 例　|　疾患コンプリート {completedDiseases}{coverage.length > 0 ? '/' + coverage.length : ''}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '10px', color: '#94a3b8' }}>アバター</span>
            {genderBtn('male', '男性')}
            {genderBtn('female', '女性')}
          </div>
        </div>
      </div>
    </div>
  )
}
