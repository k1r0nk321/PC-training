import { createClient } from '@supabase/supabase-js'

export const maxDuration = 30

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

export async function POST(req) {
  try {
    const { caseId, visitNumber, messages, labData, savedState } = await req.json()
    if (!caseId || !visitNumber) {
      return Response.json({ error: 'caseId and visitNumber required' }, { status: 400 })
    }
    const supabase = getAdminClient()


    const updates = { record_saved_at: new Date().toISOString() }
    if (visitNumber === 1) {
      updates.visit1_messages = messages || []
      if (labData !== undefined) updates.visit1_lab_data = labData
    } else if (visitNumber === 2) {
      updates.visit2_messages = messages || []
      if (labData !== undefined) updates.visit2_lab_data = labData
    } else if (visitNumber === 3) {
      updates.visit3_messages = messages || []
      if (labData !== undefined) updates.visit3_lab_data = labData
    }
    if (savedState !== undefined) {
      updates.saved_state = savedState
    }
    const { error } = await supabase.from('cases').update(updates).eq('id', caseId)
    if (error) return Response.json({ error: error.message }, { status: 500 })

    // Enforce latest 5 per disease
    const { data: thisCase } = await supabase.from('cases').select('disease_id').eq('id', caseId).single()
    if (thisCase && thisCase.disease_id) {
      const { data: saved } = await supabase
        .from('cases').select('id, record_saved_at')
        .eq('disease_id', thisCase.disease_id)
        .not('record_saved_at', 'is', null)
        .order('record_saved_at', { ascending: false })
      if (saved && saved.length > 5) {
        const toRemove = saved.slice(5).map(function(c) { return c.id })
        await supabase.from('cases').update({
          record_saved_at: null,
          visit1_messages: null, visit2_messages: null, visit3_messages: null,
          visit1_lab_data: null, visit2_lab_data: null, visit3_lab_data: null,
          saved_state: null
        }).in('id', toRemove)
      }
    }
    return Response.json({ success: true })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}

export async function GET(req) {
  try {
    const url = new URL(req.url)
    const caseId = url.searchParams.get('caseId')
    if (!caseId) return Response.json({ error: 'caseId required' }, { status: 400 })
    const supabase = getAdminClient()
    const { data, error } = await supabase
      .from('cases')
      .select('visit1_messages, visit2_messages, visit3_messages, visit1_lab_data, visit2_lab_data, visit3_lab_data, visit1_data, visit2_data, visit3_data, visit1_feedback, visit2_feedback, visit3_feedback, patient_data, disease_name, record_saved_at, saved_state')
      .eq('id', caseId)
      .single()
    if (error) return Response.json({ error: error.message }, { status: 500 })

    // ===== Phase E: visit_parameters も併せて返す =====
    const { data: params } = await supabase
      .from('visit_parameters')
      .select('*')
      .eq('case_id', caseId)
      .order('visit_number')

    return Response.json({ ...data, visit_parameters: params || [] })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(req) {
  try {
    const url = new URL(req.url)
    const caseId = url.searchParams.get('caseId')
    if (!caseId) return Response.json({ error: 'caseId required' }, { status: 400 })
    const supabase = getAdminClient()
    const { error } = await supabase
      .from('cases')
      .update({ saved_state: null })
      .eq('id', caseId)
    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ success: true })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
