import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

export async function GET(req) {
  try {
    const supabase = getAdminClient()

    const { data, error } = await supabase
      .from('diseases')
      .select('id, name_ja, name_en, category, difficulty_level')
      .eq('is_active', true)
      .order('sort_order')

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ diseases: data })

  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
