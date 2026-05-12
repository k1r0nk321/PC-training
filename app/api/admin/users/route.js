import { createClient } from '@supabase/supabase-js'

export const maxDuration = 20

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
    const callerId = url.searchParams.get('userId')
    const supabase = getAdminClient()
    if (!(await isAdminUser(supabase, callerId))) {
      return Response.json({ error: '管理者権限が必要です' }, { status: 403 })
    }

    // 全プロフィールを取得
    const { data: profiles, error: pErr } = await supabase
      .from('user_profiles').select('*').order('last_active_at', { ascending: false, nullsFirst: false })
    if (pErr) return Response.json({ error: pErr.message }, { status: 500 })

    // auth.users から emails を取得 (admin API)
    const { data: { users: authUsers } } = await supabase.auth.admin.listUsers({ perPage: 1000 })
    const emailMap = {}
    const anonMap = {}
    if (authUsers) {
      for (const u of authUsers) {
        emailMap[u.id] = u.email || ''
        anonMap[u.id] = u.is_anonymous === true
      }
    }

    // 全 cases を一括取得（合格・完遂統計用）
    const { data: allCases } = await supabase
      .from('cases')
      .select('user_id, disease_id, final_score, completed_at')
      .not('completed_at', 'is', null)

    const statsByUser = {}
    if (allCases) {
      for (const c of allCases) {
        if (!c.user_id) continue
        if (!statsByUser[c.user_id]) {
          statsByUser[c.user_id] = { total: 0, pass: 0, diseases: new Set() }
        }
        statsByUser[c.user_id].total++
        if (typeof c.final_score === 'number' && c.final_score >= 70) {
          statsByUser[c.user_id].pass++
          if (c.disease_id) statsByUser[c.user_id].diseases.add(c.disease_id)
        }
      }
    }

    const users = (profiles || []).map(function(p) {
      const s = statsByUser[p.user_id] || { total: 0, pass: 0, diseases: new Set() }
      return {
        user_id: p.user_id,
        email: emailMap[p.user_id] || '(unknown)',
        is_anonymous: !!anonMap[p.user_id],
        real_name: p.real_name,
        handle_name: p.handle_name,
        affiliation: p.affiliation,
        position: p.position,
        role: p.role,
        display_preference: p.display_preference,
        terms_agreed_at: p.terms_agreed_at,
        terms_version: p.terms_version,
        last_active_at: p.last_active_at,
        created_at: p.created_at,
        total_completed: s.total,
        pass_count: s.pass,
        completed_diseases: s.diseases.size,
      }
    })

    return Response.json({ users: users })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
