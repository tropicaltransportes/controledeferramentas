import { SELF, env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { gerarHashSenha } from '../src/senha';

const SENHA = 'senha-forte-123';

async function criarUsuario(email: string, papel: 'almoxarife' | 'gestor'): Promise<void> {
  const hash = await gerarHashSenha(SENHA);
  await env.DB.prepare(
    'INSERT INTO usuarios (email, nome, papel, senha_hash, ativo) VALUES (?, ?, ?, ?, 1)',
  )
    .bind(email, `Nome de ${papel}`, papel, hash)
    .run();
}

async function tokenDe(email: string): Promise<string> {
  const resposta = await SELF.fetch('https://api.test/entrar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, senha: SENHA }),
  });
  return ((await resposta.json()) as { token: string }).token;
}

function comToken(token: string, metodo = 'GET', caminho = '/', corpo?: unknown): Promise<Response> {
  return SELF.fetch(`https://api.test${caminho}`, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
}

async function cadastrarFerramenta(numero: string): Promise<void> {
  await comToken(token, 'POST', '/ferramentas', { numero, nome: `Ferramenta ${numero}`, categoria: 'Mecânica' });
}

async function cadastrarFuncionario(nome: string): Promise<number> {
  const resposta = await comToken(token, 'POST', '/funcionarios', { nome });
  return ((await resposta.json()) as { id: number }).id;
}

function retirar(funcionarioId: number, numeros: string[], tokenDoUso = token): Promise<Response> {
  return comToken(tokenDoUso, 'POST', '/retiradas', { funcionarioId, numeros });
}

function devolver(corpo: unknown, tokenDoUso = token): Promise<Response> {
  return comToken(tokenDoUso, 'POST', '/devolucoes', corpo);
}

async function ficha(numero: string): Promise<{ situacao: string; responsavel: { nome: string } | null }> {
  return (await comToken(token, 'GET', `/ferramentas/${numero}`)).json();
}

let token = '';
let tokenGestor = '';

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM problemas'),
    env.DB.prepare('DELETE FROM retiradas'),
    env.DB.prepare('DELETE FROM funcionarios'),
    env.DB.prepare('DELETE FROM ferramentas'),
    env.DB.prepare('DELETE FROM sessoes'),
    env.DB.prepare('DELETE FROM usuarios'),
  ]);
  await criarUsuario('almoxarife@tropical.test', 'almoxarife');
  await criarUsuario('gestor@tropical.test', 'gestor');
  token = await tokenDe('almoxarife@tropical.test');
  tokenGestor = await tokenDe('gestor@tropical.test');
});

describe('POST /devolucoes', () => {
  it('devolução OK encerra a Retirada e a Ferramenta volta a No almoxarifado', async () => {
    await cadastrarFerramenta('F-001');
    const funcionarioId = await cadastrarFuncionario('Carlos Silva');
    await retirar(funcionarioId, ['F-001']);

    const resposta = await devolver({ numero: 'F-001', resultado: 'ok' });

    expect(resposta.status).toBe(201);
    expect(await ficha('F-001')).toMatchObject({ situacao: 'no_almoxarifado', responsavel: null });
  });

  it('aceita o Número digitado só com dígitos (1 vira F-001)', async () => {
    await cadastrarFerramenta('F-001');
    const funcionarioId = await cadastrarFuncionario('Carlos Silva');
    await retirar(funcionarioId, ['F-001']);

    const resposta = await devolver({ numero: '1', resultado: 'ok' });

    expect(resposta.status).toBe(201);
    expect(await ficha('F-001')).toMatchObject({ situacao: 'no_almoxarifado' });
  });

  it('Com Problema sem descrição responde 422 e não muda nada', async () => {
    await cadastrarFerramenta('F-001');
    const funcionarioId = await cadastrarFuncionario('Carlos Silva');
    await retirar(funcionarioId, ['F-001']);

    const semDescricao = await devolver({ numero: 'F-001', resultado: 'com_problema', descricao: '   ' });

    expect(semDescricao.status).toBe(422);
    expect(await ficha('F-001')).toMatchObject({ situacao: 'fora', responsavel: { nome: 'Carlos Silva' } });
  });

  it('Com Problema com descrição deixa a Ferramenta Com Problema e cria um Problema aguardando destino', async () => {
    await cadastrarFerramenta('F-001');
    const funcionarioId = await cadastrarFuncionario('Carlos Silva');
    await retirar(funcionarioId, ['F-001']);

    const resposta = await devolver({ numero: 'F-001', resultado: 'com_problema', descricao: 'Cabo partido' });
    const historico = (await (await comToken(token, 'GET', '/ferramentas/F-001/historico')).json()) as {
      problemas: { descricao: string; responsavel: { id: number; nome: string }; destino: string | null }[];
    };

    expect(resposta.status).toBe(201);
    expect(await ficha('F-001')).toMatchObject({ situacao: 'com_problema', responsavel: null });
    expect(historico.problemas).toEqual([
      expect.objectContaining({
        descricao: 'Cabo partido',
        responsavel: { id: funcionarioId, nome: 'Carlos Silva' },
        destino: null,
      }),
    ]);
  });

  it('o Responsável do Problema é sempre o da Retirada aberta, mesmo após repasse', async () => {
    await cadastrarFerramenta('F-001');
    const carlos = await cadastrarFuncionario('Carlos Silva');
    await cadastrarFuncionario('Ana Souza');
    await retirar(carlos, ['F-001']);

    await devolver({ numero: 'F-001', resultado: 'com_problema', descricao: 'Trinca no corpo' });
    const historico = (await (await comToken(token, 'GET', '/ferramentas/F-001/historico')).json()) as {
      problemas: { responsavel: { nome: string } }[];
    };

    expect(historico.problemas[0].responsavel.nome).toBe('Carlos Silva');
  });

  it('devolver Ferramenta que não está fora responde 409', async () => {
    await cadastrarFerramenta('F-001');

    const resposta = await devolver({ numero: 'F-001', resultado: 'ok' });

    expect(resposta.status).toBe(409);
  });

  it('devolver Ferramenta já devolvida responde 409 e não cria outro Problema', async () => {
    await cadastrarFerramenta('F-001');
    const funcionarioId = await cadastrarFuncionario('Carlos Silva');
    await retirar(funcionarioId, ['F-001']);
    await devolver({ numero: 'F-001', resultado: 'com_problema', descricao: 'Cabo partido' });

    const segunda = await devolver({ numero: 'F-001', resultado: 'com_problema', descricao: 'Outra coisa' });
    const problemas = await env.DB.prepare('SELECT COUNT(*) AS total FROM problemas').first<{ total: number }>();

    expect(segunda.status).toBe(409);
    expect(problemas?.total).toBe(1);
  });

  it('resultado desconhecido responde 422', async () => {
    await cadastrarFerramenta('F-001');
    const funcionarioId = await cadastrarFuncionario('Carlos Silva');
    await retirar(funcionarioId, ['F-001']);

    const resposta = await devolver({ numero: 'F-001', resultado: 'talvez' });

    expect(resposta.status).toBe(422);
  });

  it('recusa Devolução feita pelo Gestor com 403', async () => {
    await cadastrarFerramenta('F-001');
    const funcionarioId = await cadastrarFuncionario('Carlos Silva');
    await retirar(funcionarioId, ['F-001']);

    const resposta = await devolver({ numero: 'F-001', resultado: 'ok' }, tokenGestor);

    expect(resposta.status).toBe(403);
    expect(await ficha('F-001')).toMatchObject({ situacao: 'fora' });
  });

  it('exige sessão', async () => {
    const resposta = await SELF.fetch('https://api.test/devolucoes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ numero: 'F-001', resultado: 'ok' }),
    });

    expect(resposta.status).toBe(401);
  });
});

describe('Histórico', () => {
  it('a Ficha lista as Retiradas mais recentes primeiro e os números de uso batem', async () => {
    await cadastrarFerramenta('F-001');
    const carlos = await cadastrarFuncionario('Carlos Silva');
    const ana = await cadastrarFuncionario('Ana Souza');
    await retirar(carlos, ['F-001']);
    await devolver({ numero: 'F-001', resultado: 'ok' });
    await retirar(ana, ['F-001']);
    await devolver({ numero: 'F-001', resultado: 'com_problema', descricao: 'Cabo partido' });

    const historico = (await (await comToken(token, 'GET', '/ferramentas/F-001/historico')).json()) as {
      retiradas: { funcionario: { nome: string }; resultado: string | null }[];
      problemas: unknown[];
      resumo: { totalRetiradas: number; totalProblemas: number; funcionariosQueUsaram: number };
    };

    expect(historico.retiradas.map((item) => [item.funcionario.nome, item.resultado])).toEqual([
      ['Ana Souza', 'com_problema'],
      ['Carlos Silva', 'ok'],
    ]);
    expect(historico.problemas).toHaveLength(1);
    expect(historico.resumo).toMatchObject({ totalRetiradas: 2, totalProblemas: 1, funcionariosQueUsaram: 2 });
  });

  it('o perfil do Funcionário lista as Retiradas dele, com a Ferramenta e o resultado', async () => {
    await cadastrarFerramenta('F-001');
    await cadastrarFerramenta('F-002');
    const ana = await cadastrarFuncionario('Ana Souza');
    await retirar(ana, ['F-001', 'F-002']);
    await devolver({ numero: 'F-002', resultado: 'ok' });

    const perfil = (await (await comToken(token, 'GET', `/funcionarios/${ana}`)).json()) as {
      historico: { ferramenta: { numero: string }; resultado: string | null; devolvidaEm: string | null }[];
    };

    expect(perfil.historico.map((item) => [item.ferramenta.numero, item.resultado])).toEqual([
      ['F-002', 'ok'],
      ['F-001', null],
    ]);
    expect(perfil.historico[1].devolvidaEm).toBeNull();
  });

  it('histórico de Ferramenta inexistente responde 404', async () => {
    const resposta = await comToken(token, 'GET', '/ferramentas/F-999/historico');

    expect(resposta.status).toBe(404);
  });
});
