import { copyText } from '@cots/platform';
import { useEffect, useState } from 'preact/hooks';
import { t } from './i18n';
import type { SlotOutcome } from './save-data';
import type { Restored } from './saves';
import { isoDate, storageKept, todayLocal } from './store';

/*
 * Saves in the settings (docs/tech-spec.md §28): whether this browser will
 * keep them, a backup to download or copy, and restoring one. The storage
 * side (./saves) loads when first used, so the title screen stays small.
 */

/** Starts a download of `text` as a file, where the browser allows one (the text box is there either way). */
function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Text worth keeping, in a box it can be copied from by hand, with Download and Copy buttons. */
export function CopyBox({ text, file, id }: { text: string; file: string; id: string }) {
  const [status, setStatus] = useState<string | null>(null);
  return (
    <div class="copybox">
      <textarea class="share" readOnly rows={4} data-testid={`${id}-text`} value={text} />
      <div class="row">
        <button
          type="button"
          class="btn btn--primary btn--small"
          data-testid={`${id}-download`}
          onClick={() => download(file, text)}
        >
          {t('ui.backup.download')}
        </button>
        <button
          type="button"
          class="btn btn--small"
          data-testid={`${id}-copy`}
          onClick={async () => setStatus(t((await copyText(text)) ? 'ui.summary.copied' : 'ui.report.copyFailed'))}
        >
          {t('ui.backup.copy')}
        </button>
      </div>
      {status ? (
        <p role="status" class="muted">
          {status}
        </p>
      ) : null}
    </div>
  );
}

type Panel = 'backup' | 'restore' | null;

export function SavesSettings() {
  const [panel, setPanel] = useState<Panel>(null);
  const kept = storageKept.value;
  const toggle = (p: Panel) => setPanel(panel === p ? null : p);
  return (
    <fieldset class="saves" data-testid="saves">
      <legend>{t('ui.saves')}</legend>
      {kept ? (
        <p class="muted" data-testid="storage-status">
          {t(`ui.saves.${kept}`)}
        </p>
      ) : null}
      <div class="row">
        <button
          type="button"
          class="btn btn--small"
          data-testid="backup-make"
          aria-expanded={panel === 'backup'}
          onClick={() => toggle('backup')}
        >
          {t('ui.backup.make')}
        </button>
        <button
          type="button"
          class="btn btn--small"
          data-testid="backup-restore"
          aria-expanded={panel === 'restore'}
          onClick={() => toggle('restore')}
        >
          {t('ui.backup.restore')}
        </button>
      </div>
      {panel === 'backup' ? <BackupPanel /> : null}
      {panel === 'restore' ? <RestorePanel /> : null}
    </fieldset>
  );
}

function BackupPanel() {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    void import('./saves').then(async (m) => setText(JSON.stringify(await m.makeBackup())));
  }, []);
  return (
    <div class="saves__panel" data-testid="backup-panel">
      <p class="muted">{t('ui.backup.note')}</p>
      {text === null ? null : (
        <CopyBox text={text} file={`chooser-of-the-slain-backup-${isoDate(todayLocal())}.json`} id="backup" />
      )}
    </div>
  );
}

function RestorePanel() {
  const [text, setText] = useState('');
  const [result, setResult] = useState<Restored | null>(null);
  const [busy, setBusy] = useState(false);
  const restore = async (body: string) => {
    setBusy(true);
    const m = await import('./saves');
    setResult(await m.restoreBackup(body));
    setBusy(false);
  };
  return (
    <div class="saves__panel" data-testid="restore-panel">
      <p class="muted">{t('ui.backup.restoreNote')}</p>
      <label class="saves__file">
        {t('ui.backup.file')}{' '}
        <input
          type="file"
          accept=".json,application/json,text/plain"
          data-testid="restore-file"
          disabled={busy}
          onChange={async (e) => {
            const f = (e.target as HTMLInputElement).files?.[0];
            if (f) await restore(await f.text());
          }}
        />
      </label>
      <label class="saves__paste">
        {t('ui.backup.paste')}
        <textarea
          class="share"
          rows={4}
          data-testid="restore-text"
          value={text}
          onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
        />
      </label>
      <div class="row">
        <button
          type="button"
          class="btn btn--primary btn--small"
          data-testid="restore-go"
          disabled={busy || text.trim() === ''}
          onClick={() => void restore(text)}
        >
          {t('ui.backup.go')}
        </button>
      </div>
      {result ? <RestoreResult result={result} /> : null}
    </div>
  );
}

const slotLine = (o: SlotOutcome): string =>
  'to' in o
    ? t(`ui.backup.slot.${o.outcome}`, { from: o.from + 1, to: o.to + 1 })
    : t(`ui.backup.slot.${o.outcome}`, { from: o.from + 1 });

function RestoreResult({ result }: { result: Restored }) {
  if (!result.ok) {
    return (
      <p role="alert" data-testid="restore-result">
        {t(`ui.backup.bad.${result.why}`)}
      </p>
    );
  }
  const r = result.report;
  const lines = [
    t('ui.backup.daily', { n: r.dailyAdded }),
    ...r.slots.map(slotLine),
    ...(r.endlessRun ? [t('ui.backup.endlessRun')] : []),
    ...(r.dailyRun ? [t('ui.backup.dailyRun')] : []),
    ...(r.records ? [t('ui.backup.records')] : []),
  ];
  return (
    <div role="status" data-testid="restore-result">
      <p>{t('ui.backup.done')}</p>
      <ul>
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  );
}
