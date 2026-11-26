import { describe, expect, it } from 'vitest';
import { estaAtrasada, prazoDaRetirada } from '../src/expediente';

// Horários em comentário são de São Paulo (UTC-3). 2026-10-27 é uma terça-feira.

describe('prazoDaRetirada', () => {
  it('Retirada feita dentro do Expediente vale o fim do Expediente do mesmo dia (terça 19h)', () => {
    // Terça 10h SP
    expect(prazoDaRetirada('2026-10-27T13:00:00.000Z').toISOString()).toBe('2026-10-27T22:00:00.000Z');
  });

  it('sábado vale o fim do Expediente de sábado, 13h', () => {
    // Sábado 10h SP
    expect(prazoDaRetirada('2026-10-31T13:00:00.000Z').toISOString()).toBe('2026-10-31T16:00:00.000Z');
  });

  it('Retirada depois do fechamento na terça vale o fim do próximo Expediente (quarta 19h)', () => {
    // Terça 19h30 SP
    expect(prazoDaRetirada('2026-10-27T22:30:00.000Z').toISOString()).toBe('2026-10-28T22:00:00.000Z');
  });

  it('Retirada no sábado depois das 13h vale o fim do próximo Expediente (terça 19h, pois segunda 2/11 é Finados)', () => {
    // Sábado 14h SP
    expect(prazoDaRetirada('2026-10-31T17:00:00.000Z').toISOString()).toBe('2026-11-03T22:00:00.000Z');
  });

  it('Retirada no domingo vale o fim do próximo Expediente (terça 19h, pois segunda 2/11 é Finados)', () => {
    // Domingo 10h SP
    expect(prazoDaRetirada('2026-11-01T13:00:00.000Z').toISOString()).toBe('2026-11-03T22:00:00.000Z');
  });
});

describe('estaAtrasada', () => {
  it('terça 10h: aberta às 18h59 ainda é Fora; às 19h01 do mesmo dia é Atrasada', () => {
    const retirada = '2026-10-27T13:00:00.000Z';

    expect(estaAtrasada(retirada, new Date('2026-10-27T21:59:00.000Z'))).toBe(false); // 18h59 SP
    expect(estaAtrasada(retirada, new Date('2026-10-27T22:01:00.000Z'))).toBe(true); // 19h01 SP
  });

  it('sábado: Fora até 13h, Atrasada às 13h01', () => {
    const retirada = '2026-10-31T13:00:00.000Z'; // sábado 10h SP

    expect(estaAtrasada(retirada, new Date('2026-10-31T15:59:00.000Z'))).toBe(false); // 12h59 SP
    expect(estaAtrasada(retirada, new Date('2026-10-31T16:01:00.000Z'))).toBe(true); // 13h01 SP
  });

  it('Retirada de terça 19h30: Fora até quarta 19h, Atrasada depois', () => {
    const retirada = '2026-10-27T22:30:00.000Z';

    expect(estaAtrasada(retirada, new Date('2026-10-28T21:59:00.000Z'))).toBe(false); // quarta 18h59 SP
    expect(estaAtrasada(retirada, new Date('2026-10-28T22:01:00.000Z'))).toBe(true); // quarta 19h01 SP
  });

  it('Retirada de sábado às 14h: Fora até terça 19h (segunda 2/11 é Finados)', () => {
    const retirada = '2026-10-31T17:00:00.000Z';

    expect(estaAtrasada(retirada, new Date('2026-11-03T21:59:00.000Z'))).toBe(false); // terça 18h59 SP
    expect(estaAtrasada(retirada, new Date('2026-11-03T22:01:00.000Z'))).toBe(true); // terça 19h01 SP
  });

  it('Retirada no domingo: Fora até terça 19h (segunda 2/11 é Finados)', () => {
    const retirada = '2026-11-01T13:00:00.000Z';

    expect(estaAtrasada(retirada, new Date('2026-11-03T21:59:00.000Z'))).toBe(false);
    expect(estaAtrasada(retirada, new Date('2026-11-03T22:01:00.000Z'))).toBe(true);
  });

  it('sexta 18h até segunda 8h: Atrasada', () => {
    const retirada = '2026-10-30T21:00:00.000Z'; // sexta 18h SP

    expect(estaAtrasada(retirada, new Date('2026-11-02T11:00:00.000Z'))).toBe(true); // segunda 8h SP
  });
});

describe('feriados nacionais não são dias de Expediente', () => {
  it('Retirada no domingo antes do Finados (segunda 2/11, feriado): vale terça 19h', () => {
    // Domingo 1/11, 10h SP
    expect(prazoDaRetirada('2026-11-01T13:00:00.000Z').toISOString()).toBe('2026-11-03T22:00:00.000Z');
  });

  it('Retirada na quinta 19/11 com sexta 20/11 (Consciência Negra) feriada: vale sábado 13h', () => {
    // Quinta 19/11, 19h30 SP
    expect(prazoDaRetirada('2026-11-19T22:30:00.000Z').toISOString()).toBe('2026-11-21T16:00:00.000Z');
  });

  it('Sexta-feira santa (3/4/2026) feriada: Retirada de quinta 19h30 vale sábado 13h', () => {
    // Quinta 2/4, 19h30 SP
    expect(prazoDaRetirada('2026-04-02T22:30:00.000Z').toISOString()).toBe('2026-04-04T16:00:00.000Z');
  });

  it('Corpus Christi (4/6/2026) feriada: Retirada de quarta 19h30 vale sexta 19h', () => {
    // Quarta 3/6, 19h30 SP
    expect(prazoDaRetirada('2026-06-03T22:30:00.000Z').toISOString()).toBe('2026-06-05T22:00:00.000Z');
  });

  it('Retirada no próprio feriado (terça 21/4, Tiradentes) vale quarta 19h', () => {
    // Terça 21/4, 10h SP
    expect(prazoDaRetirada('2026-04-21T13:00:00.000Z').toISOString()).toBe('2026-04-22T22:00:00.000Z');
  });

  it('Carnaval não é feriado nacional: terça 17/2/2026 segue o Expediente normal', () => {
    // Terça 17/2, 10h SP
    expect(prazoDaRetirada('2026-02-17T13:00:00.000Z').toISOString()).toBe('2026-02-17T22:00:00.000Z');
  });
});
