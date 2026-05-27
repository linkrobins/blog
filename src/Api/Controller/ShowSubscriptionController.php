<?php

namespace LinkRobins\Blog\Api\Controller;

use Flarum\Http\RequestUtil;
use Laminas\Diactoros\Response\JsonResponse;
use LinkRobins\Blog\BlogSubscriber;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;

/**
 * GET /api/linkrobins-blog/subscription
 *
 * Returns { subscribed: bool } for the current actor. In practice the
 * forum payload also carries this value (linkrobinsBlogSubscribed), so
 * the frontend rarely needs this endpoint.
 */
class ShowSubscriptionController implements RequestHandlerInterface
{
    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        $actor = RequestUtil::getActor($request);

        if ($actor->isGuest()) {
            return new JsonResponse(['error' => 'Authentication required.'], 401);
        }

        try {
            $subscribed = BlogSubscriber::query()
                ->where('user_id', $actor->id)
                ->exists();
        } catch (\Throwable $e) {
            resolve(\Psr\Log\LoggerInterface::class)->warning('[linkrobins/blog] subscription status failed', ['exception' => $e]);
            return new JsonResponse([
                'errors' => [[
                    'status' => '500',
                    'code'   => 'subscription_status_failed',
                    'detail' => 'Could not check subscription status.',
                ]],
            ], 500);
        }

        return new JsonResponse(['subscribed' => $subscribed]);
    }
}
