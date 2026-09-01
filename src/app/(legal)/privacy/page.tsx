import type { Metadata } from 'next'
import { LegalList, LegalSection, LegalTitle } from '../_components/LegalContent'

export const metadata: Metadata = {
  title: 'Kebijakan Privasi',
  description:
    'Data apa yang FinTrack kumpulkan, di mana data itu disimpan (Firestore dan Google Drive milikmu sendiri), dan hak apa yang kamu miliki atasnya.',
  alternates: { canonical: '/privacy' },
  openGraph: { title: 'Kebijakan Privasi FinTrack', url: '/privacy' },
}

export default function PrivacyPage() {
  return (
    <article>
      <LegalTitle updatedAt="1 September 2026">Kebijakan Privasi</LegalTitle>

      <LegalSection title="1. Pendahuluan">
        <p>
          Kebijakan ini menjelaskan data apa yang FinTrack kumpulkan, bagaimana data itu
          dipakai dan disimpan, dan hak apa yang kamu miliki atasnya. Berlaku untuk
          semua pengguna FinTrack.
        </p>
      </LegalSection>

      <LegalSection title="2. Data yang dikumpulkan">
        <p>Hanya data yang benar-benar diperlukan aplikasi untuk berjalan:</p>
        <LegalList
          items={[
            'Data akun: email, nama tampilan, dan foto profil (kalau masuk dengan Google).',
            'Data keuangan yang kamu input sendiri: transaksi, kategori, anggaran, target tabungan, aset/utang, dan catatan lain di dalam aplikasi.',
            'Foto struk — hanya kalau kamu memakai fitur unggah struk atau scan AI.',
            'Data teknis minimal untuk keamanan (mis. token sesi login) — aplikasi ini tidak memasang layanan analitik atau pelacak pihak ketiga apa pun.',
          ]}
        />
      </LegalSection>

      <LegalSection title="3. Bagaimana data dipakai">
        <p>
          Data dipakai semata untuk menjalankan fitur aplikasi untukmu — menghitung
          anggaran, menampilkan riwayat, membuat laporan, dan seterusnya. Tidak dijual
          atau dibagikan ke pihak ketiga untuk kepentingan iklan.
        </p>
        <p>
          Saat kamu memakai fitur scan struk, foto struk dikirim ke Gemini API (Google)
          semata untuk dibaca otomatis (nama toko, item, total) — server aplikasi ini
          tidak menyimpan salinan foto itu sendiri; foto yang tersimpan permanen ada di
          Google Drive milikmu, bukan di server aplikasi ini.
        </p>
      </LegalSection>

      <LegalSection title="4. Di mana data disimpan">
        <LegalList
          items={[
            <>
              <strong className="text-foreground">Firestore (Firebase/Google Cloud):</strong>{' '}
              transaksi, kategori, anggaran, target, dan data keuangan lain — dibatasi
              lewat aturan keamanan sehingga hanya akunmu sendiri yang bisa membacanya.
            </>,
            <>
              <strong className="text-foreground">Google Drive milikmu sendiri:</strong>{' '}
              foto struk dan file ekspor tersimpan di folder &ldquo;FinTrack&rdquo; di akun Drive-mu
              — bukan di server aplikasi ini. Izin yang diminta (`drive.file`) hanya
              memberi akses ke file yang dibuat aplikasi ini sendiri, tidak bisa membaca
              file lain di Drive-mu.
            </>,
            <>
              <strong className="text-foreground">Browser (perangkat ini saja):</strong>{' '}
              preferensi tampilan dan cache offline — tidak pernah terkirim ke mana pun.
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection title="5. Pihak ketiga yang terlibat">
        <p>Layanan pihak ketiga yang dipakai untuk menjalankan aplikasi ini:</p>
        <LegalList
          items={[
            'Firebase (Google) — autentikasi dan database.',
            'Google Drive API — penyimpanan foto struk dan file ekspor milikmu sendiri.',
            'Gemini API (Google) — pembacaan otomatis foto struk.',
            'goldapi.io (opsional) — hanya untuk harga referensi emas di widget Market Pulse; tidak menerima data pribadi apa pun darimu.',
            'Vercel — hosting aplikasi.',
          ]}
        />
        <p>Masing-masing tunduk pada kebijakan privasi mereka sendiri.</p>
      </LegalSection>

      <LegalSection title="6. Keamanan">
        <LegalList
          items={[
            'Header keamanan browser (Content-Security-Policy, dst.) dikirim di setiap respons.',
            'Token akses Google Drive dienkripsi (AES-256-GCM) sebelum disimpan.',
            'Akses data dibatasi ketat per akun lewat Firestore Security Rules.',
          ]}
        />
      </LegalSection>

      <LegalSection title="7. Hak kamu atas data">
        <LegalList
          items={[
            'Lihat dan ekspor datamu kapan saja lewat halaman Laporan (CSV/JSON/PDF).',
            'Hapus sebagian atau seluruh data keuanganmu kapan saja lewat Pengaturan → Reset Data.',
            'Putuskan tautan Google Drive kapan saja lewat Pengaturan.',
            'Untuk menghapus akun sepenuhnya (termasuk data login), hubungi [isi email dukungan di sini] — ini belum berupa tombol swalayan di dalam aplikasi.',
          ]}
        />
      </LegalSection>

      <LegalSection title="8. Pengguna anak-anak">
        <p>
          FinTrack tidak ditujukan untuk anak di bawah 13 tahun, dan tidak dengan
          sengaja mengumpulkan data dari mereka.
        </p>
      </LegalSection>

      <LegalSection title="9. Perubahan kebijakan">
        <p>
          Kebijakan ini bisa berubah dari waktu ke waktu. Perubahan berarti akan
          diperbarui di halaman ini, dengan tanggal &ldquo;terakhir diperbarui&rdquo; di atas
          sebagai acuan.
        </p>
      </LegalSection>

      <LegalSection title="10. Kontak">
        <p>Pertanyaan soal kebijakan ini? Hubungi kami di [isi email dukungan di sini].</p>
      </LegalSection>
    </article>
  )
}
