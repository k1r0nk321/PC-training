import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req) {
  try {
    const { prompt, history = [], system } = await req.json()

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system,
      messages: [...history, { role: 'user', content: prompt }],
    })

    const text = message.content?.[0]?.text || ''
    return Response.json({ text })

  } catch (e) {
    return Response.json({ text: '[エラー] ' + e.message }, { status: 500 })
  }
}
