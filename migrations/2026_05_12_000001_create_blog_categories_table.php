<?php

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;

return [
    'up' => function (Builder $schema) {
        $schema->create('linkrobins_blog_categories', function (Blueprint $table) {
            $table->increments('id');
            $table->string('name', 100);
            $table->string('slug', 100);
            $table->text('description')->nullable();
            $table->string('color', 50)->nullable();
            $table->integer('position')->unsigned()->default(0);
            $table->timestamps();

            $table->unique('slug');
            $table->index('position');
        });
    },

    'down' => function (Builder $schema) {
        $schema->dropIfExists('linkrobins_blog_categories');
    },
];
