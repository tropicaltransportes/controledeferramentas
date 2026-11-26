import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { tratarPainel } from '../src/painel';

// Relógio fixado na API: quarta 2026-10-28, 9h da manhã de São Paulo.
const AGORA = new Date('2026-10-28T12:00:00.000Z');
const relogio = () => new Date(AGORA);

interface Painel {
  indicadores: {
    foraAgora: number;
    atrasadas: number;
    comProblema: number;
    noAlmoxarifado: number;
    retiradasHoje: number;
    funcionariosComFerramenta: number;
  };
  atrasadas: { ferramenta: { numero: string; nome: string }; responsavel: { id: number; nome: string }; retiradaEm: string }[];
  atividades: {
    tipo: string;
    em: string;
    funcionario: { id: number; nome: string };
    ferramenta: { numero: string; nome: string };
    descricao: string | null;
  }[];
  maisRetiradas: { funcionario: { id: number; nome: string }; total: number }[];
}

async function buscarPainel(): Promise<Painel> {
  const resposta = await tratarPainel(new Request('https://api.test/painel'), env, relogio);
  return resposta.json();
}

async function inserirFerramenta(numero: string, estado = 'disponivel'): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO ferramentas (numero, nome, categoria, estado, criado_em, atualizado_em)
     VALUES (?, ?, 'Mecânica', ?, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
  )
    .bind(numero, `Ferramenta ${numero}`, estado)
    .run();
}

async function inserirFuncionario(nome: string): Promise<number> {
  const { meta } = await env.DB.prepare('INSERT INTO funcionarios (nome, funcao, ativo) VALUES (?, NULL, 1)')
    .bind(nome)
    .run();
  return Number(meta.last_row_id);
}

async function inserirRetirada(
  numero: string,
  funcionarioId: number,
  retiradaEm: string,
  devolvidaEm: string | null = null,
  resultado: string | null = null,
  observacao: string | null = null,
  extraviadaEm: string | null = null,
): Promise<number> {
  const { meta } = await env.DB.prepare(
    `INSERT INTO retiradas (ferramenta_numero, funcionario_id, retirada_em, registrada_por, devolvida_em, resultado, observacao, extraviada_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(numero, funcionarioId, retiradaEm, almoxarifeId, devolvidaEm, resultado, observacao, extraviadaEm)
    .run();
  return Number(meta.last_row_id);
}

let almoxarifeId = 0;
let ana = 0;
let bruno = 0;
let carlos = 0;

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM problemas'),
    env.DB.prepare('DELETE FROM retiradas'),
    env.DB.prepare('DELETE FROM funcionarios'),
    env.DB.prepare('DELETE FROM ferramentas'),
    env.DB.prepare('DELETE FROM sessoes'),
    env.DB.prepare('DELETE FROM usuarios'),
  ]);

  const { meta } = await env.DB.prepare(
    "INSERT INTO usuarios (email, nome, papel, senha_hash, ativo) VALUES ('almoxarife@tropical.test', 'Almoxarife', 'almoxarife', 'x', 1)",
  ).run();
  almoxarifeId = Number(meta.last_row_id);

  ana = await inserirFuncionario('Ana');
  bruno = await inserirFuncionario('Bruno');
  carlos = await inserirFuncionario('Carlos');

  for (const numero of ['F-001', 'F-002', 'F-003', 'F-004', 'F-007', 'F-008', 'F-009']) {
    await inserirFerramenta(numero);
  }
  await inserirFerramenta('F-005', 'com_problema');
  await inserirFerramenta('F-006', 'extraviada');

  // Em aberto. Segunda 26/10 10h SP: prazo segunda 19h, já passou. Atrasada.
  await inserirRetirada('F-009', ana, '2026-10-26T13:00:00.000Z');
  // Terça 27/10 10h SP: prazo terça 19h, já passou. Atrasada.
  await inserirRetirada('F-001', bruno, '2026-10-27T13:00:00.000Z');
  // Terça 27/10 19h10 SP: depois do fechamento, prazo quarta 19h. Fora.
  await inserirRetirada('F-002', ana, '2026-10-27T22:10:00.000Z');
  // Terça 27/10 22h30 SP (quarta 01h30 UTC): conta como terça, não como hoje. Fora.
  await inserirRetirada('F-008', ana, '2026-10-28T01:30:00.000Z');
  // Quarta 28/10 8h SP: hoje. Fora.
  await inserirRetirada('F-007', bruno, '2026-10-28T11:00:00.000Z');

  // Devolvida OK na própria terça.
  await inserirRetirada('F-004', bruno, '2026-10-27T13:00:00.000Z', '2026-10-27T14:00:00.000Z', 'ok');
  // Devolvida Com Problema, com descrição e Problema aguardando destino.
  const retiradaComProblema = await inserirRetirada(
    'F-005',
    ana,
    '2026-10-27T15:00:00.000Z',
    '2026-10-27T16:00:00.000Z',
    'com_problema',
    'Broca quebrada',
  );
  await env.DB.prepare(
    'INSERT INTO problemas (ferramenta_numero, retirada_id, funcionario_id, descricao, registrado_em) VALUES (?, ?, ?, ?, ?)',
  )
    .bind('F-005', retiradaComProblema, ana, 'Broca quebrada', '2026-10-27T16:00:00.000Z')
    .run();
  // Extraviada na terça: a Retirada encerra sem Devolução e o Responsável fica registrado.
  await inserirRetirada('F-006', bruno, '2026-10-27T12:00:00.000Z', null, 'extraviada', null, '2026-10-27T17:00:00.000Z');

  // Carlos, em setembro: fora da janela de 30 dias, não entra no ranking.
  await inserirRetirada('F-003', carlos, '2026-09-01T13:00:00.000Z', '2026-09-01T14:00:00.000Z', 'ok');
  await inserirRetirada('F-003', carlos, '2026-09-02T13:00:00.000Z', '2026-09-02T14:00:00.000Z', 'ok');
  await inserirRetirada('F-003', carlos, '2026-09-03T13:00:00.000Z', '2026-09-03T14:00:00.000Z', 'ok');
});

describe('indicadores do Painel', () => {
  it('cada indicador bate com o cenário montado', async () => {
    const { indicadores } = await buscarPainel();

    expect(indicadores).toEqual({
      foraAgora: 3,
      atrasadas: 2,
      comProblema: 1,
      noAlmoxarifado: 2,
      retiradasHoje: 1,
      funcionariosComFerramenta: 2,
    });
  });

  it('"Retiradas hoje" usa o dia de São Paulo, não o de UTC', async () => {
    // F-008 foi retirada às 22h30 de terça em SP (01h30 UTC de quarta): não conta como hoje.
    const { indicadores } = await buscarPainel();
    expect(indicadores.retiradasHoje).toBe(1);
  });
});

describe('Retiradas Atrasadas', () => {
  it('vêm da mais antiga para a mais nova', async () => {
    const { atrasadas } = await buscarPainel();

    expect(atrasadas.map((item) => item.ferramenta.numero)).toEqual(['F-009', 'F-001']);
    expect(atrasadas[0]).toEqual({
      ferramenta: { numero: 'F-009', nome: 'Ferramenta F-009' },
      responsavel: { id: ana, nome: 'Ana' },
      retiradaEm: '2026-10-26T13:00:00.000Z',
    });
  });
});

describe('últimas atividades', () => {
  it('vêm da mais recente para a mais antiga, com tipo, Funcionário e descrição', async () => {
    const { atividades } = await buscarPainel();

    expect(atividades.slice(0, 6).map((item) => [item.tipo, item.ferramenta.numero])).toEqual([
      ['retirada', 'F-007'],
      ['retirada', 'F-008'],
      ['retirada', 'F-002'],
      ['extraviada', 'F-006'],
      ['devolucao_com_problema', 'F-005'],
      ['retirada', 'F-005'],
    ]);

    const problema = atividades.find((item) => item.tipo === 'devolucao_com_problema');
    expect(problema).toMatchObject({ descricao: 'Broca quebrada', funcionario: { id: ana, nome: 'Ana' } });
  });

  it('uma Devolução OK aparece como devolucao_ok', async () => {
    const { atividades } = await buscarPainel();
    const devolucao = atividades.find((item) => item.tipo === 'devolucao_ok');

    expect(devolucao).toMatchObject({ ferramenta: { numero: 'F-004' }, em: '2026-10-27T14:00:00.000Z' });
  });
});

describe('mais retiradas nos últimos 30 dias', () => {
  it('conta só as Retiradas da janela, em ordem decrescente, com desempate por nome', async () => {
    const { maisRetiradas } = await buscarPainel();

    // Ana e Bruno têm 4 cada; Carlos só tem Retiradas de setembro, fora da janela.
    expect(maisRetiradas).toEqual([
      { funcionario: { id: ana, nome: 'Ana' }, total: 4 },
      { funcionario: { id: bruno, nome: 'Bruno' }, total: 4 },
    ]);
  });
});
