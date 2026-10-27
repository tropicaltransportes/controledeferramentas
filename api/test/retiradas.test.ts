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

async function ficha(numero: string): Promise<{ situacao: string; responsavel: { nome: string } | null }> {
  return (await comToken(token, 'GET', `/ferramentas/${numero}`)).json();
}

let token = '';
let tokenGestor = '';

beforeEach(async () => {
  await env.DB.batch([
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

describe('POST /retiradas', () => {
  it('registra a Retirada de uma Ferramenta: ela fica Fora, com o Responsável', async () => {
    await cadastrarFerramenta('F-001');
    const funcionarioId = await cadastrarFuncionario('Carlos Silva');

    const resposta = await retirar(funcionarioId, ['F-001']);

    expect(resposta.status).toBe(201);
    expect(await ficha('F-001')).toMatchObject({
      situacao: 'fora',
      responsavel: { nome: 'Carlos Silva', retiradaEm: '2026-10-27T12:00:00.000Z' },
    });
  });

  it('registra várias Ferramentas de uma vez', async () => {
    await cadastrarFerramenta('F-001');
    await cadastrarFerramenta('F-002');
    const funcionarioId = await cadastrarFuncionario('Ana Souza');

    const resposta = await retirar(funcionarioId, ['F-001', 'F-002']);

    expect(resposta.status).toBe(201);
    expect(await ficha('F-001')).toMatchObject({ situacao: 'fora', responsavel: { nome: 'Ana Souza' } });
    expect(await ficha('F-002')).toMatchObject({ situacao: 'fora', responsavel: { nome: 'Ana Souza' } });
  });

  it('aceita o Número digitado só com dígitos (23 vira F-023)', async () => {
    await cadastrarFerramenta('F-023');
    const funcionarioId = await cadastrarFuncionario('Ana Souza');

    const resposta = await retirar(funcionarioId, ['23']);

    expect(resposta.status).toBe(201);
    expect(await ficha('F-023')).toMatchObject({ situacao: 'fora' });
  });

  it('responde 409 com o nome de quem está com a Ferramenta e não registra nenhuma da lista', async () => {
    await cadastrarFerramenta('F-001');
    await cadastrarFerramenta('F-002');
    const carlos = await cadastrarFuncionario('Carlos Silva');
    const ana = await cadastrarFuncionario('Ana Souza');
    await retirar(carlos, ['F-001']);

    const resposta = await retirar(ana, ['F-002', 'F-001']);

    expect(resposta.status).toBe(409);
    expect(await resposta.json()).toMatchObject({ erro: expect.stringContaining('Carlos Silva') });
    expect(await ficha('F-002')).toMatchObject({ situacao: 'no_almoxarifado' });
  });

  it('responde 409 para Ferramenta Com Problema, Baixada, Extraviada ou inexistente', async () => {
    await cadastrarFerramenta('F-001');
    await cadastrarFerramenta('F-002');
    await cadastrarFerramenta('F-003');
    await env.DB.batch([
      env.DB.prepare("UPDATE ferramentas SET estado = 'com_problema' WHERE numero = 'F-001'"),
      env.DB.prepare("UPDATE ferramentas SET estado = 'baixada' WHERE numero = 'F-002'"),
      env.DB.prepare("UPDATE ferramentas SET estado = 'extraviada' WHERE numero = 'F-003'"),
    ]);
    const funcionarioId = await cadastrarFuncionario('Ana Souza');

    const comProblema = await retirar(funcionarioId, ['F-001']);
    const baixada = await retirar(funcionarioId, ['F-002']);
    const extraviada = await retirar(funcionarioId, ['F-003']);
    const inexistente = await retirar(funcionarioId, ['F-999']);

    expect([comProblema.status, baixada.status, extraviada.status, inexistente.status]).toEqual([409, 409, 409, 409]);
  });

  it('recusa Funcionário inativo com 422', async () => {
    await cadastrarFerramenta('F-001');
    const funcionarioId = await cadastrarFuncionario('Marcos Lima');
    await comToken(token, 'PUT', `/funcionarios/${funcionarioId}`, { ativo: false });

    const resposta = await retirar(funcionarioId, ['F-001']);

    expect(resposta.status).toBe(422);
  });

  it('recusa Retirada feita pelo Gestor com 403', async () => {
    await cadastrarFerramenta('F-001');
    const funcionarioId = await cadastrarFuncionario('Ana Souza');

    const resposta = await retirar(funcionarioId, ['F-001'], tokenGestor);

    expect(resposta.status).toBe(403);
  });

  it('recusa lista vazia de Ferramentas com 422', async () => {
    const funcionarioId = await cadastrarFuncionario('Ana Souza');

    const resposta = await retirar(funcionarioId, []);

    expect(resposta.status).toBe(422);
  });

  it('exige sessão', async () => {
    const resposta = await SELF.fetch('https://api.test/retiradas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ funcionarioId: 1, numeros: ['F-001'] }),
    });

    expect(resposta.status).toBe(401);
  });
});

describe('Posse e Funcionários', () => {
  it('mostra no perfil as Ferramentas em posse e na lista a contagem', async () => {
    await cadastrarFerramenta('F-001');
    await cadastrarFerramenta('F-002');
    const funcionarioId = await cadastrarFuncionario('Ana Souza');
    await retirar(funcionarioId, ['F-001', 'F-002']);

    const perfil = (await (await comToken(token, 'GET', `/funcionarios/${funcionarioId}`)).json()) as {
      retiradasAbertas: number;
      ferramentasEmPosse: { numero: string }[];
    };
    const lista = (await (await comToken(token, 'GET', '/funcionarios')).json()) as {
      itens: { nome: string; retiradasAbertas: number }[];
    };

    expect(perfil.retiradasAbertas).toBe(2);
    expect(perfil.ferramentasEmPosse.map((ferramenta) => ferramenta.numero)).toEqual(['F-001', 'F-002']);
    expect(lista.itens).toEqual([expect.objectContaining({ nome: 'Ana Souza', retiradasAbertas: 2 })]);
  });

  it('filtro Fora lista só as Ferramentas em posse', async () => {
    await cadastrarFerramenta('F-001');
    await cadastrarFerramenta('F-002');
    const funcionarioId = await cadastrarFuncionario('Ana Souza');
    await retirar(funcionarioId, ['F-001']);

    const resposta = (await (await comToken(token, 'GET', '/ferramentas?situacao=fora')).json()) as {
      itens: { numero: string }[];
    };

    expect(resposta.itens.map((ferramenta) => ferramenta.numero)).toEqual(['F-001']);
  });

  it('inativar Funcionário com posse é permitido, informa as Retiradas abertas e as mantém visíveis', async () => {
    await cadastrarFerramenta('F-001');
    await cadastrarFerramenta('F-002');
    const funcionarioId = await cadastrarFuncionario('Ana Souza');
    await retirar(funcionarioId, ['F-001', 'F-002']);

    const resposta = await comToken(token, 'PUT', `/funcionarios/${funcionarioId}`, { ativo: false });
    const perfil = (await (await comToken(token, 'GET', `/funcionarios/${funcionarioId}`)).json()) as {
      ativo: boolean;
      ferramentasEmPosse: { numero: string }[];
    };

    expect(await resposta.json()).toMatchObject({ ativo: false, retiradasAbertas: 2 });
    expect(perfil.ativo).toBe(false);
    expect(perfil.ferramentasEmPosse).toHaveLength(2);
    expect(await ficha('F-001')).toMatchObject({ situacao: 'fora' });
  });
});
