// Histórico de uso de uma Ferramenta ou de um Funcionário, como a API devolve. Os textos de exibição ficam aqui.

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
export function rotuloResultado(resultado: RetiradaHistorico['resultado']): string {
  if (resultado === 'ok') {
    return 'OK';
  }

  return resultado === 'com_problema' ? 'Com Problema' : 'Em aberto';
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
