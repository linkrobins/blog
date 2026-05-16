<?php

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;

// Widen cover_image_credit from VARCHAR(300) to TEXT so HTML credit lines
// aren't artificially capped. The field renders as raw HTML in the article
// view, so longer credits with anchor tags / citations are reasonable.

return [
    'up' => function (Builder $schema) {
        $schema->table('linkrobins_blog_posts', function (Blueprint $table) {
            $table->text('cover_image_credit')->nullable()->change();
        });
    },

    'down' => function (Builder $schema) {
        $schema->table('linkrobins_blog_posts', function (Blueprint $table) {
            $table->string('cover_image_credit', 300)->nullable()->change();
        });
    },
];
