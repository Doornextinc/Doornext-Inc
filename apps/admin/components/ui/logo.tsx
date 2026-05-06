interface LogoProps {
  size?: number
  className?: string
}

/** Nexter Admin — shield with checkmark on dark background */
export function AdminLogo({ size = 32, className }: LogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 192 192"
      className={className}
      aria-label="Nexter Admin"
    >
      <rect width="192" height="192" rx="42" fill="#111111" />
      <path
        d="M 96 38 L 142 58 L 142 98 C 142 128 122 148 96 154 C 70 148 50 128 50 98 L 50 58 Z"
        fill="#FF6B35"
      />
      <polyline
        points="72,98 88,114 120,80"
        fill="none"
        stroke="white"
        strokeWidth="10"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
