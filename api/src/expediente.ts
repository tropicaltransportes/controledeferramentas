/**
 * Expediente da oficina, em horário de São Paulo (o Worker roda em UTC).
 * Segunda a sexta até 19h, sábado até 13h, domingo fechado. Feriados não contam.
 */

const FUSO = 'America/Sao_Paulo';

/** Hora de fechamento por dia da semana (0 = domingo). Null quando não abre. */
const FECHAMENTO_POR_DIA: (number | null)[] = [null, 19, 19, 19, 19, 19, 13];

interface DataLocal {
  ano: number;
  mes: number; // 1 a 12
  dia: number;
  hora: number;
  minuto: number;
}

const formatador = new Intl.DateTimeFormat('en-US', {
  timeZone: FUSO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Data e hora de São Paulo de um instante. */
function dataLocal(instante: Date): DataLocal {
  const partes = Object.fromEntries(formatador.formatToParts(instante).map((p) => [p.type, p.value]));

  return {
    ano: Number(partes.year),
    mes: Number(partes.month),
    dia: Number(partes.day),
    hora: Number(partes.hour),
    minuto: Number(partes.minute),
  };
}

/** Instante em que um dia e hora de São Paulo acontecem. Confere o fuso no próprio dia, sem depender de UTC. */
function instanteDe(ano: number, mes: number, dia: number, hora: number): Date {
  const comoUtc = Date.UTC(ano, mes - 1, dia, hora);
  const local = dataLocal(new Date(comoUtc));
  const deslocamento = Date.UTC(local.ano, local.mes - 1, local.dia, local.hora, local.minuto) - comoUtc;

  return new Date(comoUtc - deslocamento);
}

function diaDaSemana(ano: number, mes: number, dia: number): number {
  return new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
}

/** Prazo da Retirada: o fim do Expediente em que ela deve voltar. */
export function prazoDaRetirada(retiradaEm: string): Date {
  const momento = new Date(retiradaEm);
  const local = dataLocal(momento);
  const fechamentoHoje = FECHAMENTO_POR_DIA[diaDaSemana(local.ano, local.mes, local.dia)];

  // Dentro do Expediente do próprio dia: vale o fechamento de hoje.
  if (fechamentoHoje !== null && local.hora * 60 + local.minuto < fechamentoHoje * 60) {
    return instanteDe(local.ano, local.mes, local.dia, fechamentoHoje);
  }

  // Fora do Expediente (depois do fechamento ou no domingo): vale o fim do próximo Expediente.
  for (let deslocamento = 1; deslocamento <= 7; deslocamento++) {
    const seguinte = new Date(Date.UTC(local.ano, local.mes - 1, local.dia + deslocamento));
    const ano = seguinte.getUTCFullYear();
    const mes = seguinte.getUTCMonth() + 1;
    const dia = seguinte.getUTCDate();
    const fechamento = FECHAMENTO_POR_DIA[seguinte.getUTCDay()];

    if (fechamento !== null) {
      return instanteDe(ano, mes, dia, fechamento);
    }
  }

  throw new Error('Expediente sem nenhum dia de funcionamento');
}

/** Uma Retirada aberta está Atrasada quando o agora passou do seu prazo. */
export function estaAtrasada(retiradaEm: string, agora: Date): boolean {
  return agora.getTime() > prazoDaRetirada(retiradaEm).getTime();
}
