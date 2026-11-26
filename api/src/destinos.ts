import { type Usuario, exigirPapel } from './autenticacao';
import type { Env } from './env';
import type { Relogio } from './relogio';
import { normalizarNumero } from './retiradas';

const FORMATO_ROTA = /^\/ferramentas\/([^/]+)\/(extraviar|liberar|baixar)$/;

type Acao = 'extraviar' | 'liberar' | 'baixar';

/** Situação da Ferramenta e destino do Problema que cada ação produz. */
const DESTINO_DO_PROBLEMA = {
  liberar: { estado: 'disponivel', destino: 'liberada' },
  baixar: { estado: 'baixada', destino: 'baixada' },
} as const;

interface Contexto {
  env: Env;
  relogio: Relogio;
  usuario: Usuario;
  numero: string;
}

/** Rotas de destino das Ferramentas: /ferramentas/:numero/(extraviar|liberar|baixar). */
export function ehRotaDeDestino(pathname: string): boolean {
  return FORMATO_ROTA.test(pathname);
}

/**
 * Dá destino às Ferramentas. Só o Almoxarife faz isso.
 * - extraviar: Ferramenta com Retirada aberta que não voltou; encerra a Retirada sem Devolução.
 * - liberar / baixar: Ferramenta Com Problema; fecha o Problema aguardando destino.
 */
export async function tratarDestinos(request: Request, env: Env, relogio: Relogio, usuario: Usuario): Promise<Response> {
  const partesDaRota = new URL(request.url).pathname.match(FORMATO_ROTA);
  if (request.method !== 'POST' || !partesDaRota) {
    return Response.json({ erro: 'Rota não encontrada' }, { status: 404 });
  }

  const proibido = exigirPapel(usuario, ['almoxarife']);
  if (proibido) {
    return proibido;
  }

  const numero = normalizarNumero(decodificar(partesDaRota[1]));
  if (numero === null) {
    return Response.json({ erro: 'Ferramenta não encontrada' }, { status: 404 });
  }

  const ferramenta = await env.DB.prepare('SELECT estado FROM ferramentas WHERE numero = ?')
    .bind(numero)
    .first<{ estado: string }>();
  if (!ferramenta) {
    return Response.json({ erro: 'Ferramenta não encontrada' }, { status: 404 });
  }

  const contexto: Contexto = { env, relogio, usuario, numero };
  const acao = partesDaRota[2] as Acao;

  if (acao === 'extraviar') {
    return extraviar(contexto);
  }

  return destinarAProblema(contexto, acao, ferramenta.estado);
}

async function extraviar({ env, relogio, numero }: Contexto): Promise<Response> {
  const aberta = await env.DB.prepare(
    'SELECT id FROM retiradas WHERE ferramenta_numero = ? AND devolvida_em IS NULL AND extraviada_em IS NULL',
  )
    .bind(numero)
    .first<{ id: number }>();

  if (!aberta) {
    return Response.json({ erro: `${numero} não está fora, então não há Retirada para encerrar` }, { status: 409 });
  }

  const agora = relogio().toISOString();
  // Tudo ou nada, e na ordem certa: a Ferramenta só vira Extraviada enquanto a Retirada ainda está aberta,
  // e só então a Retirada é encerrada. Uma ação simultânea não deixa nada pela metade e não depende de horário.
  const [ferramenta] = await env.DB.batch([
    env.DB.prepare(
      `UPDATE ferramentas SET estado = 'extraviada', atualizado_em = ?
        WHERE numero = ? AND estado = 'disponivel'
          AND EXISTS (SELECT 1 FROM retiradas WHERE id = ? AND devolvida_em IS NULL AND extraviada_em IS NULL)`,
    ).bind(agora, numero, aberta.id),
    env.DB.prepare(
      `UPDATE retiradas SET extraviada_em = ?, resultado = 'extraviada'
        WHERE id = ? AND devolvida_em IS NULL AND extraviada_em IS NULL`,
    ).bind(agora, aberta.id),
  ]);

  if (ferramenta.meta.changes === 0) {
    return Response.json({ erro: `${numero} acabou de mudar de situação. Confira e tente de novo` }, { status: 409 });
  }

  return Response.json({ numero, estado: 'extraviada', atualizadoEm: agora });
}

async function destinarAProblema(
  { env, relogio, usuario, numero }: Contexto,
  acao: 'liberar' | 'baixar',
  estadoAtual: string,
): Promise<Response> {
  const { estado: novoEstado, destino } = DESTINO_DO_PROBLEMA[acao];

  if (estadoAtual !== 'com_problema') {
    return Response.json({ erro: `${numero} não está Com Problema, então não pode ser ${destino}` }, { status: 409 });
  }

  const agora = relogio().toISOString();
  // Tudo ou nada, e na ordem certa: o Problema só fecha enquanto a Ferramenta ainda está Com Problema;
  // depois a Ferramenta muda de situação. Uma ação simultânea falha no UPDATE da Ferramenta e nada fica pela metade.
  const [, ferramenta] = await env.DB.batch([
    env.DB.prepare(
      `UPDATE problemas SET destino = ?, destino_em = ?, destino_registrado_por = ?
        WHERE ferramenta_numero = ? AND destino IS NULL
          AND EXISTS (SELECT 1 FROM ferramentas WHERE numero = ? AND estado = 'com_problema')`,
    ).bind(destino, agora, usuario.id, numero, numero),
    env.DB.prepare(
      `UPDATE ferramentas SET estado = ?, atualizado_em = ? WHERE numero = ? AND estado = 'com_problema'`,
    ).bind(novoEstado, agora, numero),
  ]);

  if (ferramenta.meta.changes === 0) {
    return Response.json({ erro: `${numero} acabou de mudar de situação. Confira e tente de novo` }, { status: 409 });
  }

  return Response.json({ numero, estado: novoEstado, atualizadoEm: agora });
}

/** Segmento da URL decodificado, ou null quando a codificação % está malformada. */
function decodificar(segmento: string): string | null {
  try {
    return decodeURIComponent(segmento);
  } catch {
    return null;
  }
}
