<?php

namespace LinkRobins\Blog\Content;

use Flarum\Api\JsonApi;
use Flarum\Api\Resource\DiscussionResource;
use Flarum\Frontend\Document;
use Flarum\Http\RequestUtil;
use Flarum\Settings\SettingsRepositoryInterface;
use Illuminate\Support\Arr;
use Psr\Http\Message\ServerRequestInterface;

class BlogIndex
{
    public function __construct(
        protected JsonApi $api,
        protected SettingsRepositoryInterface $settings,
    ) {}

    public function __invoke(Document $document, ServerRequestInterface $request): Document
    {
        $rawSlugs = (string) $this->settings->get('linkrobins-blog.tag_slugs', '');

        if (trim($rawSlugs) === '') {
            $rawSlugs = (string) $this->settings->get('linkrobins-blog.tag_slug', 'blog');
        }
        $slugs = self::parseSlugs($rawSlugs);
        if (empty($slugs)) $slugs = ['blog'];

        $page = max(1, (int) Arr::get($request->getQueryParams(), 'page', 1));
        $perPage = 12;

        try {
            $apiDocument = $this->api
                ->forResource(DiscussionResource::class)
                ->forEndpoint('list')
                ->process(
                    body: [],
                    internal: [

                        'filter'  => ['tag' => implode(',', $slugs)],
                        'sort'    => '-createdAt',
                        'page'    => ['offset' => ($page - 1) * $perPage, 'limit' => $perPage],
                        'include' => 'firstPost,user,tags',
                    ],
                    options: [
                        'actor' => RequestUtil::getActor($request),
                    ],
                );
            $document->payload = json_decode(json_encode($apiDocument), true);
        } catch (\Throwable $e) {

        }

        $title = (string) $this->settings->get('linkrobins-blog.title', '');
        if ($title === '') $title = (string) $this->settings->get('forum_title', 'Blog');

        $document->title = $title;
        return $document;
    }

    public static function parseSlugs(string $raw): array
    {
        $parts = preg_split('/[\r\n,]+/', $raw) ?: [];
        $out = [];
        foreach ($parts as $p) {
            $p = trim((string) $p);
            if ($p === '') continue;
            $out[] = mb_strtolower($p);
        }
        return array_values(array_unique($out));
    }
}
