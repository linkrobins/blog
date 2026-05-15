<?php

namespace LinkRobins\Blog\Api\Controller;

use Flarum\Http\RequestUtil;
use Illuminate\Contracts\Bus\Dispatcher;
use Laminas\Diactoros\Response\JsonResponse;
use LinkRobins\Blog\BlogPost;
use LinkRobins\Blog\BlogSubscriber;
use LinkRobins\Blog\Job\SendNewsletter;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;

/**
 * POST /api/linkrobins-blog/posts/{id}/broadcast
 *
 * Admin-only newsletter broadcast trigger. Refuses to re-broadcast a post
 * unless force=1 (query or body). Returns:
 *
 *   { status: 'sent'|'queued', sent_at: iso8601|null, subscriber_count: int }
 *
 * The subscriber_count is a snapshot at trigger time; actual delivery
 * happens inside the SendNewsletter job.
 */
class BroadcastPostController implements RequestHandlerInterface
{
    public function __construct(
        protected Dispatcher $bus,
    ) {
    }

    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        $actor = RequestUtil::getActor($request);

        if (! $actor->isAdmin()) {
            return $this->error(403, 'forbidden', 'You must be an admin to broadcast posts.');
        }

        $postId = $request->getAttribute('routeParameters')['id'] ?? null;
        if (! is_numeric($postId)) {
            return $this->error(400, 'invalid_post_id', 'Post id must be numeric.');
        }

        $post = BlogPost::query()->find((int) $postId);
        if (! $post) {
            return $this->error(404, 'post_not_found', 'Blog post not found.');
        }

        if (! $post->is_published) {
            return $this->error(422, 'post_not_published', 'Publish the post before broadcasting.');
        }

        $params = array_merge(
            $request->getQueryParams() ?? [],
            (array) ($request->getParsedBody() ?? [])
        );
        $force = filter_var($params['force'] ?? false, FILTER_VALIDATE_BOOLEAN);

        if ($post->broadcast_sent_at && ! $force) {
            return new JsonResponse([
                'errors' => [[
                    'status' => '409',
                    'code'   => 'already_broadcast',
                    'detail' => 'Newsletter for this post was already sent on '
                        . $post->broadcast_sent_at->toIso8601String()
                        . '. Pass force=1 to re-send.',
                ]],
                'broadcast_sent_at' => $post->broadcast_sent_at->toIso8601String(),
            ], 409);
        }

        $count = BlogSubscriber::query()->count();
        if ($count === 0) {
            return $this->error(422, 'no_subscribers', 'There are no subscribers yet.');
        }

        try {
            $this->bus->dispatch(new SendNewsletter($post->id, $force));
        } catch (\Throwable $e) {
            error_log('[linkrobins/blog] broadcast dispatch failed: ' . $e->getMessage());
            return $this->error(500, 'broadcast_dispatch_failed',
                'Could not dispatch the broadcast. Check server logs for details.');
        }

        // Re-fetch so we report the timestamp the job stamped (if the sync
        // queue ran it inline). On a real queue this stays null and the
        // client should treat status='queued' as "in flight".
        $post->refresh();

        return new JsonResponse([
            'status'           => $post->broadcast_sent_at ? 'sent' : 'queued',
            'sent_at'          => $post->broadcast_sent_at?->toIso8601String(),
            'subscriber_count' => $count,
        ]);
    }

    protected function error(int $status, string $code, string $detail): JsonResponse
    {
        return new JsonResponse([
            'errors' => [[
                'status' => (string) $status,
                'code'   => $code,
                'detail' => $detail,
            ]],
        ], $status);
    }
}
