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

    const personalityAcceptance = {
      cooperative: { base: 'partial', withGoodPersuasion: 'accepted', withGreatPersuasion: 'accepted' },
      anxious: { base: 'partial', withGoodPersuasion: 'accepted', withGreatPersuasion: 'accepted' },
      resistant: { base: 'rejected', withGoodPersuasion: 'negotiating', withGreatPersuasion: 'partial' },
      lazy: { base: 'negotiating', withGoodPersuasion: 'partial', withGreatPersuasion: 'accepted' },
      angry: { base: 'rejected', withGoodPersuasion: 'negotiating', withGreatPersuasion: 'partial' },
    }

    const adherenceBonus = {
      high: 1,
      medium: 0,
      low: -1,
    }

    const personalityDesc = {
      cooperative: '従順で素直。医師の言うことを基本的に聞こうとする。',
      anxious: '不安が強く心配しがち。共感と丁寧な説明で安心する。',
      resistant: '医療に懐疑的で指示に従いたがらない。ただし誠実な説明には少しずつ心が動く。',
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

    const isPersuasion = !!(persuasionMessage && previousReactions && previousReactions.length > 0)

    const persuasionInstruction = isPersuasion ? `
【説得への応答ルール（重要）】
これは説得の${persuasionCount + 1}回目です。

説得の質を判定して反応を変えること：

◎ 高品質な説得（以下のいずれかを含む）：
  - 患者の懸念・不安に直接答えている
  - 「大変でしたね」「お気持ちわかります」など共感の言葉がある
  - 具体的なメリット・数値を示している
  - 患者の生活状況を考慮した現実的な提案をしている
  → acceptance_levelを必ず1〜2段階改善すること
     例：rejected → negotiating、negotiating → partial、partial → accepted

○ 普通の説得：
  - ある程度の説明はあるが患者の核心的な懸念には答えていない
  → acceptance_levelを1段階改善することがある

× 低品質な説得：
  - 命令的・一方的・「必要です」だけ
  - 10文字以下など短すぎる
  → 変化なし（むしろ悪化することもある）

患者の性格別の説得されやすさ：
- cooperative（従順）：普通の説得でも受け入れる
- anxious（不安）：共感の言葉があれば受け入れる
- resistant（懐疑的）：高品質な説得で1段階改善。2回目以降は更に改善しやすくなる
- lazy（面倒嫌い）：「簡単」「続けやすい」強調で改善
- angry（怒りっぽい）：冷静・共感的対応で徐々に改善。怒りに乗らない対応が大事

アドヒアランス（${hidden.adherence_level}）の影響：
- high：説得されやすく、partial以上に達したら次の説得でacceptedになりやすい
- medium：普通
- low：改善しにくいが、累積説得回数（${persuasionCount}回目）が増えると徐々に軟化する

【必ず acceptance_level を改善してください（高品質な説得の場合）】
` : `
【初回反応のルール】
患者の特性に基づいたリアルな初回反応を生成する。
- medication_attitude=positive かつ adherence=high → accepted または partial
- personality=cooperative → partial または accepted
- personality=resistant かつ medication_attitude=very_negative → rejected
- strictness=none → 基本的に accepted
- strictness=very_strict かつ lifestyle_motivation=low → rejected の可能性高い
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

JSONのみで返すこと（前後のテキスト不要）：
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
