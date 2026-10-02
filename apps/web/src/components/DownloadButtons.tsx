import { useMemo } from 'react';
import { Apple, Download, HardDrive, Monitor } from 'lucide-react';
import {
  DOWNLOAD_PLATFORMS,
  detectPreferredPlatform,
  type DownloadPlatformId,
} from '../lib/site';

const ICONS: Record<DownloadPlatformId, typeof Apple> = {
  macos: Apple,
  windows: Monitor,
  linux: HardDrive,
};

export function DownloadButtons({
  size = 'md',
}: {
  size?: 'sm' | 'md';
}) {
  const preferred = useMemo(
    () =>
      detectPreferredPlatform(
        typeof navigator === 'undefined' ? '' : navigator.userAgent,
      ),
    [],
  );

  const padding =
    size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2.5 text-sm';

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {DOWNLOAD_PLATFORMS.map((platform) => {
        const Icon = ICONS[platform.id];
        const isPreferred = platform.id === preferred;
        return (
          <a
            key={platform.id}
            href={platform.href}
            className={`inline-flex items-center gap-2 rounded-xl font-semibold transition-opacity hover:opacity-90 ${padding} ${
              isPreferred
                ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
                : 'bg-muted text-foreground border border-border hover:bg-accent'
            }`}
          >
            {isPreferred ? (
              <Download className="w-3.5 h-3.5" />
            ) : (
              <Icon className="w-3.5 h-3.5" />
            )}
            <span>{platform.label}</span>
            <span
              className={`font-mono font-normal ${
                isPreferred
                  ? 'text-primary-foreground/70'
                  : 'text-muted-foreground'
              }`}
            >
              {platform.detail}
            </span>
          </a>
        );
      })}
    </div>
  );
}
