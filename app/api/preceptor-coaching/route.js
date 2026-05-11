import Anthropic from '@anthropic-ai/sdk'

export const maxDuration = 30

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req) {
  try {
    const { diseaseName, recentMessages, doctorMessage, patientResponse, visitNumber } = await req.json()

    const recentContext = (recentMessages || [])
      .slice(-6)
      .filter(function(m) { return m.role !== 'system' })
      .map(function(m) {
        const who = m.role === 'user' ? '研修医' : '患者'
        return who + ': ' + m.content
      }).join('\n')

    const prompt = 'あなたは外来診療シミュレーションの上級指導医です。研修医が患者と問診を行っている場面で、研修医の問診技術に対して丁寧で教育的なコーチングを提供してください。\n\n'
      + '【症例】' + (diseaseName || '不明') + ' の Visit ' + (visitNumber || 1) + ' 問診中\n\n'
      + '【直近の対話】\n' + recentContext + '\n\n'
      + '【今回のやり取り】\n'
      + '研修医: ' + (doctorMessage || '') + '\n'
      + '患者: ' + (patientResponse || '') + '\n\n'
      + '【コーチングの方針】\n'
      + '- 研修医の質問を肯定的に評価する（「とても良い質問ですね」「的確な確認です」など）\n'
      + '- なぜその質問が重要かを簡潔に説明\n'
      + '- 患者反応から学べる臨床的ポイントがあれば指摘\n'
      + '- 次に聞くと良いこと・検査すべきこと・治療判断のヒントを必要に応じて提示\n'
      + '- 状況に応じて、コミュニケーション面（共感・説明）と臨床判断面を使い分け\n'
      + '- 100〜200文字、敬語、優しく丁寧、教育的\n\n'
      + '【出力ルール】\n'
      + '- コメント本文のみを出力（「コメント:」「アドバイス:」などの装飾なし）\n'
      + '- 2〜3文で完結\n'
      + '- 改行は使わず1〜2段落に収める'

    const message = await anthropic.messages.create({
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
