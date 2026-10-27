import { describe, expect, it } from 'vitest';
import type { Env } from '../src/env';
import { relogioDoAmbiente } from '../src/relogio';

const HORA_FIXA = '2026-10-27T12:00:00.000Z';

describe('relogioDoAmbiente', () => {
  it('usa o horário fixado quando o ambiente é de teste', () => {
    const relogio = relogioDoAmbiente({ AMBIENTE: 'teste', RELOGIO_TESTE: HORA_FIXA } as Env);

    expect(relogio().toISOString()).toBe(HORA_FIXA);
  });

  it('ignora o horário fixado fora do ambiente de teste (usa a hora real)', () => {
    const antes = Date.now();
    const relogio = relogioDoAmbiente({ RELOGIO_TESTE: HORA_FIXA } as Env);
    const depois = Date.now();

    const agora = relogio().getTime();
    expect(agora).toBeGreaterThanOrEqual(antes);
    expect(agora).toBeLessThanOrEqual(depois);
  });
});
