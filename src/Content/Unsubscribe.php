<?php

namespace LinkRobins\Blog\Content;

use Flarum\Frontend\Document;
use Flarum\Http\UrlGenerator;
use LinkRobins\Blog\BlogSubscriber;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Log\LoggerInterface;

/**
 * GET /linkrobins-blog/unsubscribe/{token}
 * GET /linkrobins-blog/unsubscribe/{token}?confirm=1
 *
 * Public token-based unsubscribe endpoint. No auth -- the token IS the auth.
 *
 * Two-step flow to defeat email-client prefetch scanners:
 *   - bare URL  -> show a "Confirm unsubscribe" page with a form button
 *   - ?confirm=1 -> actually delete the row
 *
 * Anti-phishing and link-preview scanners hit the bare URL when an email
 * arrives. If GET-on-the-link did the delete directly, those scanners
 * would silently unsubscribe people. Requiring an explicit confirm click
 * (and thus a separate GET with ?confirm=1) closes that hole while still
 * keeping the flow login-free.
 *
 * The token is 64 random characters generated server-side. Treat it as
 * the auth credential for this single capability. We render the same
 * confirmation page whether the token matches or not, to avoid leaking
 * which addresses are subscribed.
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
        $query = $request->getQueryParams() ?? [];
        $confirmed = isset($query['confirm']) && $query['confirm'] !== '' && $query['confirm'] !== '0';

        if (! $confirmed) {
            $document->title   = 'Unsubscribe';
            $document->content = $this->renderConfirmPage((string) $token);
            return $document;
        }

        if (is_string($token) && $token !== '') {
            $sub = BlogSubscriber::query()
                ->where('unsubscribe_token', $token)
                ->first();
            if ($sub) {
                $userId = $sub->user_id;
                $subId  = $sub->id;
                $sub->delete();
                $this->log->info('[linkrobins/blog] subscriber unsubscribed via token', [
                    'subscriber_id' => $subId,
                    'user_id'       => $userId,
                ]);
            }
        }

        $document->title   = 'Unsubscribed';
        $document->content = $this->renderDonePage();
        return $document;
    }

    protected function renderConfirmPage(string $token): string
    {
        $esc = fn (string $s): string => htmlspecialchars($s, ENT_QUOTES | ENT_HTML5, 'UTF-8');

        // The confirm URL is the same path + ?confirm=1. We use the
        // UrlGenerator so it works under custom mount paths.
        $confirmHref = $this->url->to('forum')
            ->path('linkrobins-blog/unsubscribe/' . $token) . '?confirm=1';

        $blogHref = $this->url->to('forum')->path('blog');

        return '<div class="LinkRobinsBlog-unsubscribePage" style="max-width:600px;margin:80px auto;padding:32px;text-align:center;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;">'
            . '<h1 style="font-size:1.8rem;margin:0 0 16px;">Unsubscribe?</h1>'
            . '<p style="font-size:1.05rem;color:#555;margin:0 0 28px;line-height:1.55;">'
            . 'Click the button below to confirm you want to unsubscribe from the newsletter.'
            . '</p>'
            . '<p style="margin:0 0 16px;"><a href="' . $esc($confirmHref) . '" style="display:inline-block;padding:12px 28px;background:#1e6fd9;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">Unsubscribe</a></p>'
            . '<p style="margin:0;font-size:0.9rem;"><a href="' . $esc($blogHref) . '" style="color:#888;text-decoration:underline;">Cancel</a></p>'
            . '</div>';
    }

    protected function renderDonePage(): string
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
