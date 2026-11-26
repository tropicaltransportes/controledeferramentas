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

function retirar(funcionarioId: number, numeros: string[]): Promise<Response> {
  return comToken(token, 'POST', '/retiradas', { funcionarioId, numeros });
}

function devolverComProblema(numero: string, descricao: string): Promise<Response> {
  return comToken(token, 'POST', '/devolucoes', { numero, resultado: 'com_problema', descricao });
}

function acao(numero: string, nome: 'extraviar' | 'liberar' | 'baixar', tokenDoUso = token): Promise<Response> {
  return comToken(tokenDoUso, 'POST', `/ferramentas/${numero}/${nome}`);
}

async function ficha(numero: string): Promise<{ situacao: string; responsavel: { nome: string } | null }> {
  return (await comToken(token, 'GET', `/ferramentas/${numero}`)).json();
}

async function listar(situacao: string): Promise<string[]> {
  const corpo = (await (await comToken(token, 'GET', `/ferramentas?situacao=${situacao}`)).json()) as {
    itens: { numero: string }[];
  };
  return corpo.itens.map((item) => item.numero);
}

async function historico(numero: string): Promise<{
  retiradas: { resultado: string | null; devolvidaEm: string | null; funcionario: { nome: string } }[];
  problemas: { destino: string | null; destinoEm: string | null }[];
}> {
  return (await comToken(token, 'GET', `/ferramentas/${numero}/historico`)).json();
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

describe('POST /ferramentas/:numero/extraviar', () => {
  it('encerra a Retirada sem Devolução, tira a Ferramenta da posse e mantém o Responsável no histórico', async () => {
    await cadastrarFerramenta('F-001');
    const carlos = await cadastrarFuncionario('Carlos Silva');
    await retirar(carlos, ['F-001']);

    const resposta = await acao('F-001', 'extraviar');
    const retiradas = (await historico('F-001')).retiradas;

    expect(resposta.status).toBe(200);
    expect(await ficha('F-001')).toMatchObject({ situacao: 'extraviada', responsavel: null });
    expect(retiradas).toEqual([
      expect.objectContaining({
        resultado: 'extraviada',
        funcionario: expect.objectContaining({ nome: 'Carlos Silva' }),
      }),
    ]);
    expect(retiradas[0].devolvidaEm).not.toBeNull();
  });

  it('a Ferramenta extraviada sai de Todas e aparece no filtro Baixadas / Extraviadas', async () => {
    await cadastrarFerramenta('F-001');
    await cadastrarFerramenta('F-002');
    const carlos = await cadastrarFuncionario('Carlos Silva');
    await retirar(carlos, ['F-001']);
    await acao('F-001', 'extraviar');

    expect(await listar('todas')).toEqual(['F-002']);
    expect(await listar('baixadas_extraviadas')).toEqual(['F-001']);
  });

  it('Ferramenta sem Retirada aberta responde 409', async () => {
    await cadastrarFerramenta('F-001');

    expect((await acao('F-001', 'extraviar')).status).toBe(409);
    expect(await ficha('F-001')).toMatchObject({ situacao: 'no_almoxarifado' });
  });

  it('Ferramenta Com Problema não pode ser extraviada (sem Retirada aberta, 409)', async () => {
    await cadastrarFerramenta('F-001');
    const carlos = await cadastrarFuncionario('Carlos Silva');
    await retirar(carlos, ['F-001']);
    await devolverComProblema('F-001', 'Cabo partido');

    expect((await acao('F-001', 'extraviar')).status).toBe(409);
    expect(await ficha('F-001')).toMatchObject({ situacao: 'com_problema' });
  });

  it('Gestor recebe 403 e nada muda', async () => {
    await cadastrarFerramenta('F-001');
    const carlos = await cadastrarFuncionario('Carlos Silva');
    await retirar(carlos, ['F-001']);

    expect((await acao('F-001', 'extraviar', tokenGestor)).status).toBe(403);
    expect(await ficha('F-001')).toMatchObject({ situacao: 'fora' });
  });

  it('Ferramenta inexistente responde 404', async () => {
    expect((await acao('F-999', 'extraviar')).status).toBe(404);
  });
});

describe('POST /ferramentas/:numero/liberar', () => {
  it('Ferramenta Com Problema volta a circular, o Problema fica Liberada e a Ferramenta pode ser retirada de novo', async () => {
    await cadastrarFerramenta('F-001');
    const carlos = await cadastrarFuncionario('Carlos Silva');
    const ana = await cadastrarFuncionario('Ana Souza');
    await retirar(carlos, ['F-001']);
    await devolverComProblema('F-001', 'Cabo partido');

    const resposta = await acao('F-001', 'liberar');
    const novaRetirada = await retirar(ana, ['F-001']);

    expect(resposta.status).toBe(200);
    expect(await ficha('F-001')).toMatchObject({ situacao: 'fora', responsavel: { nome: 'Ana Souza' } });
    expect(novaRetirada.status).toBe(201);
    expect((await historico('F-001')).problemas).toEqual([
      expect.objectContaining({ destino: 'liberada' }),
    ]);
  });

  it('Ferramenta que não está Com Problema responde 409', async () => {
    await cadastrarFerramenta('F-001');

    expect((await acao('F-001', 'liberar')).status).toBe(409);
  });

  it('Gestor recebe 403', async () => {
    await cadastrarFerramenta('F-001');
    const carlos = await cadastrarFuncionario('Carlos Silva');
    await retirar(carlos, ['F-001']);
    await devolverComProblema('F-001', 'Cabo partido');

    expect((await acao('F-001', 'liberar', tokenGestor)).status).toBe(403);
    expect(await ficha('F-001')).toMatchObject({ situacao: 'com_problema' });
  });
});

describe('POST /ferramentas/:numero/baixar', () => {
  it('Ferramenta Com Problema é Baixada: sai de Todas, o Problema fica Baixada e a Retirada volta a ser recusada', async () => {
    await cadastrarFerramenta('F-001');
    const carlos = await cadastrarFuncionario('Carlos Silva');
    await retirar(carlos, ['F-001']);
    await devolverComProblema('F-001', 'Cabo partido');

    const resposta = await acao('F-001', 'baixar');
    const novaRetirada = await retirar(carlos, ['F-001']);

    expect(resposta.status).toBe(200);
    expect(await ficha('F-001')).toMatchObject({ situacao: 'baixada', responsavel: null });
    expect(await listar('todas')).toEqual([]);
    expect(await listar('baixadas_extraviadas')).toEqual(['F-001']);
    expect((await historico('F-001')).problemas).toEqual([expect.objectContaining({ destino: 'baixada' })]);
    expect(novaRetirada.status).toBe(409);
  });

  it('Ferramenta que não está Com Problema responde 409', async () => {
    await cadastrarFerramenta('F-001');

    expect((await acao('F-001', 'baixar')).status).toBe(409);
    expect(await ficha('F-001')).toMatchObject({ situacao: 'no_almoxarifado' });
  });

  it('Gestor recebe 403', async () => {
    await cadastrarFerramenta('F-001');
    const carlos = await cadastrarFuncionario('Carlos Silva');
    await retirar(carlos, ['F-001']);
    await devolverComProblema('F-001', 'Cabo partido');

    expect((await acao('F-001', 'baixar', tokenGestor)).status).toBe(403);
  });
});

describe('Ações de destino exigem sessão', () => {
  it('responde 401 sem token', async () => {
    await cadastrarFerramenta('F-001');

    const resposta = await SELF.fetch('https://api.test/ferramentas/F-001/baixar', { method: 'POST' });

    expect(resposta.status).toBe(401);
  });
});
