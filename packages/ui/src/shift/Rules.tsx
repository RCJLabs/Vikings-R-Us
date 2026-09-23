import { type DayCtx, PENALTY } from '@cots/engine';
import { t } from '../i18n';

/** Decree, Freyja's whim and the rulebook in force: shown at the briefing and on the desk. */
export function Decree({ ctx }: { ctx: DayCtx }) {
  return (
    <div class="decree">
      <p data-testid="decree">{t(ctx.spec.decree)}</p>
      {Object.values(ctx.paramChoices).map((p) => (
        <p key={p.id} class="decree__whim" data-testid="whim">
          {t(p.text)}
        </p>
      ))}
    </div>
  );
}

export function RulesPanel({ ctx, decree = true }: { ctx: DayCtx; decree?: boolean }) {
  return (
    <div class="rules">
      {decree ? <Decree ctx={ctx} /> : null}
      <h3>{t('ui.rules.title')}</h3>
      <ol class="rules__order">
        {ctx.rules.map((r) => (
          <li key={r.id} data-rule={r.id}>
            {t(r.text)}
          </li>
        ))}
      </ol>
      {ctx.signLaws.length > 0 ? (
        <>
          <h3>{t('ui.rules.signs')}</h3>
          <ul>
            {ctx.signLaws.map((l) => (
              <li key={l.id}>{t(l.text)}</li>
            ))}
          </ul>
        </>
      ) : null}
      {ctx.factLaws.length > 0 ? (
        <>
          <h3>{t('ui.rules.customs')}</h3>
          <ul>
            {ctx.factLaws.map((l) => (
              <li key={l.id}>{t(l.text)}</li>
            ))}
          </ul>
        </>
      ) : null}
      <h3>{t('ui.rules.tools')}</h3>
      <ul>
        {[...ctx.tools].map(([id, s]) => (
          <li key={id}>{t('ui.rules.toolCost', { tool: t(`tool.${id}`), s })}</li>
        ))}
        <li>{t('ui.rules.costs', { bad: PENALTY.badCompare / 1000, q: PENALTY.question / 1000 })}</li>
      </ul>
    </div>
  );
}
