-- Retiradas: uma Ferramenta sai do almoxarifado com um Funcionário e volta numa Devolução.
-- Enquanto devolvida_em é NULL, a Retirada está aberta e o Funcionário é o Responsável.
CREATE TABLE retiradas (
  id INTEGER PRIMARY KEY,
  ferramenta_numero TEXT NOT NULL REFERENCES ferramentas (numero),
  funcionario_id INTEGER NOT NULL REFERENCES funcionarios (id),
  retirada_em TEXT NOT NULL,
  registrada_por INTEGER NOT NULL REFERENCES usuarios (id),
  devolvida_em TEXT,
  resultado TEXT CHECK (resultado IN ('ok', 'com_problema')),
  observacao TEXT,
  devolucao_registrada_por INTEGER REFERENCES usuarios (id)
);

-- No máximo uma Retirada aberta por Ferramenta: a regra vale até no banco, mesmo com requisições simultâneas.
CREATE UNIQUE INDEX retiradas_abertas_por_ferramenta ON retiradas (ferramenta_numero) WHERE devolvida_em IS NULL;
CREATE INDEX retiradas_funcionario ON retiradas (funcionario_id);
