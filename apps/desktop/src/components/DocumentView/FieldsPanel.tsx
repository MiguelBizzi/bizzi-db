import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Loader2, RefreshCw, X } from 'lucide-react';
import { documentsSampleFields } from '@db/core';
import type { FieldSample, Namespace } from '@db/shared';
import { bsonAliasLabel } from '../../lib/document/docTree';
import { invokeErrorMessage } from '../../lib/invokeError';
import { fade } from '../../lib/motion';
import { TypeBadge, toneVar } from './DocumentTree';

const SAMPLE_SIZE = 200;

interface FieldsPanelProps {
  connectionId: string;
  ns: Namespace;
  onPickPath: (path: string) => void;
  onClose: () => void;
}

type SampleState =
  | { status: 'loading' }
  | { status: 'ready'; sample: FieldSample }
  | { status: 'error'; message: string };

/** Field paths seen in a random sample of the collection, with their type mix and presence. */
export function FieldsPanel({ connectionId, ns, onPickPath, onClose }: FieldsPanelProps) {
  const [state, setState] = useState<SampleState>({ status: 'loading' });
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    documentsSampleFields(connectionId, ns, SAMPLE_SIZE).then(
      (sample) => !cancelled && setState({ status: 'ready', sample }),
      (err: unknown) =>
        !cancelled && setState({ status: 'error', message: invokeErrorMessage(err, 'Could not sample fields') }),
    );
    return () => {
      cancelled = true;
    };
  }, [connectionId, ns.database, ns.collection, revision]);

  return (
    <motion.aside
      variants={fade}
      initial="initial"
      animate="animate"
      exit="exit"
      className="w-72 shrink-0 border-l border-border bg-card/60 flex flex-col min-h-0"
      aria-label="Fields"
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <span className="text-xs font-semibold text-foreground">Fields</span>
        {state.status === 'ready' && (
          <span className="text-[11px] text-muted-foreground">
            {state.sample.sampled.toLocaleString('en-US')} sampled
          </span>
        )}
        <button
          type="button"
          onClick={() => setRevision((r) => r + 1)}
          disabled={state.status === 'loading'}
          title="Sample again"
          aria-label="Sample again"
          className="ml-auto p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-40"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={onClose}
          title="Close fields"
          aria-label="Close fields"
          className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-2">
        {state.status === 'loading' && (
          <div className="flex items-center gap-2 p-2 text-xs text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Sampling {SAMPLE_SIZE} documents…
          </div>
        )}
        {state.status === 'error' && <p className="p-2 text-xs text-red-400 break-words">{state.message}</p>}
        {state.status === 'ready' && state.sample.fields.length === 0 && (
          <p className="p-2 text-xs text-muted-foreground">No documents to sample.</p>
        )}
        {state.status === 'ready' && (
          <ul className="space-y-0.5">
            {state.sample.fields.map((field) => (
              <FieldItem
                key={field.path}
                path={field.path}
                types={field.types}
                presentIn={field.presentIn}
                sampled={state.sample.sampled}
                onPick={onPickPath}
              />
            ))}
          </ul>
        )}
      </div>
      <p className="px-3 py-2 border-t border-border text-[11px] text-muted-foreground">
        Click a field to add it to the filter.
      </p>
    </motion.aside>
  );
}

interface FieldItemProps {
  path: string;
  types: [string, number][];
  presentIn: number;
  sampled: number;
  onPick: (path: string) => void;
}

function FieldItem({ path, types, presentIn, sampled, onPick }: FieldItemProps) {
  const presence = sampled > 0 ? Math.round((presentIn / sampled) * 100) : 0;
  const labelled = types.map(([alias, count]) => [bsonAliasLabel(alias), count] as const);
  const depth = path.split('.').length - 1;
  return (
    <li>
      <button
        type="button"
        onClick={() => onPick(path)}
        title={`Filter on ${path}`}
        className="w-full text-left rounded-lg px-2 py-1.5 hover:bg-accent/60 transition-colors space-y-1"
      >
        <div className="flex items-center gap-2" style={{ paddingLeft: depth * 10 }}>
          <span className="font-mono text-xs text-foreground truncate min-w-0">{path}</span>
          <span className="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground">{presence}%</span>
        </div>
        <div className="flex h-1.5 rounded-full overflow-hidden bg-muted" style={{ marginLeft: depth * 10 }}>
          {labelled.map(([label, count], i) => (
            <span
              key={i}
              title={`${label}: ${count}`}
              style={{
                width: `${(count / Math.max(1, presentIn)) * 100}%`,
                backgroundColor: toneVar(label),
              }}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-1" style={{ paddingLeft: depth * 10 }}>
          {labelled.map(([label], i) => (
            <TypeBadge key={i} label={label} />
          ))}
        </div>
      </button>
    </li>
  );
}
