# UI Patterns

Cookbook of reusable patterns for building screens. Each pattern shows the **shape** (what the structure looks like), the **rules** (when to use, when not to), and a **sketch** (rough JSX showing the right ingredients). Pair this with [`DESIGN_SYSTEM.md`](../../DESIGN_SYSTEM.md) for tokens and [`mockup.html`](./mockup.html) for the rendered version.

---

## Logo placement

Two brand-correct logo assets exist and only these two. See [`DESIGN_SYSTEM.md`](../../DESIGN_SYSTEM.md) for the full inventory and usage rules.

**Where each variant goes:**

| Surface | Variant | Notes |
|---|---|---|
| Marketing nav | `<Logo />` (mark + wordmark text) | 28px mark, "Remote Falcon" beside |
| Marketing hero | `<Logo variant="hero" />` | The full neon jukebox image — leads the page visually |
| Marketing footer | `<Logo />` | Same lockup as nav |
| Control panel sidebar header | `<Logo />` collapses to `<LogoMark />` when rail is collapsed |
| Auth pages (login, signup) | `<LogoMark size={44} glow />` | Centered, with neon halo |
| Splash / loading | `<LogoMark size={64} glow />` | Centered, optionally pulsing |
| Favicon / browser tab | `public/rf-icon.png` | Replace the leftover Berry favicon |
| Marketing emails | `<Logo variant="hero" />` at ~320px wide | Or the lockup if the email is text-heavy |

**Don't:**
- Use the wordmark (`<Logo variant="hero" />`) at small sizes — it has too much detail. Use the lockup instead.
- Reproduce the neon glow with CSS — it's baked into the PNG. Use the asset as shipped.
- Mix the RF monogram with the leftover Berry SVGs (`logo.svg`, `logo-dark.svg`) — those should be deleted.

```jsx
// Marketing nav
<Stack direction="row" alignItems="center">
  <Logo />
  <NavLinks />
  <ThemeToggle />
  <Button color="secondary">Start free →</Button>
</Stack>

// Marketing hero
<Grid container spacing={6} alignItems="center">
  <Grid item xs={12} md={6}>
    <Typography variant="display">Bring your light show online.</Typography>
    <CtaRow />
  </Grid>
  <Grid item xs={12} md={6}>
    <Logo variant="hero" />
  </Grid>
</Grid>

// Auth screen
<Stack alignItems="center" spacing={3}>
  <LogoMark size={44} glow />
  <Typography variant="h2">Welcome back</Typography>
  <LoginForm />
</Stack>
```

---

## Page header

The top of every control-panel page.

**Shape:** title + subtitle on the left, primary actions on the right.

**Rules:**
- Title is `h1`, subtitle is `body` color `text.muted`.
- Primary action sits rightmost, ghost actions to its left.
- No more than 2 buttons here. Overflow goes into a kebab.
- Don't add decorative cards or borders around the header — let it breathe against the page.

```jsx
<Stack direction="row" alignItems="flex-end" spacing={3} mb={3}>
  <Box flex={1}>
    <Typography variant="h1">Tonight's show</Typography>
    <Typography variant="body2" color="text.muted">Live · started 6:00 PM</Typography>
  </Box>
  <Button variant="outlined">Share viewer page</Button>
  <Button variant="contained" color="secondary">Show is live</Button>
</Stack>
```

---

## Stat card row

Top-of-dashboard KPI strip.

**Rules:**
- 4 stats max in a row. More than 4 → reduce or two-row.
- Each stat: label (uppercase, `text.muted`, `label` role) → value (`h1`-sized number) → trend (small, semantic-colored).
- Sparklines live in the bottom-right, low opacity (~60%), purely decorative.
- Hover lifts the card 1px (translateY) — no shadow change.

```jsx
<Grid container spacing={2}>
  {stats.map(s => (
    <Grid item xs={6} md={3} key={s.label}>
      <Card sx={{ p: 2.5, position: 'relative', overflow: 'hidden' }}>
        <Typography variant="overline" color="text.muted">{s.label}</Typography>
        <Typography variant="h2" sx={{ fontSize: 30, mt: 0.5 }}>{s.value}</Typography>
        <Typography variant="caption" color={s.trend.color}>{s.trend.label}</Typography>
        <Sparkline data={s.history} sx={{ position: 'absolute', right: 14, bottom: 14, opacity: 0.6 }} />
      </Card>
    </Grid>
  ))}
</Grid>
```

---

## Data table

The sequences table is the canonical example.

**Rules:**
- Always paginated. Default page size 25.
- Sortable columns by default. Click header to sort, second click reverses, third clears.
- Density toggle (Compact / Comfortable / Spacious) above the table on the right.
- Filter chips above the table on the left.
- Row hover: subtle background (`action.hover`). Never an outline.
- Row actions live in the rightmost cell as 28×28 icon buttons; the third one is a kebab `Menu` for less-common actions.
- Drag handles (`⋮⋮`) only when ordering is meaningful and persisted.
- Status uses `<Chip>` with the pill radius and a colored dot. Never a colored row background.
- **Destructive actions always confirm.**

---

## Card

The atomic content surface.

**Rules:**
- No default border. No default shadow. The contrast between `background.paper` (`bg2`) and `background.default` (`bg0`) is enough.
- A divider only between header and body. Within the body, use spacing — not `<Divider>` — unless content is genuinely sectioned.
- Card titles are `h3` (18px, weight 600). Don't make them bigger.
- Keep an associated meta string (`text.muted`, small) right-aligned in the header for context: counts, timestamps, "live" status.

```jsx
<Card>
  <CardHeader
    title="Sequences"
    action={<Typography variant="caption" color="text.muted">38 active · 4 hidden</Typography>}
  />
  <CardContent>...</CardContent>
</Card>
```

---

## Empty state

Anywhere a list, table, or chart could be empty.

**Rules:**
- Three components: a soft icon, a one-line title, a one-line description, and (optionally) a single CTA.
- Centered. ~48px vertical padding.
- The icon sits in a 64×64 tinted circle (`accent` 8% opacity background, `accent.500` icon color).
- Never a sad emoji. Never a stock illustration.

```jsx
<Stack spacing={2} alignItems="center" sx={{ py: 6 }}>
  <Box sx={{ width: 64, height: 64, borderRadius: '50%', bgcolor: 'rgba(245,165,36,0.08)',
             display: 'grid', placeItems: 'center', color: 'secondary.main' }}>
    <IconPlaylist size={28} />
  </Box>
  <Typography variant="h3">No sequences yet</Typography>
  <Typography variant="body2" color="text.muted">Add your first sequence to get the show running.</Typography>
  <Button variant="contained" color="secondary">Add sequence</Button>
</Stack>
```

---

## Skeleton

Loading placeholder for any async content.

**Rules:**
- Always render the **shape** of the eventual content — same heights, same column widths, same number of rows.
- Use MUI's `<Skeleton>` with `variant="rounded"` and `borderRadius: 8`. Never the default sharp rectangles.
- Show skeletons after ~150ms of latency. Below that, show nothing — flicker is worse than waiting.

---

## Form

Every settings page in the control panel. The legacy pattern is "save on blur"; the v2 pattern is **explicit submit with sticky save bar**.

**Shape:**
1. The form is a Formik container.
2. Sections are plain `Card`s with `CardHeader` titles.
3. Fields are `TextField`s, `Switch`es, etc. with inline error helper text.
4. When `formik.dirty`, a **sticky save bar** appears at the bottom of the viewport with "Save changes" + "Discard".
5. Navigating away while dirty → confirm dialog.

```jsx
<Formik initialValues={...} onSubmit={save}>
  {(formik) => (
    <Form>
      <Card><CardHeader title="Show schedule" /><CardContent>...fields...</CardContent></Card>
      <Card sx={{ mt: 2 }}><CardHeader title="Voting" /><CardContent>...fields...</CardContent></Card>

      <StickyFormBar visible={formik.dirty}
        onSave={formik.submitForm}
        onDiscard={formik.resetForm} />
    </Form>
  )}
</Formik>
```

**Rules:**
- Never `onBlur` save. Never silent autosave.
- Field errors show under the field (`<TextField helperText>`), not in a global alert.
- Successful submits show a snackbar; persistent errors show in-context.

---

## Modal / Dialog

**Use a modal for:**
- Destructive actions (deleting sequences, regenerating tokens) — always with a confirmation.
- Multi-step flows that don't deserve their own URL.
- Creating things from a list view ("Add sequence" inline modal).

**Don't use a modal for:**
- Settings changes — those go on a settings page.
- Non-blocking notifications — those are snackbars.
- Anything where the user needs to reference page content.

**Shape:** title at top (h3), body, two-button footer (ghost cancel + primary action). Destructive actions use `color="error"` on the primary button, and the title leads with the action verb ("Delete 12 sequences?").

---

## Notifications (snackbars)

For ephemeral, non-blocking feedback.

**Rules:**
- 4 seconds default duration. 8 seconds for errors.
- One snackbar at a time. New ones replace.
- Bottom-right anchor on desktop, bottom-center on mobile.
- Color tokens: `success` for success, `danger` for errors, `info` for neutral confirmations.
- Include an "Undo" action when reversible (sequence reorder, soft delete).

---

## Command palette

The keyboard interface to the app — see [`MIGRATION.md`](../../MIGRATION.md) Phase 7 for build details.

**Rules:**
- Triggered by ⌘K (Mac) / Ctrl+K (everywhere else). Also from the topbar search chip.
- Closes on Esc, on outside click, and after selecting a command.
- Sections: **Suggested** (recent + smart actions) → **Navigation** → **Sequences** → **Settings**.
- Actions execute immediately; no second confirmation **unless destructive** (then close the palette and pop a confirm dialog).

---

## Iconography

**Rules:**
- One family per surface. Control panel = `@tabler/icons-react`. Marketing = same family or hand-picked SVGs.
- Sizes: 16 (inline with text), 20 (nav), 24 (action buttons), 28+ (empty states, large CTAs).
- Always paired with a text label OR an `aria-label` / `<Tooltip>`.
- Never use a colored icon background "avatar" circle on the marketing site — that's the legacy giveaway.

---

## Charts

`react-apexcharts` is already a dep. Use it consistently:

**Rules:**
- Series colors: primary series = `accent.500`, secondary = `cyan.400`, tertiary = `pink.400`. Anything beyond three series should rethink the chart.
- Gridlines: `surfaces.line` color, dashed.
- Axis labels: `text.muted` color, `caption` size.
- Tooltips: dark background (`bg3`), `text.primary` text, no border.
- No 3D charts. No gradient backgrounds outside of area charts.

---

## Motion

**Rules:**
- Hover/focus: `transition: all 150ms cubic-bezier(0.4, 0, 0.2, 1)`.
- Layout shifts (drawer, modal): 250ms.
- Marketing reveals: 450ms with stagger.
- Entry animations only on first paint. Don't re-animate on every state change.
- Respect `prefers-reduced-motion` — wrap reveals in a check.
