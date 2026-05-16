# Link Robins Blog

A Ghost-style blog for Flarum. Standalone post storage, member-only post gating, a clean reading layout, real Flarum discussions for comments, multi-author publishing with proper permissions, and a built-in newsletter with auto-broadcast on publish.

---
## Features

### Reader

- `/blog` — hero header (text / forum logo / custom image), featured first post in a large card, grid of remaining posts with pagination
- `/article/{date}-{slug}` — centered reading column, optional cover image with credit line, body, comments, "Read more" recommendations from the same category
- `/category/{slug}` — same layout as `/blog`, filtered to one category
- Auto cover-image fallback to a gradient when no image is set
- Theme-aware — picks up your forum's primary color

### Member-only posts

Posts marked `visibility: members` show the excerpt and a login-wall card to guests. Logged-in users see the full content. Search engines see only the excerpt.

### Comments are real Flarum discussions

Each blog post gets one normal Flarum discussion behind the scenes. Comments below the post are posts in that discussion. This means:

- All standard Flarum moderation works out of the box — edit, delete, flag, hide, restore, mentions, likes (if installed), notifications, search
- Replies inherit your existing permission groups, post throttling, BBCode/Markdown setup
- The discussion is kept out of `/all` and other listings (so it doesn't clutter your forum) but is fully accessible via direct link and via the API
- The first post of each discussion is an auto-generated "bookmark card" linking back to the blog article

There is no shadow comment system. If you can moderate forum discussions, you can moderate blog comments.

### Multi-author publishing

Two permissions, configured per group in **Admin → Permissions**:

- `linkrobins-blog.start` — can write blog posts and edit/delete their own
- `linkrobins-blog.moderate` — can edit/delete anyone's blog posts (implies start)

Admins always have both. Authors who only have `.start` see drafts they own; moderators see all drafts.

The blog's sidebar shows a **Compose** button (pen icon) for anyone with permission. The article view shows a `…` menu with Edit and Delete for posts you can manage — same visual as Flarum's discussion-post controls.

### Drafts

`/blog/drafts` lists posts you've saved as draft. Sidebar link to it appears for anyone with `.start`. Authors see their own drafts; moderators and admins see everyone's. Cards on the drafts list have a small "Draft" badge and a dashed outline so they're visually distinct.

### Newsletter (built in)

- **One-click subscribe** star button in the blog sidebar (filled star = subscribed, outline = not). Logged-in users only.
- **Admin Subscribers tab** with live count and CSV export of `email, username, subscribed_at` (RFC-4180 quoted, chunked for large lists)
- **Auto-broadcast on publish.** Each category has a "Send newsletter when a post is published in this category" toggle. When a post in such a category transitions to published, the newsletter goes out automatically — no manual button click. Save-as-draft never triggers a send.
- **Per-recipient `List-Unsubscribe` header** so Gmail and Apple Mail show their built-in unsubscribe button in the inbox.
- **Confirm-then-unsubscribe** flow on the public unsubscribe page. Defeats email scanners that prefetch links (Office 365, anti-phishing tools) from silently unsubscribing real users.
- **`broadcast_sent_at` guard** prevents duplicate sends across unpublish/republish cycles.

### Admin

The admin extension page now focuses on configuration:

- **Categories** — name, slug, color, icon, position, newsletter toggle. One row per setting.
- **Subscribers** — count + CSV export.
- **Settings** — blog title and tagline, hero header mode, posts per page, custom sidebar HTML widget, members-only teaser length.

The Posts tab is removed — write and manage posts from `/blog` like everyone else.

---

## Installation

```
composer require linkrobins/blog
php flarum migrate
php flarum cache:clear
```

Enable from **Admin → Extensions**. Then visit **Admin → Permissions** to grant `linkrobins-blog.start` and/or `linkrobins-blog.moderate` to the groups you want to author posts.

### Requirements

- Flarum 2.x (or later)
- PHP 8.2+
- Optional: [`fof/upload`](https://packagist.org/packages/fof/upload) for in-editor image uploads. Without it, you can still set image URLs by hand.

---

## Upgrading

```
composer update linkrobins/blog
php flarum migrate
php flarum cache:clear
```


---

## Newsletter deliverability

The extension sends mail via Flarum's configured SMTP. Whether those mails arrive in inboxes vs spam folders depends on your sending domain, not on this code:

- **SPF, DKIM, DMARC** records on your sending domain matter. Without them, Gmail in particular will spam-folder your broadcasts.
- For lists over ~50 subscribers, set Flarum's queue driver to `database` or `redis`. The default `sync` driver runs the broadcast inline in the publish request, which will time out on larger lists.
- The first time you enable auto-broadcast on a category, subscribe yourself, publish a test post, and check where the email lands. [mail-tester.com](https://mail-tester.com) is a free way to grade your sending domain.

**Auto-broadcast is one-shot.** Once a post broadcasts, the `broadcast_sent_at` timestamp prevents a second send even if you unpublish and republish. If you need to genuinely re-send for some operational reason (a first send failed mid-way, etc.), it has to be done via tinker or a direct DB tweak — there's no UI button for it any more. This is intentional: a publish click should never silently re-spam a list.

---

## Configuration

All in **Admin → Extensions → Link Robins Blog → Settings**:

- Blog title and tagline (displayed in the hero)
- Nav label and icon for the "Blog" link in Flarum's main sidebar
- Posts per page on the blog index
- Header mode: text, forum logo, or custom background image (with overlay)
- Members-only teaser length (characters of body shown to guests)
- Custom HTML widget content for the blog sidebar

Per-category settings (in the **Categories** tab):

- Name, slug, description
- Color (used for category tags on cards)
- Icon (Font Awesome class)
- Position (sort order)
- **Send newsletter when published** toggle

---

## Permissions

Two new permissions, granted per-group from **Admin → Permissions**:

| Permission | What it grants |
|---|---|
| `linkrobins-blog.start` | Author blog posts. Edit and delete posts they own. See their own drafts at `/blog/drafts`. |
| `linkrobins-blog.moderate` | Everything `.start` grants, plus edit and delete any post and see all drafts. |

Admins always pass both. Category management, newsletter configuration, and the admin extension page remain admin-only.

---

## API

Mostly JSON:API for posts and categories. A few non-resource endpoints:

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/linkrobins-blog-posts` | List posts. `?isPublished=false` filters to drafts (scope rules apply). |
| `GET` | `/api/linkrobins-blog/subscription` | Current user's subscription state |
| `POST` | `/api/linkrobins-blog/subscription` | Subscribe (idempotent) |
| `DELETE` | `/api/linkrobins-blog/subscription` | Unsubscribe (idempotent) |
| `GET` | `/api/linkrobins-blog/subscribers` | Admin: `{ count }` |
| `GET` | `/api/linkrobins-blog/subscribers?format=csv` | Admin: CSV download |
| `GET` | `/linkrobins-blog/unsubscribe/{token}` | Public confirm page |
| `GET` | `/linkrobins-blog/unsubscribe/{token}?confirm=1` | Public token-based unsubscribe |

The per-post broadcast endpoint (`POST /api/linkrobins-blog/posts/{id}/broadcast`) was **removed** in 1.0.1. Broadcasts are now triggered by publish-into-category, not by API call.

---

## License

MIT.
