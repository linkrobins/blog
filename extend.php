<?php

use Flarum\Discussion\Discussion;
use Flarum\Discussion\Search\DiscussionSearcher;
use Flarum\Extend;
use Flarum\Search\Database\DatabaseSearchDriver;
use Flarum\User\User;
use LinkRobins\Blog\Access;
use LinkRobins\Blog\Api\Controller\CreateSubscriptionController;
use LinkRobins\Blog\Api\Controller\DeleteSubscriptionController;
use LinkRobins\Blog\Api\Controller\ListSubscribersController;
use LinkRobins\Blog\Api\Controller\ShowSubscriptionController;
use LinkRobins\Blog\Api\Resource\BlogCategoryResource;
use LinkRobins\Blog\Api\Resource\BlogPostResource;
use LinkRobins\Blog\BlogCategory;
use LinkRobins\Blog\BlogPost;
use LinkRobins\Blog\BlogServiceProvider;
use LinkRobins\Blog\BlogSubscriber;
use LinkRobins\Blog\Content\BlogCategoryShow;
use LinkRobins\Blog\Content\BlogDrafts;
use LinkRobins\Blog\Content\BlogIndex;
use LinkRobins\Blog\Content\BlogPostShow;
use LinkRobins\Blog\Content\Unsubscribe;
use LinkRobins\Blog\Search\HideBlogDiscussionsFromListings;

return [
    (new Extend\Frontend('forum'))
        ->js(__DIR__ . '/js/forum.js')
        ->css(__DIR__ . '/less/forum.less')
        ->route('/blog',                                'linkrobins-blog.index',       BlogIndex::class)
        ->route('/blog/drafts',                         'linkrobins-blog.drafts',      BlogDrafts::class)
        ->route('/category/{slug}',                     'linkrobins-blog.category',    BlogCategoryShow::class)
        ->route('/article/{slug}',                      'linkrobins-blog.post',        BlogPostShow::class)
        ->route('/linkrobins-blog/unsubscribe/{token}', 'linkrobins-blog.unsubscribe', Unsubscribe::class),

    (new Extend\Frontend('admin'))
        ->js(__DIR__ . '/js/admin.js')
        ->css(__DIR__ . '/less/admin.less'),

    new Extend\Locales(__DIR__ . '/locale'),

    (new Extend\ServiceProvider())
        ->register(BlogServiceProvider::class),

    new Extend\ApiResource(BlogCategoryResource::class),
    new Extend\ApiResource(BlogPostResource::class),

    (new Extend\Model(Discussion::class))
        ->cast('blog_post_id', 'integer')
        ->belongsTo('blogPost', BlogPost::class, 'blog_post_id'),

    (new Extend\ApiResource(\Flarum\Api\Resource\DiscussionResource::class))
        ->fields(fn () => [
            \Flarum\Api\Schema\Integer::make('blogPostId')
                ->get(fn (Discussion $discussion) => $discussion->blog_post_id),
        ]),

    // Hide blog-comment discussions from /all and similar listings. They
    // remain reachable via /d/{id} and the API; only the listing pipeline
    // filters them out.
    (new Extend\SearchDriver(DatabaseSearchDriver::class))
        ->addMutator(DiscussionSearcher::class, HideBlogDiscussionsFromListings::class),

    (new Extend\Policy())
        ->modelPolicy(BlogPost::class,     Access\BlogPostPolicy::class)
        ->modelPolicy(BlogCategory::class, Access\BlogCategoryPolicy::class)
        ->globalPolicy(Access\GlobalPolicy::class),

    (new Extend\ModelVisibility(BlogPost::class))
        ->scope(Access\ScopeBlogPostVisibility::class),

    (new Extend\Settings())
        ->default('linkrobins-blog.title',                       '')
        ->default('linkrobins-blog.tagline',                     '')
        ->default('linkrobins-blog.posts_per_page',              '12')
        ->default('linkrobins-blog.nav_label',                   '')
        ->default('linkrobins-blog.nav_icon',                    '')
        ->default('linkrobins-blog.header_mode',                 'text')
        ->default('linkrobins-blog.members_teaser_chars',        '500')
        ->default('linkrobins-blog.hero_background_mode',        'none')
        ->default('linkrobins-blog.hero_background_url',         '')
        ->default('linkrobins-blog.hero_overlay',                '40')
        ->default('linkrobins-blog.about_title',                 '')
        ->default('linkrobins-blog.about_html',                  '')
        ->serializeToForum('linkrobinsBlogTitle',                'linkrobins-blog.title')
        ->serializeToForum('linkrobinsBlogTagline',              'linkrobins-blog.tagline')
        ->serializeToForum('linkrobinsBlogPostsPerPage',         'linkrobins-blog.posts_per_page')
        ->serializeToForum('linkrobinsBlogNavLabel',             'linkrobins-blog.nav_label')
        ->serializeToForum('linkrobinsBlogNavIcon',              'linkrobins-blog.nav_icon')
        ->serializeToForum('linkrobinsBlogHeaderMode',           'linkrobins-blog.header_mode')
        ->serializeToForum('linkrobinsBlogMembersTeaserChars',  'linkrobins-blog.members_teaser_chars')
        ->serializeToForum('linkrobinsBlogHeroBgMode',           'linkrobins-blog.hero_background_mode')
        ->serializeToForum('linkrobinsBlogHeroBgUrl',            'linkrobins-blog.hero_background_url')
        ->serializeToForum('linkrobinsBlogHeroOverlay',          'linkrobins-blog.hero_overlay')
        ->serializeToForum('linkrobinsBlogAboutTitle',           'linkrobins-blog.about_title')
        ->serializeToForum('linkrobinsBlogAboutHtml',            'linkrobins-blog.about_html'),

    (new Extend\Formatter())
        ->configure(function ($configurator) {
            if (isset($configurator->Litedown) && property_exists($configurator->Litedown, 'features')) {
                $configurator->Litedown->features['tables'] = true;
            }
        }),

    (new Extend\Routes('api'))
        ->get('/linkrobins-blog/subscription',          'linkrobins-blog.subscription.show',   ShowSubscriptionController::class)
        ->post('/linkrobins-blog/subscription',         'linkrobins-blog.subscription.create', CreateSubscriptionController::class)
        ->delete('/linkrobins-blog/subscription',       'linkrobins-blog.subscription.delete', DeleteSubscriptionController::class)
        ->get('/linkrobins-blog/subscribers',           'linkrobins-blog.subscribers.list',    ListSubscribersController::class),

    (new Extend\View())
        ->namespace('linkrobins-blog', __DIR__ . '/views'),

    // Wrapped in try/catch so a missing subscribers table (e.g. migrations
    // not yet run) does not break every page load forum-wide.
    (new Extend\ApiResource(\Flarum\Api\Resource\ForumResource::class))
        ->fields(fn () => [
            \Flarum\Api\Schema\Boolean::make('linkrobinsBlogSubscribed')
                ->get(function ($model, \Flarum\Api\Context $context) {
                    $actor = $context->getActor();
                    if ($actor->isGuest()) {
                        return false;
                    }
                    try {
                        return BlogSubscriber::query()
                            ->where('user_id', $actor->id)
                            ->exists();
                    } catch (\Throwable $e) {
                        static $loggedKey = null;
                        $key = get_class($e) . ':' . $e->getMessage();
                        if ($loggedKey !== $key) {
                            $loggedKey = $key;
                            error_log('[linkrobins/blog] linkrobinsBlogSubscribed lookup failed: '
                                . $e->getMessage());
                        }
                        return false;
                    }
                }),

            \Flarum\Api\Schema\Boolean::make('canCreateBlogPost')
                ->get(function ($model, \Flarum\Api\Context $context) {
                    $actor = $context->getActor();
                    if ($actor->isGuest()) {
                        return false;
                    }
                    try {
                        return $actor->can('createBlogPost');
                    } catch (\Throwable $e) {
                        error_log('[linkrobins/blog] canCreateBlogPost probe failed: ' . $e->getMessage());
                        return false;
                    }
                }),

            \Flarum\Api\Schema\Boolean::make('canModerateBlogPosts')
                ->get(function ($model, \Flarum\Api\Context $context) {
                    $actor = $context->getActor();
                    if ($actor->isGuest()) {
                        return false;
                    }
                    try {
                        return $actor->can('moderateBlogPosts');
                    } catch (\Throwable $e) {
                        error_log('[linkrobins/blog] canModerateBlogPosts probe failed: ' . $e->getMessage());
                        return false;
                    }
                }),
        ]),

    (new Extend\Model(User::class))
        ->hasMany('blogSubscriptions', BlogSubscriber::class, 'user_id'),
];
