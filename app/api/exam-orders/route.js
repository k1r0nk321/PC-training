export const maxDuration = 60

import { createClient } from '@supabase/supabase-js'
import { claudeCreate } from '../../lib/claude-client'
import { getAllItemsFlat, getBaselinePanel } from '../../lib/exam-catalog'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

// ベースライン採血セットを患者の patient_data.labs から生成
function buildBaselineLabLines(labs, diseaseName) {
  if (!labs) return []
  const lines = []
  const push = (key, label, unit) => {
    if (labs[key] != null) lines.push(label + ' ' + labs[key] + (unit ? ' ' + unit : ''))
  }
  // 疾患共通
  push('hba1c', 'HbA1c', '%')
  push('glucose', '空腹時血糖', 'mg/dL')
  push('ldl', 'LDL', 'mg/dL')
  push('hdl', 'HDL', 'mg/dL')
  push('tg', 'TG', 'mg/dL')
  push('total_cholesterol', 'TC', 'mg/dL')
  push('non_hdl_c', 'non-HDL-C', 'mg/dL')
  push('na', 'Na', 'mEq/L')
  push('k', 'K', 'mEq/L')
  push('cr', 'Cr', 'mg/dL')
  push('bun', 'BUN', 'mg/dL')
  push('egfr', 'eGFR', 'mL/min')
  push('ua', 'UA', 'mg/dL')
  push('ast', 'AST', 'U/L')
  push('alt', 'ALT', 'U/L')
  push('ck', 'CK', 'U/L')
  push('urine_alb', '尿Alb', 'mg/g·Cr')
  push('urine_protein', '尿蛋白', '')
  push('bnp', 'BNP', 'pg/mL')
  return lines
}

export async function POST(req) {
  try {
    const body = await req.json()
    const {
      caseId,
      visitNumber,
      diseaseName,
      patientData,
      items,          // [{ id, type, label, unit, subcategory }, ...]
      freeText,       // string
      alreadyDone,    // array of ids (重複防止)
    } = body

    if (!diseaseName || !patientData) {
      return Response.json({ error: 'diseaseName and patientData required' }, { status: 400 })
    }

    const safeItems = Array.isArray(items) ? items : []
    const safeAlreadyDone = Array.isArray(alreadyDone) ? alreadyDone : []
    const safeFreeText = (freeText || '').trim()

    // ベースライン採血セットの取り扱い(専用 type)
    const baselineRequested = safeItems.some(function(i) { return i && i.type === 'baseline' })
    const baselineAlreadyDone = safeAlreadyDone.indexOf('baseline') !== -1

    // 各カテゴリに分類
    const physicalItems = safeItems.filter(function(i) { return i && i.type === 'physical' })
    const labItems = safeItems.filter(function(i) { return i && i.type === 'lab' })
    const imagingItems = safeItems.filter(function(i) { return i && i.type === 'imaging' })
    const physiologyItems = safeItems.filter(function(i) { return i && i.type === 'physiology' })

    // 何も選択されてなければエラー
    if (!baselineRequested && physicalItems.length === 0 && labItems.length === 0 &&
        imagingItems.length === 0 && physiologyItems.length === 0 && !safeFreeText) {
      return Response.json({ error: '検査項目が選択されていません' }, { status: 400 })
    }

    // 患者コンテキスト
    const patient = patientData
    const vitals = patient.vitals || {}
    const labs = patient.labs || {}
    const pastHist = patient.past_history || ''
    const histShort = (patient.history || '').slice(0, 200)
    const labLinesCtx = []
    if (labs.hba1c != null) labLinesCtx.push('HbA1c ' + labs.hba1c + '%')
    if (labs.bnp != null) labLinesCtx.push('BNP ' + labs.bnp + ' pg/mL')
    if (labs.cr != null) labLinesCtx.push('Cr ' + labs.cr)
    if (labs.egfr != null) labLinesCtx.push('eGFR ' + labs.egfr)
    if (labs.urine_alb != null) labLinesCtx.push('尿Alb ' + labs.urine_alb)
    if (labs.ldl != null) labLinesCtx.push('LDL ' + labs.ldl)

    const patientCtx = patient.age + '歳' + patient.gender + '、' + diseaseName +
      (pastHist ? '、既往: ' + pastHist : '') +
      '、BMI ' + (vitals.bmi || '?') +
      (vitals.bp ? '、BP ' + vitals.bp : '') +
      (labLinesCtx.length > 0 ? '、' + labLinesCtx.join('、') : '') +
      (histShort ? '、現病歴: ' + histShort : '')

    // ベースライン採血結果の準備
    let baselineResult = null
    if (baselineRequested && !baselineAlreadyDone) {
      const lines = buildBaselineLabLines(labs, diseaseName)
      baselineResult = {
        type: 'baseline',
        label: 'ベースライン採血セット',
        chatText: '【血液・尿検査結果】\n\n' + lines.join('、'),
      }
    }

    // AI 呼び出しが必要な項目を構築
    const needsAI = physicalItems.length > 0 || labItems.length > 0 ||
                    imagingItems.length > 0 || physiologyItems.length > 0 ||
                    safeFreeText.length > 0

    let aiResults = []
    if (needsAI) {
      // プロンプト構築
      const requestLines = []
      if (physicalItems.length > 0) {
        requestLines.push('【身体診察】')
        for (const it of physicalItems) requestLines.push('- ' + it.label + ' (id: ' + it.id + ')')
      }
      if (labItems.length > 0) {
        requestLines.push('【追加血液検査】')
        for (const it of labItems) requestLines.push('- ' + it.label + (it.unit ? ' (' + it.unit + ')' : '') + ' (id: ' + it.id + ')')
      }
      if (imagingItems.length > 0) {
        requestLines.push('【画像検査】')
        for (const it of imagingItems) requestLines.push('- ' + it.label + ' (id: ' + it.id + ')')
      }
      if (physiologyItems.length > 0) {
        requestLines.push('【生理検査】')
        for (const it of physiologyItems) requestLines.push('- ' + it.label + ' (id: ' + it.id + ')')
      }
      if (safeFreeText) {
        requestLines.push('【その他(自由記述・AI解釈)】')
        requestLines.push('研修医の依頼テキスト: 「' + safeFreeText + '」')
        requestLines.push('上記から検査項目を特定し、適切なカテゴリ(physical/lab/imaging/physiology)に分類して結果を生成してください。')
      }

      const sysPrompt =
        'あなたは外来診療シミュレーションで検査結果を生成する役割です。' +
        '患者の臨床コンテキストに整合的で、医学的に妥当な検査値・所見を生成してください。' +
        '出力は必ず指定された JSON 形式のみで、余計な解説・前置き・コードブロックは一切含めないこと。'

      const userPrompt =
        '患者: ' + patientCtx + '\n\n' +
        '以下の検査結果を生成してください:\n\n' +
        requestLines.join('\n') + '\n\n' +
        '出力形式(必ず JSON のみ、コードブロック不要):\n' +
        '{\n' +
        '  "physical_exam": [{"id": "...", "label": "...", "finding": "<所見テキスト>"}],\n' +
        '  "blood_tests": [{"id": "...", "label": "...", "value": <数値>, "unit": "<単位>"}],\n' +
        '  "imaging": [{"id": "...", "label": "...", "finding": "<所見テキスト>"}],\n' +
        '  "physiology": [{"id": "...", "label": "...", "finding": "<所見テキスト>"}],\n' +
        '  "free_text_results": [{"label": "<検査名>", "type": "<lab|imaging|physical|physiology>", "value": <数値 or null>, "unit": "<単位 or 空文字>", "finding": "<所見 or 空文字>"}]\n' +
        '}\n\n' +
        '所見は 1〜3 行で簡潔に。患者の既往・現病歴・既存検査値と整合させること。' +
        '血液検査の value は数値のみ、unit は単位文字列のみ(例: 245, "pg/mL")。' +
        '画像・生理検査・身体診察は finding に所見文を入れる。' +
        '自由記述で依頼された項目は free_text_results に入れ、type を判定して分類すること。'

      const message = await claudeCreate({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        system: sysPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      })

      const responseText = (message.content && message.content[0] && message.content[0].text) || ''
      // JSON 抽出(コードブロックや前後の余白を除去)
      let parsed
      try {
        const cleaned = responseText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
        // 最初の { から最後の } までを抽出
        const firstBrace = cleaned.indexOf('{')
        const lastBrace = cleaned.lastIndexOf('}')
        const jsonStr = (firstBrace >= 0 && lastBrace > firstBrace) ? cleaned.substring(firstBrace, lastBrace + 1) : cleaned
        parsed = JSON.parse(jsonStr)
      } catch (e) {
        console.error('AI response parse error:', e, 'raw:', responseText)
        return Response.json({ error: 'AI 応答の解析に失敗しました', raw: responseText }, { status: 500 })
      }

      // 結果を統合
      const physicalArr = Array.isArray(parsed.physical_exam) ? parsed.physical_exam : []
      const bloodArr = Array.isArray(parsed.blood_tests) ? parsed.blood_tests : []
      const imagingArr = Array.isArray(parsed.imaging) ? parsed.imaging : []
      const physiologyArr = Array.isArray(parsed.physiology) ? parsed.physiology : []
      const freeArr = Array.isArray(parsed.free_text_results) ? parsed.free_text_results : []

      for (const it of physicalArr) {
        aiResults.push({ type: 'physical', id: it.id || '', label: it.label || '', finding: it.finding || '' })
      }
      for (const it of bloodArr) {
        aiResults.push({ type: 'lab', id: it.id || '', label: it.label || '', value: it.value, unit: it.unit || '' })
      }
      for (const it of imagingArr) {
        aiResults.push({ type: 'imaging', id: it.id || '', label: it.label || '', finding: it.finding || '' })
      }
      for (const it of physiologyArr) {
        aiResults.push({ type: 'physiology', id: it.id || '', label: it.label || '', finding: it.finding || '' })
      }
      for (const it of freeArr) {
        const t = (it.type || 'lab').toLowerCase()
        if (t === 'lab') {
          aiResults.push({ type: 'lab', id: 'free_' + (it.label || '').replace(/\s+/g, '_'), label: it.label || '', value: it.value, unit: it.unit || '', isFreeText: true })
        } else {
          aiResults.push({ type: t, id: 'free_' + (it.label || '').replace(/\s+/g, '_'), label: it.label || '', finding: it.finding || '', isFreeText: true })
        }
      }
    }

    // 全結果を返却
    const allResults = []
    if (baselineResult) allResults.push(baselineResult)
    allResults.push.apply(allResults, aiResults)

    return Response.json({ results: allResults })
  } catch (e) {
    console.error('exam-orders error:', e)
    return Response.json({ error: e.message || '検査依頼処理でエラーが発生しました' }, { status: 500 })
  }
}
