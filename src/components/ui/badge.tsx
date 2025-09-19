import React from "react"

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline'
}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className = '', variant = 'default', ...props }, ref) => {
    const variantClasses = {
      default: "bg-blue-600 text-white",
      secondary: "bg-gray-100 text-gray-900",
      destructive: "bg-red-600 text-white",
      outline: "border border-gray-300 bg-white text-gray-900"
    }
    
    return (
      <div
        ref={ref}
        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors ${variantClasses[variant]} ${className}`}
        {...props}
      />
    )
  }
)
Badge.displayName = "Badge"

export { Badge }