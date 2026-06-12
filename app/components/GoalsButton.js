'use client'

import { useState } from 'react'
import { isCurrentSmoker, isHeavyDrinker, consultationRecommended } from '../lib/achievement-goals'

// ヘッダーに置く「到達目標」ボタン＋評価基準パネル。
// Visit 1/2/3 の各ページから同じものを呼び出す（3ファイル横展開の代わりに共有）。
export default function GoalsButton({ patient, scenarioData, autoTreatmentUsed }) {
  const [open, setOpen] = useState(false)

  const smoker = isCurrentSmoker(patient)
  const heavyDrinker = isHeavyDrinker(patient)
  const needConsult = consultationRecommended(scenarioData)

  // 項目1：この患者で必要な生活指導
  const lifestyle = ['食事指導', '運動指導']
  if (smoker) lifestyle.push('禁煙指導')
  if (heavyDrinker) lifestyle.push('節酒指導')

  const goals = [
    {
      no: 1,
      label: '適切な生活指導の実施',
      applicable: true,
      detail: 'この症例で必要：' + lifestyle.join('・'),
    },
    {
      no: 2,
      label: '適切な投薬の選択',
      applicable: !autoTreatmentUsed,
      detail: autoTreatmentUsed
        ? '学習者モードのため対象外（自動達成）'
        : 'この症例の標準治療に沿った薬剤を選択する',
    },
    {
      no: 3,
      label: '適切な合併症の評価と管理',
      applicable: !autoTreatmentUsed,
      detail: autoTreatmentUsed
        ? '学習者モードのため対象外（自動達成）'
        : '必要な検査をオーダー' + (needConsult ? '＋専門医へコンサルト依頼（この症例は連携推奨）' : '（この症例は専門医コンサルト不要）'),
    },
    {
      no: 4,
      label: '信頼度が 5 に到達',
      applicable: true,
      detail: 'Visit 3 終了時点で患者の信頼度を 5 まで高める',
    },
  ]

  return (
    <>
      <button
        onClick={function () { setOpen(true) }}
        style={{
          padding: '6px 14px', backgroundColor: '#fffbeb', color: '#b45309',
          border: '1px solid #f59e0b', borderRadius: '8px', cursor: 'pointer',
          fontSize: '12px', fontWeight: 600,
        }}
      >
        🎯 到達目標
      </button>

      {open && (
        <div
          onClick={function () { setOpen(false) }}
          style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: '16px',
          }}
        >
          <div
            onClick={function (e) { e.stopPropagation() }}
            style={{
              backgroundColor: 'white', borderRadius: '12px', maxWidth: '520px',
              width: '100%', maxHeight: '85vh', overflowY: 'auto', padding: '20px',
              boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <h2 style={{ fontSize: '17px', fontWeight: 'bold', color: '#b45309', margin: 0 }}>🎯 この症例の到達目標</h2>
              <button
                onClick={function () { setOpen(false) }}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#94a3b8' }}
              >✕</button>
            </div>
            <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 14px' }}>
              次の4項目が評価されます。<b>すべて達成で「合格」</b>、1つでも未達成で「不合格」です。最終判定は Visit 3 終了時に行われます。
            </p>

            {goals.map(function (g) {
              return (
                <div
                  key={g.no}
                  style={{
                    border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 12px',
                    marginBottom: '8px', backgroundColor: g.applicable ? '#fffdf7' : '#f8fafc',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: '22px', height: '22px', borderRadius: '50%',
                      backgroundColor: g.applicable ? '#f59e0b' : '#cbd5e1', color: 'white',
                      fontSize: '12px', fontWeight: 'bold', flexShrink: 0,
                    }}>{g.no}</span>
                    <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#334155' }}>{g.label}</span>
                    {!g.applicable && (
                      <span style={{ fontSize: '10px', color: '#64748b', backgroundColor: '#e2e8f0', borderRadius: '4px', padding: '1px 6px' }}>対象外</span>
                    )}
                  </div>
                  <p style={{ fontSize: '12px', color: '#64748b', margin: '6px 0 0', paddingLeft: '30px' }}>{g.detail}</p>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </>
  )
}
