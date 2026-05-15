<?php

use Illuminate\Database\Schema\Builder;

// Drop the legacy comment + report tables. As of this version blog comments
// are stored as native Flarum Post rows attached to a per-blog-post shadow
// Discussion, and reports/flags are handled by Flarum's built-in flag system
// (or any flag-replacement extension installed on the forum). Both tables
// would only contain test data at this point — anyone running production
// must accept the wipe as part of this upgrade.

return [
    'up' => function (Builder $schema) {
        $schema->dropIfExists('linkrobins_blog_comment_reports');
        $schema->dropIfExists('linkrobins_blog_comments');
    },

    'down' => function (Builder $schema) {
        // No down migration. Reverting would require reconstructing data that
        // has been moved into the posts table — see the older migrations for
        // the original schemas if you really need to recreate them by hand.
    },
];
