import {
  entrar,
  exigirPapel,
  naoAutenticado,
  sair,
  trocarSenha,
  usuarioDaRequisicao,
} from './autenticacao';
import { cabecalhosCors } from './cors';
import type { Env } from './env';
import { type Relogio, relogioDoAmbiente } from './relogio';

export async function atender(request: Request, env: Env): Promise<Response> {
  const cors = cabecalhosCors(request.headers.get('Origin'));

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  const resposta = await rotear(request, env, relogioDoAmbiente(env));
  for (const [nome, valor] of cors) {
    resposta.headers.set(nome, valor);
  }

  return resposta;
}

async function rotear(request: Request, env: Env, relogio: Relogio): Promise<Response> {
  const { pathname } = new URL(request.url);

  if (request.method === 'GET' && pathname === '/saude') {
    return saude(env, relogio);
  }

  if (request.method === 'POST' && pathname === '/entrar') {
    return entrar(request, env, relogio);
  }

  if (!ROTAS_PROTEGIDAS.has(pathname)) {
    return Response.json({ erro: 'Rota não encontrada' }, { status: 404 });
  }

  const usuario = await usuarioDaRequisicao(request, env, relogio);
  if (!usuario) {
    return naoAutenticado();
  }

  if (request.method === 'GET' && pathname === '/eu') {
    return Response.json({ usuario });
  }

  if (request.method === 'POST' && pathname === '/sair') {
    return sair(request, env);
  }

  if (request.method === 'POST' && pathname === '/trocar-senha') {
    return trocarSenha(request, env, usuario);
  }

  // Rota de exemplo do mecanismo de papéis; as próximas fatias seguem o mesmo padrão.
  if (request.method === 'GET' && pathname === '/restrito/gestor') {
    return exigirPapel(usuario, ['gestor']) ?? Response.json({ ok: true });
  }

  return Response.json({ erro: 'Rota não encontrada' }, { status: 404 });
}

const ROTAS_PROTEGIDAS = new Set(['/eu', '/sair', '/trocar-senha', '/restrito/gestor']);

async function saude(env: Env, relogio: Relogio): Promise<Response> {
  const agora = relogio().toISOString();

  try {
    await env.DB.prepare('SELECT 1').first();
    return Response.json({ status: 'ok', agora, banco: 'ok' });
  } catch {
    return Response.json({ status: 'erro', agora, banco: 'erro' }, { status: 503 });
  }
}
