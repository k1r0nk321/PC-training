// app/lib/consultation-evaluator.js
//
// 専門医コンサルトの適切性をルールベースで判定するモジュール。
// プライマリケア研修の評価で「定型連携を過剰委譲と誤判定」する問題を防ぐ目的。
//
// 使い方:
//   import { buildConsultationEvaluationBlock } from '../../lib/consultation-evaluator'
//   const block = buildConsultationEvaluationBlock(diseaseName, patient, [
//     { visit: 1, consultation: v1.consultation },
//     { visit: 2, consultation: v2.consultation },
//     { visit: 3, consultation: consultation },
//   ])
//   // → プロンプトに block をそのまま埋め込む

// ──────────────────────────────────────────────────────────
// 1. 紹介先文字列の正規化
// ──────────────────────────────────────────────────────────
// 値（キー）が DB に保存される正規化後の specialty 名、配列がそれにマッチさせるキーワード
const SPECIALTY_NORMALIZE_MAP = {
  '眼科': ['眼科'],
  '皮膚科': ['皮膚科'],
  '形成外科': ['形成外科'],
  '腎臓': ['腎臓', '腎臓内科', 'nephrology'],
  '循環器': ['循環器', '循環器内科', 'cardiology'],
  '内分泌・代謝': ['内分泌', '内分泌内科', '糖尿病内科', '糖尿病科', '代謝'],
  '神経内科': ['神経内科', '脳神経内科'],
  '耳鼻科': ['耳鼻'],
  '消化器': ['消化器'],
  '呼吸器': ['呼吸器'],
  '脂質代謝専門医': ['脂質'],
  '精神科': ['精神科'],
  '産婦人科': ['産婦人科', '婦人科'],
}

// 生活指導関連の専門資源（疾患に依らず適切）
const SPECIAL_ROUTES = ['禁煙外来', '減酒外来', '地域包括支援センター']

function normalizeSpecialty(text) {
  if (!text) return null
  const s = String(text)
  for (const key of Object.keys(SPECIALTY_NORMALIZE_MAP)) {
    const kws = SPECIALTY_NORMALIZE_MAP[key]
    for (const k of kws) {
      if (s.indexOf(k) >= 0) return key
    }
  }
  return null
}

function hasKeyword(text, keys) {
  if (!text) return false
  const s = String(text)
  for (const k of keys) {
    if (s.indexOf(k) >= 0) return true
  }
  return false
}

function getLab(patient, key) {
  if (!patient || !patient.labs) return null
  const v = patient.labs[key]
  return v == null ? null : Number(v)
}

function parseSystolicBP(patient) {
  const bp = patient && patient.vitals && patient.vitals.bp
  if (!bp) return 0
  const m = String(bp).match(/(\d{2,3})\s*\/\s*\d{2,3}/)
  return m ? parseInt(m[1], 10) : 0
}

// ──────────────────────────────────────────────────────────
// 2. 疾患別ルール
// ──────────────────────────────────────────────────────────
// appropriate: PC医が主導で依頼すべき定型連携（specialty 一致で OK 判定）
// conditional: 患者状態の条件次第で適切 ⇔ 過剰
//   condition(patient) が true なら commentTrue、false なら commentFalse を返す
//
// specialty の値は SPECIALTY_NORMALIZE_MAP のキーに合わせる

const DISEASE_RULES = {
  '2型糖尿病': {
    appropriate: [
      {
        specialty: '眼科',
        purpose: '糖尿病網膜症スクリーニング',
        comment: '糖尿病患者では年1回の網膜症スクリーニングとして眼科コンサルトが推奨されます（糖尿病治療ガイド2024）。網膜症は無症状で進行するため、症状が出てからでは手遅れになります。プライマリケア医が主導で依頼すべき定型連携です。',
      },
      {
        specialty: '皮膚科',
        purpose: 'フットケア・足病変予防',
        comment: '糖尿病性足病変の予防・早期発見のため皮膚科との連携は適切です。神経障害や末梢動脈疾患合併例では特に重要。プライマリケア医が定期的に依頼すべき連携です。',
      },
      {
        specialty: '形成外科',
        purpose: '足潰瘍・難治性創傷の治療',
        comment: '糖尿病性足潰瘍や難治性創傷では形成外科との連携が適切です。',
      },
    ],
    conditional: [
      {
        specialty: '腎臓',
        purpose: '進行糖尿病腎症の併診',
        condition: function (p) {
          const egfr = getLab(p, 'egfr')
          const alb = getLab(p, 'urine_alb')
          return (egfr != null && egfr < 45) || (alb != null && alb > 300)
        },
        commentTrue: '進行した糖尿病腎症（eGFR<45 または 顕性蛋白尿）では腎臓内科との併診が適切です。',
        commentFalse: '現時点で腎機能・尿アルブミンは腎臓内科併診を要する水準ではありません。プライマリケア医による経過観察が標準的で、安易な腎臓内科コンサルトは過剰委譲となる可能性があります。',
      },
      {
        specialty: '内分泌・代謝',
        purpose: 'コントロール不良時の管理委譲',
        condition: function (p) {
          const hba1c = getLab(p, 'hba1c')
          return hba1c != null && hba1c >= 9.0
        },
        commentTrue: 'HbA1c 9% 以上のコントロール不良例では糖尿病専門医（内分泌・代謝科）への紹介が適切です。',
        commentFalse: 'HbA1c 9% 未満の症例ではプライマリケア医による管理が標準的です。第一選択薬（メトホルミン等）からの段階的強化を試みてください。',
      },
    ],
  },
  '高血圧症': {
    appropriate: [
      {
        specialty: '眼科',
        purpose: '高血圧性網膜症・臓器障害評価',
        comment: '高血圧性網膜症の評価や臓器障害精査として眼底検査の眼科依頼は適切です。Ⅱ度以上の高血圧や臓器障害が疑われる症例で有用。',
      },
    ],
    conditional: [
      {
        specialty: '循環器',
        purpose: '治療抵抗性・心病変併存例',
        condition: function (p) {
          const sbp = parseSystolicBP(p)
          const hasCardiac = hasKeyword(p && p.past_history, ['心不全', '冠動脈', '心筋梗塞', '不整脈', '心臓'])
          return sbp >= 180 || hasCardiac
        },
        commentTrue: '収縮期血圧 180 mmHg 以上または心病変併存例では循環器内科との併診が適切です。',
        commentFalse: '本症例は重症高血圧（SBP≥180）にも心病変併存例にも該当しません。第一選択薬（ARB/ACE-I/Ca拮抗薬/サイアザイド）による管理が標準的で、初診時の循環器コンサルトは過剰委譲です。',
      },
      {
        specialty: '腎臓',
        purpose: '二次性高血圧精査・腎機能低下',
        condition: function (p) {
          const egfr = getLab(p, 'egfr')
          return egfr != null && egfr < 45
        },
        commentTrue: 'eGFR<45 の腎機能低下例では腎臓内科併診が適切です（二次性高血圧の精査も含む）。',
        commentFalse: '腎機能は腎臓内科併診を要する水準ではありません。',
      },
    ],
  },
  '脂質異常症': {
    appropriate: [],
    conditional: [
      {
        specialty: '脂質代謝専門医',
        purpose: '家族性高コレステロール血症の精査',
        condition: function (p) {
          const ldl = getLab(p, 'ldl')
          const fh = hasKeyword(p && p.family_history, ['若年', '冠動脈', '心筋梗塞'])
          return (ldl != null && ldl >= 250) || (ldl != null && ldl >= 190 && fh)
        },
        commentTrue: 'LDL≥250 mg/dL または LDL≥190+若年家族冠動脈疾患歴の症例は家族性高コレステロール血症を疑い、脂質代謝専門医への紹介が適切です。',
        commentFalse: '家族性高コレステロール血症を強く疑う所見はありません。プライマリケア医によるスタチン治療が標準的です。',
      },
      {
        specialty: '循環器',
        purpose: '冠動脈疾患既往の二次予防',
        condition: function (p) {
          return hasKeyword(p && p.past_history, ['冠動脈', '心筋梗塞', 'PCI', '狭心症', 'CABG'])
        },
        commentTrue: '冠動脈疾患既往例では二次予防として循環器内科併診が適切です。',
        commentFalse: '冠動脈疾患既往はありません。プライマリケア医による一次予防管理（スタチン等）が標準的です。',
      },
    ],
  },
}

// ──────────────────────────────────────────────────────────
// 3. 個別コンサルトの判定
// ──────────────────────────────────────────────────────────

function evaluateOneConsultation(diseaseName, patient, consultation) {
  if (!consultation || !consultation.performed) return null
  const spec = consultation.specialty || ''
  const reason = consultation.reason || ''

  // 生活指導専門資源は常に適切
  if (SPECIAL_ROUTES.indexOf(spec) >= 0) {
    return {
      category: 'special_route',
      label: '【適切：生活指導専門資源】',
      comment: '生活習慣改善・社会的支援のための専門資源活用は適切な選択です。',
    }
  }

  const normSpec = normalizeSpecialty(spec)
  if (!normSpec) {
    return {
      category: 'unmapped',
      label: '【判定保留】',
      comment: '紹介科がルール定義外です（' + (spec || '未選択') + '）。紹介理由「' + (reason || '記載なし') + '」の妥当性は AI 判断に委ねます。',
    }
  }

  const rules = DISEASE_RULES[diseaseName]
  if (!rules) {
    return {
      category: 'unmapped',
      label: '【判定保留】',
      comment: '本疾患（' + diseaseName + '）には判定ルールが未定義です。',
    }
  }

  // appropriate ルール
  for (const r of rules.appropriate || []) {
    if (r.specialty === normSpec) {
      return {
        category: 'appropriate',
        label: '【適切：定型連携】',
        comment: r.comment,
      }
    }
  }

  // conditional ルール
  for (const r of rules.conditional || []) {
    if (r.specialty === normSpec) {
      const ok = r.condition ? !!r.condition(patient) : true
      return {
        category: ok ? 'conditional_ok' : 'conditional_excessive',
        label: ok ? '【適切：条件該当】' : '【過剰：条件非該当】',
        comment: ok ? r.commentTrue : r.commentFalse,
      }
    }
  }

  // どのルールにも該当しない
  return {
    category: 'unmapped',
    label: '【判定保留】',
    comment: '本疾患では当該専門科（' + spec + '）への定型的な連携理由が定義されていません。紹介理由「' + (reason || '記載なし') + '」の医学的妥当性は AI 判断に委ねます。',
  }
}

// ──────────────────────────────────────────────────────────
// 4. 未実施だが推奨される連携の検出
// ──────────────────────────────────────────────────────────

function findMissedAppropriate(diseaseName, patient, consultationsByVisit) {
  const rules = DISEASE_RULES[diseaseName]
  if (!rules || !rules.appropriate) return []
  const performedNorms = new Set()
  for (const item of consultationsByVisit) {
    const c = item && item.consultation
    if (c && c.performed) {
      const n = normalizeSpecialty(c.specialty)
      if (n) performedNorms.add(n)
    }
  }
  const missed = []
  for (const r of rules.appropriate) {
    if (!performedNorms.has(r.specialty)) {
      missed.push({
        specialty: r.specialty,
        purpose: r.purpose,
        comment: r.comment,
      })
    }
  }
  return missed
}

// ──────────────────────────────────────────────────────────
// 5. データフォーマット正規化（旧/新フォーマット対応）
// ──────────────────────────────────────────────────────────
// 旧フォーマット: { performed: true, specialty: '眼科', reason: '...' }
// 新フォーマット: [{ specialty: '眼科', reason: '...' }, ...]
// どちらが来ても [{specialty, reason}, ...] の配列で返す

export function normalizeConsultations(data) {
  if (!data) return []
  // 新フォーマット: 配列
  if (Array.isArray(data)) {
    return data.filter(function (c) { return c && c.specialty })
  }
  // 旧フォーマット: 単一オブジェクト
  if (data.performed) {
    return [{ specialty: data.specialty || '', reason: data.reason || '' }]
  }
  return []
}

// ──────────────────────────────────────────────────────────
// 6. プロンプト用テキストブロック生成（メイン API）
// ──────────────────────────────────────────────────────────

export function buildConsultationEvaluationBlock(diseaseName, patient, consultationsByVisit) {
  const safeList = Array.isArray(consultationsByVisit) ? consultationsByVisit : []
  const lines = []
  lines.push('================================================================')
  lines.push('【コンサルト適切性判定（ルールベース）】')
  lines.push('')

  // 実施されたコンサルトの判定
  const performed = safeList.filter(function (c) {
    return c && c.consultation && c.consultation.performed
  })
  if (performed.length === 0) {
    lines.push('■ 実施されたコンサルト：なし')
  } else {
    lines.push('■ 実施されたコンサルトの判定：')
    for (const item of performed) {
      const result = evaluateOneConsultation(diseaseName, patient, item.consultation)
      if (!result) continue
      const reason = item.consultation.reason || '未記入'
      lines.push('- Visit ' + item.visit + '：' + (item.consultation.specialty || '未選択') + '（理由：' + reason + '） → ' + result.label)
      lines.push('  ' + result.comment)
    }
  }

  // 未実施だが推奨される連携
  const missed = findMissedAppropriate(diseaseName, patient, safeList)
  if (missed.length > 0) {
    lines.push('')
    lines.push('■ 未実施だが定型的に推奨される連携：')
    for (const m of missed) {
      lines.push('- ' + m.specialty + '（' + m.purpose + '）：いずれの Visit でも実施されていません')
      lines.push('  ' + m.comment)
    }
  }

  lines.push('')
  lines.push('【AI評価への重要な指示】')
  lines.push('上記ルールベース判定を尊重してフィードバックを生成してください：')
  lines.push('- 【適切：定型連携】【適切：条件該当】【適切：生活指導専門資源】 → 減点せず、プラス評価。プライマリケア医として適切な専門科連携です。')
  lines.push('- 【過剰：条件非該当】 → 軽度減点し、教育コメントで「PC医で完結すべき内容」と指摘してください。')
  lines.push('- 未実施だが推奨される連携（特に DM での眼科・皮膚科） → コンサルトの有無自体は減点しなくてよいですが、研修教育のため教育コメントとして必ず言及してください（「年1回の網膜症スクリーニング依頼が望ましかった」等）。')
  lines.push('- 【判定保留】 → ルール外。紹介理由の医学的妥当性のみで AI が判断してください。')
  lines.push('================================================================')

  return lines.join('\n')
}
