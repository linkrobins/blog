<?php

namespace LinkRobins\Blog\Access;

use Flarum\User\User;
use Illuminate\Database\Eloquent\Builder;

class ScopeBlogPostVisibility
{
    public function __invoke(User $actor, Builder $query): void
    {
        if ($actor->isAdmin()) {
            return;
        }

        $query->where('linkrobins_blog_posts.is_published', true);
    }
}
