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

  it('Retirada no sábado depois das 13h vale o fim do próximo Expediente (segunda 19h)', () => {
    // Sábado 14h SP
    expect(prazoDaRetirada('2026-10-31T17:00:00.000Z').toISOString()).toBe('2026-11-02T22:00:00.000Z');
  });

  it('Retirada no domingo vale o fim do próximo Expediente (segunda 19h)', () => {
    // Domingo 10h SP
    expect(prazoDaRetirada('2026-11-01T13:00:00.000Z').toISOString()).toBe('2026-11-02T22:00:00.000Z');
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

  it('Retirada de sábado às 14h: Fora até segunda 19h', () => {
    const retirada = '2026-10-31T17:00:00.000Z';

    expect(estaAtrasada(retirada, new Date('2026-11-02T21:59:00.000Z'))).toBe(false); // segunda 18h59 SP
    expect(estaAtrasada(retirada, new Date('2026-11-02T22:01:00.000Z'))).toBe(true); // segunda 19h01 SP
  });

  it('Retirada no domingo: Fora até segunda 19h', () => {
    const retirada = '2026-11-01T13:00:00.000Z';

    expect(estaAtrasada(retirada, new Date('2026-11-02T21:59:00.000Z'))).toBe(false);
    expect(estaAtrasada(retirada, new Date('2026-11-02T22:01:00.000Z'))).toBe(true);
  });

  it('sexta 18h até segunda 8h: Atrasada', () => {
    const retirada = '2026-10-30T21:00:00.000Z'; // sexta 18h SP

    expect(estaAtrasada(retirada, new Date('2026-11-02T11:00:00.000Z'))).toBe(true); // segunda 8h SP
  });
});
