<?php

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;

// broadcast_sent_at: NULL = never sent, timestamp = sent at that moment.
// Guards against accidental re-sends; the broadcast endpoint requires
// force=1 to overwrite a non-null value.

return [
    'up' => function (Builder $schema) {
        $schema->table('linkrobins_blog_posts', function (Blueprint $table) {
            $table->dateTime('broadcast_sent_at')->nullable()->after('published_at');
        });
    },

    'down' => function (Builder $schema) {
        $schema->table('linkrobins_blog_posts', function (Blueprint $table) {
            $table->dropColumn('broadcast_sent_at');
        });
    },
];
