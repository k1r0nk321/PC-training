import { createClient } from '@supabase/supabase-js'

export const maxDuration = 10

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

// この症例を「アクティブ」にし、ユーザーの他の中断中症例（未完遂）を全て削除する
export async function POST(req) {
  try {
    const { caseId } = await req.json()
    if (!caseId) {
      return Response.json({ error: 'caseId required' }, { status: 400 })
    }
    const supabase = getAdminClient()

    const { data: thisCase, error: fErr } = await supabase
      .from('cases')
      .select('user_id, completed_at')
      .eq('id', caseId)
      .single()

    if (fErr || !thisCase) {
      return Response.json({ error: 'case not found' }, { status: 404 })
    }

    // 完遂済み症例の場合は削除しない（成績ページから誤って呼ばれた時の保険）
    if (thisCase.completed_at) {
      return Response.json({ ok: true, message: 'case is completed, no cleanup' })
    }

    // 他の中断中症例（未完遂）を全て削除
    const { error: dErr } = await supabase
      .from('cases')
      .delete()
      .eq('user_id', thisCase.user_id)
      .is('completed_at', null)
      .neq('id', caseId)

    if (dErr) {
      return Response.json({ error: dErr.message }, { status: 500 })
    }
    return Response.json({ ok: true })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
