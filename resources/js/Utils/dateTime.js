const timeZone = 'Asia/Yangon';
export const dateLocale = () => typeof document !== 'undefined' && document.documentElement.lang.startsWith('my') ? 'my-MM' : 'en-GB';
const dateOptions = { timeZone, day: '2-digit', month: 'short', year: 'numeric' };
const timeOptions = { timeZone, hour: '2-digit', minute: '2-digit', hour12: true };
function parseDate(value) {
    if (value == null || value === '') return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    let text = String(value).trim();
    // Calendar dates have no time zone; anchor at noon to preserve their day.
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) text += 'T12:00:00+06:30';
    // Laravel timestamps without an explicit offset are stored in UTC.
    else if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(text)) {
        text = text.replace(' ', 'T').replace(/(\.\d{3})\d+/, '$1');
        if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)) text += 'Z';
    }
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? null : date;
}
export function formatDate(value) {
    const date = parseDate(value);
    return date ? new Intl.DateTimeFormat(dateLocale(), dateOptions).format(date) : '\u2014';
}
export function formatTime(value) {
    const date = parseDate(value);
    return date ? new Intl.DateTimeFormat(dateLocale(), timeOptions).format(date) : '\u2014';
}
export function formatDateTime(value) {
    const date = parseDate(value);
    if (!date) return '\u2014';
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDate(value);
    return formatDate(date) + ', ' + formatTime(date);
}
