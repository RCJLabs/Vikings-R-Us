import { resolve } from 'node:path';
import { isTargetId, TARGET_IDS, TARGETS } from '@cots/content-schema';
import { ContentError, compileTarget, loadPacks, writeLeakTokens } from './compile';

const repoRoot = resolve(import.meta.dirname, '../../..');
const packsDir = resolve(repoRoot, 'content/packs');
const outRoot = resolve(repoRoot, 'generated');

function usage(): never {
  console.error(`Usage: content:compile --target <${TARGET_IDS.join('|')}> | --all`);
  process.exit(2);
}

const args = process.argv.slice(2);
let targets: string[];
if (args[0] === '--all') targets = TARGET_IDS;
else if (args[0] === '--target' && args[1]) targets = [args[1]];
else usage();

try {
  const packs = loadPacks(packsDir);
  writeLeakTokens(packs, outRoot);
  for (const id of targets) {
    if (!isTargetId(id)) usage();
    const result = compileTarget(id, TARGETS[id], packs, outRoot);
    const drafts = result.drafts > 0 ? `, ${result.drafts} draft` : '';
    const story = result.scenes > 0 ? `; ${result.scenes} scenes${drafts}, ~${result.sceneWords} words` : '';
    const sound = `; sound ${result.soundFiles.present} of ${result.soundFiles.named} files`;
    console.log(`content: ${id} <- ${result.packs.join(', ')} (hash ${result.contentHash}${story}${sound})`);
  }
} catch (error) {
  if (error instanceof ContentError) {
    console.error(`content: ${error.message}`);
    process.exit(1);
  }
  throw error;
}
