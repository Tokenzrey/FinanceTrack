## Task 10: UX Hidup — Mengetik, Reaksi, Menu Command

R10. Bot berhenti terasa seperti endpoint dan mulai terasa seperti lawan bicara: reaksi 👀 langsung saat pesan masuk, indikator "mengetik…" selama Gemini bekerja, ✅ saat selesai, dan menu command Telegram yang bisa di-autocomplete.

**Files:**
- Modify: `src/app/api/bot/whatsapp/route.ts`
- Modify: `src/app/api/bot/telegram/route.ts`
- Test: `src/app/api/bot/whatsapp-message.test.ts`, `src/app/api/bot/telegram-callback.test.ts` (tambah blok baru)
- Create: `scripts/register-telegram-commands.mjs`

**Interfaces:**
- Tidak ada export baru — semuanya internal ke masing-masing route.

- [ ] **Step 1: Tulis test yang gagal untuk WhatsApp**

Tambahkan ke `src/app/api/bot/whatsapp-message.test.ts`:

```ts
  it('acknowledges the message with a reaction and a typing indicator before working', async () => {
    await POST(
      req({
        event: 'message',
        device_id: '628987654321@s.whatsapp.net',
        payload: {
          id: 'msg-live', chat_id: '628123456789@s.whatsapp.net', from: '628123456789@s.whatsapp.net',
          timestamp: '2026-09-01T10:00:00Z', is_from_me: false, body: 'ringkasan',
        },
      }),
    )
    await flush()

    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0] as string)
    expect(calls.some((u) => u.endsWith('/message/msg-live/reaction'))).toBe(true)
    expect(calls.some((u) => u.endsWith('/send/chat-presence'))).toBe(true)
    // The reply must still go out.
    expect(calls.some((u) => u.endsWith('/send/message'))).toBe(true)
  })

  it('stops the typing indicator after replying', async () => {
    await POST(
      req({
        event: 'message', device_id: '628987654321@s.whatsapp.net',
        payload: {
          id: 'msg-live2', chat_id: '628123456789@s.whatsapp.net', from: '628123456789@s.whatsapp.net',
          timestamp: '2026-09-01T10:00:00Z', is_from_me: false, body: 'ringkasan',
        },
      }),
    )
    await flush()

    const presence = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
      .filter((c) => (c[0] as string).endsWith('/send/chat-presence'))
      .map((c) => JSON.parse((c[1] as { body: string }).body).action)
    expect(presence).toEqual(['start', 'stop'])
  })

  it('never fails the pipeline when a presence or reaction call errors', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/reaction') || url.includes('/chat-presence')) {
        return Promise.reject(new Error('gowa down'))
      }
      return Promise.resolve({ ok: true, json: async () => ({}) })
    }) as unknown as typeof fetch

    await POST(
      req({
        event: 'message', device_id: '628987654321@s.whatsapp.net',
        payload: {
          id: 'msg-live3', chat_id: '628123456789@s.whatsapp.net', from: '628123456789@s.whatsapp.net',
          timestamp: '2026-09-01T10:00:00Z', is_from_me: false, body: 'ringkasan',
        },
      }),
    )
    await flush()

    expect(handleIncoming).toHaveBeenCalledTimes(1)
  })
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run src/app/api/bot/whatsapp-message.test.ts`
Expected: FAIL — tidak ada panggilan `/reaction` atau `/chat-presence`.

- [ ] **Step 3: Implementasi di route WhatsApp**

Di `src/app/api/bot/whatsapp/route.ts`, tambahkan helper di atas `processMessage`:

```ts
function gowaAuth(): { baseUrl: string; authHeader: string } | null {
  const baseUrl = process.env.GOWA_BASE_URL
  const user = process.env.GOWA_BASIC_AUTH_USER
  const password = process.env.GOWA_BASIC_AUTH_PASSWORD
  if (!baseUrl || !user || !password) return null
  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    authHeader: `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`,
  }
}

/**
 * Fire-and-forget acknowledgements. None of these are worth failing a transaction
 * over — a dropped typing indicator is invisible, a dropped reply is not — so every
 * one of them swallows its own error.
 */
async function gowaPost(path: string, body: Record<string, unknown>): Promise<void> {
  const auth = gowaAuth()
  if (!auth) return
  try {
    await fetch(`${auth.baseUrl}${path}`, {
      method: 'POST',
      headers: { Authorization: auth.authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (error) {
    console.error(`whatsapp (gowa) ${path} error:`, error)
  }
}

/** WhatsApp shows this for a few seconds; GOWA needs an explicit stop. */
function setTyping(chatId: string, action: 'start' | 'stop'): Promise<void> {
  return gowaPost('/send/chat-presence', { phone: chatId, action })
}

/** 👀 on arrival, ✅ when the reply is out — the cheapest possible "I heard you". */
function react(messageId: string, chatId: string, emoji: string): Promise<void> {
  return gowaPost(`/message/${encodeURIComponent(messageId)}/reaction`, { phone: chatId, emoji })
}
```

Bungkus `processMessage`:

```ts
async function processMessage(payload: GowaMessage): Promise<void> {
  if (!payload.chat_id) return
  const externalId = stripJidSuffix(payload.chat_id)

  await react(payload.id, payload.chat_id, '👀')
  await setTyping(payload.chat_id, 'start')

  try {
    let incoming: BotIncoming | null = null

    if (payload.image) {
      const image = await downloadWhatsAppMedia(payload.id, payload.chat_id)
      incoming = {
        platform: 'whatsapp',
        externalId,
        kind: 'image',
        imageBase64: image.base64,
        mimeType: image.mimeType,
        caption: imageCaption(payload.image),
      }
    } else if (payload.body) {
      incoming = { platform: 'whatsapp', externalId, kind: 'text', text: payload.body }
    }

    if (incoming) {
      const reply = await handleIncoming(incoming)
      await sendMessage(payload.chat_id, reply)
      await react(payload.id, payload.chat_id, '✅')
    }
  } catch (error) {
    console.error('whatsapp (gowa) webhook message error:', error)
    await sendMessage(payload.chat_id, { text: 'Ada masalah di sisi kami — coba lagi sebentar lagi.' })
  } finally {
    await setTyping(payload.chat_id, 'stop')
  }
}
```

- [ ] **Step 4: Tulis test yang gagal untuk Telegram**

Tambahkan ke `src/app/api/bot/telegram-callback.test.ts`:

```ts
describe('Telegram webhook — live acknowledgements', () => {
  it('sends a typing action and a reaction before the reply', async () => {
    await POST(req({ update_id: 20, message: { chat: { id: 7 }, message_id: 55, text: 'ringkasan' } }))
    await flush()
    const methods = calledMethods()
    expect(methods).toContain('sendChatAction')
    expect(methods).toContain('setMessageReaction')
    expect(methods).toContain('sendMessage')
    expect(methods.indexOf('sendChatAction')).toBeLessThan(methods.indexOf('sendMessage'))
  })

  it('survives a failing reaction call and still replies', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) =>
      url.includes('setMessageReaction')
        ? Promise.reject(new Error('reaction not allowed'))
        : Promise.resolve({ ok: true, json: async () => ({}) }),
    ) as unknown as typeof fetch

    await POST(req({ update_id: 21, message: { chat: { id: 7 }, message_id: 56, text: 'ringkasan' } }))
    await flush()
    expect(calledMethods()).toContain('sendMessage')
  })
})
```

- [ ] **Step 5: Implementasi di route Telegram**

Di `src/app/api/bot/telegram/route.ts`, tambahkan `message_id?: number` ke tipe `TelegramUpdate['message']`, lalu helper:

```ts
/** Best-effort acknowledgements: a rejected reaction (Telegram limits which emoji are
 *  allowed, and group admins can disable them) must never cost the user their reply. */
async function sendChatAction(chatId: number): Promise<void> {
  await callTelegram('sendChatAction', { chat_id: chatId, action: 'typing' })
}

async function reactTo(chatId: number, messageId: number, emoji: string): Promise<void> {
  await callTelegram('setMessageReaction', {
    chat_id: chatId,
    message_id: messageId,
    reaction: [{ type: 'emoji', emoji }],
  })
}
```

`callTelegram` sudah menelan errornya sendiri, jadi tidak perlu try/catch tambahan.

Di awal `handleTextOrPhotoMessage`:

```ts
  const chatId = message.chat.id
  await sendChatAction(chatId)
  if (message.message_id) await reactTo(chatId, message.message_id, '👀')
```

dan setelah `await sendMessage(chatId, reply)` yang berhasil:

```ts
      if (message.message_id) await reactTo(chatId, message.message_id, '✅')
```

- [ ] **Step 6: Jalankan test kedua route**

Run: `npx vitest run src/app/api/bot`
Expected: PASS.

- [ ] **Step 7: Skrip pendaftaran menu command Telegram**

Buat `scripts/register-telegram-commands.mjs`:

```js
#!/usr/bin/env node
/**
 * One-shot registration of the Telegram command menu. Run again after adding or
 * renaming a command — Telegram stores the list on its side, not ours.
 *
 *   TELEGRAM_BOT_TOKEN=123:abc node scripts/register-telegram-commands.mjs
 */

const token = process.env.TELEGRAM_BOT_TOKEN
if (!token) {
  console.error('TELEGRAM_BOT_TOKEN is not set.')
  process.exit(1)
}

// Telegram caps descriptions at 256 chars but shows far fewer; keep them under 40.
const commands = [
  { command: 'help', description: 'Semua yang bisa dilakukan bot ini' },
  { command: 'ringkasan', description: 'Ringkasan anggaran bulan ini' },
  { command: 'saldo', description: 'Sisa anggaran per pilar' },
  { command: 'hariini', description: 'Pengeluaran hari ini' },
  { command: 'minggu', description: 'Pengeluaran 7 hari terakhir' },
  { command: 'riwayat', description: '5 transaksi terakhir' },
  { command: 'cari', description: 'Cari transaksi, mis. /cari kopi' },
  { command: 'tahunan', description: 'Ringkasan tahun berjalan' },
  { command: 'statistik', description: 'Rata-rata harian & kategori teratas' },
  { command: 'target', description: 'Target tabungan & progres' },
  { command: 'setor', description: 'Setor dana ke target tabungan' },
  { command: 'kekayaan', description: 'Kekayaan bersih terkini' },
  { command: 'rutin', description: 'Transaksi rutin aktif' },
  { command: 'wishlist', description: 'Wishlist & kelayakan beli' },
  { command: 'kategori', description: 'Daftar kategori aktif' },
  { command: 'undo', description: 'Batalkan pencatatan terakhir' },
  { command: 'batal', description: 'Batalkan konfirmasi yang tertunda' },
  { command: 'putuskan', description: 'Putuskan tautan akun ini' },
]

async function call(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!data.ok) throw new Error(`${method} failed: ${JSON.stringify(data)}`)
  console.log(`${method}: ok`)
}

await call('setMyCommands', { commands })
await call('setChatMenuButton', { menu_button: { type: 'commands' } })
await call('setMyDescription', {
  description:
    'Catat keuanganmu langsung dari chat. Ketik "makan siang 35rb", kirim foto struk, ' +
    'atau pakai /help untuk melihat semua perintah.',
})
await call('setMyShortDescription', { short_description: 'Pencatat keuangan pribadi FinanceTrack.' })
```

Jalankan sekali:

```bash
TELEGRAM_BOT_TOKEN=<token> node scripts/register-telegram-commands.mjs
```

Expected: empat baris `ok`. Verifikasi di Telegram: tombol ☰ muncul dan mengetik `/` menampilkan daftarnya.

- [ ] **Step 8: Commit**

```bash
npx tsc --noEmit && npx vitest run src/app/api/bot
git add src/app/api/bot/whatsapp/route.ts src/app/api/bot/telegram/route.ts src/app/api/bot/whatsapp-message.test.ts src/app/api/bot/telegram-callback.test.ts scripts/register-telegram-commands.mjs
git commit -m "feat(bot): live acknowledgements and a Telegram command menu

A receipt takes 10-25s through Gemini vision. With nothing on screen the bot reads as
broken, so it now reacts 👀 on arrival, shows a typing indicator while it works, and
switches to ✅ when the reply lands.

Every acknowledgement swallows its own error: Telegram restricts which emoji may be
used as reactions and admins can disable them outright, and a dropped indicator must
never cost the user their reply.

register-telegram-commands.mjs registers the command menu, bot description, and the
☰ button — Telegram stores that list on its side, so it is a one-shot script."
```

---

