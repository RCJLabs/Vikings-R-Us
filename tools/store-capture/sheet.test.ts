import { describe, expect, it } from 'vitest';
import { contactSheet, type FileEntry, type Manifest } from './sheet';

const file = (over: Partial<FileEntry> = {}): FileEntry => ({
  set: 'steam',
  id: 'gate',
  path: 'steam/gate.png',
  title: 'A soul at the gate',
  note: 'Daily #41, the first soul.',
  width: 1920,
  height: 1080,
  bytes: 460_800,
  errors: [],
  warnings: [],
  ...over,
});

const manifest = (over: Partial<Manifest> = {}): Manifest => ({
  taken: '2027-01-10 12:00',
  build: 'electron-full',
  art: 'the default (woodcut)',
  check: false,
  files: [file()],
  clips: [],
  notes: [],
  ...over,
});

describe('the contact sheet', () => {
  it('shows each file with what it is, its size, and that it meets the rules', () => {
    const html = contactSheet(manifest());
    expect(html).toContain('<title>Chooser store captures</title>');
    expect(html).toContain('src="steam/gate.png"');
    expect(html).toContain('1920×1080 · 450 KB');
    expect(html).toContain('Every file meets its store’s rules.');
  });

  it('says what a store would refuse, and escapes what it quotes', () => {
    const html = contactSheet(
      manifest({
        files: [file({ title: 'Loki <in disguise>', errors: ['Steam screenshots are 1920×1080 or 1280×720'] })],
      }),
    );
    expect(html).toContain('1 file the stores would refuse');
    expect(html).toContain('Loki &lt;in disguise&gt;');
    expect(html).toContain('<li class="bad">Steam screenshots are 1920×1080 or 1280×720</li>');
  });

  it('shows a clip’s GIF, its frames, and the video when there is one', () => {
    const gif = file({ set: 'gif', path: 'clips/sundown.gif', width: 640, height: 360, bytes: 2_400_000 });
    const html = contactSheet(
      manifest({
        clips: [{ id: 'sundown', title: 'Sundown', note: 'n', fps: 30, frames: 120, gif, mp4: 'clips/sundown.mp4' }],
      }),
    );
    expect(html).toContain('src="clips/sundown.gif"');
    expect(html).toContain('120 frames at 30 fps');
    expect(html).toContain('href="clips/sundown.mp4"');
  });
});
