<?php

namespace LinkRobins\Blog\Content;

use Flarum\Api\JsonApi;
use Flarum\Frontend\Document;
use Flarum\Http\RequestUtil;
use Flarum\Settings\SettingsRepositoryInterface;
use Illuminate\Support\Arr;
use LinkRobins\Blog\Api\Resource\BlogPostResource;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Log\LoggerInterface;

/**
 * Server-side renderer for /blog/drafts.
 *
 * Identical to BlogIndex except it asks the API for unpublished posts
 * via the internal `isPublished` flag. The resource scope handles
 * visibility:
 *   - Admin or moderator: all drafts
 *   - Author (linkrobins-blog.start): their own drafts only
 *   - Everyone else: nothing (empty page)
 *
 * The sidebar entry for Drafts is gated on `canCreateBlogPost`, so
 * users without authoring permission don't see the link at all. This
 * page is the fallback path for direct URL access -- it stays safe
 * but quiet.
 */
class BlogDrafts
{
    public function __construct(
        protected JsonApi $api,
        protected SettingsRepositoryInterface $settings,
        protected LoggerInterface $log,
    ) {
    }

    public function __invoke(Document $document, ServerRequestInterface $request): Document
    {
        $page    = max(1, (int) Arr::get($request->getQueryParams(), 'page', 1));
        $perPage = (int) $this->settings->get('linkrobins-blog.posts_per_page', 12);
        if ($perPage < 1 || $perPage > 50) {
            $perPage = 12;
        }

        try {
            $apiDocument = $this->api
                ->forResource(BlogPostResource::class)
                ->forEndpoint('list')
                ->process(
                    body: [],
                    internal: [
                        'sort'        => '-createdAt',
                        'page'        => ['offset' => ($page - 1) * $perPage, 'limit' => $perPage],
                        'include'     => 'user,category',
                        'isPublished' => false,
                    ],
                    options: [
                        'actor' => RequestUtil::getActor($request),
                    ],
                );

            $document->payload['apiDocument'] = json_decode(json_encode($apiDocument), true);
        } catch (\Throwable $e) {
            $this->log->warning('[linkrobins/blog] /blog/drafts SSR preload failed', ['exception' => $e]);
            $document->payload['apiDocument'] = null;
        }

        $title = (string) $this->settings->get('linkrobins-blog.title', '');
        if ($title === '') {
            $title = (string) $this->settings->get('forum_title', 'Blog');
        }

        $document->title = 'Drafts — ' . $title;

        return $document;
    }
}
