interface LogoProps {
  size?: number
  className?: string
}

/** Doornext Maker — flame on orange background */
export function MakerLogo({ size = 32, className }: LogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 192 192"
      className={className}
      aria-label="Doornext Maker"
    >
      <rect width="192" height="192" rx="42" fill="#FF6B35" />
      <path
        d="M 96 36 C 78 58 58 80 58 108 C 58 134 74 156 96 156 C 118 156 134 134 134 108 C 134 80 114 58 96 36 Z"
        fill="white"
      />
      <path
        d="M 96 70 C 86 86 80 100 80 114 C 80 128 87 140 96 140 C 105 140 112 128 112 114 C 112 100 106 86 96 70 Z"
        fill="#FF6B35"
        opacity="0.22"
      />
    </svg>
  )
}
