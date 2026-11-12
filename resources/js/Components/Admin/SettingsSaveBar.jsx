import { createPortal } from 'react-dom';
import Icon from '@/Components/Admin/icons';
import { usePhraseTranslation } from '@/Utils/i18n';

export default function SettingsSaveBar({ formId, processing, dirty, recentlySuccessful, onDiscard, target, external = false }) {
    const t = usePhraseTranslation();
    const bar = (
        <div className="editor-action-bar settings-save-bar">
            <div className="editor-save-state" role="status" aria-live="polite">
                <span className={dirty ? 'is-dirty' : 'is-clean'} aria-hidden="true" />
                <strong>{t(dirty ? 'Unsaved changes' : recentlySuccessful ? 'Settings saved' : 'All changes saved')}</strong>
            </div>
            <div className="editor-action-buttons">
                <button type="button" className="btn secondary" disabled={processing || !dirty} onClick={onDiscard}>
                    {t('Discard changes')}
                </button>
                <button type="submit" form={formId} className="btn primary" disabled={processing || !dirty}>
                    <Icon name="check" size={14} />
                    {t(processing ? 'Saving...' : 'Save changes')}
                </button>
            </div>
        </div>
    );

    return external ? (target ? createPortal(bar, target) : null) : bar;
}
