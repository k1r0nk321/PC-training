import { createClient } from '@supabase/supabase-js'
import { shouldShowPreview } from '../../lib/preview-mode'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const diseaseId = searchParams.get('diseaseId')

    if (!diseaseId) {
      return Response.json({ error: 'diseaseId is required' }, { status: 400 })
    }

    const supabase = getAdminClient()
    let query = supabase
      .from('patient_education')
      .select('id, category, instruction_key, instruction_detail, difficulty, evidence_level, guideline_ref, adherence_impact, sub_options')
      .eq('disease_id', diseaseId)
    if (!shouldShowPreview()) {
      query = query.eq('is_active', true)
    }
    const { data, error } = await query.order('sort_order')

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    // instruction_detail を必ず「短いラベル」に正規化する。
    // 疾患によって instruction_key が日本語の短ラベル + instruction_detail が長文、というデータがあり
    // そのまま表示すると治療方針画面の生活指導が長文化して崩れるため。
    // 日本語(非ASCII)の instruction_key があればそれを表示ラベルに採用し、元の長文は instruction_long に退避（保持）。
    const hasNonAscii = function (s) {
      if (typeof s !== 'string') return false
      for (let i = 0; i < s.length; i++) { if (s.charCodeAt(i) > 127) return true }
      return false
    }
    const items = (data || []).map(function (row) {
      const label = hasNonAscii(row.instruction_key) ? row.instruction_key : (row.instruction_detail || row.instruction_key)
      return Object.assign({}, row, {
        instruction_long: row.instruction_detail,
        instruction_detail: label,
      })
    })

    return Response.json({ items: items })

  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
