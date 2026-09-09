/**
 * Formatting for the console. Nothing here may import server-only code.
 *
 * `formatBytes` and `initials` are daimon's — akouo needed the same two, and
 * each app's copy handled an edge the other got wrong. Re-exported rather than
 * imported directly at each call site so `@/lib/format` stays this app's one
 * formatting entry point.
 */

export { formatBytes, initials } from '@aether-zone/daimon/format';

/**
 * "3 minutes ago", falling back to a date once that stops being useful.
 *
 * `Intl.RelativeTimeFormat` rather than a hand-rolled ladder so it is localized
 * and does not have to be maintained.
 */
export function formatRelative(iso: string): string {
  const then = new Date(iso);

  if (Number.isNaN(then.getTime())) {
    return '—';
  }

  const seconds = (then.getTime() - Date.now()) / 1000;
  const absolute = Math.abs(seconds);

  if (absolute > 60 * 60 * 24 * 7) {
    return then.toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

  const [unit, size]: [Intl.RelativeTimeFormatUnit, number] =
    absolute < 60
      ? ['second', 1]
      : absolute < 60 * 60
        ? ['minute', 60]
        : absolute < 60 * 60 * 24
          ? ['hour', 60 * 60]
          : ['day', 60 * 60 * 24];

  return relative.format(Math.round(seconds / size), unit);
}
