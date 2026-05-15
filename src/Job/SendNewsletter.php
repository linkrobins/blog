<?php

namespace LinkRobins\Blog\Job;

use Carbon\Carbon;
use Flarum\Http\UrlGenerator;
use Flarum\Queue\AbstractJob;
use Flarum\Settings\SettingsRepositoryInterface;
use Illuminate\Contracts\Mail\Mailer;
use Illuminate\Mail\Message;
use LinkRobins\Blog\BlogPost;
use LinkRobins\Blog\BlogSubscriber;
use Psr\Log\LoggerInterface;

/**
 * Sends the newsletter for a single blog post to every current subscriber.
 *
 * Idempotency: the calling endpoint refuses to re-enqueue unless force=1.
 * The job ALSO stamps broadcast_sent_at on the post before sending any
 * email, so two simultaneous jobs race on the timestamp rather than
 * double-sending.
 *
 * Per-recipient errors are caught and logged; one bad address does not
 * abort the batch.
 */
class SendNewsletter extends AbstractJob
{
    public function __construct(
        public readonly int $blogPostId,
        public readonly bool $force = false,
    ) {
    }

    public function handle(
        Mailer $mailer,
        UrlGenerator $url,
        SettingsRepositoryInterface $settings,
        LoggerInterface $log,
    ): void {
        $post = BlogPost::query()->find($this->blogPostId);
        if (! $post) {
            $log->warning('[linkrobins/blog] newsletter aborted: post not found', [
                'blog_post_id' => $this->blogPostId,
            ]);
            return;
        }

        if ($post->broadcast_sent_at && ! $this->force) {
            $log->info('[linkrobins/blog] newsletter aborted: already broadcast', [
                'blog_post_id'      => $post->id,
                'broadcast_sent_at' => $post->broadcast_sent_at->toIso8601String(),
            ]);
            return;
        }

        // Stamp early so concurrent jobs race on the timestamp rather than
        // both sending. A second concurrent call now sees a non-null
        // broadcast_sent_at and bails (unless it too has force=true).
        $post->broadcast_sent_at = Carbon::now();
        $post->save();

        $date       = $post->published_at ?? $post->created_at ?? Carbon::now();
        $datedSlug  = $date->format('Y-m-d') . '-' . $post->slug;
        $articleUrl = $url->to('forum')->path('article/' . $datedSlug);

        $forumTitle = (string) ($settings->get('forum_title') ?? 'Blog');
        $blogTitle  = (string) ($settings->get('linkrobins-blog.title') ?? '');
        $brandName  = $blogTitle !== '' ? $blogTitle : $forumTitle;

        $fromAddress = (string) $settings->get('mail_from');
        $fromName    = $brandName;

        $subject = $post->title;

        $excerpt = $post->excerpt ?: '';
        if ($excerpt === '' && $post->content) {
            $excerpt = mb_substr(strip_tags((string) $post->content), 0, 280);
        }

        $sent   = 0;
        $failed = 0;

        BlogSubscriber::query()
            ->with('user')
            ->orderBy('id')
            ->chunk(200, function ($chunk) use (
                $mailer, $url, $post, $articleUrl,
                $excerpt, $brandName, $subject, $fromAddress, $fromName,
                $log, &$sent, &$failed,
            ) {
                foreach ($chunk as $sub) {
                    if (! $sub->user || ! $sub->user->email) {
                        continue;
                    }

                    $unsubscribeUrl = $url->to('forum')
                        ->path('linkrobins-blog/unsubscribe/' . $sub->unsubscribe_token);

                    try {
                        $mailer->send(
                            [
                                'html' => 'linkrobins-blog::email.newsletter-html',
                                'text' => 'linkrobins-blog::email.newsletter-text',
                            ],
                            [
                                'post'           => $post,
                                'articleUrl'     => $articleUrl,
                                'brandName'      => $brandName,
                                'excerpt'        => $excerpt,
                                'unsubscribeUrl' => $unsubscribeUrl,
                                'recipientName'  => (string) ($sub->user->display_name ?: $sub->user->username),
                            ],
                            function (Message $message) use (
                                $sub, $subject, $unsubscribeUrl, $fromAddress, $fromName
                            ) {
                                if ($fromAddress !== '') {
                                    $message->from($fromAddress, $fromName);
                                }
                                $message->to($sub->user->email);
                                $message->subject($subject);

                                // List-Unsubscribe header: Gmail and Apple
                                // Mail surface a built-in unsubscribe button
                                // when this is present, which improves
                                // deliverability.
                                $message->getHeaders()
                                    ->addTextHeader('List-Unsubscribe', '<' . $unsubscribeUrl . '>');
                            }
                        );
                        $sent++;
                    } catch (\Throwable $e) {
                        $failed++;
                        $log->error('[linkrobins/blog] newsletter send failed for one recipient', [
                            'subscriber_id' => $sub->id,
                            'user_id'       => $sub->user_id,
                            'error'         => $e->getMessage(),
                        ]);
                    }
                }
            });

        $log->info('[linkrobins/blog] newsletter broadcast complete', [
            'blog_post_id' => $post->id,
            'sent'         => $sent,
            'failed'       => $failed,
        ]);
    }
}
