import { useEffect, useId, useState, type ReactNode } from 'react';
import { formatLength, parseLength, toUnits } from '../model/units';
import { useLayout } from '../state/store';

export function Row({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  const id = useId();
  return (
    <label className="row" htmlFor={id} title={hint}>
      <span className="row-label">{label}</span>
      <span className="row-input" id={id}>
        {children}
      </span>
    </label>
  );
}

/**
 * Length input in the current display unit. Accepts decimals and tape-measure
 * notation (5' 3.5", 160cm). Commits on Enter/blur; Escape reverts.
 */
export function LengthField({
  value,
  onChange,
  min,
  max,
  label,
  hint,
}: {
  value: number;
  onChange: (inches: number) => void;
  min?: number;
  max?: number;
  label: string;
  hint?: string;
}) {
  const { layout } = useLayout();
  const units = layout.units;
  const shown = String(Number(toUnits(value, units).toFixed(2)));
  const [text, setText] = useState(shown);
  const [bad, setBad] = useState(false);
  useEffect(() => {
    setText(shown);
    setBad(false);
  }, [shown]);

  const commit = () => {
    const parsed = parseLength(text, units);
    if (parsed === undefined || (min !== undefined && parsed < min) || (max !== undefined && parsed > max)) {
      setBad(true);
      return;
    }
    setBad(false);
    if (Math.abs(parsed - value) > 1e-9) onChange(parsed);
  };

  return (
    <Row label={label} hint={hint ?? (min !== undefined ? `Minimum ${formatLength(min, units)}` : undefined)}>
      <input
        className={`input ${bad ? 'bad' : ''}`}
        value={text}
        inputMode="decimal"
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setText(shown);
            setBad(false);
          }
        }}
      />
      <span className="unit">{units}</span>
    </Row>
  );
}

export function NumberField({
  value,
  onChange,
  label,
  unit,
  min,
  max,
  step,
}: {
  value: number;
  onChange: (n: number) => void;
  label: string;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
}) {
  const [text, setText] = useState(String(value));
  const [bad, setBad] = useState(false);
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const n = Number(text.replace(',', '.'));
    if (!Number.isFinite(n) || (min !== undefined && n < min) || (max !== undefined && n > max)) {
      setBad(true);
      return;
    }
    setBad(false);
    if (n !== value) onChange(n);
  };
  return (
    <Row label={label}>
      <input
        className={`input ${bad ? 'bad' : ''}`}
        value={text}
        inputMode="decimal"
        step={step}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      {unit && <span className="unit">{unit}</span>}
    </Row>
  );
}

export function TextField({ value, onChange, label }: { value: string; onChange: (s: string) => void; label: string }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <Row label={label}>
      <input
        className="input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text !== value && onChange(text)}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
    </Row>
  );
}

export function SelectField<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <Row label={label}>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </Row>
  );
}

export function CheckField({ value, onChange, label }: { value: boolean; onChange: (b: boolean) => void; label: string }) {
  return (
    <label className="row check">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}
