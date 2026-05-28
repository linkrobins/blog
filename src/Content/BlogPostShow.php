<?php

namespace LinkRobins\Blog\Content;

use Flarum\Api\JsonApi;
use Flarum\Frontend\Document;
use Flarum\Http\RequestUtil;
use Flarum\Settings\SettingsRepositoryInterface;
use LinkRobins\Blog\Api\Resource\BlogPostResource;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Log\LoggerInterface;

class BlogPostShow
{
    public function __construct(
        protected JsonApi $api,
        protected SettingsRepositoryInterface $settings,
        protected LoggerInterface $log,
    ) {
    }

    public function __invoke(Document $document, ServerRequestInterface $request): Document
    {
        $slug = $request->getAttribute('routeParameters')['slug'] ?? null;

        if (! $slug) {
            return $document;
        }

        // URLs are /article/YYYY-MM-DD-{slug}; the stored slug is just the bare slug.
        // Strip the optional date prefix so the API lookup matches.
        $bareSlug = preg_replace('/^\d{4}-\d{2}-\d{2}-/', '', $slug);

        try {
            $apiDocument = $this->api
                ->forResource(BlogPostResource::class)
                ->forEndpoint('show')
                ->process(
                    body: [],
                    internal: [
                        'id'      => $bareSlug,
                        'include' => 'user,category',
                    ],
                    options: [
                        'actor' => RequestUtil::getActor($request),
                    ],
                );

            $document->payload['apiDocument'] = json_decode(json_encode($apiDocument), true);

            $title = data_get($document->payload['apiDocument'], 'data.attributes.title');
            if ($title) {
                $document->title = $title;
            }
        } catch (\Throwable $e) {
            $this->log->warning('[linkrobins/blog] article page SSR preload failed', ['exception' => $e]);
            $document->payload['apiDocument'] = null;
        }

        return $document;
    }
}
