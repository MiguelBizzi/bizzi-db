import React, { useState } from 'react';
import { TableSchema, ColumnDefinition, IndexDefinition } from '../../types';
import {
  Edit3,
  Key,
  Plus,
  Trash2,
  Code,
  Check,
  Zap,
  Layers,
  ShieldCheck,
} from 'lucide-react';
import { Checkbox } from '../ui/Checkbox';
import { Select } from '../ui/Select';

interface TableSchemaDesignerProps {
  table: TableSchema;
  onSaveSchema: (updatedTable: TableSchema) => void;
}

export const TableSchemaDesigner: React.FC<TableSchemaDesignerProps> = ({
  table,
  onSaveSchema,
}) => {
  const [columns, setColumns] = useState<ColumnDefinition[]>([...table.columns]);
  const [indexes, setIndexes] = useState<IndexDefinition[]>([...table.indexes]);
  const [activeTab, setActiveTab] = useState<'columns' | 'indexes' | 'ddl'>('columns');

  const [newColName, setNewColName] = useState('');
  const [newColType, setNewColType] = useState('varchar(255)');
  const [newColNullable, setNewColNullable] = useState(true);

  const handleAddColumn = (e: React.FormEvent) => {
    e.preventDefault();
    if (newColName.trim()) {
      setColumns([
        ...columns,
        {
          name: newColName.trim(),
          type: newColType,
          isNullable: newColNullable,
        },
      ]);
      setNewColName('');
    }
  };

  const handleRemoveColumn = (colName: string) => {
    setColumns(columns.filter((c) => c.name !== colName));
  };

  const generateDdl = () => {
    const colSql = columns
      .map(
        (c) =>
          `  ${c.name} ${c.type}${c.isPrimary ? ' PRIMARY KEY' : ''}${
            !c.isNullable ? ' NOT NULL' : ''
          }${c.defaultValue ? ` DEFAULT ${c.defaultValue}` : ''}`
      )
      .join(',\n');

    const idxSql = indexes
      .map(
        (idx) =>
          `CREATE ${idx.isUnique ? 'UNIQUE ' : ''}INDEX ${idx.name} ON ${
            table.name
          } USING ${idx.type} (${idx.columns.join(', ')});`
      )
      .join('\n');

    return `-- Table DDL Script for ${table.name}\nCREATE TABLE ${table.name} (\n${colSql}\n);\n\n${idxSql}`;
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden font-sans select-none text-foreground">
      {/* Header */}
      <div className="p-4 bg-card border-b border-border flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 font-mono">
          <Edit3 className="w-5 h-5 text-amber-400" />
          <div>
            <div className="text-sm font-bold text-foreground flex items-center gap-2">
              <span>Schema Inspector & Designer — {table.name}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              {table.schema} schema • {table.rowCount.toLocaleString()} rows • {table.sizeMb} MB
            </div>
          </div>
        </div>

        <button
          onClick={() =>
            onSaveSchema({
              ...table,
              columns,
              indexes,
              updatedAt: new Date().toISOString(),
            })
          }
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary hover:opacity-90 text-primary-foreground font-bold text-xs shadow-md transition-colors"
        >
          <Check className="w-4 h-4" />
          <span>Save Schema Changes</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border bg-background px-4 font-mono text-xs">
        <button
          onClick={() => setActiveTab('columns')}
          className={`py-2.5 px-4 font-semibold border-b-2 transition-colors ${
            activeTab === 'columns'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Columns ({columns.length})
        </button>

        <button
          onClick={() => setActiveTab('indexes')}
          className={`py-2.5 px-4 font-semibold border-b-2 transition-colors ${
            activeTab === 'indexes'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Indexes ({indexes.length})
        </button>

        <button
          onClick={() => setActiveTab('ddl')}
          className={`py-2.5 px-4 font-semibold border-b-2 transition-colors ${
            activeTab === 'ddl'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          DDL Preview
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 scrollbar-thin scrollbar-thumb-muted">
        {activeTab === 'columns' && (
          <div className="space-y-4 max-w-4xl font-mono text-xs">
            {/* Add Column Form */}
            <form
              onSubmit={handleAddColumn}
              className="p-3 bg-card border border-border rounded-xl flex flex-wrap items-center gap-3"
            >
              <input
                type="text"
                placeholder="New column name..."
                value={newColName}
                onChange={(e) => setNewColName(e.target.value)}
                className="px-3 py-1.5 bg-background border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary w-48"
              />

              <Select
                size="sm"
                className="w-44"
                value={newColType}
                onChange={setNewColType}
                aria-label="Column type"
                options={[
                  { value: 'varchar(255)', label: 'varchar(255)' },
                  { value: 'text', label: 'text' },
                  { value: 'integer', label: 'integer' },
                  { value: 'bigint', label: 'bigint' },
                  { value: 'boolean', label: 'boolean' },
                  { value: 'uuid', label: 'uuid' },
                  { value: 'jsonb', label: 'jsonb' },
                  { value: 'numeric(10,2)', label: 'numeric(10,2)' },
                  { value: 'timestamptz', label: 'timestamptz' },
                ]}
              />

              <label className="flex items-center gap-1.5 text-muted-foreground cursor-pointer">
                <Checkbox
                  checked={newColNullable}
                  onCheckedChange={setNewColNullable}
                />
                <span>Nullable</span>
              </label>

              <button
                type="submit"
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary hover:opacity-90 text-primary-foreground font-bold transition-colors ml-auto"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Column</span>
              </button>
            </form>

            {/* Columns Table */}
            <div className="border border-border rounded-xl overflow-hidden bg-card">
              <table className="w-full text-left border-collapse">
                <thead className="bg-background border-b border-border">
                  <tr>
                    <th className="p-3">Column Name</th>
                    <th className="p-3">Data Type</th>
                    <th className="p-3">Attributes</th>
                    <th className="p-3">Default Value</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {columns.map((c) => (
                    <tr key={c.name} className="hover:bg-accent/60 transition-colors">
                      <td className="p-3 font-bold text-foreground flex items-center gap-2">
                        {c.isPrimary && <Key className="w-3.5 h-3.5 text-amber-400" />}
                        <span>{c.name}</span>
                      </td>
                      <td className="p-3 text-primary">{c.type}</td>
                      <td className="p-3 space-x-1">
                        {c.isPrimary && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[10px]">
                            PK
                          </span>
                        )}
                        {!c.isNullable && (
                          <span className="px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/30 text-[10px]">
                            NOT NULL
                          </span>
                        )}
                        {c.isUnique && (
                          <span className="px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/30 text-[10px]">
                            UNIQUE
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-muted-foreground font-mono">
                        {c.defaultValue || '—'}
                      </td>
                      <td className="p-3 text-right">
                        {!c.isPrimary && (
                          <button
                            onClick={() => handleRemoveColumn(c.name)}
                            className="p-1 hover:bg-muted text-muted-foreground hover:text-destructive rounded transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'indexes' && (
          <div className="space-y-4 max-w-4xl font-mono text-xs">
            <div className="border border-border rounded-xl overflow-hidden bg-card">
              <table className="w-full text-left border-collapse">
                <thead className="bg-background border-b border-border">
                  <tr>
                    <th className="p-3">Index Name</th>
                    <th className="p-3">Columns</th>
                    <th className="p-3">Type</th>
                    <th className="p-3">Unique</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {indexes.map((idx) => (
                    <tr key={idx.name} className="hover:bg-accent/60 transition-colors">
                      <td className="p-3 font-bold text-foreground">{idx.name}</td>
                      <td className="p-3 text-primary">{idx.columns.join(', ')}</td>
                      <td className="p-3 text-muted-foreground">{idx.type}</td>
                      <td className="p-3">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] ${
                            idx.isUnique
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {idx.isUnique ? 'YES' : 'NO'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'ddl' && (
          <div className="max-w-4xl font-mono text-xs">
            <pre className="p-4 bg-card border border-border rounded-xl text-foreground overflow-x-auto leading-relaxed">
              {generateDdl()}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
