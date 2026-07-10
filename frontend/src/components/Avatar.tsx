import { ClipboardList, UserRound } from 'lucide-react';

type AvatarKind = 'patient' | 'doctor' | 'staff';

interface AvatarProps {
  name: string;
  kind?: AvatarKind;
  size?: 'sm' | 'md';
}

// Clipart palette for the illustrated doctor avatar, varied deterministically by name.
const skinTones = ['#f3cba3', '#e7b48d', '#d69f7e', '#c68a63', '#a9785a'];
const hairColors = ['#2b2b2b', '#4b3621', '#6b4f2a', '#141414', '#5a3b22'];
const coatAccents = ['#0ea5e9', '#10b981', '#6366f1', '#f59e0b', '#ec4899', '#14b8a6'];

/**
 * A friendly flat-illustration doctor: white coat, scrubs collar, stethoscope, and a
 * face tinted from a stable hash of the name so each doctor keeps a consistent look.
 */
function DoctorClipart({ name, px }: { name: string; px: number }) {
  const hash = hashOf(name);
  const skin = skinTones[hash % skinTones.length];
  const hair = hairColors[(hash >> 3) % hairColors.length];
  const accent = coatAccents[(hash >> 5) % coatAccents.length];
  return (
    <svg viewBox="0 0 40 40" width={px} height={px} aria-hidden="true">
      <circle cx="20" cy="20" r="20" fill="#eef2ff" />
      {/* white coat */}
      <path d="M7 40 C7 30.5 13 26.5 20 26.5 C27 26.5 33 30.5 33 40 Z" fill="#ffffff" />
      <path d="M20 26.5 L20 40" stroke="#e2e8f0" strokeWidth="0.8" />
      {/* scrubs collar */}
      <path d="M16 27 L20 33 L24 27 Z" fill={accent} />
      {/* stethoscope */}
      <path d="M15.5 27.5 C15 33 20 34.5 20 30.5" stroke={accent} strokeWidth="1.2" fill="none" strokeLinecap="round" />
      <circle cx="20" cy="30.2" r="1.35" fill={accent} />
      {/* neck */}
      <rect x="17.6" y="22.5" width="4.8" height="5.5" rx="2.2" fill={skin} />
      {/* head */}
      <circle cx="20" cy="17.5" r="7" fill={skin} />
      {/* hair */}
      <path d="M12.8 17 C12.8 10.6 27.2 10.6 27.2 17 C27.2 13.7 24 11.6 20 11.6 C16 11.6 12.8 13.7 12.8 17 Z" fill={hair} />
    </svg>
  );
}

const palettes = [
  'bg-indigo-100 text-indigo-700 ring-indigo-200',
  'bg-emerald-100 text-emerald-700 ring-emerald-200',
  'bg-sky-100 text-sky-700 ring-sky-200',
  'bg-amber-100 text-amber-700 ring-amber-200',
  'bg-violet-100 text-violet-700 ring-violet-200',
  'bg-teal-100 text-teal-700 ring-teal-200',
];

function hashOf(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

/**
 * Deterministic identity avatar: doctors get an illustrated clipart figure, staff get a
 * clipboard glyph, patients get a person glyph - all keyed off a stable hash of the name
 * so the same person always looks the same across the app.
 */
export function Avatar({ name, kind = 'staff', size = 'md' }: AvatarProps) {
  const palette = palettes[hashOf(name) % palettes.length];
  const dimensions = size === 'sm' ? 'h-7 w-7 text-[10px]' : 'h-9 w-9 text-xs';
  const iconSize = size === 'sm' ? 13 : 16;
  const px = size === 'sm' ? 28 : 36;

  if (kind === 'doctor') {
    return (
      <span
        className={`flex ${dimensions} shrink-0 select-none items-center justify-center overflow-hidden rounded-full ring-1 ring-inset ring-indigo-200`}
        aria-hidden="true"
        title={name}
      >
        <DoctorClipart name={name} px={px} />
      </span>
    );
  }

  return (
    <span
      className={`flex ${dimensions} shrink-0 select-none items-center justify-center rounded-full font-bold ring-1 ring-inset ${palette}`}
      aria-hidden="true"
      title={name}
    >
      {kind === 'patient' ? <UserRound size={iconSize} /> : <ClipboardList size={iconSize} />}
    </span>
  );
}
