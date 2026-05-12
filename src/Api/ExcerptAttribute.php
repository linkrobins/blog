<?php

namespace LinkRobins\Blog\Api;

use Flarum\Discussion\Discussion;

class ExcerptAttribute
{

    public const EXCERPT_MAX = 220;

    public static function excerpt(Discussion $discussion): string
    {
        $html = self::firstPostHtml($discussion);
        if ($html === '') return '';

        $text = '';
        if (preg_match_all('#<p\b[^>]*>(.*?)</p>#si', $html, $matches)) {
            foreach ($matches[1] as $innerHtml) {
                $candidate = trim((string) preg_replace('/\s+/u', ' ', strip_tags($innerHtml)));
                if ($candidate !== '') {
                    $text = $candidate;
                    break;
                }
            }
        }

        if ($text === '') {
            $text = (string) preg_replace('/\s+/u', ' ', strip_tags($html));
            $text = trim($text);
        }

        if ($text === '') return '';

        if (mb_strlen($text) > self::EXCERPT_MAX) {
            $text = mb_substr($text, 0, self::EXCERPT_MAX);
            $pos  = mb_strrpos($text, ' ');
            if ($pos !== false && $pos > 60) {
                $text = mb_substr($text, 0, $pos);
            }
            $text .= '…';
        }

        return $text;
    }

    public static function cover(Discussion $discussion): ?string
    {
        $html = self::firstPostHtml($discussion);
        if ($html === '') return null;

        if (preg_match('#<a\b[^>]*?\bhref=([\'"])(.*?)\1[^>]*?>\s*<img\b#si', $html, $m)) {
            $url = trim($m[2]);
            if ($url !== '' && self::looksLikeImageUrl($url)) return $url;
        }

        if (preg_match('#<img\b[^>]*?\bsrc=([\'"])(.*?)\1#si', $html, $m)) {
            $url = trim($m[2]);
            if ($url !== '' && self::looksLikeImageUrl($url)) return $url;
        }

        if (preg_match('#<img\b[^>]*?\bdata-src=([\'"])(.*?)\1#si', $html, $m)) {
            $url = trim($m[2]);
            if ($url !== '' && self::looksLikeImageUrl($url)) return $url;
        }

        if (preg_match('#<source\b[^>]*?\bsrcset=([\'"])(.*?)\1#si', $html, $m)) {
            $srcset = trim($m[2]);
            $first = explode(',', $srcset)[0];
            $url = trim(explode(' ', trim($first))[0]);
            if ($url !== '' && self::looksLikeImageUrl($url)) return $url;
        }

        return null;
    }

    protected static function looksLikeImageUrl(string $url): bool
    {
        $clean = explode('?', $url, 2)[0];
        $clean = strtolower($clean);
        return (bool) preg_match('/\.(jpe?g|png|gif|webp|avif|bmp|svg)$/', $clean)
            || strpos($url, '/assets/') !== false
            || strpos($url, '/uploads/') !== false
            || strpos($url, '/storage/') !== false;
    }

    protected static function firstPostHtml(Discussion $discussion): string
    {
        $discussionId = $discussion->id ?? null;
        $firstPostId  = $discussion->first_post_id ?? null;
        $post = null;
        $path = null;

        try {
            $candidate = $discussion->firstPost;
            if ($candidate) { $post = $candidate; $path = 'relation'; }
        } catch (\Throwable $e) {
            self::debugLog('firstPost relation threw', [
                'discussion_id' => $discussionId,
                'error'         => $e->getMessage(),
            ]);
        }

        if (!$post && $firstPostId) {
            try {
                $post = \Flarum\Post\Post::query()
                    ->where('id', $firstPostId)
                    ->first();
                if ($post) $path = 'first_post_id_query';
            } catch (\Throwable $e) {
                self::debugLog('first_post_id query threw', [
                    'discussion_id' => $discussionId,
                    'first_post_id' => $firstPostId,
                    'error'         => $e->getMessage(),
                ]);
            }
        }

        if (!$post) {
            try {
                $post = $discussion->posts()
                    ->where('type', 'comment')
                    ->orderBy('number')
                    ->orderBy('created_at')
                    ->first();
                if ($post) $path = 'posts_relation';
            } catch (\Throwable $e) {
                self::debugLog('posts relation query threw', [
                    'discussion_id' => $discussionId,
                    'error'         => $e->getMessage(),
                ]);
            }
        }

        if (!$post) {
            self::debugLog('no first post found', [
                'discussion_id' => $discussionId,
                'first_post_id' => $firstPostId,
            ]);
            return '';
        }

        $html = null;
        try {
            if ($post instanceof \Flarum\Post\CommentPost) {
                $html = $post->formatContent(null);
            }
        } catch (\Throwable $e) {
            self::debugLog('formatContent threw', [
                'discussion_id' => $discussionId,
                'post_id'       => $post->id ?? null,
                'error'         => $e->getMessage(),
            ]);
        }

        if (!is_string($html) || $html === '') {
            self::debugLog('first post rendered empty', [
                'discussion_id' => $discussionId,
                'post_id'       => $post->id ?? null,
                'path'          => $path,
                'post_class'    => $post ? get_class($post) : null,
                'post_type'     => $post->type ?? null,
            ]);
            return '';
        }

        if (!self::$loggedSuccess) {
            self::$loggedSuccess = true;
            self::debugLog('first post resolved', [
                'discussion_id' => $discussionId,
                'post_id'       => $post->id ?? null,
                'path'          => $path,
                'html_len'      => strlen($html),
                'html_head'     => substr($html, 0, 200),
            ]);
        }

        return $html;
    }

    protected static bool $loggedSuccess = false;

    protected static function debugLog(string $message, array $context = []): void
    {
        try {
            if (function_exists('resolve')) {
                $logger = resolve(\Psr\Log\LoggerInterface::class);
                if ($logger) {
                    $logger->debug('[linkrobins/blog] ' . $message, $context);
                }
            }
        } catch (\Throwable $e) {}
    }
}

