import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { writeClipboard } from '../../lib/dataExport';
import { toast } from '../../lib/toast';

const FEEDBACK_MS = 1500;

interface CopyButtonProps {
  text: string;
  label?: string;
  className?: string;
}

export function CopyButton({ text, label = 'Copy', className = '' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = () => {
    writeClipboard(text).then(
      () => {
        setCopied(true);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setCopied(false), FEEDBACK_MS);
      },
      () => toast.error('Could not copy to clipboard')
    );
  };

  return (
    <button
      type="button"
      onClick={copy}
      title={copied ? 'Copied' : label}
      aria-label={copied ? 'Copied' : label}
      className={`p-1 rounded-md opacity-60 hover:opacity-100 focus-visible:opacity-100 hover:bg-accent/60 transition-opacity shrink-0 ${className}`}
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}
