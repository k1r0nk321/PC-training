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
    const { caseId, visitNumber, messages, labData } = await req.json()
    if (!caseId || !visitNumber) {
      return Response.json({ error: 'caseId and visitNumber required' }, { status: 400 })
    }
    const supabase = getAdminClient()
    const updates = { record_saved_at: new Date().toISOString() }
    if (visitNumber === 1) {
      updates.visit1_messages = messages || []
      if (labData !== undefined) updates.visit1_lab_data = labData
    } else {
      updates.visit2_messages = messages || []
      if (labData !== undefined) updates.visit2_lab_data = labData
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
          record_saved_at: null, visit1_messages: null, visit2_messages: null,
          visit1_lab_data: null, visit2_lab_data: null
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
      .select('visit1_messages, visit2_messages, visit1_lab_data, visit2_lab_data, visit1_data, patient_data, disease_name, record_saved_at')
      .eq('id', caseId)
      .single()
    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json(data)
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
