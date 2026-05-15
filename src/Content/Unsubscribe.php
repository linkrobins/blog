<?php

namespace LinkRobins\Blog\Content;

use Flarum\Frontend\Document;
use Flarum\Http\UrlGenerator;
use LinkRobins\Blog\BlogSubscriber;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Log\LoggerInterface;

/**
 * GET /linkrobins-blog/unsubscribe/{token}
 *
 * Public token-based unsubscribe endpoint. No auth -- the token IS the auth.
 *
 * Threat model: the only way an attacker can craft a working unsubscribe
 * URL is if they know the victim's per-subscriber token. The token is 64
 * random characters generated server-side and only ever sent in the
 * subscriber's own newsletter emails. Worst case: a victim can have
 * themselves unsubscribed by someone who has access to their inbox -- in
 * which case the attacker has worse options.
 *
 * Renders the same confirmation page whether the token matches or not, to
 * avoid leaking which addresses are subscribed.
 */
class Unsubscribe
{
    public function __construct(
        protected UrlGenerator $url,
        protected LoggerInterface $log,
    ) {
    }

    public function __invoke(Document $document, ServerRequestInterface $request): Document
    {
        $token = $request->getAttribute('routeParameters')['token'] ?? null;

        if (is_string($token) && $token !== '') {
            $sub = BlogSubscriber::query()
                ->where('unsubscribe_token', $token)
                ->first();
            if ($sub) {
                $userId = $sub->user_id;
                $sub->delete();
                $this->log->info('[linkrobins/blog] subscriber unsubscribed via token', [
                    'subscriber_id' => $sub->id,
                    'user_id'       => $userId,
                ]);
            }
        }

        $document->title   = 'Unsubscribed';
        $document->content = $this->renderPage();

        return $document;
    }

    protected function renderPage(): string
    {
        $blogHref = $this->url->to('forum')->path('blog');
        $message  = 'You have been unsubscribed from the newsletter. If you change your '
                  . 'mind, you can subscribe again from the blog sidebar.';

        $esc = fn (string $s): string => htmlspecialchars($s, ENT_QUOTES | ENT_HTML5, 'UTF-8');

        return '<div class="LinkRobinsBlog-unsubscribePage" style="max-width:600px;margin:80px auto;padding:32px;text-align:center;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;">'
            . '<h1 style="font-size:1.8rem;margin:0 0 16px;">Unsubscribed</h1>'
            . '<p style="font-size:1.05rem;color:#555;margin:0 0 24px;line-height:1.55;">'
            . $esc($message)
            . '</p>'
            . '<p style="margin:0;"><a href="' . $esc($blogHref) . '" style="color:#1e6fd9;text-decoration:none;font-weight:600;">&larr; Back to the blog</a></p>'
            . '</div>';
    }
}
