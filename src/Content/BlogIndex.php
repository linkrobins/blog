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

class BlogIndex
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
                        'sort'    => '-publishedAt',
                        'page'    => ['offset' => ($page - 1) * $perPage, 'limit' => $perPage],
                        'include' => 'user,category',
                    ],
                    options: [
                        'actor' => RequestUtil::getActor($request),
                    ],
                );

            $document->payload['apiDocument'] = json_decode(json_encode($apiDocument), true);
        } catch (\Throwable $e) {
            $this->log->warning('[linkrobins/blog] /blog index SSR preload failed', ['exception' => $e]);
            $document->payload['apiDocument'] = null;
        }

        $title = (string) $this->settings->get('linkrobins-blog.title', '');
        if ($title === '') {
            $title = (string) $this->settings->get('forum_title', 'Blog');
        }

        $document->title = $title;

        return $document;
    }
}
