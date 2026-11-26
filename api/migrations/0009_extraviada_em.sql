-- Extravio não é Devolução: a Retirada extraviada fica com devolvida_em nulo e ganha a data em extraviada_em.
-- Uma Retirada está aberta enquanto não tiver nem Devolução nem Extravio.
ALTER TABLE retiradas ADD COLUMN extraviada_em TEXT;

-- Corrige as Retiradas extraviadas gravadas pela migração 0008, que tinham o extravio como devolvida_em.
UPDATE retiradas SET extraviada_em = devolvida_em, devolvida_em = NULL WHERE resultado = 'extraviada';

DROP INDEX retiradas_abertas_por_ferramenta;
CREATE UNIQUE INDEX retiradas_abertas_por_ferramenta ON retiradas (ferramenta_numero)
  WHERE devolvida_em IS NULL AND extraviada_em IS NULL;
