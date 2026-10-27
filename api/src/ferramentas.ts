import type { Env } from './env';
import type { Relogio } from './relogio';

const CATEGORIAS = [
  'Medição',
  'Diagnóstico',
  'Elétrica',
  'Elevação',
  'Mecânica',
  'Pneumática',
  'Suspensão',
  'Freios',
  'Motor',
  'Geral',
] as const;

type Estado = 'disponivel' | 'com_problema' | 'baixada' | 'extraviada';
type Situacao = 'no_almoxarifado' | 'com_problema' | 'baixada' | 'extraviada';
type Filtro ='todas' | 'no_almoxarifado' | 'fora' | 'atrasada' | 'com_problema' | 'baixadas_extraviadas';

const FILTROS: Filtro[] = [
  'todas',
  'no_almoxarifado',
  'fora',
  'atrasada',
  'com_problema',
  'baixadas_extraviadas',
];

const SITUACAO_DO_ESTADO: Record<Estado, Situacao> = {
  disponivel: 'no_almoxarifado',
  com_problema: 'com_problema',
  baixada: 'baixada',
  extraviada: 'extraviada',
};

const FORMATO_NUMERO = /^F-\d{3,}$/;

interface LinhaFerramenta {
  numero: string;
  nome: string;
  categoria: string;
  marca: string | null;
  modelo: string | null;
  especificacao: string | null;
  numero_serie: string | null;
  aquisicao: string | null;
  observacoes: string | null;
  estado: Estado;
  criado_em: string;
  atualizado_em: string;
}

// A foto (BLOB) fica de fora: nenhuma tela de listagem ou Ficha a usa nesta fatia.
const COLUNAS = `numero, nome, categoria, marca, modelo, especificacao, numero_serie,
  aquisicao, observacoes, estado, criado_em, atualizado_em`;

interface Ferramenta {
  numero: string;
  nome: string;
  categoria: string;
  marca: string | null;
  modelo: string | null;
  especificacao: string | null;
  numeroSerie: string | null;
  aquisicao: string | null;
  observacoes: string | null;
  situacao: Situacao;
  criadoEm: string;
  atualizadoEm: string;
}

interface DadosFerramenta {
  nome: string;
  categoria: string;
  marca: string | null;
  modelo: string | null;
  especificacao: string | null;
  numeroSerie: string | null;
  aquisicao: string | null;
  observacoes: string | null;
}

/** Roteia /ferramentas. Quem chega aqui já está autenticado, e os dois papéis podem cadastrar e editar. */
export async function tratarFerramentas(request: Request, env: Env, relogio: Relogio): Promise<Response> {
  const url = new URL(request.url);
  const { pathname } = url;

  if (request.method === 'GET' && pathname === '/ferramentas') {
    return listar(url.searchParams, env);
  }

  if (request.method === 'GET' && pathname === '/ferramentas/proximo-numero') {
    return proximoNumero(env);
  }

  if (request.method === 'POST' && pathname === '/ferramentas') {
    return cadastrar(request, env, relogio);
  }

  const segmento = pathname.match(/^\/ferramentas\/([^/]+)$/)?.[1];
  if (segmento && (request.method === 'GET' || request.method === 'PUT')) {
    const numero = decodificar(segmento);
    if (numero === null) {
      return naoEncontrada();
    }

    return request.method === 'GET'
      ? obter(numero, env)
      : editar(numero, request, env, relogio);
  }

  return Response.json({ erro: 'Rota não encontrada' }, { status: 404 });
}

async function listar(params: URLSearchParams, env: Env): Promise<Response> {
  const situacao = params.get('situacao') ?? 'todas';
  if (!isFiltro(situacao)) {
    return Response.json({ erro: 'Situação de filtro desconhecida' }, { status: 422 });
  }

  const categoria = params.get('categoria') ?? '';
  const texto = (params.get('texto') ?? '').trim().toLowerCase();

  const linhas = await todasAsLinhas(env);
  const filtradas = linhas.filter((linha) => {
    if (categoria && linha.categoria !== categoria) {
      return false;
    }

    return !texto || buscaCasa(linha, texto);
  });

  const contagens = Object.fromEntries(
    FILTROS.map((filtro) => [filtro, filtradas.filter((linha) => pertenceAoFiltro(linha.estado, filtro)).length]),
  );

  return Response.json({
    itens: filtradas.filter((linha) => pertenceAoFiltro(linha.estado, situacao)).map(paraFerramenta),
    contagens,
  });
}

async function proximoNumero(env: Env): Promise<Response> {
  const linhas = await todasAsLinhas(env);
  const maior = linhas.reduce((atual, linha) => Math.max(atual, numeroEmInteiro(linha.numero)), 0);

  return Response.json({ numero: formatarNumero(maior + 1) });
}

async function obter(numero: string, env: Env): Promise<Response> {
  const linha = await buscarLinha(numero, env);
  if (!linha) {
    return naoEncontrada();
  }

  return Response.json(paraFerramenta(linha));
}

async function cadastrar(request: Request, env: Env, relogio: Relogio): Promise<Response> {
  const corpo = await lerCorpo(request);
  const numero = typeof corpo?.numero === 'string' ? corpo.numero.trim().toUpperCase() : '';
  if (!FORMATO_NUMERO.test(numero)) {
    return erroDeValidacao('O Número precisa ter o formato F-NNN, como F-023');
  }

  const dados = lerDados(corpo);
  if ('erro' in dados) {
    return erroDeValidacao(dados.erro);
  }

  if (await buscarLinha(numero, env)) {
    return erroDeValidacao('Já existe uma Ferramenta com este Número');
  }

  const agora = relogio().toISOString();
  try {
    await env.DB.prepare(
      `INSERT INTO ferramentas
         (numero, nome, categoria, marca, modelo, especificacao, numero_serie, aquisicao, observacoes, estado, criado_em, atualizado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'disponivel', ?, ?)`,
    )
      .bind(
        numero,
        dados.nome,
        dados.categoria,
        dados.marca,
        dados.modelo,
        dados.especificacao,
        dados.numeroSerie,
        dados.aquisicao,
        dados.observacoes,
        agora,
        agora,
      )
      .run();
  } catch (erro) {
    // Duas requisições com o mesmo Número podem passar pela checagem acima ao mesmo tempo; a chave primária decide.
    if (erro instanceof Error && erro.message.includes('UNIQUE constraint failed')) {
      return erroDeValidacao('Já existe uma Ferramenta com este Número');
    }

    throw erro;
  }

  const linha = await buscarLinha(numero, env);
  return Response.json(paraFerramenta(linha as LinhaFerramenta), { status: 201 });
}

async function editar(numero: string, request: Request, env: Env, relogio: Relogio): Promise<Response> {
  if (!(await buscarLinha(numero, env))) {
    return naoEncontrada();
  }

  const dados = lerDados(await lerCorpo(request));
  if ('erro' in dados) {
    return erroDeValidacao(dados.erro);
  }

  // O Número não está no corpo: é a chave da Ficha e nunca muda depois do cadastro.
  await env.DB.prepare(
    `UPDATE ferramentas
        SET nome = ?, categoria = ?, marca = ?, modelo = ?, especificacao = ?,
            numero_serie = ?, aquisicao = ?, observacoes = ?, atualizado_em = ?
      WHERE numero = ?`,
  )
    .bind(
      dados.nome,
      dados.categoria,
      dados.marca,
      dados.modelo,
      dados.especificacao,
      dados.numeroSerie,
      dados.aquisicao,
      dados.observacoes,
      relogio().toISOString(),
      numero,
    )
    .run();

  return Response.json(paraFerramenta((await buscarLinha(numero, env)) as LinhaFerramenta));
}

/** Dados da Ficha vindos do corpo da requisição, ou a mensagem do primeiro campo inválido. */
function lerDados(corpo: Record<string, unknown> | null): DadosFerramenta | { erro: string } {
  const nome = textoDe(corpo?.nome) ?? '';
  if (!nome) {
    return { erro: 'Informe o nome da Ferramenta' };
  }

  const categoria = textoDe(corpo?.categoria) ?? '';
  if (!(CATEGORIAS as readonly string[]).includes(categoria)) {
    return { erro: 'Escolha uma categoria da lista' };
  }

  return {
    nome,
    categoria,
    marca: textoDe(corpo?.marca),
    modelo: textoDe(corpo?.modelo),
    especificacao: textoDe(corpo?.especificacao),
    numeroSerie: textoDe(corpo?.numeroSerie),
    aquisicao: textoDe(corpo?.aquisicao),
    observacoes: textoDe(corpo?.observacoes),
  };
}

function textoDe(valor: unknown): string | null {
  if (typeof valor !== 'string') {
    return null;
  }

  return valor.trim() || null;
}

function pertenceAoFiltro(estado: Estado, filtro: Filtro): boolean {
  switch (filtro) {
    case 'todas':
      return estado === 'disponivel' || estado === 'com_problema';
    case 'no_almoxarifado':
      return estado === 'disponivel';
    case 'com_problema':
      return estado === 'com_problema';
    case 'baixadas_extraviadas':
      return estado === 'baixada' || estado === 'extraviada';
    // Fora e Atrasada dependem de Retiradas, que entram na próxima fatia.
    case 'fora':
    case 'atrasada':
      return false;
  }
}

function buscaCasa(linha: LinhaFerramenta, texto: string): boolean {
  return [linha.numero, linha.nome, linha.marca, linha.modelo].some((campo) =>
    (campo ?? '').toLowerCase().includes(texto),
  );
}

function isFiltro(valor: string): valor is Filtro {
  return (FILTROS as string[]).includes(valor);
}

/** Segmento da URL decodificado, ou null quando a codificação % está malformada. */
function decodificar(segmento: string): string | null {
  try {
    return decodeURIComponent(segmento);
  } catch {
    return null;
  }
}

function numeroEmInteiro(numero: string): number {
  return Number.parseInt(numero.slice(2), 10);
}

function formatarNumero(valor: number): string {
  return `F-${String(valor).padStart(3, '0')}`;
}

async function todasAsLinhas(env: Env): Promise<LinhaFerramenta[]> {
  const { results } = await env.DB.prepare(`SELECT ${COLUNAS} FROM ferramentas ORDER BY numero`).all<LinhaFerramenta>();
  return results;
}

async function buscarLinha(numero: string, env: Env): Promise<LinhaFerramenta | null> {
  return env.DB.prepare(`SELECT ${COLUNAS} FROM ferramentas WHERE numero = ?`)
    .bind(numero)
    .first<LinhaFerramenta>();
}

function paraFerramenta(linha: LinhaFerramenta): Ferramenta {
  // Situação exibida: derivada aqui, na API. A tela só mostra o que vem daqui.
  return {
    numero: linha.numero,
    nome: linha.nome,
    categoria: linha.categoria,
    marca: linha.marca,
    modelo: linha.modelo,
    especificacao: linha.especificacao,
    numeroSerie: linha.numero_serie,
    aquisicao: linha.aquisicao,
    observacoes: linha.observacoes,
    situacao: SITUACAO_DO_ESTADO[linha.estado],
    criadoEm: linha.criado_em,
    atualizadoEm: linha.atualizado_em,
  };
}

function naoEncontrada(): Response {
  return Response.json({ erro: 'Ferramenta não encontrada' }, { status: 404 });
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
