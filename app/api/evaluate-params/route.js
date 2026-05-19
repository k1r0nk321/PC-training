export const maxDuration = 30

import Anthropic from '@anthropic-ai/sdk'
import { claudeCreate } from '../../lib/claude-client'
import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v))
}

function buildPrompt(recentMessages, currentParams, contextType, personality) {
  const isInterview = contextType !== 'treatment'
  const contextLabel = isInterview ? '問診場面' : '治療方針提示後の指導場面'
  const convo = recentMessages.map(function(m) {
    const role = m.role === 'user' ? '医師' : '患者'
    return role + ': ' + m.content
  }).join('\n')

  return `あなたはプライマリケア外来シミュレーションの患者パラメーター評価AIです。\n` +
    `直近の医師-患者の会話を読み、患者の以下のパラメーターをどう変動させるか判定してください。\n\n` +
    `【場面】` + contextLabel + `\n\n` +
    `【患者の性格（参考・固定）】` + (personality || '不明') + `\n\n` +
    `【現在のパラメーター】\n` +
    `- 食生活習慣: ` + (currentParams.eating_habit_label || '') + ' (' + (currentParams.eating_habit_comment || '') + `)\n` +
    `- 運動習慣: ` + (currentParams.exercise_habit_label || '') + ' (' + (currentParams.exercise_habit_comment || '') + `)\n` +
    `- 生活改善意欲★: ` + currentParams.lifestyle_motivation + `/5（★多=良い、増えれば改善）\n` +
    `- 服薬意欲★: ` + currentParams.medication_motivation + `/5（★多=良い、増えれば改善）\n` +
    `- 信頼度★: ` + currentParams.trust_level + `/5（★多=良い、医師への信頼度）\n\n` +
    `【最近の会話】\n` + convo + `\n\n` +
    `【評価ルール - 重要】\n` +
    `A. 患者の発言を強く反映する。\n` +
    `   - 患者「やります」「頑張ります」「運動します」「食事気をつけます」等、生活改善に関する前向きな宣言 → lifestyle_motivation_delta=+1\n` +
    `   - 患者の状態報告で実際の行動が変わったとき → ラベル/コメントを書き換え\n\n` +
    `B. 患者の行動報告でラベル/コメントを実態に書き換える。例：\n` +
    `   - 患者「週2回、30分歩いています」→ exercise_habit_label="1回30分歩行", exercise_habit_comment="週2回"\n` +
    `   - 患者「週末だけ1時間運動してます」→ exercise_habit_label="1回1時間運動", exercise_habit_comment="週末のみ"\n` +
    `   - 患者「自炊するようにしました」→ eating_habit_label="自炊中心", eating_habit_comment="新しい習慣"\n` +
    `   - 患者「外食が多くて」→ eating_habit_label="外食中心", eating_habit_comment=""\n` +
    `   - 患者「タバコ、減らしてみます」→ smoking_label="減量挑戦中", smoking_comment="禁煙準備"\n` +
    `   - 患者「禁煙してみます」→ smoking_label="禁煙挑戦中", smoking_comment="禁煙開始"\n` +
    `   - 患者「お酒、休肝日作ります」→ drinking_label="節酒挑戦中", drinking_comment="休肝日設定"\n` +
    `   - 患者「お酒、減らします」→ drinking_label="節酒挑戦中", drinking_comment="減酒挑戦"\n\n` +
    `C. 信頼度★の評価（医師の発言・態度に基づく）：\n` +
    `   - 医師の共感的な傾聴・患者の気持ちに寄り添う発言・納得のいく説明 → trust_level_delta=+1\n` +
    `   - 医師の批判的・否定的・押付け・無関心・専門用語の押付け → trust_level_delta=-1\n` +
    `   - 中立的な普通の発言 → trust_level_delta=0\n` +
    `   ※ 生活改善意欲・服薬意欲が上昇した場合は、サーバー側で自動的に信頼度に+1されます。\n\n` +
    `D. 関連性のない発言・挨拶・短い相槌のみの場合は変動なし（全てnullまたは0）。\n\n` +
    `E. 変動幅の通常は -1〜+1 の整数。強い表現がある時のみ ±2。\n\n` +
    `F. 重要：lifestyle_motivation は減少しない。患者が後ろ向きでも lifestyle_motivation_delta=0 を返す。\n\n` +
    `G. 【生活指導合意の検出 - 重要】患者が特定の生活指導カテゴリに合意・取り組み意向を示したら lifestyle_agreements に記録する。\n` +
    `   カテゴリ：diet（食事）, exercise（運動）, smoking（禁煙）, drinking（節酒）, weight（減量）, monitoring（自己管理: 家庭血圧/SMBG）\n` +
    `   level の判定：\n` +
    `   - weak: 「考えてみます」「やってみるかも」など曖昧で消極的\n` +
    `   - moderate: 「頑張ります」「減らします」「やります」など明確な意向\n` +
    `   - strong: 「絶対やります」「すぐ始めます」「来週から」など強い決意・具体策\n` +
    `   例：\n` +
    `   - 患者「タバコ、減らしてみます」→ smoking: {agreed: true, level: "moderate", detail: "減量挑戦"}\n` +
    `   - 患者「禁煙してみます」→ smoking: {agreed: true, level: "moderate", detail: "禁煙挑戦"}\n` +
    `   - 患者「お酒、休肝日作ります」→ drinking: {agreed: true, level: "moderate", detail: "休肝日"}\n` +
    `   - 患者「運動、週3回30分歩きます」→ exercise: {agreed: true, level: "strong", detail: "週3回30分歩行"}\n` +
    `   - 患者「食事、塩分減らします」→ diet: {agreed: true, level: "moderate", detail: "減塩"}\n` +
    `   - 患者「血圧、毎日測ります」→ monitoring: {agreed: true, level: "strong", detail: "家庭血圧測定"}\n` +
    `   - 患者「3kg痩せます」→ weight: {agreed: true, level: "moderate", detail: "3kg減量"}\n` +
    `   既に合意済みのカテゴリは上書きしない（level 弱化を避ける）。同じカテゴリで新たな合意があれば、より強い level に更新。\n` +
    `   ★ 同じカテゴリで複数の数値（カロリー・塩分・コレステロール・脂質%・飲酒量）が会話に出てきた場合、必ず「最も厳しい（数値が小さい）制限」を detail に採用すること。\n` +
    `   合意が無い場合は lifestyle_agreements_update を {} とする。\n\n` +
    `G. 【最重要】medication_motivation_delta の特別ルール：\n` +
    `   服薬意欲★は、医師が「服薬のメリット・デメリット・効果・副作用・リスク」を具体的に説明した時のみ変動する。\n` +
    `   - 医師「この薬は〜の効果があります」「副作用として〜が起きることがあります」「薬を飲まないと〜のリスクがあります」→ +1\n` +
    `   - 食事指導・運動指導・生活習慣指導のみ → medication_motivation_delta=0（変動しない）\n` +
    `   - 患者が「薬を飲みます」等と言うだけ → medication_motivation_delta=0\n` +
    `   - 服薬に関する医師の具体的な説明がない場合、必ず medication_motivation_delta=0 を返すこと。\n\n` +
    `H. 重要：ストレス★・忙しさ★は患者本人の精神的・環境的パラメーターであり、問診や治療指導場面では変化しません。これらは別の経路（治療法選択での社会的支援）で変動します。本評価では一切扱わない（フィールド出力なし）。\n\n` +
    `【出力形式】JSONのみ。説明文・前後の文章・コードブロック記号は一切不要。\n` +
    `{\n` +
    `  "eating_habit_label": "新しい定型句、変化なしならnull",\n` +
    `  "eating_habit_comment": "新しいコメント、変化なしならnull",\n` +
    `  "exercise_habit_label": "新しい定型句、変化なしならnull",\n` +
    `  "exercise_habit_comment": "新しいコメント、変化なしならnull",\n` +
    `  "smoking_label": "新しい喫煙ラベル、変化なしならnull",\n` +
    `  "smoking_comment": "新しい喫煙コメント、変化なしならnull",\n` +
    `  "drinking_label": "新しい飲酒ラベル、変化なしならnull",\n` +
    `  "drinking_comment": "新しい飲酒コメント、変化なしならnull",\n` +
    `  "lifestyle_motivation_delta": 整数(0または+1または+2、減少なし),\n` +
    `  "lifestyle_agreements_update": {\n` +
    `    "カテゴリ名": { "agreed": true, "level": "moderate", "detail": "内容" }\n` +
    `  },\n` +
    `  "medication_motivation_delta": 整数(0または+1、医師が服薬の効果・副作用・リスクを説明した時のみ変動。それ以外は必ず0),\n` +
    `  "trust_level_delta": 整数(-2〜+2、医師の態度のみで判定),\n` +
    `  "reasoning": "1〜2文の評価理由"\n` +
    `}`
}

export async function POST(req) {
  try {
    const body = await req.json()
    const { caseId, visitNumber, recentMessages, currentParams, context, personality } = body

    if (!caseId || !visitNumber || !currentParams) {
      return Response.json({ error: 'caseId, visitNumber, currentParams required' }, { status: 400 })
    }

    const prompt = buildPrompt(recentMessages || [], currentParams, context, personality)

    const message = await claudeCreate({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })

    const responseText = message.content[0].text
    const cleanText = responseText.replace(/\`\`\`json\n?/g, '').replace(/\`\`\`\n?/g, '').trim()
    let evaluation
    try {
      evaluation = JSON.parse(cleanText)
    } catch (parseErr) {
      return Response.json({ error: 'parse failed', raw: cleanText }, { status: 500 })
    }

    // Get initial values for caps
    const initialLifestyle = currentParams.initial_lifestyle_motivation != null
      ? currentParams.initial_lifestyle_motivation
      : currentParams.lifestyle_motivation
    const initialMedication = currentParams.initial_medication_motivation != null
      ? currentParams.initial_medication_motivation
      : currentParams.medication_motivation
    const initialTrust = currentParams.initial_trust_level != null
      ? currentParams.initial_trust_level
      : (currentParams.trust_level || 0)

    // Apply lifestyle_motivation: only positive, max +1 from initial, clamp [1,5]
    let lifestyleDelta = Math.max(0, evaluation.lifestyle_motivation_delta || 0)
    let newLifestyle = clamp(
      Math.max(currentParams.lifestyle_motivation, currentParams.lifestyle_motivation + lifestyleDelta),
      1,
      Math.min(5, initialLifestyle + 1)
    )

    // Apply medication_motivation: only positive, max +1 from initial, clamp [1,5]
    let medDelta = Math.max(0, evaluation.medication_motivation_delta || 0)
    let newMedication = clamp(
      Math.max(currentParams.medication_motivation, currentParams.medication_motivation + medDelta),
      1,
      Math.min(5, initialMedication + 1)
    )

    // Trust level: AI delta from doctor's behavior + auto-bonus from motivation increases
    const lifestyleIncreased = newLifestyle > currentParams.lifestyle_motivation
    const medicationIncreased = newMedication > currentParams.medication_motivation
    let trustDelta = evaluation.trust_level_delta || 0
    if (lifestyleIncreased) trustDelta += 1
    if (medicationIncreased) trustDelta += 1
    const currentTrust = currentParams.trust_level || 0
    let newTrust = clamp(
      currentTrust + trustDelta,
      0,
      Math.min(5, initialTrust + 2)
    )

    // 生活指導合意のマージ（積み上げ式、level 弱化は避ける）
    const currentAgreements = currentParams.lifestyle_agreements || {}
    const agreementsUpdate = evaluation.lifestyle_agreements_update || {}
    const mergedAgreements = Object.assign({}, currentAgreements)
    const levelRank = { weak: 1, moderate: 2, strong: 3 }
    // 同じカテゴリで複数の数値制限が提案された場合、より厳しい（小さい）方を採用
    function extractNumericLimit(text, units) {
      if (!text || typeof text !== 'string') return null
      for (let i = 0; i < units.length; i++) {
        const re = new RegExp('(\\d+\\.?\\d*)\\s*' + units[i])
        const m = text.match(re)
        if (m) return parseFloat(m[1])
      }
      return null
    }
    function isStricterDetail(newDetail, existingDetail) {
      if (!newDetail || !existingDetail) return false
      // カロリー: 数値が小さい方が厳しい
      const nCal = extractNumericLimit(newDetail, ['kcal'])
      const eCal = extractNumericLimit(existingDetail, ['kcal'])
      if (nCal !== null && eCal !== null) return nCal < eCal
      // 塩分（g）両方が塩分言及あり
      if (/塩分|減塩|Na|ナトリウム/.test(newDetail) && /塩分|減塩|Na|ナトリウム/.test(existingDetail)) {
        const nSalt = extractNumericLimit(newDetail, ['g'])
        const eSalt = extractNumericLimit(existingDetail, ['g'])
        if (nSalt !== null && eSalt !== null) return nSalt < eSalt
      }
      // コレステロール（mg）
      if (/コレステロール/.test(newDetail) && /コレステロール/.test(existingDetail)) {
        const nCh = extractNumericLimit(newDetail, ['mg'])
        const eCh = extractNumericLimit(existingDetail, ['mg'])
        if (nCh !== null && eCh !== null) return nCh < eCh
      }
      // 飽和脂肪酸（％）
      if (/飽和脂肪|脂質|脂肪/.test(newDetail) && /飽和脂肪|脂質|脂肪/.test(existingDetail)) {
        const nFat = extractNumericLimit(newDetail, ['%', '％'])
        const eFat = extractNumericLimit(existingDetail, ['%', '％'])
        if (nFat !== null && eFat !== null) return nFat < eFat
      }
      // 飲酒量（g、合）数値小さい方が厳しい
      if (/酒|アルコール/.test(newDetail) && /酒|アルコール/.test(existingDetail)) {
        const nAl = extractNumericLimit(newDetail, ['g', '合'])
        const eAl = extractNumericLimit(existingDetail, ['g', '合'])
        if (nAl !== null && eAl !== null) return nAl < eAl
      }
      // 運動量、体重減量: 数値大きい方が厳しい（より努力する）
      if (/運動|歩行|散歩|ウォーキング/.test(newDetail) && /運動|歩行|散歩|ウォーキング/.test(existingDetail)) {
        const nEx = extractNumericLimit(newDetail, ['分', '回'])
        const eEx = extractNumericLimit(existingDetail, ['分', '回'])
        if (nEx !== null && eEx !== null) return nEx > eEx
      }
      if (/減量|体重|kg/.test(newDetail) && /減量|体重|kg/.test(existingDetail)) {
        const nWt = extractNumericLimit(newDetail, ['kg'])
        const eWt = extractNumericLimit(existingDetail, ['kg'])
        if (nWt !== null && eWt !== null) return nWt > eWt
      }
      return false
    }
    Object.keys(agreementsUpdate).forEach(function(cat) {
      const incoming = agreementsUpdate[cat]
      if (!incoming || !incoming.agreed) return
      const existing = mergedAgreements[cat]
      if (!existing || !existing.agreed) {
        mergedAgreements[cat] = incoming
      } else {
        const newRank = levelRank[incoming.level] || 0
        const oldRank = levelRank[existing.level] || 0
        if (newRank > oldRank) {
          mergedAgreements[cat] = incoming
        } else if (newRank === oldRank && isStricterDetail(incoming.detail, existing.detail)) {
          // 同じレベルでも、より厳しい数値制限ならその提案を採用
          mergedAgreements[cat] = incoming
        }
      }
    })

    // Stress and busyness do NOT change in interview/treatment context (only via social support effect at next visit)
    const newParams = {
      eating_habit_label: evaluation.eating_habit_label != null ? evaluation.eating_habit_label : currentParams.eating_habit_label,
      eating_habit_comment: evaluation.eating_habit_comment != null ? evaluation.eating_habit_comment : currentParams.eating_habit_comment,
      exercise_habit_label: evaluation.exercise_habit_label != null ? evaluation.exercise_habit_label : currentParams.exercise_habit_label,
      exercise_habit_comment: evaluation.exercise_habit_comment != null ? evaluation.exercise_habit_comment : currentParams.exercise_habit_comment,
      smoking_label: evaluation.smoking_label != null ? evaluation.smoking_label : currentParams.smoking_label,
      smoking_comment: evaluation.smoking_comment != null ? evaluation.smoking_comment : currentParams.smoking_comment,
      drinking_label: evaluation.drinking_label != null ? evaluation.drinking_label : currentParams.drinking_label,
      drinking_comment: evaluation.drinking_comment != null ? evaluation.drinking_comment : currentParams.drinking_comment,
      lifestyle_motivation: newLifestyle,
      lifestyle_agreements: mergedAgreements,
      medication_motivation: newMedication,
      trust_level: newTrust,
    }

    const supabase = getAdminClient()
    const { data, error } = await supabase
      .from('visit_parameters')
      .update(newParams)
      .eq('case_id', caseId)
      .eq('visit_number', visitNumber)
      .select()
      .single()

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    const deltas = {
      lifestyle_motivation: newLifestyle - currentParams.lifestyle_motivation,
      medication_motivation: newMedication - currentParams.medication_motivation,
      trust_level: newTrust - currentTrust,
      eating_habit_changed: evaluation.eating_habit_label != null || evaluation.eating_habit_comment != null,
      exercise_habit_changed: evaluation.exercise_habit_label != null || evaluation.exercise_habit_comment != null,
    }

    return Response.json({
      params: data,
      deltas: deltas,
      reasoning: evaluation.reasoning || ''
    })

  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
