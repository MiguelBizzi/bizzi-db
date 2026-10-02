import { BrandMark } from '../BrandMark';
import { PRODUCT_NAME, RELEASES_URL, REPO_URL } from '../../lib/site';

export function Footer() {
  return (
    <footer className="py-10 border-t border-border bg-card text-xs text-muted-foreground">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 sm:grid-cols-3 items-center gap-4">
        <div className="flex items-center gap-2 justify-center sm:justify-start">
          <BrandMark size="sm" />
          <span className="font-semibold text-foreground">{PRODUCT_NAME}</span>
        </div>

        <div className="flex items-center justify-center gap-6">
          <a
            href={RELEASES_URL}
            className="hover:text-foreground transition-colors"
          >
            Releases
          </a>
          <a
            href={REPO_URL}
            className="hover:text-foreground transition-colors"
          >
            GitHub
          </a>
        </div>

        <div className="font-mono text-[11px] text-center sm:text-right">
          © {new Date().getFullYear()} {PRODUCT_NAME}
        </div>
      </div>
    </footer>
  );
}
