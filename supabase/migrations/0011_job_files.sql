-- Multi-printer support, step 2: relational storage for per-brand job files.
--
-- A job may carry a file for any subset of the supported brands (one, two,
-- or all three). Replaces the single original_filename/storage_path/
-- file_size_bytes columns on print_jobs (dropped in migration 0014, once all
-- readers have moved to this table).

create table job_files (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references print_jobs (id) on delete cascade,
  printer_brand printer_brand not null,
  filename text not null,
  storage_path text not null,
  file_size_bytes bigint not null check (file_size_bytes > 0),
  created_at timestamptz not null default now(),
  unique (job_id, printer_brand)
);

comment on table job_files is
  'One row per uploaded printer-specific file for a job. At most one file '
  'per (job, brand) — see unique (job_id, printer_brand).';

create index idx_job_files_job_id on job_files (job_id);

-- Backfill: every job today has exactly one file, uploaded for whichever
-- brand its assigned printer implements (Bambu, until now the only brand).
insert into job_files (job_id, printer_brand, filename, storage_path, file_size_bytes, created_at)
select pj.id, pr.brand, pj.original_filename, pj.storage_path, pj.file_size_bytes, pj.created_at
from print_jobs pj
join printers pr on pr.id = pj.printer_id;
