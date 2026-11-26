import type { Env } from './env';

/**
 * Para onde a busca geral do topo leva. A API decide; a tela só navega até o destino.
 * - ferramenta: o texto é um Número existente ("23", "F23", "F-023") → Ficha.
 * - funcionario: o texto é o nome de um Funcionário e nenhuma Ferramenta corresponde → perfil.
 * - catalogo: qualquer outro texto → catálogo de Ferramentas filtrado por ele.
 */
export type DestinoBusca =
  | { destino: 'ferramenta'; numero: string }
  | { destino: 'funcionario'; id: number }
  | { destino: 'catalogo'; texto: string };

/** Roteia GET /busca. Quem chega aqui já está autenticado. */
export async function tratarBusca(request: Request, env: Env): Promise<Response> {
  const texto = (new URL(request.url).searchParams.get('texto') ?? '').trim();

  return Response.json(await destinoDaBusca(texto, env));
}

async function destinoDaBusca(texto: string, env: Env): Promise<DestinoBusca> {
  const minusculo = texto.toLowerCase();

  const numero = numeroDoTexto(texto);
  if (numero && (await numeroExiste(numero, env))) {
    return { destino: 'ferramenta', numero };
  }

  const ferramentas = await ferramentasComTexto(minusculo, env);
  if (ferramentas === 0 && texto) {
    const funcionario = await funcionarioDoNome(minusculo, env);
    if (funcionario) {
      return { destino: 'funcionario', id: funcionario };
    }
  }

  return { destino: 'catalogo', texto };
}

/** "23", "F23", "F-023" e "f-23" viram o Número no formato F-NNN; qualquer outra coisa não é Número. */
function numeroDoTexto(texto: string): string | null {
  const casamento = texto.match(/^f?-?(\d+)$/i);
  if (!casamento) {
    return null;
  }

  return `F-${String(Number.parseInt(casamento[1], 10)).padStart(3, '0')}`;
}

async function numeroExiste(numero: string, env: Env): Promise<boolean> {
  const linha = await env.DB.prepare('SELECT numero FROM ferramentas WHERE numero = ?').bind(numero).first();
  return linha !== null;
}

/** Quantas Ferramentas casam com o texto (Número, nome, marca ou modelo), como no catálogo. */
async function ferramentasComTexto(minusculo: string, env: Env): Promise<number> {
  if (!minusculo) {
    return 0;
  }

  const { results } = await env.DB.prepare('SELECT numero, nome, marca, modelo FROM ferramentas').all<{
    numero: string;
    nome: string;
    marca: string | null;
    modelo: string | null;
  }>();

  return results.filter((linha) =>
    [linha.numero, linha.nome, linha.marca, linha.modelo].some((campo) =>
      (campo ?? '').toLowerCase().includes(minusculo),
    ),
  ).length;
}

/**
 * Funcionário pelo nome: o nome exato vence; sem ele, só vale um único nome que contenha o texto.
 * Nomes ambíguos (mais de um candidato) ficam sem destino, e a busca cai no catálogo.
 */
async function funcionarioDoNome(minusculo: string, env: Env): Promise<number | null> {
  if (!minusculo) {
    return null;
  }

  const { results } = await env.DB.prepare('SELECT id, nome FROM funcionarios').all<{ id: number; nome: string }>();

  const exatos = results.filter((linha) => linha.nome.toLowerCase() === minusculo);
  if (exatos.length === 1) {
    return exatos[0].id;
  }
  if (exatos.length > 1) {
    return null;
  }

  const parciais = results.filter((linha) => linha.nome.toLowerCase().includes(minusculo));
  return parciais.length === 1 ? parciais[0].id : null;
}
