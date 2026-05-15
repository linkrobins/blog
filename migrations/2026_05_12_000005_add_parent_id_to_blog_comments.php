<?php

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;

return [
    'up' => function (Builder $schema) {
        $schema->table('linkrobins_blog_comments', function (Blueprint $table) {
            $table->unsignedInteger('parent_id')->nullable()->after('post_id');
            $table->foreign('parent_id')
                  ->references('id')
                  ->on('linkrobins_blog_comments')
                  ->cascadeOnDelete();
        });
    },
    'down' => function (Builder $schema) {
        $schema->table('linkrobins_blog_comments', function (Blueprint $table) {
            $table->dropForeign(['parent_id']);
            $table->dropColumn('parent_id');
        });
    },
];
