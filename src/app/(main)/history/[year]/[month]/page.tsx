import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { MonthDetailPage } from '@/modules/history/MonthDetailPage'

export const metadata: Metadata = { title: 'Detail Bulan' }

export default function Page({ params }: { params: { year: string; month: string } }) {
  const year = Number(params.year)
  const month = Number(params.month)

  // Guards a hand-typed URL like /history/abc/99 from rendering a broken page.
  if (!Number.isInteger(year) || year < 2000 || year > 2100) notFound()
  if (!Number.isInteger(month) || month < 1 || month > 12) notFound()

  return <MonthDetailPage year={year} month={month} />
}
