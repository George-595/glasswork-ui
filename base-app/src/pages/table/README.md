# pages/table

The Transactions page, and the showcase of the kit's table system (`useDataTable`,
`DataTableView`, `DataTableToolbar`, `TableSearch`, `FacetFilter`, `FilterChips`,
`ColumnToggle`, `DensityToggle`, `TablePagination`, `BulkActionBar`, `Sheet`).

| File | What |
|---|---|
| `TablePage.tsx` | URL state, the request, the toolbar, bulk actions, export, the table |
| `columns.tsx` | the column definitions and the status / category vocabulary |
| `range.ts` | UK days to instants (`dayStart`, `dayEnd`, `rangeBounds`) for the date filter |
| `TransactionSheet.tsx` | the detail drawer (`GET /api/transactions/:id`, `DetailSheet`); "Ask about this" opens the Ask panel about the transaction (`askAbout`) |

- **Server mode is the default.** The API sorts, filters and pages (`api.transactionsPage`), the
  facet counts come from its `facets`, and the table runs in the kit's `manual` mode. **Browser
  mode** (`?mode=browser`) loads `api.transactions()` once and `useDataTable` does the rest. The UI
  is the same; the Amount footer says which rows it adds up ("Page total" or "Total").
- **All state is in the URL** (`useUrlState`): `q`, `status`, `category`, `sort` (`-date,customer`),
  `page`, `size`, `density`, `hide`, `mode`, and the date range (`from`, `to`: UK days). A reload or a pasted link restores the view. A value
  equal to its default is left out.
- **Date range.** A `DateRangePicker` in the toolbar filters the Date column. Server mode sends `from` / `before`
  (`range.ts`: the start of the first UK day and of the day after the last) so the API filters and the facet
  counts follow; browser mode filters the loaded rows before the table sees them. Clear filters drops it too.
- The previous page of rows stays on screen (quieter, `aria-busy`) while the next one loads; only
  the first load shows a skeleton.
- **Export CSV** writes every row of the current query (server mode fetches pages of 100 until
  `total` is read). **Mark as reviewed** is a demo: it lives in this tab and nothing is sent.
- `<Toaster />` is mounted by this page; if the shell ever mounts one, remove it here.
- The page takes an optional `csvSink` prop (`{ save(name, csv) }`) so tests see the file instead
  of downloading it.
