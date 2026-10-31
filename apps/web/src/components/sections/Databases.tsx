import { Check } from 'lucide-react';
import { MysqlLogo } from '../MysqlLogo';
import { PostgresLogo } from '../PostgresLogo';
import {
  DATABASES,
  SHARED_CAPABILITIES,
  type Database,
} from '../../lib/content';

const LOGOS: Record<Database['id'], typeof PostgresLogo> = {
  postgres: PostgresLogo,
  mysql: MysqlLogo,
};

const GLOW: Record<Database['id'], string> = {
  postgres: 'from-[#336791]/25',
  mysql: 'from-[#00758F]/25',
};

export function Databases() {
  return (
    <section id="databases" className="py-24 border-t border-border scroll-mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-xl mb-14">
          <span className="text-xs uppercase tracking-widest font-mono text-primary font-bold">
            Supported databases
          </span>
          <h2 className="mt-3 text-3xl sm:text-5xl font-extrabold text-foreground tracking-tight leading-[1.1]">
            One workspace, every engine you run
          </h2>
          <p className="mt-4 text-base text-muted-foreground leading-relaxed">
            Pick PostgreSQL or MySQL when you add a connection. The grid, SQL
            editor, ERD, and schema designer work the same on both.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {DATABASES.map((db) => {
            const Logo = LOGOS[db.id];
            return (
              <article
                key={db.id}
                className="group relative overflow-hidden rounded-2xl border border-border bg-card p-8 transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl"
              >
                <div
                  className={`pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b ${GLOW[db.id]} to-transparent opacity-60 transition-opacity group-hover:opacity-100`}
                />
                <div className="relative">
                  <div className="flex items-center gap-4">
                    <span className="flex size-16 items-center justify-center rounded-xl border border-border bg-background shadow-sm">
                      <Logo className="size-11" />
                    </span>
                    <h3 className="text-2xl font-bold text-foreground tracking-tight">
                      {db.name}
                    </h3>
                  </div>
                  <p className="mt-5 text-sm text-muted-foreground leading-relaxed">
                    {db.body}
                  </p>
                  <ul className="mt-6 space-y-2.5">
                    {db.highlights.map((item) => (
                      <li
                        key={item}
                        className="flex items-start gap-2.5 text-sm text-foreground/90"
                      >
                        <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            );
          })}
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-2.5">
          <span className="mr-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            On both
          </span>
          {SHARED_CAPABILITIES.map((item) => (
            <span
              key={item}
              className="rounded-full border border-border bg-card px-3.5 py-1.5 text-xs text-muted-foreground"
            >
              {item}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
