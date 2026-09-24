-- Run only after the block-based code is deployed: older deployments read this column.
alter table public.posts drop column body;
