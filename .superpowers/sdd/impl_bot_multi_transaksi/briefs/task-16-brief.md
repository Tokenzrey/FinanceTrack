## Task 16: Latensi — Kerja Paralel & Placeholder yang Diedit

R13. Dua perubahan, dua kali menang: hilangkan penantian berurutan yang tidak perlu, dan hentikan layar kosong selama Gemini bekerja.

**Files:**
- Modify: `src/shared/bot/flow-write.ts` (paralelkan ekstraksi & unggah Drive)
- Modify: `src/app/api/bot/whatsapp/route.ts` (kirim placeholder → edit)
- Modify: `src/app/api/bot/telegram/route.ts` (idem)
- Modify: `src/shared/bot/replies.ts` (`receiptReceived`)
- Test: kedua file test route

- [ ] **Step 1: Paralelkan yang memang tidak saling bergantung**

`uploadReceiptForUser` tidak butuh hasil `extractReceipt` — ia hanya butuh byte-nya, yang sudah ada. Menjalankannya berurutan membuang 2–5 detik pada setiap struk.

Di `handlePhoto`:

```ts
  // The Drive upload does not depend on the extraction — it only needs the bytes,
  // which are already in hand. Running them in series wasted 2-5s on every receipt.
  const [result, uploaded] = await Promise.all([
    readReceipt(),          // cache lookup + extractReceipt, as written in Task 15
    uploadReceiptForUser(userId, base64ToBlob(msg.imageBase64, msg.mimeType), `struk-${Date.now()}.jpg`),
  ])
```

Karena `readReceipt()` bisa mengembalikan balasan error (bukan lempar), bungkus jadi discriminated result agar `Promise.all` tetap rapi:

```ts
type ReadOutcome = { ok: true; result: ReceiptScanResult } | { ok: false; reply: BotReply }

async function readReceipt(
  userId: string,
  msg: Extract<BotIncoming, { kind: 'image' }>,
  spendCategories: Category[],
  hints: CategoryHint[],
): Promise<ReadOutcome> {
  const imageKey = hashImage(msg.imageBase64)
  const cached = await adminData.getCachedReceipt(userId, imageKey)
  if (cached) return { ok: true, result: cached }

  try {
    const result = await extractReceipt(
      msg.imageBase64,
      msg.mimeType,
      spendCategories.map((c) => ({ id: c.id, name: c.name, pillar: c.pillar })),
      hints,
      msg.caption,
    )
    if (result.totalConfidence >= 20 && result.extraction.total > 0) {
      await adminData.saveCachedReceipt(userId, imageKey, stripForCache(result))
    }
    return { ok: true, result }
  } catch (error) {
    console.error('bot readReceipt error:', error)
    return { ok: false, reply: isAiQuotaOrOverloadError(error) ? replies.aiUnavailable() : replies.genericError() }
  }
}
```

Lalu di `handlePhoto`:

```ts
  const [outcome, uploaded] = await Promise.all([
    readReceipt(userId, msg, spendCategories, hints),
    uploadReceiptForUser(userId, base64ToBlob(msg.imageBase64, msg.mimeType), `struk-${Date.now()}.jpg`),
  ])
  if (!outcome.ok) return outcome.reply
  const result = outcome.result
```

> Konsekuensi yang disengaja: kalau ekstraksi gagal, fotonya sudah terlanjur naik ke Drive. Itu bukan sampah — user masih punya fotonya di `FinTrack/Receipts`, dan alternatifnya (menunggu ekstraksi selesai dulu) membayar 2–5 detik pada **setiap** struk demi merapikan kasus yang jarang.

- [ ] **Step 2: Balasan placeholder**

Tambahkan ke `replies.ts`:

```ts
  receiptReceived: (): BotReply =>
    reply('📸 <b>Struk diterima.</b>\n<i>Sedang dibaca…</i>'),
```

- [ ] **Step 3: Placeholder yang diedit — WhatsApp**

GOWA mendukung sunting pesan: `POST /message/{id}/update` dengan `{phone, message}` (terverifikasi di `domains/message/message.go` → `UpdateMessageRequest`).

Di `src/app/api/bot/whatsapp/route.ts`, ubah `sendMessage` agar mengembalikan id, dan tambahkan penyunting:

```ts
/** Returns the sent message's id so a placeholder can later be edited in place. */
async function sendMessage(chatId: string, reply: BotReply): Promise<string | null> {
  const auth = gowaAuth()
  if (!auth) return null
  try {
    const res = await fetch(`${auth.baseUrl}/send/message`, {
      method: 'POST',
      headers: { Authorization: auth.authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: chatId, message: renderForWhatsApp(reply) }),
    })
    const body = (await res.json()) as { results?: { message_id?: string } }
    return body.results?.message_id ?? null
  } catch (error) {
    console.error('whatsapp (gowa) sendMessage error:', error)
    return null
  }
}

/** WhatsApp allows editing your own message for about 15 minutes — far longer than any
 *  receipt read takes. Falls back to a fresh message if the edit is refused. */
async function editMessage(chatId: string, messageId: string, reply: BotReply): Promise<void> {
  const auth = gowaAuth()
  if (!auth) return
  try {
    const res = await fetch(`${auth.baseUrl}/message/${encodeURIComponent(messageId)}/update`, {
      method: 'POST',
      headers: { Authorization: auth.authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: chatId, message: renderForWhatsApp(reply) }),
    })
    if (!res.ok) await sendMessage(chatId, reply)
  } catch (error) {
    console.error('whatsapp (gowa) editMessage error:', error)
    await sendMessage(chatId, reply)
  }
}
```

Di `processMessage`:

```ts
    let placeholderId: string | null = null

    if (payload.image) {
      // Only photos are slow enough to need a placeholder; text usually answers from
      // the local layer before a placeholder would even render.
      placeholderId = await sendMessage(payload.chat_id, replies.receiptReceived())
      const image = await downloadWhatsAppMedia(payload.id, payload.chat_id)
      incoming = { platform: 'whatsapp', externalId, kind: 'image', imageBase64: image.base64, mimeType: image.mimeType, caption: imageCaption(payload.image) }
    } else if (payload.body) {
      incoming = { platform: 'whatsapp', externalId, kind: 'text', text: payload.body }
    }

    if (incoming) {
      const reply = await handleIncoming(incoming)
      if (placeholderId) await editMessage(payload.chat_id, placeholderId, reply)
      else await sendMessage(payload.chat_id, reply)
      await react(payload.id, payload.chat_id, '✅')
    }
```

Tambahkan `import { replies } from '@/shared/bot/replies'` ke route.

- [ ] **Step 4: Placeholder yang diedit — Telegram**

`callTelegram` harus mengembalikan hasilnya:

```ts
async function callTelegram(method: string, payload: Record<string, unknown>): Promise<unknown> {
  const token = botToken()
  if (!token) return null
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return await res.json()
  } catch (error) {
    console.error(`telegram ${method} error:`, error)
    return null
  }
}

async function sendMessageReturningId(chatId: number, reply: BotReply): Promise<number | null> {
  const body = (await callTelegram('sendMessage', {
    chat_id: chatId,
    text: reply.text,
    parse_mode: reply.html === false ? undefined : 'HTML',
    reply_markup: toReplyMarkup(reply),
  })) as { ok?: boolean; result?: { message_id?: number } } | null
  return body?.ok ? (body.result?.message_id ?? null) : null
}
```

Di `handleTextOrPhotoMessage`:

```ts
    let placeholderId: number | null = null

    if (message.photo && message.photo.length > 0) {
      placeholderId = await sendMessageReturningId(chatId, replies.receiptReceived())
      const largest = message.photo[message.photo.length - 1]
      const image = await downloadTelegramPhoto(largest.file_id)
      incoming = { platform: 'telegram', externalId: String(chatId), kind: 'image', imageBase64: image.base64, mimeType: image.mimeType, caption: message.caption }
    } else if (typeof message.text === 'string') {
      incoming = { platform: 'telegram', externalId: String(chatId), kind: 'text', text: message.text }
    }

    if (incoming) {
      const reply = await handleIncoming(incoming)
      if (placeholderId) await editMessage(chatId, placeholderId, reply)
      else await sendMessage(chatId, reply)
      if (message.message_id) await reactTo(chatId, message.message_id, '✅')
    }
```

`editMessage` sudah ada di route Telegram (dipakai alur callback) — tidak perlu ditulis ulang.

- [ ] **Step 5: Test placeholder di kedua route**

Ke `whatsapp-message.test.ts`:

```ts
  it('sends a placeholder for a photo and edits it into the final reply', async () => {
    downloadWhatsAppMedia.mockResolvedValue({ base64: 'ZmFrZQ==', mimeType: 'image/jpeg' })
    handleIncoming.mockResolvedValue({ text: 'Tinjau 2 Transaksi', html: true })

    await POST(req({
      event: 'message', device_id: 'd@s.whatsapp.net',
      payload: { id: 'm1', chat_id: '628@s.whatsapp.net', from: '628@s.whatsapp.net', timestamp: 't', is_from_me: false, body: '', image: 'statics/media/x.jpg' },
    }))
    await flush()

    const urls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0] as string)
    expect(urls.filter((u) => u.endsWith('/send/message'))).toHaveLength(1) // the placeholder only
    expect(urls.some((u) => u.includes('/update'))).toBe(true)
  })

  it('sends no placeholder for a plain text message', async () => {
    await POST(req({
      event: 'message', device_id: 'd@s.whatsapp.net',
      payload: { id: 'm2', chat_id: '628@s.whatsapp.net', from: '628@s.whatsapp.net', timestamp: 't', is_from_me: false, body: 'ringkasan' },
    }))
    await flush()
    const urls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0] as string)
    expect(urls.some((u) => u.includes('/update'))).toBe(false)
  })

  it('falls back to a fresh message when the edit is refused', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) =>
      url.includes('/update')
        ? Promise.resolve({ ok: false, status: 400, json: async () => ({}) })
        : Promise.resolve({ ok: true, json: async () => ({ results: { message_id: 'ph1' } }) }),
    ) as unknown as typeof fetch
    downloadWhatsAppMedia.mockResolvedValue({ base64: 'ZmFrZQ==', mimeType: 'image/jpeg' })

    await POST(req({
      event: 'message', device_id: 'd@s.whatsapp.net',
      payload: { id: 'm3', chat_id: '628@s.whatsapp.net', from: '628@s.whatsapp.net', timestamp: 't', is_from_me: false, body: '', image: 'statics/media/x.jpg' },
    }))
    await flush()

    const sends = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter((c) => (c[0] as string).endsWith('/send/message'))
    expect(sends.length).toBeGreaterThanOrEqual(2) // placeholder + fallback
  })
```

Ke `telegram-callback.test.ts`:

```ts
  it('sends a placeholder for a photo and edits it in place', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, result: { message_id: 900 } }) }) as unknown as typeof fetch

    await POST(req({ update_id: 30, message: { chat: { id: 7 }, message_id: 60, photo: [{ file_id: 'f1' }] } }))
    await flush()

    const methods = calledMethods()
    expect(methods).toContain('sendMessage')
    expect(methods).toContain('editMessageText')
  })
```

> `downloadTelegramPhoto` perlu di-mock di file ini seperti `media-whatsapp` di-mock di sisi WhatsApp.

- [ ] **Step 6: Jalankan & commit**

Run: `npx vitest run src/app/api/bot src/shared/bot && npx tsc --noEmit`

```bash
git add src/shared/bot/flow-write.ts src/shared/bot/replies.ts src/app/api/bot/whatsapp/route.ts src/app/api/bot/telegram/route.ts src/app/api/bot/whatsapp-message.test.ts src/app/api/bot/telegram-callback.test.ts
git commit -m "perf(bot): parallel receipt work and a placeholder edited in place

The Drive upload never depended on the extraction — it only needs the bytes, which are
already in hand. Running them in series wasted 2-5s on every single receipt.

A photo now gets an immediate 'Struk diterima, sedang dibaca…' that is edited into the
review card when the read finishes. Both platforms support it: Telegram via
editMessageText, WhatsApp via GOWA's POST /message/:id/update. Text messages get no
placeholder — the local layer usually answers before one would render.

An edit that is refused falls back to a fresh message, so a stale placeholder can
never be the last thing the user sees."
```

---

