import React, { useMemo } from 'react';
import {
  buildAdminWhatsAppUrl,
  collectAccessMetadata,
  WhatsAppRequestContext,
} from '../utils/whatsapp';

interface WhatsAppContactButtonProps {
  context: WhatsAppRequestContext;
  label: string;
  name?: string;
  email?: string;
  company?: string;
  variant?: 'solid' | 'subtle';
  fullWidth?: boolean;
  showMetadataPreview?: boolean;
}

export function WhatsAppLogoIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <path
        d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.31 20.62C8.76 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.04 14.69 2 12.04 2ZM17.75 16.12C17.51 16.8 16.36 17.39 15.81 17.47C15.31 17.55 14.68 17.58 13.99 17.36C13.57 17.22 13.03 17.04 12.34 16.74C9.43 15.49 7.53 12.56 7.38 12.37C7.24 12.18 6.2 10.8 6.2 9.37C6.2 7.94 6.95 7.24 7.21 6.95C7.47 6.66 7.78 6.59 7.98 6.59C8.17 6.59 8.37 6.59 8.54 6.6C8.72 6.61 8.96 6.53 9.2 7.11C9.44 7.7 10.03 9.14 10.1 9.29C10.17 9.44 10.22 9.61 10.12 9.8C10.03 9.99 9.98 10.11 9.83 10.28C9.69 10.45 9.53 10.66 9.4 10.79C9.26 10.93 9.11 11.09 9.28 11.38C9.45 11.67 10.03 12.62 10.89 13.39C12 14.38 12.94 14.69 13.23 14.84C13.52 14.98 13.69 14.96 13.86 14.77C14.03 14.58 14.59 13.92 14.78 13.63C14.97 13.34 15.17 13.39 15.44 13.49C15.71 13.59 17.14 14.29 17.43 14.44C17.72 14.58 17.92 14.65 17.99 14.77C18.06 14.9 18.06 15.44 17.75 16.12Z"
        fill="currentColor"
      />
    </svg>
  );
}

export default function WhatsAppContactButton({
  context,
  label,
  name,
  email,
  company,
  variant = 'solid',
  fullWidth = false,
  showMetadataPreview = false,
}: WhatsAppContactButtonProps) {
  const href = useMemo(
    () => buildAdminWhatsAppUrl({ context, name, email, company }),
    [context, name, email, company]
  );
  const meta = useMemo(() => collectAccessMetadata(), []);

  const styleClasses =
    variant === 'solid'
      ? 'bg-[#16A34A] text-white hover:bg-[#15803D] shadow-[var(--shadow-primary)]'
      : 'bg-[var(--raised)] text-[var(--green-11)] shadow-[var(--shadow-button)] hover:bg-[var(--green-3)]';

  return (
    <div className={fullWidth ? 'w-full space-y-1.5' : 'inline-flex flex-col gap-1.5'}>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`h-[var(--control-h)] px-3.5 rounded-[var(--radius-control)] inline-flex items-center justify-center gap-2 text-[13px] leading-[20px] font-medium tracking-[var(--tracking-label)] whitespace-nowrap shrink-0 cursor-pointer transition-[transform,scale,background-color,color] duration-[var(--dur-hover)] ease-[var(--ease-out)] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] ${styleClasses} ${
          fullWidth ? 'w-full' : ''
        }`}
      >
        <WhatsAppLogoIcon size={16} />
        <span>{label}</span>
      </a>
      {showMetadataPreview && (
        <div className="text-[11px] leading-[15px] text-[var(--ink-10)] font-mono tabular-nums truncate">
          Asal tercatat: {meta.hostname} · {meta.deviceSummary}
        </div>
      )}
    </div>
  );
}
