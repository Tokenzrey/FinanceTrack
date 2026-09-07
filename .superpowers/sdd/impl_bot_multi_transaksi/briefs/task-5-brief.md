## Task 5: Caption Gambar sebagai Konteks Ekstraksi

R5. Caption user (misal "struk indomaret, yang buram itu teh botol 2×12rb") masuk ke **kedua** prompt Gemini — ekstraksi dan pemetaan kategori.

**Files:**
- Modify: `src/shared/lib/receipt-extraction.ts` (tanda tangan `extractReceipt`, `EXTRACTION_PROMPT`, `buildMappingPrompt`)
- Test: `src/shared/lib/receipt-extraction.test.ts` (tambah blok baru)

**Interfaces:**
- Produces: `extractReceipt(imageBase64, mimeType, categories, hints, userNote?: string): Promise<ReceiptScanResult>` — parameter kelima opsional, jadi pemanggil lama (`/api/ai/scan-receipt/route.ts`) tidak berubah

- [ ] **Step 1: Tulis test yang gagal**

Tambahkan ke `src/shared/lib/receipt-extraction.test.ts`, di dalam `describe('extractReceipt', ...)`:

```ts
  it('injects the user caption into the extraction prompt as extra context', async () => {
    generateContent
      .mockResolvedValueOnce(extractionResult())
      .mockResolvedValueOnce({ text: JSON.stringify([]) })

    await extractReceipt('base64', 'image/jpeg', CATEGORIES, [], 'yang buram itu teh botol 2x12rb')

    const prompt = generateContent.mock.calls[0][0].contents[0].text as string
    expect(prompt).toContain('Catatan dari pengguna')
    expect(prompt).toContain('yang buram itu teh botol 2x12rb')
  })

  it('injects the caption into the category-mapping prompt too', async () => {
    generateContent
      .mockResolvedValueOnce(extractionResult())
      .mockResolvedValueOnce({ text: JSON.stringify([]) })

    await extractReceipt('base64', 'image/jpeg', CATEGORIES, [], 'belanja bulanan kantor')

    const mappingPrompt = generateContent.mock.calls[1][0].contents as string
    expect(mappingPrompt).toContain('belanja bulanan kantor')
  })

  it('leaves both prompts unchanged when there is no caption', async () => {
    generateContent
      .mockResolvedValueOnce(extractionResult())
      .mockResolvedValueOnce({ text: JSON.stringify([]) })

    await extractReceipt('base64', 'image/jpeg', CATEGORIES, [])

    const prompt = generateContent.mock.calls[0][0].contents[0].text as string
    expect(prompt).not.toContain('Catatan dari pengguna')
  })

  it('ignores a caption that is only whitespace', async () => {
    generateContent
      .mockResolvedValueOnce(extractionResult())
      .mockResolvedValueOnce({ text: JSON.stringify([]) })

    await extractReceipt('base64', 'image/jpeg', CATEGORIES, [], '   ')

    const prompt = generateContent.mock.calls[0][0].contents[0].text as string
    expect(prompt).not.toContain('Catatan dari pengguna')
  })

  it('truncates an absurdly long caption instead of blowing up the prompt', async () => {
    generateContent
      .mockResolvedValueOnce(extractionResult())
      .mockResolvedValueOnce({ text: JSON.stringify([]) })

    await extractReceipt('base64', 'image/jpeg', CATEGORIES, [], 'x'.repeat(2000))

    const prompt = generateContent.mock.calls[0][0].contents[0].text as string
    expect(prompt).toContain('x'.repeat(500))
    expect(prompt).not.toContain('x'.repeat(501))
  })
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run src/shared/lib/receipt-extraction.test.ts`
Expected: FAIL — prompt tidak memuat "Catatan dari pengguna".

- [ ] **Step 3: Implementasi konteks caption**

Di `src/shared/lib/receipt-extraction.ts`:

**3a.** Tambahkan helper tepat di atas `const EXTRACTION_PROMPT`:

```ts
/** A caption is free user text pasted into a prompt; cap it so a runaway paste cannot
 *  crowd out the instructions (or the image) in the context window. */
const MAX_USER_NOTE_CHARS = 500

function userNoteBlock(userNote: string | undefined): string {
  const note = userNote?.trim()
  if (!note) return ''
  return `

Catatan dari pengguna tentang struk ini (PRIORITASKAN sebagai konteks — pengguna
melihat struk aslinya, kamu hanya melihat fotonya yang mungkin buram atau terpotong):
"${note.slice(0, MAX_USER_NOTE_CHARS)}"`
}
```

**3b.** Ubah `buildMappingPrompt` supaya menerima catatan. Ganti tanda tangannya jadi:

```ts
function buildMappingPrompt(
  items: ExtractedReceiptItem[],
  categories: ScanReceiptApiRequest['categories'],
  merchantType: string | null,
  hints: ScanReceiptApiRequest['hints'],
  userNote?: string,
): string {
```

dan sisipkan `${userNoteBlock(userNote)}` tepat sebelum baris `Aturan mapping:` di dalam template-nya.

**3c.** Ubah tanda tangan `extractReceipt`:

```ts
export async function extractReceipt(
  imageBase64: string,
  mimeType: string,
  categories: ScanReceiptApiRequest['categories'],
  hints: ScanReceiptApiRequest['hints'],
  /** Caption the user sent with the photo. The one thing the model does not have: a
   *  human who saw the paper receipt. Especially load-bearing on a blurry photo or a
   *  long itemised one, where OCR alone drops lines. */
  userNote?: string,
): Promise<ReceiptScanResult> {
```

**3d.** Sisipkan catatan ke panggilan ekstraksi:

```ts
  const extractionResponse = await generateWithModels(ai, {
    contents: [
      { text: `${EXTRACTION_PROMPT}${userNoteBlock(userNote)}` },
      { inlineData: { mimeType, data: imageBase64 } },
    ],
    config: { responseMimeType: 'application/json', responseSchema: extractionSchema, temperature: 0 },
  })
```

**3e.** Teruskan ke pemetaan:

```ts
      const mappingResponse = await generateWithModels(ai, {
        contents: buildMappingPrompt(extraction.items, categories, extraction.merchantType, hints, userNote),
        config: { responseMimeType: 'application/json', responseSchema: mappingSchema, temperature: 0 },
      })
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `npx vitest run src/shared/lib/receipt-extraction.test.ts`
Expected: PASS (semua test lama tetap hijau — parameter baru opsional).

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit
git add src/shared/lib/receipt-extraction.ts src/shared/lib/receipt-extraction.test.ts
git commit -m "feat(receipt): use the photo caption as extraction context

The caption is the one thing the model lacks: a human who saw the paper. On a blurry
or long itemised receipt, 'yang buram itu teh botol 2x12rb' recovers lines OCR drops.
Fed to both the extraction and the category-mapping prompt, capped at 500 chars so a
runaway paste cannot crowd out the instructions. Optional parameter, so the existing
web scan route is unaffected."
```

---

