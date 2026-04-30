import { createClient } from '@supabase/supabase-js'

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
    const { data, error } = await supabase
      .from('medical_devices')
      .select('id, device_category, device_name, device_name_en, indication, how_to_use, insurance_coverage, psychological_barrier, common_objections, key_benefits, sub_options, first_line')
      .eq('disease_id', diseaseId)
      .eq('is_active', true)
      .order('sort_order')

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ devices: data })

  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
