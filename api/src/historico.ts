import type { Env } from './env';
import type { Relogio } from './relogio';

/** Uma Retirada no histórico: aberta enquanto `devolvidaEm` é null. */
export interface RetiradaHistorico {
  id: number;
  ferramenta: { numero: string; nome: string };
  funcionario: { id: number; nome: string };
  retiradaEm: string;
  devolvidaEm: string | null;
  resultado: 'ok' | 'com_problema' | null;
  observacao: string | null;
}

export interface ProblemaHistorico {
  id: number;
  /** Funcionário da Retirada de origem. */
  responsavel: { id: number; nome: string };
  descricao: string;
  registradoEm: string;
  destino: 'liberada' | 'baixada' | null;
  destinoEm: string | null;
}

export interface ResumoUso {
  totalRetiradas: number;
  totalProblemas: number;
  funcionariosQueUsaram: number;
  /** Soma do tempo fora de todas as Retiradas. A Retirada aberta conta até agora. */
  tempoForaMs: number;
}

interface LinhaRetirada {
  id: number;
  numero: string;
  ferramentaNome: string;
  funcionarioId: number;
  funcionarioNome: string;
  retiradaEm: string;
  devolvidaEm: string | null;
  resultado: 'ok' | 'com_problema' | null;
  observacao: string | null;
}

interface LinhaProblema {
  id: number;
  funcionarioId: number;
  funcionarioNome: string;
  descricao: string;
  registradoEm: string;
  destino: 'liberada' | 'baixada' | null;
  destinoEm: string | null;
}

const CONSULTA_RETIRADAS = `SELECT r.id, r.ferramenta_numero AS numero, fe.nome AS ferramentaNome,
    f.id AS funcionarioId, f.nome AS funcionarioNome, r.retirada_em AS retiradaEm,
    r.devolvida_em AS devolvidaEm, r.resultado, r.observacao
  FROM retiradas r
  JOIN funcionarios f ON f.id = r.funcionario_id
  JOIN ferramentas fe ON fe.numero = r.ferramenta_numero`;

const ORDEM_RETIRADAS = 'ORDER BY r.retirada_em DESC, r.id DESC';

/** Retiradas de uma Ferramenta, da mais recente para a mais antiga. */
export async function retiradasDaFerramenta(env: Env, numero: string): Promise<RetiradaHistorico[]> {
  const { results } = await env.DB.prepare(`${CONSULTA_RETIRADAS} WHERE r.ferramenta_numero = ? ${ORDEM_RETIRADAS}`)
    .bind(numero)
    .all<LinhaRetirada>();

  return results.map(paraRetirada);
}

/** Retiradas de um Funcionário, da mais recente para a mais antiga. */
export async function retiradasDoFuncionario(env: Env, funcionarioId: number): Promise<RetiradaHistorico[]> {
  const { results } = await env.DB.prepare(`${CONSULTA_RETIRADAS} WHERE r.funcionario_id = ? ${ORDEM_RETIRADAS}`)
    .bind(funcionarioId)
    .all<LinhaRetirada>();

  return results.map(paraRetirada);
}

/** Problemas de uma Ferramenta, do mais recente para o mais antigo. */
export async function problemasDaFerramenta(env: Env, numero: string): Promise<ProblemaHistorico[]> {
  const { results } = await env.DB.prepare(
    `SELECT p.id, f.id AS funcionarioId, f.nome AS funcionarioNome, p.descricao,
            p.registrado_em AS registradoEm, p.destino, p.destino_em AS destinoEm
       FROM problemas p
       JOIN funcionarios f ON f.id = p.funcionario_id
      WHERE p.ferramenta_numero = ?
      ORDER BY p.registrado_em DESC, p.id DESC`,
  )
    .bind(numero)
    .all<LinhaProblema>();

  return results.map((linha) => ({
    id: linha.id,
    responsavel: { id: linha.funcionarioId, nome: linha.funcionarioNome },
    descricao: linha.descricao,
    registradoEm: linha.registradoEm,
    destino: linha.destino,
    destinoEm: linha.destinoEm,
  }));
}

export function resumirUso(
  retiradas: RetiradaHistorico[],
  problemas: ProblemaHistorico[],
  relogio: Relogio,
): ResumoUso {
  const agora = relogio().getTime();
  const tempoForaMs = retiradas.reduce((total, retirada) => {
    const fim = retirada.devolvidaEm ? Date.parse(retirada.devolvidaEm) : agora;
    return total + (fim - Date.parse(retirada.retiradaEm));
  }, 0);

  return {
    totalRetiradas: retiradas.length,
    totalProblemas: problemas.length,
    funcionariosQueUsaram: new Set(retiradas.map((retirada) => retirada.funcionario.id)).size,
    tempoForaMs,
  };
}

function paraRetirada(linha: LinhaRetirada): RetiradaHistorico {
  return {
    id: linha.id,
    ferramenta: { numero: linha.numero, nome: linha.ferramentaNome },
    funcionario: { id: linha.funcionarioId, nome: linha.funcionarioNome },
    retiradaEm: linha.retiradaEm,
    devolvidaEm: linha.devolvidaEm,
    resultado: linha.resultado,
    observacao: linha.observacao,
  };
}
