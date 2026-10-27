import type { Env } from './env';

export type Relogio = () => Date;

/**
 * "Agora" da API. Só o ambiente de teste pode fixar o horário; em produção
 * (AMBIENTE ausente) é sempre a hora real.
 */
export function relogioDoAmbiente(env: Env): Relogio {
  if (env.AMBIENTE === 'teste' && env.RELOGIO_TESTE) {
    const horaFixa = new Date(env.RELOGIO_TESTE).getTime();
    return () => new Date(horaFixa);
  }

  return () => new Date();
}
