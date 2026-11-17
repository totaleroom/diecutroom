import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';

/* -------------------------------------------------------------------------- */
/* TactileButton                                                              */
/* -------------------------------------------------------------------------- */

export interface TactileButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'pill' | 'ghost' | 'icon' | 'destructive';
  size?: 'default' | 'compact' | 'pill' | 'inline';
}

export const TactileButton = React.forwardRef<HTMLButtonElement, TactileButtonProps>(
  ({ variant = 'secondary', size = 'default', className = '', children, ...props }, ref) => {
    const heightClass =
      variant === 'pill'
        ? 'h-[var(--control-h-pill)] px-2.5 rounded-full gap-1.5'
        : variant === 'icon'
        ? 'size-[var(--control-h-pill)] rounded-[var(--radius-control)] justify-center'
        : size === 'compact'
        ? 'h-[var(--control-h-compact)] px-2.5 rounded-[var(--radius-control)] gap-1.5'
        : size === 'inline'
        ? 'h-[var(--control-h-inline)] px-2 rounded-[var(--radius-control)] gap-1 text-[12px]'
        : 'h-[var(--control-h)] px-3.5 rounded-[var(--radius-control)] gap-1.5';

    const variantClass = {
      primary:
        'bg-[var(--primary-bg)] text-[var(--primary-fg)] shadow-[var(--shadow-primary)] hover:bg-[var(--primary-hover)] active:scale-[0.97]',
      secondary:
        'bg-[var(--raised)] text-[var(--ink-12)] shadow-[var(--shadow-button)] hover:bg-[var(--root-ink-2)] active:scale-[0.97]',
      pill:
        'bg-[var(--raised)] text-[var(--ink-12)] shadow-[var(--shadow-toggle)] hover:bg-[var(--root-ink-2)] active:scale-[0.97]',
      ghost:
        'bg-transparent text-[var(--ink-11)] hover:text-[var(--ink-12)] hover:bg-[var(--ink-3)] active:scale-[0.97]',
      icon:
        'bg-transparent text-[var(--ink-10)] hover:text-[var(--ink-12)] hover:bg-[var(--ink-3)] active:scale-[0.92]',
      destructive:
        'bg-[var(--raised)] text-[var(--red-11)] shadow-[var(--shadow-button)] hover:bg-[var(--red-3)] active:scale-[0.97]',
    }[variant];

    const hasDisplayOverride = /\b(hidden|flex|inline-flex|block|grid)\b/.test(className);

    return (
      <button
        ref={ref}
        className={`${
          hasDisplayOverride ? '' : 'inline-flex'
        } items-center justify-center whitespace-nowrap text-[13px] leading-[20px] font-medium tracking-[var(--tracking-label)] select-none cursor-pointer transition-[transform,scale,background-color,color,opacity] duration-[var(--dur-hover)] ease-[var(--ease-out)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:opacity-60 disabled:pointer-events-none disabled:active:scale-100 ${heightClass} ${variantClass} ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  }
);
TactileButton.displayName = 'TactileButton';

/* -------------------------------------------------------------------------- */
/* TactileSegmented                                                           */
/* -------------------------------------------------------------------------- */

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
}

interface TactileSegmentedProps<T extends string> {
  value: T;
  options: Array<SegmentedOption<T>>;
  onChange: (value: T) => void;
  size?: 'default' | 'compact';
  fullWidth?: boolean;
  shape?: 'pill' | 'control';
  className?: string;
  ariaLabel?: string;
}

export function TactileSegmented<T extends string>({
  value,
  options,
  onChange,
  size = 'default',
  fullWidth = false,
  shape = 'pill',
  className = '',
  ariaLabel,
}: TactileSegmentedProps<T>) {
  const layoutId = useId();
  const prefersReduced = useReducedMotion();

  const handleKeyDown = (e: React.KeyboardEvent, idx: number) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      onChange(options[(idx + 1) % options.length].value);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      onChange(options[(idx - 1 + options.length) % options.length].value);
    }
  };

  const trackRadius = shape === 'pill' ? 'rounded-full' : 'rounded-[var(--radius-container)]';
  const pillRadius = shape === 'pill' ? 'rounded-full' : 'rounded-[var(--radius-control)]';
  const trackPadding = size === 'compact' ? 'p-[3px]' : 'p-1';
  const optHeight = size === 'compact' ? 'h-[26px] px-2.5 text-[12px]' : 'h-[28px] px-3 text-[13px]';

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={`inline-flex items-center gap-0.5 bg-[var(--ink-3)] overflow-hidden ${trackPadding} ${trackRadius} ${
        fullWidth ? 'w-full grid' : ''
      } ${className}`}
      style={fullWidth ? { gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` } : undefined}
    >
      {options.map((opt, idx) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            className={`relative flex items-center justify-center gap-1.5 whitespace-nowrap font-medium tracking-[var(--tracking-label)] cursor-pointer select-none transition-colors duration-[var(--dur-hover)] ease-[var(--ease-out)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus-ring)] ${optHeight} ${pillRadius} ${
              active ? 'text-[var(--ink-12)]' : 'text-[var(--ink-11)] hover:text-[var(--ink-12)]'
            }`}
          >
            {active && (
              <motion.span
                layoutId={`seg-${layoutId}`}
                initial={false}
                transition={
                  prefersReduced
                    ? { duration: 0.15 }
                    : { type: 'spring', bounce: 0.12, duration: 0.38 }
                }
                className={`absolute inset-0 bg-[var(--raised)] shadow-[var(--shadow-toggle)] ${pillRadius}`}
              />
            )}
            <span className="relative z-10 inline-flex items-center justify-center gap-1.5">
              {opt.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* TactileInputWell & TactileTextareaWell                                     */
/* -------------------------------------------------------------------------- */

export interface TactileInputWellProps extends React.InputHTMLAttributes<HTMLInputElement> {
  suffix?: string;
  mono?: boolean;
  error?: boolean;
  compact?: boolean;
}

export const TactileInputWell = React.forwardRef<HTMLInputElement, TactileInputWellProps>(
  ({ suffix, mono = false, error = false, compact = true, className = '', ...props }, ref) => {
    const hClass = compact ? 'h-[32px]' : 'h-[var(--control-h)]';
    return (
      <div className="relative flex items-center w-full">
        <input
          ref={ref}
          className={`w-full ${hClass} rounded-[var(--radius-control)] border-0 bg-[var(--ink-3)] px-2.5 text-[length:var(--text-field)] leading-[var(--leading-body)] text-[var(--ink-12)] placeholder:text-[var(--ink-10)] outline-none transition-[background-color,box-shadow] duration-[var(--dur-hover)] ease-[var(--ease-out)] focus:bg-[var(--ink-4)] focus-visible:shadow-[0_0_0_2px_var(--focus-ring)] disabled:opacity-60 ${
            error ? 'shadow-[0_0_0_1px_var(--red-11)]' : ''
          } ${mono ? 'font-mono tabular-nums tracking-[0.01em]' : 'tabular-nums'} ${
            suffix ? 'pr-8' : ''
          } ${className}`}
          {...props}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-2.5 text-[11px] text-[var(--ink-10)] select-none">
            {suffix}
          </span>
        )}
      </div>
    );
  }
);
TactileInputWell.displayName = 'TactileInputWell';

export interface TactileTextareaWellProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

export const TactileTextareaWell = React.forwardRef<HTMLTextAreaElement, TactileTextareaWellProps>(
  ({ error = false, className = '', ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={`w-full min-h-[76px] rounded-[var(--radius-control)] border-0 bg-[var(--ink-3)] px-2.5 py-2 text-[length:var(--text-field)] leading-[var(--leading-body)] text-[var(--ink-12)] placeholder:text-[var(--ink-10)] outline-none resize-none transition-[background-color,box-shadow] duration-[var(--dur-hover)] ease-[var(--ease-out)] focus:bg-[var(--ink-4)] focus-visible:shadow-[0_0_0_2px_var(--focus-ring)] disabled:opacity-60 ${
          error ? 'shadow-[0_0_0_1px_var(--red-11)]' : ''
        } ${className}`}
        {...props}
      />
    );
  }
);
TactileTextareaWell.displayName = 'TactileTextareaWell';

/* -------------------------------------------------------------------------- */
/* TactileSelect (Custom Dropdown per tactile-design: no check on chosen)     */
/* -------------------------------------------------------------------------- */

export interface TactileSelectOption<T extends string | number> {
  value: T;
  label: string;
  hint?: string;
}

interface TactileSelectProps<T extends string | number> {
  value: T;
  options: Array<TactileSelectOption<T>>;
  onChange: (value: T) => void;
  compact?: boolean;
  className?: string;
  ariaLabel?: string;
}

export function TactileSelect<T extends string | number>({
  value,
  options,
  onChange,
  compact = true,
  className = '',
  ariaLabel,
}: TactileSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number }>({
    top: 0,
    left: 0,
    width: 200,
  });
  const [activeIdx, setActiveIdx] = useState<number>(() =>
    Math.max(0, options.findIndex((o) => o.value === value))
  );
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value) || options[0];

  const updatePosition = () => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const menuEstHeight = Math.min(272, options.length * 38 + 12);
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const top =
      spaceBelow >= menuEstHeight || spaceBelow >= rect.top
        ? rect.bottom + 6
        : Math.max(12, rect.top - menuEstHeight - 6);
    const width = Math.max(rect.width, 168);
    const left = Math.min(rect.left, window.innerWidth - width - 12);
    setCoords({ top, left, width });
  };

  useEffect(() => {
    if (!open) return;
    updatePosition();
    setActiveIdx(Math.max(0, options.findIndex((o) => o.value === value)));

    const onOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx((i) => (i + 1) % options.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx((i) => (i - 1 + options.length) % options.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const picked = options[activeIdx];
        if (picked) {
          onChange(picked.value);
          setOpen(false);
          triggerRef.current?.focus();
        }
      }
    };
    const onResizeOrScroll = (e: Event) => {
      if (menuRef.current && menuRef.current.contains(e.target as Node)) return;
      setOpen(false);
    };

    window.addEventListener('mousedown', onOutside);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResizeOrScroll);
    window.addEventListener('scroll', onResizeOrScroll, true);
    return () => {
      window.removeEventListener('mousedown', onOutside);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResizeOrScroll);
      window.removeEventListener('scroll', onResizeOrScroll, true);
    };
  }, [open, activeIdx, options, value, onChange]);

  const hClass = compact ? 'h-[32px]' : 'h-[var(--control-h)]';

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
        className={`w-full ${hClass} px-2.5 rounded-[var(--radius-control)] bg-[var(--raised)] text-[var(--ink-12)] text-[13px] leading-[20px] font-medium shadow-[var(--shadow-button)] flex items-center justify-between gap-2 cursor-pointer select-none hover:bg-[var(--root-ink-2)] active:scale-[0.98] transition-[transform,scale,background-color] duration-[var(--dur-hover)] ease-[var(--ease-out)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] ${className}`}
      >
        <span className="truncate text-left">{selected?.label}</span>
        <ChevronDown
          size={15}
          strokeWidth={1.75}
          className={`shrink-0 text-[var(--ink-9)] transition-transform duration-[var(--dur-hover)] ease-[var(--ease-out)] ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            className="surface-overlay fixed z-[110] bg-[var(--overlay)] rounded-[var(--radius-container)] shadow-[var(--shadow-menu)] p-1 max-h-[272px] overflow-y-auto origin-top"
            style={{
              top: coords.top,
              left: coords.left,
              width: coords.width,
              animation: 'tactileMenuIn 150ms cubic-bezier(0.23, 1, 0.32, 1)',
            }}
          >
            <div className="flex flex-col gap-[2px]">
              {options.map((opt, idx) => {
                const isChosen = opt.value === value;
                const isHighlighted = idx === activeIdx;
                return (
                  <button
                    key={String(opt.value)}
                    type="button"
                    role="option"
                    aria-selected={isChosen}
                    onMouseEnter={() => setActiveIdx(idx)}
                    onClick={() => {
                      onChange(opt.value);
                      setOpen(false);
                      triggerRef.current?.focus();
                    }}
                    className={`w-full text-left px-2.5 py-1.5 min-h-[34px] rounded-[var(--radius-control)] flex flex-col justify-center cursor-pointer transition-colors duration-[var(--dur-hover)] ease-[var(--ease-out)] ${
                      isChosen
                        ? 'bg-[var(--root-ink-3)] text-[var(--ink-12)]'
                        : isHighlighted
                        ? 'bg-[var(--root-ink-2)] text-[var(--ink-12)]'
                        : 'text-[var(--ink-11)] hover:bg-[var(--root-ink-2)] hover:text-[var(--ink-12)]'
                    }`}
                  >
                    <span className="text-[13px] leading-[18px] truncate">{opt.label}</span>
                    {opt.hint && (
                      <span className="text-[11px] leading-[15px] text-[var(--ink-10)] truncate">
                        {opt.hint}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* TactileCheckbox & TactileSwitch                                            */
/* -------------------------------------------------------------------------- */

interface TactileCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: React.ReactNode;
  className?: string;
}

export function TactileCheckbox({
  checked,
  onChange,
  label,
  className = '',
}: TactileCheckboxProps) {
  return (
    <label className={`inline-flex items-center gap-2 cursor-pointer select-none group ${className}`}>
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`size-[18px] shrink-0 rounded-[var(--radius-sm)] flex items-center justify-center transition-[background-color,box-shadow,transform,scale] duration-[var(--dur-hover)] ease-[var(--ease-out)] active:scale-[0.92] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] ${
          checked
            ? 'bg-[var(--ink-12)] text-[var(--surface-top)] shadow-none'
            : 'bg-[var(--raised)] shadow-[inset_0_0_0_1.5px_var(--ink-6)] group-hover:shadow-[inset_0_0_0_1.5px_var(--ink-7)]'
        }`}
      >
        {checked && <Check size={12} strokeWidth={2.5} />}
      </button>
      {label && <span className="text-[13px] leading-[18px] text-[var(--ink-11)] group-hover:text-[var(--ink-12)]">{label}</span>}
    </label>
  );
}

interface TactileSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel?: string;
}

export function TactileSwitch({ checked, onChange, ariaLabel }: TactileSwitchProps) {
  const prefersReduced = useReducedMotion();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      className={`w-[44px] h-[24px] p-[3px] rounded-full flex items-center cursor-pointer transition-colors duration-[var(--dur-hover)] ease-[var(--ease-out)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] ${
        checked ? 'bg-[var(--green-9)] justify-end' : 'bg-[var(--ink-7)] justify-start'
      }`}
    >
      <motion.span
        layout
        initial={false}
        transition={
          prefersReduced
            ? { duration: 0 }
            : { type: 'spring', bounce: 0.2, duration: 0.4 }
        }
        className="size-[18px] rounded-full bg-[var(--surface-top)] shadow-[var(--shadow-toggle)]"
      />
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* TactileSheet (Desktop Slide-Over Side Panel)                               */
/* -------------------------------------------------------------------------- */

interface TactileSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
}

export function TactileSheet({
  open,
  onClose,
  title,
  description,
  headerAction,
  children,
}: TactileSheetProps) {
  const titleId = useId();
  const prefersReduced = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex justify-end">
      {/* Crisp subtle backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-[var(--backdrop)] backdrop-blur-[2px] transition-opacity duration-[200ms]"
      />

      {/* Side Panel Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="surface-overlay relative z-[101] my-2 mr-2 w-[min(640px,calc(100vw-16px))] h-[calc(100dvh-16px)] bg-[var(--overlay)] rounded-[var(--radius-container)] shadow-[var(--shadow-modal)] flex flex-col overflow-hidden"
        style={
          prefersReduced
            ? undefined
            : { animation: 'tactileSheetIn 240ms cubic-bezier(0.23, 1, 0.32, 1)' }
        }
      >
        {/* Header Band */}
        <div className="px-5 pt-5 pb-4 border-b-[0.5px] border-[var(--line)] flex items-start justify-between gap-4 shrink-0">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[16px] leading-[24px] text-[var(--ink-12)] font-medium">
              {title}
            </h2>
            {description && (
              <p className="mt-1 text-[13px] leading-[20px] text-[var(--ink-11)]">{description}</p>
            )}
          </div>
          {headerAction && <div className="shrink-0">{headerAction}</div>}
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">{children}</div>

        {/* Footer Band */}
        <div className="px-4 py-3 border-t-[0.5px] border-[var(--line)] flex items-center justify-end gap-3 shrink-0 bg-[var(--overlay)]">
          <TactileButton type="button" variant="secondary" onClick={onClose}>
            Close
          </TactileButton>
        </div>
      </div>
    </div>,
    document.body
  );
}
