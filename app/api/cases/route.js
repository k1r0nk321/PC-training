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

    const prompt = `${diseaseName}の外来初診患者の症例をJSONで生成。JSON以外不要。

{"patient":{"name":"山田太郎","age":58,"gender":"男性","occupation":"会社員","chief_complaint":"頭痛と肩こりが続いている","history":"3ヶ月前から頭痛あり。健診で血圧高いと言われた。","past_history":"特になし","family_history":"父が高血圧","social_history":"飲酒:週3回・喫煙:なし・運動:ほとんどしない","vitals":{"bp":"158/96 mmHg","hr":"78 bpm","temp":"36.5℃","spo2":"98%","height":"168","weight":"72","bmi":"25.5"},"hidden_params":{"adherence_level":"medium","lifestyle_motivation":"low","social_background":"家族同居","stress_level":"medium"}},"scenario":{"difficulty":1,"key_points":["降圧目標の設定","第一選択薬の選択","生活指導の実践"],"expected_diagnosis":"${diseaseName}","expected_medications":["${medText}"],"expected_lifestyle_guidance":["減塩指導","運動指導"]}}`

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
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
