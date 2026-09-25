import { signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';

/*
 * What the sound needs to know from screens it doesn't load itself (docs/tech-spec.md §39): the campaign's day
 * and ending, and whether story text is on screen. The campaign's lazily loaded screens set these.
 */

/** The campaign run in play: its day, and its ending once reached. Null outside the campaign. */
export const campaignPlace = signal<{ readonly day: number; readonly ending: string | null } | null>(null);

/** How many story texts are on screen (a scene, an ending): the music drops while any is. */
export const storyOnScreen = signal(0);

/** For a component that shows story text: the music drops while it's on screen. */
export function useStoryText(): void {
  useEffect(() => {
    storyOnScreen.value += 1;
    return () => {
      storyOnScreen.value -= 1;
    };
  }, []);
}
