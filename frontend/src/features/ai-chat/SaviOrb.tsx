import { Bot, Globe, Loader2, Sparkles } from 'lucide-react';

export type SaviState = 'idle' | 'thinking' | 'searching' | 'responding';

interface SaviOrbProps {
  state?: SaviState;
  size?: number;
}

/**
 * Animated identity avatar for Savi. A rotating gradient halo wraps a dark core;
 * when Savi is working the halo speeds up, a soft ping radiates out, and the core
 * glyph switches to reflect what she is doing (thinking / searching / responding).
 */
export function SaviOrb({ state = 'idle', size = 36 }: SaviOrbProps) {
  const active = state !== 'idle';
  const core = Math.round(size * 0.72);
  const iconSize = Math.round(size * 0.42);

  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {/* radiating ping while working */}
      {active ? (
        <span className="animate-savi-ping absolute inset-0 rounded-full bg-sky-400/40" />
      ) : null}

      {/* rotating gradient halo */}
      <span
        className={`absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,#38bdf8,#6366f1,#10b981,#38bdf8)] ${
          active ? 'animate-savi-spin-fast' : 'animate-savi-spin'
        }`}
      />

      {/* dark core */}
      <span
        className={`relative flex items-center justify-center rounded-full bg-slate-950 text-white shadow-inner ${
          state === 'responding' ? 'animate-savi-breathe' : ''
        }`}
        style={{ width: core, height: core }}
      >
        {state === 'thinking' ? (
          <Loader2 size={iconSize} className="animate-spin text-sky-300" />
        ) : state === 'searching' ? (
          <Globe size={iconSize} className="animate-pulse text-emerald-300" />
        ) : state === 'responding' ? (
          <Sparkles size={iconSize} className="text-sky-200" />
        ) : (
          <Bot size={iconSize} className="text-sky-100" />
        )}
      </span>
    </span>
  );
}

/** Three-dot typing indicator used inside Savi's pending bubble. */
export function SaviTypingDots() {
  return (
    <span className="inline-flex items-center gap-1">
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="savi-bounce-dot h-1.5 w-1.5 rounded-full bg-sky-500"
          style={{ animationDelay: `${index * 0.15}s` }}
        />
      ))}
    </span>
  );
}
