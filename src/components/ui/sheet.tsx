"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

export const Sheet = Dialog.Root;
export const SheetTrigger = Dialog.Trigger;
export const SheetClose = Dialog.Close;

export function SheetContent({
  className,
  children,
  side = "right",
  ...props
}: Dialog.DialogContentProps & { side?: "right" | "left" }) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-950/25 backdrop-blur-[2px]" />
      <Dialog.Content
        className={cn(
          "fixed z-50 flex h-full w-full max-w-lg flex-col border-[color:var(--border)] bg-white shadow-2xl",
          side === "right" ? "right-0 top-0 border-l" : "left-0 top-0 border-r",
          className
        )}
        {...props}
      >
        {children}
        <Dialog.Close className="absolute right-4 top-4 rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </Dialog.Close>
      </Dialog.Content>
    </Dialog.Portal>
  );
}

export function SheetHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("border-b border-[color:var(--border)] px-6 py-5", className)} {...props} />;
}

export function SheetFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mt-auto border-t border-[color:var(--border)] px-6 py-4", className)} {...props} />;
}

export const SheetTitle = Dialog.Title;
export const SheetDescription = Dialog.Description;

