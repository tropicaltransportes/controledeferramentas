import type { Env } from './env';
import { estaAtrasada } from './expediente';
import type { Relogio } from './relogio';

/** Quantas atividades recentes o Painel mostra (cada tipo busca até este limite antes de juntar). */
const LIMITE_ATIVIDADES = 20;
const LIMITE_RANKING = 5;
const JANELA_RANKING_MS = 30 * 86_400_000;

const FORMATO_DIA_SP = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' });

/** Dia do calendário de São Paulo (AAAA-MM-DD) de um instante ISO. */
function diaDeSaoPaulo(instante: string): string {
  return FORMATO_DIA_SP.format(new Date(instante));
}

interface Pessoa {
  id: number;
  nome: string;
}

interface Ferramenta {
  numero: string;
  nome: string;
}

export interface Atrasada {
  ferramenta: Ferramenta;
  /** Responsável: o Funcionário da Retirada aberta. */
  responsavel: Pessoa;
  retiradaEm: string;
}

export interface Atividade {
  tipo: 'retirada' | 'devolucao_ok' | 'devolucao_com_problema' | 'extraviada';
  em: string;
  funcionario: Pessoa;
  ferramenta: Ferramenta;
  /** Descrição do problema, nas Devoluções Com Problema. */
  descricao: string | null;
}

export interface Painel {
  indicadores: {
    /** Ferramentas disponíveis com Retirada aberta e ainda no prazo. */
    foraAgora: number;
    atrasadas: number;
    comProblema: number;
    noAlmoxarifado: number;
    retiradasHoje: number;
    funcionariosComFerramenta: number;
  };
  atrasadas: Atrasada[];
  atividades: Atividade[];
  maisRetiradas: { funcionario: Pessoa; total: number }[];
}

interface LinhaAberta {
  numero: string;
  ferramentaNome: string;
  estado: string;
  funcionarioId: number;
  funcionarioNome: string;
  retiradaEm: string;
}

interface LinhaRetirada {
  retiradaEm: string;
  funcionarioId: number;
  funcionarioNome: string;
}

interface LinhaAtividade {
  numero: string;
  ferramentaNome: string;
  funcionarioId: number;
  funcionarioNome: string;
  em: string;
  resultado: string | null;
  observacao: string | null;
}

const CONSULTA_ABERTAS = `SELECT r.ferramenta_numero AS numero, fe.nome AS ferramentaNome, fe.estado,
    f.id AS funcionarioId, f.nome AS funcionarioNome, r.retirada_em AS retiradaEm
  FROM retiradas r
  JOIN funcionarios f ON f.id = r.funcionario_id
  JOIN ferramentas fe ON fe.numero = r.ferramenta_numero
  WHERE r.devolvida_em IS NULL AND r.extraviada_em IS NULL`;

/** Roteia /painel (GET). Quem chega aqui já está autenticado. */
export async function tratarPainel(_request: Request, env: Env, relogio: Relogio): Promise<Response> {
  const agora = relogio();
  const agoraIso = agora.toISOString();

  const [abertas, noAlmoxarifado, comProblema, retiradasRecentes, atividades] = await Promise.all([
    env.DB.prepare(CONSULTA_ABERTAS).all<LinhaAberta>(),
    env.DB.prepare(
      `SELECT COUNT(*) AS total FROM ferramentas fe
        WHERE fe.estado = 'disponivel'
          AND NOT EXISTS (SELECT 1 FROM retiradas r WHERE r.ferramenta_numero = fe.numero AND r.devolvida_em IS NULL AND r.extraviada_em IS NULL)`,
    ).first<{ total: number }>(),
    env.DB.prepare(`SELECT COUNT(*) AS total FROM ferramentas WHERE estado = 'com_problema'`).first<{ total: number }>(),
    env.DB.prepare(
      `SELECT r.retirada_em AS retiradaEm, f.id AS funcionarioId, f.nome AS funcionarioNome
         FROM retiradas r
         JOIN funcionarios f ON f.id = r.funcionario_id
        WHERE r.retirada_em >= ?`,
    )
      .bind(new Date(agora.getTime() - JANELA_RANKING_MS).toISOString())
      .all<LinhaRetirada>(),
    buscarAtividades(env),
  ]);

  const emAberto = abertas.results.filter((linha) => linha.estado === 'disponivel');
  const atrasadas = emAberto
    .filter((linha) => estaAtrasada(linha.retiradaEm, agora))
    .sort((a, b) => a.retiradaEm.localeCompare(b.retiradaEm))
    .map(paraAtrasada);

  const diaDeHoje = diaDeSaoPaulo(agoraIso);
  const retiradasHoje = retiradasRecentes.results.filter((linha) => diaDeSaoPaulo(linha.retiradaEm) === diaDeHoje).length;

  const painel: Painel = {
    indicadores: {
      foraAgora: emAberto.length - atrasadas.length,
      atrasadas: atrasadas.length,
      comProblema: comProblema?.total ?? 0,
      noAlmoxarifado: noAlmoxarifado?.total ?? 0,
      retiradasHoje,
      funcionariosComFerramenta: new Set(abertas.results.map((linha) => linha.funcionarioId)).size,
    },
    atrasadas,
    atividades,
    maisRetiradas: rankingDeRetiradas(retiradasRecentes.results),
  };

  return Response.json(painel);
}

function paraAtrasada(linha: LinhaAberta): Atrasada {
  return {
    ferramenta: { numero: linha.numero, nome: linha.ferramentaNome },
    responsavel: { id: linha.funcionarioId, nome: linha.funcionarioNome },
    retiradaEm: linha.retiradaEm,
  };
}

/** Top 5 de Funcionários por Retiradas. Empate: ordem alfabética. */
function rankingDeRetiradas(retiradas: LinhaRetirada[]): Painel['maisRetiradas'] {
  const totais = new Map<number, { funcionario: Pessoa; total: number }>();
  for (const retirada of retiradas) {
    const atual = totais.get(retirada.funcionarioId);
    if (atual) {
      atual.total += 1;
    } else {
      totais.set(retirada.funcionarioId, {
        funcionario: { id: retirada.funcionarioId, nome: retirada.funcionarioNome },
        total: 1,
      });
    }
  }

  return [...totais.values()]
    .sort((a, b) => b.total - a.total || a.funcionario.nome.localeCompare(b.funcionario.nome, 'pt-BR'))
    .slice(0, LIMITE_RANKING);
}

/** Retiradas, Devoluções e Extraviadas recentes, do mais recente para o mais antigo. */
async function buscarAtividades(env: Env): Promise<Atividade[]> {
  const base = `SELECT r.id, r.ferramenta_numero AS numero, fe.nome AS ferramentaNome,
      f.id AS funcionarioId, f.nome AS funcionarioNome, r.resultado, r.observacao`;
  const juncao = `FROM retiradas r
    JOIN funcionarios f ON f.id = r.funcionario_id
    JOIN ferramentas fe ON fe.numero = r.ferramenta_numero`;

  const [retiradas, devolucoes, extravios] = await Promise.all([
    env.DB.prepare(`${base}, r.retirada_em AS em ${juncao} ORDER BY em DESC LIMIT ?`).bind(LIMITE_ATIVIDADES).all<LinhaAtividade>(),
    env.DB.prepare(
      `${base}, r.devolvida_em AS em ${juncao} WHERE r.devolvida_em IS NOT NULL ORDER BY em DESC LIMIT ?`,
    )
      .bind(LIMITE_ATIVIDADES)
      .all<LinhaAtividade>(),
    env.DB.prepare(
      `${base}, r.extraviada_em AS em ${juncao} WHERE r.extraviada_em IS NOT NULL ORDER BY em DESC LIMIT ?`,
    )
      .bind(LIMITE_ATIVIDADES)
      .all<LinhaAtividade>(),
  ]);

  const todas: Atividade[] = [
    ...retiradas.results.map((linha) => paraAtividade(linha, 'retirada')),
    ...devolucoes.results.map((linha) =>
      paraAtividade(linha, linha.resultado === 'com_problema' ? 'devolucao_com_problema' : 'devolucao_ok'),
    ),
    ...extravios.results.map((linha) => paraAtividade(linha, 'extraviada')),
  ];

  // Datas ISO em UTC com o mesmo formato: a ordem de texto é a ordem cronológica.
  return todas.sort((a, b) => (a.em < b.em ? 1 : a.em > b.em ? -1 : 0)).slice(0, LIMITE_ATIVIDADES);
}

function paraAtividade(linha: LinhaAtividade, tipo: Atividade['tipo']): Atividade {
  return {
    tipo,
    em: linha.em,
    funcionario: { id: linha.funcionarioId, nome: linha.funcionarioNome },
    ferramenta: { numero: linha.numero, nome: linha.ferramentaNome },
    descricao: tipo === 'devolucao_com_problema' ? linha.observacao : null,
  };
}
