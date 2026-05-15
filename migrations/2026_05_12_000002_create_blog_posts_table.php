<?php

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;

return [
    'up' => function (Builder $schema) {
        $schema->create('linkrobins_blog_posts', function (Blueprint $table) {
            $table->increments('id');
            $table->string('title', 200);
            $table->string('slug', 220);
            $table->text('excerpt')->nullable();
            $table->mediumText('content');
            $table->mediumText('content_html')->nullable();
            $table->string('cover_image_url', 500)->nullable();
            $table->integer('category_id')->unsigned()->nullable();
            $table->integer('user_id')->unsigned()->nullable();
            $table->string('visibility', 20)->default('public');
            $table->boolean('is_published')->default(false);
            $table->dateTime('published_at')->nullable();
            $table->integer('view_count')->unsigned()->default(0);
            $table->integer('comment_count')->unsigned()->default(0);
            $table->timestamps();

            $table->unique('slug');
            $table->index('category_id');
            $table->index('user_id');
            $table->index(['is_published', 'published_at']);
            $table->index('visibility');

            $table->foreign('category_id')
                ->references('id')->on('linkrobins_blog_categories')
                ->nullOnDelete();
            $table->foreign('user_id')
                ->references('id')->on('users')
                ->nullOnDelete();
        });
    },

    'down' => function (Builder $schema) {
        $schema->dropIfExists('linkrobins_blog_posts');
    },
];
