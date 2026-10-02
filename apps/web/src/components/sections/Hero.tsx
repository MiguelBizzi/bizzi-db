import { DownloadButtons } from '../DownloadButtons';
import { PRODUCT_NAME, VERSION } from '../../lib/site';

export function Hero() {
  return (
    <section className="relative pt-12 pb-8 md:pt-20 md:pb-12 overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[450px] bg-gradient-to-b from-primary/15 to-transparent blur-3xl -z-10 pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-8">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-card border border-border shadow-sm text-xs text-muted-foreground">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span className="text-foreground font-semibold">
            {PRODUCT_NAME} v{VERSION}
          </span>
          <span>—</span>
          <span>Postgres · Rust · Tauri 2</span>
        </div>

        <div className="space-y-4 max-w-4xl mx-auto">
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-foreground leading-[1.08]">
            A Modern, Minimal <br className="hidden sm:inline" />
            <span className="bg-gradient-to-r from-primary to-primary/50 bg-clip-text text-transparent">
              Postgres Client Built for Speed.
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            A calm, distraction-free workspace for PostgreSQL. Rust runs the
            session. Tauri keeps the shell light — fast to open, fast to query.
          </p>
        </div>

        <div id="download" className="pt-2 scroll-mt-24">
          <DownloadButtons />
        </div>

        <p className="text-xs text-muted-foreground">
          Installers from GitHub Releases · macOS universal DMG · Windows NSIS ·
          Linux AppImage
        </p>
      </div>
    </section>
  );
}
