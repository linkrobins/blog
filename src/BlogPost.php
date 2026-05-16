<?php

namespace LinkRobins\Blog;

use Carbon\Carbon;
use Flarum\Database\AbstractModel;
use Flarum\Database\ScopeVisibilityTrait;
use Flarum\Discussion\Discussion;
use Flarum\Formatter\Formattable;
use Flarum\Formatter\HasFormattedContent;
use Flarum\User\User;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\Relations\HasManyThrough;

class BlogPost extends AbstractModel implements Formattable
{
    use HasFormattedContent;
    use ScopeVisibilityTrait;

    protected $table = 'linkrobins_blog_posts';

    public $timestamps = true;

    public const VISIBILITY_PUBLIC = 'public';
    public const VISIBILITY_MEMBERS = 'members';

    protected $fillable = [
        'title',
        'slug',
        'excerpt',
        'cover_image_url',
        'cover_image_credit',
        'cover_image_credit_url',
        'category_id',
        'visibility',
        'is_published',
        'published_at',
        'comments_enabled',
    ];

    protected $casts = [
        'is_published'      => 'boolean',
        'published_at'      => 'datetime',
        'view_count'        => 'integer',
        'comment_count'     => 'integer',
        'comments_enabled'  => 'boolean',
        'broadcast_sent_at' => 'datetime',
    ];

    public function category(): BelongsTo
    {
        return $this->belongsTo(BlogCategory::class, 'category_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function comments(): HasManyThrough
    {
        // Blog comments are normal Flarum comment Posts on this blog post's
        // comment Discussion. We expose them as a hasManyThrough so callers
        // that do $blogPost->comments() keep working. Post number 1 is the
        // bookmark-card first post (the article link), not a comment, so we
        // exclude it.
        return $this->hasManyThrough(
            \Flarum\Post\Post::class,
            Discussion::class,
            'blog_post_id',  // FK on discussions table referencing blog posts
            'discussion_id', // FK on posts table referencing discussions
            'id',
            'id'
        )->where('posts.type', 'comment')
         ->where('posts.number', '>', 1);
    }

    public function discussion(): HasOne
    {
        // The comment Discussion that holds this blog post's comment thread.
        // Created on publish when comments are enabled; its first post is the
        // bookmark card linking back to the article.
        return $this->hasOne(Discussion::class, 'blog_post_id');
    }

    public function publish(): static
    {
        if (! $this->is_published) {
            $this->is_published = true;
            $this->published_at = $this->published_at ?? Carbon::now();
        }

        return $this;
    }

    public function unpublish(): static
    {
        $this->is_published = false;

        return $this;
    }

    public function isPublic(): bool
    {
        return $this->visibility === self::VISIBILITY_PUBLIC;
    }

    public function isMembersOnly(): bool
    {
        return $this->visibility === self::VISIBILITY_MEMBERS;
    }

    /**
     * Refresh the cached comment_count column.
     *
     * Counts the blog post's actual comments — the comments() relation
     * already excludes the bookmark-card first post (number 1), so this is
     * the real comment total, not the discussion's native comment_count
     * (which would include the card). Normally kept current automatically by
     * the post-save sync in BlogServiceProvider; this method is here for any
     * caller that needs to force a recount.
     */
    public function refreshCommentCount(): void
    {
        $this->comment_count = $this->comments()->count();
        $this->save();
    }
}
