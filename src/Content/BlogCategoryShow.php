<?php

namespace LinkRobins\Blog\Content;

use Flarum\Api\JsonApi;
use Flarum\Frontend\Document;
use Flarum\Http\RequestUtil;
use Flarum\Settings\SettingsRepositoryInterface;
use Illuminate\Support\Arr;
use LinkRobins\Blog\Api\Resource\BlogCategoryResource;
use LinkRobins\Blog\Api\Resource\BlogPostResource;
use LinkRobins\Blog\BlogCategory;
use Psr\Http\Message\ServerRequestInterface;

class BlogCategoryShow
{
    public function __construct(
        protected JsonApi $api,
        protected SettingsRepositoryInterface $settings,
    ) {
    }

    public function __invoke(Document $document, ServerRequestInterface $request): Document
    {
        $slug = $request->getAttribute('routeParameters')['slug'] ?? null;
        if (! $slug) {
            return $document;
        }

        $category = BlogCategory::where('slug', $slug)->first();
        if (! $category) {
            return $document;
        }

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
                        'categoryId' => $category->id,
                        'sort'       => '-publishedAt',
                        'page'       => ['offset' => ($page - 1) * $perPage, 'limit' => $perPage],
                        'include'    => 'user,category',
                    ],
                    options: [
                        'actor' => RequestUtil::getActor($request),
                    ],
                );

            $document->payload['apiDocument']  = json_decode(json_encode($apiDocument), true);
            $document->payload['categorySlug'] = $slug;
            $document->payload['categoryName'] = $category->name;
        } catch (\Throwable $e) {
            $document->payload['apiDocument'] = null;
        }

        $document->title = $category->name;

        return $document;
    }
}
