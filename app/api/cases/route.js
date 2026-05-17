export const maxDuration = 60

import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { claudeCreate } from '../../lib/claude-client'

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

    // デモ制限: 匿名ユーザーはランダム生成 不可
    try {
      const { data: { user: u } } = await supabase.auth.admin.getUserById(userId)
      if (u && u.is_anonymous) {
        return Response.json({
          error: 'demo_no_random',
          message: 'デモモードではランダム生成は利用できません。',
          isDemoLimit: true,
        }, { status: 403 })
      }
    } catch (e) {}

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

// 疾患別の設定（主訴・バイタル範囲・検査値ヒント）
const DISEASE_CONFIGS = {
  '高血圧症': {
    chiefComplaints: [
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
    ],
    bpHint: '140〜180/85〜110の範囲（高血圧症なので必ず収縮期140以上）',
    labsHint: 'HbA1c は 5.4-6.4%、空腹時血糖 80-110 mg/dL、LDL 100-160 mg/dL、HDL 40-65 mg/dL、TG 80-180 mg/dL、Cr 0.6-1.2、eGFR 50-90、Na 138-145、K 3.8-4.8、UA 4.0-7.5。',
    pastHistoryHint: 'なし・脂質異常症・糖尿病・痛風・喘息など多様に',
  },
  '2型糖尿病': {
    chiefComplaints: [
      '健診で血糖値が高いと言われた',
      '会社の健康診断で糖尿病を指摘されてきた',
      '口渇と多尿で受診した',
      'HbA1c が高いと指摘された',
      '親が糖尿病で自分も心配になってきた',
      '視力低下で眼科に行ったら血糖値を調べるよう言われた',
      '体重が増えてきて血糖値も気になってきた',
      '健康診断の再検査で受診した',
      '尿の泡立ちが気になってきた',
      '足のしびれが気になって受診した',
      '空腹時血糖が高いと言われた',
      '糖負荷試験で異常を指摘された',
    ],
    bpHint: '110〜150/65〜95の範囲（糖尿病単独例は正常BP多い、合併で軽度高値もあり）',
    labsHint: 'HbA1c は必ず 6.5%以上 7.0-10.0% の範囲。空腹時血糖は必ず 126 mg/dL 以上 130-250 の範囲。LDL 100-180 mg/dL、HDL 35-55 mg/dL、TG 120-300 mg/dL、Cr 0.6-1.2、eGFR 45-95、UA 4.5-8.0、AST 18-40、ALT 18-50（脂肪肝合併多い）、尿Alb 0-50 mg/g・Cr。',
    pastHistoryHint: 'なし・脂質異常症・高血圧・脂肪肝・糖尿病家族歴など',
    bmiNote: '糖尿病はBMI25-32の肥満合併例が多いが、高齢ではやせ型もあり',
  },
  '脂質異常症': {
    chiefComplaints: [
      '健診でコレステロールが高いと言われた',
      'LDL コレステロールが高いと指摘された',
      '中性脂肪が高いと言われた',
      '家族に高脂血症がいて自分も心配になってきた',
      '脳ドックで動脈硬化を指摘されて受診した',
      '健康診断の再検査で受診した',
      '体重が増えてコレステロールも気になってきた',
      '親が心筋梗塞になったので自分も心配',
      '頸動脈エコーで動脈硬化を指摘された',
    ],
    bpHint: '110〜145/70〜95の範囲（脂質異常症単独例は正常BP多い、合併で軽度高値）',
    labsHint: 'LDL は必ず 140 mg/dL 以上、160-220 の範囲（脂質異常症の主病態）。HDL 30-55 mg/dL（低めも多い）、TG 150-400 mg/dL、TC 220-300、non-HDL-C 170-250、HbA1c 5.4-6.5%、空腹時血糖 85-125、AST/ALT 15-45、CK 50-150。',
    pastHistoryHint: 'なし・高血圧・糖尿病・脂肪肝・甲状腺機能低下症など',
  },
  '高尿酸血症・痛風': {
    chiefComplaints: [
      '健診で尿酸値が高いと言われた',
      '会社の健康診断で尿酸値の異常を指摘されてきた',
      '以前痛風発作を起こしたので尿酸値の管理をしたい',
      '父が痛風で自分も尿酸値が心配になってきた',
      'ビールが好きで尿酸値が高いと言われた',
      '健康診断の再検査で受診した',
      '足の親指の付け根が痛くなったことがあり相談したい',
      '半年前に痛風発作があり再発予防したい',
      '尿酸値が9を超えていて医師に相談したい',
      '人間ドックで尿酸高値と腎機能低下を指摘された',
    ],
    bpHint: '110〜150/65〜95の範囲（高尿酸血症単独例は正常BP多い、HTN合併で軽度高値）',
    labsHint: 'UA は必ず 7.0 mg/dL 以上、7.5-10.5 の範囲（高尿酸血症の主病態）。Cr 0.7-1.6、eGFR 40-95、HbA1c 5.4-7.2、空腹時血糖 85-135、LDL 100-180、HDL 32-55、TG 120-300、AST 18-50、ALT 18-65（脂肪肝合併多い）、尿pH 5.0-6.5。',
    pastHistoryHint: 'なし・痛風発作・高血圧・糖尿病・脂質異常症・脂肪肝・腎機能低下・尿路結石など',
    bmiNote: '高尿酸血症は男性に多くBMI 25-30の肥満合併例が多い、高齢者ではやせ型もあり',
  },
}
const diseaseConfig = DISEASE_CONFIGS[diseaseName] || DISEASE_CONFIGS['高血圧症']
const chiefComplaints = diseaseConfig.chiefComplaints
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
    "past_history": "既往歴（${diseaseConfig.pastHistoryHint}）",
    "family_history": "家族歴（高血圧・脳卒中・心筋梗塞・糖尿病など多様に）",
    "social_history": "生活歴（飲酒習慣・喫煙歴・運動習慣・食事習慣・外食頻度・夜食習慣を具体的に記載）",
"vitals": {
      "bp": "${ageNum >= 75 && diseaseName === '高血圧症' ? '140〜190/70〜100の範囲（脈圧が広い収縮期高血圧）' : diseaseConfig.bpHint}でランダムな血圧（例：158/96 mmHg）",
      "hr": "脈拍（55〜88 bpmの範囲でランダム）",
      "temp": "体温（36.2〜36.8℃の範囲でランダム）",
      "spo2": "SpO2（96〜99%の範囲でランダム）",
      "height": "身長（${bmiProfile.heightRange[0]}〜${bmiProfile.heightRange[1]}の範囲でランダム、数値のみ）",
      "weight": "体重（${bmiProfile.weightRange[0]}〜${bmiProfile.weightRange[1]}の範囲でランダム、数値のみ。${bmiProfile.bmiNote}）",
      "bmi": "BMI（小数点1桁、身長と体重から正確に計算すること）"
    },
    "labs": "上記の labs_hint_for_visit1 の範囲に従って疾患のテーマに沿った検査値を生成（例: {hba1c: 7.8, glucose: 165, ldl: 135, hdl: 42, tg: 180, cr: 0.9, bun: 14, egfr: 78, ua: 6.2, ast: 24, alt: 28, urine_alb: 15}）。数値のみ、文字列ではない",
"hidden_params": {
      "adherence_level": "high・medium・lowからランダムに選択",
      "lifestyle_motivation": "high・medium・lowからランダムに選択",
      "social_background": "独居・家族同居・その他からランダムに選択",
      "stress_level": "high・medium・lowからランダムに選択",
      "work_busyness": "high・medium・lowからランダムに選択（高齢者は基本low）",
      "personality_type": "cooperative・anxious・resistant・lazy・angryからランダムに選択",
      "eating_habit": "home_cooking・eating_out・night_eating・irregularからランダムに選択",
      "medication_attitude": "positive・neutral・negative・very_negativeからランダムに選択",
      "exercise_habit_label": "ほとんど運動しない・1回30分歩行・1回1時間歩行・ジムで筋トレ・水泳・ヨガ・ジョギングなどからランダムに選択",
      "exercise_habit_comment": "頻度（例：週0回、週2回、毎日、月数回など）",
      "age_group_context": "${ageContext}",
      "frailty_risk": "${ageNum >= 75 ? 'high・medium・lowからランダムに選択' : 'low'}",
      "cognitive_level": "${ageNum >= 75 ? 'normal・mild_decline・moderate_declineからランダムに選択' : 'normal'}",
      "adl_level": "${ageNum >= 70 ? 'independent・partially_dependent・dependentからランダムに選択' : 'independent'}",
      "social_isolation_risk": "${ageNum >= 65 ? 'high・medium・lowからランダムに選択' : 'low'}",
      "needs_social_support": "${ageNum >= 75 ? 'true' : ageNum >= 65 ? 'ランダムにtrueまたはfalse' : 'false'}"
    }
  },
  "labs_hint_for_visit1": "${diseaseConfig.labsHint}（この範囲で patient.labs を生成すること。疾患のテーマと整合性を保つ）",
  "scenario": {
    "difficulty": 1または2または3,
    "key_points": ["学習ポイント1", "学習ポイント2", "学習ポイント3"],
    "expected_diagnosis": "${diseaseName}",
    "expected_medications": ["${medText}"],
    "expected_lifestyle_guidance": ["推奨される生活指導1", "推奨される生活指導2"]
  }
}`

    const message = await claudeCreate({
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

    // Phase F+: 他の中断中症例（未完遂）を全て削除
    try {
      await supabase
        .from('cases')
        .delete()
        .eq('user_id', userId)
        .is('completed_at', null)
        .neq('id', newCase.id)
    } catch (e) {}

    return Response.json({ caseId: newCase.id })

  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
