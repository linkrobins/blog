<?php

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;

// Add newsletter_enabled to blog categories. When true, publishing a post
// in that category automatically broadcasts the newsletter to every
// subscriber. Replaces the previous manual per-post send button.

return [
    'up' => function (Builder $schema) {
        $schema->table('linkrobins_blog_categories', function (Blueprint $table) {
            $table->boolean('newsletter_enabled')
                ->default(false)
                ->after('description');
        });
    },

    'down' => function (Builder $schema) {
        $schema->table('linkrobins_blog_categories', function (Blueprint $table) {
            $table->dropColumn('newsletter_enabled');
        });
    },
];
