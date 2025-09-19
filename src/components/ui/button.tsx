import * as React from "react"

const buttonVariants = {
  variant: {
    default: "bg-blue-600 text-white hover:bg-blue-700",
    destructive: "bg-red-600 text-white hover:bg-red-700",
    outline: "border border-gray-300 bg-white hover:bg-gray-50",
    secondary: "bg-gray-100 text-gray-900 hover:bg-gray-200",
    ghost: "hover:bg-gray-100",
    link: "text-blue-600 underline hover:text-blue-700",
  },
  size: {
    default: "h-10 px-4 py-2",
    sm: "h-8 px-3 py-1",
    lg: "h-12 px-6 py-3",
    icon: "h-10 w-10",
  },
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof buttonVariants.variant
  size?: keyof typeof buttonVariants.size
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'default', size = 'default', ...props }, ref) => {
    const variantClass = buttonVariants.variant[variant]
    const sizeClass = buttonVariants.size[size]
    
    return (
      <button
        className={`inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ${variantClass} ${sizeClass} ${className}`}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button }