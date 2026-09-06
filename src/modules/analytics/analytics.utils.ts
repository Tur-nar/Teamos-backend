export function getPeriodCutoff(period?: 'week' | 'month' | 'quarter' | 'year' | 'all'): Date | null {
  if (!period || period === 'all') return null;
  const now = new Date();
  const days = period === 'week' ? 7 : period === 'month' ? 30 : period === 'quarter' ? 90 : 365;
  const cutoff = new Date();
  cutoff.setDate(now.getDate() - days);
  return cutoff;
}
