export const maxDuration = 30

import { createClient } from '@supabase/supabase-js'
import { decideAutoTreatment } from '../../lib/auto-treatment-rules'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

// 薬剤マッチング: rule.match (例:'メトホルミン') を drug_name_generic / drug_category で照合
function matchMedications(medications, ruleItem) {
  if (!Array.isArray(medications)) return []
  const key = (ruleItem.match || '').trim()
  if (!key) return []
  // 優先順: drug_name_generic 完全一致 > drug_name_generic 部分一致 > drug_category 部分一致
  const exactName = medications.filter(function (m) { return m.drug_name_generic === key })
  if (exactName.length > 0) return [exactName[0]]
  const partialName = medications.filter(function (m) { return m.drug_name_generic && m.drug_name_generic.indexOf(key) >= 0 })
  if (partialName.length > 0) {
    // first_line 優先
    const fl = partialName.filter(function (m) { return m.first_line })
    return fl.length > 0 ? [fl[0]] : [partialName[0]]
  }
  const partialCat = medications.filter(function (m) { return m.drug_category && m.drug_category.indexOf(key) >= 0 })
  if (partialCat.length > 0) {
    const fl = partialCat.filter(function (m) { return m.first_line })
    return fl.length > 0 ? [fl[0]] : [partialCat[0]]
  }
  return []
}

function matchDevices(devices, ruleItem) {
  if (!Array.isArray(devices)) return []
  const key = (ruleItem.match || '').trim()
  if (!key) return []
  const matches = devices.filter(function (d) {
    return (d.device_name && d.device_name.indexOf(key) >= 0) ||
           (d.device_category && d.device_category.indexOf(key) >= 0)
  })
  if (matches.length === 0) return []
  const fl = matches.filter(function (d) { return d.first_line })
  return fl.length > 0 ? [fl[0]] : [matches[0]]
}

export async function POST(req) {
  try {
    const body = await req.json()
    const { diseaseId, diseaseName, patientData } = body

    if (!diseaseId || !diseaseName || !patientData) {
      return Response.json({ error: 'diseaseId, diseaseName, patientData required' }, { status: 400 })
    }

    // ルールベースで判定
    const decision = decideAutoTreatment(diseaseName, patientData)
    if (!decision) {
      return Response.json({ error: '対象疾患のルールが未定義: ' + diseaseName }, { status: 400 })
    }

    const supabase = getAdminClient()

    // ──────────────────────────────────────────
    // 1. 薬剤マッチング
    // ──────────────────────────────────────────
    const { data: meds } = await supabase
      .from('medications')
      .select('id, drug_category, drug_name_generic, drug_name_brand, typical_dose, frequency, first_line, indication_notes')
      .eq('disease_id', diseaseId)
      .eq('is_active', true)
      .order('sort_order')

    const matchedMeds = []
    const seenMedIds = new Set()
    for (const ruleItem of decision.medications || []) {
      const found = matchMedications(meds || [], ruleItem)
      for (const m of found) {
        if (!seenMedIds.has(m.id)) {
          matchedMeds.push({
            id: m.id,
            drug_name_generic: m.drug_name_generic,
            drug_category: m.drug_category,
            typical_dose: m.typical_dose,
            rationale: ruleItem.rationale || '',
          })
          seenMedIds.add(m.id)
        }
      }
    }

    // ──────────────────────────────────────────
    // 2. 機器マッチング
    // ──────────────────────────────────────────
    const { data: devs } = await supabase
      .from('medical_devices')
      .select('id, device_category, device_name, indication, first_line')
      .eq('disease_id', diseaseId)
      .eq('is_active', true)
      .order('sort_order')

    const matchedDevices = []
    const seenDevIds = new Set()
    for (const ruleItem of decision.devices || []) {
      const found = matchDevices(devs || [], ruleItem)
      for (const d of found) {
        if (!seenDevIds.has(d.id)) {
          matchedDevices.push({
            id: d.id,
            device_name: d.device_name,
            device_category: d.device_category,
          })
          seenDevIds.add(d.id)
        }
      }
    }

    // ──────────────────────────────────────────
    // 3. 生活指導マッチング(疾患の education 項目から、該当カテゴリのものを推奨)
    // ──────────────────────────────────────────
    const { data: edus } = await supabase
      .from('patient_education')
      .select('id, category, instruction_key, difficulty, adherence_impact')
      .eq('disease_id', diseaseId)
      .eq('is_active', true)
      .order('sort_order')

    // 該当カテゴリ + difficulty='easy' or 'normal' を推奨(haunting strict は学習向けに避ける)
    const lifestyleCats = decision.lifestyleCategories || []
    const matchedEdus = (edus || []).filter(function (e) {
      return lifestyleCats.indexOf(e.category) >= 0 && (e.difficulty === 'easy' || e.difficulty === 'normal')
    })

    // ──────────────────────────────────────────
    // 4. レスポンス組立
    // ──────────────────────────────────────────
    return Response.json({
      medications: matchedMeds,
      devices: matchedDevices,
      consultations: decision.consultations || [],
      education: matchedEdus.map(function (e) {
        return { id: e.id, category: e.category, instruction_key: e.instruction_key }
      }),
      rationale: decision.rationale || '',
    })
  } catch (e) {
    console.error('auto-treatment error:', e)
    return Response.json({ error: e.message || 'auto-treatment エラー' }, { status: 500 })
  }
}
