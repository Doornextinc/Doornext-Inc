interface LogoProps {
  size?: number
  className?: string
}

/** Nexter Driver — lightning bolt on dark background */
export function DriverLogo({ size = 32, className }: LogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 192 192"
      className={className}
      aria-label="Nexter Driver"
    >
      <rect width="192" height="192" rx="42" fill="#0A0A0A" />
      <polygon points="112,36 76,108 98,108 80,156 116,84 94,84" fill="#FF7A50" />
    </svg>
  )
}
