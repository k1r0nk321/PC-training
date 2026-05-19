import Anthropic from '@anthropic-ai/sdk'
import { claudeCreate } from '../../lib/claude-client'

export const maxDuration = 30

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// 患者特性ブロックを構築(personality は意図的に渡さない)
function buildPatientContext(params) {
  if (!params) return ''
  const parts = []
  if (params.eating_habit_label) {
    parts.push('食生活: ' + params.eating_habit_label + (params.eating_habit_comment ? '(' + params.eating_habit_comment + ')' : ''))
  }
  if (params.exercise_habit_label) {
    parts.push('運動: ' + params.exercise_habit_label + (params.exercise_habit_comment ? '(' + params.exercise_habit_comment + ')' : ''))
  }
  if (params.smoking_label) {
    parts.push('喫煙: ' + params.smoking_label + (params.smoking_comment ? '(' + params.smoking_comment + ')' : ''))
  }
  if (params.drinking_label) {
    parts.push('飲酒: ' + params.drinking_label + (params.drinking_comment ? '(' + params.drinking_comment + ')' : ''))
  }
  const stars = function(n) {
    const v = Math.max(0, Math.min(5, n || 0))
    return '★'.repeat(v) + '☆'.repeat(5 - v)
  }
  parts.push('生活改善意欲: ' + stars(params.lifestyle_motivation) + ' (' + (params.lifestyle_motivation || 0) + '/5)')
  parts.push('服薬意欲: ' + stars(params.medication_motivation) + ' (' + (params.medication_motivation || 0) + '/5)')
  parts.push('信頼度: ' + stars(params.trust_level) + ' (' + (params.trust_level || 0) + '/5)')
  // 問診中の合意事項
  const agreements = params.lifestyle_agreements || {}
  const catLabels = { diet: '食事', exercise: '運動', smoking: '禁煙', drinking: '節酒', weight: '減量', monitoring: '自己管理' }
  const agreed = []
  Object.keys(agreements).forEach(function(k) {
    const a = agreements[k]
    if (a && a.agreed) {
      agreed.push((catLabels[k] || k) + (a.detail ? '(' + a.detail + ')' : ''))
    }
  })
  if (agreed.length > 0) {
    parts.push('問診中の合意事項: ' + agreed.join('、'))
  }
  return '【現在の患者特性(問診中に判明している情報)】\n' + parts.join('\n') + '\n\n'
}

export async function POST(req) {
  try {
    const { diseaseName, recentMessages, doctorMessage, patientResponse, visitNumber, patientParams } = await req.json()

    const recentContext = (recentMessages || [])
      .slice(-6)
      .filter(function(m) { return m.role !== 'system' })
      .map(function(m) {
        const who = m.role === 'user' ? '研修医' : '患者'
        return who + ': ' + m.content
      }).join('\n')

    const patientContext = buildPatientContext(patientParams)

    const prompt = 'あなたは外来診療シミュレーションの上級指導医です。研修医が患者と問診を行っている場面で、研修医の問診技術に対して丁寧で教育的なコーチングを提供してください。\n\n'
      + '【症例】' + (diseaseName || '不明') + ' の Visit ' + (visitNumber || 1) + ' 問診中\n\n'
      + patientContext
      + '【直近の対話】\n' + recentContext + '\n\n'
      + '【今回のやり取り】\n'
      + '研修医: ' + (doctorMessage || '') + '\n'
      + '患者: ' + (patientResponse || '') + '\n\n'
      + '【コーチングの方針】\n'
      + '- 研修医の質問を肯定的に評価する(「とても良い質問ですね」「的確な確認です」など)\n'
      + '- なぜその質問が重要かを簡潔に説明\n'
      + '- 患者反応から学べる臨床的ポイントがあれば指摘\n'
      + '- 次に聞くと良いこと・検査すべきこと・治療判断のヒントを必要に応じて提示\n'
      + '- 状況に応じて、コミュニケーション面(共感・説明)と臨床判断面を使い分け\n'
      + '- 上記の患者特性に既に記載されている情報(喫煙歴、飲酒量、現在の運動・食事習慣など)を改めて確認するよう促すアドバイスはしない\n'
      + '- 患者特性を踏まえ、患者個別の状況に応じた具体的なアドバイスをする(例: 服薬意欲が低い→効果やリスクの具体説明、信頼度が低い→共感的傾聴を強調、生活改善意欲が低い→動機づけ面接の活用)\n'
      + '- 研修医が試みている対話戦略を尊重し、その方向性を強化する(先回りして異なる戦略を押し付けない)\n'
      + '- 100〜200文字、敬語、優しく丁寧、教育的\n\n'
      + '【出力ルール】\n'
      + '- コメント本文のみを出力(「コメント:」「アドバイス:」などの装飾なし)\n'
      + '- 2〜3文で完結\n'
      + '- 改行は使わず1〜2段落に収める'

    const message = await claudeCreate({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    })

    const commentary = message.content[0].text.trim()
    return Response.json({ commentary })
  } catch (e) {
    return Response.json({ commentary: null, error: e.message }, { status: 500 })
  }
}
