<?php

use Illuminate\Database\Schema\Builder;

// HISTORICAL — intentionally a no-op.
//
// This migration originally backfilled "shadow" discussions (private,
// "[blog]"-prefixed) for every existing blog post. That architecture has
// since been replaced: blog comment discussions are now ordinary, visible
// Flarum discussions, created on publish by BlogServiceProvider with a
// proper title and a bookmark-card first post.
//
// On sites where this migration already ran, its effect (the old shadow
// rows) is cleared by the deploy-time cleanup that ships with the new
// version. On a fresh install it must do nothing — otherwise it would
// create broken old-style discussions that ensureCommentDiscussion() would
// then adopt instead of creating correct ones.
//
// We keep the file (rather than deleting it) so the migration history
// stays intact for databases that have already recorded it as run.

return [
    'up' => function (Builder $schema) {
        // No-op. See file header.
    },
    'down' => function (Builder $schema) {
        // No-op.
    },
];
