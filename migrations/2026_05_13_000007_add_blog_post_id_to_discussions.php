<?php

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;

// Add a nullable blog_post_id to the core discussions table. Each blog post
// gets at most one "shadow discussion" whose posts are the blog's comments.
// The discussion is otherwise a normal Flarum discussion and benefits from
// all of Flarum's native moderation: edit/delete/flag/hide/restore, mentions,
// likes (if installed), notifications, search, etc.
//
// The column is NULL for every regular forum discussion. Indexing it makes
// reverse-lookups (blog post -> discussion) and listing-filters (hide shadow
// discussions from forum listings) fast.

return [
    'up' => function (Builder $schema) {
        $schema->table('discussions', function (Blueprint $table) {
            $table->integer('blog_post_id')->unsigned()->nullable();
            $table->index('blog_post_id');
        });
    },

    'down' => function (Builder $schema) {
        $schema->table('discussions', function (Blueprint $table) {
            $table->dropIndex(['blog_post_id']);
            $table->dropColumn('blog_post_id');
        });
    },
];
