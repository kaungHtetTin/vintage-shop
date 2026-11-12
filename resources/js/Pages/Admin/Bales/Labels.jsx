import { usePhraseTranslation as useUiTranslation } from '@/Utils/i18n';
import { useState } from "react";
import { Link } from "@/spa/router";
import { Page, money, useBales } from "@/Components/Bales/shared";
import Barcode from "@/Components/Bales/Barcode";
export default function Labels({ bale }) {
    const uiText = useUiTranslation();
    const { href } = useBales();
    const [copies, setCopies] = useState(
        Object.fromEntries(bale.labels.map((l) => [l.id, 1])),
    );
    const total = Object.values(copies).reduce(
        (sum, n) => sum + Number(n || 0),
        0,
    );
    return (
        <Page
            title={uiText("Labels / :value1", { value1: bale.code })}
            action={
                <Link
                    className="btn secondary"
                    href={href(`/admin/bales/${bale.id}`)}
                > {uiText("Back to bale")} </Link>
            }
        >
            <section className="panel glass bale-print-controls">
                
                
                <div className="bale-label-options">
                    {bale.labels.map((label) => (
                        <label className="form-field" key={label.id}>
                            <span>{money(label.price)} {uiText("/ copies")}</span>
                            <input
                                aria-label={uiText("Copies for :value1", { value1: label.price })}
                                type="number"
                                min="0"
                                max="200"
                                step="1"
                                value={copies[label.id]}
                                onChange={(e) =>
                                    setCopies({
                                        ...copies,
                                        [label.id]: Math.min(
                                            200,
                                            Math.max(
                                                0,
                                                Math.floor(
                                                    Number(e.target.value) || 0,
                                                ),
                                            ),
                                        ),
                                    })
                                }
                            />
                        </label>
                    ))}
                </div>
                {!bale.labels.length && (
                    <p>{uiText("Add price groups on the bale page first.")}</p>
                )}
                <button
                    className="btn primary"
                    onClick={() => window.print()}
                    disabled={!total || total > 1000}
                > {uiText("Print")} {total} {uiText("labels")} </button>
                {total > 1000 && (
                    <p className="bale-error"> {uiText("Print up to 1,000 labels per batch.")} </p>
                )}
                <p className="bale-help"> {uiText("A4 sheet / 48 x 28 mm labels. Print at 100% scale with browser headers and footers off.")} </p>
            </section>
            <div className="bale-print-sheet">
                {total <= 1000 &&
                    bale.labels.flatMap((label) =>
                        Array.from(
                            { length: Number(copies[label.id] || 0) },
                            (_, index) => (
                                <article
                                    className="bale-print-label"
                                    key={`${label.id}-${index}`}
                                >
                                    <strong>{money(label.price)}</strong>
                                    <small>{bale.code}</small>
                                    <Barcode value={label.barcode} />
                                    <b>{label.barcode}</b>
                                </article>
                            ),
                        ),
                    )}
            </div>
        </Page>
    );
}
