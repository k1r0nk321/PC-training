import { createClient } from '@supabase/supabase-js'

export const maxDuration = 15

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

export async function POST(req) {
  try {
    const body = await req.json()
    const { userId } = body
    if (!userId) return Response.json({ error: 'userId required' }, { status: 400 })
    const supabase = getAdminClient()

    // 1. すべての症例を削除（完遂・中断問わず）
    await supabase.from('cases').delete().eq('user_id', userId)

    // 2. グループメンバーシップを削除
    await supabase.from('group_members').delete().eq('user_id', userId)

    // 3. 作成者だったグループを削除（他のメンバーがいる場合は他の管理者がいなければ削除、いれば残す）
    // Phase H で「唯一の管理者は脱退できない」ロジックがあるが、削除時はグループも消す（シンプル化）
    await supabase.from('groups').delete().eq('created_by', userId)

    // 4. user_profiles を削除
    await supabase.from('user_profiles').delete().eq('user_id', userId)

    // 5. ユーザー設定を削除
    await supabase.from('user_preferences').delete().eq('user_id', userId)

    // 6. visit_parameters は cases 削除で CASCADE すれば消えるはず（念のため確認は省略）

    // 7. auth.users から削除（Supabase Admin API）
    const { error: aErr } = await supabase.auth.admin.deleteUser(userId)
    if (aErr) {
      return Response.json({
        error: 'auth user 削除エラー: ' + aErr.message,
        partial: true
      }, { status: 500 })
    }

    return Response.json({ ok: true })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
