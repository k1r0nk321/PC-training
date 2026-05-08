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
    `直近の医師-患者の会話を読み、患者の以下のパラメーターをどう変動させるか判定してください。\n\n` +
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
    `【評価ルール - 重要】\n` +
    `A. 医師の発言と患者の発言の両方を総合的に評価する。\n` +
    `   - 患者本人の意欲表明・同意・前向きな反応 → 改善方向に強く影響\n` +
    `   - 患者本人の抵抗・諦め・不安・否定的反応 → 悪化方向に強く影響\n` +
    `   - 医師の共感的傾聴・具体的アドバイス・患者目線の説明 → 改善方向に影響\n` +
    `   - 医師の押付け・否定・専門用語多用・無関心 → 悪化方向に影響\n\n` +
    `B. 患者が「実際の行動」「具体的な計画」を述べた場合は、ラベルやコメントを必ず実態に書き換える。例：\n` +
    `   - 患者「週2回、30分歩いています」→ exercise_habit_label="1回30分歩行", exercise_habit_comment="週2回"\n` +
    `   - 患者「週末だけ1時間運動してます」→ exercise_habit_label="1回1時間運動", exercise_habit_comment="週末のみ"\n` +
    `   - 患者「運動はほとんどしてません」→ exercise_habit_label="ほとんど運動しない", exercise_habit_comment=""\n` +
    `   - 患者「自炊するようにしました」→ eating_habit_label="自炊中心", eating_habit_comment="新しい習慣"\n` +
    `   - 患者「外食が多くて」→ eating_habit_label="外食中心", eating_habit_comment=""\n` +
    `   - 患者「○○してみます」「○○するようにします」のような前向きな宣言 → ラベル/コメントを意欲的な内容に書き換え + 生活改善意欲★ +1\n\n` +
    `C. 服薬意欲・生活改善意欲★の変動例：\n` +
    `   - 患者「ちゃんと飲めてます」「続けてます」 → 服薬意欲★ +1\n` +
    `   - 患者「飲み忘れることがあって」「続かなくて」 → 服薬意欲★ -1\n` +
    `   - 患者「頑張ります」「やってみます」「やります」「指導通りにします」 → 生活改善意欲★ +1\n` +
    `   - 患者「難しいです」「無理かも」「自信ないです」 → 生活改善意欲★ -1\n\n` +
    `D. ストレス・忙しさ★の変動例：\n` +
    `   - 患者「リラックスできてます」「ゆとりが出てきた」 → ストレス★ -1\n` +
    `   - 患者「最近イライラして」「眠れなくて」 → ストレス★ +1\n` +
    `   - 患者「仕事が落ち着きました」 → 忙しさ★ -1\n` +
    `   - 患者「残業続きで」「休みもなくて」 → 忙しさ★ +1\n\n` +
    `E. 関連性のない発言・挨拶・短い相槌のみの場合は変動なし（全てnullまたは0）。\n\n` +
    `F. 変動幅は通常 -1〜+1 の整数。患者が大きな変化を述べたり強い感情表現があった時のみ ±2。\n\n` +
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
    `  "reasoning": "1〜2文の評価理由（どの発言から判断したか明記）"\n` +
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
