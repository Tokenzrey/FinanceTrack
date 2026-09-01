import type { Metadata } from 'next'
import { LegalList, LegalSection, LegalTitle } from '../_components/LegalContent'

export const metadata: Metadata = {
  title: 'Syarat & Ketentuan',
  description:
    'Syarat penggunaan FinTrack — deskripsi layanan, batasan tanggung jawab, dan penegasan bahwa fitur di aplikasi ini bukan nasihat keuangan profesional.',
  alternates: { canonical: '/terms' },
  openGraph: { title: 'Syarat & Ketentuan FinTrack', url: '/terms' },
}

export default function TermsPage() {
  return (
    <article>
      <LegalTitle updatedAt="1 September 2026">Syarat &amp; Ketentuan</LegalTitle>

      <LegalSection title="1. Penerimaan syarat">
        <p>
          Dengan membuat akun atau memakai FinTrack, kamu setuju dengan syarat dan
          ketentuan ini beserta{' '}
          <a href="/privacy" className="text-primary underline underline-offset-2">
            Kebijakan Privasi
          </a>{' '}
          kami. Kalau tidak setuju, mohon tidak memakai aplikasi ini.
        </p>
      </LegalSection>

      <LegalSection title="2. Deskripsi layanan">
        <p>
          FinTrack adalah alat bantu pencatatan dan perencanaan keuangan pribadi —
          anggaran, transaksi, target tabungan, dan laporan berdasarkan data yang kamu
          masukkan sendiri.
        </p>
      </LegalSection>

      <LegalSection title="3. Bukan nasihat keuangan">
        <p>
          Semua angka, skor, dan rekomendasi yang ditampilkan aplikasi ini — termasuk
          Skor Efisiensi Anggaran, hasil analisis kelayakan beli di Wishlist, dan
          proyeksi target tabungan — dihitung otomatis dari data yang kamu masukkan
          sendiri. Ini adalah alat bantu, <strong className="text-foreground">bukan</strong>{' '}
          nasihat keuangan, investasi, hukum, atau pajak profesional. Keputusan
          finansial apa pun tetap sepenuhnya tanggung jawabmu sendiri.
        </p>
      </LegalSection>

      <LegalSection title="4. Akun pengguna">
        <LegalList
          items={[
            'Kamu bertanggung jawab menjaga kerahasiaan akses akunmu.',
            'Kamu bertanggung jawab atas keakuratan data yang kamu masukkan — aplikasi ini hanya menghitung berdasarkan apa yang kamu catat.',
            'Satu akun untuk satu pengguna; jangan membagikan kredensial masuk ke orang lain.',
          ]}
        />
      </LegalSection>

      <LegalSection title="5. Ketersediaan layanan">
        <p>
          FinTrack adalah proyek independen berskala kecil, disediakan{' '}
          <em>sebagaimana adanya</em> (&ldquo;as-is&rdquo;) tanpa jaminan uptime atau ketersediaan
          layanan (SLA). Fitur bisa berubah, ditambah, atau dihentikan sewaktu-waktu,
          dan sebagian fungsi bergantung pada layanan pihak ketiga (Firebase, Google
          Drive, Gemini) yang berada di luar kendali kami.
        </p>
      </LegalSection>

      <LegalSection title="6. Batasan tanggung jawab">
        <p>
          Sejauh diizinkan hukum yang berlaku, kami tidak bertanggung jawab atas
          kerugian yang timbul dari penggunaan atau ketidaktersediaan layanan ini,
          termasuk (namun tidak terbatas pada) kesalahan hitung akibat data yang salah
          dimasukkan, kegagalan pembacaan struk oleh AI, atau gangguan pada layanan
          pihak ketiga yang dipakai aplikasi ini.
        </p>
      </LegalSection>

      <LegalSection title="7. Penggunaan yang wajar">
        <p>
          Dilarang menyalahgunakan aplikasi ini — termasuk mencoba mengakses data akun
          lain, melakukan scraping otomatis di luar wajar, atau merekayasa balik
          (reverse-engineer) untuk tujuan merugikan.
        </p>
      </LegalSection>

      <LegalSection title="8. Perubahan syarat">
        <p>
          Syarat ini bisa berubah dari waktu ke waktu. Perubahan berarti akan
          diperbarui di halaman ini, dengan tanggal &ldquo;terakhir diperbarui&rdquo; di atas
          sebagai acuan. Penggunaan berkelanjutan setelah perubahan berarti kamu
          menerima syarat yang baru.
        </p>
      </LegalSection>

      <LegalSection title="9. Hukum yang berlaku">
        <p>Syarat ini tunduk pada hukum yang berlaku di Republik Indonesia.</p>
      </LegalSection>

      <LegalSection title="10. Kontak">
        <p>Pertanyaan soal syarat ini? Hubungi kami di [isi email dukungan di sini].</p>
      </LegalSection>
    </article>
  )
}
