import { Card, CardContent } from '@/components/ui/card';

export function getHeatSurface(intensity: number) {
  if (intensity >= 0.95) {
    return {
      background: 'linear-gradient(180deg, #1f1235 0%, #2b1750 100%)',
      borderColor: '#241248',
      textClassName: 'text-white',
      captionClassName: 'text-violet-100/90',
      shadow: '0 14px 28px rgba(43, 23, 80, 0.32)',
    };
  }
  if (intensity >= 0.75) {
    return {
      background: 'linear-gradient(180deg, #5b21b6 0%, #7c3aed 100%)',
      borderColor: '#6d28d9',
      textClassName: 'text-white',
      captionClassName: 'text-violet-100/90',
      shadow: '0 12px 24px rgba(124, 58, 237, 0.28)',
    };
  }
  if (intensity >= 0.5) {
    return {
      background: 'linear-gradient(180deg, #8b5cf6 0%, #a78bfa 100%)',
      borderColor: '#8b5cf6',
      textClassName: 'text-white',
      captionClassName: 'text-violet-100/85',
      shadow: '0 10px 20px rgba(139, 92, 246, 0.22)',
    };
  }
  if (intensity > 0) {
    return {
      background: 'linear-gradient(180deg, #ede9fe 0%, #ddd6fe 100%)',
      borderColor: '#d8b4fe',
      textClassName: 'text-slate-900',
      captionClassName: 'text-violet-900/65',
      shadow: '0 8px 18px rgba(139, 92, 246, 0.12)',
    };
  }

  return {
    background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
    borderColor: '#e2e8f0',
    textClassName: 'text-slate-500',
    captionClassName: 'text-slate-300',
    shadow: 'none',
  };
}

export function getRoomBubbleColor(fixedShare: number, utilization: number) {
  if (utilization >= 80) return '#4f46e5';
  if (fixedShare >= 60) return '#7c3aed';
  if (utilization >= 45) return '#8b5cf6';
  return '#c4b5fd';
}

export function InsightMetric({
  label,
  value,
  detail,
  accent,
  delta,
  deltaCaption,
}: {
  label: string;
  value: string;
  detail: string;
  accent: string;
  delta?: string | null;
  deltaCaption?: string | null;
}) {
  return (
    <Card className="overflow-hidden border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
      <CardContent className="p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] ${accent}`}>
            {label}
          </div>
          {delta ? (
            <div className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-medium tracking-[0.08em] text-slate-600">
              {delta}
            </div>
          ) : null}
        </div>
        <div className="text-[28px] font-semibold tracking-tight text-slate-950 md:text-[30px]">{value}</div>
        <p className="mt-2 max-w-xs text-[12px] leading-5 text-slate-500">{detail}</p>
        {deltaCaption ? (
          <p className="mt-3 text-[10px] font-medium uppercase tracking-[0.16em] text-slate-400">{deltaCaption}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function FilterChip({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-3 py-1.5 text-[11px] text-slate-600 shadow-[0_6px_18px_rgba(15,23,42,0.04)]">
      <span className="font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</span>
      <span className="max-w-[180px] truncate font-medium text-slate-900">{value}</span>
    </div>
  );
}
