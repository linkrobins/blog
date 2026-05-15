<?php

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;
use Illuminate\Support\Str;

// Per-subscriber unsubscribe token used in newsletter emails for
// no-login-required unsubscribe URLs and the List-Unsubscribe header.
// Backfills tokens for existing rows, then locks the column down.

return [
    'up' => function (Builder $schema) {
        $schema->table('linkrobins_blog_subscribers', function (Blueprint $table) {
            $table->string('unsubscribe_token', 64)->nullable()->after('user_id');
        });

        $schema->getConnection()
            ->table('linkrobins_blog_subscribers')
            ->whereNull('unsubscribe_token')
            ->orderBy('id')
            ->chunk(200, function ($rows) use ($schema) {
                foreach ($rows as $row) {
                    $schema->getConnection()
                        ->table('linkrobins_blog_subscribers')
                        ->where('id', $row->id)
                        ->update(['unsubscribe_token' => Str::random(64)]);
                }
            });

        $schema->table('linkrobins_blog_subscribers', function (Blueprint $table) {
            $table->string('unsubscribe_token', 64)->nullable(false)->change();
            $table->unique('unsubscribe_token');
        });
    },

    'down' => function (Builder $schema) {
        $schema->table('linkrobins_blog_subscribers', function (Blueprint $table) {
            $table->dropUnique(['unsubscribe_token']);
            $table->dropColumn('unsubscribe_token');
        });
    },
];
