-- Keep an earlier AI run available for review without deleting or rewriting any run.
-- A newer run automatically supersedes the selection made at this timestamp.
alter table public.task_rounds
  add column display_gv_run_id uuid references public.gv_processing_runs(id) on delete set null,
  add column display_gv_run_selected_at timestamptz;

alter table public.task_rounds
  add constraint task_rounds_display_gv_run_pair
  check ((display_gv_run_id is null) = (display_gv_run_selected_at is null));
