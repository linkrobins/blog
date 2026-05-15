<?php

use Illuminate\Database\Schema\Builder;

return [
    'up' => function (Builder $schema) {
        $schema->getConnection()
            ->table('settings')
            ->whereIn('key', [
                'linkrobins-blog.tag_slugs',
                'linkrobins-blog.show_featured',
            ])
            ->delete();
    },

    'down' => function (Builder $schema) {
    },
];
