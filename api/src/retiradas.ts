import type { Env } from './env';
import { type Relogio } from './relogio';
import { type Usuario, exigirPapel } from './autenticacao';

/** Responsável por uma Ferramenta: quem está com ela na Retirada aberta. */
export interface Posse {
  id: number;
  nome: string;
  retiradaEm: string;
}

const FORMATO_NUMERO = /^F-\d{3,}$/;

/** Retiradas abertas de todas as Ferramentas, ou só da indicada, indexadas pelo Número. */
export async function buscarPosses(env: Env, numero?: string): Promise<Map<string, Posse>> {
  const consulta = env.DB.prepare(
    `SELECT r.ferramenta_numero AS numero, f.id, f.nome, r.retirada_em AS retiradaEm
       FROM retiradas r
       JOIN funcionarios f ON f.id = r.funcionario_id
      WHERE r.devolvida_em IS NULL AND (? IS NULL OR r.ferramenta_numero = ?)`,
  ).bind(numero ?? null, numero ?? null);

  const { results } = await consulta.all<Posse & { numero: string }>();
  return new Map(results.map(({ numero: n, ...posse }) => [n, posse]));
}

/** Quantas Retiradas abertas cada Funcionário tem. Quem não tem nenhuma não aparece no mapa. */
export async function contarAbertasPorFuncionario(env: Env): Promise<Map<number, number>> {
  const { results } = await env.DB.prepare(
    'SELECT funcionario_id AS id, COUNT(*) AS total FROM retiradas WHERE devolvida_em IS NULL GROUP BY funcionario_id',
  ).all<{ id: number; total: number }>();

  return new Map(results.map((linha) => [linha.id, linha.total]));
}

/** Ferramentas em posse de um Funcionário, da mais antiga para a mais nova. */
export async function ferramentasEmPosseDe(env: Env, funcionarioId: number): Promise<
  { numero: string; nome: string; categoria: string; retiradaEm: string }[]
> {
  const { results } = await env.DB.prepare(
    `SELECT f.numero, f.nome, f.categoria, r.retirada_em AS retiradaEm
       FROM retiradas r
       JOIN ferramentas f ON f.numero = r.ferramenta_numero
      WHERE r.funcionario_id = ? AND r.devolvida_em IS NULL
      ORDER BY r.retirada_em, f.numero`,
  )
    .bind(funcionarioId)
    .all<{ numero: string; nome: string; categoria: string; retiradaEm: string }>();

  return results;
}

/** Roteia /retiradas. Só o Almoxarife registra Retiradas. */
export async function tratarRetiradas(request: Request, env: Env, relogio: Relogio, usuario: Usuario): Promise<Response> {
  const { pathname } = new URL(request.url);

  if (request.method === 'POST' && pathname === '/retiradas') {
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
  const funcionarioId = typeof corpo?.funcionarioId === 'number' ? corpo.funcionarioId : null;
  const numeros = Array.isArray(corpo?.numeros) ? [...new Set(corpo.numeros.map(normalizarNumero))] : [];

  if (funcionarioId === null) {
    return erroDeValidacao('Escolha o Funcionário da Retirada');
  }

  if (numeros.length === 0 || numeros.some((numero) => numero === null)) {
    return erroDeValidacao('Adicione ao menos uma Ferramenta, com Número no formato F-NNN');
  }

  const funcionario = await env.DB.prepare('SELECT id, nome, ativo FROM funcionarios WHERE id = ?')
    .bind(funcionarioId)
    .first<{ id: number; nome: string; ativo: number }>();
  if (!funcionario) {
    return erroDeValidacao('Funcionário não encontrado');
  }

  if (funcionario.ativo !== 1) {
    return erroDeValidacao('Funcionário inativo não faz Retiradas');
  }

  // Tudo ou nada: a situação de cada Ferramenta é conferida antes de gravar a primeira.
  const conflitos = await conflitosDaRetirada(numeros as string[], env);
  if (conflitos.length > 0) {
    return Response.json({ erro: conflitos.join('. ') }, { status: 409 });
  }

  const agora = relogio().toISOString();
  try {
    await env.DB.batch(
      (numeros as string[]).map((numero) =>
        env.DB.prepare(
          `INSERT INTO retiradas (ferramenta_numero, funcionario_id, retirada_em, registrada_por)
           VALUES (?, ?, ?, ?)`,
        ).bind(numero, funcionario.id, agora, usuario.id),
      ),
    );
  } catch (erro) {
    // Duas Retiradas simultâneas da mesma Ferramenta passam pela conferência; o índice único decide.
    if (erro instanceof Error && erro.message.includes('UNIQUE constraint failed')) {
      return Response.json({ erro: 'Uma das Ferramentas acabou de sair com outra pessoa. Confira e tente de novo' }, { status: 409 });
    }

    throw erro;
  }

  return Response.json(
    { itens: (numeros as string[]).map((numero) => ({ numero, funcionarioId: funcionario.id, retiradaEm: agora })) },
    { status: 201 },
  );
}

/** Motivos pelos quais alguma Ferramenta não pode sair. Lista vazia quando todas podem. */
async function conflitosDaRetirada(numeros: string[], env: Env): Promise<string[]> {
  const motivos: string[] = [];

  for (const numero of numeros) {
    const ferramenta = await env.DB.prepare('SELECT estado FROM ferramentas WHERE numero = ?')
      .bind(numero)
      .first<{ estado: string }>();

    if (!ferramenta) {
      motivos.push(`${numero} não está cadastrada`);
      continue;
    }

    const posse = (await buscarPosses(env, numero)).get(numero);
    if (posse) {
      motivos.push(`${numero} já está fora, com ${posse.nome}`);
    } else if (ferramenta.estado !== 'disponivel') {
      motivos.push(`${numero} está ${ROTULO_ESTADO[ferramenta.estado] ?? ferramenta.estado} e não pode sair`);
    }
  }

  return motivos;
}

const ROTULO_ESTADO: Record<string, string> = {
  com_problema: 'Com Problema',
  baixada: 'Baixada',
  extraviada: 'Extraviada',
};

/** Número digitado (`23`, `f-023`, `F-023`) no formato F-NNN, ou null quando não é um Número. */
function normalizarNumero(valor: unknown): string | null {
  if (typeof valor !== 'string') {
    return null;
  }

  const limpo = valor.trim().toUpperCase();
  if (/^\d+$/.test(limpo)) {
    return `F-${limpo.padStart(3, '0')}`;
  }

  return FORMATO_NUMERO.test(limpo) ? limpo : null;
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
