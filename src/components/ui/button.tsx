import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-xl border text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "border-transparent bg-[var(--accent)] px-4 py-2.5 text-white shadow-sm hover:bg-[#115e59]",
        secondary: "border-transparent bg-slate-900 px-4 py-2.5 text-white hover:bg-slate-800",
        outline:
          "border-[color:var(--border)] bg-white px-4 py-2.5 text-slate-700 hover:bg-slate-50",
        ghost: "border-transparent px-3 py-2 text-slate-600 hover:bg-slate-100",
        danger: "border-transparent bg-[var(--danger)] px-4 py-2.5 text-white hover:bg-[#912018]"
      },
      size: {
        default: "h-10",
        sm: "h-8 rounded-lg px-3 text-xs",
        lg: "h-11 px-5"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
  }
);

Button.displayName = "Button";

export { Button, buttonVariants };
