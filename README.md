# Link Robins Blog

A Ghost Casper-inspired blog for [Flarum 2.0](https://flarum.org). Promotes discussions in a configurable tag to blog posts with a full-width reading layout. Optionally serves as the forum's homepage.

## What it does

- Treats discussions in a designated tag (default: `blog`) as blog posts
- Renders them on a **Casper-style index page** at `/blog` — full-width, no sidebar, hero header, featured post, three-column card grid
- Renders each individual post in a **Casper-style reading layout** at `/blog/{id}-{slug}` — centered narrow column, generous typography, optional cover image breaking out of the column
- Pulls excerpts and cover images automatically from the post body — first paragraph and first image
- Shows the discussion's replies as comments below each blog post, using Flarum's existing comment rendering
- Can serve as the forum's homepage at `/`, with the discussion list pushed to `/all`

## Requirements

- Flarum **2.0** or later
- PHP **8.2** or later
- [`flarum/tags`](https://packagist.org/packages/flarum/tags) installed (blog posts are tagged discussions)

## Installation

```
composer require linkrobins/blog
php flarum cache:clear
```

In Flarum admin → **Extensions**, find **Link Robins Blog** and enable it.

## Setup

1. **Create a tag.** Go to **Admin → Tags** and create a new tag. The slug should match the "Blog tag slug" setting (default `blog`).
2. **Configure the blog.** Go to **Admin → Extensions → Link Robins Blog** and set:
   - **Blog tag slug** — must match the tag you just created
   - **Blog title** — shown in the hero
   - **Tagline** — one-line description under the title
   - **Show featured post** — toggle the larger card above the grid
3. **(Optional) Make the blog the homepage.** Use the "Make blog the homepage" button on the settings page. This sets Flarum's `default_route` setting to `/blog`. Visitors landing at `/` will see the blog index; the discussion list remains accessible at `/all`.
4. **Write a post.** Start a new discussion and tag it with the blog tag. The first comment post is the blog body. Replies to the discussion become comments under the blog post.

## How it works under the hood

- **Routes**: `/blog` and `/blog/{id}` are registered as forum frontend routes via `Extend\Frontend->route()` (JS side) and `Extend\Routes('forum')->get()` (server side). The server-side handlers pre-fetch the relevant discussions so SSR/SEO works.
- **Data model**: blog posts are regular Flarum discussions filtered by tag. No new database tables. All of Flarum's machinery — search, permissions, notifications, formatter, tags — applies automatically.
- **Excerpt and cover image**: two extra attributes (`linkrobinsBlogExcerpt`, `linkrobinsBlogCoverImage`) are added to the `DiscussionResource` API output. The excerpt is derived from the first paragraph of the first comment post; the cover image is the first `<img>` found in that body. If a post has no image, the card uses a subtle gradient placeholder.
- **Full-width layout**: when a blog page mounts, JS adds `LinkRobinsBlogActive` to `<html>`. The LESS hides Flarum's sidebar and zeros out the surrounding container padding, then our own components render at full viewport width with their own max-content-width constraints.
- **Comments**: the blog post page fetches the discussion with all its posts, renders the first comment post as the body, and renders subsequent comment posts using Flarum's own `CommentPost` component in a slimmer-styled list below.

## Homepage notes

Setting the blog as the homepage works by changing Flarum's core `default_route` setting to `/blog`. This is a non-destructive change — the discussion list is *not* moved; it lives at `/all` by default in Flarum 2.0. Reverting via the same setting page restores the previous default route.

If you've installed other extensions that also touch `default_route`, the last one to write wins. Reactive monitoring of the setting is out of scope.

## Limitations / out of scope

- No separate post-cover-image field — covers are derived from the first `<img>` in the body. If you want explicit covers, you'd need either an extension that adds an image field to discussions or a follow-up to this extension.
- No standalone blog comment system — replies use Flarum's discussion model. The link/discussion view still works at `/d/{id}` for the full Flarum experience.
- No multi-blog support — one blog per Flarum install. You can use sub-tags within the blog tag to categorize.

## License

MIT
