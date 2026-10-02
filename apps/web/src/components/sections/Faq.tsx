import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { FAQ } from '../../lib/content';

export function Faq() {
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="py-20 border-t border-border bg-card/20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        <div className="text-center space-y-3">
          <span className="text-xs uppercase tracking-widest font-mono text-primary font-bold">
            FAQ
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight">
            Frequently asked questions
          </h2>
        </div>

        <div className="space-y-3">
          {FAQ.map((item, idx) => (
            <div
              key={item.q}
              className="rounded-xl border border-border bg-card overflow-hidden"
            >
              <button
                type="button"
                onClick={() =>
                  setOpenFaqIndex(openFaqIndex === idx ? null : idx)
                }
                className={`w-full p-4 text-left flex items-center justify-between gap-4 font-semibold text-sm transition-colors ${
                  openFaqIndex === idx
                    ? 'text-primary'
                    : 'text-foreground hover:text-primary'
                }`}
                aria-expanded={openFaqIndex === idx}
              >
                <span>{item.q}</span>
                <ChevronDown
                  className={`w-4 h-4 transition-transform duration-200 shrink-0 ${
                    openFaqIndex === idx
                      ? 'rotate-180 text-primary'
                      : 'text-muted-foreground'
                  }`}
                />
              </button>
              {openFaqIndex === idx && (
                <div className="px-4 pb-4 text-xs text-muted-foreground leading-relaxed border-t border-border/40 pt-3">
                  {item.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
