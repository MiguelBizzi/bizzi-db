import { Download } from 'lucide-react';
import { BrandMark } from '../BrandMark';
import { PRODUCT_NAME, RELEASES_URL, VERSION } from '../../lib/site';

const NAV = [
  { href: '#showcase', label: 'Showcase' },
  { href: '#pillars', label: 'Philosophy' },
  { href: '#features', label: 'Features' },
  { href: '#architecture', label: 'Architecture' },
  { href: '#faq', label: 'FAQ' },
  // { href: '#testimonials', label: 'Testimonials' },
];

export function Header() {
  return (
    <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border/70">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4 lg:grid lg:grid-cols-[1fr_auto_1fr]">
        <a href="#top" className="flex items-center gap-3 shrink-0 lg:justify-self-start">
          <BrandMark />
          <span className="font-bold text-lg tracking-tight text-foreground">
            {PRODUCT_NAME}
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-mono font-semibold hidden sm:inline-block">
            v{VERSION}
          </span>
        </a>

        <nav
          className="hidden lg:flex items-center justify-center gap-7 text-xs font-medium text-muted-foreground"
          aria-label="Page"
        >
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="hover:text-foreground transition-colors"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <a
          href={RELEASES_URL}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary hover:opacity-90 text-primary-foreground text-xs font-semibold shadow-md shadow-primary/20 shrink-0 lg:justify-self-end"
        >
          <Download className="w-3.5 h-3.5" />
          Download
        </a>
      </div>
    </header>
  );
}
