<?php

namespace LinkRobins\Blog\Content;

use Flarum\Api\JsonApi;
use Flarum\Api\Resource\DiscussionResource;
use Flarum\Frontend\Document;
use Flarum\Http\RequestUtil;
use Flarum\Settings\SettingsRepositoryInterface;
use Illuminate\Support\Arr;
use Psr\Http\Message\ServerRequestInterface;

class BlogPost
{
    public function __construct(
        protected JsonApi $api,
        protected SettingsRepositoryInterface $settings,
    ) {}

    public function __invoke(Document $document, ServerRequestInterface $request): Document
    {
        $idParam = (string) Arr::get($request->getQueryParams(), 'id', '');

        if (preg_match('/^(\d+)/', $idParam, $m)) {
            $id = (int) $m[1];
        } else {
            $id = 0;
        }

        if ($id > 0) {
            try {
                $apiDocument = $this->api
                    ->forResource(DiscussionResource::class)
                    ->forEndpoint('show')
                    ->process(
                        body: [],
                        internal: [
                            'id'      => (string) $id,

                            'include' => 'tags',
                        ],
                        options: [
                            'actor' => RequestUtil::getActor($request),
                        ],
                    );

                $payloadArr = json_decode(json_encode($apiDocument), true);
                $document->payload = $payloadArr;

                $title = $payloadArr['data']['attributes']['title'] ?? '';
                if ($title !== '') {
                    $document->title = $title;
                }
            } catch (\Throwable $e) {

            }
        }

        if (!isset($document->title) || $document->title === null || $document->title === '') {
            $document->title = (string) $this->settings->get('linkrobins-blog.title', 'Blog');
        }

        return $document;
    }
}
