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

export async function PUT(req, { params }) {
  try {
    const { id } = params
    const body = await req.json()
    const { userId, version, title, content, released_at, category } = body
    const supabase = getAdminClient()
    if (!(await isAdminUser(supabase, userId))) {
      return Response.json({ error: '管理者権限が必要です' }, { status: 403 })
    }
    const update = {}
    if (version !== undefined) update.version = version.trim()
    if (title !== undefined) update.title = title.trim()
    if (content !== undefined) update.body = content.trim()
    if (released_at !== undefined) update.released_at = released_at
    if (category !== undefined) update.category = category

    const { data, error } = await supabase
      .from('updates').update(update).eq('id', id).select().single()
    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ update: data })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(req, { params }) {
  try {
    const { id } = params
    const url = new URL(req.url)
    const userId = url.searchParams.get('userId')
    const supabase = getAdminClient()
    if (!(await isAdminUser(supabase, userId))) {
      return Response.json({ error: '管理者権限が必要です' }, { status: 403 })
    }
    const { error } = await supabase.from('updates').delete().eq('id', id)
    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ ok: true })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
