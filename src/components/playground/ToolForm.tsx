import React from 'react';
import { Info } from 'lucide-react';
import type { InputDoc, JsonSchema, ToolDoc } from '../../lib/toolsApi';

type Values = Record<string, unknown>;

const fieldClass = 'w-full rounded-lg border border-white/10 glass-inset px-3 py-2.5 font-mono text-xs text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-indigo-400/70 focus:ring-4 focus:ring-indigo-500/15';
const LONG_TEXT = new Set(['transaction', 'error']);

// One editable input, chosen from its JSON schema; documented with what it is and how to get it.
type FieldProps = { path: string; schema: JsonSchema; doc?: InputDoc; required: boolean; value: unknown; onChange: (v: unknown) => void };
const Field: React.FC<FieldProps> = ({ path, schema, doc, required, value, onChange }) => {
  const name = path.split('.').pop()!;
  const id = `field-${path}`;
  const label = (
    <label htmlFor={id} className="flex items-baseline justify-between gap-2">
      <span className="font-mono text-xs font-semibold text-slate-100">{path}{required && <span className="ml-0.5 text-rose-300" aria-label="required">*</span>}</span>
      <span className="text-[10px] text-slate-400">{doc?.type ?? schema.type ?? 'value'}{!required && ' · optional'}</span>
    </label>
  );
  const help = doc && (
    <div className="space-y-0.5 text-[11px] leading-5">
      <p className="text-slate-300">{doc.description}</p>
      <p className="flex gap-1 text-slate-400"><Info className="mt-0.5 h-3 w-3 shrink-0 text-indigo-300" /><span><span className="font-semibold text-indigo-200">How to get it:</span> {doc.howToGet}</span></p>
    </div>
  );

  let control: React.ReactNode;
  const enumValues = schema.enum ?? (schema.const !== undefined ? [schema.const] : null);
  if (enumValues) {
    control = (
      <select id={id} value={String(value ?? schema.default ?? '')} onChange={(e) => onChange(e.target.value || undefined)} className={fieldClass}>
        {!required && schema.default === undefined && <option value="">(default)</option>}
        {enumValues.map((v) => <option key={String(v)} value={String(v)}>{String(v)}</option>)}
      </select>
    );
  } else if (schema.type === 'boolean') {
    const on = Boolean(value ?? schema.default);
    control = (
      <button id={id} type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)}
        className={`relative h-6 w-11 rounded-full border transition ${on ? 'border-indigo-400/60 bg-indigo-500/40' : 'border-white/15 bg-white/5'}`}>
        <span className={`absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white shadow transition-all duration-300 ${on ? 'left-[22px]' : 'left-0.5'}`} />
      </button>
    );
  } else if (schema.type === 'integer' || schema.type === 'number') {
    control = <input id={id} type="number" inputMode="numeric" min={schema.minimum} max={schema.maximum} value={value === undefined || value === null ? '' : String(value)} placeholder={schema.default !== undefined ? `default ${schema.default}` : ''} onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))} className={fieldClass} />;
  } else if (schema.anyOf || LONG_TEXT.has(name)) {
    const text = typeof value === 'string' ? value : value === undefined ? '' : JSON.stringify(value, null, 2);
    control = <textarea id={id} rows={name === 'transaction' ? 5 : 3} spellCheck={false} value={text} onChange={(e) => onChange(e.target.value)} className={`${fieldClass} resize-y break-all`} placeholder={schema.anyOf ? 'Text, or a JSON object' : ''} />;
  } else {
    control = <input id={id} type="text" spellCheck={false} autoComplete="off" value={value === undefined || value === null ? '' : String(value)} placeholder={schema.default !== undefined ? `default ${schema.default}` : ''} onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)} className={fieldClass} />;
  }

  return <div className="space-y-1.5">{label}{control}{help}</div>;
};

export function ToolForm({ tool, values, onChange }: { tool: ToolDoc; values: Values; onChange: (values: Values) => void }) {
  const props = tool.inputSchema.properties ?? {};
  const required = new Set(tool.inputSchema.required ?? []);
  const docFor = (path: string) => tool.inputs.find((d) => d.name === path);
  const set = (key: string, v: unknown) => onChange({ ...values, [key]: v });

  return (
    <div className="space-y-4">
      {Object.entries(props).map(([key, schema]) => {
        if (schema.type === 'object' && schema.properties) {
          const inner = (values[key] as Values) ?? {};
          const innerRequired = new Set(schema.required ?? []);
          return (
            <fieldset key={key} className="space-y-4 rounded-xl border border-white/10 bg-white/[0.02] p-3">
              <legend className="px-1 font-mono text-xs font-semibold text-indigo-200">{key}{required.has(key) && <span className="text-rose-300">*</span>}</legend>
              {Object.entries(schema.properties).map(([innerKey, innerSchema]) => (
                <Field key={innerKey} path={`${key}.${innerKey}`} schema={innerSchema} doc={docFor(`${key}.${innerKey}`)} required={innerRequired.has(innerKey) && innerSchema.default === undefined}
                  value={inner[innerKey]} onChange={(v) => set(key, { ...inner, [innerKey]: v })} />
              ))}
            </fieldset>
          );
        }
        return <Field key={key} path={key} schema={schema} doc={docFor(key)} required={required.has(key) && schema.default === undefined} value={values[key]} onChange={(v) => set(key, v)} />;
      })}
      {Object.keys(props).length === 0 && <p className="text-xs text-slate-400">This tool needs no inputs.</p>}
    </div>
  );
}

// Turn form values into request arguments: drop empty optionals, parse JSON typed into union fields.
export function toArguments(tool: ToolDoc, values: Values): Values {
  const out: Values = {};
  for (const [key, schema] of Object.entries(tool.inputSchema.properties ?? {})) {
    let v = values[key];
    if (v === undefined || v === '') continue;
    if (schema.anyOf && typeof v === 'string' && v.trim().startsWith('{')) { try { v = JSON.parse(v); } catch { /* keep as text */ } }
    if (schema.type === 'object' && v && typeof v === 'object') v = Object.fromEntries(Object.entries(v as Values).filter(([, x]) => x !== undefined && x !== ''));
    out[key] = v;
  }
  return out;
}
