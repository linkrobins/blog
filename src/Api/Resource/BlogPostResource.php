<?php

namespace LinkRobins\Blog\Api\Resource;

use Flarum\Api\Context as FlarumContext;
use Flarum\Api\Endpoint;
use Flarum\Api\Resource\AbstractDatabaseResource;
use Flarum\Api\Schema;
use Flarum\Api\Sort\SortColumn;
use Flarum\Settings\SettingsRepositoryInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Str;
use LinkRobins\Blog\BlogPost;
use Tobyz\JsonApiServer\Context;

class BlogPostResource extends AbstractDatabaseResource
{
    public function __construct(
        protected SettingsRepositoryInterface $settings,
    ) {
    }

    public function type(): string
    {
        return 'linkrobins-blog-posts';
    }

    public function model(): string
    {
        return BlogPost::class;
    }

    public function scope(Builder $query, Context $context): void
    {
        $actor = $context->getActor();

        // Visibility filter: who sees drafts?
        //   - Admin or moderator: everything, no is_published filter
        //   - Authors with .start: published posts + their own drafts
        //   - Everyone else: published only
        $canModerate = ! $actor->isGuest()
            && ($actor->isAdmin() || $actor->hasPermission('linkrobins-blog.moderate'));
        $canAuthor = ! $actor->isGuest()
            && $actor->hasPermission('linkrobins-blog.start');

        if (! $canModerate) {
            if ($canAuthor) {
                // Published OR mine
                $actorId = (int) $actor->id;
                $query->where(function ($q) use ($actorId) {
                    $q->where('linkrobins_blog_posts.is_published', true)
                      ->orWhere('linkrobins_blog_posts.user_id', $actorId);
                });
            } else {
                $query->where('linkrobins_blog_posts.is_published', true);
            }
        }

        $params = $context->request ? $context->request->getQueryParams() : [];

        // Optional ?isPublished= filter narrows the listing further. We
        // accept it for any actor; it intersects with the visibility
        // rules above, so a non-author still can't see other people's
        // drafts even if they request isPublished=false.
        $isPublishedParam = $params['isPublished'] ?? null;
        if ($isPublishedParam === null && $context instanceof FlarumContext) {
            $isPublishedParam = $context->internal('isPublished');
        }
        if ($isPublishedParam === 'false' || $isPublishedParam === '0' || $isPublishedParam === false) {
            $query->where('linkrobins_blog_posts.is_published', false);
        } elseif ($isPublishedParam === 'true' || $isPublishedParam === '1' || $isPublishedParam === true) {
            $query->where('linkrobins_blog_posts.is_published', true);
        }

        $categoryId = $params['categoryId'] ?? null;
        if ($categoryId === null && $context instanceof FlarumContext) {
            $categoryId = $context->internal('categoryId');
        }
        if (is_numeric($categoryId)) {
            $query->where('linkrobins_blog_posts.category_id', (int) $categoryId);
        }

        $userId = $params['userId'] ?? null;
        if ($userId === null && $context instanceof FlarumContext) {
            $userId = $context->internal('userId');
        }
        if (is_numeric($userId)) {
            $query->where('linkrobins_blog_posts.user_id', (int) $userId);
        }

        // categoryId / userId are safe to expose to anyone -- they just
        // narrow the listing. visibility is admin-only because letting guests
        // filter by 'members' would leak which posts are members-only via
        // title/excerpt enumeration (the body itself is gated by viewBody).
        $visibility = $params['visibility'] ?? null;
        if ($visibility === null && $context instanceof FlarumContext) {
            $visibility = $context->internal('visibility');
        }
        if (is_string($visibility) && $visibility !== '' && $actor->isAdmin()) {
            $query->where('linkrobins_blog_posts.visibility', $visibility);
        }
    }

    public function find(string $id, Context $context): ?object
    {
        if (is_numeric($id) && $post = $this->query($context)->find($id)) {
            return $post;
        }

        return $this->query($context)->where('slug', $id)->first();
    }

    public function endpoints(): array
    {
        return [
            Endpoint\Show::make()
                ->defaultInclude(['user', 'category']),
            Endpoint\Index::make()
                ->defaultInclude(['user', 'category'])
                ->paginate(20, 50),
            Endpoint\Create::make()
                ->authenticated()
                ->can('createBlogPost'),
            Endpoint\Update::make()
                ->authenticated()
                ->can('edit'),
            Endpoint\Delete::make()
                ->authenticated()
                ->can('delete'),
        ];
    }

    public function sorts(): array
    {
        return [
            SortColumn::make('publishedAt')->descendingAlias('newest')->ascendingAlias('oldest'),
            SortColumn::make('createdAt'),
            SortColumn::make('updatedAt'),
            SortColumn::make('title'),
            SortColumn::make('viewCount'),
            SortColumn::make('commentCount'),
        ];
    }

    public function fields(): array
    {
        return [
            Schema\Str::make('title')
                ->requiredOnCreate()
                ->writable()
                ->maxLength(200),

            Schema\Str::make('slug')
                ->writable()
                ->maxLength(220)
                ->unique('linkrobins_blog_posts', 'slug', true)
                ->set(function (BlogPost $post, ?string $value) {
                    $post->slug = $value ?: Str::slug($post->title);
                }),

            Schema\Str::make('excerpt')
                ->writable()
                ->nullable(),

            Schema\Str::make('content')
                ->writable()
                ->visible(fn (BlogPost $post, FlarumContext $context) => $context->getActor()->can('edit', $post))
                ->get(fn (BlogPost $post) => $post->content),

            Schema\Str::make('contentHtml')
                ->get(function (BlogPost $post, FlarumContext $context) {
                    if (! $context->getActor()->can('viewBody', $post)) {
                        return null;
                    }

                    return $post->formatContent($context->request);
                }),

            Schema\Str::make('teaserHtml')
                ->get(function (BlogPost $post, FlarumContext $context) {
                    // Only returned when the user CAN'T view the full body — i.e. members-only post,
                    // non-logged-in or non-member user. We render the formatted content and then
                    // truncate it to N characters of visible text, controlled by the
                    // linkrobins-blog.members_teaser_chars setting.
                    if ($context->getActor()->can('viewBody', $post)) {
                        return null;
                    }

                    $charsRaw = $this->settings->get('linkrobins-blog.members_teaser_chars', '500');
                    $chars = (int) $charsRaw;
                    if ($chars < 50) $chars = 50;
                    if ($chars > 5000) $chars = 5000;

                    try {
                        $rendered = $post->formatContent($context->request);
                    } catch (\Throwable $e) {
                        return null;
                    }
                    if (! is_string($rendered) || $rendered === '') {
                        return null;
                    }

                    // Use DOMDocument to safely walk the rendered HTML (no regex html parsing).
                    libxml_use_internal_errors(true);
                    $doc = new \DOMDocument();
                    $doc->loadHTML('<?xml encoding="UTF-8"><div>' . $rendered . '</div>', LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD);
                    libxml_clear_errors();

                    $root = $doc->getElementsByTagName('div')->item(0);
                    if (! $root) {
                        return null;
                    }

                    // Walk text nodes in document order, copying nodes into the
                    // teaser until we've accumulated $chars worth of visible text.
                    // When the budget runs out mid-text-node, the final text node
                    // is truncated on a word boundary and an ellipsis appended.
                    $budget = $chars;
                    $teaser = $doc->createElement('div');

                    $copyWithBudget = function (\DOMNode $node) use (&$copyWithBudget, &$budget, $doc) {
                        if ($budget <= 0) {
                            return null;
                        }

                        if ($node->nodeType === XML_TEXT_NODE) {
                            $text = $node->nodeValue;
                            $len = mb_strlen($text);
                            if ($len <= $budget) {
                                $budget -= $len;
                                return $doc->createTextNode($text);
                            }
                            // Truncate on a word boundary within the remaining budget.
                            $slice = mb_substr($text, 0, $budget);
                            $lastSpace = mb_strrpos($slice, ' ');
                            if ($lastSpace !== false && $lastSpace > 0) {
                                $slice = mb_substr($slice, 0, $lastSpace);
                            }
                            $budget = 0;
                            return $doc->createTextNode(rtrim($slice) . '…');
                        }

                        if ($node->nodeType === XML_ELEMENT_NODE) {
                            $clone = $doc->createElement($node->nodeName);
                            foreach ($node->attributes ?? [] as $attr) {
                                $clone->setAttribute($attr->nodeName, $attr->nodeValue);
                            }
                            foreach (iterator_to_array($node->childNodes) as $child) {
                                if ($budget <= 0) break;
                                $copiedChild = $copyWithBudget($child);
                                if ($copiedChild !== null) {
                                    $clone->appendChild($copiedChild);
                                }
                            }
                            return $clone;
                        }

                        return null;
                    };

                    foreach (iterator_to_array($root->childNodes) as $child) {
                        if ($budget <= 0) break;
                        $copied = $copyWithBudget($child);
                        if ($copied !== null) {
                            $teaser->appendChild($copied);
                        }
                    }

                    $out = '';
                    foreach ($teaser->childNodes as $node) {
                        $out .= $doc->saveHTML($node);
                    }
                    return trim($out) !== '' ? $out : null;
                }),

            Schema\Boolean::make('canViewBody')
                ->get(fn (BlogPost $post, FlarumContext $context) => $context->getActor()->can('viewBody', $post)),

            Schema\Boolean::make('canEdit')
                ->get(fn (BlogPost $post, FlarumContext $context) => $context->getActor()->can('edit', $post)),

            Schema\Boolean::make('canDelete')
                ->get(fn (BlogPost $post, FlarumContext $context) => $context->getActor()->can('delete', $post)),

            Schema\Boolean::make('canComment')
                ->get(fn (BlogPost $post, FlarumContext $context) => $context->getActor()->can('comment', $post)),

            Schema\Str::make('coverImageUrl')
                ->property('cover_image_url')
                ->writable()
                ->nullable()
                ->maxLength(500),

            Schema\Str::make('coverImageCredit')
                ->property('cover_image_credit')
                ->writable()
                ->nullable(),

            Schema\Str::make('visibility')
                ->writable()
                ->default(BlogPost::VISIBILITY_PUBLIC),

            Schema\Boolean::make('isPublished')
                ->property('is_published')
                ->writable(),

            Schema\Boolean::make('commentsEnabled')
                ->property('comments_enabled')
                ->writable()
                ->default(true),

            Schema\DateTime::make('publishedAt')
                ->property('published_at')
                ->writable()
                ->nullable(),

            // When the newsletter for this post was last broadcast, or null
            // if never sent. Surfaced so the admin UI can show "Not sent
            // yet" vs "Sent on {date}", and so the same UI can decide
            // whether to offer a "Re-send" affordance.
            Schema\DateTime::make('broadcastSentAt')
                ->property('broadcast_sent_at')
                ->visible(fn (BlogPost $post, FlarumContext $context) => $context->getActor()->isAdmin()),

            Schema\Integer::make('viewCount')
                ->property('view_count'),

            // Live comment count. We compute this from the database rather
            // than trusting the cached comment_count column, so the article
            // page always shows the true number even if the cached column
            // drifts. Counts visible comment posts on the blog post's
            // discussion, EXCLUDING the bookmark-card first post (which is
            // the article link, not a comment). We exclude it by the
            // discussion's first_post_id — unambiguous regardless of post
            // numbering. Returns 0 when there's no discussion yet, and is
            // wrapped in try/catch so a query failure here cannot blank the
            // page (this field runs on every blog-post serialization,
            // including the server-side preload for /blog).
            Schema\Integer::make('commentCount')
                ->get(function (BlogPost $post) {
                    try {
                        $discussion = \Flarum\Discussion\Discussion::query()
                            ->where('blog_post_id', $post->id)
                            ->first(['id', 'first_post_id']);
                        if (! $discussion) {
                            return 0;
                        }
                        $query = \Flarum\Post\Post::query()
                            ->where('discussion_id', $discussion->id)
                            ->where('type', 'comment')
                            ->whereNull('hidden_at')
                            ->where('is_private', false);
                        if ($discussion->first_post_id) {
                            $query->where('id', '!=', $discussion->first_post_id);
                        }
                        return $query->count();
                    } catch (\Throwable $e) {
                        // Throttled log: index pages serialize many posts, so
                        // a broken query would flood error.log without this.
                        // We log once per process per error type.
                        static $loggedKey = null;
                        $key = get_class($e) . ':' . $e->getMessage();
                        if ($loggedKey !== $key) {
                            $loggedKey = $key;
                            error_log('[linkrobins/blog] commentCount query failed for post '
                                . $post->id . ': ' . $e->getMessage());
                        }
                        return 0;
                    }
                }),

            // The blog post's comment Discussion id. The blog article page
            // uses this to link to the full conversation (/d/{id}) and to
            // know whether a discussion exists yet. The discussion is a
            // normal, visible Flarum discussion (kept out of /all listings
            // by HideBlogDiscussionsFromListings). It's created on publish
            // when comments are enabled (via BlogPost::saved); we also
            // lazily create it here as a backstop for posts that somehow
            // lack one (e.g. their discussion was manually deleted). The
            // lazy create is wrapped in try/catch so a transient failure
            // here can NEVER break the page that's serializing the post —
            // this field is called on every blog-post GET, including the
            // server-side document preload for /blog, and a throw here
            // would null out apiDocument and blank the page. Resolves to
            // null when the post isn't published, has comments disabled,
            // or the lazy create fails.
            Schema\Integer::make('discussionId')
                ->get(function (BlogPost $post) {
                    try {
                        $d = \Flarum\Discussion\Discussion::query()
                            ->where('blog_post_id', $post->id)
                            ->first();
                        if ($d) {
                            return $d->id;
                        }
                        if (! $post->is_published || ! $post->comments_enabled) {
                            return null;
                        }
                        $created = \LinkRobins\Blog\BlogServiceProvider::ensureCommentDiscussion($post);
                        return $created?->id;
                    } catch (\Throwable $e) {
                        // Throttled: index pages run this for every post, so
                        // a persistent failure would flood error.log. Log
                        // once per process per error type.
                        static $loggedKey = null;
                        $key = get_class($e) . ':' . $e->getMessage();
                        if ($loggedKey !== $key) {
                            $loggedKey = $key;
                            error_log('[linkrobins/blog] discussionId lazy-create failed for post '
                                . $post->id . ': ' . $e->getMessage());
                        }
                        return null;
                    }
                }),

            // Up to 3 "you may also like" posts to show at the end of the
            // article. Strategy: same category, most recent published first;
            // if that yields fewer than 3, fill from any-category most recent.
            // Only populated on the show endpoint (we never want this firing
            // on /blog or /category index pages -- those serialize many
            // posts, and this would be N extra queries per response).
            //
            // Visibility respects what a non-admin can see: only published
            // posts. We deliberately DON'T filter by visibility=public, so a
            // logged-in member sees recommendations including other members-
            // only posts (the article-level viewBody policy still gates the
            // body itself when they click through).
            //
            // Returned as a flat array of plain objects -- not a relationship
            // -- so we don't have to publish a separate "recommendation"
            // resource or chain includes. Client renders it directly.
            Schema\Arr::make('relatedPosts')
                ->get(function (BlogPost $post, FlarumContext $context) {
                    // Skip on list endpoints. Flarum's Context exposes
                    // showing() / listing() helpers -- this query is only
                    // worth running on the single-post show endpoint;
                    // index pages serialize many posts and would amplify
                    // the cost N-fold.
                    if (! $context->showing()) {
                        return null;
                    }

                    try {
                        $limit = 3;
                        $base = BlogPost::query()
                            ->where('id', '!=', $post->id)
                            ->where('is_published', true)
                            ->orderByDesc('published_at')
                            ->orderByDesc('id'); // tiebreaker: deterministic

                        $sameCategory = [];
                        if ($post->category_id) {
                            $sameCategory = (clone $base)
                                ->where('category_id', $post->category_id)
                                ->limit($limit)
                                ->get()
                                ->all();
                        }

                        $needed = $limit - count($sameCategory);
                        $filler = [];
                        if ($needed > 0) {
                            $excludeIds = array_map(fn ($p) => $p->id, $sameCategory);
                            $excludeIds[] = $post->id;
                            $filler = (clone $base)
                                ->whereNotIn('id', $excludeIds)
                                ->limit($needed)
                                ->get()
                                ->all();
                        }

                        $posts = array_merge($sameCategory, $filler);

                        // Eager-load categories in one query rather than
                        // hitting the DB per row when building the payload.
                        $categoryIds = array_values(array_filter(array_unique(
                            array_map(fn ($p) => $p->category_id, $posts)
                        )));
                        $categories = $categoryIds
                            ? \LinkRobins\Blog\BlogCategory::query()
                                ->whereIn('id', $categoryIds)
                                ->get()
                                ->keyBy('id')
                            : collect();

                        return array_map(function (BlogPost $p) use ($categories) {
                            $cat = $p->category_id ? ($categories[$p->category_id] ?? null) : null;
                            return [
                                'id'             => (int) $p->id,
                                'title'          => (string) $p->title,
                                'slug'           => (string) $p->slug,
                                'coverImageUrl'  => $p->cover_image_url,
                                'publishedAt'    => $p->published_at?->toIso8601String(),
                                'category'       => $cat ? [
                                    'id'    => (int) $cat->id,
                                    'name'  => (string) $cat->name,
                                    'slug'  => (string) $cat->slug,
                                    'color' => $cat->color,
                                ] : null,
                            ];
                        }, $posts);
                    } catch (\Throwable $e) {
                        static $loggedKey = null;
                        $key = get_class($e) . ':' . $e->getMessage();
                        if ($loggedKey !== $key) {
                            $loggedKey = $key;
                            error_log('[linkrobins/blog] relatedPosts query failed for post '
                                . $post->id . ': ' . $e->getMessage());
                        }
                        return [];
                    }
                }),

            Schema\DateTime::make('createdAt')
                ->property('created_at'),

            Schema\DateTime::make('updatedAt')
                ->property('updated_at'),

            Schema\Relationship\ToOne::make('user')
                ->type('users')
                ->includable()
                ->writable(),

            Schema\Relationship\ToOne::make('category')
                ->type('linkrobins-blog-categories')
                ->includable()
                ->writable(),
        ];
    }

    public function creating(object $model, Context $context): ?object
    {
        $actor = $context->getActor();

        // Force user_id to the acting user. Without this, a non-admin
        // author could craft a request body with `relationships.user`
        // pointing at another user and impersonate them on the post.
        // Admins and moderators legitimately reassigning authorship is
        // out of scope; if we ever add an "author as someone else" UI
        // we'll relax this for those roles specifically.
        if (! $actor->isGuest()) {
            $model->user_id = $actor->id;
        }

        if ($model->view_count === null)    $model->view_count = 0;
        if ($model->comment_count === null) $model->comment_count = 0;

        $body = $context->body();
        $rawContent = data_get($body, 'data.attributes.content');
        if (is_string($rawContent)) {
            $model->setContentAttribute($rawContent, $actor);
        }

        return $model;
    }

    public function updating(object $model, Context $context): ?object
    {
        $actor = $context->getActor();

        // Same impersonation guard as creating: if the request tried to
        // change user_id, snap it back to whatever it was before. Eloquent
        // gives us the pre-modification value via getOriginal().
        $originalUserId = $model->getOriginal('user_id');
        $currentUserId  = $model->user_id;
        if ((int) $currentUserId !== (int) $originalUserId) {
            $model->user_id = $originalUserId;
        }

        $body = $context->body();
        $rawContent = data_get($body, 'data.attributes.content');
        if (is_string($rawContent)) {
            $model->setContentAttribute($rawContent, $actor);
        }

        return $model;
    }
}
