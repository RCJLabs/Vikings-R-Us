/**
 * Case Lab placeholder, dev-full builds only. The leak check requires this
 * marker in dev-full and forbids it everywhere else.
 */
export const CASE_LAB_MARKER = 'cots-case-lab';

export function CaseLab() {
  return (
    <section class="app__panel" data-marker={CASE_LAB_MARKER}>
      <h2>Case Lab</h2>
      <p>Arrives in M1: truth, evidence, solver trace and minimal proof for any seed.</p>
    </section>
  );
}
