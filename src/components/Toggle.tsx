'use client';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
}

export function Toggle({ checked, onChange, disabled = false, size = 'md' }: ToggleProps) {
  const track = size === 'sm'
    ? 'w-7 h-4'
    : 'w-9 h-5';
  const thumb = size === 'sm'
    ? 'w-3 h-3 translate-x-0.5 peer-checked:translate-x-3.5'
    : 'w-3.5 h-3.5 translate-x-0.5 peer-checked:translate-x-4';

  return (
    <label className={`relative inline-flex items-center ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
      <input
        type="checkbox"
        className="sr-only peer"
        checked={checked}
        disabled={disabled}
        onChange={e => onChange(e.target.checked)}
      />
      <div className={`${track} rounded-full border transition-colors duration-200 bg-field border-line peer-checked:bg-brand peer-checked:border-brand`} />
      <div className={`absolute ${thumb} rounded-full bg-copy-3 peer-checked:bg-white transition-all duration-200 shadow-sm`} />
    </label>
  );
}
