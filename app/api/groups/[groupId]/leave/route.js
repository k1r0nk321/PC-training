import { createClient } from '@supabase/supabase-js'

export const maxDuration = 10

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

export async function POST(req, { params }) {
  try {
    const { groupId } = await params
    const body = await req.json()
    const { userId } = body
    if (!groupId || !userId) {
      return Response.json({ error: 'groupId and userId required' }, { status: 400 })
    }
    const supabase = getAdminClient()

    // 管理者でかつ唯一の admin の場合、脱退不可（解散を案内）
    const { data: membership } = await supabase
      .from('group_members')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .maybeSingle()
    if (!membership) {
      return Response.json({ error: 'メンバーではありません' }, { status: 404 })
    }

    if (membership.role === 'admin') {
      const { data: adminCount } = await supabase
        .from('group_members')
        .select('user_id')
        .eq('group_id', groupId)
        .eq('role', 'admin')
      if ((adminCount || []).length <= 1) {
        return Response.json({
          error: 'あなたは唯一の管理者です。他のメンバーを管理者にするか、グループを解散してください。'
        }, { status: 400 })
      }
    }

    const { error } = await supabase
      .from('group_members')
      .delete()
      .eq('group_id', groupId)
      .eq('user_id', userId)
    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ ok: true })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
