export const maxDuration = 60

import { createClient } from '@supabase/supabase-js'
import { claudeCreate } from '../../lib/claude-client'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

export async function POST(request) {
  try {
    const body = await request.json()
    const {
      diseaseName,
      diseaseId,
      visitNumber,
      patientData,
      selectedMeds,
      allMeds,
      selectedEducation,
      rejectedEducation,
      consultations,
      userPosition
    } = body

    const supabase = getAdminClient()

    // guideline_rulesを取得
    let guidelineRules = []
    if (diseaseId) {
      const { data } = await supabase
        .from('guideline_rules')
        .select('*')
        .eq('disease_id', diseaseId)
        .eq('is_active', true)
        .order('sort_order')
      if (data) guidelineRules = data
    }

    // ガイドラインをカテゴリ別に整理
    const rulesByType = {}
    guidelineRules.forEach(r => {
      if (!rulesByType[r.rule_type]) rulesByType[r.rule_type] = []
      rulesByType[r.rule_type].push(r)
    })

    const formatRules = (rules) => rules.map(r =>
      '【' + (r.condition || '全般') + '】' + r.content +
      '（エビデンスレベル' + (r.evidence_level || '不明') + '、出典:' + (r.source || '不明') + '）'
    ).join('\n')

    const guidelineText = [
      rulesByType.first_line?.length ? '■第一選択薬\n' + formatRules(rulesByType.first_line) : '',
      rulesByType.stepup?.length ? '■ステップアップ\n' + formatRules(rulesByType.stepup) : '',
      rulesByType.contraindication?.length ? '■禁忌\n' + formatRules(rulesByType.contraindication) : '',
      rulesByType.caution?.length ? '■注意\n' + formatRules(rulesByType.caution) : '',
      rulesByType.referral?.length ? '■紹介基準\n' + formatRules(rulesByType.referral) : '',
      rulesByType.lifestyle?.length ? '■生活指導\n' + formatRules(rulesByType.lifestyle) : '',
      rulesByType.monitoring?.length ? '■モニタリング\n' + formatRules(rulesByType.monitoring) : '',
    ].filter(Boolean).join('\n\n')

    // 患者データのサマリ
    const labs = patientData?.labs || {}
    const vitals = patientData?.vitals || {}
    const labText = Object.entries(labs)
      .filter(([k, v]) => v !== null && v !== undefined)
      .map(([k, v]) => k + ': ' + v).join('、')

    // 選択済み薬剤
    const selectedMedNames = (selectedMeds || [])
      .map(m => m.drug_name_generic + '(' + m.drug_name_brand + ')').join('、') || 'なし'

    // 未選択の推奨薬剤
    const notSelectedMeds = (allMeds || [])
      .filter(m => m.first_line && !(selectedMeds || []).some(s => s.id === m.id))
      .map(m => m.drug_name_generic).join('、') || 'なし'

    // 生活指導
    const selectedEduNames = (selectedEducation || [])
      .map(e => e.label || e.instruction_key).join('、') || 'なし'
    const rejectedEduNames = (rejectedEducation || [])
      .map(e => e.label || e.instruction_key).join('、') || 'なし'

    // コンサルト
    const consultText = (consultations || [])
      .map(c => c.specialty + '(' + (c.reason || '') + ')').join('、') || 'なし'

    const isNonPhysician = ['医学生', '医療従事者', 'その他', '学習者'].includes(userPosition)
    const roleLabel = isNonPhysician ? '学習者' : '研修医'

    const systemPrompt = 'あなたは経験豊富な総合診療専門医（指導医）です。' +
      roleLabel + 'が治療方針を選択している場面で、的確で教育的なアドバイスを行います。\n\n' +
      '以下の原則を守ってください：\n' +
      '1. 禁忌に該当する選択は🚨で最優先に指摘する\n' +
      '2. 適切な選択は✅で具体的に評価する\n' +
      '3. 優先度の高い未実施項目は⚠️で1〜2個だけ提示する（全て指摘しない）\n' +
      '4. 生活指導は一度に全て求めず、患者が同意済みの項目を評価した上で次の1〜2項目を提案する\n' +
      '5. 拒否された生活指導はℹ️で「次のVisitへの課題」として提示する\n' +
      '6. 回答は日本語で、簡潔に（全体で400字以内）\n' +
      '7. 出力は必ず「🚨 緊急確認」「✅ 適切な選択」「⚠️ 次の一手」「ℹ️ 長期的な視点」の4ブロック構造で'

    const userMessage = '【疾患】' + diseaseName + '（Visit ' + visitNumber + '）\n\n' +
      '【患者検査値】' + labText + '\n' +
      '【バイタル】血圧:' + (vitals.bp || '不明') + '\n\n' +
      '【現在の選択状態】\n' +
      '処方薬：' + selectedMedNames + '\n' +
      '未選択の第一選択薬：' + notSelectedMeds + '\n' +
      '生活指導（同意済み）：' + selectedEduNames + '\n' +
      '生活指導（拒否）：' + rejectedEduNames + '\n' +
      'コンサルト：' + consultText + '\n\n' +
      '【参照ガイドライン】\n' +
      (guidelineText || 'ガイドライン情報なし') + '\n\n' +
      '上記の選択状態を評価し、4ブロック構造でアドバイスをください。'

    const response = await claudeCreate({
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      messages: [
        { role: 'user', content: userMessage }
      ],
      system: systemPrompt
    })

    const advice = response?.content?.[0]?.text || 'アドバイスを生成できませんでした。'
    return Response.json({ advice })

  } catch (error) {
    console.error('treatment-advice error:', error)
    return Response.json({ error: 'アドバイスの生成に失敗しました', detail: error.message }, { status: 500 })
  }
}
