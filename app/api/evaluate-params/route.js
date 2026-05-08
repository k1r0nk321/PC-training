export const maxDuration = 30

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v))
}

function buildPrompt(recentMessages, currentParams, contextType, personality) {
  const contextLabel = contextType === 'treatment' ? '治療方針提示後の指導場面' : '問診場面'
  const convo = recentMessages.map(function(m) {
    const role = m.role === 'user' ? '医師' : '患者'
    return role + ': ' + m.content
  }).join('\n')

  return `あなたはプライマリケア外来シミュレーションの患者パラメーター評価AIです。\n` +
    `医師の最新の発言・指導内容を評価し、患者の以下のパラメーターをどう変動させるか判定してください。\n\n` +
    `【場面】` + contextLabel + `\n\n` +
    `【患者の性格（参考・固定）】` + (personality || '不明') + `\n\n` +
    `【現在のパラメーター】\n` +
    `- 食生活習慣: ` + (currentParams.eating_habit_label || '') + ' (' + (currentParams.eating_habit_comment || '') + `)\n` +
    `- 運動習慣: ` + (currentParams.exercise_habit_label || '') + ' (' + (currentParams.exercise_habit_comment || '') + `)\n` +
    `- ストレス★: ` + currentParams.stress + `/5（★多=悪い、減らせば改善）\n` +
    `- 忙しさ★: ` + currentParams.busyness + `/5（★多=悪い、減らせば改善）\n` +
    `- 生活改善意欲★: ` + currentParams.lifestyle_motivation + `/5（★多=良い、増えれば改善）\n` +
    `- 服薬意欲★: ` + currentParams.medication_motivation + `/5（★多=良い、増えれば改善）\n\n` +
    `【最近の会話】\n` + convo + `\n\n` +
    `【評価ルール】\n` +
    `1. 医師の最新の発言の質を評価する（共感的傾聴・具体的アドバイス・患者目線の説明 → 改善方向）\n` +
    `2. 否定的・押付け・専門用語多用・無関心 → 悪化方向\n` +
    `3. 関連性のない発言は変動なし\n` +
    `4. 変動幅は通常 -1〜+1 の整数。明確な強い影響があった時のみ ±2\n` +
    `5. 食生活・運動の指導が具体的で受け入れられそうな内容なら、ラベルやコメントを改善方向に書き換える\n\n` +
    `【出力形式】JSONのみ。説明文・前後の文章・コードブロック記号は一切不要。\n` +
    `{\n` +
    `  "eating_habit_label": "新しい定型句、変化なしならnull",\n` +
    `  "eating_habit_comment": "新しいコメント、変化なしならnull",\n` +
    `  "exercise_habit_label": "新しい定型句、変化なしならnull",\n` +
    `  "exercise_habit_comment": "新しいコメント、変化なしならnull",\n` +
    `  "stress_delta": 整数(-2〜+2),\n` +
    `  "busyness_delta": 整数(-2〜+2),\n` +
    `  "lifestyle_motivation_delta": 整数(-2〜+2),\n` +
    `  "medication_motivation_delta": 整数(-2〜+2),\n` +
    `  "reasoning": "1〜2文の評価理由"\n` +
    `}`
}

export async function POST(req) {
  try {
    const body = await req.json()
    const { caseId, visitNumber, recentMessages, currentParams, context, personality } = body

    if (!caseId || !visitNumber || !currentParams) {
      return Response.json({ error: 'caseId, visitNumber, currentParams required' }, { status: 400 })
    }

    const prompt = buildPrompt(recentMessages || [], currentParams, context, personality)

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })

    const responseText = message.content[0].text
    const cleanText = responseText.replace(/\`\`\`json\n?/g, '').replace(/\`\`\`\n?/g, '').trim()
    let evaluation
    try {
      evaluation = JSON.parse(cleanText)
    } catch (parseErr) {
      return Response.json({ error: 'parse failed', raw: cleanText }, { status: 500 })
    }

    const newParams = {
      eating_habit_label: evaluation.eating_habit_label != null ? evaluation.eating_habit_label : currentParams.eating_habit_label,
      eating_habit_comment: evaluation.eating_habit_comment != null ? evaluation.eating_habit_comment : currentParams.eating_habit_comment,
      exercise_habit_label: evaluation.exercise_habit_label != null ? evaluation.exercise_habit_label : currentParams.exercise_habit_label,
      exercise_habit_comment: evaluation.exercise_habit_comment != null ? evaluation.exercise_habit_comment : currentParams.exercise_habit_comment,
      stress: clamp((currentParams.stress || 3) + (evaluation.stress_delta || 0), 1, 5),
      busyness: clamp((currentParams.busyness || 3) + (evaluation.busyness_delta || 0), 1, 5),
      lifestyle_motivation: clamp((currentParams.lifestyle_motivation || 3) + (evaluation.lifestyle_motivation_delta || 0), 1, 5),
      medication_motivation: clamp((currentParams.medication_motivation || 3) + (evaluation.medication_motivation_delta || 0), 1, 5),
    }

    const supabase = getAdminClient()
    const { data, error } = await supabase
      .from('visit_parameters')
      .update(newParams)
      .eq('case_id', caseId)
      .eq('visit_number', visitNumber)
      .select()
      .single()

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    const deltas = {
      stress: newParams.stress - (currentParams.stress || 3),
      busyness: newParams.busyness - (currentParams.busyness || 3),
      lifestyle_motivation: newParams.lifestyle_motivation - (currentParams.lifestyle_motivation || 3),
      medication_motivation: newParams.medication_motivation - (currentParams.medication_motivation || 3),
      eating_habit_changed: evaluation.eating_habit_label != null || evaluation.eating_habit_comment != null,
      exercise_habit_changed: evaluation.exercise_habit_label != null || evaluation.exercise_habit_comment != null,
    }

    return Response.json({
      params: data,
      deltas: deltas,
      reasoning: evaluation.reasoning || ''
    })

  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
