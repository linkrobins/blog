<?php

use Illuminate\Database\Schema\Builder;

/**
 * The comment-reporting feature was removed, but its permission rows
 * (added by 2026_05_13_000006_add_report_permissions) were left behind in
 * group_permission. Remove the orphaned rows. Idempotent: a no-op if they
 * are already gone.
 */
return [
    'up' => function (Builder $schema) {
        $schema->getConnection()
            ->table('group_permission')
            ->whereIn('permission', [
                'linkrobins-blog.viewReports',
                'linkrobins-blog.reportComment',
            ])
            ->delete();
    },

    // No down: the comment-reporting feature no longer exists, so there is
    // nothing to restore on rollback.
    'down' => function (Builder $schema) {
    },
];
