import { type Usuario, exigirPapel } from './autenticacao';
import type { Env } from './env';
import type { Relogio } from './relogio';

const FORMATO_ROTA = /^\/ferramentas\/([^/]+)\/(extraviar|liberar|baixar)$/;

/** Rotas de destino das Ferramentas: /ferramentas/:numero/(extraviar|liberar|baixar). */
export function ehRotaDeDestino(pathname: string): boolean {
  return FORMATO_ROTA.test(pathname);
}

/**
 * Dá destino às Ferramentas. Só o Almoxarife faz isso.
 * - extraviar: Ferramenta retirada que não voltou; encerra a Retirada sem Devolução.
 * - liberar / baixar: Ferramenta Com Problema; fecha o Problema aguardando destino.
 */
export async function tratarDestinos(request: Request, env: Env, relogio: Relogio, usuario: Usuario): Promise<Response> {
  const casa = new URL(request.url).pathname.match(FORMATO_ROTA);
  if (request.method !== 'POST' || !casa) {
    return Response.json({ erro: 'Rota não encontrada' }, { status: 404 });
  }

  const proibido = exigirPapel(usuario, ['almoxarife']);
  if (proibido) {
    return proibido;
  }

  const numero = decodificar(casa[1]);
  const acao = casa[2] as 'extraviar' | 'liberar' | 'baixar';
  if (numero === null) {
    return Response.json({ erro: 'Ferramenta não encontrada' }, { status: 404 });
  }

  const ferramenta = await env.DB.prepare('SELECT estado FROM ferramentas WHERE numero = ?')
    .bind(numero)
    .first<{ estado: string }>();
  if (!ferramenta) {
    return Response.json({ erro: 'Ferramenta não encontrada' }, { status: 404 });
  }

  if (acao === 'extraviar') {
    return extraviar(numero, env, relogio, usuario);
  }

  return destinarAProblema(numero, acao, ferramenta.estado, env, relogio, usuario);
}

async function extraviar(numero: string, env: Env, relogio: Relogio, usuario: Usuario): Promise<Response> {
  const aberta = await env.DB.prepare(
    'SELECT id FROM retiradas WHERE ferramenta_numero = ? AND devolvida_em IS NULL',
  )
    .bind(numero)
    .first<{ id: number }>();

  if (!aberta) {
    return Response.json({ erro: `${numero} não está fora, então não há Retirada para encerrar` }, { status: 409 });
  }

  const agora = relogio().toISOString();
  // Tudo ou nada: a Retirada é encerrada e a Ferramenta vira Extraviada no mesmo batch.
  // A Ferramenta só muda se a Retirada acabou de ser encerrada com este horário (mesmo padrão da Devolução).
  const [encerrada] = await env.DB.batch([
    env.DB.prepare(
      `UPDATE retiradas
          SET devolvida_em = ?, resultado = 'extraviada', devolucao_registrada_por = ?
        WHERE id = ? AND devolvida_em IS NULL`,
    ).bind(agora, usuario.id, aberta.id),
    env.DB.prepare(
      `UPDATE ferramentas SET estado = 'extraviada', atualizado_em = ?
        WHERE numero = ? AND EXISTS (SELECT 1 FROM retiradas WHERE id = ? AND devolvida_em = ?)`,
    ).bind(agora, numero, aberta.id, agora),
  ]);

  if (encerrada.meta.changes === 0) {
    return Response.json({ erro: `${numero} acabou de ser devolvida. Confira e tente de novo` }, { status: 409 });
  }

  return Response.json({ numero, estado: 'extraviada', atualizadoEm: agora });
}

async function destinarAProblema(
  numero: string,
  acao: 'liberar' | 'baixar',
  estadoAtual: string,
  env: Env,
  relogio: Relogio,
  usuario: Usuario,
): Promise<Response> {
  if (estadoAtual !== 'com_problema') {
    return Response.json({ erro: `${numero} não está Com Problema, então não pode ser ${acao === 'liberar' ? 'liberada' : 'baixada'}` }, { status: 409 });
  }

  const novoEstado = acao === 'liberar' ? 'disponivel' : 'baixada';
  const destino = acao === 'liberar' ? 'liberada' : 'baixada';
  const agora = relogio().toISOString();

  // Tudo ou nada: a Ferramenta muda de estado e o Problema aguardando destino fecha junto.
  // O Problema só fecha se a Ferramenta acabou de mudar com este horário (uma ação simultânea não deixa nada pela metade).
  const [mudou] = await env.DB.batch([
    env.DB.prepare(
      `UPDATE ferramentas SET estado = ?, atualizado_em = ? WHERE numero = ? AND estado = 'com_problema'`,
    ).bind(novoEstado, agora, numero),
    env.DB.prepare(
      `UPDATE problemas SET destino = ?, destino_em = ?, destino_registrado_por = ?
        WHERE ferramenta_numero = ? AND destino IS NULL
          AND EXISTS (SELECT 1 FROM ferramentas WHERE numero = ? AND atualizado_em = ?)`,
    ).bind(destino, agora, usuario.id, numero, numero, agora),
  ]);

  if (mudou.meta.changes === 0) {
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
