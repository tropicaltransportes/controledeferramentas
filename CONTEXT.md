# Controle de Ferramentas

Controle das ferramentas do almoxarifado da oficina que saem para uso e precisam voltar, para saber a qualquer momento com quem cada uma está.

## Language

**Ferramenta**:
Uma unidade física e identificável do almoxarifado que sai para uso e volta. Duas peças do mesmo modelo são duas Ferramentas distintas.
_Avoid_: Item, equipamento, material

**Número da Ferramenta**:
O código curto que identifica uma Ferramenta e fica etiquetado nela (ex.: `F-023`).
_Avoid_: Patrimônio, tag, código de barras

**Ficha da Ferramenta**:
Os dados descritivos de uma Ferramenta (nome, categoria, marca, modelo, especificação, nº de série, aquisição, foto), mantidos pelo Almoxarife e pelo Gestor.
_Avoid_: Ficha técnica, cadastro, item

**Almoxarife**:
A pessoa responsável pelo almoxarifado e a única que registra Retiradas e Devoluções. Sem Almoxarife, o almoxarifado fica trancado.
_Avoid_: Estoquista, responsável

**Gestor**:
O responsável pela oficina. Acompanha tudo e pode corrigir cadastros de Ferramentas e Funcionários, mas não registra Retiradas nem Devoluções.
_Avoid_: Admin, supervisor

**Funcionário**:
Uma pessoa da lista cadastrada que pode fazer Retiradas. Quem não está na lista não retira.
_Avoid_: Mecânico, colaborador, usuário

**Funcionário Inativo**:
Um Funcionário que saiu da empresa ou está afastado. Não faz novas Retiradas, mas suas Retiradas abertas continuam em aberto.
_Avoid_: Desligado, bloqueado

**Retirada**:
O registro de que uma Ferramenta saiu do almoxarifado nas mãos de um Funcionário específico. Enquanto não há Devolução, esse Funcionário é o Responsável pela Ferramenta, mesmo que a tenha repassado a outro.
_Avoid_: Saída, empréstimo, cautela

**Responsável**:
O Funcionário da Retirada aberta de uma Ferramenta.
_Avoid_: Portador, dono

**Devolução**:
O registro de que uma Ferramenta retirada voltou ao almoxarifado, marcada como OK ou Com Problema.
_Avoid_: Retorno, entrada

**Retirada Atrasada**:
Uma Retirada sem Devolução depois do fim do Expediente do dia em que foi feita.
_Avoid_: Pendência, vencida

**Expediente**:
O horário de funcionamento da oficina: segunda a sexta até 19h e sábado até 13h.
_Avoid_: Turno, jornada

**Com Problema**:
A situação de uma Ferramenta que voltou danificada ou com defeito. Ela fica fora de circulação até ser liberada.
_Avoid_: Avariada, quebrada, em manutenção

**Liberada**:
O destino de uma Ferramenta Com Problema que volta a circular.

**Baixada**:
O destino de uma Ferramenta que sai definitivamente do almoxarifado por não ter conserto. Permanece no histórico.
_Avoid_: Descartada, excluída

**Extraviada**:
A situação de uma Ferramenta dada como perdida. Encerra a Retirada sem Devolução, e o Responsável fica registrado para sempre.
_Avoid_: Perdida, sumida, desaparecida

## Fora de escopo

- Ferramentas das maletas individuais dos funcionários.
- Consumíveis (discos, brocas, lixas, EPI descartável): saem e não voltam.
