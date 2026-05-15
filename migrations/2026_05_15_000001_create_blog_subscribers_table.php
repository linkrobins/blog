<?php

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;

// Newsletter subscribers list. user_id is a unique FK with cascade-delete,
// so account deletion removes the subscription automatically.

return [
    'up' => function (Builder $schema) {
        $schema->create('linkrobins_blog_subscribers', function (Blueprint $table) {
            $table->increments('id');
            $table->integer('user_id')->unsigned();
            $table->timestamp('created_at')->nullable();

            $table->unique('user_id');

            $table->foreign('user_id')
                ->references('id')->on('users')
                ->cascadeOnDelete();
        });
    },

    'down' => function (Builder $schema) {
        $schema->dropIfExists('linkrobins_blog_subscribers');
    },
];
