import { createClient } from '@supabase/supabase-js'

export const maxDuration = 10

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

function generateInviteCode() {
  // 8 文字英数字（紛らわしい O/0, I/1/l 除外）
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

// ユーザーが所属するグループ一覧
export async function GET(req) {
  try {
    const url = new URL(req.url)
    const userId = url.searchParams.get('userId')
    if (!userId) return Response.json({ error: 'userId required' }, { status: 400 })
    const supabase = getAdminClient()

    const { data: memberships, error } = await supabase
      .from('group_members')
      .select('group_id, role, joined_at, groups(id, name, description, invite_code, created_by, created_at)')
      .eq('user_id', userId)
      .order('joined_at', { ascending: false })

    if (error) return Response.json({ error: error.message }, { status: 500 })

    const groups = (memberships || []).map(function(m) {
      return {
        ...m.groups,
        my_role: m.role,
        joined_at: m.joined_at,
      }
    })

    // メンバー数を別途集計
    if (groups.length > 0) {
      const groupIds = groups.map(function(g) { return g.id })
      const { data: counts } = await supabase
        .from('group_members')
        .select('group_id')
        .in('group_id', groupIds)
      const countMap = {}
      ;(counts || []).forEach(function(c) {
        countMap[c.group_id] = (countMap[c.group_id] || 0) + 1
      })
      groups.forEach(function(g) { g.member_count = countMap[g.id] || 0 })
    }

    return Response.json({ groups: groups })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}

// グループ新規作成（作成者は admin として参加）
export async function POST(req) {
  try {
    const body = await req.json()
    const { userId, name, description } = body
    if (!userId || !name || name.trim() === '') {
      return Response.json({ error: 'userId and name required' }, { status: 400 })
    }
    if (name.trim().length > 30) {
      return Response.json({ error: 'name too long (max 30 chars)' }, { status: 400 })
    }
    const supabase = getAdminClient()

    // 重複しない invite_code を生成（最大 10 試行）
    let inviteCode = null
    for (let i = 0; i < 10; i++) {
      const candidate = generateInviteCode()
      const { data: existing } = await supabase
        .from('groups').select('id').eq('invite_code', candidate).maybeSingle()
      if (!existing) { inviteCode = candidate; break }
    }
    if (!inviteCode) {
      return Response.json({ error: 'failed to generate unique invite code' }, { status: 500 })
    }

    const { data: newGroup, error: gErr } = await supabase
      .from('groups')
      .insert({
        name: name.trim(),
        description: description ? description.trim() : null,
        invite_code: inviteCode,
        created_by: userId,
      })
      .select()
      .single()

    if (gErr) return Response.json({ error: gErr.message }, { status: 500 })

    // 作成者を admin として追加
    const { error: mErr } = await supabase
      .from('group_members')
      .insert({ group_id: newGroup.id, user_id: userId, role: 'admin' })

    if (mErr) return Response.json({ error: mErr.message }, { status: 500 })

    return Response.json({ group: newGroup })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
