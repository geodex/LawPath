-- 023_fix_truncated_corpus_titles.sql
-- Repair mid-word truncated titles produced by the old indexer's
-- content.slice(0, 120) fallback.
--
-- Heuristic: title length 100..130 chars AND doesn't end with a sentence
-- boundary (.!? or closing parenthesis or quote) → almost certainly a
-- truncated body fallback. Replace with the citation if we have one,
-- otherwise mark as "Untitled judgment — see source".
-- Safe to re-run: it only updates rows that still match the heuristic.

update legal_corpus_documents
   set title = case
                 when citation is not null and length(citation) > 0
                      then concat(citation, ' — ', coalesce(court, 'SA court'))
                 when court is not null
                      then concat('Judgment — ', court, case when year is not null then concat(' (', year, ')') else '' end)
                 else 'Untitled judgment — see source link'
               end
 where length(title) between 100 and 130
   and title !~ '[.!?\)\"”]\s*$';
