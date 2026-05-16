# Link Robins Blog

A Ghost-style blog for Flarum. Standalone post storage, member-only post gating, a clean reading layout, real Flarum discussions for comments, and a built-in newsletter with broadcast over your existing SMTP.

---

## Features

### Reader

- `/blog` — hero header (text / forum logo / custom image), featured first post in a large card, grid of remaining posts with pagination
- `/article/{date}-{slug}` — centered reading column, optional cover image with credit line, body, comments, "Read more" recommendations from the same category
- `/category/{slug}` — same layout as `/blog`, filtered to one category
- Auto cover-image fallback to a gradient when no image is set
- Theme-aware — picks up your forum's primary color

### Sidebar nav

The blog sidebar inherits from Flarum's standard `IndexSidebar.navItems()` — so extensions that add nav items via `extend(IndexSidebar.prototype, 'navItems', ...)` automatically have a place in the blog's left rail. The blog then customizes the result:

- prepends its own **All Posts** link at the top (priority 110)
- keeps the inherited **All Discussions** entry just below, so readers can jump to the forum index in one click
- adds a **Drafts** entry below for users with authoring permission
- hides the per-tag link list from flarum/tags by setting `noTagsList`, but keeps the single **Tags** link that points to `/tags`
- appends the blog's **Categories** section at the bottom

A separate forum-side "Blog" link is also added to Flarum's regular IndexSidebar — so when a reader is on `/all` or reading a discussion, the blog is one click away. That link suppresses itself when the page is already a blog page, so it doesn't duplicate the sidebar's own All Posts entry.

### Multi-author publishing

Two permissions, configured per group in **Admin → Permissions**:

- `linkrobins-blog.start` — can write blog posts and edit/delete their own
- `linkrobins-blog.moderate` — can edit/delete anyone's blog posts

Admins always have both. The blog's sidebar shows a **Compose** button (pen icon) for anyone with permission. The article view shows a `…` menu with Edit and Delete for posts you can manage — same visual as Flarum's discussion-post controls. Server-side hardening prevents anyone from setting `user_id` to another user when creating or editing.

### Drafts

`/blog/drafts` lists unpublished posts. Authors see their own drafts; moderators and admins see everyone's. Sidebar link to it appears for anyone with `linkrobins-blog.start` (admins too); everyone else doesn't see the link or any draft data. The page is the same layout as the blog index but sorted by creation date.

### Member-only posts

Posts marked `visibility: members` show the excerpt and a login-wall card to guests. Logged-in users (or only specific groups, configurable) see the full content. Search engines see only the excerpt.

### Comments are real Flarum discussions

Each blog post gets one normal Flarum discussion behind the scenes. Comments below the post are posts in that discussion. This means:

- All standard Flarum moderation works out of the box — edit, delete, flag, hide, restore, mentions, likes (if installed), notifications, search
- Replies inherit your existing permission groups, post throttling, BBCode/Markdown setup
- The discussion is kept out of `/all` and other listings (so it doesn't clutter your forum) but is fully accessible via direct link and via the API
- The first post of each discussion is an auto-generated "bookmark card" linking back to the blog article

There is no shadow comment system. If you can moderate forum discussions, you can moderate blog comments.

### Newsletter (built in)

- **One-click subscribe** star button at the top of the blog sidebar (filled star = subscribed, outline = not). Logged-in users only.
- **Admin Subscribers tab** with live count and CSV export of `email, username, subscribed_at` (RFC-4180 quoted, chunked for large lists)
- **Auto-broadcast on publish.** Each category has a "Send newsletter when a post is published in this category" toggle. When a post in such a category transitions to published, the newsletter goes out automatically via Flarum's configured SMTP — no manual button click. Save-as-draft never triggers a send.
- **Per-recipient `List-Unsubscribe` header** so Gmail and Apple Mail show their built-in unsubscribe button in the inbox.
- **Token-based public unsubscribe page** — works from any device, no login required.
- **`broadcast_sent_at` guard** prevents duplicate sends across unpublish/republish cycles. A post that has already broadcast won't re-send if you unpublish and republish it.

### Admin

- Tabs for Posts, Categories, Subscribers, Settings
- Full WYSIWYG-ish post editor with cover-image upload (fof/upload), excerpt, slug, category, visibility, and comments-enabled toggle
- Custom HTML widget for arbitrary sidebar content (about blurb, social links, anything)
- Configurable hero header per blog (text title, forum logo, or custom background image with overlay)

---

## Installation

```sh
composer require linkrobins/blog
php flarum migrate
php flarum cache:clear
```

Then enable the extension from the admin extensions list.

### Required Flarum

Flarum core, recent. If your Flarum is old enough that `Extend\Routes('api')->post(...)` doesn't exist, this won't work; otherwise it should.

---

## Upgrading

This release adds:

- `linkrobins_blog_subscribers` table (newsletter subscribers)
- `unsubscribe_token` column on subscribers
- `broadcast_sent_at` column on `linkrobins_blog_posts`

All three are applied by `php flarum migrate` after upgrading. The migrations are additive — no data is dropped or transformed.

---

## Newsletter deliverability

The extension sends mail via Flarum's configured SMTP. Whether those mails arrive in inboxes vs spam folders depends on your sending domain, not on this code:

- **SPF, DKIM, DMARC** records on your sending domain matter. Without them, Gmail in particular will spam-folder your broadcasts.
- For lists over ~50 subscribers, set Flarum's queue driver to `database` or `redis`. The default `sync` driver runs the broadcast inline in the publish request, which will time out on larger lists.
- The first time you enable auto-broadcast on a category, subscribe yourself, publish a test post, and check where the email lands. [mail-tester.com](https://mail-tester.com) is a free way to grade your sending domain.

**Auto-broadcast is one-shot.** Once a post broadcasts, the `broadcast_sent_at` timestamp prevents a second send even if you unpublish and republish. If you need to genuinely re-send for some operational reason (a first send failed mid-way, etc.), it has to be done via tinker or a direct DB tweak — there's no UI button for it. This is intentional: a publish click should never silently re-spam a list.

---

## Configuration

All in **Admin → Extensions → Link Robins Blog → Settings**:

- Blog title and tagline (displayed in the hero)
- Nav label and icon for the "Blog" link in Flarum's main sidebar
- Posts per page on the blog index
- Header mode: text, forum logo, or custom background image (with overlay)
- Members-only teaser length (characters of body shown to guests)
- Custom HTML widget content for the blog sidebar

---

## API

Mostly JSON:API for posts and categories. A few non-resource endpoints:

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/linkrobins-blog/subscription` | Current user's subscription state |
| `POST` | `/api/linkrobins-blog/subscription` | Subscribe (idempotent) |
| `DELETE` | `/api/linkrobins-blog/subscription` | Unsubscribe (idempotent) |
| `GET` | `/api/linkrobins-blog/subscribers` | Admin: `{ count }` |
| `GET` | `/api/linkrobins-blog/subscribers?format=csv` | Admin: CSV download |
| `GET` | `/linkrobins-blog/unsubscribe/{token}` | Public token-based unsubscribe |

---

## License

MIT.
