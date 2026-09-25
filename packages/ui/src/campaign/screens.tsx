import { gameContent, loadScenes, manifest } from 'virtual:content';
import {
  type AppealHeard,
  type Bills,
  billForecast,
  billTotal,
  type Content,
  campaignOf,
  careFor,
  createDayContext,
  type DayLedger,
  DESTINATIONS,
  debtLimit,
  defaultBills,
  type Effect,
  economyOf,
  type Faction,
  type FavourDef,
  factionKey,
  factionsMet,
  favoursFor,
  hostMarks,
  hostParts,
  type JournalEntry,
  type NightOutlook,
  nightOutlook,
  type RunEvent,
  type RunState,
  reachableEndings,
  replayableDays,
  ruleText,
  shiftMods,
  shiftScore,
  shopFor,
  stampEffects,
  standingFx,
  standingLead,
  threadsInPlay,
  withEffects,
} from '@cots/engine';
import { journalEnv, playScene, type SceneLine, sceneEnv } from '@cots/story';
import { effect, signal } from '@preact/signals';
import type { ComponentChildren } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { AssistSettings, assistText, atSunSpeed } from '../assists';
import { clockText, hasText, listText, t } from '../i18n';
import { openReport } from '../report';
import { unreadableText } from '../saves';
import { CopyBox } from '../saves-ui';
import { toTop, toTopOf } from '../scroll';
import { skippedText } from '../shift/evidence';
import { Decree } from '../shift/Rules';
import { ReportDialog, useAutoFocus } from '../shift/Shift';
import { campaignPlace, useStoryText } from '../sound/place';
import { currentAssists, type Screen, session, settings, storageKept, toTitle } from '../store';
import { PlaytestButton, PlaytestDialog } from './playtest-ui';
import {
  active,
  branchFrom,
  deleteSlot,
  dispatch,
  emptySlot,
  endAudit,
  hearAppeal,
  lastNight,
  leaveCampaign,
  letAppealStand,
  loadSlots,
  newCampaign,
  openSlot,
  replayFrom,
  SLOT_COUNT,
  type SlotRecord,
  sleep,
  slots,
  toGate,
  unreadable,
} from './run-store';

/*
 * The campaign's own screens (docs/build-plan.md §1, "Day loop"): the save
 * slots, then each day's morning, audit and night, and the ending. The shift
 * itself is the ordinary shift screen, stepping the run underneath.
 */

/** Compiled Ink scenes, loaded with the campaign. */
let scenes: Readonly<Record<string, object>> = {};

// The run's day and ending, for the sound, which chooses Day 20's gate and each ending's music by them.
effect(() => {
  const run = active.value?.run;
  campaignPlace.value = run ? { day: run.day, ending: run.ending ?? null } : null;
});

export async function enterCampaign(): Promise<void> {
  [scenes] = await Promise.all([loadScenes(), loadSlots()]);
}

const familyName = (content: Content, id: string) => t(campaignOf(content).family.find((m) => m.id === id)?.name ?? id);

/** The name to use inside a sentence ("Ragna" rather than "Ragna, your mother"): `<name key>.short`, if there is one. */
const familyShort = (content: Content, id: string) => {
  const key = campaignOf(content).family.find((m) => m.id === id)?.name ?? id;
  return hasText(`${key}.short`) ? t(`${key}.short`) : t(key);
};

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

/** The name a power goes by on `day` (the stranger is Loki, but nobody says so until Day 12). */
const factionName = (f: Faction, day: number) => t(factionKey(gameContent, f, day));

/** "Hel will remember that (+3)." for each power the effects move, in the order they first move it. */
function standingNotes(effects: readonly Effect[] | undefined, day: number): string[] {
  const by = new Map<Faction, number>();
  for (const e of effects ?? []) if ('standing' in e) by.set(e.standing, (by.get(e.standing) ?? 0) + e.by);
  return [...by]
    .filter(([, n]) => n !== 0)
    .map(([f, n]) => t('ui.remember', { name: factionName(f, day), change: signed(n) }));
}

/** Where the player stands with each power they've had dealings with, on one line. */
function StandingStrip({ run }: { run: RunState }) {
  const met = factionsMet(run);
  if (met.length === 0) return null;
  return (
    <p class="standing-strip" data-testid="standing-strip">
      <span class="muted">{t('ui.audit.standing')}:</span>{' '}
      {met.map((f, i) => (
        <span key={f} class="standing-strip__item">
          {i > 0 ? ' · ' : ''}
          {factionName(f, run.day)}{' '}
          <b class={run.standing[f] > 0 ? 'is-up' : run.standing[f] < 0 ? 'is-down' : undefined}>
            {signed(run.standing[f])}
          </b>
        </span>
      ))}
    </p>
  );
}

// ---------- endings ----------

/** Every ending this build's campaign can come to: the ones found on this device by name, the rest unnamed. */
function EndingsGallery() {
  const all = reachableEndings(gameContent);
  const seen = settings.value.endingsSeen;
  const found = all.filter((e) => seen.includes(e.id)).length;
  return (
    <section class="card gallery" data-testid="endings">
      <h2>{t('ui.gallery.title')}</h2>
      <p class="muted" data-testid="endings-count">
        {t('ui.gallery.count', { n: found, total: all.length })}
      </p>
      <ol class="gallery__list">
        {all.map((e) =>
          seen.includes(e.id) ? (
            <li key={e.id} data-testid="ending-found">
              <details>
                <summary>{t(e.title)}</summary>
                <p>{t(e.text)}</p>
              </details>
            </li>
          ) : (
            <li key={e.id} class="muted" data-testid="ending-unfound">
              {t('ui.gallery.unfound')}
            </li>
          ),
        )}
      </ol>
    </section>
  );
}

/**
 * How the run stood when it ended: the host at Ragnarök part by part, with what the endings ask of it
 * (naming only endings found on this device), the powers' standing, and where the souls went.
 */
function RagnarokReport({ run }: { run: RunState }) {
  const marks = hostMarks(gameContent);
  const host = hostParts(run);
  const seen = settings.value.endingsSeen;
  const title = (id: string) => {
    const e = campaignOf(gameContent).endings.find((x) => x.id === id);
    return e && seen.includes(id) ? t(e.title) : t('ui.ending.unfound');
  };
  const met = factionsMet(run);
  const sent = DESTINATIONS.filter((d) => (run.sent?.[d] ?? 0) > 0);
  const rows: readonly [string, number, number][] = [
    ['ui.ending.worthy', host.worthy, 2 * host.worthy],
    ['ui.ending.unworthy', host.unworthy, -host.unworthy],
    ['ui.ending.folkvangr', host.folkvangr, 2 * host.folkvangr],
    ['ui.ending.helLegion', host.hel, 2 * host.hel],
    ['ui.ending.naglfar', host.naglfar, -2 * host.naglfar],
  ];
  return (
    <>
      {marks.length > 0 ? (
        <section class="card" data-testid="host">
          <h2>{t('ui.ending.host')}</h2>
          <table class="ledger">
            <tbody>
              {rows.map(([key, n, worth]) => (
                <tr key={key}>
                  <td>{t(key, { n })}</td>
                  <td class="num">{signed(worth)}</td>
                </tr>
              ))}
              <tr class="ledger__total">
                <td>{t('ui.ending.hostTotal')}</td>
                <td class="num" data-testid="host-total">
                  {host.total}
                </td>
              </tr>
            </tbody>
          </table>
          <p class="muted report__lead">{t('ui.ending.marks')}</p>
          <ul class="report__marks" data-testid="host-marks">
            {marks.map((m) => (
              <li key={`${m.ending}:${m.atLeast ?? ''}:${m.atMost ?? ''}`}>
                {m.atLeast !== undefined
                  ? t('ui.ending.markAtLeast', { ending: title(m.ending), n: m.atLeast })
                  : t('ui.ending.markAtMost', { ending: title(m.ending), n: m.atMost ?? 0 })}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {met.length > 0 ? (
        <section class="card" data-testid="final-standing">
          <h2>{t('ui.ending.standing')}</h2>
          <table class="ledger">
            <tbody>
              {[...met]
                .sort((x, y) => run.standing[y] - run.standing[x])
                .map((f) => (
                  <tr key={f}>
                    <td>
                      {factionName(f, run.day)}
                      {standingLead(run, f) > 0 ? <span class="muted"> {t('ui.ending.led')}</span> : null}
                    </td>
                    <td class="num">{signed(run.standing[f])}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      ) : null}
      {sent.length > 0 ? (
        <section class="card" data-testid="sent">
          <h2>{t('ui.ending.sent')}</h2>
          <p>{sent.map((d) => `${t(`dest.${d}`)} ${run.sent?.[d] ?? 0}`).join(' · ')}</p>
        </section>
      ) : null}
    </>
  );
}

// ---------- save slots ----------

function SlotSummary({ record }: { record: SlotRecord }) {
  const run = record.save.mornings[record.save.mornings.length - 1];
  if (!run) return null;
  const home = run.family.filter((m) => m.status !== 'gone').length;
  return (
    <p data-testid="slot-summary">
      {t('ui.campaign.summary', { day: run.day, rings: run.rings, home, family: run.family.length })}
      {run.story ? ` · ${t('ui.campaign.story')}` : ''}
      {run.slice ? ` · ${t('ui.campaign.slice')}` : ''}
    </p>
  );
}

/** A night that ends the run stays in the day's log; any other night starts a new morning. */
function hasEnded(record: SlotRecord): boolean {
  return record.save.log[record.save.log.length - 1]?.t === 'endNight';
}

type Start = 'campaign' | 'play' | 'fromJump';

/** How a new run can start: the campaign, or (in builds that have one) the vertical slice, played or from its jump. */
function StartChoice({ i, value, onChange }: { i: number; value: Start; onChange: (s: Start) => void }) {
  if (!gameContent.campaign?.slice) return null;
  const options: Start[] = ['campaign', 'play', 'fromJump'];
  return (
    <fieldset class="slot__start">
      {options.map((o) => (
        <label key={o}>
          <input
            type="radio"
            name={`start-${i}`}
            checked={value === o}
            data-testid={`start-${o}-${i}`}
            onChange={() => onChange(o)}
          />{' '}
          {t(`ui.campaign.start.${o}`, { day: gameContent.campaign?.slice?.day ?? 0 })}
        </label>
      ))}
    </fieldset>
  );
}

function Slot({ i, record }: { i: number; record: SlotRecord | null }) {
  const [story, setStory] = useState(false);
  const [start, setStart] = useState<Start>('campaign');
  const [confirm, setConfirm] = useState(false);
  const days = record ? replayableDays(record.save) : [];
  const [day, setDay] = useState(days[days.length - 1] ?? 1);
  if (!record) {
    return (
      <section class="card slot" data-testid={`slot-${i}`}>
        <h2>{t('ui.campaign.slot', { n: i + 1 })}</h2>
        <p class="muted">{t('ui.campaign.empty')}</p>
        <label class="slot__story">
          <input
            type="checkbox"
            checked={story}
            data-testid={`story-${i}`}
            onChange={(e) => setStory((e.target as HTMLInputElement).checked)}
          />{' '}
          {t('ui.campaign.storyMode')}
        </label>
        <StartChoice i={i} value={start} onChange={setStart} />
        <div class="row">
          <button
            type="button"
            class="btn btn--primary"
            data-testid={`new-${i}`}
            onClick={() => newCampaign(i, story, start === 'campaign' ? undefined : start)}
          >
            {t('ui.campaign.new')}
          </button>
        </div>
      </section>
    );
  }
  const ended = hasEnded(record);
  return (
    <section class="card slot" data-testid={`slot-${i}`}>
      <h2>{t('ui.campaign.slot', { n: i + 1 })}</h2>
      <SlotSummary record={record} />
      {ended ? <p class="muted">{t('ui.campaign.endedShort')}</p> : null}
      <div class="row">
        <button type="button" class="btn btn--primary" data-testid={`continue-${i}`} onClick={() => openSlot(i)}>
          {ended ? t('ui.campaign.seeEnding') : t('ui.campaign.continue')}
        </button>
        <PlaytestButton i={i} />
      </div>
      {days.length > 0 ? (
        <div class="row">
          <label>
            {t('ui.campaign.replay')}{' '}
            <select
              value={day}
              data-testid={`replay-day-${i}`}
              onChange={(e) => setDay(Number((e.target as HTMLSelectElement).value))}
            >
              {days.map((d) => (
                <option key={d} value={d}>
                  {t('ui.campaign.day', { n: d })}
                </option>
              ))}
            </select>
          </label>
          <button type="button" class="btn" data-testid={`replay-${i}`} onClick={() => replayFrom(i, day)}>
            {t('ui.campaign.replayGo')}
          </button>
          <button
            type="button"
            class="btn"
            data-testid={`branch-${i}`}
            disabled={emptySlot() === null}
            onClick={() => branchFrom(i, day)}
          >
            {t('ui.campaign.branchGo')}
          </button>
        </div>
      ) : null}
      {days.length > 0 ? (
        <p class="muted">{t(emptySlot() === null ? 'ui.campaign.replayWarnFull' : 'ui.campaign.replayWarn')}</p>
      ) : null}
      {confirm ? (
        <div class="row">
          <span>{t('ui.campaign.deleteConfirm')}</span>
          <button
            type="button"
            class="btn btn--danger btn--small"
            data-testid={`delete-yes-${i}`}
            onClick={() => {
              deleteSlot(i);
              setConfirm(false);
            }}
          >
            {t('ui.campaign.deleteYes')}
          </button>
          <button type="button" class="btn btn--small" data-back onClick={() => setConfirm(false)}>
            {t('ui.campaign.cancel')}
          </button>
        </div>
      ) : (
        <button
          type="button"
          class="btn btn--quiet btn--small"
          data-testid={`delete-${i}`}
          onClick={() => setConfirm(true)}
        >
          {t('ui.campaign.delete')}
        </button>
      )}
    </section>
  );
}

/** A slot whose save this build can't read: kept as found, to copy for a bug report or clear. */
function UnreadableSlot({ i }: { i: number }) {
  const [copy, setCopy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  return (
    <section class="card slot slot--unreadable" data-testid={`slot-${i}`}>
      <h2>{t('ui.campaign.slot', { n: i + 1 })}</h2>
      <p data-testid={`unreadable-${i}`}>{t('ui.campaign.unreadable')}</p>
      <div class="row">
        <button
          type="button"
          class="btn btn--small"
          data-testid={`unreadable-copy-${i}`}
          aria-expanded={copy}
          onClick={() => setCopy(!copy)}
        >
          {t('ui.campaign.unreadable.copy')}
        </button>
        {confirm ? null : (
          <button
            type="button"
            class="btn btn--quiet btn--small"
            data-testid={`unreadable-clear-${i}`}
            onClick={() => setConfirm(true)}
          >
            {t('ui.campaign.unreadable.clear')}
          </button>
        )}
      </div>
      {copy ? (
        <CopyBox text={unreadableText(i)} file={`chooser-of-the-slain-slot-${i + 1}.json`} id={`unreadable-${i}`} />
      ) : null}
      {confirm ? (
        <div class="row">
          <span>{t('ui.campaign.unreadable.confirm')}</span>
          <button
            type="button"
            class="btn btn--danger btn--small"
            data-testid={`unreadable-clear-yes-${i}`}
            onClick={() => deleteSlot(i)}
          >
            {t('ui.campaign.deleteYes')}
          </button>
          <button type="button" class="btn btn--small" data-back onClick={() => setConfirm(false)}>
            {t('ui.campaign.cancel')}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function SlotsScreen() {
  const focus = useAutoFocus<HTMLHeadingElement>();
  const kept = storageKept.value;
  return (
    <main class="screen screen--campaign">
      <h1 ref={focus} tabIndex={-1} data-testid="campaign-title">
        {t('ui.campaign')}
      </h1>
      <p class="muted">{t(manifest.edition === 'demo' ? 'ui.campaign.hint.demo' : 'ui.campaign.hint.full')}</p>
      {kept === 'maybe' || kept === 'session' ? (
        <p class="muted" data-testid="backup-hint">
          {t('ui.campaign.backupHint')}
        </p>
      ) : null}
      {Array.from({ length: SLOT_COUNT }, (_, i) =>
        unreadable.value[i] ? (
          <UnreadableSlot key={`${i}:unreadable`} i={i} />
        ) : (
          <Slot key={`${i}:${slots.value[i]?.rev ?? 0}`} i={i} record={slots.value[i] ?? null} />
        ),
      )}
      <EndingsGallery />
      <PlaytestDialog slots={slots.value} scenes={scenes} />
      <div class="row">
        <button type="button" class="btn" data-testid="campaign-back" data-back onClick={toTitle}>
          {t('ui.back')}
        </button>
      </div>
    </main>
  );
}

// ---------- scenes ----------

/** A scene's lines as played so far, each followed by notes of whom it moved. */
function SceneLines({ lines, day, prefix }: { lines: readonly SceneLine[]; day: number; prefix: string }) {
  return (
    <>
      {lines.flatMap((line, i) => [
        <p
          key={`${prefix}:${i}`}
          class={`scene__line${line.chosen ? ' scene__line--chosen' : line.speaker ? ' scene__line--said' : ''}`}
          data-line={i}
        >
          {line.speaker ? <b class="scene__speaker">{t(`speaker.${line.speaker}`)}: </b> : null}
          {line.text}
        </p>,
        ...standingNotes(line.effects, day).map((note) => (
          <p key={`${prefix}:${i}:${note}`} class="scene__note" data-testid="scene-note">
            {note}
          </p>
        )),
      ])}
    </>
  );
}

/** What an option that costs rings would leave after tonight's bills. */
function Leaves({ n, floor }: { n: number | null; floor: number }) {
  if (n === null) return null;
  return (
    <>
      {' '}
      <span class={`scene__cost${n < floor ? ' is-debt' : ''}`} data-testid="scene-leaves">
        ({t('ui.scene.leaves', { n })})
      </span>
    </>
  );
}

/**
 * Plays one Ink scene; its effects reach the run once, when the player finishes it. A scene opens at the
 * top of the page, and each choice brings the lines it adds (the choice, then what follows) to the top of
 * the view; the first option, or Continue, takes the keyboard's focus without scrolling (§30).
 */
function SceneView({ id, run }: { id: string; run: RunState }) {
  useStoryText();
  const [env] = useState(() => sceneEnv(run, id));
  const [choices, setChoices] = useState<number[]>([]);
  const json = scenes[id];
  const focus = useRef<HTMLButtonElement>(null);
  const section = useRef<HTMLElement>(null);
  // How many lines were shown when the last choice was made: the index of the first line it added.
  const shown = useRef(0);
  useLayoutEffect(() => {
    if (choices.length === 0) toTop();
    else toTopOf(section.current?.querySelector(`[data-line="${shown.current}"]`));
    focus.current?.focus({ preventScroll: true });
  }, [choices.length]);
  const a = active.value;
  if (!json || !a) return null;
  const frame = playScene(json, env, choices);
  const first = frame.choices.findIndex((c) => !c.locked);
  // Options that cost rings are weighed against tonight's bills, with the scene's effects so far (and at
  // night each option's own: a healer who cures means no medicine to buy) (docs/tech-spec.md §23).
  const outlookAfter = (effects: readonly Effect[]) => {
    const r = withEffects(run, effects);
    return { rings: r.rings, night: nightOutlook(r, { content: gameContent, ctx: a.ctx }, defaultBills(r)) };
  };
  const costly = !frame.done && frame.choices.some((c) => c.rings !== undefined);
  const now = costly ? outlookAfter(frame.effects) : null;
  const leaves = (i: number) =>
    now && run.phase === 'night' ? outlookAfter(playScene(json, env, [...choices, i]).effects).night.rings : null;
  const floor = campaignOf(gameContent).debtFloor;
  return (
    <section ref={section} class="card scene" data-testid="scene" data-scene={id}>
      {frame.draft ? (
        <p class="scene__draft" data-testid="scene-draft">
          {t('ui.campaign.draft')}
        </p>
      ) : null}
      <SceneLines lines={frame.lines} day={run.day} prefix={String(choices.length)} />
      {now ? (
        <p class="scene__purse" data-testid="scene-purse">
          {t('ui.scene.purse', {
            rings: now.rings,
            bills: now.night.cost.hearth + now.night.cost.food + now.night.cost.medicine,
            draupnir: now.night.draupnir,
            phase: run.phase,
          })}
        </p>
      ) : null}
      <div class="scene__choices">
        {frame.done ? (
          <button
            type="button"
            class="btn btn--primary"
            data-testid="scene-done"
            ref={focus}
            onClick={() => {
              dispatch({ t: 'scene', id, choices, effects: frame.effects });
              // What follows the scene (the day's orders, the night's bills, or the next scene) opens at the top.
              toTop();
            }}
          >
            {t('ui.campaign.next')}
          </button>
        ) : (
          frame.choices.map((c, i) =>
            c.locked ? (
              // An option the purse can't cover stays in sight, with what it needs.
              <button
                key={`${choices.length}:${c.text}`}
                type="button"
                class="btn scene__choice is-locked"
                data-testid="scene-choice-locked"
                disabled
              >
                {c.text}{' '}
                <span class="scene__cost">({t('ui.scene.needsRings', { n: c.rings ?? 0, have: env.rings })})</span>
              </button>
            ) : (
              <button
                key={`${choices.length}:${c.text}`}
                type="button"
                class="btn scene__choice"
                data-testid="scene-choice"
                ref={i === first ? focus : undefined}
                onClick={() => {
                  shown.current = frame.lines.length;
                  setChoices([...choices, i]);
                }}
              >
                {c.text}
                <Leaves n={c.rings !== undefined ? leaves(i) : null} floor={floor} />
              </button>
            ),
          )
        )}
      </div>
    </section>
  );
}

// ---------- journal ----------

/** Whether the journal is open over the morning, night or ending screen (which stays as it was underneath). */
const journalOpen = signal(false);

function JournalButton() {
  return (
    <button type="button" class="btn btn--quiet" data-testid="journal-open" onClick={() => (journalOpen.value = true)}>
      {t('ui.journal')}
    </button>
  );
}

/** A scene from the journal, played again with the choices made and the view it had then. */
function JournalScene({ entry, seed }: { entry: JournalEntry; seed: string }) {
  const json = scenes[entry.scene];
  const when = gameContent.days.find((d) => d.day === entry.day)?.scenes;
  const label =
    when?.morning === entry.scene ? 'ui.journal.morning' : when?.night === entry.scene ? 'ui.journal.night' : null;
  let lines: readonly SceneLine[] | null = null;
  try {
    lines = json ? playScene(json, journalEnv(seed, entry), entry.choices).lines : null;
  } catch {
    // A rewrite since then changed its choices; the journal says so rather than guessing.
    lines = null;
  }
  return (
    <section class="journal__scene" data-testid="journal-scene">
      {label ? <h4>{t(label)}</h4> : null}
      {lines ? (
        <SceneLines lines={lines} day={entry.day} prefix={entry.scene} />
      ) : (
        <p class="muted">{t('ui.journal.changed')}</p>
      )}
    </section>
  );
}

/**
 * What's still in play (the threads the endings hang on), then every scene played, newest day first:
 * letters, choices and all. Only the days opened are played again.
 */
function JournalView() {
  const a = active.value;
  const focus = useAutoFocus<HTMLButtonElement>();
  const entries = a?.record.save.journal ?? [];
  const days = [...new Set(entries.map((e) => e.day))].sort((x, y) => y - x);
  const [open, setOpen] = useState<readonly number[]>(days.slice(0, 1));
  if (!a) return null;
  const threads = threadsInPlay(a.run, gameContent);
  const close = () => {
    journalOpen.value = false;
  };
  return (
    <div
      class="journal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="journal-title"
      data-testid="journal"
      onKeyDown={(e) => {
        if (e.key === 'Escape') close();
      }}
    >
      <div class="journal__page">
        <div class="journal__head">
          <h2 id="journal-title">{t('ui.journal')}</h2>
          <button type="button" class="btn" ref={focus} data-testid="journal-close" data-back onClick={close}>
            {t('ui.journal.close')}
          </button>
        </div>
        {threads.length > 0 ? (
          <section class="card journal__threads" data-testid="journal-threads">
            <h3>{t('ui.journal.threads')}</h3>
            <ul>
              {threads.map((th) => (
                <li key={th.id}>{t(th.text, th.n !== undefined ? { n: th.n } : {})}</li>
              ))}
            </ul>
          </section>
        ) : null}
        {days.length === 0 ? <p class="muted">{t('ui.journal.empty')}</p> : null}
        {days.map((day) => (
          <details
            key={day}
            class="journal__day"
            open={open.includes(day)}
            data-testid="journal-day"
            onToggle={(e) => {
              const now = (e.currentTarget as HTMLDetailsElement).open;
              if (now !== open.includes(day)) setOpen(now ? [...open, day] : open.filter((d) => d !== day));
            }}
          >
            <summary>
              <h3 class="journal__dayTitle">{t('ui.campaign.day', { n: day })}</h3>
            </summary>
            {open.includes(day)
              ? entries
                  .filter((e) => e.day === day)
                  .map((e) => <JournalScene key={e.scene} entry={e} seed={a.run.seed} />)
              : null}
          </details>
        ))}
      </div>
    </div>
  );
}

/** After a night below the debt floor, how many more end the run, on the morning and night screens. */
function DebtBanner({ run }: { run: RunState }) {
  const limit = debtLimit(gameContent);
  if (run.debtNights < 1 || limit === null) return null;
  return (
    <div class="banner banner--bad" role="status" data-testid="debt-banner">
      <p>
        {t('ui.debt.banner', {
          n: run.debtNights,
          floor: campaignOf(gameContent).debtFloor,
          left: limit - run.debtNights,
        })}
      </p>
    </div>
  );
}

/** The scene still to be played now, if the day has one and this build ships it. */
function pendingScene(run: RunState, which: 'morning' | 'night'): string | null {
  const id = gameContent.days.find((d) => d.day === run.day)?.scenes?.[which];
  return id && scenes[id] && !run.scenes.includes(id) ? id : null;
}

// ---------- morning ----------

function NightNews({ events }: { events: readonly RunEvent[] }) {
  const news = events.flatMap((e) => {
    if (e.e === 'family') return [t(`ui.news.${e.change}`, { name: familyShort(gameContent, e.id) })];
    if (e.e === 'draupnir') return [t('ui.news.draupnir', { n: e.rings })];
    return [];
  });
  if (news.length === 0) return null;
  return (
    <section class="card card--news" data-testid="night-news">
      {news.map((n) => (
        <p key={n}>{n}</p>
      ))}
    </section>
  );
}

function RulebookChanges({ day }: { day: number }) {
  if (day === 1) return null;
  const added = gameContent.rules.filter((r) => r.since === day);
  const reworded = gameContent.rules.filter((r) => r.since < day && r.texts?.some((x) => x.since === day));
  const repealed = gameContent.rules.filter((r) => r.until === day);
  const tools = gameContent.tools.filter((x) => x.since === day);
  const procedures = (gameContent.procedures ?? []).filter((p) => p.since === day);
  if (added.length + reworded.length + repealed.length + tools.length + procedures.length === 0) return null;
  return (
    <div class="changes" data-testid="rulebook-changes">
      {added.map((r) => (
        <p key={r.id}>
          <span class="badge badge--new">{t('ui.campaign.new.badge')}</span> {t(ruleText(r, day))}
        </p>
      ))}
      {reworded.map((r) => (
        <p key={r.id} data-testid="rule-changed">
          <span class="badge badge--new">{t('ui.campaign.changed.badge')}</span> {t(ruleText(r, day))}
        </p>
      ))}
      {repealed.map((r) => (
        <p key={r.id}>
          <span class="badge badge--old">{t('ui.campaign.repealed.badge')}</span> {t(ruleText(r, day - 1))}
        </p>
      ))}
      {procedures.map((p) => (
        <p key={p.id}>
          <span class="badge badge--new">{t('ui.campaign.new.badge')}</span> {t(p.text)}
        </p>
      ))}
      {tools.map((x) => (
        <p key={x.id}>
          <span class="badge badge--new">{t('ui.campaign.new.badge')}</span>{' '}
          {t('ui.campaign.newTool', { tool: t(`tool.${x.id}`), s: x.cost })}
        </p>
      ))}
    </div>
  );
}

function Morning() {
  const a = active.value;
  if (!a) return null;
  const { run, ctx } = a;
  const scene = pendingScene(run, 'morning');
  const sunS = ctx.spec.sunS + (shiftMods(run, gameContent).sunS ?? 0);
  // Story Mode has no sun (and no fines): only the rule tracker means anything there.
  const assists = currentAssists(!run.story, run.story);
  const assisted = assistText(assists);
  const bills = billTotal(run, economyOf({ content: gameContent, ctx }), defaultBills(run));
  const tonight = bills.hearth + bills.food + bills.medicine;
  return (
    <main class="screen screen--morning">
      <h1 data-testid="morning-title">{t('ui.campaign.day', { n: run.day })}</h1>
      <p class="muted">
        {t('ui.campaign.purse', { n: run.rings })}
        {run.story ? ` · ${t('ui.campaign.story')}` : ''}
      </p>
      <StandingStrip run={run} />
      <DebtBanner run={run} />
      {a.rewound ? (
        <div class="banner" role="status">
          <p>{t('ui.campaign.rewound')}</p>
        </div>
      ) : null}
      <NightNews events={lastNight.value} />
      {scene ? (
        <SceneView key={scene} id={scene} run={run} />
      ) : (
        <>
          <AppealCard run={run} />
          <RequestCards run={run} fined={!run.story && !assists.noFines} />
          <section class="card">
            <Decree ctx={ctx} />
            <RulebookChanges day={run.day} />
            <WaitingNote run={run} />
            <FavoursToday run={run} noFines={assists.noFines === true} />
            <p class="briefing__queue">
              {run.story
                ? t('ui.campaign.untimed')
                : t('ui.campaign.sun', { time: clockText(atSunSpeed(sunS * 1000, assists.sunPct)) })}
            </p>
            <p class="muted" data-testid="tonight-bills">
              {t('ui.campaign.tonightBills', { n: tonight })}
            </p>
          </section>
          <FavourGuide run={run} />
          <details class="card morning__assists" data-testid="morning-assists">
            <summary>
              {t('ui.settings.assists')}
              {assisted ? <span class="muted">: {assisted}</span> : null}
            </summary>
            <AssistSettings campaign={!run.story} sun={!run.story} titled={false} />
          </details>
          <div class="row">
            <button type="button" class="btn btn--primary btn--big" data-testid="to-gate" onClick={toGate}>
              {t('ui.campaign.toGate')}
            </button>
          </div>
        </>
      )}
      <div class="row">
        <JournalButton />
        <button type="button" class="btn btn--quiet" data-testid="campaign-quit" onClick={leaveCampaign}>
          {t('ui.campaign.quit')}
        </button>
      </div>
      {journalOpen.value ? <JournalView /> : null}
    </main>
  );
}

// ---------- the gods' favour ----------

/** Whether a favour does anything today: Story Mode has no sun and no fines, and the assist can waive fines. */
const moot = (f: FavourDef, story: boolean, noFines: boolean): boolean =>
  'sunS' in f.effect || 'freeQuestions' in f.effect ? story : 'finePct' in f.effect ? story || noFines : false;

/** The favours the gate will grant today (docs/tech-spec.md §43), of those that do anything today. */
function FavoursToday({ run, noFines }: { run: RunState; noFines: boolean }) {
  const today = favoursFor(run, gameContent).filter((f) => !moot(f, run.story, noFines));
  return (
    <>
      {today.map((f) => (
        <p key={f.id} class="morning__favour" data-testid="favour-today">
          {t('ui.favour.today', { god: factionName(f.faction, run.day), text: t(f.text) })}
        </p>
      ))}
    </>
  );
}

/** Every favour there is, the standing each takes and the standing now: for a player deciding whom to court. */
function FavourGuide({ run }: { run: RunState }) {
  const all = campaignOf(gameContent).favours ?? [];
  if (all.length === 0) return null;
  const today = new Set(favoursFor(run, gameContent).map((f) => f.id));
  return (
    <details class="card morning__favours" data-testid="favours">
      <summary>{t('ui.favour.title')}</summary>
      <ul class="favours">
        {all.map((f) => (
          <li key={f.id} data-testid="favour" class={today.has(f.id) ? 'is-yours' : undefined}>
            {t('ui.favour.item', {
              god: factionName(f.faction, run.day),
              at: f.at,
              now: signed(run.standing[f.faction]),
              text: t(f.text),
            })}
            {today.has(f.id) ? <b> {t('ui.favour.yours')}</b> : null}
          </li>
        ))}
      </ul>
    </details>
  );
}

/** At the audit, the favour that lightened the day's fines, when there were fines to lighten. */
function FinesEased({ ledger, day }: { ledger: DayLedger; day: number }) {
  if (ledger.fines === 0) return null;
  const eased = (campaignOf(gameContent).favours ?? []).filter(
    (f) => (ledger.favours ?? []).includes(f.id) && 'finePct' in f.effect,
  );
  return (
    <>
      {eased.map((f) => (
        <p key={f.id} class="muted ledger__note" data-testid="favour-fines">
          {t('ui.favour.today', { god: factionName(f.faction, day), text: t(f.text) })}
        </p>
      ))}
    </>
  );
}

/** The day's favours that act at night (the sick's extra night), as the gate granted them. */
function FavoursTonight({ run }: { run: RunState }) {
  const today = run.ledger[run.ledger.length - 1];
  const ids = today?.day === run.day ? (today.favours ?? []) : [];
  const tonight = (campaignOf(gameContent).favours ?? []).filter((f) => ids.includes(f.id) && 'sickNights' in f.effect);
  return (
    <>
      {tonight.map((f) => (
        <p key={f.id} class="muted" data-testid="favour-tonight">
          {t('ui.favour.tonight', { god: factionName(f.faction, run.day), text: t(f.text) })}
        </p>
      ))}
    </>
  );
}

// ---------- the line ----------

/** The souls who waited at the gate through the night (docs/tech-spec.md §41): first in today's line. */
function WaitingNote({ run }: { run: RunState }) {
  const waiting = run.waiting ?? [];
  if (waiting.length === 0) return null;
  const names = listText(waiting.map((c) => `${c.evidence.look.name} ${c.evidence.look.patronym}`));
  return (
    <p class="morning__line" data-testid="waiting">
      {t('ui.line.morning', { count: waiting.length, names })}
    </p>
  );
}

/** What became of a soul the sun set on: it waits for tomorrow, dies in the night, or simply went unjudged. */
function leftNote(ledger: DayLedger, id: string | undefined): string {
  if (id !== undefined && ledger.waiting?.carried.some((s) => s.id === id)) return t('ui.audit.waits');
  if (id !== undefined && ledger.waiting?.died.some((s) => s.id === id)) return t('ui.audit.diedWaiting');
  return t('ui.summary.unjudged');
}

// ---------- the gods' requests ----------

/** Standing changes as words: "Odin -2 and Freyja +1". */
const fxText = (fx: Readonly<Partial<Record<Faction, number>>>, day: number) =>
  listText(
    Object.entries(fx)
      .filter(([, n]) => (n ?? 0) !== 0)
      .map(([f, n]) => `${factionName(f as Faction, day)} ${signed(n ?? 0)}`),
  );

/**
 * This morning's requests (docs/tech-spec.md §42): who asks, for which souls, what it's worth and what it costs
 * (with no fine in Story Mode or with the no-fines assist, which can be set on this same page).
 */
function RequestCards({ run, fined }: { run: RunState; fined: boolean }) {
  const campaign = campaignOf(gameContent);
  return (
    <>
      {(run.requests ?? []).map((r) => {
        const god = factionName(r.god, run.day);
        return (
          <section key={r.id} class="card request" data-testid="request">
            <h2>{t('ui.request.title', { god })}</h2>
            <p class="request__words">{t(r.text)}</p>
            <p class="muted">
              {t('ui.request.terms', {
                n: r.n,
                from: t(`dest.${r.from}`),
                to: t(`dest.${r.to}`),
                god,
                reward: fxText(r.reward, run.day),
                fined: fined ? 'yes' : 'no',
                cost: fxText(standingFx(campaign, r.from, r.to), run.day),
              })}
            </p>
          </section>
        );
      })}
    </>
  );
}

/** How the day's requests went, under the audit's standing. */
function RequestResults({ ledger, day }: { ledger: DayLedger; day: number }) {
  const settled = ledger.requests ?? [];
  if (settled.length === 0) return null;
  return (
    <ul class="request-results" data-testid="request-results">
      {settled.map((r) => {
        const god = factionName(r.god, day);
        return (
          <li key={r.id}>
            {r.met
              ? t('ui.request.met', { god, reward: fxText(r.standing, day) })
              : t('ui.request.unmet', { god, done: r.done, n: r.n })}
          </li>
        );
      })}
    </ul>
  );
}

// ---------- appeals ----------

/**
 * The morning's appeal (docs/tech-spec.md §40): who asks to be judged again, what hangs on it, and hearing
 * it at the desk or letting the verdict stand; once decided, how it went.
 */
function AppealCard({ run }: { run: RunState }) {
  const appeal = run.appeal;
  const def = campaignOf(gameContent).appeals;
  if (appeal && def) {
    const look = appeal.case.evidence.look;
    return (
      <section class="card appeal" data-testid="appeal">
        <h2>{t('ui.appeal.title')}</h2>
        <p>
          {t('ui.appeal.body', {
            name: `${look.name} ${look.patronym}`,
            dest: t(`dest.${appeal.stamped}`),
            n: appeal.day,
          })}
        </p>
        <p class="appeal__plea">{t(`ui.appeal.plea.${appeal.stamped}`)}</p>
        <p class="muted">{t('ui.appeal.terms', { n: appeal.day, bonus: def.bonus, fine: def.fine })}</p>
        <div class="row">
          <button type="button" class="btn btn--primary" data-testid="appeal-hear" onClick={hearAppeal}>
            {t('ui.appeal.hear')}
          </button>
          <button type="button" class="btn" data-testid="appeal-stand" onClick={letAppealStand}>
            {t('ui.appeal.stand')}
          </button>
        </div>
      </section>
    );
  }
  return run.appealHeard ? <AppealResult heard={run.appealHeard} seed={run.seed} /> : null;
}

function AppealResult({ heard, seed }: { heard: AppealHeard; seed: string }) {
  const dest = (d: AppealHeard['to']) => (d ? t(`dest.${d}`) : '');
  const rule = createDayContext(gameContent, heard.day, seed).rules.find((r) => r.id === heard.rule);
  const text =
    heard.outcome === 'righted'
      ? t('ui.appeal.righted', { name: heard.name, dest: dest(heard.to), rings: heard.rings })
      : heard.outcome === 'upheld'
        ? t('ui.appeal.upheld', { name: heard.name, dest: dest(heard.expected), rings: heard.rings })
        : heard.outcome === 'wrong'
          ? t('ui.appeal.wrong', { name: heard.name, dest: dest(heard.expected), rings: -heard.rings })
          : t('ui.appeal.stood', { name: heard.name });
  return (
    <section class="card appeal" data-testid="appeal-result" role="status">
      <p>{text}</p>
      {heard.outcome === 'wrong' && rule ? (
        <p class="muted">{t('ui.appeal.rule', { rule: t(ruleText(rule, heard.day)) })}</p>
      ) : null}
    </section>
  );
}

// ---------- audit ----------

function Audit() {
  const a = active.value;
  const s = session.value;
  if (!a) return null;
  const ledger = a.run.ledger[a.run.ledger.length - 1];
  const shift = a.run.shift;
  if (!ledger || !shift) return null;
  const economy = economyOf({ content: gameContent, ctx: a.ctx });
  const waived = a.run.story || ledger.assists?.noFines === true;
  const forgiven = Math.min(ledger.wrong, waived ? ledger.wrong : economy.warnings);
  const assisted = assistText(ledger.assists);
  const score = shiftScore(shift);
  return (
    <main class="screen screen--audit">
      <h1 data-testid="audit-title">{t('ui.audit.title', { n: a.run.day })}</h1>
      <p class="summary__score" data-testid="audit-score">
        {t('ui.summary.score', { correct: ledger.correct, total: ledger.correct + ledger.wrong + ledger.unjudged })}
      </p>
      {assisted ? (
        <p class="muted" data-testid="audit-assists">
          {t('ui.assist.on', { list: assisted })}
        </p>
      ) : null}
      <table class="ledger" data-testid="ledger">
        <tbody>
          <tr>
            <td>{t('ui.audit.pay', { n: ledger.correct, wage: economy.wage })}</td>
            <td class="num">{signed(ledger.pay)}</td>
          </tr>
          {ledger.bonus > 0 ? (
            <tr>
              <td>{t('ui.audit.bonus', { n: score.caught })}</td>
              <td class="num">{signed(ledger.bonus)}</td>
            </tr>
          ) : null}
          {forgiven > 0 ? (
            <tr>
              <td>{t('ui.audit.forgiven', { n: forgiven })}</td>
              <td class="num">0</td>
            </tr>
          ) : null}
          {ledger.fines > 0 ? (
            <tr>
              <td>{t('ui.audit.fines', { n: ledger.wrong - forgiven })}</td>
              <td class="num">{signed(-ledger.fines)}</td>
            </tr>
          ) : null}
          {ledger.appeal && ledger.appeal.rings !== 0 ? (
            <tr data-testid="audit-appeal">
              <td>{t('ui.audit.appeal', { n: ledger.appeal.day, name: ledger.appeal.name })}</td>
              <td class="num">{signed(ledger.appeal.rings)}</td>
            </tr>
          ) : null}
          <tr class="ledger__total">
            <td>{t('ui.campaign.purseLabel')}</td>
            <td class="num" data-testid="audit-rings">
              {a.run.rings}
            </td>
          </tr>
        </tbody>
      </table>
      <FinesEased ledger={ledger} day={a.run.day} />
      <StandingTable run={a.run} ledger={ledger} />
      <RequestResults ledger={ledger} day={a.run.day} />
      <ol class="verdicts">
        {shift.verdicts.map((v) => {
          const c = shift.cases[v.index];
          const name = c ? `${c.evidence.look.name} ${c.evidence.look.patronym}` : '';
          return (
            <li key={v.index} class={v.correct ? 'is-right' : 'is-wrong'} data-testid="verdict">
              <span aria-hidden="true">{v.stamped === null ? '⬛' : v.correct ? '🟩' : '🟥'}</span>{' '}
              {t('ui.summary.row', { name, dest: t(`dest.${v.expected}`) })}
              {v.stamped === null ? (
                <span class="muted" data-testid="left-note">
                  {' '}
                  ({leftNote(ledger, c?.id)})
                </span>
              ) : v.correct ? null : v.stamped === v.expected ? (
                <span class="muted">
                  {' '}
                  ({t('ui.summary.skipped', { procs: listText(skippedText(v.skipped, a.ctx)) })})
                </span>
              ) : (
                <span class="muted"> ({t('ui.summary.you', { dest: t(`dest.${v.stamped}`) })})</span>
              )}
              {c && v.stamped !== null
                ? standingNotes(stampEffects(gameContent, c, v.stamped), a.run.day).map((note) => (
                    <span key={note} class="verdict__note" data-testid="verdict-note">
                      {' '}
                      {note}
                    </span>
                  ))
                : null}{' '}
              {s ? (
                <button
                  type="button"
                  class="btn btn--quiet btn--small"
                  data-testid="report-soul"
                  aria-label={t('ui.report.rowLabel', { name })}
                  onClick={() => openReport(s, v.index)}
                >
                  {t('ui.report.row')}
                </button>
              ) : null}
            </li>
          );
        })}
      </ol>
      <div class="row">
        <button type="button" class="btn btn--primary btn--big" data-testid="go-home" onClick={endAudit}>
          {t('ui.audit.home')}
        </button>
      </div>
      <ReportDialog />
    </main>
  );
}

/**
 * A table that can be wider than the screen (the audit's standing, with every column, or with large text): it
 * scrolls in its own box, by keyboard too, never the page, with its first column held in place. A column scrolled
 * to comes to rest against that one, never half under it, where a sign half hidden could read as another: the box
 * snaps to the held column's width, and leaves room after the last column for it to come to rest there too.
 */
function LedgerScroll({ label, children }: { label: string; children: ComponentChildren }) {
  const box = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const el = box.current;
    const table = el?.querySelector('table');
    if (!el || !table) return;
    const fit = () => {
      const heads = el.querySelectorAll<HTMLElement>('thead th');
      const held = heads[0]?.offsetWidth ?? 0;
      const last = heads[heads.length - 1]?.offsetWidth ?? 0;
      el.style.setProperty('--held', `${held}px`);
      const tail = table.offsetWidth > el.clientWidth ? Math.max(0, el.clientWidth - held - last) : 0;
      el.style.setProperty('--tail', `${tail}px`);
    };
    fit();
    if (typeof ResizeObserver === 'undefined') return;
    // Refitted in the next frame, not in the observer's own callback: the box's padding changing there would be a
    // resize within the same frame, which the browser reports as an error ("ResizeObserver loop").
    let frame = 0;
    const watch = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fit);
    });
    watch.observe(el);
    watch.observe(table);
    return () => {
      cancelAnimationFrame(frame);
      watch.disconnect();
    };
  }, []);
  return (
    // biome-ignore lint/a11y/noNoninteractiveTabindex: a box that scrolls must take focus to scroll by keyboard.
    <section ref={box} class="ledger-scroll" aria-label={label} tabIndex={0}>
      {children}
    </section>
  );
}

/**
 * Where the player stands with each power they've had dealings with, and what moved it since the
 * last audit: today's mistakes at the gate, and the story (last night's scene, this morning's, the
 * story souls). The last audit's standing plus both columns is the standing now.
 */
function StandingTable({ run, ledger }: { run: RunState; ledger: DayLedger }) {
  const rows = factionsMet(run);
  if (rows.length === 0) return null;
  // The morning's appeal moved standing too, when it righted a mistake or made one: its own column, so they add up.
  const appeal = ledger.appeal?.standing ?? {};
  const appealed = Object.keys(appeal).length > 0;
  // So did the line at dusk (docs/tech-spec.md §41): a crowded gate, and the living lost in the night.
  const line = ledger.waiting?.standing ?? {};
  const waited = Object.keys(line).length > 0;
  // And the gods' requests done in full (§42).
  const asked: Partial<Record<Faction, number>> = {};
  for (const r of ledger.requests ?? [])
    for (const [f, n] of Object.entries(r.standing)) asked[f as Faction] = (asked[f as Faction] ?? 0) + (n ?? 0);
  const favoured = Object.keys(asked).length > 0;
  return (
    <>
      <LedgerScroll label={t('ui.audit.standing')}>
        <table class="ledger" data-testid="standing">
          <thead>
            <tr>
              <th class="ledger__who">{t('ui.audit.standing')}</th>
              <th class="num">{t('ui.audit.mistakes')}</th>
              {appealed ? <th class="num">{t('ui.audit.appealColumn')}</th> : null}
              {waited ? <th class="num">{t('ui.audit.lineColumn')}</th> : null}
              {favoured ? <th class="num">{t('ui.audit.requestsColumn')}</th> : null}
              <th class="num">{t('ui.audit.story')}</th>
              <th class="num">{t('ui.audit.now')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((f) => (
              <tr key={f}>
                <td class="ledger__who">{factionName(f, run.day)}</td>
                <td class="num">{signed(ledger.standing[f] ?? 0)}</td>
                {appealed ? <td class="num">{signed(appeal[f] ?? 0)}</td> : null}
                {waited ? <td class="num">{signed(line[f] ?? 0)}</td> : null}
                {favoured ? <td class="num">{signed(asked[f] ?? 0)}</td> : null}
                <td class="num">{signed(ledger.story?.[f] ?? 0)}</td>
                <td class="num">{signed(run.standing[f])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </LedgerScroll>
      <p class="muted ledger__note">{t('ui.audit.standingNote')}</p>
      {waited ? <p class="muted ledger__note">{t('ui.audit.lineNote')}</p> : null}
      {favoured ? <p class="muted ledger__note">{t('ui.audit.requestsNote')}</p> : null}
    </>
  );
}

// ---------- night ----------

/** The family: who is well, sick (and, when planning the night, how soon they need medicine) or gone. */
function FamilyList({ run, plan = false }: { run: RunState; plan?: boolean }) {
  // Hel's favour can give the sick a night more (docs/tech-spec.md §43).
  const care = careFor(run, gameContent);
  return (
    <ul class="family" data-testid="family">
      {run.family.map((m) => {
        const name = familyName(gameContent, m.id);
        const status =
          m.status === 'gone'
            ? t(m.gone === 'died' ? 'ui.family.died' : 'ui.family.left')
            : m.status === 'sick'
              ? plan
                ? t('ui.family.sickLeft', { left: care.sickNights - m.sickNights })
                : t('ui.family.sick')
              : t('ui.family.well');
        const needs = [
          m.status !== 'gone' && m.cold > 0 ? t('ui.family.cold', { n: m.cold }) : null,
          m.status !== 'gone' && m.hungry > 0 ? t('ui.family.hungry', { n: m.hungry }) : null,
        ].filter((x) => x !== null);
        return (
          <li key={m.id} class={`family__member is-${m.status}`} data-member={m.id}>
            <b>{name}</b>: {status}
            {needs.length > 0 ? <span class="muted"> ({needs.join(', ')})</span> : null}
          </li>
        );
      })}
    </ul>
  );
}

/** What the bills as set do tonight: who is lost, who surely falls sick, who gets worse, and the odds for the rest. */
function Outlook({ run, outlook, bills }: { run: RunState; outlook: NightOutlook; bills: Bills }) {
  const campaign = campaignOf(gameContent);
  const adult = new Map(campaign.family.map((f) => [f.id, f.adult]));
  const lines: { key: string; id: string; text: string; bold?: boolean }[] = outlook.members.flatMap((n, i) => {
    const was = run.family[i];
    const name = familyShort(gameContent, n.member.id);
    const how = adult.get(n.member.id) ? 'died' : 'left';
    if (n.change === 'died' || n.change === 'left') {
      return [{ key: n.member.id, id: 'outlook-lost', text: t('ui.night.lost', { name, how: n.change }), bold: true }];
    }
    if (n.change === 'sick') {
      return [
        { key: n.member.id, id: 'outlook-sickens', text: t('ui.night.sickens', { name, cause: n.cause ?? 'cold' }) },
      ];
    }
    if (was?.status === 'sick' && n.member.status === 'sick') {
      const left = careFor(run, gameContent).sickNights - n.member.sickNights;
      return [{ key: n.member.id, id: 'outlook-worse', text: t('ui.night.worse', { name, how, left }) }];
    }
    return [];
  });
  const risk = Math.max(0, ...outlook.members.map((n) => n.risk));
  const need = !bills.hearth && !bills.food ? 'both' : !bills.hearth ? 'hearth' : 'food';
  return (
    <>
      {lines.map((l) => (
        <p key={l.key} class="warn" data-testid={l.id}>
          {l.bold ? <b>{l.text}</b> : l.text}
        </p>
      ))}
      {risk > 0 ? (
        <p class="warn" data-testid="outlook-risk">
          {t('ui.night.risk', { need, p: risk })}
        </p>
      ) : null}
    </>
  );
}

/** The bills of the next few nights, so what's spent tonight can be weighed against them. */
function NightsAhead({ run }: { run: RunState }) {
  const ahead = billForecast(run, gameContent);
  if (ahead.length === 0) return null;
  const home = run.family.filter((m) => m.status !== 'gone').length;
  return (
    // A region that can take the focus: on a narrow screen the table scrolls sideways, by keyboard too.
    // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrolling region must take the focus to scroll by keyboard
    <section class="ahead" data-testid="nights-ahead" aria-labelledby="nights-ahead-title" tabIndex={0}>
      <h3 id="nights-ahead-title">{t('ui.night.ahead')}</h3>
      <table class="ledger">
        <thead>
          <tr>
            <th>{t('ui.night.aheadNight')}</th>
            <th class="num">{t('ui.night.aheadBills', { n: home })}</th>
            <th class="num">{t('ui.night.aheadMedicine')}</th>
          </tr>
        </thead>
        <tbody>
          {ahead.map((b) => (
            <tr key={b.day} data-testid="night-ahead">
              <td class="ahead__night">
                {t('ui.night.title', { n: b.day })}
                {b.draupnir > 0 ? <span class="muted"> {t('ui.night.aheadDraupnir', { n: b.draupnir })}</span> : null}
              </td>
              <td class="num">{b.hearth + b.food}</td>
              <td class="num">{b.medicine}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function BillsCard({ run, outlook }: { run: RunState; outlook: NightOutlook }) {
  const a = active.value;
  if (!a) return null;
  const economy = economyOf({ content: gameContent, ctx: a.ctx });
  const bills = run.bills ?? defaultBills(run);
  const set = (next: Bills) => dispatch({ t: 'bills', bills: next });
  const home = run.family.filter((m) => m.status !== 'gone');
  const sick = home.filter((m) => m.status === 'sick');
  const floor = campaignOf(gameContent).debtFloor;
  const limit = debtLimit(gameContent);
  return (
    <section class="card bills" data-testid="bills">
      <h2>{t('ui.night.bills')}</h2>
      <label>
        <input
          type="checkbox"
          checked={bills.hearth}
          data-testid="bill-hearth"
          onChange={(e) => set({ ...bills, hearth: (e.target as HTMLInputElement).checked })}
        />{' '}
        {t('ui.night.hearth', { cost: economy.costs.hearth })}
      </label>
      <label>
        <input
          type="checkbox"
          checked={bills.food}
          data-testid="bill-food"
          onChange={(e) => set({ ...bills, food: (e.target as HTMLInputElement).checked })}
        />{' '}
        {t('ui.night.food', { n: home.length, cost: economy.costs.food * home.length })}
      </label>
      {sick.map((m) => (
        <label key={m.id}>
          <input
            type="checkbox"
            checked={bills.medicine.includes(m.id)}
            data-testid={`bill-medicine-${m.id}`}
            onChange={(e) => {
              const on = (e.target as HTMLInputElement).checked;
              const medicine = on ? [...bills.medicine, m.id] : bills.medicine.filter((x) => x !== m.id);
              set({ ...bills, medicine });
            }}
          />{' '}
          {t('ui.night.medicine', { name: familyName(gameContent, m.id), cost: economy.costs.medicine })}
        </label>
      ))}
      <Outlook run={run} outlook={outlook} bills={bills} />
      {outlook.draupnir > 0 ? (
        <p data-testid="draupnir-tonight">{t('ui.night.draupnir', { n: outlook.draupnir })}</p>
      ) : null}
      <p data-testid="after-bills">{t('ui.night.after', { n: outlook.rings })}</p>
      {outlook.ends?.why === 'debt' ? (
        <p class="warn" data-testid="debt-warning">
          <b>{t('ui.night.demoted', { floor })}</b>
        </p>
      ) : outlook.rings < floor && limit !== null ? (
        <p class="warn" data-testid="debt-warning">
          {t('ui.night.debt', { floor, limit })}
        </p>
      ) : run.debtNights > 0 ? (
        <p data-testid="debt-cleared">{t('ui.night.debtCleared', { floor })}</p>
      ) : null}
      {outlook.ends?.why === 'home' ? (
        <p class="warn" data-testid="home-warning">
          <b>{t('ui.night.empty')}</b>
        </p>
      ) : null}
      <NightsAhead run={run} />
    </section>
  );
}

/** Sleep, and the night's bills are paid; when that would end the run, only after saying so. */
function SleepRow({ ends }: { ends: NightOutlook['ends'] }) {
  const [confirm, setConfirm] = useState(false);
  if (confirm && ends) {
    return (
      <div class="row confirm" data-testid="sleep-confirm">
        <p class="warn">{t(ends.why === 'debt' ? 'ui.night.confirmDebt' : 'ui.night.confirmHome')}</p>
        <button type="button" class="btn btn--danger" data-testid="sleep-anyway" onClick={sleep}>
          {t('ui.night.sleepAnyway')}
        </button>
        <button type="button" class="btn" data-testid="sleep-cancel" data-back onClick={() => setConfirm(false)}>
          {t('ui.night.notYet')}
        </button>
      </div>
    );
  }
  return (
    <div class="row">
      <button
        type="button"
        class="btn btn--primary btn--big"
        data-testid="sleep"
        onClick={() => (ends ? setConfirm(true) : sleep())}
      >
        {t('ui.night.sleep')}
      </button>
    </div>
  );
}

function ShopCard({ run }: { run: RunState }) {
  const items = shopFor(run, gameContent);
  const owned = campaignOf(gameContent).shop.filter((u) => run.upgrades.includes(u.id));
  if (items.length === 0 && owned.length === 0) return null;
  return (
    <section class="card shop" data-testid="shop">
      <h2>{t('ui.night.shop')}</h2>
      {items.map((u) => (
        <div key={u.id} class="shop__item">
          <p>
            <b>{t(u.name)}</b>: {t(u.text)}
          </p>
          <button
            type="button"
            class="btn btn--small"
            data-testid={`buy-${u.id}`}
            disabled={run.rings < u.price}
            onClick={() => dispatch({ t: 'buy', item: u.id })}
          >
            {t('ui.night.buy', { price: u.price })}
          </button>
        </div>
      ))}
      {owned.length > 0 ? (
        <p class="muted" data-testid="owned">
          {t('ui.night.owned', { items: owned.map((u) => t(u.name)).join(', ') })}
        </p>
      ) : null}
    </section>
  );
}

function Night() {
  const a = active.value;
  if (!a) return null;
  const { run } = a;
  const scene = pendingScene(run, 'night');
  const outlook = scene ? null : nightOutlook(run, { content: gameContent, ctx: a.ctx });
  return (
    <main class="screen screen--night">
      <h1 data-testid="night-title">{t('ui.night.title', { n: run.day })}</h1>
      <p class="muted" data-testid="night-rings">
        {t('ui.campaign.purse', { n: run.rings })}
      </p>
      <StandingStrip run={run} />
      <DebtBanner run={run} />
      {scene ? (
        <SceneView key={scene} id={scene} run={run} />
      ) : outlook ? (
        <>
          <section class="card">
            <h2>{t('ui.night.family')}</h2>
            <FamilyList run={run} plan />
            <FavoursTonight run={run} />
          </section>
          <BillsCard run={run} outlook={outlook} />
          <ShopCard run={run} />
          <SleepRow key={outlook.ends?.why ?? 'none'} ends={outlook.ends} />
        </>
      ) : null}
      <div class="row">
        <JournalButton />
        <button type="button" class="btn btn--quiet" data-testid="campaign-quit" onClick={leaveCampaign}>
          {t('ui.campaign.quit')}
        </button>
      </div>
      {journalOpen.value ? <JournalView /> : null}
    </main>
  );
}

// ---------- ending ----------

function Ending() {
  useStoryText();
  const a = active.value;
  const focus = useAutoFocus<HTMLHeadingElement>();
  if (!a) return null;
  const { run } = a;
  const ending = campaignOf(gameContent).endings.find((e) => e.id === run.ending);
  return (
    <main class="screen screen--ending">
      <h1 ref={focus} tabIndex={-1} data-testid="ending-title">
        {ending ? t(ending.title) : run.ending}
      </h1>
      {ending ? <p class="ending__text">{t(ending.text)}</p> : null}
      <p class="muted" data-testid="ending-found-count">
        {t('ui.gallery.count', {
          n: reachableEndings(gameContent).filter((e) => settings.value.endingsSeen.includes(e.id)).length,
          total: reachableEndings(gameContent).length,
        })}
      </p>
      <NightNews events={lastNight.value} />
      <section class="card">
        <p>{t('ui.ending.stats', { days: run.day, worthy: run.einherjar.worthy, unworthy: run.einherjar.unworthy })}</p>
        <FamilyList run={run} />
      </section>
      <RagnarokReport run={run} />
      <div class="row">
        <button type="button" class="btn btn--primary" data-testid="ending-slots" onClick={leaveCampaign}>
          {t('ui.ending.slots')}
        </button>
        <JournalButton />
      </div>
      {journalOpen.value ? <JournalView /> : null}
    </main>
  );
}

export function CampaignScreen({ which }: { which: Screen }) {
  switch (which) {
    case 'morning':
      return <Morning />;
    case 'audit':
      return <Audit />;
    case 'night':
      return <Night />;
    case 'ending':
      return <Ending />;
    default:
      return <SlotsScreen />;
  }
}
