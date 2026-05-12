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
    const limit = parseInt(url.searchParams.get('limit') || '20', 10)
    const adminView = url.searchParams.get('admin') === '1'
    const userId = url.searchParams.get('userId')
    const supabase = getAdminClient()

    let query = supabase
      .from('announcements')
      .select('*')
      .order('starts_at', { ascending: false })
      .limit(limit)

    if (adminView) {
      // admin only - show all including unpublished
      if (!(await isAdminUser(supabase, userId))) {
        return Response.json({ error: '管理者権限が必要です' }, { status: 403 })
      }
    } else {
      // public view: only published, currently active
      query = query.eq('published', true).lte('starts_at', new Date().toISOString())
    }

    const { data, error } = await query
    if (error) return Response.json({ error: error.message }, { status: 500 })

    // public view: filter out expired
    let result = data || []
    if (!adminView) {
      const now = new Date()
      result = result.filter(function(a) {
        if (!a.ends_at) return true
        return new Date(a.ends_at) > now
      })
    }
    return Response.json({ announcements: result })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req) {
  try {
    const body = await req.json()
    const { userId, title, content, priority, published, starts_at, ends_at } = body
    if (!userId) return Response.json({ error: 'userId required' }, { status: 400 })
    if (!title || !content) return Response.json({ error: 'title and content required' }, { status: 400 })

    const supabase = getAdminClient()
    if (!(await isAdminUser(supabase, userId))) {
      return Response.json({ error: '管理者権限が必要です' }, { status: 403 })
    }

    const { data, error } = await supabase
      .from('announcements')
      .insert({
        title: title.trim(),
        body: content.trim(),
        priority: priority || 'normal',
        published: published !== false,
        starts_at: starts_at || new Date().toISOString(),
        ends_at: ends_at || null,
        created_by: userId,
      })
      .select().single()

    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ announcement: data })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
