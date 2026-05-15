<?php

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;

return [
    'up' => function (Builder $schema) {
        $schema->table('linkrobins_blog_posts', function (Blueprint $table) {
            $table->string('cover_image_credit', 300)->nullable()->after('cover_image_url');
        });
    },

    'down' => function (Builder $schema) {
        $schema->table('linkrobins_blog_posts', function (Blueprint $table) {
            $table->dropColumn('cover_image_credit');
        });
    },
];
