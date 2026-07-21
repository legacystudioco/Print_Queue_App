-- Private storage bucket for sliced print files.
--
-- Uploads happen directly from the browser (using the signed-in admin's own
-- session, not the service role) so large files never pass through a
-- serverless function body. That means storage.objects RLS must explicitly
-- allow it. Downloads instead always go through a server route that mints a
-- short-lived signed URL with the service role — the bucket itself is never
-- publicly readable.

insert into storage.buckets (id, name, public)
values ('print-files', 'print-files', false)
on conflict (id) do nothing;

create policy "admins can upload print files"
  on storage.objects for insert
  with check (bucket_id = 'print-files' and current_app_role() = 'admin');

create policy "admins can view print files"
  on storage.objects for select
  using (bucket_id = 'print-files' and current_app_role() = 'admin');

create policy "admins can delete print files"
  on storage.objects for delete
  using (bucket_id = 'print-files' and current_app_role() = 'admin');
