<?php

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;

return [
    'up' => function (Builder $schema) {
        $schema->create('linkrobins_blog_comments', function (Blueprint $table) {
            $table->increments('id');
            $table->integer('post_id')->unsigned();
            $table->integer('user_id')->unsigned()->nullable();
            $table->mediumText('content');
            $table->mediumText('content_html')->nullable();
            $table->dateTime('edited_at')->nullable();
            $table->integer('edited_user_id')->unsigned()->nullable();
            $table->timestamps();

            $table->index('post_id');
            $table->index('user_id');
            $table->index('created_at');

            $table->foreign('post_id')
                ->references('id')->on('linkrobins_blog_posts')
                ->cascadeOnDelete();
            $table->foreign('user_id')
                ->references('id')->on('users')
                ->nullOnDelete();
            $table->foreign('edited_user_id')
                ->references('id')->on('users')
                ->nullOnDelete();
        });
    },

    'down' => function (Builder $schema) {
        $schema->dropIfExists('linkrobins_blog_comments');
    },
];
