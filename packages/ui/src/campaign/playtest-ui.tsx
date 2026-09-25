import { gameContent, manifest } from 'virtual:content';
import { ENGINE_MAJOR, resumeSave } from '@cots/engine';
import { copyText } from '@cots/platform';
import { signal } from '@preact/signals';
import { useState } from 'preact/hooks';
import { buildLabel } from '../build';
import { t } from '../i18n';
import { issueFormUrl } from '../links';
import type { SlotRecord } from '../save-data';
import { useAutoFocus } from '../shift/Shift';
import { playtestReport, playtestTitle } from './playtest';

/*
 * The playtest report on the save slots (docs/tech-spec.md §38), in builds for invited playtesters: the run
 * as text, to copy or to send in the playtest form with it filled in.
 */

/** GitHub turns away very long addresses; past this the form opens empty, for the report to be pasted in. */
const MAX_URL = 8000;

/** The slot whose report is open. */
export const playtestSlot = signal<number | null>(null);

export function PlaytestButton({ i }: { i: number }) {
  if (!manifest.playtest) return null;
  return (
    <button
      type="button"
      class="btn btn--quiet btn--small"
      data-testid={`playtest-${i}`}
      onClick={() => (playtestSlot.value = i)}
    >
      {t('ui.playtest.report')}
    </button>
  );
}

export function PlaytestDialog({
  slots,
  scenes,
}: {
  slots: readonly (SlotRecord | null)[];
  scenes: Readonly<Record<string, object>>;
}) {
  const i = playtestSlot.value;
  const record = i === null ? null : (slots[i] ?? null);
  return i !== null && record ? <PlaytestBox i={i} record={record} scenes={scenes} /> : null;
}

function PlaytestBox({
  i,
  record,
  scenes,
}: {
  i: number;
  record: SlotRecord;
  scenes: Readonly<Record<string, object>>;
}) {
  const focus = useAutoFocus<HTMLButtonElement>();
  const [copied, setCopied] = useState<boolean | null>(null);
  const { run } = resumeSave(record.save, gameContent, ENGINE_MAJOR);
  const text = playtestReport({ save: record.save, run, slot: i, build: buildLabel, content: gameContent, scenes, t });
  const title = playtestTitle(run);
  const filled = issueFormUrl('campaign-playtest.yml', { report: text }, title);
  const fits = filled !== undefined && filled.length <= MAX_URL;
  const url = fits ? filled : issueFormUrl('campaign-playtest.yml', {}, title);
  const close = () => {
    playtestSlot.value = null;
  };
  return (
    <div
      class="overlay overlay--top"
      role="dialog"
      aria-modal="true"
      aria-labelledby="playtest-title"
      data-testid="playtest"
      onKeyDown={(e) => {
        if (e.key === 'Escape') close();
      }}
    >
      <div class="dialog">
        <h2 id="playtest-title">{t('ui.playtest.title')}</h2>
        <p>{t('ui.playtest.body')}</p>
        <textarea
          class="share share--small"
          readOnly
          rows={8}
          value={text}
          aria-label={t('ui.playtest.textLabel')}
          data-testid="playtest-text"
        />
        {url && !fits ? <p class="muted">{t('ui.playtest.paste')}</p> : null}
        <div class="row">
          {url ? (
            <a
              class="btn btn--primary"
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="playtest-open"
            >
              {t('ui.playtest.open')}
            </a>
          ) : null}
          <button
            type="button"
            class="btn"
            data-testid="playtest-copy"
            onClick={async () => setCopied(await copyText(text))}
          >
            {t(copied === true ? 'ui.report.copied' : copied === false ? 'ui.report.copyFailed' : 'ui.report.copy')}
          </button>
          <button
            type="button"
            class="btn btn--quiet"
            data-testid="playtest-close"
            data-back
            ref={focus}
            onClick={close}
          >
            {t('ui.playtest.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
