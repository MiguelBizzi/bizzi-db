import { AlertCircle } from 'lucide-react';
import { CopyButton } from './CopyButton';

/** An error line whose text can be selected and copied; `className` supplies the surrounding chrome. */
export function ErrorNotice({ message, className = '' }: { message: string; className?: string }) {
  return (
    <div className={`flex items-start gap-2 select-text ${className}`}>
      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
      <span className="break-all flex-1 min-w-0 cursor-text">{message}</span>
      <CopyButton text={message} label="Copy error" className="-my-0.5 -mr-1" />
    </div>
  );
}
