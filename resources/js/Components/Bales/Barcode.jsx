import { usePhraseTranslation as useUiTranslation } from '@/Utils/i18n';
import { useMemo } from "react";
const code128Patterns = [
    "212222",
    "222122",
    "222221",
    "121223",
    "121322",
    "131222",
    "122213",
    "122312",
    "132212",
    "221213",
    "221312",
    "231212",
    "112232",
    "122132",
    "122231",
    "113222",
    "123122",
    "123221",
    "223211",
    "221132",
    "221231",
    "213212",
    "223112",
    "312131",
    "311222",
    "321122",
    "321221",
    "312212",
    "322112",
    "322211",
    "212123",
    "212321",
    "232121",
    "111323",
    "131123",
    "131321",
    "112313",
    "132113",
    "132311",
    "211313",
    "231113",
    "231311",
    "112133",
    "112331",
    "132131",
    "113123",
    "113321",
    "133121",
    "313121",
    "211331",
    "231131",
    "213113",
    "213311",
    "213131",
    "311123",
    "311321",
    "331121",
    "312113",
    "312311",
    "332111",
    "314111",
    "221411",
    "431111",
    "111224",
    "111422",
    "121124",
    "121421",
    "141122",
    "141221",
    "112214",
    "112412",
    "122114",
    "122411",
    "142112",
    "142211",
    "241211",
    "221114",
    "413111",
    "241112",
    "134111",
    "111242",
    "121142",
    "121241",
    "114212",
    "124112",
    "124211",
    "411212",
    "421112",
    "421211",
    "212141",
    "214121",
    "412121",
    "111143",
    "111341",
    "131141",
    "114113",
    "114311",
    "411113",
    "411311",
    "113141",
    "114131",
    "311141",
    "411131",
    "211412",
    "211214",
    "211232",
    "2331112",
];

function code128Values(value) {
    const text = String(value || "");
    const values = [104];

    for (const char of text) {
        const code = char.charCodeAt(0);
        values.push(code >= 32 && code <= 127 ? code - 32 : 0);
    }

    const checksum =
        values.reduce(
            (sum, code, index) => sum + (index === 0 ? code : code * index),
            0,
        ) % 103;
    return [...values, checksum, 106];
}

function BarcodeSvg({ value }) {
    const uiText = useUiTranslation();
    const bars = useMemo(() => {
        let x = 10;
        const rects = [];

        code128Values(value).forEach((code) => {
            const pattern = code128Patterns[code];
            [...pattern].forEach((width, index) => {
                const moduleWidth = Number(width);
                if (index % 2 === 0) {
                    rects.push({ x, width: moduleWidth });
                }
                x += moduleWidth;
            });
        });

        return { rects, width: x + 10 };
    }, [value]);

    return (
        <svg
            className="barcode-svg"
            viewBox={`0 0 ${bars.width} 42`}
            preserveAspectRatio="none"
            role="img"
            aria-label={uiText(value)}
        >
            {bars.rects.map((rect, index) => (
                <rect
                    key={`${rect.x}-${index}`}
                    x={rect.x}
                    y="0"
                    width={rect.width}
                    height="42"
                />
            ))}
        </svg>
    );
}

export default BarcodeSvg;
