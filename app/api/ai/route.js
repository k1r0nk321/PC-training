import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// 過負荷エラー時にリトライ（指数バックオフ）
async function callWithRetry(params, maxRetries) {
  if (typeof maxRetries !== 'number') maxRetries = 3
  let lastErr
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await client.messages.create(params)
    } catch (e) {
      lastErr = e
      const status = e.status || e.statusCode || 0
      const errType = (e.error && e.error.type) || ''
      const isOverloaded = status === 529 || status === 503 || status === 502 || errType === 'overloaded_error'
      const isRateLimit = status === 429 || errType === 'rate_limit_error'
      // リトライ可能エラー以外は即座に throw
      if (!isOverloaded && !isRateLimit) throw e
      // 最後の試行で失敗していれば throw
      if (i === maxRetries - 1) throw e
      // バックオフ: 1.5s → 3s → 6s
      const waitMs = 1500 * Math.pow(2, i)
      await new Promise(function(r) { setTimeout(r, waitMs) })
    }
  }
  throw lastErr
}

function friendlyErrorMessage(e) {
  const status = e.status || e.statusCode || 0
  const errType = (e.error && e.error.type) || ''
  if (status === 529 || errType === 'overloaded_error') {
    return '[サーバー混雑中] AI が一時的に混み合っています。30秒ほどお待ちいただき、もう一度お試しください。'
  }
  if (status === 503 || status === 502) {
    return '[サーバー一時障害] 少し時間を空けて再度お試しください。'
  }
  if (status === 429 || errType === 'rate_limit_error') {
    return '[リクエスト過多] 短時間に多くのリクエストが行われました。1分ほど待ってからお試しください。'
  }
  if (status === 401 || status === 403) {
    return '[認証エラー] API キーまたは権限の問題があります。管理者にお問い合わせください。'
  }
  return '[エラー] ' + (e.message || '不明なエラーが発生しました。')
}

export async function POST(req) {
  try {
    const { prompt, history = [], system } = await req.json()

    const message = await callWithRetry({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system,
      messages: [...history, { role: 'user', content: prompt }],
    })

    const text = message.content?.[0]?.text || ''
    return Response.json({ text })

  } catch (e) {
    return Response.json({ text: friendlyErrorMessage(e) }, { status: 500 })
  }
}
