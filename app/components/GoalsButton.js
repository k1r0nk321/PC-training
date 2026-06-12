'use client'

import { useState } from 'react'
import { evaluateGoals, isCurrentSmoker, isHeavyDrinker, consultationRecommended } from '../lib/achievement-goals'

// ヘッダーに置く「到達目標」ボタン＋評価基準パネル。
// Visit 1/2/3 の各ページから同じものを呼び出す（3ファイル横展開の代わりに共有）。
//
// props:
//   patient, scenarioData, autoTreatmentUsed
//   live（任意）: 現在の操作状況をリアルタイム反映するためのデータ
//     { eduCategories:[], medsSelected:bool, examOrdered:bool, consultationDone:bool, trustLevel:number }
export default function GoalsButton({ patient, scenarioData, autoTreatmentUsed, live }) {
  const [open, setOpen] = useState(false)

  const smoker = isCurrentSmoker(patient)
  const heavyDrinker = isHeavyDrinker(patient)
  const needConsult = consultationRecommended(scenarioData)

  // 項目1：この患者で必要な生活指導（基準表示用）
  const lifestyleNeeded = ['食事指導', '運動指導']
  if (smoker) lifestyleNeeded.push('禁煙指導')
  if (heavyDrinker) lifestyleNeeded.push('節酒指導')

  // リアルタイム判定（live がある場合のみ）
  let ev = null
  if (live) {
    ev = evaluateGoals({
      patient: patient,
      scenarioData: scenarioData,
      eduCategories: live.eduCategories || [],
      examOrdered: !!live.examOrdered,
      consultationDone: !!live.consultationDone,
      trustLevel: live.trustLevel,
      autoTreatmentUsed: autoTreatmentUsed,
      medAppropriate: undefined,
    })
  }

  function mark(achieved) {
    if (achieved === true) return { icon: '🟢', label: '達成', color: '#16a34a' }
    if (achieved === false) return { icon: '🔴', label: '未達成', color: '#dc2626' }
    return { icon: '⚪', label: '未', color: '#94a3b8' }
  }

  // 表示用の4項目を組み立て
  const goals = []

  // --- 項目1：生活指導 ---
  const evLifestyle = ev ? ev.items[0] : null
  goals.push({
    no: 1,
    label: '適切な生活指導の実施',
    applicable: true,
    status: ev ? mark(evLifestyle.achieved) : null,
    detail: 'この症例で必要：' + lifestyleNeeded.join('・'),
    subs: ev ? evLifestyle.subs.filter(function (s) { return s.required }) : null,
  })

  // --- 項目2：投薬 ---
  let medStatus = null
  let medDetail = 'この症例の標準治療に沿った薬剤を選択する'
  if (autoTreatmentUsed) {
    medStatus = { icon: '🟢', label: '対象外', color: '#16a34a' }
    medDetail = '学習者モードのため対象外（自動達成）'
  } else if (live) {
    if (live.medsSelected) {
      medStatus = { icon: '🟡', label: '選択済', color: '#ca8a04' }
      medDetail = '投薬を選択済み（適否は Visit 3 終了時にAIが判定）'
    } else {
      medStatus = { icon: '🔴', label: '未選択', color: '#dc2626' }
      medDetail = 'まだ投薬を選択していません'
    }
  }
  goals.push({
    no: 2, label: '適切な投薬の選択', applicable: !autoTreatmentUsed,
    status: medStatus, detail: medDetail, subs: null,
  })

  // --- 項目3：合併症の評価と管理 ---
  const evComp = ev ? ev.items[2] : null
  goals.push({
    no: 3,
    label: '適切な合併症の評価と管理',
    applicable: !autoTreatmentUsed,
    status: ev ? (autoTreatmentUsed ? { icon: '🟢', label: '対象外', color: '#16a34a' } : mark(evComp.achieved)) : null,
    detail: autoTreatmentUsed
      ? '学習者モードのため対象外（自動達成）'
      : '必要な検査をオーダー' + (needConsult ? '＋専門医へコンサルト依頼（この症例は連携推奨）' : '（この症例は専門医コンサルト不要）'),
    subs: null,
  })

  // --- 項目4：信頼度 ---
  const evTrust = ev ? ev.items[3] : null
  goals.push({
    no: 4,
    label: '信頼度が 5 に到達',
    applicable: true,
    status: ev ? mark(evTrust.achieved) : null,
    detail: ev
      ? evTrust.detail
      : 'Visit 3 終了時点で患者の信頼度を 5 まで高める',
    subs: null,
  })

  return (
    <>
      <button
        onClick={function () { setOpen(true) }}
        style={{
          padding: '6px 14px', backgroundColor: '#fffbeb', color: '#b45309',
          border: '1px solid #f59e0b', borderRadius: '8px', cursor: 'pointer',
          fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap',
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
              {ev
                ? '現在の達成状況（リアルタイム）です。'
                : '次の4項目が評価されます。'}
              <b>すべて達成で「合格」</b>、1つでも未達成で「不合格」です。最終判定は Visit 3 終了時です。
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
                    <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#334155', flex: 1 }}>{g.label}</span>
                    {g.status && (
                      <span style={{ fontSize: '12px', fontWeight: 'bold', color: g.status.color, whiteSpace: 'nowrap' }}>
                        {g.status.icon} {g.status.label}
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: '12px', color: '#64748b', margin: '6px 0 0', paddingLeft: '30px' }}>{g.detail}</p>
                  {g.subs && g.subs.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', margin: '6px 0 0', paddingLeft: '30px' }}>
                      {g.subs.map(function (s) {
                        return (
                          <span key={s.key} style={{
                            fontSize: '11px', padding: '2px 8px', borderRadius: '10px',
                            backgroundColor: s.done ? '#dcfce7' : '#fee2e2',
                            color: s.done ? '#166534' : '#991b1b',
                          }}>
                            {s.done ? '🟢' : '🔴'} {s.label}
                          </span>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </>
  )
}
