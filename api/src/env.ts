export interface Env {
  DB: D1Database;
  /** Definido como 'teste' só no ambiente de testes. Em produção fica ausente. */
  AMBIENTE?: string;
  /** Horário fixo (ISO 8601) usado somente quando AMBIENTE é 'teste'. */
  RELOGIO_TESTE?: string;
}
