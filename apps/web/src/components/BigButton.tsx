import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'talk' | 'chat' | 'end' | 'quiet';

const VARIANTS: Record<Variant, string> = {
  talk: 'bg-teal-800 text-white hover:bg-teal-900 focus-visible:ring-teal-300',
  chat: 'bg-amber-700 text-white hover:bg-amber-800 focus-visible:ring-amber-300',
  end: 'bg-red-700 text-white hover:bg-red-800 focus-visible:ring-red-300',
  quiet: 'bg-white text-slate-900 border-2 border-slate-300 hover:bg-slate-100 focus-visible:ring-slate-300',
};

interface BigButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
}

export function BigButton({
  variant = 'talk',
  className = '',
  children,
  ...props
}: BigButtonProps) {
  return (
    <button
      type="button"
      className={`min-h-[64px] rounded-2xl px-8 py-6 text-3xl font-semibold shadow-lg transition focus:outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
