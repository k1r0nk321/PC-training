export const maxDuration = 60

import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req) {
  try {
    const { diseaseId, diseaseName, userId } = await req.json()
    const supabase = getAdminClient()

    const { data: medications } = await supabase
      .from('medications')
      .select('drug_category, drug_name_generic, first_line')
      .eq('disease_id', diseaseId)
      .eq('first_line', true)
      .limit(3)

    const medText = medications
      ? medications.map(function(m) { return m.drug_name_generic }).join('・')
      : ''

    const ageGroups = ['35から45', '46から55', '56から65', '66から75', '76から80']
const randomAge = ageGroups[Math.floor(Math.random() * ageGroups.length)]
const chiefComplaints = [
  '健診で血圧が高いと言われた',
  '会社の健康診断で高血圧を指摘されてきた',
  '家族に血圧が高いと言われて心配になってきた',
  '自分で血圧を測ったら高かったので受診した',
  '脳ドックで動脈硬化を指摘されて血圧の管理をしたい',
  '親が脳卒中になったので自分の血圧が心配になってきた',
  '以前から血圧が高いと言われていたが放置していた。そろそろ診てもらいたい',
  'めまいがして血圧を測ったら高かったので受診した',
  '職場の産業医から血圧が高いと指摘された',
  '健康診断の再検査で受診した',
]
const randomComplaint = chiefComplaints[Math.floor(Math.random() * chiefComplaints.length)]

    const ageNum = parseInt(randomAge.split('から')[0])
const ageContext = ageNum >= 75
  ? '高齢者（75歳以上）。フレイル・認知機能低下・ADL低下のリスクあり。家族や介護者のサポートが重要。独居の場合は特に注意。服薬管理が難しい場合がある。'
  : ageNum >= 65
  ? '前期高齢者（65〜74歳）。身体機能は比較的保たれているが、社会的孤立・活動量低下に注意。退職後の生活リズムの変化がある場合も。'
  : ageNum >= 55
  ? '壮年期（55〜64歳）。定年前後で生活リズムが変化しやすい。仕事のストレスや運動不足が問題になりやすい。'
  : '若年〜中年（35〜54歳）。仕事・育児で多忙なことが多い。生活習慣改善への時間的制約がある。自己管理能力は比較的高い。'

    // 年齢層別の体重・BMI設定
const bmiProfile = ageNum >= 75
  ? { heightRange: [148, 168], weightRange: [42, 62], bmiNote: 'やせ〜普通体型が多い。BMI18〜23程度。低栄養・サルコペニアに注意。' }
  : ageNum >= 65
  ? { heightRange: [150, 170], weightRange: [48, 72], bmiNote: 'BMI20〜25程度。肥満は少なめ。' }
  : ageNum >= 55
  ? { heightRange: [153, 175], weightRange: [52, 82], bmiNote: 'BMI21〜27程度。中等度肥満まで。' }
  : { heightRange: [155, 178], weightRange: [50, 88], bmiNote: 'BMI19〜30程度。肥満合併例も多い。' }
    
    const prompt = `プライマリケア研修医向け外来シミュレーションの${diseaseName}初診患者の症例をJSONで生成。JSON以外不要。
毎回異なる患者背景・年齢・性別・職業・主訴・生活歴を生成すること。

{
  "patient": {
    "name": "架空の日本人名",
    "age": ${randomAge}の間でランダムな整数（必ずこの範囲内にすること）,
    "gender": "男性"または"女性"をランダムに選択,
    "occupation": "会社員・自営業・主婦・農業・教師・医療職・無職・パート・管理職など多様な職業からランダムに選択",
    "chief_complaint": "${randomComplaint}（この主訴を必ず使うこと）",
    "history": "現病歴（2〜3文。発症時期・経緯・症状の特徴を多様に）",
    "past_history": "既往歴（なし・糖尿病・脂質異常症・痛風・喘息など多様に）",
    "family_history": "家族歴（高血圧・脳卒中・心筋梗塞・糖尿病など多様に）",
    "social_history": "生活歴（飲酒習慣・喫煙歴・運動習慣・食事習慣・外食頻度・夜食習慣を具体的に記載）",
"vitals": {
      "bp": "${ageNum >= 75 ? '140〜190/70〜100の範囲（脈圧が広い収縮期高血圧が多い）' : '140〜180/85〜110の範囲'}でランダムな血圧（例：158/96 mmHg）",
      "hr": "脈拍（55〜88 bpmの範囲でランダム）",
      "temp": "体温（36.2〜36.8℃の範囲でランダム）",
      "spo2": "SpO2（96〜99%の範囲でランダム）",
      "height": "身長（${bmiProfile.heightRange[0]}〜${bmiProfile.heightRange[1]}の範囲でランダム、数値のみ）",
      "weight": "体重（${bmiProfile.weightRange[0]}〜${bmiProfile.weightRange[1]}の範囲でランダム、数値のみ。${bmiProfile.bmiNote}）",
      "bmi": "BMI（小数点1桁、身長と体重から正確に計算すること）"
    },
"hidden_params": {
      "adherence_level": "high・medium・lowからランダムに選択",
      "lifestyle_motivation": "high・medium・lowからランダムに選択",
      "social_background": "独居・家族同居・その他からランダムに選択",
      "stress_level": "high・medium・lowからランダムに選択",
      "work_busyness": "high・medium・lowからランダムに選択（高齢者は基本low）",
      "personality_type": "cooperative・anxious・resistant・lazy・angryからランダムに選択",
      "eating_habit": "home_cooking・eating_out・night_eating・irregularからランダムに選択",
      "medication_attitude": "positive・neutral・negative・very_negativeからランダムに選択",
      "age_group_context": "${ageContext}",
      "frailty_risk": "${ageNum >= 75 ? 'high・medium・lowからランダムに選択' : 'low'}",
      "cognitive_level": "${ageNum >= 75 ? 'normal・mild_decline・moderate_declineからランダムに選択' : 'normal'}",
      "adl_level": "${ageNum >= 70 ? 'independent・partially_dependent・dependentからランダムに選択' : 'independent'}",
      "social_isolation_risk": "${ageNum >= 65 ? 'high・medium・lowからランダムに選択' : 'low'}",
      "needs_social_support": "${ageNum >= 75 ? 'true' : ageNum >= 65 ? 'ランダムにtrueまたはfalse' : 'false'}"
    }
  },
  "scenario": {
    "difficulty": 1または2または3,
    "key_points": ["学習ポイント1", "学習ポイント2", "学習ポイント3"],
    "expected_diagnosis": "${diseaseName}",
    "expected_medications": ["${medText}"],
    "expected_lifestyle_guidance": ["推奨される生活指導1", "推奨される生活指導2"]
  }
}`

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    })

    const responseText = message.content[0].text
    const cleanText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const caseData = JSON.parse(cleanText)

    const { data: newCase, error } = await supabase
      .from('cases')
      .insert({
        user_id: userId,
        disease_id: diseaseId,
        disease_name: diseaseName,
        patient_data: caseData.patient,
        scenario_data: caseData.scenario,
        current_visit: 1,
        status: 'in_progress',
      })
      .select('id')
      .single()

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ caseId: newCase.id })

  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
