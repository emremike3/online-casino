import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'
import { sfx } from '@/lib/sound'

type Variant = 'primary' | 'win' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  silent?: boolean
}

const variants: Record<Variant, string> = {
  primary: 'btn-primary',
  win: 'btn-win',
  ghost: 'btn-ghost',
  danger: 'btn bg-loss/90 text-white hover:bg-loss',
}

const sizes: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2.5 text-sm',
  lg: 'px-5 py-3.5 text-base',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', silent, className, onClick, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(variants[variant], sizes[size], className)}
      onClick={(e) => {
        if (!silent) sfx.click()
        onClick?.(e)
      }}
      {...rest}
    >
      {children}
    </button>
  )
})
