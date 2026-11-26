-- Problemas: uma Devolução Com Problema gera um Problema, que aguarda destino (Liberada ou Baixada) até ser resolvido.
-- O destino fica nulo enquanto o Problema aguarda; a resolução entra numa fatia própria.
CREATE TABLE problemas (
  id INTEGER PRIMARY KEY,
  ferramenta_numero TEXT NOT NULL REFERENCES ferramentas (numero),
  retirada_id INTEGER NOT NULL UNIQUE REFERENCES retiradas (id),
  funcionario_id INTEGER NOT NULL REFERENCES funcionarios (id),
  descricao TEXT NOT NULL CHECK (length(trim(descricao)) > 0),
  registrado_em TEXT NOT NULL,
  destino TEXT CHECK (destino IN ('liberada', 'baixada')),
  destino_em TEXT,
  destino_registrado_por INTEGER REFERENCES usuarios (id)
);

CREATE INDEX problemas_ferramenta ON problemas (ferramenta_numero);
