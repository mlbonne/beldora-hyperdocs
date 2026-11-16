import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Eye, EyeOff, RotateCcw, X } from 'lucide-react';
import { flush, useStore } from '../store';
import { isDesktop } from '../utils';
import { DEFAULT_GEMINI_MODEL, listModels } from '../ai/gemini';
import { AutosavePicker, CloudAccountForm } from './CloudDialog';

interface SpellcheckInfo {
  current: string;
  system: string[];
}

/** Offered even when not installed in Windows; selecting one points to where to install it. */
const COMMON_LANGUAGES = ['pt-BR', 'pt-PT', 'en-US', 'en-GB', 'es-ES', 'es-MX', 'fr-FR', 'de-DE', 'it-IT', 'nl-NL', 'pl-PL', 'ru-RU', 'ja-JP'];

const onWindows = navigator.userAgent.includes('Windows');

const languageName = (() => {
  const names = new Intl.DisplayNames(undefined, { type: 'language' });
  return (tag: string) => {
    try {
      const own = new Intl.DisplayNames([tag], { type: 'language' }).of(tag) ?? tag;
      const local = names.of(tag) ?? tag;
      return own === local ? own : `${own} · ${local}`;
    } catch {
      return tag;
    }
  };
})();

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const spellcheck = useStore((s) => s.spellcheck);
  const setSpellcheck = useStore((s) => s.setSpellcheck);
  const showSuggestions = useStore((s) => s.showSuggestions);
  const setShowSuggestions = useStore((s) => s.setShowSuggestions);
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);

  const [info, setInfo] = useState<SpellcheckInfo | null>(null);
  const [language, setLanguage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isDesktop) return;
    invoke<SpellcheckInfo>('spellcheck_info')
      .then((i) => {
        setInfo(i);
        setLanguage(i.current);
      })
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);

  const languages = useMemo(() => {
    const installed = info?.system ?? [];
    const lower = new Set(installed.map((l) => l.toLowerCase()));
    // Windows may list a bare language ("ja"); don't offer its regional twin ("ja-JP") again.
    const others = COMMON_LANGUAGES.filter((l) => !lower.has(l.toLowerCase()) && !lower.has(l.split('-')[0].toLowerCase()));
    if (info && !lower.has(info.current.toLowerCase()) && !others.includes(info.current)) others.unshift(info.current);
    return { installed, others };
  }, [info]);

  const installed = (tag: string) => languages.installed.some((l) => l.toLowerCase() === tag.toLowerCase());
  const changed = info && language && language !== info.current;

  const apply = async () => {
    if (!language) return;
    try {
      await invoke('set_spellcheck_language', { language });
      await flush();
      await invoke('restart_app');
    } catch (e) {
      setError(String(e));
    }
  };

  const option = (tag: string) => (
    <button key={tag} className={`lang-option ${language === tag ? 'selected' : ''}`} onClick={() => setLanguage(tag)}>
      <span className="lang-check">{language === tag && <Check size={14} />}</span>
      <span className="lang-name">{languageName(tag)}</span>
      <span className="lang-tag">{tag}</span>
    </button>
  );

  return createPortal(
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal settings" onMouseDown={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>Settings</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>

        <section className="settings-section">
          <h3>Spelling</h3>
          <label className="switch-row">
            <span>
              <strong>Check spelling</strong>
              <small>Underline misspelled words. Wiki names are never marked.</small>
            </span>
            <input type="checkbox" checked={spellcheck} onChange={(e) => setSpellcheck(e.target.checked)} />
          </label>

          {isDesktop ? (
            <div className={`lang-picker ${spellcheck ? '' : 'disabled'}`}>
              <div className="lang-head">Dictionary</div>
              {error && <p className="settings-error">{error}</p>}
              {!info && !error && <p className="muted small">Loading…</p>}
              {info && (
                <div className="lang-list">
                  {languages.installed.length > 0 && (
                    <>
                      <div className="lang-group">{onWindows ? 'Installed in Windows' : 'Your system languages'}</div>
                      {languages.installed.map(option)}
                    </>
                  )}
                  <div className="lang-group">Other languages</div>
                  {languages.others.map(option)}
                </div>
              )}
              {language && !installed(language) && (
                <p className="hint">
                  {onWindows ? (
                    <>
                      To use {languageName(language)}, add it in Windows <em>Settings › Time &amp; language › Language &amp; region</em>{' '}
                      first, with its spell checker.
                    </>
                  ) : (
                    <>
                      {languageName(language)} needs its Hunspell dictionary installed on this system (the{' '}
                      <em>hunspell-{language.split('-')[0]}</em> package on most distributions).
                    </>
                  )}
                </p>
              )}
              <p className="hint">The spell checker uses one dictionary at a time. Changing it restarts the app.</p>
            </div>
          ) : (
            <p className="hint">
              In the browser, dictionaries come from the browser itself. In Chrome or Edge, add your languages under
              Settings › Languages › Spell check. Several can be active at once there.
            </p>
          )}
        </section>

        <section className="settings-section">
          <h3>Cloud · Koofr</h3>
          <CloudAccountForm />
          <AutosavePicker />
        </section>

        <GeminiSettings />

        <section className="settings-section">
          <h3>Writing</h3>
          <label className="switch-row">
            <span>
              <strong>Detect wiki names</strong>
              <small>Underline names from the Wiki that aren’t linked yet.</small>
            </span>
            <input type="checkbox" checked={showSuggestions} onChange={(e) => setShowSuggestions(e.target.checked)} />
          </label>
          <label className="switch-row">
            <span>
              <strong>Dark theme</strong>
            </span>
            <input type="checkbox" checked={theme === 'dark'} onChange={(e) => setTheme(e.target.checked ? 'dark' : 'light')} />
          </label>
        </section>

        <footer className="modal-foot">
          {changed ? (
            <button className="btn primary" onClick={apply}>
              <RotateCcw size={15} /> Use {languageName(language!)} &amp; restart
            </button>
          ) : (
            <button className="btn ghost" onClick={onClose}>
              Done
            </button>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  );
}

function GeminiSettings() {
  const geminiKey = useStore((s) => s.geminiKey);
  const geminiModel = useStore((s) => s.geminiModel);
  const setGemini = useStore((s) => s.setGemini);
  const [showKey, setShowKey] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [modelsError, setModelsError] = useState('');
  const [loading, setLoading] = useState(false);

  const loadModels = async () => {
    setLoading(true);
    setModelsError('');
    try {
      setModels(await listModels(geminiKey));
    } catch (e) {
      setModelsError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="settings-section">
      <h3>Gemini assistant</h3>
      <p className="hint settings-lead">
        Powers <strong>Extract wiki</strong> in chapters. Get a key at aistudio.google.com › Get API key. When you use it,
        the chapter’s text is sent to Google. The key is stored only on this computer and never exported.
      </p>
      <div className="settings-field">
        <span>API key</span>
        <div className="settings-input-row">
          <input
            type={showKey ? 'text' : 'password'}
            value={geminiKey}
            placeholder="Paste your Gemini API key"
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => setGemini({ geminiKey: e.target.value.trim() })}
          />
          <button className="icon-btn" onClick={() => setShowKey(!showKey)} title={showKey ? 'Hide key' : 'Show key'}>
            {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>
      <div className="settings-field">
        <span>Model</span>
        <div className="settings-input-row">
          <input
            list="gemini-models"
            value={geminiModel}
            placeholder="Automatic (newest Flash model)"
            spellCheck={false}
            onChange={(e) => setGemini({ geminiModel: e.target.value.trim() })}
            onBlur={(e) => !e.target.value.trim() && setGemini({ geminiModel: DEFAULT_GEMINI_MODEL })}
          />
          <datalist id="gemini-models">
            {models.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          <button className="btn ghost sm" disabled={!geminiKey || loading} onClick={loadModels}>
            {loading ? 'Loading…' : models.length ? `${models.length} available` : 'Load list'}
          </button>
        </div>
        {modelsError && <small className="settings-error">{modelsError}</small>}
      </div>
    </section>
  );
}
