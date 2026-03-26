export const opsSurface =
  'rounded-[24px] border border-[#decdb9] bg-[linear-gradient(180deg,#fffdf9_0%,#fbf5ee_100%)] shadow-[0_14px_36px_rgba(30,23,18,0.08)] transition duration-150';
export const opsSurfaceMuted = 'rounded-[22px] border border-[#e5d7c7] bg-[#f8f1e7]';
export const opsInset =
  'rounded-[20px] border border-[#e6d9ca] bg-white/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] transition duration-150';
export const opsDashed = 'rounded-[20px] border border-dashed border-[#d7c7b2] bg-[#faf4ec]';
export const opsInput =
  'w-full rounded-[18px] border border-[#d7c7b2] bg-[#fffdf9] px-3 py-3 text-right text-[#1e1712] outline-none transition duration-150 placeholder:text-[#a08a75] focus:border-[#9b6b2e] focus:shadow-[0_0_0_3px_rgba(155,107,46,0.12)]';
export const opsSelect =
  'rounded-[18px] border border-[#d7c7b2] bg-[#fffdf9] px-3 py-3 text-right text-[#1e1712] outline-none transition duration-150 focus:border-[#9b6b2e] focus:shadow-[0_0_0_3px_rgba(155,107,46,0.12)]';
export const opsGhostButton =
  'inline-flex items-center justify-center gap-2 rounded-[18px] border border-[#dac9b6] bg-[#fffaf3] px-3 py-2.5 text-sm font-semibold text-[#5e4d3f] transition duration-150 hover:-translate-y-[1px] hover:bg-[#f4eadc] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50';
export const opsPrimaryButton =
  'inline-flex items-center justify-center gap-2 rounded-[18px] bg-[#1e1712] px-4 py-3 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(30,23,18,0.16)] transition duration-150 hover:-translate-y-[1px] active:translate-y-0 focus-visible:outline-none focus-visible:shadow-[0_0_0_4px_rgba(30,23,18,0.12),0_14px_28px_rgba(30,23,18,0.16)] disabled:cursor-not-allowed disabled:opacity-50';
export const opsAccentButton =
  'inline-flex items-center justify-center gap-2 rounded-[18px] bg-[#9b6b2e] px-4 py-3 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(155,107,46,0.20)] transition duration-150 hover:-translate-y-[1px] active:translate-y-0 focus-visible:outline-none focus-visible:shadow-[0_0_0_4px_rgba(155,107,46,0.14),0_14px_28px_rgba(155,107,46,0.20)] disabled:cursor-not-allowed disabled:opacity-50';
export const opsSuccessButton =
  'inline-flex items-center justify-center gap-2 rounded-[18px] bg-[#2e6a4e] px-4 py-3 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(46,106,78,0.18)] transition duration-150 hover:-translate-y-[1px] active:translate-y-0 focus-visible:outline-none focus-visible:shadow-[0_0_0_4px_rgba(46,106,78,0.14),0_14px_28px_rgba(46,106,78,0.18)] disabled:cursor-not-allowed disabled:opacity-50';
export const opsDangerButton =
  'inline-flex items-center justify-center gap-2 rounded-[18px] bg-[#9a3e35] px-4 py-3 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(154,62,53,0.18)] transition duration-150 hover:-translate-y-[1px] active:translate-y-0 focus-visible:outline-none focus-visible:shadow-[0_0_0_4px_rgba(154,62,53,0.14),0_14px_28px_rgba(154,62,53,0.18)] disabled:cursor-not-allowed disabled:opacity-50';
export const opsSectionTitle = 'text-sm font-semibold tracking-[0.01em] text-[#3d3128]';
export const opsSectionHint = 'text-xs leading-6 text-[#7d6a59]';
export const opsToolbarButton =
  'inline-flex items-center justify-center gap-2 rounded-[16px] border border-[#dac9b6] bg-[#fffaf3] px-3 py-2 text-xs font-semibold text-[#5e4d3f] transition duration-150 hover:-translate-y-[1px] hover:bg-[#f4eadc] active:translate-y-0';

export function opsAlert(tone: 'success' | 'warning' | 'danger' | 'info') {
  switch (tone) {
    case 'success':
      return 'rounded-[22px] border border-[#cfe0d7] bg-[#eff7f1] p-3 text-sm text-[#2e6a4e]';
    case 'warning':
      return 'rounded-[22px] border border-[#ecd9bd] bg-[#fcf3e7] p-3 text-sm text-[#a5671e]';
    case 'danger':
      return 'rounded-[22px] border border-[#e6c7c2] bg-[#fff3f1] p-3 text-sm text-[#9a3e35]';
    default:
      return 'rounded-[22px] border border-[#d6dee5] bg-[#f4f7f9] p-3 text-sm text-[#3c617c]';
  }
}

export function opsEmptyState(tone: 'neutral' | 'accent' | 'warning' = 'neutral') {
  if (tone === 'accent') return `${opsDashed} p-3 text-sm text-[#7c5222]`;
  if (tone === 'warning') return `${opsDashed} p-3 text-sm text-[#a5671e]`;
  return `${opsDashed} p-3 text-sm text-[#6b5a4c]`;
}

export function opsBadge(tone: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info') {
  switch (tone) {
    case 'accent':
      return 'rounded-full border border-[#ead7bc] bg-[#f8ecdb] px-3 py-1 text-xs font-semibold text-[#7c5222]';
    case 'success':
      return 'rounded-full border border-[#cfe0d7] bg-[#eff7f1] px-3 py-1 text-xs font-semibold text-[#2e6a4e]';
    case 'warning':
      return 'rounded-full border border-[#ecd9bd] bg-[#fcf3e7] px-3 py-1 text-xs font-semibold text-[#a5671e]';
    case 'danger':
      return 'rounded-full border border-[#e6c7c2] bg-[#fff3f1] px-3 py-1 text-xs font-semibold text-[#9a3e35]';
    case 'info':
      return 'rounded-full border border-[#d6dee5] bg-[#f4f7f9] px-3 py-1 text-xs font-semibold text-[#3c617c]';
    default:
      return 'rounded-full border border-[#ddd3c6] bg-[#f8f4ee] px-3 py-1 text-xs font-semibold text-[#6b5a4c]';
  }
}

export function opsMetricCard(tone: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info') {
  const base = 'rounded-[20px] border p-3 text-right shadow-sm transition duration-150 hover:-translate-y-[1px]';
  switch (tone) {
    case 'accent':
      return `${base} border-[#ead7bc] bg-[#fff8ef] text-[#7c5222]`;
    case 'success':
      return `${base} border-[#cfe0d7] bg-[#f7fbf8] text-[#2e6a4e]`;
    case 'warning':
      return `${base} border-[#ecd9bd] bg-[#fffbf5] text-[#a5671e]`;
    case 'danger':
      return `${base} border-[#e6c7c2] bg-[#fff8f7] text-[#9a3e35]`;
    case 'info':
      return `${base} border-[#d6dee5] bg-[#f9fbfc] text-[#3c617c]`;
    default:
      return `${base} border-[#e4d8c9] bg-[#fffdf8] text-[#5e4d3f]`;
  }
}
