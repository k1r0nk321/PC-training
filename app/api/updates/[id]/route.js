import { createClient } from '@supabase/supabase-js'

export const maxDuration = 10

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

async function isAdminUser(supabase, userId) {
  if (!userId) return false
  const { data } = await supabase
    .from('user_profiles').select('role').eq('user_id', userId).maybeSingle()
  return data && data.role === 'admin'
}

export async function GET(req) {
  try {
    const url = new URL(req.url)
    const limit = parseInt(url.searchParams.get('limit') || '50', 10)
    const supabase = getAdminClient()

    const { data, error } = await supabase
      .from('updates')
      .select('*')
      .order('released_at', { ascending: false })
      .limit(limit)

    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ updates: data || [] })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req) {
  try {
    const body = await req.json()
    const { userId, version, title, content, released_at } = body
    if (!userId) return Response.json({ error: 'userId required' }, { status: 400 })
    if (!version || !title || !content) {
      return Response.json({ error: 'version, title, content required' }, { status: 400 })
    }

    const supabase = getAdminClient()
    if (!(await isAdminUser(supabase, userId))) {
      return Response.json({ error: '管理者権限が必要です' }, { status: 403 })
    }

    const { data, error } = await supabase
      .from('updates')
      .insert({
        version: version.trim(),
        title: title.trim(),
        body: content.trim(),
        released_at: released_at || new Date().toISOString(),
        created_by: userId,
      })
      .select().single()

    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ update: data })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
