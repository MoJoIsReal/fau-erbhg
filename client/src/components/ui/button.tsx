import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Sizes, radius, focus ring and the disabled treatment come from the design
// guide (§5, §7, §8): every control clears the 44px minimum touch target and
// the focus ring is 3px and sits outside the button. The guide's two rules for
// a disabled control — "around 0.55 opacity" and "keep the text readable" —
// pull against each other on a filled button (white on primary green at 55%
// over sand is 2.4:1), so this follows the readability one: a disabled button
// drops to the neutral hairline surface with body-coloured text, 7.7:1. This is the only change made
// to the vendored shadcn primitive — structure and API are untouched, so it
// still regenerates cleanly.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-token text-sm font-semibold ring-offset-background transition-colors duration-micro ease-guide focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          // text-primary-foreground rather than text-white: in the dark theme the
          // brand green lightens, and the label has to flip to dark ink with it.
          "bg-brand text-primary-foreground hover:bg-brand-hover active:bg-brand-active disabled:bg-hairline disabled:text-copy",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:bg-hairline disabled:text-copy",
        outline:
          "border border-brand/40 bg-surface text-brand hover:bg-green-50 hover:border-brand/60 disabled:border-hairline disabled:text-subtle",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 disabled:bg-hairline disabled:text-copy",
        ghost: "text-ink hover:bg-green-50 hover:text-brand disabled:text-subtle",
        link: "text-brand underline-offset-4 hover:underline hover:text-brand-hover disabled:text-subtle",
      },
      size: {
        default: "h-12 px-5 py-2",
        sm: "h-11 px-4 text-sm",
        lg: "h-12 px-8 text-base",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
