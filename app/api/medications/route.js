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
      .from('medications')
      .select('id, drug_category, drug_name_generic, drug_name_brand, typical_dose, frequency, first_line, second_line, indication_notes, contraindications')
      .eq('disease_id', diseaseId)
      .eq('is_active', true)
      .order('sort_order')

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ medications: data })

  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
