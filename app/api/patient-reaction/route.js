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

    const personalityDesc = {
      cooperative: '従順で素直。医師の言うことを基本的に聞こうとする。説明されれば納得しやすい。',
      anxious: '不安が強く、何でも心配する。丁寧な説明と共感で安心感を与えると納得しやすい。',
      resistant: '医療全般に懐疑的で指示に従いたがらない。強引な説得は逆効果。エビデンスより共感が有効。',
      lazy: '面倒なことを嫌う。簡単・続けやすいことを強調すると動く。',
      angry: '怒りっぽく反発しやすい。怒りに乗らず冷静・共感的に対応すると和らぐ。'
    }

    const medicationAttitudeDesc = {
      positive: '薬には比較的前向き。メリットを説明すれば受け入れやすい。',
      neutral: '薬について特に強い感情はない。',
      negative: 'できれば薬を飲みたくない。副作用・依存への不安がある。',
      very_negative: '薬を強く拒否する。一生飲み続けることへの強い抵抗感がある。'
    }

    const adherenceDesc = {
      high: '指示されたことをきちんと守ろうとする意欲がある。',
      medium: 'ある程度は守れるが、ときどき忘れたり面倒になったりする。',
      low: '指示を守り続けるのが難しい。継続性に課題がある。'
    }

    const eatingHabitDesc = {
      home_cooking: '自炊中心。食事管理の改善余地は比較的小さい。',
      eating_out: '外食が週5回以上。外食制限は仕事上難しいと感じている。',
      night_eating: '22時以降の夜食習慣がある。仕事が遅く夜食をやめるのは難しい。',
      irregular: '食事時間が不規則。生活リズムの改善が必要。'
    }

    const selectionTypeDesc = {
      medication: '投薬（薬の処方）',
      education: '生活指導・患者教育のカテゴリ',
      education_sub: '具体的な生活指導の内容',
      device: '医療機器の導入'
    }

    const previousText = previousReactions && previousReactions.length > 0
      ? '【これまでのやり取り】\n' +
        previousReactions.map(function(r) {
          return (r.role === 'doctor' ? '研修医：' : '患者：') + r.content
        }).join('\n')
      : ''

    const persuasionText = persuasionMessage
      ? '【研修医の説明・説得メッセージ】\n' + persuasionMessage
      : ''

    const isPersuasion = persuasionMessage && previousReactions && previousReactions.length > 0

    // 説得の質を評価するための指示
    const persuasionQualityInstruction = isPersuasion ? `
【説得への応答ルール】
研修医の説得メッセージの質に応じて患者の反応を変えること：

◎ 高評価（納得しやすい説得）：
- 患者の不安・懸念に直接答えている
- 具体的なメリットや数値を示している
- 共感的・寄り添う言葉がある（「大変でしたね」「お気持ちわかります」）
- 患者の生活習慣を考慮した現実的な提案

○ 中評価（部分的に納得）：
- ある程度の説明はあるが、患者の核心的な懸念には答えていない

× 低評価（納得しにくい説得）：
- 一方的・押しつけがましい
- 「必要です」「やってください」など命令的
- 患者の懸念を無視している
- 短すぎて説明になっていない

患者の性格（${hidden.personality_type}）とアドヒアランス（${hidden.adherence_level}）を考慮：
- cooperative/high adherence → 高評価の説得で「同意（accepted）」になりやすい
- anxious → 共感的な言葉で「一部同意（partial）」→「同意（accepted）」に変化しやすい
- resistant → 高評価でも「交渉中（negotiating）」止まりのことが多い
- lazy → 「簡単にできる」「続けやすい」を強調した場合に「一部同意」になりやすい
- angry → 冷静・共感的な説得で徐々に軟化する。high adherenceなら最終的に受け入れることもある
` : ''

    const prompt = `あなたは外来診療シミュレーションの患者AIです。
研修医が治療方針を提示・説明した際の患者の反応をJSONで返してください。

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
ストレス：${hidden.stress_level === 'high' ? '高い（余裕なし）' : hidden.stress_level === 'medium' ? '普通' : '低い（余裕あり）'}
仕事の忙しさ：${hidden.work_busyness === 'high' ? '非常に忙しい' : hidden.work_busyness === 'medium' ? '普通' : '余裕あり'}
社会背景：${hidden.social_background}

【研修医が提示した内容】
種別：${selectionTypeDesc[selectionType] || selectionType}
内容：${selectedItem.label || selectedItem.device_name || selectedItem.instruction_key || ''}
${selectedItem.description ? '説明：' + selectedItem.description : ''}
${selectedItem.strictness ? '厳しさ：' + selectedItem.strictness : ''}
${extraContext ? '補足：' + extraContext : ''}

${previousText}
${persuasionText}
${persuasionQualityInstruction}

【基本応答ルール】
・患者として自然な日本語で反応する（40〜80文字）
・患者の性格・生活習慣を必ず反映する
・初回反応は患者特性に基づいたリアルな反応（必ずしも拒否ではない）
  - medication_attitude=positive, adherence=high → 初回から受け入れやすい
  - personality=cooperative → 基本的に前向きに検討する
  - personality=resistant, medication_attitude=very_negative → 強く拒否することが多い
・strictness（厳しさ）が高いほど、lifestyle_motivationが低い患者は抵抗しやすい

JSON形式のみで返すこと（他のテキスト不要）：
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
