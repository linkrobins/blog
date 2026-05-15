<?php

namespace LinkRobins\Blog\Search;

use Flarum\Search\Database\DatabaseSearchState;
use Flarum\Search\SearchCriteria;

/**
 * Search-time mutator that excludes blog-comment discussions from forum
 * listings (/all, /t/{tag}, etc.). These discussions are otherwise
 * completely normal — fully visible, linkable, flaggable and moderatable
 * — they're just kept out of the firehose listings so a busy forum's /all
 * isn't flooded with one thread per blog post.
 *
 * They remain reachable via direct `/d/{id}` links and
 * `/api/discussions/{id}` lookups because those don't pass through the
 * searcher mutator pipeline.
 */
class HideBlogDiscussionsFromListings
{
    public function __invoke(DatabaseSearchState $state, SearchCriteria $criteria): void
    {
        $apply = function ($query) {
            $query->whereNull('discussions.blog_post_id');
        };

        $eloquentQuery = $state->getQuery();
        $apply($eloquentQuery);

        // Also apply to any union queries (e.g. from stickied-pinning mutator)
        // that may have run before us.
        foreach ($eloquentQuery->getQuery()->unions ?? [] as $union) {
            $apply($union['query']);
        }
    }
}
