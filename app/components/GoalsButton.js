'use client'

import { useState } from 'react'
import { evaluateGoals, isCurrentSmoker, isHeavyDrinker, consultationRecommended } from '../lib/achievement-goals'

// ヘッダーに置く「到達目標」ボタン＋評価基準パネル＋「到達目標について」説明。
// Visit 1/2/3 の各ページから同じものを呼び出す（3ファイル横展開の代わりに共有）。
//
// props:
//   patient, scenarioData, autoTreatmentUsed
//   live（任意）: 現在の操作状況をリアルタイム反映するためのデータ
//     { eduCategories:[], medsSelected:bool, examOrdered:bool, consultationDone:bool, trustLevel:number }
export default function GoalsButton({ patient, scenarioData, autoTreatmentUsed, live }) {
  const [open, setOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)

  const learner = !!autoTreatmentUsed
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

  // 各項目の達成状況（達成度カウント用）。投薬・生活指導・コンサルトは「実施した段階で達成」とみなす。
  const item1Achieved = ev ? ev.items[0].achieved === true : false
  const item2Achieved = live ? !!live.medsSelected : false
  const item3Achieved = ev ? ev.items[2].achieved === true : false
  const item4Achieved = ev ? ev.items[3].achieved === true : false

  // 学習者モードは評価対象（生活指導・信頼度）だけ /2、医師モードは /4
  const checks = learner
    ? [item1Achieved, item4Achieved]
    : [item1Achieved, item2Achieved, item3Achieved, item4Achieved]
  const denom = checks.length
  const num = checks.filter(Boolean).length
  const allDone = num === denom

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
    status: ev ? mark(item1Achieved) : null,
    detail: 'この症例で必要：' + lifestyleNeeded.join('・'),
    subs: ev ? evLifestyle.subs.filter(function (s) { return s.required }) : null,
  })

  // --- 項目2：投薬 ---
  let medStatus = null
  let medDetail = 'この症例の標準治療に沿った薬剤を選択する'
  if (learner) {
    medStatus = { icon: '⚪', label: '対象外', color: '#94a3b8' }
    medDetail = '学習者モードのため評価対象外'
  } else if (live) {
    if (live.medsSelected) {
      medStatus = { icon: '🟢', label: '達成', color: '#16a34a' }
      medDetail = '投薬を選択済み（適否は Visit 3 終了時にAIが最終判定）'
    } else {
      medStatus = { icon: '🔴', label: '未選択', color: '#dc2626' }
      medDetail = 'まだ投薬を選択していません'
    }
  }
  goals.push({
    no: 2, label: '適切な投薬の選択', applicable: !learner,
    status: medStatus, detail: medDetail, subs: null,
  })

  // --- 項目3：合併症の評価と管理 ---
  goals.push({
    no: 3,
    label: '適切な合併症の評価と管理',
    applicable: !learner,
    status: ev ? (learner ? { icon: '⚪', label: '対象外', color: '#94a3b8' } : mark(item3Achieved)) : null,
    detail: learner
      ? '学習者モードのため評価対象外'
      : '必要な検査をオーダー' + (needConsult ? '＋専門医へコンサルト依頼（この症例は連携推奨）' : '（この症例は専門医コンサルト不要）'),
    subs: null,
  })

  // --- 項目4：信頼度 ---
  const evTrust = ev ? ev.items[3] : null
  goals.push({
    no: 4,
    label: '信頼度が 5 に到達',
    applicable: true,
    status: ev ? mark(item4Achieved) : null,
    detail: ev ? evTrust.detail : 'Visit 3 終了時点で患者の信頼度を 5 まで高める',
    subs: null,
  })

  const overlayStyle = {
    position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000, padding: '16px',
  }
  const modalStyle = {
    backgroundColor: 'white', borderRadius: '12px', maxWidth: '520px',
    width: '100%', maxHeight: '85vh', overflowY: 'auto', padding: '20px',
    boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <button
          onClick={function () { setOpen(true) }}
          style={{
            padding: '6px 12px', backgroundColor: allDone ? '#dcfce7' : '#fffbeb',
            color: allDone ? '#166534' : '#b45309',
            border: '1px solid ' + (allDone ? '#16a34a' : '#f59e0b'), borderRadius: '8px', cursor: 'pointer',
            fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap',
          }}
        >
          🎯 到達目標{ev ? '　' + num + '/' + denom : ''}
        </button>
        <button
          onClick={function () { setHelpOpen(true) }}
          title="到達目標について"
          style={{
            padding: '6px 10px', backgroundColor: 'white', color: '#64748b',
            border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer',
            fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap',
          }}
        >
          ❓ 説明
        </button>
      </div>

      {/* 到達目標パネル */}
      {open && (
        <div onClick={function () { setOpen(false) }} style={overlayStyle}>
          <div onClick={function (e) { e.stopPropagation() }} style={modalStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <h2 style={{ fontSize: '17px', fontWeight: 'bold', color: '#b45309', margin: 0 }}>
                🎯 この症例の到達目標{ev ? '（' + num + '/' + denom + ' 達成）' : ''}
              </h2>
              <button onClick={function () { setOpen(false) }} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
            </div>
            <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 14px' }}>
              {ev ? '現在の達成状況（リアルタイム）です。' : '次の項目が評価されます。'}
              <b>すべて達成で「合格」</b>、1つでも未達成で「不合格」です。最終判定は Visit 3 終了時です。
            </p>

            {goals.map(function (g) {
              return (
                <div key={g.no} style={{
                  border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 12px',
                  marginBottom: '8px', backgroundColor: g.applicable ? '#fffdf7' : '#f8fafc',
                }}>
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

      {/* 説明パネル */}
      {helpOpen && (
        <div onClick={function () { setHelpOpen(false) }} style={overlayStyle}>
          <div onClick={function (e) { e.stopPropagation() }} style={modalStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h2 style={{ fontSize: '17px', fontWeight: 'bold', color: '#0369a1', margin: 0 }}>❓ 到達目標について</h2>
              <button onClick={function () { setHelpOpen(false) }} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
            </div>

            <p style={{ fontSize: '13px', color: '#334155', lineHeight: 1.7, margin: '0 0 14px' }}>
              この症例の診療では、次の4つの「到達目標」をすべて達成すると<b>合格</b>になります。各目標は、アプリ内で次の操作を行うと達成できます。
            </p>

            <div style={{ fontSize: '13px', color: '#334155', lineHeight: 1.7 }}>
              <p style={{ margin: '0 0 4px' }}><b>① 適切な生活指導の実施</b></p>
              <p style={{ margin: '0 0 12px', paddingLeft: '14px', color: '#475569' }}>
                「治療方針の決定」画面の<b>生活指導</b>から、食事・運動の指導を選びます。患者が喫煙中なら禁煙指導、飲酒量が多ければ節酒指導も必要です（不要な項目は自動で達成扱い）。
              </p>

              <p style={{ margin: '0 0 4px' }}><b>② 適切な投薬の選択</b></p>
              <p style={{ margin: '0 0 12px', paddingLeft: '14px', color: '#475569' }}>
                「治療方針の決定」画面で、その症例に適した薬剤を選択して次のVisitに進みます。投薬が<b>適切だったか</b>はVisit 3終了時にAIが判定します。
              </p>

              <p style={{ margin: '0 0 4px' }}><b>③ 適切な合併症の評価と管理</b></p>
              <p style={{ margin: '0 0 12px', paddingLeft: '14px', color: '#475569' }}>
                「診察・検査」画面で必要な検査をオーダーします。さらに、専門医との連携が望ましい症例では<b>専門医へコンサルト依頼</b>を行います（連携不要の症例は検査オーダーだけで達成）。
              </p>

              <p style={{ margin: '0 0 4px' }}><b>④ 信頼度が 5 に到達</b></p>
              <p style={{ margin: '0 0 8px', paddingLeft: '14px', color: '#475569' }}>
                Visit 3 終了時点で、患者の<b>信頼度</b>（0〜5）を 5 まで高めます。下の「信頼度の高め方」を参照してください。
              </p>
            </div>

            <div style={{ backgroundColor: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '10px', padding: '14px', marginTop: '6px' }}>
              <p style={{ fontSize: '14px', fontWeight: 'bold', color: '#0369a1', margin: '0 0 8px' }}>💙 信頼度の高め方</p>
              <p style={{ fontSize: '13px', color: '#334155', lineHeight: 1.7, margin: '0 0 8px' }}>
                信頼度は、患者の医師への信頼の度合いです。問診中の<b>あなたの言葉や態度</b>で増減します。
              </p>
              <p style={{ fontSize: '13px', color: '#166534', lineHeight: 1.7, margin: '0 0 4px' }}><b>上がる行為（+1）</b></p>
              <ul style={{ fontSize: '13px', color: '#475569', lineHeight: 1.7, margin: '0 0 8px', paddingLeft: '20px' }}>
                <li>共感的に傾聴し、患者の気持ちに寄り添う</li>
                <li>納得できる、わかりやすい説明をする</li>
                <li>患者の<b>生活改善の意欲</b>を引き出す（自動で信頼度＋1）</li>
                <li>患者の<b>服薬の意欲</b>を引き出す（自動で信頼度＋1）</li>
              </ul>
              <p style={{ fontSize: '13px', color: '#991b1b', lineHeight: 1.7, margin: '0 0 4px' }}><b>下がる行為（−1）</b></p>
              <ul style={{ fontSize: '13px', color: '#475569', lineHeight: 1.7, margin: '0 0 10px', paddingLeft: '20px' }}>
                <li>批判的・否定的な発言、押し付け、無関心</li>
                <li>専門用語を一方的に押し付ける</li>
              </ul>
              <div style={{ backgroundColor: '#fef9c3', border: '1px solid #fde047', borderRadius: '8px', padding: '10px' }}>
                <p style={{ fontSize: '13px', color: '#854d0e', lineHeight: 1.7, margin: 0 }}>
                  <b>⚠️ 重要：1回のVisitで上がる信頼度は最大「＋2」までです。</b><br />
                  そのVisitの開始時の値から＋2が上限なので、1回の診察だけで一気に5には到達できません。Visit 1 → 2 → 3 と毎回少しずつ積み上げて、Visit 3 終了時に 5 を目指してください。
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
