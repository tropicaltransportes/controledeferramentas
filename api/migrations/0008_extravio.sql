-- Extravio: a Retirada encerrada sem Devolução ganha o resultado 'extraviada'.
-- SQLite não altera um CHECK existente, então a tabela é recriada com os mesmos dados.
-- defer_foreign_keys adia a conferência das chaves de problemas até o fim da migração, quando a tabela já tem o nome certo.
PRAGMA defer_foreign_keys = ON;

CREATE TABLE retiradas_nova (
  id INTEGER PRIMARY KEY,
  ferramenta_numero TEXT NOT NULL REFERENCES ferramentas (numero),
  funcionario_id INTEGER NOT NULL REFERENCES funcionarios (id),
  retirada_em TEXT NOT NULL,
  registrada_por INTEGER NOT NULL REFERENCES usuarios (id),
  devolvida_em TEXT,
  resultado TEXT CHECK (resultado IN ('ok', 'com_problema', 'extraviada')),
  observacao TEXT,
  devolucao_registrada_por INTEGER REFERENCES usuarios (id)
);

INSERT INTO retiradas_nova SELECT * FROM retiradas;

DROP TABLE retiradas;
ALTER TABLE retiradas_nova RENAME TO retiradas;

CREATE UNIQUE INDEX retiradas_abertas_por_ferramenta ON retiradas (ferramenta_numero) WHERE devolvida_em IS NULL;
CREATE INDEX retiradas_funcionario ON retiradas (funcionario_id);
