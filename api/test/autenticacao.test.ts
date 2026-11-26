import { SELF, env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { atender } from '../src/app';
import type { Env } from '../src/env';
import { gerarHashSenha } from '../src/senha';

const AGORA = '2026-10-27T12:00:00.000Z';
const TRINTA_DIAS_MS = 30 * 24 * 60 * 60 * 1000;
const SENHA = 'senha-forte-123';

async function criarUsuario(
  email: string,
  papel: 'almoxarife' | 'gestor',
  opcoes: { ativo?: boolean; senha?: string } = {},
): Promise<void> {
  const hash = await gerarHashSenha(opcoes.senha ?? SENHA);
  await env.DB.prepare(
    'INSERT INTO usuarios (email, nome, papel, senha_hash, ativo) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(email, `Nome de ${papel}`, papel, hash, opcoes.ativo === false ? 0 : 1)
    .run();
}

function entrar(email: string, senha = SENHA, ambiente: Env = env): Promise<Response> {
  return atender(
    new Request('https://api.test/entrar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, senha }),
    }),
    ambiente,
  );
}

async function tokenDe(email: string, senha = SENHA): Promise<string> {
  const resposta = await entrar(email, senha);
  const corpo = (await resposta.json()) as { token: string };
  return corpo.token;
}

function comToken(token: string, metodo = 'GET', caminho = '/eu', corpo?: unknown): Promise<Response> {
  return SELF.fetch(`https://api.test${caminho}`, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
}

beforeEach(async () => {
  await env.DB.batch([env.DB.prepare('DELETE FROM sessoes'), env.DB.prepare('DELETE FROM usuarios')]);
  await criarUsuario('almoxarife@tropical.test', 'almoxarife');
  await criarUsuario('gestor@tropical.test', 'gestor');
});

describe('POST /entrar', () => {
  it('devolve token, usuário e expiração de 30 dias para credenciais válidas', async () => {
    const resposta = await entrar('almoxarife@tropical.test');

    expect(resposta.status).toBe(200);
    const corpo = (await resposta.json()) as Record<string, unknown>;
    expect(typeof corpo.token).toBe('string');
    expect(corpo.usuario).toEqual({
      id: expect.any(Number),
      nome: 'Nome de almoxarife',
      email: 'almoxarife@tropical.test',
      papel: 'almoxarife',
    });
    expect(corpo.expiraEm).toBe(new Date(Date.parse(AGORA) + TRINTA_DIAS_MS).toISOString());
  });

  it('aceita o e-mail sem diferença de maiúsculas e espaços', async () => {
    const resposta = await entrar('  Almoxarife@Tropical.TEST ');

    expect(resposta.status).toBe(200);
  });

  it('responde 401 com a mesma mensagem para senha errada e e-mail inexistente', async () => {
    const senhaErrada = await entrar('almoxarife@tropical.test', 'errada-000');
    const emailInexistente = await entrar('ninguem@tropical.test');

    expect(senhaErrada.status).toBe(401);
    expect(emailInexistente.status).toBe(401);
    expect(await senhaErrada.json()).toEqual(await emailInexistente.json());
  });

  it('não deixa entrar um usuário inativo', async () => {
    await criarUsuario('afastado@tropical.test', 'almoxarife', { ativo: false });

    const resposta = await entrar('afastado@tropical.test');

    expect(resposta.status).toBe(401);
  });
});

describe('autenticação por token', () => {
  it('aceita o token dentro dos 30 dias e devolve o usuário em GET /eu', async () => {
    const token = await tokenDe('gestor@tropical.test');

    const resposta = await comToken(token, 'GET', '/eu');

    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toMatchObject({
      usuario: { email: 'gestor@tropical.test', papel: 'gestor' },
    });
  });

  it('recusa o token depois de 30 dias, com o relógio do teste fixado mais adiante', async () => {
    const token = await tokenDe('gestor@tropical.test');
    const depois = { ...env, RELOGIO_TESTE: new Date(Date.parse(AGORA) + TRINTA_DIAS_MS + 60_000).toISOString() };

    const resposta = await atender(
      new Request('https://api.test/eu', { headers: { Authorization: `Bearer ${token}` } }),
      depois,
    );

    expect(resposta.status).toBe(401);
  });

  it('responde 401 sem cabeçalho Authorization ou com token desconhecido', async () => {
    const semCabecalho = await SELF.fetch('https://api.test/eu');
    const desconhecido = await comToken('token-que-nao-existe');

    expect(semCabecalho.status).toBe(401);
    expect(desconhecido.status).toBe(401);
  });

  it('derruba a sessão de quem foi desativado depois de entrar', async () => {
    const token = await tokenDe('gestor@tropical.test');
    await env.DB.prepare("UPDATE usuarios SET ativo = 0 WHERE email = 'gestor@tropical.test'").run();

    const resposta = await comToken(token, 'GET', '/eu');

    expect(resposta.status).toBe(401);
  });
});

describe('POST /sair', () => {
  it('invalida só a sessão atual, mantendo as outras do mesmo usuário', async () => {
    const primeira = await tokenDe('almoxarife@tropical.test');
    const segunda = await tokenDe('almoxarife@tropical.test');

    const saida = await comToken(primeira, 'POST', '/sair');

    expect(saida.status).toBe(204);
    expect((await comToken(primeira, 'GET', '/eu')).status).toBe(401);
    expect((await comToken(segunda, 'GET', '/eu')).status).toBe(200);
  });
});

describe('POST /trocar-senha', () => {
  it('recusa a troca quando a senha atual está errada', async () => {
    const token = await tokenDe('almoxarife@tropical.test');

    const resposta = await comToken(token, 'POST', '/trocar-senha', {
      senhaAtual: 'errada-000',
      novaSenha: 'nova-senha-456',
    });

    expect(resposta.status).toBe(400);
    expect((await comToken(token, 'GET', '/eu')).status).toBe(200);
  });

  it('troca a senha e derruba todas as sessões do usuário', async () => {
    const primeira = await tokenDe('almoxarife@tropical.test');
    const segunda = await tokenDe('almoxarife@tropical.test');

    const resposta = await comToken(primeira, 'POST', '/trocar-senha', {
      senhaAtual: SENHA,
      novaSenha: 'nova-senha-456',
    });

    expect(resposta.status).toBe(204);
    expect((await comToken(primeira, 'GET', '/eu')).status).toBe(401);
    expect((await comToken(segunda, 'GET', '/eu')).status).toBe(401);
    expect((await entrar('almoxarife@tropical.test', SENHA)).status).toBe(401);
    expect((await entrar('almoxarife@tropical.test', 'nova-senha-456')).status).toBe(200);
  });

  it('recusa uma nova senha curta demais', async () => {
    const token = await tokenDe('almoxarife@tropical.test');

    const resposta = await comToken(token, 'POST', '/trocar-senha', {
      senhaAtual: SENHA,
      novaSenha: 'curta',
    });

    expect(resposta.status).toBe(400);
  });
});

describe('autorização por papel', () => {
  it('libera a rota de gestor para o gestor', async () => {
    const token = await tokenDe('gestor@tropical.test');

    const resposta = await comToken(token, 'GET', '/restrito/gestor');

    expect(resposta.status).toBe(200);
  });

  it('responde 403 quando o papel do usuário não tem permissão', async () => {
    const token = await tokenDe('almoxarife@tropical.test');

    const resposta = await comToken(token, 'GET', '/restrito/gestor');

    expect(resposta.status).toBe(403);
  });

  it('responde 401 (não 403) sem sessão', async () => {
    const resposta = await SELF.fetch('https://api.test/restrito/gestor');

    expect(resposta.status).toBe(401);
  });
});
