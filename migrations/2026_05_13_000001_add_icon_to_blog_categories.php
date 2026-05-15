<?php

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;

return [
    'up' => function (Builder $schema) {
        $schema->table('linkrobins_blog_categories', function (Blueprint $table) {
            $table->string('icon', 100)->nullable()->after('color');
        });
    },

    'down' => function (Builder $schema) {
        $schema->table('linkrobins_blog_categories', function (Blueprint $table) {
            $table->dropColumn('icon');
        });
    },
];
