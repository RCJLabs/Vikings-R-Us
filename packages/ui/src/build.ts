import { manifest } from 'virtual:content';

/*
 * Which build this is, in words a playtester can quote (docs/tech-spec.md §38): its target, the commit it was
 * built from (the deploy workflows set VITE_BUILD; a local build says so), and its content.
 */
const commit = (import.meta.env as Record<string, string | undefined>).VITE_BUILD?.trim() || 'local';

export const buildLabel = `${manifest.target} · ${commit} · content ${manifest.contentHash}`;
