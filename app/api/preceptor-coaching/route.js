import Anthropic from '@anthropic-ai/sdk'
import { claudeCreate } from '../../lib/claude-client'

export const maxDuration = 30

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// 非医師身分の判定
const NON_PHYSICIAN_POSITIONS = ['医学生', '医療従事者', 'その他', '学習者']

// 終了推奨判定(visitNumber 1 のみ paramReady を有効化、その他 Visit は turn ベースのみ)
function computeEndRecommendation(visitNumber, doctorTurnCount, patientParams, shown) {
  const s = shown || {}
  const turn = doctorTurnCount || 0

  // 優先度 1: paramReady (Visit 1 限定、未表示時のみ)
  if (visitNumber === 1 && !s.paramReady && patientParams) {
    const initTrust = patientParams.initial_trust_level
    const curTrust = patientParams.trust_level
    const trustOk = (typeof initTrust === 'number' && typeof curTrust === 'number') && (curTrust >= initTrust + 2)
    const ag = patientParams.lifestyle_agreements || {}
    const diet = ag.diet || {}
    const exercise = ag.exercise || {}
    const dietOk = diet.agreed === true && (diet.level === 'moderate' || diet.level === 'strong')
    const exOk = exercise.agreed === true && (exercise.level === 'moderate' || exercise.level === 'strong')
    if (trustOk && dietOk && exOk) {
      return 'paramReady'
    }
  }

  // 優先度 2: turn 16 以上 → 患者拒否
  if (turn >= 16) return 'refuse'

  // 優先度 3: turn 15 (一度のみ)
  if (turn === 15 && !s.turn15) return 'turn15'

  // 優先度 4: turn 10 (一度のみ)
  if (turn === 10 && !s.turn10) return 'turn10'

  return null
}

// 終了推奨メッセージ(呼称は文中に入れない)
function buildEndRecommendationMessage(kind) {
  if (kind === 'paramReady') {
    return '患者さんとの信頼関係も築けて、生活面でも具体的な合意が取れていますね。情報も十分に集まったようですので、そろそろ治療方針の決定に進んでみてはいかがでしょうか。'
  }
  if (kind === 'turn10') {
    return '問診が充実してきましたね。診察時間も限られていますので、そろそろ治療方針の決定に進むことも検討してみてください。'
  }
  if (kind === 'turn15') {
    return '患者さんから多くの情報が得られましたね。ここまでで治療方針を立てるには十分な情報が揃っているように見受けられます。次のステップへ進みましょう。'
  }
  if (kind === 'refuse') {
    return '診察時間が長くなっていますね。患者さんも少しお疲れの様子です。これ以上の問診継続は患者さんの負担になりますので、今お持ちの情報で治療方針の決定に進みましょう。'
  }
  return null
}

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
    const { diseaseName, recentMessages, doctorMessage, patientResponse, visitNumber, patientParams, doctorTurnCount, endRecommendationShown, userPosition } = await req.json()

    const speakerLabel = NON_PHYSICIAN_POSITIONS.includes(userPosition) ? '学習者' : '研修医'

    const recentContext = (recentMessages || [])
      .slice(-6)
      .filter(function(m) { return m.role !== 'system' })
      .map(function(m) {
        const who = m.role === 'user' ? speakerLabel : '患者'
        return who + ': ' + m.content
      }).join('\n')

    const patientContext = buildPatientContext(patientParams)

    const prompt = 'あなたは外来診療シミュレーションの上級指導医です。' + speakerLabel + 'が患者と問診を行っている場面で、' + speakerLabel + 'の問診技術に対して丁寧で教育的なコーチングを提供してください。\n\n'
      + '【症例】' + (diseaseName || '不明') + ' の Visit ' + (visitNumber || 1) + ' 問診中\n\n'
      + patientContext
      + '【直近の対話】\n' + recentContext + '\n\n'
      + '【今回のやり取り】\n'
      + speakerLabel + ': ' + (doctorMessage || '') + '\n'
      + '患者: ' + (patientResponse || '') + '\n\n'
      + '【コーチングの方針】\n'
      + '- ' + speakerLabel + 'の質問を肯定的に評価する(「とても良い質問ですね」「的確な確認です」など)\n'
      + '- なぜその質問が重要かを簡潔に説明\n'
      + '- 患者反応から学べる臨床的ポイントがあれば指摘\n'
      + '- 次に聞くと良いこと・検査すべきこと・治療判断のヒントを必要に応じて提示\n'
      + '- 状況に応じて、コミュニケーション面(共感・説明)と臨床判断面を使い分け\n'
      + '- 上記の患者特性に既に記載されている情報(喫煙歴、飲酒量、現在の運動・食事習慣など)を改めて確認するよう促すアドバイスはしない\n'
      + '- 患者特性を踏まえ、患者個別の状況に応じた具体的なアドバイスをする(例: 服薬意欲が低い→効果やリスクの具体説明、信頼度が低い→共感的傾聴を強調、生活改善意欲が低い→動機づけ面接の活用)\n'
      + '- ' + speakerLabel + 'が試みている対話戦略を尊重し、その方向性を強化する(先回りして異なる戦略を押し付けない)\n'
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

    // 終了推奨判定
    const endKind = computeEndRecommendation(visitNumber, doctorTurnCount, patientParams, endRecommendationShown)
    const endRecommendation = endKind ? {
      kind: endKind,
      message: buildEndRecommendationMessage(endKind),
    } : null

    return Response.json({ commentary, endRecommendation })
  } catch (e) {
    return Response.json({ commentary: null, endRecommendation: null, error: e.message }, { status: 500 })
  }
}
