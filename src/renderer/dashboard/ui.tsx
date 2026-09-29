import { useEffect, type JSX, type ReactNode } from 'react'
import { create } from 'zustand'

// ---------- tiny shared UI bits ----------

export const inputCls =
  'rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-sky-400 dark:border-slate-600 dark:bg-slate-800'
export const btnCls = 'rounded-lg px-3 py-1.5 text-sm font-medium transition active:scale-[0.98] disabled:opacity-40'
export const primaryBtn = `${btnCls} bg-sky-500 text-white hover:bg-sky-600`
export const ghostBtn = `${btnCls} bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600`

export function Card({ title, children, className = '' }: { title?: string; children: ReactNode; className?: string }): JSX.Element {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800 ${className}`}>
      {title && <h2 className="mb-3 text-sm font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">{title}</h2>}
      {children}
    </section>
  )
}

export function Empty({ icon, text }: { icon: string; text: string }): JSX.Element {
  return (
    <div className="py-8 text-center text-sm text-slate-400">
      <div className="mb-1 text-3xl">{icon}</div>
      {text}
    </div>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }): JSX.Element {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-slate-600 dark:text-slate-300">{label}</span>
      {children}
      {hint && <span className="text-xs text-slate-400">{hint}</span>}
    </label>
  )
}

// ---------- toasts ----------

interface Toast {
  id: number
  text: string
  action?: { label: string; run: () => void }
}
const useToasts = create<{ list: Toast[] }>(() => ({ list: [] }))
let nextId = 1

export function toast(text: string, action?: Toast['action'], ms = 5000): void {
  const id = nextId++
  useToasts.setState((s) => ({ list: [...s.list, { id, text, action }] }))
  setTimeout(() => useToasts.setState((s) => ({ list: s.list.filter((t) => t.id !== id) })), ms)
}

export function Toasts(): JSX.Element {
  const list = useToasts((s) => s.list)
  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 flex-col gap-2">
      {list.map((t) => (
        <div key={t.id} className="flex items-center gap-3 rounded-xl bg-slate-900 px-4 py-2.5 text-sm text-white shadow-xl dark:bg-slate-100 dark:text-slate-900">
          <span>{t.text}</span>
          {t.action && (
            <button
              className="font-semibold text-sky-400 dark:text-sky-600"
              onClick={() => {
                t.action!.run()
                useToasts.setState((s) => ({ list: s.list.filter((x) => x.id !== t.id) }))
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

/** Re-render every `ms` so relative times stay fresh. */
export function useTicker(ms: number, cb: () => void): void {
  useEffect(() => {
    const t = setInterval(cb, ms)
    return () => clearInterval(t)
  }, [ms, cb])
}
