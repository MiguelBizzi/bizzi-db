import React, { useState } from 'react';
import { Save, X } from 'lucide-react';
import { Modal, ModalPanel } from '../ui/Modal';

const SUGGESTED_TAGS = ['Core', 'Analytics', 'Revenue', 'Inventory', 'Performance', 'Daily', 'Audit'];

interface SaveQueryModalProps {
  sql: string;
  title: string;
  /** Label above the code preview, e.g. "SQL Code Preview". */
  previewLabel: string;
  /** Starts the comment line a default title is taken from: `--` for SQL, `//` for shell text. */
  commentPrefix: string;
  onSave: (title: string, description: string, tags: string[]) => void;
  onClose: () => void;
}

export function SaveQueryModal({ sql, title, previewLabel, commentPrefix, onSave, onClose }: SaveQueryModalProps) {
  const [saveTitle, setSaveTitle] = useState(() => {
    const first = sql.trim().split('\n')[0];
    const title = first.startsWith(commentPrefix) ? first.slice(commentPrefix.length).trimStart() : first;
    return title.slice(0, 40) || 'New Saved Query';
  });
  const [saveDescription, setSaveDescription] = useState('');
  const [saveTags, setSaveTags] = useState<string[]>(['Analytics']);
  const [newTagInput, setNewTagInput] = useState('');

  const handleConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!saveTitle.trim()) return;
    onSave(saveTitle.trim(), saveDescription.trim(), saveTags);
  };

  const toggleSaveTag = (tag: string) => {
    setSaveTags(saveTags.includes(tag) ? saveTags.filter((t) => t !== tag) : [...saveTags, tag]);
  };

  const handleAddSaveTag = () => {
    const trimmed = newTagInput.trim();
    if (trimmed && !saveTags.includes(trimmed)) {
      setSaveTags([...saveTags, trimmed]);
      setNewTagInput('');
    }
  };

  return (
    <Modal>
      <ModalPanel className="bg-popover border border-border rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden font-sans text-popover-foreground">
        <div className="p-4 bg-background/60 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2 text-foreground font-bold text-sm font-mono">
            <Save className="w-4 h-4 text-amber-400" />
            <span>{title}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleConfirm} className="p-5 space-y-4 text-xs">
          <div>
            <label className="block text-muted-foreground font-medium mb-1 font-mono">Query Name *</label>
            <input
              type="text"
              required
              placeholder="e.g. Active Customer Cohort Retention"
              value={saveTitle}
              onChange={(e) => setSaveTitle(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground font-mono focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-muted-foreground font-medium mb-1 font-mono">
              Description (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Used by finance team for monthly MRR calculations"
              value={saveDescription}
              onChange={(e) => setSaveDescription(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-muted-foreground font-medium mb-1 font-mono">
              Tags & Categories
            </label>

            <div className="flex flex-wrap gap-1.5 mb-2">
              {SUGGESTED_TAGS.map((tag) => {
                const isSelected = saveTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleSaveTag(tag)}
                    className={`pressable px-2 py-1 rounded-md text-[11px] font-mono border transition-colors ${
                      isSelected
                        ? 'bg-purple-600 text-white border-purple-500 font-semibold'
                        : 'bg-background text-muted-foreground border-border hover:border-primary/50'
                    }`}
                  >
                    #{tag}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Add custom tag..."
                value={newTagInput}
                onChange={(e) => setNewTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddSaveTag();
                  }
                }}
                className="flex-1 px-2.5 py-1.5 bg-background border border-border rounded-lg text-foreground text-xs focus:outline-none focus:border-primary font-mono"
              />
              <button
                type="button"
                onClick={handleAddSaveTag}
                className="pressable px-3 py-1.5 rounded-lg bg-muted hover:bg-accent text-foreground border border-border font-mono text-xs"
              >
                Add
              </button>
            </div>
          </div>

          <div>
            <label className="block text-muted-foreground font-medium mb-1 font-mono">{previewLabel}</label>
            <div className="p-3 bg-background border border-border rounded-lg font-mono text-[11px] text-primary max-h-28 overflow-y-auto whitespace-pre-wrap">
              {sql}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="pressable px-4 py-2 rounded-lg bg-muted hover:bg-accent text-foreground transition-colors font-mono border border-border"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="pressable px-4 py-2 rounded-lg bg-primary hover:opacity-90 text-primary-foreground font-semibold shadow-lg transition-colors font-mono flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Query</span>
            </button>
          </div>
        </form>
      </ModalPanel>
    </Modal>
  );
}
