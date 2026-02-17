import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';
import { LucideIcon, Loader2 } from 'lucide-react'; // Import LucideIcon and Loader2

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        // Renamed 'default' to 'primary' for clarity
        primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
        danger: 'bg-red-600 text-white hover:bg-red-700',
        danger_outline: 'border border-red-500 text-red-600 hover:bg-red-50',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      // Updated default variant name
      variant: 'primary',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  icon?: LucideIcon;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      icon: Icon,
      iconPosition = 'left',
      fullWidth, // Destructure fullWidth
      loading, // Destructure loading
      children,
      ...props // Keep other standard button props
    },
    ref
  ) => {
    const isDisabled = loading || props.disabled; // Disable if loading or explicitly disabled

    return (
      <button
        className={cn(
          // Use the potentially undefined variant, CVA handles default
          buttonVariants({ variant, size, className }),
          fullWidth && 'w-full', // Conditionally add w-full class
          loading && 'relative' // Add relative positioning for spinner overlay if needed
        )}
        ref={ref}
        disabled={isDisabled} // Use the combined disabled state
        {...props} // Spread remaining valid HTML button attributes
      >
        {loading && (
          // Show spinner when loading, centered or next to text
          <Loader2 className={`animate-spin h-4 w-4 ${children ? (iconPosition === 'left' ? 'mr-2' : 'ml-2') : ''}`} />
        )}
        {!loading && Icon && iconPosition === 'left' && (
          <Icon className={`h-4 w-4 ${children ? 'mr-2' : ''}`} />
        )}
        {!loading && children /* Only show children if not loading */}
        {!loading && Icon && iconPosition === 'right' && (
          <Icon className={`h-4 w-4 ${children ? 'ml-2' : ''}`} />
        )}
      </button>
    );
  }
);
Button.displayName = 'Button';

export { Button };
