<?php

namespace LinkRobins\Blog\Api\Controller;

use Carbon\Carbon;
use Flarum\Http\RequestUtil;
use Laminas\Diactoros\Response\JsonResponse;
use LinkRobins\Blog\BlogSubscriber;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;

/**
 * POST /api/linkrobins-blog/subscription
 *
 * Subscribes the current actor. Idempotent: re-subscribing is a no-op via
 * the unique index on user_id. Returns { subscribed: true }.
 */
class CreateSubscriptionController implements RequestHandlerInterface
{
    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        $actor = RequestUtil::getActor($request);

        if ($actor->isGuest()) {
            return new JsonResponse(['error' => 'Authentication required.'], 401);
        }

        try {
            BlogSubscriber::query()->updateOrCreate(
                ['user_id' => $actor->id],
                ['created_at' => Carbon::now()]
            );
        } catch (\Throwable $e) {
            resolve(\Psr\Log\LoggerInterface::class)->warning('[linkrobins/blog] subscribe failed', ['exception' => $e]);
            return new JsonResponse([
                'errors' => [[
                    'status' => '500',
                    'code'   => 'subscribe_failed',
                    'detail' => 'Could not subscribe. Check server logs for details.',
                ]],
            ], 500);
        }

        return new JsonResponse(['subscribed' => true]);
    }
}
