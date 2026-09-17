import { useEffect, useState, type HTMLAttributes, type ReactNode } from 'react'
import clsx from 'clsx'

export function Card({
  children,
  className,
  ...rest
}: { children: ReactNode; className?: string } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        'rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-4 shadow-sm',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  )
}

export type Tone = 'neutral' | 'good' | 'bad' | 'warn' | 'info'

const pillStyle: Record<Tone, string> = {
  neutral: 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400',
  good: 'bg-lime-100 dark:bg-lime-900/50 text-lime-800 dark:text-lime-200',
  bad: 'bg-rose-100 dark:bg-rose-900/50 text-rose-800 dark:text-rose-200',
  warn: 'bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200',
  info: 'bg-sky-100 dark:bg-sky-900/50 text-sky-800 dark:text-sky-200',
}

/** A small label whose word carries the meaning; the color only repeats it. */
export function Pill({
  children,
  tone = 'neutral',
  className,
  title,
}: {
  children: ReactNode
  tone?: Tone
  className?: string
  title?: string
}) {
  return (
    <span
      className={clsx('rounded-full px-2 py-0.5 text-xs font-medium', pillStyle[tone], className)}
      title={title}
    >
      {children}
    </span>
  )
}

/**
 * Number input that commits on blur or Enter, so typing partial values never
 * pushes garbage through the engine.
 */
export function NumberInput({
  value,
  onChange,
  unit,
  min,
  max,
  step,
  className,
  ariaLabel,
  prefix,
}: {
  value: number
  onChange: (v: number) => void
  unit?: string
  prefix?: string
  min?: number
  max?: number
  step?: number
  className?: string
  ariaLabel?: string
}) {
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(value)), [value])
  const commit = () => {
    const raw = text.trim()
    const n = raw === '' ? Number.NaN : Number(raw)
    if (!Number.isFinite(n)) {
      // Empty or unreadable: keep the value as it was.
      setText(String(value))
      return
    }
    let clamped = min !== undefined ? Math.max(min, n) : n
    if (max !== undefined) clamped = Math.min(max, clamped)
    if (clamped !== value) onChange(clamped)
    else setText(String(value))
  }
  return (
    <span className={clsx('inline-flex items-center gap-1', className)}>
      {prefix && <span className="text-stone-400 dark:text-stone-500">{prefix}</span>}
      <input
        type="number"
        inputMode="decimal"
        aria-label={ariaLabel}
        className="w-24 rounded border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900 px-2 py-1 text-right text-sm tabular-nums focus:border-lime-600 focus:outline-none"
        value={text}
        min={min}
        max={max}
        step={step ?? 'any'}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
      />
      {unit && <span className="text-xs text-stone-500 dark:text-stone-400">{unit}</span>}
    </span>
  )
}

export const inputClass =
  'rounded border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900 px-2 py-1.5 text-sm focus:border-lime-600 focus:outline-none'

export function Field({
  label,
  children,
  hint,
  className,
}: {
  label: string
  children: ReactNode
  hint?: string
  className?: string
}) {
  return (
    <label className={clsx('flex flex-col gap-1 text-sm', className)}>
      <span className="text-stone-600 dark:text-stone-400">{label}</span>
      {children}
      {hint && <span className="text-xs text-stone-400 dark:text-stone-500">{hint}</span>}
    </label>
  )
}

export function Button({
  children,
  onClick,
  variant = 'secondary',
  type = 'button',
  className,
  disabled,
  title,
  ariaLabel,
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  type?: 'button' | 'submit'
  className?: string
  disabled?: boolean
  title?: string
  ariaLabel?: string
}) {
  const styles = {
    primary: 'bg-lime-700 text-white hover:bg-lime-800 dark:hover:bg-lime-600 border-lime-700',
    secondary:
      'bg-white dark:bg-stone-900 text-stone-800 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 border-stone-300 dark:border-stone-600',
    danger:
      'bg-white dark:bg-stone-900 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 border-rose-300 dark:border-rose-700',
    ghost:
      'bg-transparent text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 border-transparent',
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      className={clsx(
        'rounded-md border px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        styles[variant],
        className,
      )}
    >
      {children}
    </button>
  )
}

/** Page heading with an optional right-hand slot. */
export function PageHeader({
  title,
  children,
  subtitle,
}: {
  title: string
  children?: ReactNode
  subtitle?: string
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-stone-500 dark:text-stone-400">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  )
}
