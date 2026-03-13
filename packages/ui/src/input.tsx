import { cn } from '@doornext/shared/utils'
import { InputHTMLAttributes, forwardRef } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, leftIcon, rightIcon, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label className="text-sm font-medium text-gray-700">{label}</label>
        )}
        <div className="relative">
          {leftIcon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            className={cn(
              'w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-base text-gray-900 placeholder:text-gray-400',
              'focus:bg-white focus:border-[#FF6B35] focus:ring-2 focus:ring-[#FF6B35]/20 transition-all',
              leftIcon && 'pl-10',
              rightIcon && 'pr-10',
              error && 'border-red-400 focus:border-red-400 focus:ring-red-200',
              className
            )}
            {...props}
          />
          {rightIcon && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
              {rightIcon}
            </div>
          )}
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    )
  }
)

Input.displayName = 'Input'
export { Input }
