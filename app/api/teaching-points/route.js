import Anthropic from '@anthropic-ai/sdk'
import { claudeCreate } from '../../lib/claude-client'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 30

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req) {
  try {
    const { diseaseId, diseaseName, patientContext, lastPatientStatement } = await req.json()

    if (!diseaseId) {
      return Response.json({ error: 'diseaseId required' }, { status: 400 })
    }

    const supabase = getAdminClient()

    const { data: guidelines } = await supabase
      .from('guideline_items')
      .select('item_type, content, guideline_name, page_ref')
      .eq('disease_id', diseaseId)
      .eq('is_active', true)
      .limit(12)

    const guidelineText = (guidelines || []).map(function(g) {
      return '【' + g.item_type + '】' + g.content + (g.guideline_name ? '（' + g.guideline_name + (g.page_ref ? ' p.' + g.page_ref : '') + '）' : '')
    }).join('\n')

    const prompt =
      'あなたはプライマリケア医療教育AIです。患者が医師にアドバイスを求めている場面で、研修医がその患者にすべき指導ポイントを3つ簡潔に提示してください。' + '\n\n' +
      '【疾患】' + (diseaseName || '不明') + '\n' +
      '【患者背景】' + (patientContext || '不明') + '\n' +
      '【患者の発言】' + (lastPatientStatement || '') + '\n\n' +
      '【ガイドライン抜粋】\n' + (guidelineText || '（該当なし）') + '\n\n' +
      '【指示】' + '\n' +
      '- 各指導ポイントは具体的で実行可能な行動指針（食事・運動・服薬・モニタリング等）。' + '\n' +
      '- 各point は40〜60文字。' + '\n' +
      '- ガイドラインに基づき、患者の発言文脈に最も関連する3点を選ぶ。' + '\n\n' +
      '【出力形式】JSONのみ。コードブロック記号や説明文は一切不要。' + '\n' +
      '{' + '\n' +
      '  "points": ["1つ目", "2つ目", "3つ目"],' + '\n' +
      '  "rationale": "ガイドライン参照根拠（30文字以内）"' + '\n' +
      '}'

    const message = await claudeCreate({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    })

    const responseText = message.content[0].text
    const cleanText = responseText.replace(/\`\`\`json\n?/g, '').replace(/\`\`\`\n?/g, '').trim()

    let result
    try {
      result = JSON.parse(cleanText)
    } catch (e) {
      return Response.json({ error: 'parse failed', raw: cleanText }, { status: 500 })
    }

    return Response.json(result)

  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
