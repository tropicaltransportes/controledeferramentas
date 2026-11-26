import type { Env } from './env';
import { estaAtrasada } from './expediente';
import { problemasDaFerramenta, resumirUso, retiradasDaFerramenta } from './historico';
import type { Relogio } from './relogio';
import { buscarPosses, type Posse } from './retiradas';

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
type Situacao = 'no_almoxarifado' | 'fora' | 'atrasada' | 'com_problema' | 'baixada' | 'extraviada';
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

// Foto acima deste tamanho é recusada. O navegador reduz a imagem antes do envio para caber.
const TAMANHO_MAXIMO_FOTO = 200 * 1024;
const MENSAGEM_FOTO_GRANDE = 'A foto passa de 200 KB. Reduza a imagem e tente de novo';
// Só formatos raster: SVG pode carregar script e não entra como foto.
const TIPOS_FOTO = ['image/jpeg', 'image/png', 'image/webp'];

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
  foto_tipo: string | null;
  estado: Estado;
  criado_em: string;
  atualizado_em: string;
}

// Os bytes da foto (BLOB) ficam de fora: só a rota de foto os lê.
const COLUNAS = `numero, nome, categoria, marca, modelo, especificacao, numero_serie,
  aquisicao, observacoes, foto_tipo, estado, criado_em, atualizado_em`;

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
  temFoto: boolean;
  situacao: Situacao;
  /** Quem está com a Ferramenta agora (Retirada aberta), ou null quando não há Retirada aberta. */
  responsavel: Posse | null;
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
    return listar(url.searchParams, env, relogio);
  }

  if (request.method === 'GET' && pathname === '/ferramentas/categorias') {
    return Response.json({ categorias: CATEGORIAS });
  }

  if (request.method === 'GET' && pathname === '/ferramentas/proximo-numero') {
    return proximoNumero(env);
  }

  if (request.method === 'POST' && pathname === '/ferramentas') {
    return cadastrar(request, env, relogio);
  }

  const numeroDaFoto = pathname.match(/^\/ferramentas\/([^/]+)\/foto$/)?.[1];
  if (numeroDaFoto && (request.method === 'GET' || request.method === 'PUT')) {
    const numero = decodificar(numeroDaFoto);
    if (numero === null) {
      return naoEncontrada();
    }

    return request.method === 'GET' ? lerFoto(numero, env) : enviarFoto(numero, request, env, relogio);
  }

  const numeroDoHistorico = pathname.match(/^\/ferramentas\/([^/]+)\/historico$/)?.[1];
  if (numeroDoHistorico && request.method === 'GET') {
    const numero = decodificar(numeroDoHistorico);
    if (numero === null) {
      return naoEncontrada();
    }

    return historico(numero, env, relogio);
  }

  const segmento = pathname.match(/^\/ferramentas\/([^/]+)$/)?.[1];
  if (segmento && (request.method === 'GET' || request.method === 'PUT')) {
    const numero = decodificar(segmento);
    if (numero === null) {
      return naoEncontrada();
    }

    return request.method === 'GET'
      ? obter(numero, env, relogio)
      : editar(numero, request, env, relogio);
  }

  return Response.json({ erro: 'Rota não encontrada' }, { status: 404 });
}

async function listar(params: URLSearchParams, env: Env, relogio: Relogio): Promise<Response> {
  const situacao = params.get('situacao') ?? 'todas';
  if (!isFiltro(situacao)) {
    return Response.json({ erro: 'Situação de filtro desconhecida' }, { status: 422 });
  }

  const categoria = params.get('categoria') ?? '';
  const texto = (params.get('texto') ?? '').trim().toLowerCase();

  const [linhas, posses] = await Promise.all([todasAsLinhas(env), buscarPosses(env)]);
  const filtradas = linhas.filter((linha) => {
    if (categoria && linha.categoria !== categoria) {
      return false;
    }

    return !texto || buscaCasa(linha, texto);
  });

  const agora = relogio();
  const porSituacao = filtradas.map((linha) => ({
    linha,
    situacao: situacaoDaFerramenta(linha.estado, posses.get(linha.numero), agora),
  }));

  const contagens = Object.fromEntries(
    FILTROS.map((filtro) => [filtro, porSituacao.filter((item) => pertenceAoFiltro(item.situacao, filtro)).length]),
  );

  return Response.json({
    itens: porSituacao
      .filter((item) => pertenceAoFiltro(item.situacao, situacao))
      .map((item) => paraFerramenta(item.linha, posses.get(item.linha.numero), agora)),
    contagens,
  });
}

async function proximoNumero(env: Env): Promise<Response> {
  const linhas = await todasAsLinhas(env);
  const maior = linhas.reduce((atual, linha) => Math.max(atual, numeroEmInteiro(linha.numero)), 0);

  return Response.json({ numero: formatarNumero(maior + 1) });
}

async function obter(numero: string, env: Env, relogio: Relogio): Promise<Response> {
  const linha = await buscarLinha(numero, env);
  if (!linha) {
    return naoEncontrada();
  }

  return Response.json(paraFerramenta(linha, (await buscarPosses(env, numero)).get(numero), relogio()));
}

/** Aba Histórico e aba Problemas da Ficha, além dos números de uso do Resumo. */
async function historico(numero: string, env: Env, relogio: Relogio): Promise<Response> {
  if (!(await buscarLinha(numero, env))) {
    return naoEncontrada();
  }

  const [retiradas, problemas] = await Promise.all([
    retiradasDaFerramenta(env, numero),
    problemasDaFerramenta(env, numero),
  ]);

  return Response.json({ numero, retiradas, problemas, resumo: resumirUso(retiradas, problemas, relogio) });
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
  return Response.json(paraFerramenta(linha as LinhaFerramenta, undefined, relogio()), { status: 201 });
}

async function editar(numero: string, request: Request, env: Env, relogio: Relogio): Promise<Response> {
  const atual = await buscarLinha(numero, env);
  if (!atual) {
    return naoEncontrada();
  }

  const dados = lerDados(await lerCorpo(request), paraDados(atual));
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

  return Response.json(paraFerramenta((await buscarLinha(numero, env)) as LinhaFerramenta, await posseDe(numero, env), relogio()));
}

/** Troca a foto da Ferramenta. O corpo é a própria imagem; o Content-Type dela é guardado junto. */
async function enviarFoto(numero: string, request: Request, env: Env, relogio: Relogio): Promise<Response> {
  if (!(await buscarLinha(numero, env))) {
    return naoEncontrada();
  }

  const tipo = (request.headers.get('Content-Type') ?? '').split(';')[0].trim().toLowerCase();
  if (!TIPOS_FOTO.includes(tipo)) {
    return erroDeValidacao('Envie a foto em JPEG, PNG ou WebP');
  }

  // Recusa antes de ler o corpo quando o próprio cliente já diz que é grande demais.
  if (Number(request.headers.get('Content-Length') ?? 0) > TAMANHO_MAXIMO_FOTO) {
    return erroDeValidacao(MENSAGEM_FOTO_GRANDE);
  }

  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > TAMANHO_MAXIMO_FOTO) {
    return erroDeValidacao(MENSAGEM_FOTO_GRANDE);
  }

  await env.DB.prepare('UPDATE ferramentas SET foto = ?, foto_tipo = ?, atualizado_em = ? WHERE numero = ?')
    .bind(new Uint8Array(bytes), tipo, relogio().toISOString(), numero)
    .run();

  return Response.json(paraFerramenta((await buscarLinha(numero, env)) as LinhaFerramenta, await posseDe(numero, env), relogio()));
}

async function lerFoto(numero: string, env: Env): Promise<Response> {
  const linha = await env.DB.prepare('SELECT foto, foto_tipo FROM ferramentas WHERE numero = ?')
    .bind(numero)
    .first<{ foto: ArrayBuffer | number[] | null; foto_tipo: string | null }>();

  if (!linha || linha.foto === null || linha.foto_tipo === null) {
    return naoEncontrada();
  }

  // O D1 devolve o BLOB como lista de bytes (ou ArrayBuffer, conforme o ambiente): Uint8Array aceita os dois.
  return new Response(new Uint8Array(linha.foto), {
    headers: { 'Content-Type': linha.foto_tipo, 'X-Content-Type-Options': 'nosniff' },
  });
}

/**
 * Dados da Ficha vindos do corpo, ou a mensagem do primeiro campo inválido.
 * Campo ausente do corpo mantém o valor atual (`atuais`); campo presente vazio vira null.
 */
function lerDados(
  corpo: Record<string, unknown> | null,
  atuais?: DadosFerramenta,
): DadosFerramenta | { erro: string } {
  const nome = campo(corpo, 'nome', atuais?.nome) ?? '';
  if (!nome) {
    return { erro: 'Informe o nome da Ferramenta' };
  }

  const categoria = campo(corpo, 'categoria', atuais?.categoria) ?? '';
  if (!(CATEGORIAS as readonly string[]).includes(categoria)) {
    return { erro: 'Escolha uma categoria da lista' };
  }

  return {
    nome,
    categoria,
    marca: campo(corpo, 'marca', atuais?.marca),
    modelo: campo(corpo, 'modelo', atuais?.modelo),
    especificacao: campo(corpo, 'especificacao', atuais?.especificacao),
    numeroSerie: campo(corpo, 'numeroSerie', atuais?.numeroSerie),
    aquisicao: campo(corpo, 'aquisicao', atuais?.aquisicao),
    observacoes: campo(corpo, 'observacoes', atuais?.observacoes),
  };
}

function campo(corpo: Record<string, unknown> | null, chave: string, atual: string | null | undefined): string | null {
  if (!corpo || corpo[chave] === undefined) {
    return atual ?? null;
  }

  return textoDe(corpo[chave]);
}

function paraDados(linha: LinhaFerramenta): DadosFerramenta {
  return {
    nome: linha.nome,
    categoria: linha.categoria,
    marca: linha.marca,
    modelo: linha.modelo,
    especificacao: linha.especificacao,
    numeroSerie: linha.numero_serie,
    aquisicao: linha.aquisicao,
    observacoes: linha.observacoes,
  };
}

function textoDe(valor: unknown): string | null {
  if (typeof valor !== 'string') {
    return null;
  }

  return valor.trim() || null;
}

/**
 * Fora vale quando a Ferramenta está disponível e com uma Retirada aberta.
 * Atrasada substitui Fora quando a Retirada passou do prazo do Expediente.
 */
function situacaoDaFerramenta(estado: Estado, posse: Posse | undefined, agora: Date): Situacao {
  if (estado === 'disponivel' && posse) {
    return estaAtrasada(posse.retiradaEm, agora) ? 'atrasada' : 'fora';
  }

  return SITUACAO_DO_ESTADO[estado];
}

function pertenceAoFiltro(situacao: Situacao, filtro: Filtro): boolean {
  switch (filtro) {
    case 'todas':
      return situacao !== 'baixada' && situacao !== 'extraviada';
    case 'no_almoxarifado':
      return situacao === 'no_almoxarifado';
    case 'fora':
      return situacao === 'fora';
    case 'atrasada':
      return situacao === 'atrasada';
    case 'com_problema':
      return situacao === 'com_problema';
    case 'baixadas_extraviadas':
      return situacao === 'baixada' || situacao === 'extraviada';
  }
}

async function posseDe(numero: string, env: Env): Promise<Posse | undefined> {
  return (await buscarPosses(env, numero)).get(numero);
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

function paraFerramenta(linha: LinhaFerramenta, posse: Posse | undefined, agora: Date): Ferramenta {
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
    temFoto: linha.foto_tipo !== null,
    situacao: situacaoDaFerramenta(linha.estado, posse, agora),
    responsavel: posse ?? null,
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
