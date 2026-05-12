import { createClient } from '@supabase/supabase-js'

export const maxDuration = 10

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

export async function POST(req) {
  try {
    const body = await req.json()
    const { userId, inviteCode } = body
    if (!userId || !inviteCode) {
      return Response.json({ error: 'userId and inviteCode required' }, { status: 400 })
    }
    const supabase = getAdminClient()
    const code = inviteCode.trim().toUpperCase()

    const { data: group, error: gErr } = await supabase
      .from('groups').select('*').eq('invite_code', code).maybeSingle()
    if (gErr) return Response.json({ error: gErr.message }, { status: 500 })
    if (!group) return Response.json({ error: '招待コードが見つかりません' }, { status: 404 })

    // 既にメンバーかチェック
    const { data: existing } = await supabase
      .from('group_members')
      .select('group_id')
      .eq('group_id', group.id)
      .eq('user_id', userId)
      .maybeSingle()
    if (existing) {
      return Response.json({ error: '既にこのグループに参加しています', group: group, alreadyMember: true })
    }

    const { error: iErr } = await supabase
      .from('group_members')
      .insert({ group_id: group.id, user_id: userId, role: 'member' })
    if (iErr) return Response.json({ error: iErr.message }, { status: 500 })

    return Response.json({ group: group })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
