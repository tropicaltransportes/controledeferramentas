// Histórico de uso de uma Ferramenta ou de um Funcionário, como a API devolve. Os textos de exibição ficam aqui.

/** Resultado de uma Devolução; null enquanto a Retirada está aberta. */
export type Resultado = 'ok' | 'com_problema';

export interface RetiradaHistorico {
  id: number;
  ferramenta: { numero: string; nome: string };
  funcionario: { id: number; nome: string };
  retiradaEm: string;
  devolvidaEm: string | null;
  resultado: Resultado | null;
  observacao: string | null;
}

export interface ProblemaHistorico {
  id: number;
  responsavel: { id: number; nome: string };
  descricao: string;
  registradoEm: string;
  destino: 'liberada' | 'baixada' | null;
  destinoEm: string | null;
}

/** Linha da lista de registros da Ficha, já com o texto e a cor prontos. */
export interface Registro {
  chave: string;
  data: string;
  titulo: string;
  detalhe: string;
  situacao: string;
  classe: string;
}

export interface ResumoUso {
  totalRetiradas: number;
  totalProblemas: number;
  funcionariosQueUsaram: number;
  tempoForaMs: number;
}

export interface HistoricoFerramenta {
  numero: string;
  retiradas: RetiradaHistorico[];
  problemas: ProblemaHistorico[];
  resumo: ResumoUso;
}

export function dataCurta(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR');
}

export function dataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Rótulo do resultado de uma Devolução; Retirada ainda aberta mostra "Em aberto". */
export function rotuloResultado(resultado: Resultado | null): string {
  if (resultado === 'ok') {
    return 'OK';
  }

  return resultado === 'com_problema' ? 'Com Problema' : 'Em aberto';
}

export function classeResultado(resultado: Resultado | null): string {
  if (resultado === 'ok') {
    return 'b-disp';
  }

  return resultado === 'com_problema' ? 'b-prob' : 'b-fora';
}

export function rotuloDestino(destino: ProblemaHistorico['destino']): string {
  if (destino === null) {
    return 'Aguardando destino';
  }

  return destino === 'liberada' ? 'Liberada' : 'Baixada';
}

export function registroDaRetirada(retirada: RetiradaHistorico): Registro {
  const devolucao = retirada.devolvidaEm ? ` · devolvida em ${dataHora(retirada.devolvidaEm)}` : '';

  return {
    chave: `retirada-${retirada.id}`,
    data: retirada.retiradaEm,
    titulo: retirada.funcionario.nome,
    detalhe: `retirada em ${dataHora(retirada.retiradaEm)}${devolucao}`,
    situacao: rotuloResultado(retirada.resultado),
    classe: classeResultado(retirada.resultado),
  };
}

export function registroDoProblema(problema: ProblemaHistorico): Registro {
  return {
    chave: `problema-${problema.id}`,
    data: problema.registradoEm,
    titulo: problema.descricao,
    detalhe: `${problema.responsavel.nome} · registrado em ${dataHora(problema.registradoEm)}`,
    situacao: rotuloDestino(problema.destino),
    classe: problema.destino ? 'b-off' : 'b-prob',
  };
}

/** Tempo fora em dias e horas, sem segundos. */
export function tempoFora(ms: number): string {
  const minutos = Math.floor(ms / 60_000);
  const dias = Math.floor(minutos / 1440);
  const horas = Math.floor((minutos % 1440) / 60);

  if (dias > 0) {
    return `${dias} d ${horas} h`;
  }

  return horas > 0 ? `${horas} h` : 'menos de 1 h';
}
