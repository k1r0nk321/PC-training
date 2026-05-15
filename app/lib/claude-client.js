import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// 過負荷・レート制限エラー時に指数バックオフでリトライする messages.create ラッパー
export async function claudeCreate(params, options) {
  const maxRetries = (options && options.maxRetries) || 3
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
      if (!isOverloaded && !isRateLimit) throw e
      if (i === maxRetries - 1) throw e
      // 指数バックオフ: 1.5秒 → 3秒 → 6秒
      const waitMs = 1500 * Math.pow(2, i)
      await new Promise(function(r) { setTimeout(r, waitMs) })
    }
  }
  throw lastErr
}

// ユーザー向けエラーメッセージ
export function anthropicErrorMessage(e) {
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
    return '[認証エラー] API キーまたは権限の問題があります。'
  }
  return '[エラー] ' + (e.message || '不明なエラー')
}
