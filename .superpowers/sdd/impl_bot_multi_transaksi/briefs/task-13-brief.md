## Task 13: Preferensi Bot per User

R14 (kustomisasi). Kecil dan berdiri sendiri, tapi dikerjakan **sebelum** Task 14 karena jalur tulis membaca ambang dari sini.

**Files:**
- Modify: `src/shared/bot/types.ts` (`BotPrefs`, `DEFAULT_BOT_PREFS` — bentuknya di §12)
- Modify: `src/shared/bot/admin-data.ts` (`getBotPrefs`, `saveBotPrefs`)
- Create: `src/shared/bot/prefs-commands.ts`
- Test: `src/shared/bot/prefs-commands.test.ts`
- Modify: `src/shared/bot/replies.ts` (`prefsCard`, `prefsUpdated`, `prefsInvalid`)
- Modify: `src/shared/bot/core.ts` (`/mode`, `/atur`)

**Interfaces:**
- Produces: `parsePrefsCommand(text: string): PrefsCommand`
- Produces: `adminData.getBotPrefs(userId): Promise<BotPrefs>`, `adminData.saveBotPrefs(userId, patch: Partial<BotPrefs>): Promise<BotPrefs>`

```ts
export type PrefsCommand =
  | { kind: 'show' }
  | { kind: 'set'; patch: Partial<BotPrefs> }
  | { kind: 'invalid'; field: string }
  | { kind: 'none' }
```

- [ ] **Step 1: Tulis test yang gagal**

Buat `src/shared/bot/prefs-commands.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parsePrefsCommand } from './prefs-commands'

describe('parsePrefsCommand', () => {
  it('shows the current settings for a bare /atur or /mode', () => {
    expect(parsePrefsCommand('/atur')).toEqual({ kind: 'show' })
    expect(parsePrefsCommand('atur')).toEqual({ kind: 'show' })
    expect(parsePrefsCommand('/mode')).toEqual({ kind: 'show' })
  })

  it('sets verbosity from either command form', () => {
    expect(parsePrefsCommand('/mode ringkas')).toEqual({ kind: 'set', patch: { verbosity: 'ringkas' } })
    expect(parsePrefsCommand('/mode detail')).toEqual({ kind: 'set', patch: { verbosity: 'detail' } })
    expect(parsePrefsCommand('/atur mode ringkas')).toEqual({ kind: 'set', patch: { verbosity: 'ringkas' } })
  })

  it('sets the auto-accept threshold and clamps it to 0-100', () => {
    expect(parsePrefsCommand('/atur autoaccept 80')).toEqual({ kind: 'set', patch: { autoAcceptConfidence: 80 } })
    expect(parsePrefsCommand('/atur autoaccept 500')).toEqual({ kind: 'set', patch: { autoAcceptConfidence: 100 } })
  })

  it('sets the boolean switches from natural on/off words', () => {
    expect(parsePrefsCommand('/atur selalutinjau on')).toEqual({ kind: 'set', patch: { alwaysReview: true } })
    expect(parsePrefsCommand('/atur selalutinjau off')).toEqual({ kind: 'set', patch: { alwaysReview: false } })
    expect(parsePrefsCommand('/atur insight mati')).toEqual({ kind: 'set', patch: { showInsights: false } })
    expect(parsePrefsCommand('/atur insight nyala')).toEqual({ kind: 'set', patch: { showInsights: true } })
  })

  it('reports an unknown field instead of silently ignoring it', () => {
    expect(parsePrefsCommand('/atur warna biru')).toEqual({ kind: 'invalid', field: 'warna' })
  })

  it('reports an unparseable value for a known field', () => {
    expect(parsePrefsCommand('/atur autoaccept banyak')).toEqual({ kind: 'invalid', field: 'autoaccept' })
    expect(parsePrefsCommand('/mode cepat')).toEqual({ kind: 'invalid', field: 'mode' })
  })

  it('returns none for anything that is not a settings command', () => {
    expect(parsePrefsCommand('makan siang 35rb')).toEqual({ kind: 'none' })
    expect(parsePrefsCommand('/ringkasan')).toEqual({ kind: 'none' })
  })
})
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run src/shared/bot/prefs-commands.test.ts`
Expected: FAIL — modul belum ada.

- [ ] **Step 3: Implementasi `prefs-commands.ts`**

```ts
import type { BotPrefs } from './types'

/**
 * `/mode` and `/atur` — the user's own knobs on how the bot behaves.
 *
 * Deterministic, like every other command parser here: a settings command that is
 * misread would silently change how transactions get recorded, which is worse than
 * telling the user the word was not understood.
 */

export type PrefsCommand =
  | { kind: 'show' }
  | { kind: 'set'; patch: Partial<BotPrefs> }
  | { kind: 'invalid'; field: string }
  | { kind: 'none' }

const ON = /^(on|nyala|aktif|ya|true|1)$/i
const OFF = /^(off|mati|nonaktif|tidak|false|0)$/i

function boolValue(raw: string): boolean | null {
  if (ON.test(raw)) return true
  if (OFF.test(raw)) return false
  return null
}

function setVerbosity(raw: string): PrefsCommand {
  const word = raw.toLowerCase()
  if (word === 'ringkas' || word === 'singkat') return { kind: 'set', patch: { verbosity: 'ringkas' } }
  if (word === 'detail' || word === 'lengkap') return { kind: 'set', patch: { verbosity: 'detail' } }
  return { kind: 'invalid', field: 'mode' }
}

export function parsePrefsCommand(raw: string): PrefsCommand {
  const text = raw.trim()
  if (!text) return { kind: 'none' }

  const mode = text.match(/^\/?mode(?:\s+(\S+))?$/i)
  if (mode) return mode[1] ? setVerbosity(mode[1]) : { kind: 'show' }

  const atur = text.match(/^\/?(?:atur|pengaturan|setting)(?:\s+(\S+)(?:\s+(.+))?)?$/i)
  if (!atur) return { kind: 'none' }
  if (!atur[1]) return { kind: 'show' }

  const field = atur[1].toLowerCase()
  const value = (atur[2] ?? '').trim()

  if (field === 'mode' || field === 'verbositas') return value ? setVerbosity(value) : { kind: 'invalid', field }

  if (field === 'autoaccept' || field === 'ambang') {
    if (!/^\d{1,3}$/.test(value)) return { kind: 'invalid', field }
    return { kind: 'set', patch: { autoAcceptConfidence: Math.min(100, Math.max(0, Number(value))) } }
  }

  if (field === 'selalutinjau' || field === 'tinjau') {
    const on = boolValue(value)
    return on === null ? { kind: 'invalid', field } : { kind: 'set', patch: { alwaysReview: on } }
  }

  if (field === 'insight' || field === 'insights') {
    const on = boolValue(value)
    return on === null ? { kind: 'invalid', field } : { kind: 'set', patch: { showInsights: on } }
  }

  return { kind: 'invalid', field }
}
```

- [ ] **Step 4: Penyimpanan preferensi**

Tambahkan di `src/shared/bot/admin-data.ts`:

```ts
/** Merged over defaults so a doc written by an older build stays valid, exactly like
 *  `FirestoreUserRepository.findSettings` does for the web app's settings. */
export async function getBotPrefs(userId: string): Promise<BotPrefs> {
  const snap = await getAdminDb().doc(`users/${userId}/meta/botPrefs`).get()
  if (!snap.exists) return DEFAULT_BOT_PREFS
  return { ...DEFAULT_BOT_PREFS, ...(snap.data() as Partial<BotPrefs>) }
}

export async function saveBotPrefs(userId: string, patch: Partial<BotPrefs>): Promise<BotPrefs> {
  await getAdminDb().doc(`users/${userId}/meta/botPrefs`).set(stripUndefined(patch), { merge: true })
  return getBotPrefs(userId)
}
```

- [ ] **Step 5: Balasan preferensi**

Tambahkan ke `replies.ts`:

```ts
  prefsCard: (prefs: BotPrefs): BotReply =>
    reply(
      [
        '⚙️ <b>Pengaturan Bot</b>',
        '',
        `Mode balasan       <b>${prefs.verbosity}</b>`,
        `Ambang auto-simpan <b>${prefs.autoAcceptConfidence}</b>`,
        `Selalu tinjau      <b>${prefs.alwaysReview ? 'nyala' : 'mati'}</b>`,
        `Baris insight      <b>${prefs.showInsights ? 'nyala' : 'mati'}</b>`,
        '',
        '<b>Cara mengubah</b>',
        '<code>/mode ringkas</code> — balasan pendek',
        '<code>/mode detail</code> — balasan lengkap (bawaan)',
        '<code>/atur autoaccept 80</code> — makin tinggi, makin sering ditanya dulu',
        '<code>/atur selalutinjau on</code> — semua transaksi lewat kartu tinjauan',
        '<code>/atur insight off</code> — sembunyikan baris analisis',
      ].join('\n'),
    ),

  prefsUpdated: (prefs: BotPrefs): BotReply =>
    reply(
      `✅ <b>Tersimpan.</b> Mode <b>${prefs.verbosity}</b>, ambang <b>${prefs.autoAcceptConfidence}</b>, ` +
        `selalu tinjau <b>${prefs.alwaysReview ? 'nyala' : 'mati'}</b>.`,
    ),

  prefsInvalid: (field: string): BotReply =>
    reply(
      `🤔 Tidak paham "<b>${escapeHtml(field)}</b>". Ketik <code>/atur</code> untuk melihat daftar pengaturan yang tersedia.`,
    ),
```

- [ ] **Step 6: Sambungkan di `core.ts`**

Sebelum `matchReadCommand`, di `handleIncoming`:

```ts
  const prefsCommand = parsePrefsCommand(trimmed)
  if (prefsCommand.kind !== 'none') {
    if (prefsCommand.kind === 'invalid') return replies.prefsInvalid(prefsCommand.field)
    if (prefsCommand.kind === 'show') return replies.prefsCard(await adminData.getBotPrefs(userId))
    return replies.prefsUpdated(await adminData.saveBotPrefs(userId, prefsCommand.patch))
  }
```

- [ ] **Step 7: Jalankan & commit**

Run: `npx vitest run src/shared/bot && npx tsc --noEmit`
Expected: PASS.

```bash
git add src/shared/bot/prefs-commands.ts src/shared/bot/prefs-commands.test.ts src/shared/bot/types.ts src/shared/bot/admin-data.ts src/shared/bot/replies.ts src/shared/bot/core.ts
git commit -m "feat(bot): per-user bot preferences via /mode and /atur

Verbosity, the auto-accept threshold, always-review, and the insight line are the four
things people actually disagree about. A user who wants every transaction confirmed
sets alwaysReview; a user who trusts it raises autoaccept.

Parsed deterministically like every other command here: a misread settings word would
silently change how transactions get recorded."
```

---

