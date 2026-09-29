import type { JSX } from 'react'
import type { PetState } from './fsm'

/**
 * Contract for pet renderers. To use PNG sprite sheets instead, write a component with these
 * props that picks a sheet row by `state` and animates frames with CSS steps(), then swap it in
 * Pet.tsx (`const Renderer = ...`). Everything else (FSM, physics, bubbles) stays the same.
 */
export interface PetRendererProps {
  state: PetState
  facing: 1 | -1
  level: number
  size: number
  theme: string
}

const THEMES: Record<string, [string, string, string]> = {
  aqua: ['#7dd3fc', '#0ea5e9', '#0369a1'],
  mint: ['#99f6e4', '#14b8a6', '#0f766e'],
  lavender: ['#ddd6fe', '#8b5cf6', '#6d28d9'],
  peach: ['#fed7aa', '#fb923c', '#c2410c']
}

// Droplet body in a 100×110 box: pointed top, round bottom.
const BODY = 'M50 4 C62 22 86 42 86 68 C86 90 70 104 50 104 C30 104 14 90 14 68 C14 42 38 22 50 4 Z'

function Eyes({ state, level }: { state: PetState; level: number }): JSX.Element {
  if (state === 'sleep')
    return (
      <g stroke="#1e293b" strokeWidth="3" strokeLinecap="round" fill="none">
        <path d="M32 66 q6 5 12 0" />
        <path d="M56 66 q6 5 12 0" />
      </g>
    )
  if (state === 'celebrate')
    return (
      <g stroke="#1e293b" strokeWidth="3.5" strokeLinecap="round" fill="none">
        <path d="M32 67 q6 -8 12 0" />
        <path d="M56 67 q6 -8 12 0" />
      </g>
    )
  const r = state === 'alert' || level >= 2 ? 7.5 : 6.5
  return (
    <g className="pet-eyes">
      <ellipse cx="38" cy="64" rx={r} ry={r + 1.5} fill="#1e293b" />
      <ellipse cx="62" cy="64" rx={r} ry={r + 1.5} fill="#1e293b" />
      <circle cx="40.5" cy="60.5" r="2.4" fill="#fff" />
      <circle cx="64.5" cy="60.5" r="2.4" fill="#fff" />
      {state === 'escalate' && (
        <g stroke="#1e293b" strokeWidth="2.5" strokeLinecap="round">
          <path d="M30 52 l10 3" />
          <path d="M70 52 l-10 3" />
        </g>
      )}
    </g>
  )
}

function Mouth({ state }: { state: PetState }): JSX.Element {
  switch (state) {
    case 'celebrate':
      return <path d="M42 78 q8 10 16 0 Z" fill="#7f1d1d" />
    case 'thirsty':
    case 'escalate':
      return <ellipse cx="50" cy="80" rx="4" ry="4.5" fill="#7f1d1d" />
    case 'sleep':
      return <path d="M46 80 q4 2 8 0" stroke="#1e293b" strokeWidth="2" fill="none" strokeLinecap="round" />
    case 'alert':
      return <ellipse cx="50" cy="79" rx="3" ry="2.5" fill="#7f1d1d" />
    default:
      return <path d="M44 77 q6 6 12 0" stroke="#1e293b" strokeWidth="2.5" fill="none" strokeLinecap="round" />
  }
}

export function DropletRenderer({ state, facing, level, size, theme }: PetRendererProps): JSX.Element {
  const [light, mid, dark] = THEMES[theme] ?? THEMES.aqua
  const gid = `g-${theme}`
  const walking = state === 'wander' || state === 'thirsty' || state === 'escalate'
  return (
    <svg
      width={size}
      height={size * 1.1}
      viewBox="0 -2 100 112"
      className={`pet-svg state-${state} level-${level}`}
      style={{ overflow: 'visible' }}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={light} />
          <stop offset="1" stopColor={mid} />
        </linearGradient>
      </defs>
      <g transform={facing === -1 ? 'translate(100 0) scale(-1 1)' : undefined}>
      <g className={walking ? 'pet-feet walking' : 'pet-feet'}>
        <ellipse className="foot-l" cx="38" cy="104" rx="8" ry="4.5" fill={dark} />
        <ellipse className="foot-r" cx="62" cy="104" rx="8" ry="4.5" fill={dark} />
      </g>
      <g className="pet-body">
        <path d={BODY} fill={`url(#${gid})`} stroke={dark} strokeWidth="2" />
        <ellipse cx="34" cy="40" rx="6" ry="9" fill="#fff" opacity="0.55" transform="rotate(25 34 40)" />
        <circle cx="28" cy="76" r="5" fill="#fb7185" opacity="0.35" />
        <circle cx="72" cy="76" r="5" fill="#fb7185" opacity="0.35" />
        <Eyes state={state} level={level} />
        <Mouth state={state} />
        {(state === 'thirsty' || state === 'escalate') && (
          // Empty glass held up in the right hand.
          <g className="pet-prop">
            <path d="M84 70 q8 -4 10 -12" stroke={dark} strokeWidth="3" fill="none" strokeLinecap="round" />
            <path d="M88 36 h16 l-2 22 h-12 Z" fill="#e0f2fe" fillOpacity="0.7" stroke="#64748b" strokeWidth="1.8" />
            <path d="M90 52 h12 l-0.6 6 h-10.8 Z" fill={mid} opacity="0.6" />
          </g>
        )}
        {state === 'alert' && (
          // Little clipboard / sign.
          <g className="pet-prop">
            <path d="M84 72 q8 -4 8 -14" stroke={dark} strokeWidth="3" fill="none" strokeLinecap="round" />
            <rect x="84" y="30" width="22" height="28" rx="3" fill="#fef3c7" stroke="#92400e" strokeWidth="1.8" />
            <rect x="90" y="27" width="10" height="5" rx="1.5" fill="#92400e" />
            <path d="M88 39 h14 M88 45 h14 M88 51 h9" stroke="#92400e" strokeWidth="1.6" />
          </g>
        )}
      </g>
      </g>
      {state === 'sleep' && (
        <g className="pet-zzz" fill={dark} fontFamily="system-ui" fontWeight="700">
          <text x="74" y="22" fontSize="14">Z</text>
          <text x="86" y="8" fontSize="11">z</text>
          <text x="95" y="-4" fontSize="8">z</text>
        </g>
      )}
    </svg>
  )
}
