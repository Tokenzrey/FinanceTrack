// Lists the Gemini models this API key can actually call, with the generate
// actions each one supports. Run before touching DEFAULT_ROSTER in
// src/shared/lib/gemini-router.ts — every id in that roster must appear here.
//
//   GEMINI_API_KEY=<key> node scripts/list-gemini-models.mjs
//
// The free tier meters requests PER MODEL PER DAY, so the point of the roster is
// to spread a day's traffic across every flash / flash-lite model this key sees.

import { GoogleGenAI } from '@google/genai'

const apiKey = process.env.GEMINI_API_KEY ?? process.env.GEMINI_MODEL_LIST_KEY
if (!apiKey) {
  console.error('Set GEMINI_API_KEY before running this script.')
  process.exit(1)
}

const ai = new GoogleGenAI({ apiKey })

// queryBase: true → base models, not the key's tuned models.
const pager = await ai.models.list({ config: { queryBase: true } })

const rows = []
for await (const model of pager) {
  const id = (model.name ?? '').replace(/^models\//, '')
  const actions = model.supportedActions ?? []
  rows.push({ id, actions })
}

rows.sort((a, b) => a.id.localeCompare(b.id))

for (const { id, actions } of rows) {
  const canGenerate = actions.includes('generateContent')
  console.log(`${canGenerate ? '*' : ' '} ${id}\t${actions.join(', ')}`)
}

console.log(`\n${rows.length} models. Rows marked * support generateContent.`)
