import type { Env } from './env';
import { type RetiradaHistorico, retiradasDoFuncionario } from './historico';
import { contarAbertasPorFuncionario, ferramentasEmPosseDe } from './retiradas';

interface LinhaFuncionario {
  id: number;
  nome: string;
  funcao: string | null;
  ativo: number;
}

interface Funcionario {
  id: number;
  nome: string;
  funcao: string | null;
  ativo: boolean;
  /** Retiradas sem Devolução: são também as Ferramentas em posse. */
  retiradasAbertas: number;
}

interface PerfilFuncionario extends Funcionario {
  ferramentasEmPosse: Awaited<ReturnType<typeof ferramentasEmPosseDe>>;
  /** Todas as Retiradas do Funcionário, da mais recente para a mais antiga. */
  historico: RetiradaHistorico[];
}

/** Roteia /funcionarios. Quem chega aqui já está autenticado, e os dois papéis podem cadastrar e editar. */
export async function tratarFuncionarios(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const { pathname } = url;

  if (request.method === 'GET' && pathname === '/funcionarios') {
    return listar(url.searchParams, env);
  }

  if (request.method === 'POST' && pathname === '/funcionarios') {
    return cadastrar(request, env);
  }

  const segmento = pathname.match(/^\/funcionarios\/(\d+)$/)?.[1];
  if (segmento && (request.method === 'GET' || request.method === 'PUT')) {
    const id = Number(segmento);

    return request.method === 'GET' ? obter(id, env) : editar(id, request, env);
  }

  return Response.json({ erro: 'Rota não encontrada' }, { status: 404 });
}

async function listar(params: URLSearchParams, env: Env): Promise<Response> {
  const texto = (params.get('texto') ?? '').trim().toLowerCase();

  const { results } = await env.DB.prepare('SELECT id, nome, funcao, ativo FROM funcionarios').all<LinhaFuncionario>();
  // Ordenado em JS: o SQLite compara bytes, e assim "Ângela" iria para depois de "Zé".
  const filtrados = results
    .filter((linha) => !texto || linha.nome.toLowerCase().includes(texto))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  const abertas = await contarAbertasPorFuncionario(env);

  return Response.json({ itens: filtrados.map((linha) => paraFuncionario(linha, abertas.get(linha.id) ?? 0)) });
}

async function obter(id: number, env: Env): Promise<Response> {
  const linha = await buscarLinha(id, env);
  if (!linha) {
    return naoEncontrado();
  }

  const abertas = (await contarAbertasPorFuncionario(env)).get(id) ?? 0;
  const perfil: PerfilFuncionario = {
    ...paraFuncionario(linha, abertas),
    ferramentasEmPosse: await ferramentasEmPosseDe(env, id),
    historico: await retiradasDoFuncionario(env, id),
  };

  return Response.json(perfil);
}

async function cadastrar(request: Request, env: Env): Promise<Response> {
  const corpo = await lerCorpo(request);
  const dados = lerDados(corpo, { nome: '', funcao: null });
  if ('erro' in dados) {
    return erroDeValidacao(dados.erro);
  }

  const { meta } = await env.DB.prepare('INSERT INTO funcionarios (nome, funcao, ativo) VALUES (?, ?, 1)')
    .bind(dados.nome, dados.funcao)
    .run();

  const linha = await buscarLinha(Number(meta.last_row_id), env);
  return Response.json(paraFuncionario(linha as LinhaFuncionario), { status: 201 });
}

async function editar(id: number, request: Request, env: Env): Promise<Response> {
  const atual = await buscarLinha(id, env);
  if (!atual) {
    return naoEncontrado();
  }

  const corpo = await lerCorpo(request);
  const dados = lerDados(corpo, { nome: atual.nome, funcao: atual.funcao });
  if ('erro' in dados) {
    return erroDeValidacao(dados.erro);
  }

  if (corpo?.ativo !== undefined && typeof corpo.ativo !== 'boolean') {
    return erroDeValidacao('A situação precisa ser ativo ou inativo');
  }

  const ativo = typeof corpo?.ativo === 'boolean' ? corpo.ativo : atual.ativo === 1;

  await env.DB.prepare('UPDATE funcionarios SET nome = ?, funcao = ?, ativo = ? WHERE id = ?')
    .bind(dados.nome, dados.funcao, ativo ? 1 : 0, id)
    .run();

  const abertas = (await contarAbertasPorFuncionario(env)).get(id) ?? 0;
  return Response.json(paraFuncionario((await buscarLinha(id, env)) as LinhaFuncionario, abertas));
}

/** Dados do Funcionário vindos do corpo. Campo ausente mantém o valor atual; função vazia vira null. */
function lerDados(
  corpo: Record<string, unknown> | null,
  atuais: { nome: string; funcao: string | null },
): { nome: string; funcao: string | null } | { erro: string } {
  const nome = corpo?.nome === undefined ? atuais.nome : textoDe(corpo.nome);
  if (!nome) {
    return { erro: 'Informe o nome do Funcionário' };
  }

  const funcao = corpo?.funcao === undefined ? atuais.funcao : textoDe(corpo.funcao);
  return { nome, funcao };
}

function textoDe(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim() : '';
}

async function buscarLinha(id: number, env: Env): Promise<LinhaFuncionario | null> {
  return env.DB.prepare('SELECT id, nome, funcao, ativo FROM funcionarios WHERE id = ?')
    .bind(id)
    .first<LinhaFuncionario>();
}

function paraFuncionario(linha: LinhaFuncionario, retiradasAbertas = 0): Funcionario {
  return {
    id: linha.id,
    nome: linha.nome,
    funcao: linha.funcao,
    ativo: linha.ativo === 1,
    retiradasAbertas,
  };
}

function naoEncontrado(): Response {
  return Response.json({ erro: 'Funcionário não encontrado' }, { status: 404 });
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
