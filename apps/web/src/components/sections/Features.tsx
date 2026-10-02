import { FEATURES } from '../../lib/content';

function TablePreview() {
  const cols = ['email', 'status', 'total'];
  const rows = [
    ['ada', 'paid', '42'],
    ['linus', 'open', '18'],
    ['grace', 'paid', '91'],
  ];

  return (
    <div className="mt-6 w-full min-w-0 rounded-lg border border-border overflow-hidden text-[10px] font-mono">
      <div className="grid grid-cols-3 bg-muted/40 text-muted-foreground border-b border-border">
        {cols.map((col) => (
          <span
            key={col}
            className="px-2.5 py-2 border-r border-border last:border-r-0"
          >
            {col}
          </span>
        ))}
      </div>
      {rows.map((row) => (
        <div
          key={row[0]}
          className="grid grid-cols-3 text-foreground/80 border-b border-border last:border-b-0"
        >
          {row.map((cell) => (
            <span
              key={cell}
              className="px-2.5 py-1.5 truncate border-r border-border last:border-r-0"
            >
              {cell}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

function SqlPreview() {
  return (
    <pre className="mt-6 rounded-lg border border-border bg-background px-3 py-3 font-mono text-[11px] leading-6 text-muted-foreground overflow-hidden">
      <span className="text-primary">SELECT</span>
      {'  email, status\n'}
      <span className="text-primary">FROM</span>
      {'    shop.orders\n'}
      <span className="text-primary">WHERE</span>
      {'   total_cents > 1000\n'}
      <span className="text-primary">ORDER BY</span>
      {' created_at '}
      <span className="text-primary">DESC</span>
      {';'}
    </pre>
  );
}

export function Features() {
  const featured = FEATURES.slice(0, 2);
  const rest = FEATURES.slice(2);

  return (
    <section id="features" className="py-24 border-t border-border bg-card/20 scroll-mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-20">
          <div className="lg:col-span-4 lg:sticky lg:top-24 self-start">
            <span className="text-xs uppercase tracking-widest font-mono text-primary font-bold">
              What ships in v0.1.0
            </span>
            <h2 className="mt-3 text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight leading-[1.1]">
              The workspace you actually get
            </h2>
            <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
              SQL, tables, schema, and connections — Postgres only, running on
              your machine.
            </p>
          </div>

          <div className="lg:col-span-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-12 pb-12 mb-12 border-b border-border">
              {featured.map((feature, index) => (
                <article key={feature.title}>
                  <span className="font-mono text-[11px] tracking-[0.18em] text-primary/80">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <h3 className="mt-3 text-lg font-bold text-foreground tracking-tight">
                    {feature.title}
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                    {feature.body}
                  </p>
                  {index === 0 ? <TablePreview /> : <SqlPreview />}
                </article>
              ))}
            </div>

            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-10">
              {rest.map((feature, index) => (
                <li
                  key={feature.title}
                  className="py-6 border-t border-border/70 first:border-t-0 sm:[&:nth-child(-n+2)]:border-t-0"
                >
                  <span className="font-mono text-[11px] tracking-[0.18em] text-muted-foreground">
                    {String(index + 3).padStart(2, '0')}
                  </span>
                  <h3 className="mt-2 text-base font-bold text-foreground tracking-tight">
                    {feature.title}
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                    {feature.body}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
