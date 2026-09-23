/** A problem in the content packs, reported with the file (and line) it comes from. */
export class ContentError extends Error {
  override name = 'ContentError';
}
