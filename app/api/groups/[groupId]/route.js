import { createClient } from '@supabase/supabase-js'

export const maxDuration = 15

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

const TITLES = {
  1: '新米研修医', 2: '駆け出し研修医', 3: '独り立ち研修医', 4: '中堅研修医', 5: '研修修了者',
  6: '新米専攻医', 7: '若手専攻医', 8: '中堅専攻医', 9: '精鋭専攻医', 10: 'ベテラン専攻医',
  11: '新米指導医', 12: '若手指導医', 13: '中堅指導医', 14: '熟練指導医', 15: 'ベテラン指導医',
  16: '鉄壁のジェネラリスト', 17: '不朽のジェネラリスト', 18: '無双のジェネラリスト', 19: '至高のジェネラリスト', 20: '伝説のジェネラリスト',
}

function computeRank(passCount, completedDiseases) {
  if (passCount < 25) {
    return Math.min(5, Math.floor(passCount / 5) + 1)
  }
  if (completedDiseases < 5) return 5
  if (passCount < 60) {
    return Math.min(10, 6 + Math.floor((passCount - 25) / 7))
  }
  if (completedDiseases < 10) return 10
  if (passCount < 110) {
    return Math.min(15, 11 + Math.floor((passCount - 60) / 10))
  }
  if (completedDiseases < 15) return 15
  return Math.min(20, 16 + Math.floor((passCount - 110) / 10))
}

export async function GET(req, { params }) {
  try {
    const { groupId } = await params
    const url = new URL(req.url)
    const userId = url.searchParams.get('userId')
    if (!groupId) return Response.json({ error: 'groupId required' }, { status: 400 })
    const supabase = getAdminClient()

    // グループ情報
    const { data: group, error: gErr } = await supabase
      .from('groups').select('*').eq('id', groupId).maybeSingle()
    if (gErr) return Response.json({ error: gErr.message }, { status: 500 })
    if (!group) return Response.json({ error: 'group not found' }, { status: 404 })

    // メンバー一覧（profile 結合）
    const { data: members, error: mErr } = await supabase
      .from('group_members')
      .select('user_id, role, joined_at')
      .eq('group_id', groupId)
    if (mErr) return Response.json({ error: mErr.message }, { status: 500 })

    const memberIds = (members || []).map(function(m) { return m.user_id })
    if (memberIds.length === 0) {
      return Response.json({ group: group, members: [] })
    }

    // プロフィール取得
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('user_id, real_name, handle_name, display_preference, last_active_at')
      .in('user_id', memberIds)
    const profileMap = {}
    ;(profiles || []).forEach(function(p) { profileMap[p.user_id] = p })

    // 全メンバーの完遂症例を一括取得
    const { data: allCases } = await supabase
      .from('cases')
      .select('user_id, model_case_id, final_score, completed_at')
      .in('user_id', memberIds)
      .not('completed_at', 'is', null)

    // 全モデル症例（疾患別カバレッジ計算用）
    const { data: allModelCases } = await supabase
      .from('model_cases').select('id, disease_id')
    const byDisease = {}
    ;(allModelCases || []).forEach(function(mc) {
      if (!byDisease[mc.disease_id]) byDisease[mc.disease_id] = []
      byDisease[mc.disease_id].push(mc.id)
    })
    const diseaseIds = Object.keys(byDisease)

    // 全メンバーの挑戦症例数（completed_at IS NULL も含めた合計件数 = 挑戦数？）
    // 仕様: 「挑戦症例数」= 開始した全症例 = cases テーブルでこのユーザーの全行
    const { data: allChallenges } = await supabase
      .from('cases')
      .select('user_id')
      .in('user_id', memberIds)
    const challengeCountMap = {}
    ;(allChallenges || []).forEach(function(c) {
      challengeCountMap[c.user_id] = (challengeCountMap[c.user_id] || 0) + 1
    })

    // メンバーごとに stats 計算
    const enriched = (members || []).map(function(m) {
      const profile = profileMap[m.user_id] || null
      const userCases = (allCases || []).filter(function(c) { return c.user_id === m.user_id })
      const passedCases = userCases.filter(function(c) { return c.final_score !== null && c.final_score >= 80 })
      const passCount = passedCases.length

      const passedModelCaseIds = new Set(
        passedCases.filter(function(c) { return c.model_case_id !== null }).map(function(c) { return c.model_case_id })
      )
      const completedDiseases = diseaseIds.filter(function(did) {
        return byDisease[did].every(function(mcid) { return passedModelCaseIds.has(mcid) })
      }).length

      const rank = computeRank(passCount, completedDiseases)
      const displayName = profile
        ? (profile.display_preference === 'handle_name' && profile.handle_name
            ? profile.handle_name
            : profile.real_name)
        : '名前未設定'

      return {
        user_id: m.user_id,
        role: m.role,
        joined_at: m.joined_at,
        display_name: displayName,
        has_profile: !!profile,
        challenge_count: challengeCountMap[m.user_id] || 0,
        pass_count: passCount,
        completed_diseases: completedDiseases,
        rank: rank,
        title: TITLES[rank],
        last_active_at: profile ? profile.last_active_at : null,
      }
    })

    // 自分が管理者かどうか
    const isAdmin = userId
      ? (members || []).some(function(m) { return m.user_id === userId && m.role === 'admin' })
      : false

    return Response.json({
      group: group,
      members: enriched,
      isAdmin: isAdmin,
    })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}

// グループ解散（管理者のみ）
export async function DELETE(req, { params }) {
  try {
    const { groupId } = await params
    const url = new URL(req.url)
    const userId = url.searchParams.get('userId')
    if (!groupId || !userId) {
      return Response.json({ error: 'groupId and userId required' }, { status: 400 })
    }
    const supabase = getAdminClient()

    // 管理者かチェック
    const { data: membership } = await supabase
      .from('group_members')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .maybeSingle()
    if (!membership || membership.role !== 'admin') {
      return Response.json({ error: '管理者権限が必要です' }, { status: 403 })
    }

    const { error } = await supabase.from('groups').delete().eq('id', groupId)
    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ ok: true })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
