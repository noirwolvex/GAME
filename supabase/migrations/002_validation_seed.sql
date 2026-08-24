insert into public.validation_words
  (word, normalized_word, category, aliases, status, confidence, source)
values
  ('محمد', 'محمد', 'human', array['محمّد'], 'accepted', 1.000, 'seed'),
  ('مريم', 'مريم', 'human', '{}', 'accepted', 1.000, 'seed'),
  ('ماهر', 'ماهر', 'human', '{}', 'accepted', 1.000, 'seed'),
  ('ماعز', 'ماعز', 'animal', '{}', 'accepted', 1.000, 'seed'),
  ('مها', 'مها', '{}', 'accepted', 1.000, 'seed'),
  ('موز', 'موز', 'plant', '{}', 'accepted', 1.000, 'seed'),
  ('مانجو', 'مانجو', 'plant', '{}', 'accepted', 1.000, 'seed'),
  ('مفتاح', 'مفتاح', 'object', '{}', 'accepted', 1.000, 'seed'),
  ('مكتب', 'مكتب', 'object', '{}', 'accepted', 1.000, 'seed'),
  ('مصر', 'مصر', 'country', '{}', 'accepted', 1.000, 'seed'),
  ('مالطا', 'مالطا', 'country', '{}', 'accepted', 1.000, 'seed'),
  ('مغرب', 'مغرب', 'country', array['المغرب'], 'accepted', 0.990, 'seed')
on conflict (normalized_word, category)
do update set
  word = excluded.word,
  aliases = excluded.aliases,
  status = excluded.status,
  confidence = excluded.confidence,
  source = excluded.source,
  updated_at = now();
