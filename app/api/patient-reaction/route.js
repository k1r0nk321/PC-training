export const maxDuration = 60

import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req) {
  try {
    const {
      patientData,
      selectionType,
      selectedItem,
      previousReactions,
      persuasionMessage,
      extraContext,
    } = await req.json()

    const patient = patientData
    const hidden = patient.hidden_params
    const persuasionCount = previousReactions ? Math.floor(previousReactions.length / 2) : 0
    const isPersuasion = !!(persuasionMessage && previousReactions && previousReactions.length > 0)

    const personalityDesc = {
      cooperative: '従順で素直。医師の言うことを基本的に聞こうとする。',
      anxious: '不安が強く心配しがち。共感と丁寧な説明で安心する。',
      resistant: '医療に懐疑的だが、誠実な説明には少しずつ心が動く。',
      lazy: '面倒なことを嫌う。簡単・続けやすいことを強調すると動く。',
      angry: '怒りっぽいが、冷静・共感的な対応で徐々に軟化する。'
    }

    const medicationAttitudeDesc = {
      positive: '薬には前向き。',
      neutral: '薬に特に強い感情はない。',
      negative: 'できれば薬を飲みたくない。',
      very_negative: '薬を強く拒否したい気持ちがある。'
    }

    const adherenceDesc = {
      high: '指示をきちんと守ろうとする意欲がある。',
      medium: 'ある程度は守れるが続かないことも。',
      low: '指示を守り続けるのが難しい。'
    }

    const eatingHabitDesc = {
      home_cooking: '自炊中心。',
      eating_out: '外食が週5回以上と多い。',
      night_eating: '夜食の習慣がある。',
      irregular: '食事時間が不規則。'
    }

    const selectionTypeDesc = {
      medication: '投薬（薬の処方）',
      education: '生活指導のカテゴリ',
      education_sub: '具体的な生活指導内容',
      device: '医療機器の導入'
    }

    const previousText = previousReactions && previousReactions.length > 0
      ? '【これまでのやり取り】\n' +
        previousReactions.map(function(r) {
          return (r.role === 'doctor' ? '研修医：' : '患者：') + r.content
        }).join('\n')
      : ''

    const persuasionText = persuasionMessage
      ? '【今回の研修医の説明・説得】\n' + persuasionMessage
      : ''

    // 現在のacceptance_levelを推定（前回の患者発言から）
    const lastPatientReaction = previousReactions && previousReactions.length > 0
      ? previousReactions.filter(function(r) { return r.role === 'patient' }).slice(-1)[0]
      : null

    const persuasionInstruction = isPersuasion ? `
【説得への応答ルール（最重要）】
これは${persuasionCount}回目の説得です。

▼ 説得の質を以下の基準で判定してください：

【高品質な説得の条件（いずれか1つ以上を満たす）】
・「大変ですね」「お気持ちわかります」「心配なんですね」など共感の言葉がある
・具体的なメリット・数値・エビデンスを示している（「この薬で血圧が〇mmHg下がります」等）
・患者の不安・懸念に直接答えている
・患者の生活スタイルを考慮した現実的な提案をしている
・20文字以上の丁寧な文章である

【説得の質に応じた acceptance_level の変化（必ず適用すること）】

高品質な説得の場合：
  rejected → negotiating（必ず改善）
  negotiating → partial（必ず改善）
  partial → accepted（必ず改善）

普通の説得（10文字以上・理由あり）の場合：
  rejected → negotiating
  negotiating → partial
  partial → partial（変化なし）または accepted

低品質・短すぎる（10文字未満・命令的）の場合：
  変化なし

【患者の性格別・特別ルール】
- cooperative（従順）：普通の説得でも1段階改善。高品質なら即 accepted。
- anxious（不安）：共感の言葉があれば高品質と判定して1〜2段階改善。
- resistant（懐疑的）：高品質でも1段階改善。${persuasionCount >= 2 ? '2回以上の説得なので更に改善しやすい。' : ''}
- lazy（面倒嫌い）：「簡単」「続けやすい」「1日1回だけ」などの言葉で高品質と判定。
- angry（怒りっぽい）：冷静・共感的な対応で1段階改善。怒りに乗らない対応が重要。

アドヒアランス（${hidden.adherence_level}）の補正：
- high：上記の変化に加えてさらに1段階改善しやすい
- medium：上記の通り
- low：1段階少なめ

【重要】説得回数が増えるほど患者は徐々に軟化します。
${persuasionCount >= 2 ? '複数回の誠実な説得で、患者は最終的に受け入れる姿勢になりやすい。' : ''}

必ず acceptance_level を適切に更新し、それに合った自然な発言を生成してください。
accepted になった場合は納得・受け入れの言葉を使うこと。
` : `
【初回反応のルール】
患者の特性に基づいたリアルな初回反応を生成する。
- medication_attitude=positive かつ adherence=high → accepted または partial が多い
- medication_attitude=positive → partial が多い
- personality=cooperative → partial または accepted
- personality=cooperative かつ adherence=high → accepted の可能性が高い
- personality=resistant かつ medication_attitude=very_negative → rejected
- strictness=none → 基本的に accepted
- strictness=very_strict かつ lifestyle_motivation=low → rejected または negotiating
- strictness=mild かつ adherence=medium → partial または accepted
`

    const prompt = `あなたは外来診療シミュレーションの患者AIです。
研修医が治療方針を提示・説明した際の患者の反応をJSONのみで返してください。

【患者プロフィール】
名前：${patient.name}（${patient.age}歳・${patient.gender}）
職業：${patient.occupation}
生活歴：${patient.social_history}

【患者の特性】
性格：${personalityDesc[hidden.personality_type] || '普通'}
薬への態度：${medicationAttitudeDesc[hidden.medication_attitude] || '普通'}
食習慣：${eatingHabitDesc[hidden.eating_habit] || '普通'}
アドヒアランス：${adherenceDesc[hidden.adherence_level]}
生活改善意欲：${hidden.lifestyle_motivation === 'high' ? '高い' : hidden.lifestyle_motivation === 'medium' ? '普通' : '低い'}
ストレス：${hidden.stress_level === 'high' ? '高い（余裕なし）' : hidden.stress_level === 'medium' ? '普通' : '低い'}
仕事の忙しさ：${hidden.work_busyness === 'high' ? '非常に忙しい' : hidden.work_busyness === 'medium' ? '普通' : '余裕あり'}

【研修医が提示した内容】
種別：${selectionTypeDesc[selectionType] || selectionType}
内容：${selectedItem.label || selectedItem.device_name || selectedItem.instruction_key || ''}
${selectedItem.description ? '説明：' + selectedItem.description : ''}
${selectedItem.strictness ? '厳しさ：' + selectedItem.strictness : ''}
${extraContext ? '補足：' + extraContext : ''}

${previousText}
${persuasionText}
${persuasionInstruction}

JSONのみで返すこと（前後のテキスト一切不要）：
{
  "reaction": "患者の発言（自然な口語・40〜80文字）",
  "acceptance_level": "accepted"または"partial"または"rejected"または"negotiating",
  "emotion": "relieved"または"anxious"または"resistant"または"neutral"または"angry"または"convinced",
  "key_concern": "患者が最も気にしていること（15文字以内、なければ空文字）"
}`

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    })

    const responseText = message.content[0].text
    const cleanText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const result = JSON.parse(cleanText)

    return Response.json(result)

  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
