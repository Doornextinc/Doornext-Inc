import { cn } from '@/lib/utils'
import { ButtonHTMLAttributes, forwardRef } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  fullWidth?: boolean
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      loading = false,
      fullWidth = false,
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          'inline-flex items-center justify-center font-semibold rounded-2xl transition-all active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed',
          {
            'bg-[#FF6B35] text-white hover:bg-[#E55A24] active:bg-[#CC4A1A] shadow-cta disabled:shadow-none':
              variant === 'primary',
            'bg-gray-100 text-gray-800 hover:bg-gray-200 active:bg-gray-200': variant === 'secondary',
            'bg-transparent text-gray-700 hover:bg-gray-100': variant === 'ghost',
            'bg-red-500 text-white hover:bg-red-600 shadow-sm': variant === 'danger',
            'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50': variant === 'outline',
          },
          {
            'text-sm px-4 py-2.5 gap-1.5': size === 'sm',
            'text-[15px] px-5 py-3.5 gap-2': size === 'md',
            'text-base px-6 py-4 gap-2 font-bold': size === 'lg',
          },
          fullWidth && 'w-full',
          className
        )}
        {...props}
      >
        {loading ? (
          <svg
            className="animate-spin h-5 w-5"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        ) : (
          children
        )}
      </button>
    )
  }
)

Button.displayName = 'Button'
export { Button }
