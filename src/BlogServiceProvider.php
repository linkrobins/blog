<?php

namespace LinkRobins\Blog;

use Flarum\Discussion\Discussion;
use Flarum\Formatter\Formatter;
use Flarum\Foundation\AbstractServiceProvider;
use Flarum\Http\UrlGenerator;
use Flarum\Post\CommentPost;
use Flarum\Post\Post;
use Carbon\Carbon;

class BlogServiceProvider extends AbstractServiceProvider
{
    public function register(): void
    {
    }

    public function boot(Formatter $formatter): void
    {
        BlogPost::setFormatter($formatter);

        // Keep the cached comment_count column on linkrobins_blog_posts in
        // sync with its discussion.
        //
        // Note: the article page's commentCount is computed live in
        // BlogPostResource and does NOT depend on this closure -- so even if
        // this never fired, the displayed count would still be correct. This
        // just keeps the cached column (used for sorting, etc.) accurate.
        //
        // We recount on every comment post create/delete/save (save catches
        // hide & restore) for the discussion's blog post. The bookmark-card
        // first post is excluded by the discussion's first_post_id.
        $sync = function (Post $post) {
            if (! ($post instanceof CommentPost)) {
                return;
            }
            $discussion = $post->discussion ?? Discussion::query()->find($post->discussion_id);
            if (! $discussion || ! $discussion->blog_post_id) {
                return;
            }

            $query = Post::query()
                ->where('discussion_id', $discussion->id)
                ->where('type', 'comment')
                ->whereNull('hidden_at')
                ->where('is_private', false);
            if ($discussion->first_post_id) {
                $query->where('id', '!=', $discussion->first_post_id);
            }
            $realCount = $query->count();

            $blogPost = BlogPost::query()->find($discussion->blog_post_id);
            if ($blogPost && (int) $blogPost->comment_count !== $realCount) {
                $blogPost->comment_count = $realCount;
                $blogPost->save();
            }
        };

        Post::created($sync);
        Post::deleted($sync);
        Post::saved($sync);  // catches hide/restore which update comment_count

        // Spin up the comment discussion when a blog post is published with
        // comments enabled. We hook `saved` (not `created`) so it also fires
        // when an existing draft is flipped to published, and when comments
        // are toggled on for an already-published post. ensureCommentDiscussion
        // is idempotent, so repeated saves are harmless.
        BlogPost::saved(function (BlogPost $blogPost) {
            if ($blogPost->is_published && $blogPost->comments_enabled) {
                static::ensureCommentDiscussion($blogPost);
            }
        });

        // Auto-broadcast: when a post transitions to is_published=true AND
        // its category has newsletter_enabled=true, dispatch the newsletter
        // job. The job itself checks broadcast_sent_at to prevent
        // duplicate sends across multiple saves.
        BlogPost::saved(function (BlogPost $blogPost) {
            try {
                if (! $blogPost->wasChanged('is_published')) {
                    return;
                }
                if (! $blogPost->is_published) {
                    return;
                }
                if ($blogPost->broadcast_sent_at) {
                    return;
                }
                $category = $blogPost->category;
                if (! $category || ! $category->newsletter_enabled) {
                    return;
                }

                $dispatcher = resolve(\Illuminate\Contracts\Bus\Dispatcher::class);
                $dispatcher->dispatch(new \LinkRobins\Blog\Job\SendNewsletter($blogPost->id, false));
            } catch (\Throwable $e) {
                resolve(\Psr\Log\LoggerInterface::class)->warning('[linkrobins/blog] auto-broadcast failed', ['exception' => $e]);
            }
        });

        // When a BlogPost is deleted, delete its comment discussion (and thus
        // cascade-delete its comments via Flarum's own cleanup). We clear
        // blog_post_id first so the `deleting` guard below allows the
        // discussion to actually be removed.
        BlogPost::deleted(function (BlogPost $blogPost) {
            Discussion::query()
                ->where('blog_post_id', $blogPost->id)
                ->get()
                ->each(function (Discussion $discussion) {
                    $discussion->blog_post_id = null;
                    $discussion->save();
                    $discussion->delete();
                });
        });

        // Block Flarum from auto-deleting a comment discussion when its last
        // post is removed. Flarum's DiscussionMetadataUpdater calls
        // $discussion->delete() inside the Post::deleted handler when
        // `posts()->count() === 0`. A blog comment discussion always has at
        // least its bookmark-card post, so in practice this rarely triggers
        // -- but if every post including the card were somehow removed, we
        // still don't want the discussion (and its blog_post_id link)
        // silently destroyed.
        //
        // Throwing a meaningful exception (rather than returning false, which
        // Eloquent swallows silently and surfaces as a generic 500) makes it
        // clear to a confused admin why a manual "delete discussion" failed.
        // The BlogPost::deleted cascade above clears blog_post_id first, so
        // legitimate cascaded deletes still go through.
        Discussion::deleting(function (Discussion $discussion) {
            if ($discussion->blog_post_id !== null) {
                throw new \RuntimeException(
                    'This discussion is the comment thread for a blog post and '
                    . 'cannot be deleted directly. Delete the blog post instead, '
                    . 'or detach the link by clearing discussions.blog_post_id first.'
                );
            }
        });
    }

    /**
     * Idempotently create the comment Discussion for the given blog post.
     *
     * The discussion is a normal, visible Flarum discussion -- it's only kept
     * out of /all listings by HideBlogDiscussionsFromListings. Its first post
     * is a "bookmark card" linking back to the blog article (Ghost-style);
     * replies to it are the comment thread.
     *
     * Safe to call from anywhere -- multiple calls return the existing
     * discussion rather than creating duplicates. Returns null only if we
     * can't determine an author (which shouldn't happen in normal operation).
     */
    public static function ensureCommentDiscussion(BlogPost $blogPost): ?Discussion
    {
        $existing = Discussion::query()
            ->where('blog_post_id', $blogPost->id)
            ->first();
        if ($existing) {
            return $existing;
        }

        if (! $blogPost->user_id) {
            return null;
        }
        $author = \Flarum\User\User::query()->find($blogPost->user_id);
        if (! $author) {
            return null;
        }

        // Real discussion: use the blog post's own title, no "[blog]" prefix.
        // Discussion titles are capped at 80 chars by core; trim to match.
        $title = $blogPost->title;
        if (mb_strlen($title) > 80) {
            $title = mb_substr($title, 0, 79) . '…';
        }

        $discussion = Discussion::start($title, $author);
        $discussion->blog_post_id = $blogPost->id;
        $discussion->save();

        // First post = the bookmark card. We construct a normal CommentPost
        // directly (Flarum 2 has no CommentPost::reply helper). Post::creating
        // auto-assigns type='comment' and an auto-incrementing `number`
        // (which will be 1 here). setContentAttribute runs the Markdown
        // through the formatter. The $sync closure excludes number 1 from
        // the comment count, so this card never inflates the "N comments"
        // total.
        $card = new CommentPost();
        $card->discussion_id = $discussion->id;
        $card->user_id = $author->id;
        $card->created_at = Carbon::now();
        $card->setContentAttribute(static::bookmarkCardContent($blogPost), $author);
        $card->save();

        // Refresh discussion metadata (last post, counts) now that it has
        // its first post, so the freshly-returned model is accurate for any
        // caller that uses it immediately.
        $discussion->setFirstPost($card);
        $discussion->setLastPost($card);
        $discussion->refreshLastPost();
        $discussion->refreshCommentCount();
        $discussion->save();

        return $discussion;
    }

    /**
     * Build the Markdown content for a blog post's bookmark-card first post.
     *
     * Ghost-style: cover image, the post title as a link to the article,
     * the excerpt, and an explicit "Read the full post" link. Generated once
     * at discussion-creation time -- it does NOT auto-update if the blog post
     * is later edited. (Re-syncing would mean re-rendering this post on every
     * blog-post edit; deliberately left out for now.)
     */
    protected static function bookmarkCardContent(BlogPost $blogPost): string
    {
        /** @var UrlGenerator $url */
        $url = resolve(UrlGenerator::class);

        // Match the dated article URL the rest of the extension builds:
        // /article/YYYY-MM-DD-{slug}
        $date = $blogPost->published_at ?? $blogPost->created_at;
        $datedSlug = $date
            ? $date->format('Y-m-d') . '-' . $blogPost->slug
            : $blogPost->slug;

        $articleUrl = $url->to('forum')->path('article/' . $datedSlug);

        $lines = [];

        if ($blogPost->cover_image_url) {
            $lines[] = '![](' . $blogPost->cover_image_url . ')';
            $lines[] = '';
        }

        $lines[] = '## [' . static::escapeMarkdown($blogPost->title) . '](' . $articleUrl . ')';
        $lines[] = '';

        if ($blogPost->excerpt && trim($blogPost->excerpt) !== '') {
            $lines[] = static::escapeMarkdown(trim($blogPost->excerpt));
            $lines[] = '';
        }

        $lines[] = '[Read the full post →](' . $articleUrl . ')';

        return implode("\n", $lines);
    }

    /**
     * Minimal Markdown escaping for text interpolated into the bookmark card
     * (post title, excerpt). Escapes the characters that would otherwise be
     * interpreted as Markdown syntax.
     */
    protected static function escapeMarkdown(string $text): string
    {
        return preg_replace('/([\\\\`*_{}\[\]()#+\-.!~|>])/', '\\\\$1', $text);
    }
}
