-- Multi-printer support, step 1: give each physical printer a brand.
--
-- "Brand" identifies which printer-definition (see packages/shared/src/printers.ts)
-- a physical printer row implements — it drives upload validation, bridge
-- adapter selection, and job/file routing. At most one physical printer per
-- brand is supported for now (enforced by a unique index); this is a
-- household/small-shop deployment, not a same-brand fleet.

create type printer_brand as enum ('bambu', 'snapmaker', 'flashforge');

alter table printers add column brand printer_brand;

-- Backfill: the app has only ever supported Bambu until now.
update printers set brand = 'bambu' where brand is null;

alter table printers alter column brand set not null;

create unique index uq_printers_brand on printers (brand);

comment on table printers is
  'Physical printers, one per supported brand (see uq_printers_brand). '
  'Sensitive credentials (access code) live only in the bridge''s environment '
  'variables, never in this table.';

comment on column printers.brand is
  'Which printer-definition (packages/shared/src/printers.ts) this physical '
  'printer implements. Drives bridge adapter selection and job-file routing.';
