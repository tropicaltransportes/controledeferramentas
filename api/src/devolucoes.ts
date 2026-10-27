import type { Env } from './env';
import type { Relogio } from './relogio';
import { type Usuario, exigirPapel } from './autenticacao';
import { normalizarNumero } from './retiradas';

/** Roteia /devolucoes. Só o Almoxarife registra Devoluções. */
export async function tratarDevolucoes(request: Request, env: Env, relogio: Relogio, usuario: Usuario): Promise<Response> {
  const { pathname } = new URL(request.url);

  if (request.method === 'POST' && pathname === '/devolucoes') {
    const proibido = exigirPapel(usuario, ['almoxarife']);
    if (proibido) {
      return proibido;
    }

    return registrar(request, env, relogio, usuario);
  }

  return Response.json({ erro: 'Rota não encontrada' }, { status: 404 });
}

async function registrar(request: Request, env: Env, relogio: Relogio, usuario: Usuario): Promise<Response> {
  const corpo = await lerCorpo(request);
  const numero = normalizarNumero(corpo?.numero);
  const resultado = corpo?.resultado;
  const descricao = typeof corpo?.descricao === 'string' ? corpo.descricao.trim() : '';

  if (numero === null) {
    return erroDeValidacao('Informe o Número da Ferramenta, no formato F-NNN');
  }

  if (resultado !== 'ok' && resultado !== 'com_problema') {
    return erroDeValidacao('Escolha se a Ferramenta voltou OK ou Com Problema');
  }

  if (resultado === 'com_problema' && !descricao) {
    return erroDeValidacao('Descreva o problema da Ferramenta');
  }

  const aberta = await env.DB.prepare(
    `SELECT id, funcionario_id AS funcionarioId
       FROM retiradas
      WHERE ferramenta_numero = ? AND devolvida_em IS NULL`,
  )
    .bind(numero)
    .first<{ id: number; funcionarioId: number }>();

  if (!aberta) {
    return Response.json({ erro: `${numero} não está fora, então não há Devolução a registrar` }, { status: 409 });
  }

  const agora = relogio().toISOString();
  // Tudo ou nada: o batch grava a Devolução, a situação da Ferramenta e o Problema juntos.
  // Os dois últimos comandos só gravam se a própria Retirada acabou de ser fechada com este horário,
  // então uma Devolução simultânea da mesma Retirada não deixa nada pela metade.
  const fechadaAgora = 'EXISTS (SELECT 1 FROM retiradas WHERE id = ? AND devolvida_em = ?)';
  const comandos = [
    env.DB.prepare(
      `UPDATE retiradas
          SET devolvida_em = ?, resultado = ?, observacao = ?, devolucao_registrada_por = ?
        WHERE id = ? AND devolvida_em IS NULL`,
    ).bind(agora, resultado, resultado === 'com_problema' ? descricao : null, usuario.id, aberta.id),
  ];

  if (resultado === 'com_problema') {
    // Com Problema: a Ferramenta sai de circulação e o Problema nasce aguardando destino.
    comandos.push(
      env.DB.prepare(`UPDATE ferramentas SET estado = 'com_problema', atualizado_em = ? WHERE numero = ? AND ${fechadaAgora}`).bind(
        agora,
        numero,
        aberta.id,
        agora,
      ),
      env.DB.prepare(
        `INSERT INTO problemas (ferramenta_numero, retirada_id, funcionario_id, descricao, registrado_em)
         SELECT ?, ?, ?, ?, ? WHERE ${fechadaAgora}`,
      ).bind(numero, aberta.id, aberta.funcionarioId, descricao, agora, aberta.id, agora),
    );
  }

  const [devolucaoGravada] = await env.DB.batch(comandos);
  if (devolucaoGravada.meta.changes === 0) {
    return Response.json({ erro: `${numero} acabou de ser devolvida. Confira e tente de novo` }, { status: 409 });
  }

  return Response.json({ numero, resultado, devolvidaEm: agora }, { status: 201 });
}

function erroDeValidacao(mensagem: string): Response {
  return Response.json({ erro: mensagem }, { status: 422 });
}

async function lerCorpo(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const corpo: unknown = await request.json();
    return typeof corpo === 'object' && corpo !== null ? (corpo as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
