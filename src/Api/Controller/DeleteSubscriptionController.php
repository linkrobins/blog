<?php

namespace LinkRobins\Blog\Api\Controller;

use Flarum\Http\RequestUtil;
use Laminas\Diactoros\Response\JsonResponse;
use LinkRobins\Blog\BlogSubscriber;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;

/**
 * DELETE /api/linkrobins-blog/subscription
 *
 * Unsubscribes the current actor. Idempotent: deleting a non-existent row
 * is a no-op. Returns { subscribed: false }.
 */
class DeleteSubscriptionController implements RequestHandlerInterface
{
    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        $actor = RequestUtil::getActor($request);

        if ($actor->isGuest()) {
            return new JsonResponse(['error' => 'Authentication required.'], 401);
        }

        try {
            BlogSubscriber::query()
                ->where('user_id', $actor->id)
                ->delete();
        } catch (\Throwable $e) {
            resolve(\Psr\Log\LoggerInterface::class)->warning('[linkrobins/blog] unsubscribe failed', ['exception' => $e]);
            return new JsonResponse([
                'errors' => [[
                    'status' => '500',
                    'code'   => 'unsubscribe_failed',
                    'detail' => 'Could not unsubscribe. Check server logs for details.',
                ]],
            ], 500);
        }

        return new JsonResponse(['subscribed' => false]);
    }
}
