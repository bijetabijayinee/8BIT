import { ClipboardList, UserRound } from 'lucide-react';

type AvatarKind = 'patient' | 'doctor' | 'staff';

interface AvatarProps {
  name: string;
  kind?: AvatarKind;
  size?: 'sm' | 'md';
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

function initialsOf(name: string) {
  const parts = name
    .replace(/^Dr\.?\s+/i, '')
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) {
    return '?';
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Deterministic identity avatar: doctors/staff get initials, patients get a person
 * glyph - both tinted by a stable hash of the name so the same person always gets
 * the same color across the app.
 */
export function Avatar({ name, kind = 'staff', size = 'md' }: AvatarProps) {
  const palette = palettes[hashOf(name) % palettes.length];
  const dimensions = size === 'sm' ? 'h-7 w-7 text-[10px]' : 'h-9 w-9 text-xs';
  const iconSize = size === 'sm' ? 13 : 16;

  return (
    <span
      className={`flex ${dimensions} shrink-0 select-none items-center justify-center rounded-full font-bold ring-1 ring-inset ${palette}`}
      aria-hidden="true"
      title={name}
    >
      {kind === 'patient' ? (
        <UserRound size={iconSize} />
      ) : kind === 'staff' ? (
        <ClipboardList size={iconSize} />
      ) : (
        initialsOf(name)
      )}
    </span>
  );
}
