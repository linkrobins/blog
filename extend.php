<?php

use Flarum\Api\Resource\DiscussionResource;
use Flarum\Api\Schema\Str;
use Flarum\Extend;
use LinkRobins\Blog\Api\ExcerptAttribute;
use LinkRobins\Blog\Content\BlogIndex;
use LinkRobins\Blog\Content\BlogPost;

return [
    (new Extend\Frontend('forum'))
        ->js(__DIR__ . '/js/forum.js')
        ->css(__DIR__ . '/less/forum.less')
        ->route('/blog',                          'linkrobins-blog.index', BlogIndex::class)
        ->route('/blog/{id:\d+(?:-[^/]*)?}',      'linkrobins-blog.post',  BlogPost::class),

    (new Extend\Frontend('admin'))
        ->js(__DIR__ . '/js/admin.js')
        ->css(__DIR__ . '/less/admin.less'),

    new Extend\Locales(__DIR__ . '/locale'),

    (new Extend\ApiResource(DiscussionResource::class))
        ->fields(function () {
            return [
                Str::make('linkrobinsBlogExcerpt')
                    ->get(function ($discussion) {
                        return ExcerptAttribute::excerpt($discussion);
                    }),
                Str::make('linkrobinsBlogCoverImage')
                    ->get(function ($discussion) {
                        return ExcerptAttribute::cover($discussion);
                    }),
            ];
        }),

    (new Extend\Settings())
        ->default('linkrobins-blog.tag_slugs',       'blog')
        ->default('linkrobins-blog.title',           '')
        ->default('linkrobins-blog.tagline',         '')
        ->default('linkrobins-blog.show_featured',   '1')
        ->default('linkrobins-blog.nav_label',       '')
        ->default('linkrobins-blog.nav_icon',        '')
        ->default('linkrobins-blog.header_mode',     'text')
        ->default('linkrobins-blog.custom_logo_url', '')
        ->serializeToForum('linkrobinsBlogTagSlugs',     'linkrobins-blog.tag_slugs')
        ->serializeToForum('linkrobinsBlogTitle',        'linkrobins-blog.title')
        ->serializeToForum('linkrobinsBlogTagline',      'linkrobins-blog.tagline')
        ->serializeToForum('linkrobinsBlogShowFeatured', 'linkrobins-blog.show_featured', function ($value) {
            return $value === '1' || $value === 1 || $value === true;
        })
        ->serializeToForum('linkrobinsBlogNavLabel',     'linkrobins-blog.nav_label')
        ->serializeToForum('linkrobinsBlogNavIcon',      'linkrobins-blog.nav_icon')
        ->serializeToForum('linkrobinsBlogHeaderMode',     'linkrobins-blog.header_mode')
        ->serializeToForum('linkrobinsBlogCustomLogoUrl',  'linkrobins-blog.custom_logo_url'),
];
