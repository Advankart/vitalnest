-- VitalNest · migration 008 — allow report videos up to 50 MB (Supabase free plan maximum)
update storage.buckets set file_size_limit = 52428800 where id = 'reports';
