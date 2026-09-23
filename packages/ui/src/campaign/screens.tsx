import { gameContent, loadScenes, manifest } from 'virtual:content';
import {
  type Bills,
  billTotal,
  type Content,
  campaignOf,
  defaultBills,
  economyOf,
  FACTIONS,
  type Faction,
  type RunEvent,
  type RunState,
  replayableDays,
  shiftMods,
  shiftScore,
  shopFor,
} from '@cots/engine';
import { playScene, sceneEnv } from '@cots/story';
import { useState } from 'preact/hooks';
import { clockText, listText, t } from '../i18n';
import { openReport } from '../report';
import { skippedText } from '../shift/evidence';
import { Decree } from '../shift/Rules';
import { ReportDialog, ToastView, useAutoFocus } from '../shift/Shift';
import { type Screen, session, toTitle } from '../store';
import {
  active,
  deleteSlot,
  dispatch,
  endAudit,
  lastNight,
  leaveCampaign,
  loadSlots,
  newCampaign,
  openSlot,
  replayFrom,
  SLOT_COUNT,
  type SlotRecord,
  sleep,
  slots,
  toGate,
} from './run-store';

/*
 * The campaign's own screens (docs/build-plan.md §1, "Day loop"): the save
 * slots, then each day's morning, audit and night, and the ending. The shift
 * itself is the ordinary shift screen, stepping the run underneath.
 */

/** Compiled Ink scenes, loaded with the campaign. */
let scenes: Readonly<Record<string, object>> = {};

export async function enterCampaign(): Promise<void> {
  [scenes] = await Promise.all([loadScenes(), loadSlots()]);
}

const familyName = (content: Content, id: string) => t(campaignOf(content).family.find((m) => m.id === id)?.name ?? id);

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

// ---------- save slots ----------

function SlotSummary({ record }: { record: SlotRecord }) {
  const run = record.save.mornings[record.save.mornings.length - 1];
  if (!run) return null;
  const home = run.family.filter((m) => m.status !== 'gone').length;
  return (
    <p data-testid="slot-summary">
      {t('ui.campaign.summary', { day: run.day, rings: run.rings, home, family: run.family.length })}
      {run.story ? ` · ${t('ui.campaign.story')}` : ''}
    </p>
  );
}

/** A night that ends the run stays in the day's log; any other night starts a new morning. */
function hasEnded(record: SlotRecord): boolean {
  return record.save.log[record.save.log.length - 1]?.t === 'endNight';
}

function Slot({ i, record }: { i: number; record: SlotRecord | null }) {
  const [story, setStory] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const days = record ? replayableDays(record.save) : [];
  const [day, setDay] = useState(days[days.length - 1] ?? 1);
  if (!record) {
    return (
      <section class="card slot" data-testid={`slot-${i}`}>
        <h2>{t('ui.campaign.slot', { n: i + 1 })}</h2>
        <p class="muted">{t('ui.campaign.empty')}</p>
        <label>
          <input
            type="checkbox"
            checked={story}
            data-testid={`story-${i}`}
            onChange={(e) => setStory((e.target as HTMLInputElement).checked)}
          />{' '}
          {t('ui.campaign.storyMode')}
        </label>
        <div class="row">
          <button type="button" class="btn btn--primary" data-testid={`new-${i}`} onClick={() => newCampaign(i, story)}>
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
        </div>
      ) : null}
      <p class="muted">{t('ui.campaign.replayWarn')}</p>
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
          <button type="button" class="btn btn--small" onClick={() => setConfirm(false)}>
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

function SlotsScreen() {
  const focus = useAutoFocus<HTMLHeadingElement>();
  return (
    <main class="screen screen--campaign">
      <h1 ref={focus} tabIndex={-1} data-testid="campaign-title">
        {t('ui.campaign')}
      </h1>
      <p class="muted">{t(manifest.edition === 'demo' ? 'ui.campaign.hint.demo' : 'ui.campaign.hint.full')}</p>
      {Array.from({ length: SLOT_COUNT }, (_, i) => (
        <Slot key={`${i}:${slots.value[i]?.rev ?? 0}`} i={i} record={slots.value[i] ?? null} />
      ))}
      <div class="row">
        <button type="button" class="btn" data-testid="campaign-back" onClick={toTitle}>
          {t('ui.back')}
        </button>
      </div>
      <ToastView />
    </main>
  );
}

// ---------- scenes ----------

/** Plays one Ink scene; its effects reach the run once, when the player finishes it. */
function SceneView({ id, run }: { id: string; run: RunState }) {
  const [env] = useState(() => sceneEnv(run, id));
  const [choices, setChoices] = useState<number[]>([]);
  const json = scenes[id];
  const focus = useAutoFocus<HTMLButtonElement>();
  if (!json) return null;
  const frame = playScene(json, env, choices);
  return (
    <section class="card scene" data-testid="scene" data-scene={id}>
      {frame.draft ? (
        <p class="scene__draft" data-testid="scene-draft">
          {t('ui.campaign.draft')}
        </p>
      ) : null}
      {frame.lines.map((line, i) => (
        <p
          key={`${choices.length}:${i}`}
          class={`scene__line${line.chosen ? ' scene__line--chosen' : line.speaker ? ' scene__line--said' : ''}`}
        >
          {line.speaker ? <b class="scene__speaker">{t(`speaker.${line.speaker}`)}: </b> : null}
          {line.text}
        </p>
      ))}
      <div class="scene__choices">
        {frame.done ? (
          <button
            type="button"
            class="btn btn--primary"
            data-testid="scene-done"
            ref={focus}
            onClick={() => dispatch({ t: 'scene', id, choices, effects: frame.effects })}
          >
            {t('ui.campaign.next')}
          </button>
        ) : (
          frame.choices.map((text, i) => (
            <button
              key={`${choices.length}:${text}`}
              type="button"
              class="btn scene__choice"
              data-testid="scene-choice"
              ref={i === 0 ? focus : undefined}
              onClick={() => setChoices([...choices, i])}
            >
              {text}
            </button>
          ))
        )}
      </div>
    </section>
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
    if (e.e === 'family') return [t(`ui.news.${e.change}`, { name: familyName(gameContent, e.id) })];
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
  const repealed = gameContent.rules.filter((r) => r.until === day);
  const tools = gameContent.tools.filter((x) => x.since === day);
  const procedures = (gameContent.procedures ?? []).filter((p) => p.since === day);
  if (added.length + repealed.length + tools.length + procedures.length === 0) return null;
  return (
    <div class="changes" data-testid="rulebook-changes">
      {added.map((r) => (
        <p key={r.id}>
          <span class="badge badge--new">{t('ui.campaign.new.badge')}</span> {t(r.text)}
        </p>
      ))}
      {repealed.map((r) => (
        <p key={r.id}>
          <span class="badge badge--old">{t('ui.campaign.repealed.badge')}</span> {t(r.text)}
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
  return (
    <main class="screen screen--morning">
      <h1 data-testid="morning-title">{t('ui.campaign.day', { n: run.day })}</h1>
      <p class="muted">
        {t('ui.campaign.purse', { n: run.rings })}
        {run.story ? ` · ${t('ui.campaign.story')}` : ''}
      </p>
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
          <section class="card">
            <Decree ctx={ctx} />
            <RulebookChanges day={run.day} />
            <p class="briefing__queue">
              {run.story ? t('ui.campaign.untimed') : t('ui.campaign.sun', { time: clockText(sunS * 1000) })}
            </p>
          </section>
          <div class="row">
            <button type="button" class="btn btn--primary btn--big" data-testid="to-gate" onClick={toGate}>
              {t('ui.campaign.toGate')}
            </button>
          </div>
        </>
      )}
      <div class="row">
        <button type="button" class="btn btn--quiet" data-testid="campaign-quit" onClick={leaveCampaign}>
          {t('ui.campaign.quit')}
        </button>
      </div>
      <ToastView />
    </main>
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
  const forgiven = Math.min(ledger.wrong, a.run.story ? ledger.wrong : economy.warnings);
  const score = shiftScore(shift);
  return (
    <main class="screen screen--audit">
      <h1 data-testid="audit-title">{t('ui.audit.title', { n: a.run.day })}</h1>
      <p class="summary__score" data-testid="audit-score">
        {t('ui.summary.score', { correct: ledger.correct, total: ledger.correct + ledger.wrong + ledger.unjudged })}
      </p>
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
          <tr class="ledger__total">
            <td>{t('ui.campaign.purseLabel')}</td>
            <td class="num" data-testid="audit-rings">
              {a.run.rings}
            </td>
          </tr>
        </tbody>
      </table>
      <StandingTable run={a.run} today={ledger.standing} />
      <ol class="verdicts">
        {shift.verdicts.map((v) => {
          const c = shift.cases[v.index];
          const name = c ? `${c.evidence.look.name} ${c.evidence.look.patronym}` : '';
          return (
            <li key={v.index} class={v.correct ? 'is-right' : 'is-wrong'} data-testid="verdict">
              <span aria-hidden="true">{v.stamped === null ? '⬛' : v.correct ? '🟩' : '🟥'}</span>{' '}
              {t('ui.summary.row', { name, dest: t(`dest.${v.expected}`) })}
              {v.stamped === null ? (
                <span class="muted"> ({t('ui.summary.unjudged')})</span>
              ) : v.correct ? null : v.stamped === v.expected ? (
                <span class="muted">
                  {' '}
                  ({t('ui.summary.skipped', { procs: listText(skippedText(v.skipped, a.ctx)) })})
                </span>
              ) : (
                <span class="muted"> ({t('ui.summary.you', { dest: t(`dest.${v.stamped}`) })})</span>
              )}{' '}
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
      <ToastView />
    </main>
  );
}

/** Where the player stands with each power, once any of them has an opinion. */
function StandingTable({ run, today }: { run: RunState; today: Readonly<Partial<Record<Faction, number>>> }) {
  const rows = FACTIONS.filter((f) => (today[f] ?? 0) !== 0 || run.standing[f] !== 0);
  if (rows.length === 0) return null;
  return (
    <table class="ledger" data-testid="standing">
      <thead>
        <tr>
          <th>{t('ui.audit.standing')}</th>
          <th class="num">{t('ui.audit.today')}</th>
          <th class="num">{t('ui.audit.total')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((f) => (
          <tr key={f}>
            <td>{t(`faction.${f}`)}</td>
            <td class="num">{signed(today[f] ?? 0)}</td>
            <td class="num">{signed(run.standing[f])}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ---------- night ----------

function FamilyList({ run }: { run: RunState }) {
  return (
    <ul class="family" data-testid="family">
      {run.family.map((m) => {
        const name = familyName(gameContent, m.id);
        const status =
          m.status === 'gone'
            ? t(m.gone === 'died' ? 'ui.family.died' : 'ui.family.left')
            : m.status === 'sick'
              ? t('ui.family.sick', { n: m.sickNights })
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

function BillsCard({ run }: { run: RunState }) {
  const a = active.value;
  if (!a) return null;
  const economy = economyOf({ content: gameContent, ctx: a.ctx });
  const bills = run.bills ?? defaultBills(run);
  const cost = billTotal(run, economy, bills);
  const set = (next: Bills) => dispatch({ t: 'bills', bills: next });
  const home = run.family.filter((m) => m.status !== 'gone');
  const sick = home.filter((m) => m.status === 'sick');
  const after = run.rings - cost.hearth - cost.food - cost.medicine;
  const floor = campaignOf(gameContent).debtFloor;
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
      {sick
        .filter((m) => !bills.medicine.includes(m.id))
        .map((m) => (
          <p key={m.id} class="warn">
            {t('ui.night.warnSick', { name: familyName(gameContent, m.id) })}
          </p>
        ))}
      {!bills.hearth || !bills.food ? <p class="warn">{t('ui.night.warnNeeds')}</p> : null}
      <p data-testid="after-bills">{t('ui.night.after', { n: after })}</p>
      {after < floor ? <p class="warn">{t('ui.night.debt', { floor })}</p> : null}
    </section>
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
  return (
    <main class="screen screen--night">
      <h1 data-testid="night-title">{t('ui.night.title', { n: run.day })}</h1>
      <p class="muted" data-testid="night-rings">
        {t('ui.campaign.purse', { n: run.rings })}
      </p>
      {scene ? (
        <SceneView key={scene} id={scene} run={run} />
      ) : (
        <>
          <section class="card">
            <h2>{t('ui.night.family')}</h2>
            <FamilyList run={run} />
          </section>
          <BillsCard run={run} />
          <ShopCard run={run} />
          <div class="row">
            <button type="button" class="btn btn--primary btn--big" data-testid="sleep" onClick={sleep}>
              {t('ui.night.sleep')}
            </button>
          </div>
        </>
      )}
      <div class="row">
        <button type="button" class="btn btn--quiet" data-testid="campaign-quit" onClick={leaveCampaign}>
          {t('ui.campaign.quit')}
        </button>
      </div>
      <ToastView />
    </main>
  );
}

// ---------- ending ----------

function Ending() {
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
      <NightNews events={lastNight.value} />
      <section class="card">
        <p>{t('ui.ending.stats', { days: run.day, worthy: run.einherjar.worthy, unworthy: run.einherjar.unworthy })}</p>
        <FamilyList run={run} />
      </section>
      <div class="row">
        <button type="button" class="btn btn--primary" data-testid="ending-slots" onClick={leaveCampaign}>
          {t('ui.ending.slots')}
        </button>
      </div>
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
