export const maxDuration = 60

import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req) {
  try {
    const { patientData, caseData } = await req.json()
    const patient = patientData
    const history = patient.history || ''
    const pastHistory = patient.past_history || ''

    const prompt = `あなたは前医（田村内科クリニック）の医師です。患者の紹介状を作成してください。

【患者情報】
氏名：${patient.name}（${patient.age}歳・${patient.gender}）
既往歴：${pastHistory}
治療経過：${history}
生活歴：${patient.social_history}

以下の形式で紹介状を作成してください：

---
紹介状

拝啓　時下ますますご清祥のこととお慶び申し上げます。
下記の患者様について、当院閉院に伴いご紹介申し上げます。
何卒よろしくお願い申し上げます。

【患者氏名】${patient.name}様（${patient.age}歳・${patient.gender}）

【紹介目的】
当院閉院に伴う高血圧症の継続加療のお願い

【現病歴・治療経過】
（3年間の治療経過を具体的に記載。初診時の血圧値、治療方針、経過など）

【現在の処方内容】
（具体的な薬剤名・用量を記載）

【直近の検査結果】
（血液検査・尿検査などの具体的な数値を記載）

【合併症・併存疾患】
${pastHistory}

【社会的背景】
${patient.social_history}

【お願い事項】
今後の高血圧症の管理・治療を何卒よろしくお願い申し上げます。

田村内科クリニック
田村 健一
---

紹介状のみを出力してください。前置きや説明は不要です。`

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })

    const letter = message.content[0].text.trim()
    return Response.json({ letter })

  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
