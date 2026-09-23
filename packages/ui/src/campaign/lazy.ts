import { signal } from '@preact/signals';
import { screen } from '../store';

/*
 * The campaign's screens (and the Ink runtime they need) load on first use,
 * so the Daily Shift's first load stays small.
 */

type CampaignModule = typeof import('./screens');

export const campaignUi = signal<CampaignModule | null>(null);

export async function openCampaign(): Promise<void> {
  const m = campaignUi.peek() ?? (await import('./screens'));
  await m.enterCampaign();
  campaignUi.value = m;
  screen.value = 'campaign';
}
