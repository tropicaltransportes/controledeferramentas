import type { Env } from './env';
import type { Relogio } from './relogio';
import { gerarHashSenha, verificarSenha } from './senha';

const DURACAO_SESSAO_MS = 30 * 24 * 60 * 60 * 1000;
const TAMANHO_MINIMO_SENHA = 8;

export type Papel = 'almoxarife' | 'gestor';

export interface Usuario {
  id: number;
  nome: string;
  email: string;
  papel: Papel;
}

interface LinhaUsuario extends Usuario {
  senha_hash: string;
}

export async function entrar(request: Request, env: Env, relogio: Relogio): Promise<Response> {
  const corpo = await lerCorpo(request);
  if (!corpo || typeof corpo.email !== 'string' || typeof corpo.senha !== 'string') {
    return Response.json({ erro: 'Informe e-mail e senha' }, { status: 400 });
  }

  const email = corpo.email.trim().toLowerCase();
  const linha = await env.DB.prepare(
    'SELECT id, nome, email, papel, senha_hash FROM usuarios WHERE email = ? AND ativo = 1',
  )
    .bind(email)
    .first<LinhaUsuario>();

  // Quando o e-mail não existe, o hash é calculado mesmo assim para não revelar,
  // pelo tempo de resposta, que a conta não existe.
  const senhaConfere = linha
    ? await verificarSenha(corpo.senha, linha.senha_hash)
    : await gerarHashSenha(corpo.senha).then(() => false);

  if (!linha || !senhaConfere) {
    return credenciaisInvalidas();
  }

  const token = novoToken();
  const agora = relogio();
  const expiraEm = new Date(agora.getTime() + DURACAO_SESSAO_MS);

  await env.DB.prepare('INSERT INTO sessoes (token_hash, usuario_id, expira_em) VALUES (?, ?, ?)')
    .bind(await hashToken(token), linha.id, expiraEm.toISOString())
    .run();

  return Response.json({
    token,
    usuario: paraUsuario(linha),
    expiraEm: expiraEm.toISOString(),
  });
}

/** Usuário dono do token do cabeçalho Authorization, ou null se não há sessão válida. */
export async function usuarioDaRequisicao(
  request: Request,
  env: Env,
  relogio: Relogio,
): Promise<Usuario | null> {
  const cabecalho = request.headers.get('Authorization') ?? '';
  const token = cabecalho.startsWith('Bearer ') ? cabecalho.slice('Bearer '.length).trim() : '';
  if (!token) {
    return null;
  }

  const linha = await env.DB.prepare(
    `SELECT u.id, u.nome, u.email, u.papel
       FROM sessoes s
       JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.token_hash = ? AND s.expira_em > ? AND u.ativo = 1`,
  )
    .bind(await hashToken(token), relogio().toISOString())
    .first<Usuario>();

  return linha ? paraUsuario(linha) : null;
}

export async function sair(request: Request, env: Env): Promise<Response> {
  const token = tokenDoCabecalho(request);
  await env.DB.prepare('DELETE FROM sessoes WHERE token_hash = ?')
    .bind(await hashToken(token))
    .run();

  return new Response(null, { status: 204 });
}

export async function trocarSenha(request: Request, env: Env, usuario: Usuario): Promise<Response> {
  const corpo = await lerCorpo(request);
  if (!corpo || typeof corpo.senhaAtual !== 'string' || typeof corpo.novaSenha !== 'string') {
    return Response.json({ erro: 'Informe a senha atual e a nova senha' }, { status: 400 });
  }

  const linha = await env.DB.prepare('SELECT senha_hash FROM usuarios WHERE id = ?')
    .bind(usuario.id)
    .first<{ senha_hash: string }>();
  if (!linha || !(await verificarSenha(corpo.senhaAtual, linha.senha_hash))) {
    return Response.json({ erro: 'Senha atual incorreta' }, { status: 400 });
  }

  if (corpo.novaSenha.length < TAMANHO_MINIMO_SENHA) {
    return Response.json(
      { erro: `A nova senha precisa ter pelo menos ${TAMANHO_MINIMO_SENHA} caracteres` },
      { status: 400 },
    );
  }

  const novoHash = await gerarHashSenha(corpo.novaSenha);
  await env.DB.batch([
    env.DB.prepare('UPDATE usuarios SET senha_hash = ? WHERE id = ?').bind(novoHash, usuario.id),
    env.DB.prepare('DELETE FROM sessoes WHERE usuario_id = ?').bind(usuario.id),
  ]);

  return new Response(null, { status: 204 });
}

/** 403 quando o papel do usuário não está entre os permitidos; null quando está. */
export function exigirPapel(usuario: Usuario, permitidos: Papel[]): Response | null {
  if (permitidos.includes(usuario.papel)) {
    return null;
  }

  return Response.json({ erro: 'Sem permissão para esta ação' }, { status: 403 });
}

export function naoAutenticado(): Response {
  return Response.json({ erro: 'Sessão inexistente ou expirada' }, { status: 401 });
}

function credenciaisInvalidas(): Response {
  return Response.json({ erro: 'E-mail ou senha inválidos' }, { status: 401 });
}

function paraUsuario(linha: Usuario): Usuario {
  return { id: linha.id, nome: linha.nome, email: linha.email, papel: linha.papel };
}

function tokenDoCabecalho(request: Request): string {
  const cabecalho = request.headers.get('Authorization') ?? '';
  return cabecalho.slice('Bearer '.length).trim();
}

async function lerCorpo(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const corpo: unknown = await request.json();
    return typeof corpo === 'object' && corpo !== null ? (corpo as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function novoToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
