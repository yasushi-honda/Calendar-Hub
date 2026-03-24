import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0a0a0f',
        borderRadius: 40,
      }}
    >
      <svg viewBox="0 0 32 32" width="120" height="120">
        <rect
          x="4"
          y="8"
          width="24"
          height="20"
          rx="3"
          fill="none"
          stroke="#e07850"
          strokeWidth="2"
        />
        <rect x="4" y="8" width="24" height="6" rx="3" fill="#e07850" />
        <line x1="9" y1="4" x2="9" y2="10" stroke="#e07850" strokeWidth="2" strokeLinecap="round" />
        <line
          x1="23"
          y1="4"
          x2="23"
          y2="10"
          stroke="#e07850"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx="11" cy="20" r="2" fill="#e07850" opacity="0.8" />
        <circle cx="21" cy="20" r="2" fill="#e07850" opacity="0.4" />
        <circle cx="16" cy="24" r="2" fill="#e07850" opacity="0.6" />
      </svg>
    </div>,
    size,
  );
}
