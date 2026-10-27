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

  return Response.json({ erro: 'Rota não encontrada' }, { status: 404 });
}

async function saude(env: Env, relogio: Relogio): Promise<Response> {
  const agora = relogio().toISOString();

  try {
    await env.DB.prepare('SELECT 1').first();
    return Response.json({ status: 'ok', agora, banco: 'ok' });
  } catch {
    return Response.json({ status: 'erro', agora, banco: 'erro' }, { status: 503 });
  }
}
