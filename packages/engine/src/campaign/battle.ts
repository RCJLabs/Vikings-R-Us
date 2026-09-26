import type { Content, Destination, FrontDef, RagnarokDef } from '../content/types';
import type { RunState } from './state';

/*
 * The last battle (docs/tech-spec.md §54). After the campaign's last night the hosts the run filled go to the fronts.
 * Each host is the souls sent to one hall. At its own front each soul sent there rightly counts 2, and each sent there
 * by mistake breaks and runs, costing the front 1; at any other front a soul counts 1 (a host marked `only` fights at
 * its own front alone). The player sets the order the fronts are held in. Each in turn is held if the hosts can hold
 * it along with those already held; a front that can't be held falls, and its host's souls go where they're needed.
 */

/** A host as the run leaves it. */
export interface HostState {
  readonly id: string;
  readonly hall: Destination;
  readonly front: string;
  readonly only: boolean;
  /** Souls sent there rightly (to Valhalla: the worthy). */
  readonly souls: number;
  /** Souls sent there by mistake (to Valhalla: the unworthy): they break and run. */
  readonly misfits: number;
}

/** Souls of one host at a front, and what they were worth there. */
export interface Stood {
  readonly host: string;
  readonly souls: number;
  readonly strength: number;
}

export interface FrontBattle {
  readonly id: string;
  readonly foe: number;
  /** Its own host first, then those who came from the others. */
  readonly stood: readonly Stood[];
  /** Its own host's souls sent there by mistake, who broke and ran: each cost it 1. */
  readonly ran: number;
  readonly strength: number;
  readonly held: boolean;
}

export interface Battle {
  /** The order the fronts were to be held in, as the player set it. */
  readonly order: readonly string[];
  /** Each front, in the content's order. */
  readonly fronts: readonly FrontBattle[];
}

/** The hosts as the run leaves them. */
export function hostsAt(run: RunState, def: RagnarokDef): HostState[] {
  return def.hosts.map((h) => {
    const valhalla = h.hall === 'VALHALLA';
    const misfits = valhalla ? run.einherjar.unworthy : (run.misfits?.[h.hall] ?? 0);
    const souls = valhalla ? run.einherjar.worthy : Math.max(0, (run.sent?.[h.hall] ?? 0) - misfits);
    return { id: h.id, hall: h.hall, front: h.front, only: h.only === true, souls, misfits };
  });
}

/** The strength that comes against a front: its foe, and Naglfar's crew where the nails left long tell. */
export function foeAt(front: FrontDef, run: RunState): number {
  return front.foe + (front.perNail ?? 0) * (run.naglfar ?? 0);
}

/** What a host must make up at its own front: the foe, and 1 for each of its souls who'll run. */
const needAt = (front: FrontDef, host: HostState, run: RunState) => foeAt(front, run) + host.misfits;

/**
 * Whether the hosts can hold every front in `hold` at once: each front's own host first (2 a soul), then what the
 * front still lacks from the souls the other hosts can spare (1 a soul).
 */
function holdable(hosts: readonly HostState[], fronts: readonly FrontDef[], run: RunState, hold: ReadonlySet<string>) {
  let short = 0;
  let spare = 0;
  for (const f of fronts) if (hold.has(f.id) && !hosts.some((h) => h.front === f.id)) short += foeAt(f, run);
  for (const h of hosts) {
    const f = fronts.find((x) => x.id === h.front);
    let left = h.souls;
    if (f && hold.has(f.id)) {
      const need = needAt(f, h, run);
      short += Math.max(0, need - 2 * h.souls);
      left = h.souls - Math.min(h.souls, Math.ceil(need / 2));
    }
    if (!h.only) spare += left;
  }
  return short <= spare;
}

/**
 * Who stands where, holding `held` (in the order it was held): each held front's own host as many as it needs, then
 * each held front's shortfall from the hosts with the most to spare, and everyone left at their own front.
 */
function arrange(hosts: readonly HostState[], def: RagnarokDef, run: RunState, held: readonly string[]): FrontBattle[] {
  const left = new Map(hosts.map((h) => [h.id, h.souls]));
  const stood = new Map<string, Stood[]>(def.fronts.map((f) => [f.id, []]));
  const short = new Map<string, number>();
  const at = (front: string, host: string, souls: number, each: number) => {
    const list = stood.get(front) ?? [];
    const i = list.findIndex((s) => s.host === host);
    const was = list[i];
    if (was) list[i] = { host, souls: was.souls + souls, strength: was.strength + souls * each };
    else list.push({ host, souls, strength: souls * each });
    stood.set(front, list);
  };
  for (const f of def.fronts) {
    if (!held.includes(f.id)) continue;
    const own = hosts.find((h) => h.front === f.id);
    if (!own) {
      short.set(f.id, foeAt(f, run));
      continue;
    }
    const need = needAt(f, own, run);
    const used = Math.min(own.souls, Math.ceil(need / 2));
    left.set(own.id, own.souls - used);
    if (used > 0) at(f.id, own.id, used, 2);
    short.set(f.id, Math.max(0, need - 2 * used));
  }
  for (const id of held) {
    let lacking = short.get(id) ?? 0;
    const givers = hosts
      .filter((h) => !h.only && h.front !== id)
      .sort((a, b) => (left.get(b.id) ?? 0) - (left.get(a.id) ?? 0) || hosts.indexOf(a) - hosts.indexOf(b));
    for (const g of givers) {
      const n = Math.min(left.get(g.id) ?? 0, lacking);
      if (n <= 0) continue;
      left.set(g.id, (left.get(g.id) ?? 0) - n);
      lacking -= n;
      at(id, g.id, n, 1);
    }
  }
  for (const h of hosts) {
    const n = left.get(h.id) ?? 0;
    if (n > 0 && stood.has(h.front)) at(h.front, h.id, n, 2);
  }
  return def.fronts.map((f) => {
    const own = hosts.find((h) => h.front === f.id);
    const list = stood.get(f.id) ?? [];
    // Its own host first.
    const sorted = [...list.filter((s) => s.host === own?.id), ...list.filter((s) => s.host !== own?.id)];
    const ran = own?.misfits ?? 0;
    const strength = Math.max(0, sorted.reduce((n, s) => n + s.strength, 0) - ran);
    return { id: f.id, foe: foeAt(f, run), stood: sorted, ran, strength, held: held.includes(f.id) };
  });
}

/**
 * The fronts in the order given, each held if the hosts can hold it along with those held before it; any the order
 * leaves out come after, in the content's order.
 */
export function fight(run: RunState, def: RagnarokDef, order: readonly string[]): Battle {
  const ids = def.fronts.map((f) => f.id);
  const given = [...new Set(order)].filter((id) => ids.includes(id));
  const ordered = [...given, ...ids.filter((id) => !given.includes(id))];
  const hosts = hostsAt(run, def);
  const held: string[] = [];
  for (const id of ordered) if (holdable(hosts, def.fronts, run, new Set([...held, id]))) held.push(id);
  return { order: ordered, fronts: arrange(hosts, def, run, held) };
}

/** Whether the run goes to the last battle now: the build has one, it's the last day's night, and it's not fought. */
export function battleDue(run: RunState, content: Content): boolean {
  const campaign = content.campaign;
  if (!campaign?.ragnarok || run.battle || run.slice) return false;
  return run.day >= campaign.lastDay;
}

/** The fronts held, in the content's order. */
export function heldFronts(battle: Battle): string[] {
  return battle.fronts.filter((f) => f.held).map((f) => f.id);
}
