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

- One-click subscribe star button at the top of the blog sidebar (filled star = subscribed, outline = not). Logged-in users only.
- Admin "Subscribers" tab with live count and CSV export of `email, username, subscribed_at` (RFC-4180 quoted, chunked for large lists)
- "Send newsletter" button on the post editor — broadcasts via Flarum's configured SMTP to every current subscriber
- Per-recipient `List-Unsubscribe` header so Gmail/Apple Mail show their built-in unsubscribe button in the inbox
- Token-based public unsubscribe page — works from any device, no login required
- `broadcast_sent_at` guard prevents accidental re-sends; explicit "Re-send" requires confirmation

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
- For lists over ~50 subscribers, set Flarum's queue driver to `database` or `redis`. The default `sync` driver runs the broadcast inline in the admin's HTTP request, which will time out on larger lists.
- The first time you broadcast, subscribe yourself first and check where the email lands. Mail-tester.com is a free way to grade your sending domain.

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
| `POST` | `/api/linkrobins-blog/posts/{id}/broadcast` | Admin: trigger newsletter send (`?force=1` to re-broadcast) |
| `GET` | `/linkrobins-blog/unsubscribe/{token}` | Public token-based unsubscribe |

---

## License

MIT.
