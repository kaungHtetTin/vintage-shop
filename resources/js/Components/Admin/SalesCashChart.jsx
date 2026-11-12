import { dateLocale } from '@/Utils/dateTime';
import { useEffect, useId, useRef, useState } from 'react';
import { formatMoney } from '@/Utils/pricing';
import { usePhraseTranslation } from '@/Utils/i18n';

const series = [
    { key: 'sales', label: 'Sales', color: '#3978b5' },
    { key: 'income', label: 'Income', color: '#168255' },
    { key: 'expenses', label: 'Expenses', color: '#b77700' },
    { key: 'profit', label: 'Cash profit', color: '#a45138' },
];
const compact = value => new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value);

export default function SalesCashChart({ title, scope, rows = [], monthly = false }) {
    const t = usePhraseTranslation();
    const id = useId();
    const wrap = useRef(null);
    const [width, setWidth] = useState(520);
    const [visible, setVisible] = useState({ sales: true, income: true, expenses: true, profit: true });
    const [active, setActive] = useState(null);
    useEffect(() => {
        const observer = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.round(entry.contentRect.width))));
        if (wrap.current) observer.observe(wrap.current);
        return () => observer.disconnect();
    }, []);
    useEffect(() => setActive(null), [rows]);

    const height = 250;
    const left = 58;
    const right = width - 16;
    const top = 16;
    const bottom = height - 30;
    const selected = series.filter(item => visible[item.key]);
    const values = rows.flatMap(row => selected.map(item => Number(row[item.key] || 0)));
    const min = Math.min(0, ...values);
    const max = Math.max(0, ...values);
    const span = max - min || 1;
    const lower = min < 0 ? min - span * 0.08 : 0;
    const upper = max === 0 && min === 0 ? 1 : max + span * 0.08;
    const x = index => left + index / Math.max(rows.length - 1, 1) * (right - left);
    const y = value => bottom - (value - lower) / (upper - lower) * (bottom - top);
    const label = row => monthly
        ? new Date(`${row.period}-01T12:00:00`).toLocaleDateString(dateLocale(), { month: 'short' })
        : String(Number(row.period.slice(-2)));
    const fullLabel = row => monthly
        ? new Date(`${row.period}-01T12:00:00`).toLocaleDateString(dateLocale(), { month: 'long', year: 'numeric' })
        : new Date(`${row.period}T12:00:00`).toLocaleDateString(dateLocale(), { month: 'short', day: 'numeric', year: 'numeric' });
    const current = active == null ? null : rows[active];
    const hasData = rows.some(row => series.some(item => Number(row[item.key] || 0) !== 0));
    const totals = Object.fromEntries(series.map(item => [item.key, rows.reduce((sum, row) => sum + Number(row[item.key] || 0), 0)]));

    return <section className="sales-chart-panel" aria-labelledby={`${id}-title`}>
        <div className="sales-chart-heading"><h2 id={`${id}-title`}>{t(title)}</h2><span>{scope}</span></div>
        <div className="sales-chart-legend" aria-label={t('Chart series')}>
            {series.map(item => <button key={item.key} type="button" style={{ '--series-color': item.color }} className={visible[item.key] ? 'is-visible' : ''} aria-pressed={visible[item.key]}
                onClick={() => setVisible(current => ({ ...current, [item.key]: !current[item.key] }))}>
                <span><i />{t(item.label)}</span><strong>{formatMoney(totals[item.key])}</strong>
            </button>)}
        </div>
        <div className="sales-chart-plot" ref={wrap}>
            <svg viewBox={`0 0 ${width} ${height}`} role="img" tabIndex={0} aria-label={`${t(title)} - ${scope}. ${t('Use arrow keys to explore values.')}`}
                onPointerMove={event => {
                    if (!rows.length) return;
                    const rect = event.currentTarget.getBoundingClientRect();
                    const local = (event.clientX - rect.left) * width / rect.width;
                    setActive(Math.max(0, Math.min(rows.length - 1, Math.round((local - left) / (right - left) * (rows.length - 1)))));
                }}
                onPointerLeave={() => setActive(null)} onBlur={() => setActive(null)} onFocus={() => rows.length && setActive(0)}
                onKeyDown={event => {
                    if (!rows.length || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                    event.preventDefault();
                    setActive(index => event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 : Math.max(0, Math.min(rows.length - 1, (index ?? 0) + (event.key === 'ArrowRight' ? 1 : -1))));
                }}>
                {[0, 1, 2, 3, 4].map(tick => {
                    const value = lower + (upper - lower) * tick / 4;
                    return <g key={tick}><line className="sales-chart-grid" x1={left} x2={right} y1={y(value)} y2={y(value)} /><text className="sales-chart-y-label" x={left - 8} y={y(value) + 4}>{compact(value)}</text></g>;
                })}
                <line className="sales-chart-zero" x1={left} x2={right} y1={y(0)} y2={y(0)} />
                {rows.map((row, index) => index % Math.ceil(rows.length / 6) === 0 || index === rows.length - 1 ? <text className="sales-chart-x-label" key={row.period} x={x(index)} y={height - 8}>{label(row)}</text> : null)}
                {selected.map(item => <polyline key={item.key} className="sales-chart-line" stroke={item.color} strokeDasharray={item.key === 'sales' ? '5 3' : undefined}
                    points={rows.map((row, index) => `${x(index)},${y(Number(row[item.key] || 0))}`).join(' ')} />)}
                {current && <g><line className="sales-chart-guide" x1={x(active)} x2={x(active)} y1={top} y2={bottom} />
                    {selected.map(item => <circle key={item.key} cx={x(active)} cy={y(Number(current[item.key] || 0))} r="4" fill={item.color} />)}
                </g>}
            </svg>
            {(!hasData || !selected.length) && <p className="sales-chart-empty">{t(!selected.length ? 'Select a metric above.' : 'No activity in this period.')}</p>}
        </div>
        <div className="sales-chart-readout" role="status" aria-live="polite">
            {current ? <><strong>{fullLabel(current)}</strong><div>{selected.map(item => <span key={item.key}><i style={{ background: item.color }} />{t(item.label)} <b>{formatMoney(current[item.key])}</b></span>)}</div></> : <span>{t('Point at the chart or use arrow keys to see exact values.')}</span>}
        </div>
    </section>;
}
