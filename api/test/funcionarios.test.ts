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

function comToken(token: string, metodo = 'GET', caminho = '/funcionarios', corpo?: unknown): Promise<Response> {
  return SELF.fetch(`https://api.test${caminho}`, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
}

let token = '';

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM funcionarios'),
    env.DB.prepare('DELETE FROM sessoes'),
    env.DB.prepare('DELETE FROM usuarios'),
  ]);
  await criarUsuario('almoxarife@tropical.test', 'almoxarife');
  await criarUsuario('gestor@tropical.test', 'gestor');
  token = await tokenDe('almoxarife@tropical.test');
});

describe('POST /funcionarios', () => {
  it('cadastra o Funcionário como ativo, com função opcional', async () => {
    const resposta = await comToken(token, 'POST', '/funcionarios', { nome: '  Carlos Silva ', funcao: 'Mecânico' });

    expect(resposta.status).toBe(201);
    expect(await resposta.json()).toEqual({
      id: expect.any(Number),
      nome: 'Carlos Silva',
      funcao: 'Mecânico',
      ativo: true,
      retiradasAbertas: 0,
    });
  });

  it('aceita Funcionário sem função', async () => {
    const resposta = await comToken(token, 'POST', '/funcionarios', { nome: 'Ana Souza' });

    expect(await resposta.json()).toMatchObject({ nome: 'Ana Souza', funcao: null });
  });

  it('recusa Funcionário sem nome com 422', async () => {
    const resposta = await comToken(token, 'POST', '/funcionarios', { nome: '   ' });

    expect(resposta.status).toBe(422);
  });

  it('permite cadastro ao Gestor', async () => {
    const tokenGestor = await tokenDe('gestor@tropical.test');

    const resposta = await comToken(tokenGestor, 'POST', '/funcionarios', { nome: 'Bruno' });

    expect(resposta.status).toBe(201);
  });

  it('exige sessão', async () => {
    const resposta = await SELF.fetch('https://api.test/funcionarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: 'Sem Sessão' }),
    });

    expect(resposta.status).toBe(401);
  });
});

describe('GET /funcionarios', () => {
  beforeEach(async () => {
    await comToken(token, 'POST', '/funcionarios', { nome: 'Carlos Silva', funcao: 'Mecânico' });
    await comToken(token, 'POST', '/funcionarios', { nome: 'Ana Souza' });
    const inativa = await comToken(token, 'POST', '/funcionarios', { nome: 'Marcos Lima' });
    const { id } = (await inativa.json()) as { id: number };
    await comToken(token, 'PUT', `/funcionarios/${id}`, { ativo: false });
  });

  it('lista ativos e inativos, com o indicador de ativo', async () => {
    const resposta = await comToken(token);
    const { itens } = (await resposta.json()) as { itens: { nome: string; ativo: boolean }[] };

    expect(itens.map((item) => [item.nome, item.ativo])).toEqual([
      ['Ana Souza', true],
      ['Carlos Silva', true],
      ['Marcos Lima', false],
    ]);
  });

  it('busca por nome, sem diferenciar maiúsculas', async () => {
    const resposta = await comToken(token, 'GET', '/funcionarios?texto=CARLOS');
    const { itens } = (await resposta.json()) as { itens: { nome: string }[] };

    expect(itens.map((item) => item.nome)).toEqual(['Carlos Silva']);
  });

  it('exige sessão', async () => {
    const resposta = await SELF.fetch('https://api.test/funcionarios');

    expect(resposta.status).toBe(401);
  });
});

describe('GET /funcionarios/:id e PUT /funcionarios/:id', () => {
  let id = 0;

  beforeEach(async () => {
    const criado = await comToken(token, 'POST', '/funcionarios', { nome: 'Carlos Silva', funcao: 'Mecânico' });
    id = ((await criado.json()) as { id: number }).id;
  });

  it('abre o perfil do Funcionário', async () => {
    const resposta = await comToken(token, 'GET', `/funcionarios/${id}`);

    expect(await resposta.json()).toEqual({
      id,
      nome: 'Carlos Silva',
      funcao: 'Mecânico',
      ativo: true,
      retiradasAbertas: 0,
      ferramentasEmPosse: [],
    });
  });

  it('edita nome e função e mantém os demais campos', async () => {
    const resposta = await comToken(token, 'PUT', `/funcionarios/${id}`, { funcao: 'Eletricista' });

    expect(await resposta.json()).toMatchObject({ nome: 'Carlos Silva', funcao: 'Eletricista', ativo: true });
  });

  it('inativa e reativa, refletindo no perfil', async () => {
    const inativou = await comToken(token, 'PUT', `/funcionarios/${id}`, { ativo: false });
    const perfilInativo = await (await comToken(token, 'GET', `/funcionarios/${id}`)).json();

    const reativou = await comToken(token, 'PUT', `/funcionarios/${id}`, { ativo: true });

    expect(inativou.status).toBe(200);
    expect(await inativou.json()).toMatchObject({ ativo: false, retiradasAbertas: 0 });
    expect(perfilInativo).toMatchObject({ ativo: false });
    expect(await reativou.json()).toMatchObject({ ativo: true });
  });

  it('recusa situação que não seja verdadeiro ou falso com 422', async () => {
    const resposta = await comToken(token, 'PUT', `/funcionarios/${id}`, { ativo: 'false' });

    expect(resposta.status).toBe(422);
  });

  it('recusa edição com nome vazio com 422', async () => {
    const resposta = await comToken(token, 'PUT', `/funcionarios/${id}`, { nome: '' });

    expect(resposta.status).toBe(422);
  });

  it('responde 404 para Funcionário inexistente', async () => {
    const resposta = await comToken(token, 'GET', '/funcionarios/9999');

    expect(resposta.status).toBe(404);
  });
});
