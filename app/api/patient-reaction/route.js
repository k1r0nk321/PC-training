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
    } = await req.json()

    const patient = patientData
    const hidden = patient.hidden_params

    const personalityDesc = {
      cooperative: '従順で素直。医師の言うことを基本的に聞こうとする。',
      anxious: '不安が強く、何でも心配する。副作用や将来への不安を口にする。',
      resistant: '医療全般に懐疑的で、指示に従いたがらない。',
      lazy: '面倒なことを嫌う。続けられるか自信がない。',
      angry: '怒りっぽく、少し気に触ると反発する。'
    }

    const medicationAttitudeDesc = {
      positive: '薬には比較的前向き。',
      neutral: '薬について特に強い感情はない。',
      negative: 'できれば薬を飲みたくない。',
      very_negative: '薬を強く拒否する傾向がある。'
    }

    const eatingHabitDesc = {
      home_cooking: '自炊中心の生活。',
      eating_out: '外食が多い（週5回以上）。',
      night_eating: '夜食の習慣がある（22時以降に食事）。',
      irregular: '食事時間が不規則。'
    }

    const adherenceDesc = {
      high: '指示されたことをきちんと守ろうとする。',
      medium: 'ある程度は守れるが、ときどき忘れる。',
      low: '指示を守るのが難しい。続かないことが多い。'
    }

    const previousText = previousReactions && previousReactions.length > 0
      ? '【これまでの研修医と患者のやり取り】\n' +
        previousReactions.map(function(r) {
          return (r.role === 'doctor' ? '研修医：' : '患者：') + r.content
        }).join('\n')
      : ''

    const persuasionText = persuasionMessage
      ? '【研修医の説明・説得】\n' + persuasionMessage
      : ''

    const selectionTypeDesc = {
      medication: '投薬（薬の処方）',
      education: '生活指導・患者教育',
      device: '医療機器の導入',
      education_sub: '具体的な生活指導の内容'
    }

    const prompt = `あなたは外来診療シミュレーションの患者AIです。
研修医が治療方針の選択肢を提示または説明した際の患者の反応を生成してください。

【患者プロフィール】
名前：${patient.name}（${patient.age}歳・${patient.gender}）
職業：${patient.occupation}
生活歴：${patient.social_history}

【患者の特性】
性格：${personalityDesc[hidden.personality_type] || '普通'}
服薬への態度：${medicationAttitudeDesc[hidden.medication_attitude] || '普通'}
食習慣：${eatingHabitDesc[hidden.eating_habit] || '普通'}
アドヒアランス：${adherenceDesc[hidden.adherence_level]}
生活改善意欲：${hidden.lifestyle_motivation === 'high' ? '高い' : hidden.lifestyle_motivation === 'medium' ? '普通' : '低い'}
ストレスレベル：${hidden.stress_level === 'high' ? '高い（仕事が忙しく余裕がない）' : hidden.stress_level === 'medium' ? '普通' : '低い（比較的余裕がある）'}
仕事の忙しさ：${hidden.work_busyness === 'high' ? '非常に忙しい' : hidden.work_busyness === 'medium' ? '普通' : '比較的余裕がある'}
社会背景：${hidden.social_background}

【研修医が提示した内容】
種別：${selectionTypeDesc[selectionType] || selectionType}
内容：${selectedItem.label || selectedItem.device_name || selectedItem.instruction_key || ''}
${selectedItem.description ? '説明：' + selectedItem.description : ''}
${selectedItem.strictness ? '厳しさ：' + selectedItem.strictness : ''}

${previousText}
${persuasionText}

【応答ルール】
・患者として自然な日本語で反応する（50〜100文字程度）
・患者の性格・特性・生活習慣を必ず反映する
・説得メッセージがある場合は、その内容の質に応じて反応を変える
  - 適切な説明・共感的な言葉 → 少し前向きになる
  - 不十分・一方的な説明 → 変化なしまたは拒否継続
  - 患者の不安に寄り添った説明 → 心が動く
・JSONで返す（テキストのみ不要）

{
  "reaction": "患者の発言（自然な口語）",
  "acceptance_level": "accepted"または"partial"または"rejected"または"negotiating",
  "emotion": "relieved"または"anxious"または"resistant"または"neutral"または"angry"または"convinced",
  "key_concern": "患者が最も気にしていること（20文字以内）"
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
