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

    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ profile: data })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req) {
  try {
    const body = await req.json()
    const { userId, real_name, handle_name, display_preference, touch_only } = body
    if (!userId) return Response.json({ error: 'userId required' }, { status: 400 })
    const supabase = getAdminClient()

    // touch_only: just update last_active_at (lightweight beacon)
    if (touch_only) {
      const { error } = await supabase
        .from('user_profiles')
        .update({ last_active_at: new Date().toISOString() })
        .eq('user_id', userId)
      // Ignore errors for touch (user might not have profile yet)
      return Response.json({ ok: true })
    }

    if (!real_name || real_name.trim() === '') {
      return Response.json({ error: 'real_name required' }, { status: 400 })
    }

    // upsert profile
    const { data, error } = await supabase
      .from('user_profiles')
      .upsert({
        user_id: userId,
        real_name: real_name.trim(),
        handle_name: handle_name ? handle_name.trim() : null,
        display_preference: display_preference || 'real_name',
        last_active_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ profile: data })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
