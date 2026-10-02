import { DownloadButtons } from '../DownloadButtons';
import { BrandMark } from '../BrandMark';
import { CTA } from '../../lib/content';

export function Cta() {
  return (
    <section className="py-20 border-t border-border relative overflow-hidden bg-gradient-to-b from-background to-primary/5">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-8 relative z-10">
        <div className="inline-flex">
          <BrandMark />
        </div>

        <div className="space-y-3 max-w-3xl mx-auto">
          <h2 className="text-3xl sm:text-5xl font-extrabold text-foreground tracking-tight">
            {CTA.title}{' '}
            <span className="text-primary">{CTA.emphasis}</span>
          </h2>
          <p className="text-base text-muted-foreground max-w-xl mx-auto">
            {CTA.body}
          </p>
        </div>

        <DownloadButtons />

        <div className="pt-4 flex flex-wrap items-center justify-center gap-6 text-xs text-muted-foreground font-mono">
          <span>macOS 12+ (Apple Silicon & Intel)</span>
        </div>
      </div>
    </section>
  );
}
