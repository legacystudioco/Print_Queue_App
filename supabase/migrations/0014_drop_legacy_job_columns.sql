-- Multi-printer support, step 4: job_files is now the single source of
-- truth for a job's file(s) — drop the old single-file columns on print_jobs.

alter table print_jobs
  drop column original_filename,
  drop column storage_path,
  drop column file_size_bytes;
