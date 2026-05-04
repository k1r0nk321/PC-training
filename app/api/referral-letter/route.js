export const maxDuration = 60

import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req) {
  try {
    const { patientData } = await req.json()
    const patient = patientData

    const prompt = `あなたは前医（田村内科クリニック・田村健一医師）です。以下の患者情報をもとに、転院先への紹介状を作成してください。

【患者情報（必ずすべて使用すること）】
氏名：${patient.name}（${patient.age}歳・${patient.gender}）
職業：${patient.occupation}
主訴・受診経緯：${patient.chief_complaint}
現病歴：${patient.history}
既往歴：${patient.past_history}
家族歴：${patient.family_history}
生活歴：${patient.social_history}
バイタル（最終受診時）：血圧${patient.vitals.bp}、脈拍${patient.vitals.hr}、BMI${patient.vitals.bmi}（身長${patient.vitals.height}cm・体重${patient.vitals.weight}kg）

【紹介状作成の注意事項】
・既往歴・服薬歴は患者情報に記載されているものを必ず具体的に記載すること
・「特記事項なし」「服薬なし」など情報を省略・改変しないこと
・治療経過は現病歴をもとに3年間の経過として具体的に記載すること
・検査結果は実際の数値を推定して記載すること（腎機能・電解質・脂質など）

以下の形式で紹介状のみを出力してください（前置き・説明不要）：

紹介状

拝啓　時下ますますご清祥のこととお慶び申し上げます。
下記の患者様について、当院閉院に伴いご紹介申し上げます。
何卒よろしくお願い申し上げます。

患者氏名：${patient.name}様（${patient.age}歳・${patient.gender}）
生年月日：（推定）
住所：（記載省略）

【紹介目的】
当院閉院に伴う${patient.past_history.includes('高血圧') ? '高血圧症' : '高血圧症'}の継続加療のお願い

【現病歴・治療経過】
（patient.historyをもとに、初診から現在までの3年間の経過を具体的に3〜5文で記載。初診時血圧・治療開始・経過・現在の状態を含める）

【現在の処方内容】
（patient.past_historyに記載されている薬剤を必ず含めて記載。用量・用法も具体的に）

【直近の検査結果（約3ヶ月前）】
・血圧：${patient.vitals.bp}
・BMI：${patient.vitals.bmi}
・Cr：（推定値）　eGFR：（推定値）
・Na：（推定値）　K：（推定値）
・LDL：（推定値）　TG：（推定値）　HDL：（推定値）
・HbA1c：（推定値、糖尿病合併の場合のみ）
・尿蛋白：（推定値）

【合併症・併存疾患】
${patient.past_history}

【社会的背景】
${patient.social_history}

【お願い事項】
当院閉院に伴い、今後の高血圧症の管理・治療を何卒よろしくお願い申し上げます。
なお、服薬手帳を患者様にお渡ししております。

令和　　年　　月　　日

田村内科クリニック
医師　田村 健一`

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    })

    const letter = message.content[0].text.trim()
    return Response.json({ letter })

  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
