import type { Metadata } from 'next'
import { LegalList, LegalSection, LegalTitle } from '../_components/LegalContent'

export const metadata: Metadata = { title: 'Tentang' }

export default function AboutPage() {
  return (
    <article>
      <LegalTitle updatedAt="1 September 2026">Tentang FinTrack</LegalTitle>

      <LegalSection title="Apa itu FinTrack?">
        <p>
          FinTrack adalah aplikasi pencatat dan perencana keuangan pribadi untuk
          pengguna Indonesia — anggaran bulanan berbasis tiga pilar (Kebutuhan,
          Keinginan, Tabungan), pencatatan transaksi harian, dan alat bantu perencanaan
          keuangan lain, semuanya dalam Rupiah dan format lokal.
        </p>
        <p>
          Aplikasi ini dibuat untuk satu tujuan sederhana: membantu kamu melihat ke
          mana uangmu benar-benar pergi, tanpa harus repot dengan spreadsheet manual.
        </p>
      </LegalSection>

      <LegalSection title="Fitur utama">
        <LegalList
          items={[
            'Anggaran bulanan tiga pilar dengan pelacakan serapan real-time.',
            'Pencatatan transaksi cepat, lengkap dengan filter, impor CSV, dan lampiran struk.',
            'Scan struk otomatis dengan AI — foto struk, item dan totalnya terbaca sendiri.',
            'Target tabungan dengan proyeksi pencapaian dan saran kontribusi.',
            'Wishlist dengan mesin analisis kelayakan beli otomatis.',
            'Pelacak kekayaan bersih, riwayat tahunan, dan laporan siap ekspor.',
          ]}
        />
      </LegalSection>

      <LegalSection title="Filosofi data">
        <p>
          Data keuanganmu tersimpan di akun Firebase milikmu sendiri (dibatasi ketat
          per akun), dan foto struk maupun file ekspor tersimpan di folder khusus di
          Google Drive milikmu sendiri — bukan di server pihak ketiga mana pun di luar
          itu. Rincian lengkapnya ada di{' '}
          <a href="/privacy" className="text-primary underline underline-offset-2">
            Kebijakan Privasi
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="Dibangun dengan">
        <p>
          Next.js, TypeScript, Firebase, dan Google Drive API — dikembangkan sebagai
          proyek mandiri (independent developer), terus diperbaiki dari waktu ke waktu.
        </p>
      </LegalSection>

      <LegalSection title="Masukan & pertanyaan">
        <p>Ada saran, laporan bug, atau pertanyaan? Hubungi kami di [isi email dukungan di sini].</p>
      </LegalSection>
    </article>
  )
}
