import { AlertTriangle, ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';

const URL_TOKEN = /(https?:\/\/[^\s)\]]+)/g;

function linkLabel(url: string) {
  try {
    const parsed = new URL(url);
    const page = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() ?? parsed.hostname);
    return page.replace(/_/g, ' ') || parsed.hostname;
  } catch {
    return url;
  }
}

const WARNING_PREFIX = /^(?:⚠️?\s*)?warning[:\-]/i;
const CONCERN_TERMS = [
  'critical', 'urgent', 'immediately', 'deteriorat', 'red flag', 'life-threat',
  'sepsis', 'stroke', 'cardiac arrest', 'hemorrhage', 'severe', 'escalate',
];
// Numbers, vitals, ranges, percentages, times: 98, 36.8, 120/78, 98%, 40m, 12:30.
const NUMBER_TOKEN = /(\d+(?:[.:/]\d+)*\s?(?:%|mmhg|bpm|min|mins|m|h|hrs|°c|c)?)/gi;

function isWarningLine(line: string) {
  const lower = line.toLowerCase();
  if (WARNING_PREFIX.test(line)) {
    return true;
  }
  return CONCERN_TERMS.some((term) => lower.includes(term));
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  // First pass: URLs become external-link chips; remaining segments get number highlighting.
  return text.split(URL_TOKEN).flatMap<ReactNode>((segment, segmentIndex) => {
    if (/^https?:\/\//.test(segment)) {
      return [
        <a
          key={`${keyPrefix}-url-${segmentIndex}`}
          href={segment}
          target="_blank"
          rel="noreferrer"
          className="mx-0.5 inline-flex max-w-56 items-center gap-1 truncate rounded-full bg-sky-100 px-2 py-0.5 align-middle text-[11px] font-semibold text-sky-800 ring-1 ring-inset ring-sky-200 transition hover:bg-sky-200"
        >
          <ExternalLink size={10} aria-hidden="true" className="shrink-0" />
          <span className="truncate">{linkLabel(segment)}</span>
        </a>,
      ];
    }
    return renderNumbers(segment, `${keyPrefix}-${segmentIndex}`);
  });
}

function renderNumbers(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  NUMBER_TOKEN.lastIndex = 0;
  while ((match = NUMBER_TOKEN.exec(text)) !== null) {
    const token = match[0].trim();
    // Skip lone punctuation-y matches.
    if (!/\d/.test(token)) {
      continue;
    }
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    nodes.push(
      <span key={`${keyPrefix}-num-${match.index}`} className="font-bold tabular-nums">
        {token}
      </span>,
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
}

/**
 * Renders assistant text with light structure: warning callouts, bold "Label:" prefixes,
 * bullet points, and highlighted numeric values. Designed for the Savi chat + hospital chat.
 */
export function FormattedMessage({ text }: { text: string }) {
  const lines = text.split('\n').filter((line, index, all) => line.trim() || index < all.length - 1);

  return (
    <div className="space-y-1.5 break-words leading-6">
      {lines.map((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return <div key={`blank-${index}`} className="h-1" />;
        }

        if (isWarningLine(trimmed)) {
          const body = trimmed.replace(WARNING_PREFIX, '').trim();
          return (
            <div
              key={`warn-${index}`}
              className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-rose-900"
            >
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-rose-600" aria-hidden="true" />
              <span className="min-w-0 font-medium">{renderInline(body, `warn-${index}`)}</span>
            </div>
          );
        }

        const isBullet = /^[-*•]\s+/.test(trimmed);
        const bulletText = trimmed.replace(/^[-*•]\s+/, '');
        const labelMatch = bulletText.match(/^([A-Za-z][^:]{1,32}):\s*(.*)$/);

        return (
          <p key={`line-${index}`} className={isBullet ? 'flex gap-2' : ''}>
            {isBullet ? (
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
            ) : null}
            <span className="min-w-0">
              {labelMatch ? (
                <>
                  <span className="font-semibold text-slate-900">{labelMatch[1]}:</span>{' '}
                  {renderInline(labelMatch[2], `lbl-${index}`)}
                </>
              ) : (
                renderInline(bulletText, `txt-${index}`)
              )}
            </span>
          </p>
        );
      })}
    </div>
  );
}
