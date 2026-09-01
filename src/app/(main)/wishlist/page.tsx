import type { Metadata } from 'next'
import { WishlistPage } from '@/modules/wishlist/WishlistPage'

export const metadata: Metadata = { title: 'Wishlist' }

export default function Page() {
  return <WishlistPage />
}
