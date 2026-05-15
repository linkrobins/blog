<?php

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;

return [
    'up' => function (Builder $schema) {
        $schema->create('linkrobins_blog_comment_reports', function (Blueprint $table) {
            $table->increments('id');
            $table->integer('comment_id')->unsigned();
            $table->integer('reporter_user_id')->unsigned()->nullable();
            $table->text('reason')->nullable();
            $table->string('status', 20)->default('open');
            $table->timestamp('resolved_at')->nullable();
            $table->integer('resolved_by_user_id')->unsigned()->nullable();
            $table->timestamps();

            $table->index('comment_id');
            $table->index('reporter_user_id');
            $table->index('status');
            $table->index('created_at');
        });
    },

    'down' => function (Builder $schema) {
        $schema->dropIfExists('linkrobins_blog_comment_reports');
    },
];
