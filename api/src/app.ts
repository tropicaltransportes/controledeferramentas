import {
  entrar,
  exigirPapel,
  naoAutenticado,
  sair,
  trocarSenha,
  usuarioDaRequisicao,
} from './autenticacao';
import { cabecalhosCors } from './cors';
import { ehRotaDeDestino, tratarDestinos } from './destinos';
import { tratarDevolucoes } from './devolucoes';
import type { Env } from './env';
import { tratarFerramentas } from './ferramentas';
import { tratarFuncionarios } from './funcionarios';
import { tratarPainel } from './painel';
import { type Relogio, relogioDoAmbiente } from './relogio';
import { tratarRetiradas } from './retiradas';

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

  const ehRotaDeRegistro = pathname === '/retiradas' || pathname === '/devolucoes';
  if (!ROTAS_PROTEGIDAS.has(pathname) && !ehRotaFerramentas(pathname) && !ehRotaFuncionarios(pathname) && !ehRotaDeRegistro && pathname !== '/painel') {
    return Response.json({ erro: 'Rota não encontrada' }, { status: 404 });
  }

  const usuario = await usuarioDaRequisicao(request, env, relogio);
  if (!usuario) {
    return naoAutenticado();
  }

  // Antes de /ferramentas: as ações de destino também começam com /ferramentas/.
  if (ehRotaDeDestino(pathname)) {
    return tratarDestinos(request, env, relogio, usuario);
  }

  if (ehRotaFerramentas(pathname)) {
    return tratarFerramentas(request, env, relogio);
  }

  if (ehRotaFuncionarios(pathname)) {
    return tratarFuncionarios(request, env, relogio);
  }

  if (pathname === '/retiradas') {
    return tratarRetiradas(request, env, relogio, usuario);
  }

  if (pathname === '/devolucoes') {
    return tratarDevolucoes(request, env, relogio, usuario);
  }

  if (request.method === 'GET' && pathname === '/painel') {
    return tratarPainel(request, env, relogio);
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

function ehRotaFerramentas(pathname: string): boolean {
  return pathname === '/ferramentas' || pathname.startsWith('/ferramentas/');
}

function ehRotaFuncionarios(pathname: string): boolean {
  return pathname === '/funcionarios' || pathname.startsWith('/funcionarios/');
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
