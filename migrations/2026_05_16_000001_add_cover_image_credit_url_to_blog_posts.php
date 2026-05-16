<?php

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;

// Add cover_image_credit_url alongside cover_image_credit on linkrobins_blog_posts.
//
// When set together with cover_image_credit, the rendered credit text on the
// article view becomes a link to this URL (target=_blank, rel="noopener
// noreferrer"). When the credit text is empty, the URL is ignored on the
// frontend. The column itself is always optional.

return [
    'up' => function (Builder $schema) {
        $schema->table('linkrobins_blog_posts', function (Blueprint $table) {
            $table->string('cover_image_credit_url', 500)->nullable()->after('cover_image_credit');
        });
    },

    'down' => function (Builder $schema) {
        $schema->table('linkrobins_blog_posts', function (Blueprint $table) {
            $table->dropColumn('cover_image_credit_url');
        });
    },
];
