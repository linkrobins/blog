<?php

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;

// Restructure the reports table to mirror flarum/flags semantics:
// - `reason` becomes a short category enum (off_topic / inappropriate / spam / other / null)
// - `reason_detail` is free text
// - Drop the status workflow: a report exists until a moderator dismisses it (DELETE)
// - Rename `reporter_user_id` to `user_id` to match flags
// - Drop `updated_at` (reports are not edited, only created and deleted)
//
// Note: this drops and recreates the table. The previous beta had no users actually
// reporting things (the endpoint was 400'ing), so data loss is acceptable here.

return [
    'up' => function (Builder $schema) {
        $schema->dropIfExists('linkrobins_blog_comment_reports');
        $schema->create('linkrobins_blog_comment_reports', function (Blueprint $table) {
            $table->increments('id');
            $table->integer('comment_id')->unsigned();
            $table->integer('user_id')->unsigned()->nullable();
            $table->string('reason')->nullable();
            $table->string('reason_detail')->nullable();
            $table->dateTime('created_at');

            $table->index('comment_id');
            $table->index('user_id');
            $table->index('created_at');
        });
    },

    'down' => function (Builder $schema) {
        $schema->dropIfExists('linkrobins_blog_comment_reports');
    },
];
