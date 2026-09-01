'use client'

import { useMemo, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'
import { ChartContainer, ChartTooltip } from '@/shared/components/charts/ChartContainer'
import { useChartTheme } from '@/shared/components/charts/chart-theme'
import { formatIDRCompact, formatMonthShort } from '@/shared/lib/format'
import { categoryTrend } from '@/shared/lib/year-summary'
import type { Category, Transaction } from '@/shared/types/domain'

/**
 * Twelve-month spend for one category at a time.
 *
 * One series rather than every category at once: eight overlapping lines is the
 * spaghetti chart nobody can read, and the category picker answers the same question.
 */
export function CategoryTrendChart({
  year,
  transactions,
  categories,
}: {
  year: number
  transactions: Transaction[]
  categories: Category[]
}) {
  const { colors, ink } = useChartTheme()
  const spendCategories = categories.filter((c) => c.pillar !== 'income')
  const [categoryId, setCategoryId] = useState(spendCategories[0]?.id ?? '')

  const category = spendCategories.find((c) => c.id === categoryId)

  const data = useMemo(
    () =>
      categoryTrend(year, categoryId, transactions).map((point) => ({
        ...point,
        label: formatMonthShort(year, point.month),
      })),
    [year, categoryId, transactions],
  )

  if (spendCategories.length === 0) return null

  // The line takes the category's own colour, which is how it reads everywhere else.
  const stroke = category?.color ?? colors.needs

  return (
    <ChartContainer
      title="Tren per kategori"
      description="Pengeluaran 12 bulan"
      height={240}
      actions={
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger className="w-44" aria-label="Pilih kategori">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {spendCategories.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
          <CartesianGrid stroke={ink.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={{ stroke: ink.grid }}
            tick={{ fill: ink.label, fontSize: 10 }}
            interval={0}
          />
          <YAxis
            tickFormatter={(value: number) => formatIDRCompact(value)}
            tickLine={false}
            axisLine={false}
            tick={{ fill: ink.label, fontSize: 11 }}
            width={64}
          />
          <Tooltip
            cursor={{ stroke: ink.axis, strokeWidth: 1 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null
              const point = payload[0].payload as { amount: number }
              return (
                <ChartTooltip
                  title={String(label)}
                  rows={[
                    { label: category?.name ?? 'Kategori', value: point.amount, color: stroke },
                  ]}
                />
              )
            }}
          />
          <Line
            type="monotone"
            dataKey="amount"
            name={category?.name}
            stroke={stroke}
            strokeWidth={2}
            dot={{ r: 3, strokeWidth: 0, fill: stroke }}
            activeDot={{ r: 5, strokeWidth: 2, stroke: ink.surface }}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartContainer>
  )
}
