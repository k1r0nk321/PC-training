'use client'

import { useState, useMemo } from 'react'
import { getCatalogForDisease, getBaselinePanel, getTheme } from '../lib/exam-catalog'

// 診察・検査依頼モーダル(3 Visit page 共通)
// Props:
//   open: boolean
//   diseaseName: string
//   alreadyDoneIds: string[]  // 既に実施済みの id 配列(重複防止用)
//   loading: boolean
//   onClose: () => void
//   onSubmit: ({ items, freeText }) => void
export default function ExamOrderModal({ open, diseaseName, alreadyDoneIds, loading, onClose, onSubmit }) {
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [includeBaseline, setIncludeBaseline] = useState(false)
  const [freeText, setFreeText] = useState('')

  const catalog = useMemo(function() { return getCatalogForDisease(diseaseName) }, [diseaseName])
  const baseline = useMemo(function() { return getBaselinePanel(diseaseName) }, [diseaseName])
  const theme = useMemo(function() { return getTheme(diseaseName) }, [diseaseName])

  if (!open) return null

  const doneSet = new Set(alreadyDoneIds || [])
  const baselineDone = doneSet.has('baseline')

  function toggleItem(id) {
    setSelectedIds(function(prev) {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function handleSubmit() {
    if (loading) return
    // 選択された項目をフラット辞書から組み立て
    const items = []
    if (includeBaseline && !baselineDone) {
      items.push({ id: 'baseline', type: 'baseline', label: baseline.label })
    }
    const allCatalogs = [
      { arr: catalog.physical.common, type: 'physical' },
      { arr: catalog.physical.specific, type: 'physical' },
      { arr: catalog.lab.common, type: 'lab' },
      { arr: catalog.lab.specific, type: 'lab' },
      { arr: catalog.imaging.common, type: 'imaging' },
      { arr: catalog.imaging.specific, type: 'imaging' },
      { arr: catalog.physiology.common, type: 'physiology' },
      { arr: catalog.physiology.specific, type: 'physiology' },
    ]
    for (const c of allCatalogs) {
      for (const it of c.arr) {
        if (selectedIds.has(it.id) && !doneSet.has(it.id)) {
          items.push({ id: it.id, type: c.type, label: it.label, unit: it.unit || '', subcategory: it.subcategory || '' })
        }
      }
    }
    if (items.length === 0 && !freeText.trim()) {
      if (typeof window !== 'undefined') window.alert('検査項目を選択するか自由記述を入力してください')
      return
    }
    onSubmit({ items: items, freeText: freeText.trim() })
  }

  function handleClose() {
    if (loading) return
    setSelectedIds(new Set())
    setIncludeBaseline(false)
    setFreeText('')
    onClose()
  }

  // 選択件数(ボタン表示用)
  const totalSelected = selectedIds.size + (includeBaseline && !baselineDone ? 1 : 0) + (freeText.trim() ? 1 : 0)

  // ───────────────────────────────────────────────
  // 内部レンダラー
  // ───────────────────────────────────────────────
  function renderItemCheckbox(item, isSpecific) {
    const checked = selectedIds.has(item.id)
    const done = doneSet.has(item.id)
    return (
      <label key={item.id} style={{
        display: 'flex', alignItems: 'center', gap: '4px',
        fontSize: '11px',
        opacity: done ? 0.4 : 1,
        cursor: done ? 'not-allowed' : 'pointer',
        backgroundColor: isSpecific ? theme.accentBg : 'transparent',
        padding: isSpecific ? '2px 4px' : '0',
        borderRadius: '3px',
      }}>
        <input type="checkbox" checked={checked} disabled={done || loading} onChange={function() { toggleItem(item.id) }} />
        <span>{item.label}{done ? ' (実施済)' : ''}</span>
      </label>
    )
  }

  function renderItemGrid(items, isSpecific) {
    if (!items || items.length === 0) return null
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 8px', marginBottom: '4px' }}>
        {items.map(function(it) { return renderItemCheckbox(it, isSpecific) })}
      </div>
    )
  }

  function renderLabSubcategories(commonArr, specificArr) {
    // subcategory ごとにグループ化
    const grouped = {}
    const subOrder = []
    function addToGroup(it, isSpecific) {
      const key = it.subcategory || 'その他'
      if (!grouped[key]) { grouped[key] = { common: [], specific: [] }; subOrder.push(key) }
      if (isSpecific) grouped[key].specific.push(it)
      else grouped[key].common.push(it)
    }
    for (const it of commonArr) addToGroup(it, false)
    for (const it of specificArr) addToGroup(it, true)

    return subOrder.map(function(subKey) {
      const grp = grouped[subKey]
      const isAllSpecific = grp.common.length === 0 && grp.specific.length > 0
      return (
        <div key={subKey} style={{ marginBottom: '6px' }}>
          <p style={{ fontSize: '10px', color: 'var(--color-text-secondary, #64748b)', margin: '6px 0 2px' }}>
            ▪ {subKey}
            {isAllSpecific && (
              <span style={{ marginLeft: '6px', color: theme.accentText, background: theme.accentBg, padding: '0 4px', borderRadius: '3px', fontSize: '9px' }}>{theme.badgeLabel}</span>
            )}
          </p>
          {renderItemGrid(grp.common, false)}
          {renderItemGrid(grp.specific, true)}
        </div>
      )
    })
  }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '16px 16px 0 0',
        width: '100%', maxWidth: '560px', maxHeight: '92vh',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          padding: '12px 16px', backgroundColor: theme.primary, color: 'white',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          borderRadius: '16px 16px 0 0',
        }}>
          <span style={{ fontSize: '14px', fontWeight: 'bold' }}>🔬 診察・検査の依頼</span>
          <button onClick={handleClose} disabled={loading}
            style={{ background: 'none', border: 'none', color: 'white', fontSize: '20px', cursor: loading ? 'not-allowed' : 'pointer' }}>✕</button>
        </div>

        {/* Scrollable body */}
        <div style={{ padding: '12px 16px', overflowY: 'auto', flex: 1 }}>

          {/* Baseline panel */}
          <div style={{
            backgroundColor: theme.baselineBg,
            border: '1px solid ' + theme.primary,
            borderRadius: '8px', padding: '10px', marginBottom: '12px',
            opacity: baselineDone ? 0.5 : 1,
          }}>
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: baselineDone ? 'not-allowed' : 'pointer', gap: '8px' }}>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: '12px', fontWeight: 'bold', color: theme.baselineText }}>⚡ {baseline.label}{baselineDone ? ' (実施済)' : ''}</p>
                <p style={{ margin: '4px 0 0', fontSize: '10px', color: theme.baselineText, lineHeight: 1.4 }}>{baseline.description}</p>
              </div>
              <input type="checkbox" checked={includeBaseline} disabled={baselineDone || loading} onChange={function(e) { setIncludeBaseline(e.target.checked) }} />
            </label>
          </div>

          {/* 身体診察 */}
          <div style={{ marginBottom: '12px' }}>
            <p style={{ fontSize: '12px', fontWeight: 'bold', color: '#1e293b', margin: '0 0 6px', borderBottom: '0.5px solid #e2e8f0', paddingBottom: '4px' }}>🤚 身体診察</p>
            {catalog.physical.common.length > 0 && (
              <>
                <p style={{ fontSize: '10px', color: '#64748b', margin: '6px 0 2px' }}>▪ 共通</p>
                {renderItemGrid(catalog.physical.common, false)}
              </>
            )}
            {catalog.physical.specific.length > 0 && (
              <>
                <p style={{ fontSize: '10px', color: '#64748b', margin: '6px 0 2px' }}>
                  ▪ {diseaseName}固有
                  <span style={{ marginLeft: '6px', color: theme.accentText, background: theme.accentBg, padding: '0 4px', borderRadius: '3px', fontSize: '9px' }}>{theme.badgeLabel}</span>
                </p>
                {renderItemGrid(catalog.physical.specific, true)}
              </>
            )}
          </div>

          {/* 追加血液検査(サブカテゴリ分け) */}
          <div style={{ marginBottom: '12px' }}>
            <p style={{ fontSize: '12px', fontWeight: 'bold', color: '#1e293b', margin: '0 0 6px', borderBottom: '0.5px solid #e2e8f0', paddingBottom: '4px' }}>🧪 追加血液検査</p>
            {renderLabSubcategories(catalog.lab.common, catalog.lab.specific)}
          </div>

          {/* 画像検査 */}
          <div style={{ marginBottom: '12px' }}>
            <p style={{ fontSize: '12px', fontWeight: 'bold', color: '#1e293b', margin: '0 0 6px', borderBottom: '0.5px solid #e2e8f0', paddingBottom: '4px' }}>📷 画像検査</p>
            {catalog.imaging.common.length > 0 && (
              <>
                <p style={{ fontSize: '10px', color: '#64748b', margin: '6px 0 2px' }}>▪ 共通</p>
                {renderItemGrid(catalog.imaging.common, false)}
              </>
            )}
            {catalog.imaging.specific.length > 0 && (
              <>
                <p style={{ fontSize: '10px', color: '#64748b', margin: '6px 0 2px' }}>
                  ▪ {diseaseName}固有
                  <span style={{ marginLeft: '6px', color: theme.accentText, background: theme.accentBg, padding: '0 4px', borderRadius: '3px', fontSize: '9px' }}>{theme.badgeLabel}</span>
                </p>
                {renderItemGrid(catalog.imaging.specific, true)}
              </>
            )}
          </div>

          {/* 生理検査 */}
          <div style={{ marginBottom: '12px' }}>
            <p style={{ fontSize: '12px', fontWeight: 'bold', color: '#1e293b', margin: '0 0 6px', borderBottom: '0.5px solid #e2e8f0', paddingBottom: '4px' }}>📈 生理検査</p>
            {catalog.physiology.common.length > 0 && (
              <>
                <p style={{ fontSize: '10px', color: '#64748b', margin: '6px 0 2px' }}>▪ 共通</p>
                {renderItemGrid(catalog.physiology.common, false)}
              </>
            )}
            {catalog.physiology.specific.length > 0 && (
              <>
                <p style={{ fontSize: '10px', color: '#64748b', margin: '6px 0 2px' }}>
                  ▪ {diseaseName}固有
                  <span style={{ marginLeft: '6px', color: theme.accentText, background: theme.accentBg, padding: '0 4px', borderRadius: '3px', fontSize: '9px' }}>{theme.badgeLabel}</span>
                </p>
                {renderItemGrid(catalog.physiology.specific, true)}
              </>
            )}
          </div>

          {/* その他(自由記述) */}
          <div style={{ marginBottom: '8px' }}>
            <p style={{ fontSize: '12px', fontWeight: 'bold', color: '#1e293b', margin: '0 0 6px', borderBottom: '0.5px solid #e2e8f0', paddingBottom: '4px' }}>✏️ その他(自由記述)</p>
            <textarea value={freeText} onChange={function(e) { setFreeText(e.target.value) }} disabled={loading}
              placeholder="例: 神経伝導検査、PSG、遺伝学的検査 など"
              rows={2}
              style={{ width: '100%', border: '0.5px solid #cbd5e1', borderRadius: '6px', padding: '6px 8px', fontSize: '11px', resize: 'vertical', boxSizing: 'border-box' }} />
            <p style={{ fontSize: '10px', color: '#94a3b8', margin: '4px 0 0' }}>※ AI が解釈して値・所見を生成します</p>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '10px 16px',
          borderTop: '0.5px solid #e2e8f0',
          backgroundColor: '#f8fafc',
          display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '8px',
        }}>
          <button onClick={handleClose} disabled={loading}
            style={{ padding: '10px', backgroundColor: 'white', color: '#475569', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: loading ? 'not-allowed' : 'pointer' }}>キャンセル</button>
          <button onClick={handleSubmit} disabled={loading || totalSelected === 0}
            style={{ padding: '10px', backgroundColor: totalSelected > 0 && !loading ? theme.primary : '#94a3b8', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: loading || totalSelected === 0 ? 'not-allowed' : 'pointer' }}>
            {loading ? '生成中...' : ('依頼する' + (totalSelected > 0 ? ' (' + totalSelected + '件)' : ''))}
          </button>
        </div>
      </div>
    </div>
  )
}
