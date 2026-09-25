import {
  type AppealHeard,
  type Assists,
  type Content,
  campaignOf,
  createDayContext,
  type DayLedger,
  type DayMistake,
  type Faction,
  factionKey,
  factionsMet,
  type RunSave,
  type RunState,
  ruleText,
} from '@cots/engine';
import { journalEnv, playScene } from '@cots/story';

/*
 * The playtest report (docs/tech-spec.md §38): a campaign run, read from its save, as text for the playtest
 * form. It's what tuning needs from people rather than bots: the rings night by night, every soul sent wrong
 * and the rule it broke, and each choice made in the story. The game's own words come through `t`; the
 * report's frame is plain English, for whoever reads the form.
 */

export type Translate = (key: string, vars?: Readonly<Record<string, string | number>>) => string;

export interface PlaytestInput {
  readonly save: RunSave;
  /** The run as it stands now (the save played up to its last action). */
  readonly run: RunState;
  /** The save slot, from 0. */
  readonly slot: number;
  /** Which build: its target, commit and content. */
  readonly build: string;
  readonly content: Content;
  /** The compiled scenes by id, to read the choices back. */
  readonly scenes: Readonly<Record<string, object>>;
  readonly t: Translate;
}

/** A change in rings, signed; plain ASCII, so the table can be read by a script as well as a person. */
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

const PHASES: Readonly<Record<RunState['phase'], string>> = {
  morning: 'morning',
  shift: 'at the gate',
  audit: 'the audit',
  night: 'night',
  ending: 'the ending',
};

function assistsText(a: Assists | undefined): string {
  if (!a) return '';
  return [
    a.sunPct !== undefined && a.sunPct !== 100 ? `sun ${a.sunPct}%` : '',
    a.tracker ? 'rule tracker' : '',
    a.noFines ? 'no fines' : '',
  ]
    .filter((s) => s !== '')
    .join(', ');
}

function header(p: PlaytestInput): string[] {
  const { run, t } = p;
  const campaign = campaignOf(p.content);
  const family = run.family.map((m) => {
    const name = t(campaign.family.find((f) => f.id === m.id)?.name ?? m.id);
    const status =
      m.status === 'sick'
        ? `sick, ${m.sickNights} night${m.sickNights === 1 ? '' : 's'} without medicine`
        : m.status === 'gone'
          ? m.gone === 'died'
            ? 'died'
            : 'sent to relatives'
          : 'well';
    return `${name}: ${status}`;
  });
  // Only the powers met so far, by the names they go by today: the report mustn't spoil the story.
  const standing = factionsMet(run).map((f) => `${t(factionKey(p.content, f, run.day))} ${signed(run.standing[f])}`);
  const bought = campaign.shop.filter((u) => run.upgrades.includes(u.id)).map((u) => t(u.name));
  const ending = run.ending ? campaign.endings.find((e) => e.id === run.ending) : undefined;
  const about = [
    `slot ${p.slot + 1}`,
    `seed \`${run.seed}\``,
    run.story ? 'Story Mode' : '',
    run.slice ? 'the slice' : '',
  ]
    .filter((s) => s !== '')
    .join(' · ');
  const debt = run.debtNights > 0 ? ` · ${run.debtNights} night${run.debtNights === 1 ? '' : 's'} in debt` : '';
  return [
    '## Playtest report',
    '',
    `- **Build:** ${p.build}`,
    `- **Run:** ${about}`,
    `- **Now:** Day ${run.day}, ${PHASES[run.phase]} · ${run.rings} rings${debt}`,
    `- **Family:** ${family.join(' · ')}`,
    ...(standing.length > 0 ? [`- **Standing:** ${standing.join(' · ')}`] : []),
    ...(bought.length > 0 ? [`- **Bought:** ${bought.join(', ')}`] : []),
    ...(run.ending ? [`- **Ending:** ${ending ? t(ending.title) : run.ending}`] : []),
  ];
}

const DAY_HEADS = [
  'Day',
  'Right',
  'Wrong',
  'Unjudged',
  'Pay',
  'Bonus',
  'Fines',
  'Bills',
  'Shop',
  'Story',
  'Draupnir',
  'Rings after the night',
  'Assists',
];

/** Each finished day's accounts, one row a day; a day whose night is still to come has its night cells empty. */
function days(ledger: readonly DayLedger[]): string[] {
  if (ledger.length === 0) return ['### Days', '', 'No day finished yet.'];
  const rows = ledger.map((l) => {
    const n = l.night;
    const cells = [
      String(l.day),
      String(l.correct),
      String(l.wrong),
      String(l.unjudged),
      signed(l.pay),
      signed(l.bonus),
      signed(-l.fines),
      n ? signed(-(n.hearth + n.food + n.medicine)) : '',
      n ? signed(-n.upgrades) : '',
      n ? signed(n.story) : '',
      n ? signed(n.draupnir) : '',
      n ? String(n.rings) : '',
      assistsText(l.assists),
    ];
    return `| ${cells.join(' | ')} |`;
  });
  const align = DAY_HEADS.map((_, i) => (i === DAY_HEADS.length - 1 ? '---' : '---:'));
  return ['### Days', '', `| ${DAY_HEADS.join(' | ')} |`, `| ${align.join(' | ')} |`, ...rows];
}

function mistakeLine(p: PlaytestInput, day: number, m: DayMistake): string {
  const { t } = p;
  const ctx = createDayContext(p.content, day, p.run.seed);
  const rule = ctx.rules.find((r) => r.id === m.rule);
  const skipped = (m.skipped ?? []).map((id) => {
    const proc = ctx.procedures.find((x) => x.id === id);
    return proc ? t(`${proc.text}.short`) : id;
  });
  const skip = skipped.length > 0 ? ` Skipped: ${skipped.join(', ')}.` : '';
  // A soul after the day's noon decree (docs/tech-spec.md §45) was judged under it.
  const noon = m.noon ? ' After the noon decree.' : '';
  if (m.stamped === m.expected)
    return `- Day ${day}: the right stamp, ${t(`dest.${m.stamped}`)}, but a step skipped.${skip}${noon}`;
  const why = rule ? `“${t(ruleText(rule, day))}”` : m.rule;
  return `- Day ${day}: stamped ${t(`dest.${m.stamped}`)} for a soul that belonged in ${t(`dest.${m.expected}`)}. The rule: ${why}${skip}${noon}`;
}

/** Every soul sent wrong, day by day, with the rule that decided where it belonged. */
function mistakes(p: PlaytestInput): string[] {
  const lines = p.run.ledger.flatMap((l) => {
    if (l.wrong === 0) return [];
    // A save from before mistakes were filed has only the count.
    if (!l.mistakes) return [`- Day ${l.day}: ${l.wrong} sent wrong (not itemised in saves from before this build).`];
    return l.mistakes.map((m) => mistakeLine(p, l.day, m));
  });
  return ['### Mistakes', '', ...(lines.length > 0 ? lines : ['None.'])];
}

/** Each appeal heard (docs/tech-spec.md §40): whose, what was decided, and what it came to. */
function appeals(p: PlaytestInput): string[] {
  const { t } = p;
  const line = (when: string, a: AppealHeard) => {
    const what =
      a.outcome === 'righted'
        ? `righted, to ${t(`dest.${a.to}`)}`
        : a.outcome === 'upheld'
          ? 'turned down rightly'
          : a.outcome === 'wrong'
            ? `decided wrongly (${t(`dest.${a.to}`)}; it belonged in ${t(`dest.${a.expected}`)})`
            : 'left to stand';
    return `- ${when}: ${a.name}, judged on Day ${a.day} and sent to ${t(`dest.${a.from}`)}: ${what}, ${signed(a.rings)} rings.`;
  };
  const lines = p.run.ledger.flatMap((l) => (l.appeal ? [line(`Day ${l.day}`, l.appeal)] : []));
  // Heard this morning, and not yet filed by the day's audit.
  if (p.run.appealHeard) lines.push(line(`Day ${p.run.day}, this morning`, p.run.appealHeard));
  return ['### Appeals', '', ...(lines.length > 0 ? lines : ['None.'])];
}

/** Each night the sun set on the line (docs/tech-spec.md §41): who waited, who died in the night, and the cost. */
function line(p: PlaytestInput): string[] {
  const names = (souls: readonly { readonly name: string }[]) => souls.map((s) => s.name).join(', ');
  const lines = p.run.ledger.flatMap((l) => {
    const w = l.waiting;
    if (!w) return [];
    const parts = [
      ...(w.carried.length > 0 ? [`${names(w.carried)} waited for Day ${l.day + 1}`] : []),
      ...(w.died.length > 0 ? [`${names(w.died)} died in the night`] : []),
      ...((w.gone?.length ?? 0) > 0 ? [`${names(w.gone ?? [])} could not wait`] : []),
    ];
    const cost = Object.entries(w.standing)
      .filter(([, n]) => n !== 0)
      .map(([f, n]) => `${p.t(factionKey(p.content, f as Faction, l.day))} ${signed(n ?? 0)}`)
      .join(', ');
    return [`- Day ${l.day}: ${parts.join('; ')}.${cost ? ` Standing: ${cost}.` : ''}`];
  });
  return ['### The line at dusk', '', ...(lines.length > 0 ? lines : ['Nobody was left in line.'])];
}

/** Each god's request, and how it went (docs/tech-spec.md §42). */
function requests(p: PlaytestInput): string[] {
  const god = (f: Faction, day: number) => p.t(factionKey(p.content, f, day));
  const lines = p.run.ledger.flatMap((l) =>
    (l.requests ?? []).map((r) => {
      const reward = Object.entries(r.standing)
        .filter(([, n]) => n !== 0)
        .map(([f, n]) => `${god(f as Faction, l.day)} ${signed(n ?? 0)}`)
        .join(', ');
      const asked = `${god(r.god, l.day)} asked for ${r.n} from ${p.t(`dest.${r.from}`)} sent to ${p.t(`dest.${r.to}`)}`;
      return `- Day ${l.day}: ${asked}; ${r.done} sent as asked: ${r.met ? `done (${reward})` : 'not done'}.`;
    }),
  );
  return ['### Requests', '', ...(lines.length > 0 ? lines : ['None yet.'])];
}

/** The gods' favours each day held (docs/tech-spec.md §43), as the gate granted them, and the fines they spared. */
function favours(p: PlaytestInput): string[] {
  const defs = new Map((p.content.campaign?.favours ?? []).map((f) => [f.id, f]));
  const lines = p.run.ledger.flatMap((l) => {
    const held = (l.favours ?? []).flatMap((id) => {
      const f = defs.get(id);
      return f ? [`${p.t(factionKey(p.content, f.faction, l.day))}'s favour (${p.t(f.text)})`] : [];
    });
    const spared = l.eased ? [`${l.eased} rings of fines spared`] : [];
    return held.length > 0 ? [`- Day ${l.day}: ${[...held, ...spared].join('; ')}.`] : [];
  });
  return ['### Favours', '', ...(lines.length > 0 ? lines : ['None yet.'])];
}

/** Promotion (docs/tech-spec.md §44): each offer and what was made of it, the days at each rank, and steps down. */
function ranks(p: PlaytestInput): string[] {
  const defs = p.content.campaign?.promotion?.ranks ?? [];
  const name = (n: number) => p.t(defs[n - 1]?.name ?? `rank ${n}`);
  const lines: string[] = [];
  let held: { rank: number; from: number; to: number } | null = null;
  const flush = () => {
    if (held) {
      const days = held.from === held.to ? `Day ${held.from}` : `Days ${held.from}–${held.to}`;
      lines.push(`- ${days}: worked as ${name(held.rank)}.`);
    }
    held = null;
  };
  for (const l of p.run.ledger) {
    if (l.offer) {
      flush();
      lines.push(`- Day ${l.day}: offered ${name(l.offer.rank)}; ${l.offer.taken ? 'taken' : 'declined'}.`);
    }
    if (l.rank && held?.rank === l.rank && held.to === l.day - 1) held.to = l.day;
    else {
      flush();
      if (l.rank) held = { rank: l.rank, from: l.day, to: l.day };
    }
    if (l.steppedDown) {
      flush();
      lines.push(`- Day ${l.day}: stepped down from ${name(l.steppedDown)}.`);
    }
  }
  flush();
  return ['### Rank', '', ...(lines.length > 0 ? lines : ['No promotion yet.'])];
}

/** Every scene played, with the options picked in it, read back by playing it again as the journal does. */
function choices(p: PlaytestInput): string[] {
  const lines = (p.save.journal ?? []).map((e) => {
    const day = p.content.days.find((d) => d.day === e.day);
    const when = day?.scenes;
    // A scene at the desk (docs/tech-spec.md §46) is played between the day's souls.
    const desk = (day?.queue.visits ?? []).some((v) => v.scene === e.scene);
    const label =
      when?.morning === e.scene ? 'morning' : when?.night === e.scene ? 'night' : desk ? 'at the desk' : e.scene;
    const json = p.scenes[e.scene];
    let picked: string[] | null = null;
    try {
      picked = json
        ? playScene(json, journalEnv(p.run.seed, e), e.choices)
            .lines.filter((l) => l.chosen)
            // As the scene words them (a spoken option carries its own quotation marks).
            .map((l) => l.text)
        : null;
    } catch {
      // A rewrite since then changed its choices.
      picked = null;
    }
    const what =
      picked === null
        ? `(the scene has changed since; options ${e.choices.map((c) => c + 1).join(', ')})`
        : picked.length > 0
          ? picked.join(' · ')
          : '(nothing to choose)';
    return `- Day ${e.day}, ${label}: ${what}`;
  });
  return ['### Choices', '', ...(lines.length > 0 ? lines : ['None yet.'])];
}

/** The report, as Markdown: it reads as plain text in the form, and as tables and lists once posted. */
export function playtestReport(p: PlaytestInput): string {
  return [
    ...header(p),
    '',
    ...days(p.run.ledger),
    '',
    ...mistakes(p),
    '',
    ...appeals(p),
    '',
    ...line(p),
    '',
    ...requests(p),
    '',
    ...favours(p),
    '',
    ...ranks(p),
    '',
    ...choices(p),
    '',
  ].join('\n');
}

export const playtestTitle = (run: RunState): string =>
  `Campaign playtest: Day ${run.day}${run.ending ? ', an ending' : ''}`;
