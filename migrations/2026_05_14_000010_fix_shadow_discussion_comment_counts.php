<?php

use Illuminate\Database\Schema\Builder;

// One-off cleanup: recompute comment_count on every shadow discussion (and
// the cached comment_count on the corresponding blog post) from the real
// number of visible blogComment posts.
//
// Earlier betas could leave a shadow discussion with comment_count=1 even
// when it had zero posts — Flarum's own counter maintenance only counts
// type='comment' posts, never our type='blogComment' ones, so whatever the
// row was seeded with stuck. The result was new/empty blog posts rendering
// "1 Comment". This migration corrects all existing rows; the runtime sync
// in BlogServiceProvider keeps them correct from here on.

return [
    'up' => function (Builder $schema) {
        $db = $schema->getConnection();

        if (! $schema->hasColumn('discussions', 'blog_post_id')) {
            return;
        }

        $shadows = $db->table('discussions')
            ->whereNotNull('blog_post_id')
            ->get(['id', 'blog_post_id', 'comment_count']);

        foreach ($shadows as $shadow) {
            $realCount = $db->table('posts')
                ->where('discussion_id', $shadow->id)
                ->where('type', 'blogComment')
                ->whereNull('hidden_at')
                ->where('is_private', false)
                ->count();

            if ((int) $shadow->comment_count !== $realCount) {
                $db->table('discussions')
                    ->where('id', $shadow->id)
                    ->update(['comment_count' => $realCount]);
            }

            if ($db->getSchemaBuilder()->hasColumn('linkrobins_blog_posts', 'comment_count')) {
                $db->table('linkrobins_blog_posts')
                    ->where('id', $shadow->blog_post_id)
                    ->update(['comment_count' => $realCount]);
            }
        }
    },
    'down' => function (Builder $schema) {
        // No-op: this only corrects data, there's nothing to reverse.
    },
];
