interface LogoProps {
  size?: number
  className?: string
}

/** Doornext — arched door on orange background */
export function CustomerLogo({ size = 32, className }: LogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 192 192"
      className={className}
      aria-label="Doornext"
    >
      <rect width="192" height="192" rx="42" fill="#FF6B35" />
      <path d="M 58 152 L 58 92 A 38 50 0 0 1 134 92 L 134 152 Z" fill="white" />
      <path d="M 70 100 L 70 92 A 26 36 0 0 1 122 92 L 122 100 Z" fill="#FF6B35" opacity="0.18" />
      <rect x="70" y="104" width="52" height="36" rx="4" fill="#FF6B35" opacity="0.12" />
      <circle cx="116" cy="124" r="5.5" fill="#FF6B35" />
    </svg>
  )
}
