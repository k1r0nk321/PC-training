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
  → acceptance_levelを1段階改善すること
