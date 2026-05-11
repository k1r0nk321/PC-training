import { createClient } from '@supabase/supabase-js'

export const maxDuration = 10

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

export async function GET(req) {
  try {
    const url = new URL(req.url)
    const userId = url.searchParams.get('userId')
    if (!userId) return Response.json({ error: 'userId required' }, { status: 400 })
    const supabase = getAdminClient()
    const { data } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()
    return Response.json(data || { user_id: userId, preceptor_coaching_mode: 'recommended_only' })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req) {
  try {
    const { userId, preceptor_coaching_mode } = await req.json()
    if (!userId) return Response.json({ error: 'userId required' }, { status: 400 })
    const validModes = ['detailed', 'recommended_only', 'none']
    if (!validModes.includes(preceptor_coaching_mode)) {
      return Response.json({ error: 'invalid mode' }, { status: 400 })
    }
    const supabase = getAdminClient()
    const { error } = await supabase
      .from('user_preferences')
      .upsert({
        user_id: userId,
        preceptor_coaching_mode,
        updated_at: new Date().toISOString()
      })
    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ success: true })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
