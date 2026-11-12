import { useEffect } from 'react';

// Overlay scrollbars occupy the scrollport instead of reserving layout space.
// Track overflow centrally so short tables keep their compact height.
export default function useTableScrollClearance() {
    useEffect(() => {
        const root = document.querySelector('.app-root');
        if (!root) return undefined;
        const observed = new Set();
        let frame = null;
        const measure = () => {
            frame = null;
            for (const element of observed) {
                if (!root.contains(element)) {
                    resize.unobserve(element);
                    observed.delete(element);
                }
            }
            root.querySelectorAll('.table-wrap, .receipt-sheet-wrap').forEach(wrapper => {
                const table = wrapper.querySelector('table');
                if (!table) return;
                [wrapper, table].forEach(element => {
                    if (observed.has(element)) return;
                    observed.add(element);
                    resize.observe(element);
                });
                wrapper.toggleAttribute('data-horizontal-scroll', wrapper.clientWidth > 0 && wrapper.scrollWidth > wrapper.clientWidth);
            });
        };
        const schedule = () => {
            if (frame === null) frame = requestAnimationFrame(measure);
        };
        const resize = new ResizeObserver(schedule);
        const mutations = new MutationObserver(schedule);
        mutations.observe(root, { childList: true, subtree: true });
        schedule();
        return () => {
            if (frame !== null) cancelAnimationFrame(frame);
            resize.disconnect();
            mutations.disconnect();
        };
    }, []);
}
