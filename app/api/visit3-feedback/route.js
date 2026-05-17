export const maxDuration = 60

import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { claudeCreate } from '../../lib/claude-client'
import { buildConsultationEvaluationBlock, normalizeConsultations } from '../../lib/consultation-evaluator'
// 喫煙・飲酒介入の判定ヘルパー
const SMOKING_STRONG = ['smoke_5A', 'smoke_motivational', 'smoke_quit_date', 'smoke_clinic_referral']
const SMOKING_MODERATE = ['smoke_brief', 'smoke_nicotine_assess', 'smoke_relapse_prep']
const DRINKING_STRONG = ['drink_target_reduction', 'drink_abstinence', 'drink_specialty_referral']
const DRINKING_MODERATE = ['drink_amount_education', 'drink_audit', 'drink_rest_days']

function computeIntervention(category, selectedEducation, selectedSubOptions, reactionLog, strongList, moderateList) {
  const edu = (selectedEducation || []).find(function(e) { return e && e.category === category })
  if (!edu) return { given: false, strength: 'none', accepted: false, sub_options: [] }

  const subIds = (selectedSubOptions || {})[edu.id] || []
  // object {subId: true} 形式と array 形式の両方に対応
  const subIdArray = Array.isArray(subIds)
    ? subIds
    : (typeof subIds === 'object' ? Object.keys(subIds).filter(function(k) { return subIds[k] }) : [])
  const hasStrong = subIdArray.some(function(s) { return strongList.indexOf(s) >= 0 })
  const hasModerate = subIdArray.some(function(s) { return moderateList.indexOf(s) >= 0 })
  const strength = hasStrong ? 'strong' : (hasModerate ? 'moderate' : 'weak')

  // edu_ または sub_<edu.id>_ で始まる reaction を抽出
  const eduReactions = (reactionLog || []).filter(function(r) {
    return r && r.id && (r.id === 'edu_' + edu.id || (typeof r.id === 'string' && r.id.indexOf('sub_' + edu.id) === 0))
  })
  const accepted = eduReactions.some(function(r) {
    const al = r.reaction && r.reaction.acceptance_level
    return al === 'accepted' || al === 'partial'
  })

  return { given: true, strength: strength, accepted: accepted, sub_options: subIdArray }
}


function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req) {
  try {
    const body = await req.json()
    const {
      caseId,
      scenarioData,
      selectedMedications,
      selectedEducation,
      selectedSubOptions,
      selectedDevices,
      reactionLog,
      interviewMessages,
      visit3Vitals,
      consultation,
      consultations,
      discontinuedExistingMeds,
      additionalLabs,
      additionalImaging,
      labsRevealed,
    } = body

    if (!caseId) {
      return Response.json({ error: 'caseId required' }, { status: 400 })
    }

    const supabase = getAdminClient()
    const { data: caseData, error } = await supabase
      .from('cases').select('*').eq('id', caseId).single()
    if (error || !caseData) {
      return Response.json({ error: 'Case not found' }, { status: 404 })
    }

    const patient = caseData.patient_data
    const v1 = caseData.visit1_data || {}
    const v2 = caseData.visit2_data || {}

    // ===== Helper: format Visit summary for prompt =====
    function formatVisitMeds(meds) {
      if (!meds || meds.length === 0) return 'なし'
      return meds.map(function(m) { return m.drug_name_generic + '（' + (m.typical_dose || '') + '）' }).join('、')
    }
    function formatVisitEdu(edu) {
      if (!edu || edu.length === 0) return 'なし'
      return edu.map(function(e) { return e.instruction_key }).join('、')
    }
    // selectedSubOptions オブジェクト形式 { eduId: { subId: true } } を sub_option 配列に変換するヘルパー
    function flattenSubOptions(raw, eduList) {
      const arr = []
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        Object.entries(raw).forEach(function(entry) {
          const edu = (eduList || []).find(function(e) { return e && e.id === entry[0] })
          if (!edu || !Array.isArray(edu.sub_options)) return
          Object.entries(entry[1] || {}).forEach(function(se) {
            if (se[1]) {
              const sub = edu.sub_options.find(function(s) { return s.id === se[0] })
              if (sub) arr.push(sub)
            }
          })
        })
      } else if (Array.isArray(raw)) {
        raw.forEach(function(s) { if (s && typeof s === 'object') arr.push(s) })
      }
      return arr
    }
    function formatVisitSubs(subs, eduList) {
      // subs が object (新形式) なら eduList を使って展開、array (旧形式) ならそのまま
      const arr = Array.isArray(subs) ? subs : flattenSubOptions(subs, eduList)
      if (!arr || arr.length === 0) return 'なし'
      return arr.map(function(s) { return s.label || s.id }).join('、')
    }
    function formatMessagesShort(messages, maxLen) {
      if (!messages || messages.length === 0) return '（記録なし）'
      const filtered = messages.filter(function(m) { return m.role !== 'system' })
      const lines = filtered.map(function(m) {
        const who = m.role === 'user' ? '医師' : '患者'
        return who + ': ' + m.content
      })
      const text = lines.join('\n')
      if (maxLen && text.length > maxLen) return text.substring(0, maxLen) + '...（省略）'
      return text
    }
    function summarizeReactions(log) {
      if (!log || log.length === 0) return '（反応記録なし）'
      const accepted = log.filter(function(r) { return r.reaction && r.reaction.acceptance_level === 'accepted' }).length
      const partial = log.filter(function(r) { return r.reaction && r.reaction.acceptance_level === 'partial' }).length
      const rejected = log.filter(function(r) { return r.reaction && r.reaction.acceptance_level === 'rejected' }).length
      const negotiating = log.filter(function(r) { return r.reaction && r.reaction.acceptance_level === 'negotiating' }).length
      const fromAgreement = log.filter(function(r) { return r.fromInterviewAgreement === true }).length
      const agreementNote = fromAgreement > 0 ? '（うち問診合意で確定 ' + fromAgreement + ' 件）' : ''
      return '同意 ' + accepted + ' 件・一部同意 ' + partial + ' 件・拒否 ' + rejected + ' 件・交渉中 ' + negotiating + ' 件' + agreementNote
    }

    const v1Vitals = patient.vitals
    const v2Vitals = v2.vitals || {}

    // ===== Build comprehensive evaluation prompt =====
    const prompt = `あなたは医学教育における外来診療シミュレーションの指導医です。
以下の症例について、研修医の3回の外来診察（Visit 1〜3、合計8週間）をすべて踏まえて、最終総合評価（100点満点）を行ってください。

【症例情報】
疾患：${caseData.disease_name}
患者：${patient.name}（${patient.age}歳・${patient.gender}）
主訴：${patient.chief_complaint}
初診時バイタル：${caseData.disease_name === '高血圧症' ? '血圧 ' + v1Vitals.bp + '、' : ''}体重 ${v1Vitals.weight}${String(v1Vitals.weight || '').match(/kg/) ? '' : 'kg'}、BMI ${v1Vitals.bmi}

【評価における重要原則】
- 問診の段階で患者から生活指導の合意を引き出し、その合意に基づいて治療方針を確定した項目（reaction に fromInterviewAgreement=true）は「患者中心アプローチ」として高く評価する。
- 仮にガイドライン基準では控えめな介入であっても、患者の自発的な変化意欲を引き出した上での初期合意としては「適切」と判定する。
- 段階的強化を次の Visit で行う方針が妥当な臨床判断。

================================================================
【Visit 1（初診）の経過】
問診（医師-患者対話）:
${formatMessagesShort(v1.interviewMessages, 1500)}

選択した治療：
- 投薬：${formatVisitMeds(v1.selectedMedications)}
- 患者教育：${formatVisitEdu(v1.selectedEducation)}
- 詳細指導：${formatVisitSubs(v1.selectedSubOptions, v1.selectedEducation)}
- 医療機器：${formatVisitEdu(v1.selectedDevices)}

患者の反応：${summarizeReactions(v1.reactionLog)}

================================================================
【Visit 2（4週後）の経過】
問診（医師-患者対話）:
${formatMessagesShort(v2.interviewMessages, 1500)}

選択した治療：
- 投薬：${formatVisitMeds(v2.selectedMedications)}
- 患者教育：${formatVisitEdu(v2.selectedEducation)}
- 詳細指導：${formatVisitSubs(v2.selectedSubOptions, v2.selectedEducation)}
- 医療機器：${formatVisitEdu(v2.selectedDevices)}

患者の反応：${summarizeReactions(v2.reactionLog)}

Visit 2 のバイタル変化：
${caseData.disease_name === '高血圧症' ? '- 血圧：' + v1Vitals.bp + ' → ' + (v2Vitals.bp || '(記録なし)') + '\n' : ''}- 体重：${v1Vitals.weight}${String(v1Vitals.weight || '').match(/kg/) ? '' : 'kg'} → ${v2Vitals.weight || '(記録なし)'}${String(v2Vitals.weight || '').match(/kg/) ? '' : (v2Vitals.weight ? 'kg' : '')}

================================================================
【Visit 3（8週後）の経過】※今回確定された治療
問診（医師-患者対話）:
${formatMessagesShort(interviewMessages, 1500)}

選択した治療：
- 投薬：${formatVisitMeds(selectedMedications)}
- 患者教育：${formatVisitEdu(selectedEducation)}
- 詳細指導：${formatVisitSubs(selectedSubOptions, selectedEducation)}
- 医療機器：${formatVisitEdu(selectedDevices)}

患者の反応：${summarizeReactions(reactionLog)}

Visit 3 のバイタル変化：
${caseData.disease_name === '高血圧症' ? '- 血圧：' + (v2Vitals.bp || v1Vitals.bp) + ' → ' + (visit3Vitals?.bp || '(記録なし)') + '\n' : ''}- 体重：${v2Vitals.weight || v1Vitals.weight}${String(v2Vitals.weight || v1Vitals.weight || '').match(/kg/) ? '' : 'kg'} → ${visit3Vitals?.weight || '(記録なし)'}${String(visit3Vitals?.weight || '').match(/kg/) ? '' : (visit3Vitals?.weight ? 'kg' : '')}

================================================================
【専門医コンサルトの推奨】
${(() => {
  const rec = (scenarioData || caseData.scenario_data)?.consultation_recommendation
  if (!rec) return '本症例ではコンサルト推奨情報なし（一般症例）'
  const necJa = rec.necessity === 'required' ? '必須' : rec.necessity === 'recommended' ? '推奨' : '不要'
  return '- 推奨レベル：' + necJa + '\n- 推奨科：' + (rec.recommended_specialty || 'なし') + '\n- 推奨理由：' + (rec.reason || 'なし')
})()}

【研修医のコンサルト判断（各 Visit）】
${(() => {
  const v1List = normalizeConsultations(v1.consultations || v1.consultation)
  const v2List = normalizeConsultations(v2.consultations || v2.consultation)
  const v3List = normalizeConsultations(consultations || consultation)
  const fmt = function(vn, list) {
    if (!list || list.length === 0) return '- Visit ' + vn + '：紹介なし'
    return list.map(function(c, i) { return '- Visit ' + vn + '-' + (i+1) + '：' + (c.specialty || '未選択') + '（理由：' + (c.reason || '未記入') + '）' }).join('\n')
  }
  return [fmt(1, v1List), fmt(2, v2List), fmt(3, v3List)].join('\n')
})()}

${(() => {
  const items = []
  normalizeConsultations(v1.consultations || v1.consultation).forEach(function(c) {
    items.push({ visit: 1, consultation: { performed: true, specialty: c.specialty, reason: c.reason } })
  })
  normalizeConsultations(v2.consultations || v2.consultation).forEach(function(c) {
    items.push({ visit: 2, consultation: { performed: true, specialty: c.specialty, reason: c.reason } })
  })
  normalizeConsultations(consultations || consultation).forEach(function(c) {
    items.push({ visit: 3, consultation: { performed: true, specialty: c.specialty, reason: c.reason } })
  })
  return buildConsultationEvaluationBlock(caseData.disease_name, patient, items)
})()}

【既存薬の継続/中止判断（Visit 3 確定）】
${(() => {
  const existingMeds = (patient.current_medications || [])
  if (existingMeds.length === 0) return '来院前服用薬なし'
  const discontinued = discontinuedExistingMeds || []
  return existingMeds.map((m, idx) => {
    const key = (m.name || '') + '_' + idx
    const status = discontinued.includes(key) ? '中止' : '継続'
    return '- ' + m.name + (m.dose ? '（' + m.dose + '）' : '') + '：' + status
  }).join('\n')
})()}

================================================================
【評価基準】
各 Visit で以下の4軸を評価してください。各 Visit は約 33 点満点（合計 100 点）。

評価軸（各 Visit 共通）：
1. **問診（情報収集）**：適切な質問・症状確認・既往/家族歴/生活歴の聴取ができたか（約8点）
2. **治療選択（薬剤・指導の妥当性）**：診断・ガイドラインに沿った治療か、患者背景を踏まえた選択か（約9点）
3. **患者対応（コミュニケーション）**：患者の反応に対する説明・説得・共感、拒否時の対応（約8点）
4. **アウトカム（治療効果・改善度）**：
    - Visit 1：治療プランの妥当性が将来の改善に繋がる設計か
    - Visit 2：Visit 1→2 の疾患関連指標（${caseData.disease_name === '高血圧症' ? '血圧' : caseData.disease_name === '2型糖尿病' ? 'HbA1c・体重' : caseData.disease_name === '脂質異常症' ? 'LDL-C・体重' : '体重'}）の改善度
    - Visit 3：Visit 2→3 の改善度、目標達成度（${caseData.disease_name === '高血圧症' ? '血圧 < 140/90' : caseData.disease_name === '2型糖尿病' ? 'HbA1c < 7.0%' : caseData.disease_name === '脂質異常症' ? 'LDL-C 目標値達成' : '体重 -3%以上'} 等）（約8点）

【追加評価ポイント：専門医コンサルト】
- **上記の【コンサルト適切性判定（ルールベース）】を最優先で尊重してください**
- 【適切：定型連携】【適切：条件該当】【適切：生活指導専門資源】 → 絶対に減点しない（プラス評価）
- 【過剰：条件非該当】 → 軽度減点（不要な専門医依頼）、教育コメントでPC医で完結すべき旨を指摘
- 未実施の推奨連携（特に DM での眼科・皮膚科） → 減点はしないが、教育コメントで必ず言及（「年1回の網膜症スクリーニング依頼が望ましかった」等）
- シナリオ独自の consultation_recommendation（必須/推奨）でコンサルトなし → ルールと矛盾しない範囲で減点
- **重要**：適切な治療が選択されていれば、コンサルトの有無で治療の質評価は左右されない。「コンサルトなしでも良い治療」は減点しない

【追加評価ポイント：既存薬の継続/中止判断】
- 不適切な中止（医学的理由なく中止）→ 安全性問題として治療選択点を減点
- 適切な継続/中止判断 → プラス評価
- 例：痛風頓服薬コルヒチンの中止は不要、骨粗鬆症薬の中止は骨密度評価が必要

================================================================
【出力形式】※必ずこの順番・形式で出力してください

TOTAL_SCORE: [0〜100の整数]
VISIT_1_SCORE: [0〜33の整数]
VISIT_2_SCORE: [0〜33の整数]
VISIT_3_SCORE: [0〜34の整数]

COMMENT:
（以下、研修医への建設的なフィードバック。具体的な強み・改善点を含めて 400〜700 文字程度。各 Visit ごとの簡潔な振り返りと、最終的な総評を含めること。Markdown は使わずプレーンテキストで。）`

    const message = await claudeCreate({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    })

    const aiResponse = message.content[0].text.trim()

    // ===== Parse AI response =====
    const totalMatch = aiResponse.match(/TOTAL_SCORE:\s*(\d+)/)
    const v1Match = aiResponse.match(/VISIT_1_SCORE:\s*(\d+)/)
    const v2Match = aiResponse.match(/VISIT_2_SCORE:\s*(\d+)/)
    const v3Match = aiResponse.match(/VISIT_3_SCORE:\s*(\d+)/)
    const commentMatch = aiResponse.match(/COMMENT:\s*([\s\S]*)/)

    let totalScore = totalMatch ? parseInt(totalMatch[1]) : null
    const breakdown = {
      v1: v1Match ? parseInt(v1Match[1]) : 0,
      v2: v2Match ? parseInt(v2Match[1]) : 0,
      v3: v3Match ? parseInt(v3Match[1]) : 0,
    }
    // Sanity: if TOTAL not parsed but breakdown is, sum it
    if (totalScore === null && (breakdown.v1 || breakdown.v2 || breakdown.v3)) {
      totalScore = breakdown.v1 + breakdown.v2 + breakdown.v3
    }
    if (totalScore === null) totalScore = 0
    if (totalScore > 100) totalScore = 100
    if (totalScore < 0) totalScore = 0

    const commentText = commentMatch ? commentMatch[1].trim() : aiResponse

    // ===== Phase C-2: 検査値サマリ保持（重量データ破棄前に抽出）=====
    const v3 = caseData.visit3_data || {}
    const labSummary = {
      v1: {
        baseline: (patient && patient.labs) || null,
        labsRevealed: !!(v1 && v1.labsRevealed),
        additional: (v1 && Array.isArray(v1.additionalLabs)) ? v1.additionalLabs : [],
        imaging: (v1 && Array.isArray(v1.additionalImaging)) ? v1.additionalImaging : [],
      },
      v2: {
        baseline: (v2 && v2.visit2Labs) || null,
        vitals: (v2 && v2.visit2Vitals) || null,
        labsRevealed: !!(v2 && v2.labsRevealed),
        additional: (v2 && Array.isArray(v2.additionalLabs)) ? v2.additionalLabs : [],
        imaging: (v2 && Array.isArray(v2.additionalImaging)) ? v2.additionalImaging : [],
      },
      v3: {
        baseline: (v3 && v3.visit3Labs) || null,
        vitals: (v3 && v3.visit3Vitals) || visit3Vitals || null,
        labsRevealed: !!labsRevealed,
        additional: Array.isArray(additionalLabs) ? additionalLabs : [],
        imaging: Array.isArray(additionalImaging) ? additionalImaging : [],
      },
    }
    breakdown.labSummary = labSummary

    // ===== Save to DB and ARCHIVE (Phase F: 軽量化) =====
    // 成績評価で必要な情報だけ残し、重量データはクリア
    const updateData = {
      visit3_feedback: commentText,
      visit3_consultation: (function() {
        const arr = normalizeConsultations(consultations || consultation)
        return arr.length > 0 ? arr : null
      })(),
      final_score: totalScore,
      final_score_breakdown: breakdown,
      completed_at: new Date().toISOString(),
      status: 'completed',
      // 重量データを null にして容量を解放
      visit1_messages: null,
      visit2_messages: null,
      visit3_messages: null,
      visit1_data: null,
      visit2_data: null,
      visit3_data: null,
      visit1_lab_data: null,
      visit2_lab_data: null,
      visit3_lab_data: null,
      visit1_feedback: null,
      visit2_feedback: null,
      saved_state: null,
      record_saved_at: null,
    }

        // 喫煙・飲酒介入を計算して visit_parameters (visit 3) に保存
    const smokingIntervention = computeIntervention('smoking', selectedEducation, selectedSubOptions, reactionLog, SMOKING_STRONG, SMOKING_MODERATE)
    const drinkingIntervention = computeIntervention('drinking', selectedEducation, selectedSubOptions, reactionLog, DRINKING_STRONG, DRINKING_MODERATE)
    try {
      await supabase
        .from('visit_parameters')
        .update({
          smoking_intervention: smokingIntervention,
          drinking_intervention: drinkingIntervention,
        })
        .eq('case_id', caseId)
        .eq('visit_number', 3)
    } catch (e) {
      console.error('Failed to update visit_parameters intervention:', e)
    }

await supabase.from('cases').update(updateData).eq('id', caseId)

    // visit_parameters の関連行も削除（容量節約）
    try {
      await supabase.from('visit_parameters').delete().eq('case_id', caseId)
    } catch (e) {}

    // Phase G: 同じモデル症例の古い完了レコードを削除（最新のみ保持）
    // ランダム生成症例（model_case_id NULL）は対象外
    try {
      const { data: thisCase } = await supabase
        .from('cases')
        .select('user_id, model_case_id')
        .eq('id', caseId)
        .single()
      if (thisCase && thisCase.model_case_id && thisCase.user_id) {
        await supabase
          .from('cases')
          .delete()
          .eq('user_id', thisCase.user_id)
          .eq('model_case_id', thisCase.model_case_id)
          .not('completed_at', 'is', null)
          .neq('id', caseId)
      }
    } catch (e) {}

    return Response.json({
      feedback: commentText,
      score: totalScore,
      breakdown: breakdown,
    })

  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
