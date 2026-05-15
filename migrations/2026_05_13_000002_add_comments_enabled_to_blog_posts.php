<?php

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;

return [
    'up' => function (Builder $schema) {
        $schema->table('linkrobins_blog_posts', function (Blueprint $table) {
            $table->boolean('comments_enabled')->default(true)->after('is_published');
        });
    },

    'down' => function (Builder $schema) {
        $schema->table('linkrobins_blog_posts', function (Blueprint $table) {
            $table->dropColumn('comments_enabled');
        });
    },
];
