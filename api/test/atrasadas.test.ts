import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { tratarFerramentas } from '../src/ferramentas';
import { tratarFuncionarios } from '../src/funcionarios';

// Relógio fixado na API: terça 2026-10-27, 19h30 de São Paulo.
const AGORA = new Date('2026-10-27T22:30:00.000Z');
const relogio = () => new Date(AGORA);

interface Lista {
  itens: { numero?: string; nome: string; situacao?: string; retiradasAtrasadas?: number; ferramentasEmPosse?: { numero: string; atrasada: boolean }[] }[];
  contagens?: Record<string, number>;
}

async function listarFerramentas(query: string): Promise<Lista> {
  const resposta = await tratarFerramentas(new Request(`https://api.test/ferramentas${query}`), env, relogio);
  return resposta.json();
}

async function listarFuncionarios(): Promise<Lista> {
  const resposta = await tratarFuncionarios(new Request('https://api.test/funcionarios'), env, relogio);
  return resposta.json();
}

async function perfil(id: number): Promise<Lista['itens'][number] & { retiradasAtrasadas: number; ferramentasEmPosse: { numero: string; atrasada: boolean }[] }> {
  const resposta = await tratarFuncionarios(new Request(`https://api.test/funcionarios/${id}`), env, relogio);
  return resposta.json();
}

async function inserirFerramenta(numero: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO ferramentas (numero, nome, categoria, estado, criado_em, atualizado_em)
     VALUES (?, ?, 'Mecânica', 'disponivel', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
  )
    .bind(numero, `Ferramenta ${numero}`)
    .run();
}

async function inserirFuncionario(nome: string): Promise<number> {
  const { meta } = await env.DB.prepare('INSERT INTO funcionarios (nome, funcao, ativo) VALUES (?, NULL, 1)')
    .bind(nome)
    .run();
  return Number(meta.last_row_id);
}

async function inserirRetirada(numero: string, funcionarioId: number, retiradaEm: string, devolvidaEm: string | null = null): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO retiradas (ferramenta_numero, funcionario_id, retirada_em, registrada_por, devolvida_em, resultado)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(numero, funcionarioId, retiradaEm, almoxarifeId, devolvidaEm, devolvidaEm ? 'ok' : null)
    .run();
}

let almoxarifeId = 0;
let bruno = 0;
let ana = 0;

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM problemas'),
    env.DB.prepare('DELETE FROM retiradas'),
    env.DB.prepare('DELETE FROM funcionarios'),
    env.DB.prepare('DELETE FROM ferramentas'),
    env.DB.prepare('DELETE FROM sessoes'),
    env.DB.prepare('DELETE FROM usuarios'),
  ]);

  // Quem registra as Retiradas precisa existir como usuário (chave estrangeira).
  const { meta } = await env.DB.prepare(
    "INSERT INTO usuarios (email, nome, papel, senha_hash, ativo) VALUES ('almoxarife@tropical.test', 'Almoxarife', 'almoxarife', 'x', 1)",
  ).run();
  almoxarifeId = Number(meta.last_row_id);

  // Ana, sem Atrasadas, vem depois de Bruno mesmo na ordem alfabética: os atrasados primeiro.
  ana = await inserirFuncionario('Ana');
  bruno = await inserirFuncionario('Bruno');

  await inserirFerramenta('F-001');
  await inserirFerramenta('F-002');
  await inserirFerramenta('F-003');
  await inserirFerramenta('F-004');

  // Bruno retirou F-001 terça 10h SP: prazo terça 19h, já passou. Atrasada.
  await inserirRetirada('F-001', bruno, '2026-10-27T13:00:00.000Z');
  // Ana retirou F-002 terça 19h10 SP: depois do fechamento, prazo quarta 19h. Ainda Fora.
  await inserirRetirada('F-002', ana, '2026-10-27T22:10:00.000Z');
  // F-004 já foi devolvida: não conta como Retirada aberta.
  await inserirRetirada('F-004', bruno, '2026-10-27T13:00:00.000Z', '2026-10-27T14:00:00.000Z');
});

describe('situação Atrasada nas Ferramentas', () => {
  it('uma Retirada vencida aparece como Atrasada, e a dentro do prazo continua Fora', async () => {
    const lista = await listarFerramentas('');
    const situacoes = Object.fromEntries(lista.itens.map((item) => [item.numero, item.situacao]));

    expect(situacoes['F-001']).toBe('atrasada');
    expect(situacoes['F-002']).toBe('fora');
    expect(situacoes['F-003']).toBe('no_almoxarifado');
  });

  it('o filtro Atrasadas e as contagens batem com a situação', async () => {
    const atrasadas = await listarFerramentas('?situacao=atrasada');
    expect(atrasadas.itens.map((item) => item.numero)).toEqual(['F-001']);

    const todas = await listarFerramentas('');
    // F-004 já voltou: conta como no almoxarifado, não como Fora.
    expect(todas.contagens).toMatchObject({ todas: 4, fora: 1, atrasada: 1, no_almoxarifado: 2 });
  });

  it('o filtro Fora deixa de fora as Atrasadas, que têm situação própria', async () => {
    const fora = await listarFerramentas('?situacao=fora');
    expect(fora.itens.map((item) => item.numero)).toEqual(['F-002']);
  });
});

describe('Funcionários com Atrasadas', () => {
  it('a lista mostra a contagem de Atrasadas e põe os atrasados primeiro', async () => {
    const lista = await listarFuncionarios();

    expect(lista.itens.map((item) => item.nome)).toEqual(['Bruno', 'Ana']);
    expect(lista.itens[0].retiradasAtrasadas).toBe(1);
    expect(lista.itens[1].retiradasAtrasadas).toBe(0);
  });

  it('o perfil mostra a contagem e marca quais Ferramentas estão atrasadas', async () => {
    const bruno2 = await perfil(bruno);

    expect(bruno2.retiradasAtrasadas).toBe(1);
    expect(bruno2.ferramentasEmPosse).toEqual([{ numero: 'F-001', nome: 'Ferramenta F-001', categoria: 'Mecânica', retiradaEm: '2026-10-27T13:00:00.000Z', atrasada: true }]);
  });
});
