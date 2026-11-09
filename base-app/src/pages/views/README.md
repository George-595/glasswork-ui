# views

`/views`: what the person pinned from the assistant. Each view is stored as the show_* input that
drew it (`saved_views.spec`), and `GET /api/views` redraws every one from the database, so a
pinned "revenue by month" stays current. A view that can no longer be drawn (a field the schema
no longer accepts) says why and can still be removed.

- Drawn with `AgentVisualView` (the same component the assistant uses) in a `ChartGrid`.
- Remove runs the `delete_view` action after a `ConfirmDialog`. A `views` realtime event (a pin
  from another tab, or by the assistant) reloads the list.
