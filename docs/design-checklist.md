# Panel design checklist (review gate)

Every panel change is checked against the manual's Panel Design chapter
(`/soft-machine/manual/books/plugin-development/reference/panel-design.md`)
plus these plugin-specific rules. Everything visual comes from
`bindings/web/ui/`; panels do not declare their own colors, radii, or font
sizes.

## Surfaces
- Root paints `t.bg.tertiary`; rows and selection use `t.bg.secondary`;
  inputs, pickers and floating surfaces use `t.bg.elevated`. Never `bg.primary`.
- Cards (`Capsule`, merge status card): `tertiary` + 1px border,
  `calc(radius * 1.25)`; card body regions `secondary`.

## Controls
- Rest `text.muted`, hover `text.primary` + one background step, **no
  transition**, disabled `opacity 0.5`. Use `BareButton` (18px),
  `GhostButton` (24px), `PickerButton` (26px), `CreateButton` (24px accent).
- Exactly one accent-filled action per panel: the top-bar `CreateButton`.
  Selected options in menus use `text.primary` + a check mark, never accent
  text. Accent tints only through `rgba(${t.accent.primaryRgb}, α)`.
- Focus is the border lift `color-mix(in srgb, ${t.border} 92%, white 8%)`.

## Inside controls
- Segments are 22px in a 2px rail (26px total, like pickers and search).
  A leading glyph always sits in `SegmentIcon` (12px slot) whether it is a
  7px dot or a 12px icon, so labels start at one x.
- A count inside a control's label is `InlineCount` (sans, xs, muted,
  tabular). Mono `Count` is for identifiers only (`#123`, shas).
- Rows of ghost buttons (`ActionsRow`) are inset 4px so the buttons' 8px
  padding puts their icons on the 12px content edge.

## Refresh
- Background polling is the query store's job, governed by one
  `PollPolicy` (enabled + scale) that the Auto-refresh settings feed
  through `usePollPolicySync`. Route cadences in `POLL` stay the source of
  relative timing; never add ad-hoc timers in panels.

## Time and remote text
- Every timestamp is `relativeTime`: "now", "5m", "3h", "12d", then a
  short date ("Aug 1", "Dec 24, 2025"). Never a locale-formatted date.
- Remote markdown renders inside `MarkdownGuard`: headings capped at
  base/600 so nothing in a comment outranks the panel title; images and
  tables stay within the card.

## Rows and chips
- Single-line rows are `SidebarRow` (26px); list items are `ItemRow` (two
  lines). Selection = hover fill held (`$active`). Row actions live in
  `RowActions` (opacity-revealed).
- Chips are 18px: `Chip` (label pill), `MetaChip` (bordered badge),
  `RefChip` (mono ref), `StatePill` (state). Numerals are `Count` (mono
  micro tabular).

## Motion (`ui/motion.tsx`)
- Hover never animates. Structure does, at 120–200ms with the decelerating
  ease in `MOTION.ease`, always gated on `prefers-reduced-motion`.
- View and sidebar swaps use `Enter` keyed by content, direction-aware:
  deeper = from the right, back = from the left, sibling = a short rise,
  first paint = fade. Enter animations end at `transform: none`.
- Rows arrive with `$index` stagger (20ms steps, capped at 12 rows); keying
  the list by state/page replays it on Open ↔ Closed.
- `Segmented` glides its active pill (transform + width). Badges, state
  pills and icon swaps `pop` (scale 0.7 → 1) via `EnterInline` keyed by
  value. Sidebar collapse animates width and fades its content.
- No exit animations, no height animations, no bounces.

## Icons
- SDK `Icon` only. Sizes: 11 inside chips/meta, 12 in rows, menus and
  inline actions, 14 in the top bar, 16 for panel registration, 24 in empty
  states. Nothing else.

## States
- Loading: `LoadingState` (ring + accent arc). Error: `ErrorBanner` with
  Retry (never a bare red string). Empty: `EmptyState` with icon, title,
  hint, and an action when one exists.

## Layout
- Outer insets are `EDITOR_SPACING.containerPadding`. Truncating text has
  the triad and `min-width: 0` on every flex ancestor.
- Respond to the panel, not the viewport: `@container` at 340 (tab labels),
  360 (row label chips), 420 (top bar stacks, "Show list" label), 560
  ("Filter" label), 600 (sidebar hides). The sidebar is
  `min(224px, 38cqw)` so the main area keeps ≥60% of the width.
- Top bar groups use `ToolbarGroup $grow` and share width; every child is
  shrinkable (pickers truncate, the search field compresses to 64px).
- Sidebar content is pinned to the sidebar's full width so a collapse clips
  it rather than reflowing text; one-line hints use `SidebarNote $nowrap`.

## Filters (popover, kanban grammar)
- The Filter button opens a popover, not a menu: single-choice qualifiers
  (Sort, Author, Assignee, Milestone) as a label/select grid, then a
  Labels section of 24px checkbox rows (checkbox, dot, name, muted
  description), searchable past 8 labels, with Clear / Done in the footer.
- Search answers instantly: while typing, the loaded list is filtered
  locally (`search.ts`: title, #number, author, labels) and a "Searching
  GitHub" hint shows until the debounced (200ms) server result lands.

## Sidebar
- Resizable by dragging its right edge (`SidebarResizer`), 160–420px,
  persisted per user; capped at 45% of the panel; double-click resets.
  Width is live during the drag and written once on release.
- Repository names drop the user's own owner (`displayRepoName`); orgs
  and other users keep theirs. Self is the gh login, or the owner of more
  than half the visible repos under an App installation.

## Labels (one `LabelMenu`, one `Chip`)
- The detail editor's label list is `LabelMenu`: always present (empty
  note when the repo has none), search past 8 labels, selected first,
  name + color dot + description, check for applied, and a "Manage labels
  on GitHub" link since labels cannot be created here.
- Label chips are `Chip` (tinted pill). As buttons (`ChipButton`) they
  toggle the label as a list filter; an active filter draws the label
  color as a ring. Active qualifiers show as removable chips in the filter
  row (`ActiveFilterChips`): label chips keep their color, others are
  quiet `FilterChip`s with a muted key.

## Detail views (issue and pull request share one skeleton)
1. `DetailHeader`: state pill · `#N` · author · time · [open in new panel]
   [GitHub]; title (md/500); PR merge sentence; assignee / milestone /
   label chips. Bottom border.
2. PR only: `Segmented` tabs Conversation / Files / Reviews with counts.
3. `Scroll`: `ActionsRow` (Send to agent, Labels) → inline error →
   `Thread` (opening post, comments, timeline events; PR appends the merge
   status card). Tab panes carry no section heading: the tab names them.
4. `ReplyFooter` pinned under the scroll area: the composer capsule with
   the state action (Close / Reopen) beside Comment. PR shows it on the
   Conversation tab only.

## Semantic color
- `ui/status.ts` holds the only literal colors (open/merged/closed/pending/
  muted and the diff washes). Label colors from GitHub are foreign data and
  pass through `Chip`'s tint.
- Diff syntax colors come from `t.ansi.*` and `t.text.*` only
  (`highlight/CodeLine.tsx`); on highlighted lines the wash marks the
  change and the +/- prefix keeps the diff color. Unknown languages fall
  back to the plain diff text colors.

## Before merging
- `bun run test`, `bun run check-manifest`, bundleError null at
  `http://127.0.0.1:6850/plugins`.
- Open all four panels in the default theme, a light theme, and Pixel
  (radius 0) at ~380px, ~640px and ~1000px widths.
