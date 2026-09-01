/** Shared typographic building blocks for About/Privacy/Terms — plain Tailwind
 *  utilities, no `prose` plugin installed in this project, so the classes live here
 *  once instead of repeated raw strings across three long pages. */

export function LegalTitle({
  children,
  updatedAt,
}: {
  children: React.ReactNode
  updatedAt: string
}) {
  return (
    <div className="mb-8 space-y-1.5 border-b pb-6">
      <h1 className="font-display text-3xl font-bold">{children}</h1>
      <p className="text-xs text-muted-foreground">Terakhir diperbarui: {updatedAt}</p>
    </div>
  )
}

export function LegalSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="mb-7">
      <h2 className="mb-2 text-lg font-semibold">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  )
}

export function LegalList({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  )
}
