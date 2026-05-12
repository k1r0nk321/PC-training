import { createClient } from '@supabase/supabase-js'

export const maxDuration = 10

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

const VALID_POSITIONS = [
  '医学生', '1年目研修医', '2年目研修医', '専攻医', '指導医', '医療従事者', 'その他'
]

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
    const {
      userId, real_name, handle_name, display_preference,
      affiliation, position, agree_terms, terms_version,
      touch_only
    } = body
    if (!userId) return Response.json({ error: 'userId required' }, { status: 400 })
    const supabase = getAdminClient()

    // touch_only: just update last_active_at (lightweight beacon)
    if (touch_only) {
      await supabase
        .from('user_profiles')
        .update({ last_active_at: new Date().toISOString() })
        .eq('user_id', userId)
      return Response.json({ ok: true })
    }

    if (!real_name || real_name.trim() === '') {
      return Response.json({ error: '本名は必須です' }, { status: 400 })
    }
    if (!affiliation || affiliation.trim() === '') {
      return Response.json({ error: '所属は必須です' }, { status: 400 })
    }
    if (!position || !VALID_POSITIONS.includes(position)) {
      return Response.json({ error: '身分の選択は必須です' }, { status: 400 })
    }
    if (!agree_terms) {
      return Response.json({ error: '利用規約への同意が必要です' }, { status: 400 })
    }

    const updateData = {
      user_id: userId,
      real_name: real_name.trim(),
      handle_name: handle_name ? handle_name.trim() : null,
      affiliation: affiliation.trim(),
      position: position,
      display_preference: display_preference || 'real_name',
      terms_agreed_at: new Date().toISOString(),
      terms_version: terms_version || '1.0',
      last_active_at: new Date().toISOString(),
    }

    const { data, error } = await supabase
      .from('user_profiles')
      .upsert(updateData)
      .select()
      .single()

    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ profile: data })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
